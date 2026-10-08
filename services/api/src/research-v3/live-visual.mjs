// One-pass, source-bound visual understanding. The model never assigns V3 truth.
import {createHash} from 'node:crypto';
import {digest} from './model.mjs';
import {sourceNumberCandidates} from './numeric-source.mjs';
import {safeRenderedControl} from './rendered-interactions.mjs';

const model='gpt-5.6-sol';
const sha=value=>createHash('sha256').update(value).digest('hex');
const normalize=value=>value.normalize('NFKC').replace(/\s+/g,' ').trim().toLocaleLowerCase('en');
export const visualPrompt=`Inspect the full-page screenshot and its browser-visible element inventory. Use only this rendered provider page. The inventory gives visible text/control bounds in ORIGINAL screenshot pixels. Element ids are source references, not answers. Discover visible subscription offerings and preserve plan/price, trial/subsequent, billing, availability, selected/disabled and global relationships. Never infer a monthly payment from /month or /mo alone. Never treat readable button text as proof that the action is enabled. If a relationship or text is unclear, leave it out and put the issue in uncertainties. Do not decide provider authority, market, eligibility, catalog completeness, VERIFIED, ESTABLISHED or CONTRADICTED. Do not use outside knowledge. Return JSON only with exactly this structure:
{
  "serviceNodeId": "dom-id containing the visible service name, or null",
  "billingState": {"selectedNodeId": "dom-id of visibly selected pricing control or null", "alternativeNodeIds": ["dom-ids of unselected controls in the same pricing switch"]},
  "offerings": [{
    "nameNodeIds": ["one or more dom-ids containing the offering name"],
    "audience": "CONSUMER|BUSINESS|UNKNOWN",
    "relationship": "SUBSCRIPTION|MEMBERSHIP|UNKNOWN",
    "charges": [{
      "nodeIds": ["dom-id containing the displayed amount and currency"],
      "amountText": "exact numeric substring or null",
      "currencyText": "exact ISO currency substring or null",
      "cadenceText": "exact displayed cadence substring or null",
      "cadenceUnit": "MONTHLY|YEARLY|WEEKLY|DAILY|UNKNOWN",
      "role": "INTRODUCTORY|SUBSEQUENT|ORDINARY|UNKNOWN",
      "qualifierText": "exact qualifier substring or null",
      "paymentNodeIds": [],
      "paymentText": "exact actual payment wording or null",
      "paymentCadence": "MONTHLY|YEARLY|WEEKLY|DAILY|UNKNOWN",
      "priceKind": "CHARGE|EQUIVALENT|UNKNOWN"
    }],
    "availabilityNodeIds": []
  }],
  "globalNodeIds": [],
  "uncertainties": [{"reason": "short source-visible uncertainty", "nodeIds": ["dom-id near the unclear material"]}]
}
Use element ids only when the text is visible and the id matches the inventory. Do not output coordinates or invented text. Identify pricing presentation controls only when the screenshot visibly distinguishes the selected state from alternatives in the same local switch; never list purchase or trial buttons as pricing alternatives. Distinguish a displayed monthly equivalent from actual annual billing. Include annual and yearly offerings even when no monthly payment exists. A disabled or unclear trial button does not erase the separately visible subscription plan. Include additional visible offerings even when their monetary amount is unknown.`;

const allowed=(value,values,fallback='UNKNOWN')=>values.includes(value)?value:fallback;
const boxUnion=rows=>{
    const x=Math.min(...rows.map(row=>row.bboxPx[0])),y=Math.min(...rows.map(row=>row.bboxPx[1]));
    const right=Math.max(...rows.map(row=>row.bboxPx[0]+row.bboxPx[2])),bottom=Math.max(...rows.map(row=>row.bboxPx[1]+row.bboxPx[3]));
    return [x,y,right-x,bottom-y];
};
const center=box=>box[0]+box[2]/2;
const inside=(box,width,height)=>box.every(Number.isFinite)&&box[0]>=0&&box[1]>=0&&box[2]>=1&&box[3]>=1&&box[0]+box[2]<=width&&box[1]+box[3]<=height;
const overlap=(a,b)=>a[0]<b[0]+b[2]&&b[0]<a[0]+a[2]&&a[1]<b[1]+b[3]&&b[1]<a[1]+a[3];

export function compileVisualObservation(raw,{observation,artifact,overview,focus=null,dom,objective,requestHash,responseHash,responseModel,createdAt}) {
    if(!raw||typeof raw!=='object'||!Array.isArray(raw.offerings)||raw.offerings.length>64||!Array.isArray(dom))throw Error('VISUAL_MODEL_OUTPUT_INVALID');
    const width=artifact.image.widthPx,height=artifact.image.heightPx,nodes=new Map(dom.map(row=>[row.id,row]));
    const node=id=>{const row=nodes.get(id);if(!row||!inside(row.bboxPx,width,height))throw Error('VISUAL_MODEL_SOURCE_REF_INVALID');return row;};
    const refs=ids=>{if(!Array.isArray(ids)||!ids.length||ids.length>8||new Set(ids).size!==ids.length)throw Error('VISUAL_MODEL_SOURCE_REF_INVALID');return ids.map(node);};
    const serviceName=normalize(objective.serviceName);
    const serviceCandidates=dom.filter(row=>typeof row.text==='string'&&normalize(row.text).includes(serviceName)&&inside(row.bboxPx,width,height)).sort((a,b)=>a.text.length-b.text.length);
    const claimedService=nodes.get(raw.serviceNodeId);
    const serviceNode=claimedService&&serviceCandidates.some(row=>row.id===claimedService.id)?claimedService:serviceCandidates[0];
    if(!serviceNode)throw Error('VISUAL_MODEL_SERVICE_UNGROUNDED');
    const regions=[{id:'page',bboxPx:[0,0,width,height],parentId:null,scope:'GLOBAL'}],transcriptions=[],relationships=[],offers=[],unresolved=[];
    const addText=(id,rows,parentId=null)=>{
        const bboxPx=boxUnion(rows),text=rows.map(row=>row.text).join(' ').replace(/\s+/g,' ').trim();
        if(!inside(bboxPx,width,height)||bboxPx[2]*bboxPx[3]>width*height*0.08||!text||text.length>4096)throw Error('VISUAL_MODEL_REGION_UNSAFE');
        regions.push({id,bboxPx,parentId,scope:'TEXT'});
        const transcriptId='t-'+id;
        transcriptions.push({id:transcriptId,regionId:id,verbatimText:text,readability:'READABLE',evidenceKind:'DIRECT_TEXT',uncertaintyReasons:[]});
        return {regionId:id,transcriptId,text,bboxPx};
    };
    const relation=(id,kind,from,to,witness,scope)=>relationships.push({id,kind,fromRegionIds:from,toRegionIds:to,witnessRegionIds:witness,scopeRegionIds:scope,evidenceKind:'VISUAL_RELATION',uncertaintyReasons:[]});
    const service=addText('service',[serviceNode],'page');
    for(const row of dom.filter(row=>['tab','radio','switch','button'].includes(row.role)&&row.text).slice(0,64)) {
        if(!inside(row.bboxPx,width,height)||row.bboxPx[2]*row.bboxPx[3]>width*height*0.05)continue;
        regions.push({id:'control-'+row.id,bboxPx:row.bboxPx,parentId:'page',scope:'CONTROL'});
        transcriptions.push({id:'t-control-'+row.id,regionId:'control-'+row.id,verbatimText:row.text,readability:'READABLE',evidenceKind:'DIRECT_TEXT',uncertaintyReasons:[]});
    }
    for(const [index,input] of raw.offerings.entries()) {
        if(!input||typeof input!=='object'||!Array.isArray(input.charges)||input.charges.length>16)continue;
        let nameRows;try{nameRows=refs(input.nameNodeIds??[input.nameNodeId]);}catch{continue;}
        const nameBox=boxUnion(nameRows);
        const candidateCharges=[];
        for(const [chargeIndex,charge] of input.charges.entries()) {
            try {
                const rows=refs(charge.nodeIds);
                if(typeof charge.cadenceText==='string'&&charge.cadenceText&&!rows.some(row=>row.text.includes(charge.cadenceText))&&rows.length<8){
                    const priceBox=boxUnion(rows),adjacent=dom.filter(row=>row.text.includes(charge.cadenceText)&&inside(row.bboxPx,width,height)&&Math.abs(row.bboxPx[1]-priceBox[1])<=Math.max(8,priceBox[3]/2)&&row.bboxPx[0]>=priceBox[0]+priceBox[2]-8&&row.bboxPx[0]<=priceBox[0]+priceBox[2]+48&&row.bboxPx[2]<=width*0.2).sort((a,b)=>a.bboxPx[0]-b.bboxPx[0])[0];
                    if(adjacent)rows.push(adjacent);
                }
                if(Math.abs(center(boxUnion(rows))-center(nameBox))>width*0.14)continue;
                let paymentRows=[];try{if(charge.paymentNodeIds?.length)paymentRows=refs(charge.paymentNodeIds);}catch{paymentRows=[];}
                candidateCharges.push({charge,chargeIndex,rows,paymentRows});
            } catch{continue;}
        }
        let availability=[];try{if(input.availabilityNodeIds?.length)availability=refs(input.availabilityNodeIds).filter(row=>Math.abs(center(row.bboxPx)-center(nameBox))<=width*0.25&&Math.abs(row.bboxPx[1]-nameBox[1])<=Math.min(1000,height*0.25));}catch{availability=[];}
        const box=boxUnion([...nameRows,...candidateCharges.flatMap(c=>[...c.rows,...c.paymentRows]),...availability]);
        if(!inside(box,width,height)||box[2]>width*0.4||box[3]>height*0.5||box[2]*box[3]>width*height*0.2)continue;
        const offeringId='offer-'+index;
        regions.push({id:offeringId,bboxPx:box,parentId:'page',scope:'OFFERING'});
        const name=addText('name-'+index,nameRows,offeringId);
        const serviceRelation='service-'+index;
        relation(serviceRelation,'APPLIES_TO',[offeringId],[service.regionId],[offeringId,service.regionId],['page']);
        const offer={id:offeringId,name:name.text,service:objective.serviceName,audience:allowed(input.audience,['CONSUMER','BUSINESS','UNKNOWN']),relationship:allowed(input.relationship,['SUBSCRIPTION','MEMBERSHIP','UNKNOWN']),ambiguity:false,presentationRegionId:offeringId,nameSupport:[name.transcriptId],serviceAssociationRef:serviceRelation,qualifiers:[],market:{country:null,basis:'UNKNOWN',ambiguity:false,support:[],exclusions:[]},availability:null,charges:[],transitions:[]};
        if(availability.length){
            const source=addText('availability-'+index,availability,offeringId),id='availability-relation-'+index;
            relation(id,'APPLIES_TO',[source.regionId],[offeringId],[source.regionId],[offeringId]);
            offer.availability={scope:'PLAN',choiceSet:'PARTIAL',cadences:/\b(?:yearly|annual)\b/i.test(source.text)?['YEARLY']:[],support:[source.transcriptId],associationRef:id,payment:{kind:'UNKNOWN',text:null,support:[]}};
        }
        for(const {charge,chargeIndex,rows,paymentRows} of candidateCharges) {
            const role=allowed(charge.role,['INTRODUCTORY','SUBSEQUENT','ORDINARY','UNKNOWN']);
            const control=dom.find(row=>['button','input','a'].includes(row.role)&&row.text&&rows.some(price=>overlap(row.bboxPx,price.bboxPx)));
            if(role==='INTRODUCTORY'&&/\b(?:try|trial|start)\b/i.test(rows.map(row=>row.text).join(' '))&&control?.disabled!==false){
                unresolved.push({target:'introductory-control-'+index,reason:'Visible CTA text lacks established enabled state or is disabled',supportingRegionIds:[offeringId]});
                continue;
            }
            const price=addText('price-'+index+'-'+chargeIndex,rows,offeringId),amountText=charge.amountText;
            if(typeof amountText!=='string'||!price.text.includes(amountText)||sourceNumberCandidates(amountText).length!==1)continue;
            const amount=sourceNumberCandidates(amountText)[0],amountAt=price.text.indexOf(amountText),currencyText=typeof charge.currencyText==='string'&&/^[A-Z]{3}$/.test(charge.currencyText)&&price.text.includes(charge.currencyText)?charge.currencyText:null,currencyAt=currencyText?price.text.indexOf(currencyText):-1;
            let payment=null,paymentIds=[];
            try{if(paymentRows.length){payment=addText('payment-'+index+'-'+chargeIndex,paymentRows,offeringId);paymentIds=[payment.transcriptId];}}catch{payment=null;paymentIds=[];}
            const association='charge-'+index+'-'+chargeIndex;
            relation(association,'WITHIN_PRESENTATION',[price.regionId,...(payment?[payment.regionId]:[])],[offeringId],[offeringId],[offeringId]);
            const cadenceText=typeof charge.cadenceText==='string'&&price.text.includes(charge.cadenceText)?charge.cadenceText:null;
            const paymentText=payment&&typeof charge.paymentText==='string'&&payment.text.includes(charge.paymentText)?charge.paymentText:null;
            const paymentCadence=paymentText?allowed(charge.paymentCadence,['MONTHLY','YEARLY','WEEKLY','DAILY','UNKNOWN']):'UNKNOWN';
            const qualifier=typeof charge.qualifierText==='string'&&price.text.includes(charge.qualifierText)?[{text:charge.qualifierText,support:[price.transcriptId]}]:[];
            offer.charges.push({id:'charge-'+index+'-'+chargeIndex,money:{amount,amountText,amountOccurrence:{transcriptionId:price.transcriptId,startUtf16:amountAt,endUtf16:amountAt+amountText.length,quote:amountText},currency:currencyText,currencyText,currencyOccurrence:currencyText?{transcriptionId:price.transcriptId,startUtf16:currencyAt,endUtf16:currencyAt+currencyText.length,quote:currencyText}:null},cadence:{unit:cadenceText?allowed(charge.cadenceUnit,['MONTHLY','YEARLY','WEEKLY','DAILY','UNKNOWN']):'UNKNOWN',expression:cadenceText},role,derivation:'EXPLICIT',duration:null,qualifiers:qualifier,ambiguity:role==='UNKNOWN',support:[price.transcriptId,...paymentIds],associationRef:association,payment:{kind:paymentText?'ACTUAL_PAYMENT':'UNKNOWN',text:paymentText,support:paymentIds},temporal:{billingCadence:paymentCadence,billingSupport:paymentIds,commitmentText:null,commitmentSupport:[],priceKind:allowed(charge.priceKind,['CHARGE','EQUIVALENT','UNKNOWN'])},monetary:{kind:role==='INTRODUCTORY'?'TRIAL_CHARGE':'SUBSCRIPTION_CHARGE',relatedCharge:null,relation:'CHARGE_FOR',support:[price.transcriptId]}});
        }
        const intro=offer.charges.find(row=>row.role==='INTRODUCTORY'),subsequent=offer.charges.find(row=>row.role==='SUBSEQUENT');
        if(intro&&subsequent){
            const id='transition-'+index,regionsFor=charge=>charge.support.map(transcriptId=>transcriptions.find(row=>row.id===transcriptId)?.regionId).filter(Boolean);
            relation(id,'FOLLOWED_BY',regionsFor(intro),regionsFor(subsequent),[offeringId],[offeringId]);
            offer.transitions.push({from:intro.id,to:subsequent.id,kind:'RECURS_AFTER_INTRO',ambiguity:false,support:[...intro.support,...subsequent.support],relationshipRef:id});
        }
        offers.push(offer);
    }
    for(const item of (Array.isArray(raw.uncertainties)?raw.uncertainties:[]).slice(0,32)){
        const reason=typeof item==='string'?item:item?.reason;
        if(typeof reason!=='string'||!reason.trim()||reason.length>1024)continue;
        let supportingRegionIds=[];
        try{
            const rows=refs(item?.nodeIds),box=boxUnion(rows),padding=24;
            const x=Math.max(0,box[0]-padding),y=Math.max(0,box[1]-padding),right=Math.min(width,box[0]+box[2]+padding),bottom=Math.min(height,box[1]+box[3]+padding),bboxPx=[x,y,right-x,bottom-y];
            if(inside(bboxPx,width,height)&&bboxPx[2]>=16&&bboxPx[3]>=16&&bboxPx[2]*bboxPx[3]<=width*height*0.5){const id='uncertainty-'+unresolved.length;regions.push({id,bboxPx,parentId:'page',scope:'GROUP'});supportingRegionIds=[id];}
        }catch{}
        unresolved.push({target:'model-uncertainty-'+unresolved.length,reason,supportingRegionIds});
    }
    const controlFor=id=>{
        const row=nodes.get(id);if(!row)return null;
        if(['button','tab','radio'].includes(row.role))return row;
        return dom.find(candidate=>['button','tab','radio'].includes(candidate.role)&&candidate.bboxPx[0]<=row.bboxPx[0]&&candidate.bboxPx[1]<=row.bboxPx[1]&&candidate.bboxPx[0]+candidate.bboxPx[2]>=row.bboxPx[0]+row.bboxPx[2]&&candidate.bboxPx[1]+candidate.bboxPx[3]>=row.bboxPx[1]+row.bboxPx[3]&&normalize(candidate.text).includes(normalize(row.text)))??null;
    };
    const selectedControl=controlFor(raw.billingState?.selectedNodeId);
    const presentationControlIds=[...new Set((Array.isArray(raw.billingState?.alternativeNodeIds)?raw.billingState.alternativeNodeIds:[]).slice(0,16).map(controlFor).filter(row=>row&&safeRenderedControl(row,'PRESENTATION_SELECT',selectedControl)&&regions.some(region=>region.id==='control-'+row.id)).map(row=>row.id))];
    return {schema:'V3_VISUAL_EVIDENCE_V1',observationId:observation.id,observationSha256:observation.sha256,renderId:artifact.id,imageSha256:artifact.image.sha256,transformation:{provider:'OPENAI',modelOrTool:model,modelRevision:responseModel??null,adapterRevision:'source-visible-dom-regions-v1',schemaRevision:'V3_VISUAL_EVIDENCE_V1',promptHash:sha(visualPrompt),requestHash,responseHash,createdAt,diagnostics:{overviewSha256:overview.sha256,overviewWidth:overview.widthPx,focusSha256:focus?.sha256??null,focusBboxPx:focus?.bboxPx??null,regionBasis:'VISIBLE_DOM_BOUNDS',presentationControlIds,selectedControlId:selectedControl?.id??null,confidenceNotUsed:true}},regions,transcriptions,relationships,service:{name:objective.serviceName,ambiguity:false,support:[service.transcriptId]},offers,unresolved};
}

export function createLiveVisualInterpreter({env=process.env,fetchImpl=fetch,timeoutMs=90000,maxOutputTokens=12000}={}) {
    if(!env.OPENAI_API_KEY?.trim())throw Error('V3_VISUAL_CREDENTIAL_REQUIRED');
    const interpret=async({observation,artifact,overview,focus=null,dom,objective})=>{
        const inventory=dom.map(row=>({id:row.id,text:row.text,role:row.role,selected:row.selected,disabled:row.disabled,bboxPx:row.bboxPx}));
        const content=[{type:'input_text',text:visualPrompt+'\n\nVisible element inventory (original screenshot pixels):\n'+JSON.stringify(inventory)+(focus?'\n\nA higher-resolution bounded region from the same original render is also attached. Its original-pixel bounds are '+JSON.stringify(focus.bboxPx)+'. Use it only to clarify source-visible material; retain the full-page context.':'')},{type:'input_image',image_url:'data:image/png;base64,'+overview.bytesBase64,detail:'original'}];
        if(focus)content.push({type:'input_image',image_url:'data:image/png;base64,'+focus.bytesBase64,detail:'original'});
        const payload={model,input:[{role:'user',content}],max_output_tokens:maxOutputTokens};
        const requestHash=sha(JSON.stringify(payload)),started=performance.now();
        let response,raw;
        try {
            response=await fetchImpl('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+env.OPENAI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(timeoutMs)});
            raw=await response.text();
        } catch {
            const error=Error('VISUAL_MODEL_UNAVAILABLE');
            error.visualUsage={model,status:'TRANSPORT_FAILED',latencyMs:Math.round(performance.now()-started),usage:null};
            throw error;
        }
        const latencyMs=Math.round(performance.now()-started),responseHash=sha(raw);
        const unavailable=(code,status,usage=null)=>{const error=Error(code);error.visualUsage={model,status,latencyMs,usage,responseHash};return error;};
        if(!response.ok)throw unavailable('VISUAL_MODEL_UNAVAILABLE','HTTP_'+response.status);
        let body;try{body=JSON.parse(raw);}catch{throw unavailable('VISUAL_MODEL_RESPONSE_INVALID','MALFORMED_RESPONSE');}
        const text=(body.output??[]).filter(item=>item.type==='message').flatMap(item=>(item.content??[]).filter(row=>row.type==='output_text').map(row=>row.text)).join('');
        let observations;try{observations=JSON.parse(text);}catch{const error=unavailable('VISUAL_MODEL_OUTPUT_INVALID',body.status??'MALFORMED_OUTPUT',body.usage??null);error.visualUsage.diagnostic='OUTPUT_JSON_PARSE';throw error;}
        let envelope;try{envelope=compileVisualObservation(observations,{observation,artifact,overview,focus,dom,objective,requestHash,responseHash,responseModel:body.model??model,createdAt:new Date().toISOString()});}catch(cause){const error=unavailable('VISUAL_MODEL_OUTPUT_INVALID',body.status??'INVALID_GROUNDING',body.usage??null);error.visualUsage.diagnostic=/^[A-Z][A-Z0-9_]{0,80}$/.test(cause?.message??'')?cause.message:'GROUNDING_INVALID';throw error;}
        return {model:body.model??model,status:body.status??'UNKNOWN',latencyMs,usage:body.usage??null,responseHash,envelope,rawResponse:raw.slice(0,262144),observations};
    };
    interpret.contract={model,promptHash:sha(visualPrompt),schemaRevision:'V3_VISUAL_EVIDENCE_V1'};
    return interpret;
}
