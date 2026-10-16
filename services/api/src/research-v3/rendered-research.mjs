// Optional acquisition planning and retention. Nothing in this module assigns truth.
import {digest,normalizeUrl,providerBound} from './model.mjs';
import {createRenderedArtifact,validateRenderedArtifact} from './rendered-observation.mjs';
import {createRenderedOverview,validateRenderedOverview} from './rendered-overview.mjs';
import {projectObservation} from './projection.mjs';
import {projectVisualEvidence} from './visual-evidence.mjs';
import {safeRenderedControl} from './rendered-interactions.mjs';

const valuableKinds=new Set(['CONSUMER_CHARGE_PRESENTATION','ORDINARY_CHARGE_RELATIONSHIP','ACTUAL_PAYMENT_TERMS','OFFERING_IDENTITY','BOUNDED_SUBSCRIPTION_CHOICES','CONSUMER_TAX_RELATIONSHIP','SOURCE_CURRENCY_RELATIONSHIP','AUTHORITATIVE_OFFERING_SOURCE']);
const visualClue=/\b(?:pric(?:e|ing)|plans?|subscriptions?|memberships?|premium|checkout|billing|payment|trial|annual|monthly|catalog|compare)\b/i;
const clarifiableVisualUncertainty=/\b(?:unreadable|illegible|obscured|partially visible|hard to read|cannot distinguish|ambiguous|unclear|low resolution|small text|cut off)\b/i;
export const renderedResearchLimits=Object.freeze({domElements:512,domText:2048,visualReceipts:24});

function usefulSource(o) {
    if(o.kind!=='PROVIDER'||o.format!=='WEB'||o.outcome!=='OK'||o.truncated||o.completeness==='INCOMPLETE'||digest(o.body)!==o.sha256)return false;
    const url=new URL(o.url),text=[url.pathname,o.body.slice(0,160000)].join(' ');
    return visualClue.test(text)||(o.candidates??[]).some(c=>c.kind==='OFFER');
}

export function renderedResearchActions(k,truth) {
    if(k.permissions.RENDERED!==true||k.objective.kind!=='PRICE')return [];
    const targets=(k.gapState?.targets??[]).filter(t=>valuableKinds.has(t.kind));
    if(!targets.length)return [];
    return k.observations.filter(o=>usefulSource(o)&&providerBound(k.objective,o.url)).flatMap(o=>{
        let bound=targets.filter(t=>t.support?.some(s=>s.observation===o.id)||t.kind==='BOUNDED_SUBSCRIPTION_CHOICES'||t.kind==='AUTHORITATIVE_OFFERING_SOURCE');
        // A rendered pricing switch can clarify an unresolved offering even when
        // the latest gap receipt points to a different observation of this service.
        // Its source remains the retained render and source-visible control.
        if(!bound.length&&o.renderedArtifacts?.length&&truth.needs.some(n=>['PRICE_AMOUNT','MONTHLY_CADENCE','MONTHLY_SUBSCRIPTION','CONSUMER_SUBSCRIPTION'].includes(n.proposition))) {
            const unresolved=new Set(truth.needs.map(n=>n.proposition));
            bound=targets.filter(t=>t.propositions?.some(p=>unresolved.has(p))).slice(0,16);
        }
        if(!bound.length)return [];
        const needIds=truth.needs.filter(n=>bound.some(t=>t.propositions?.includes(n.proposition)&&(!t.market||t.market===n.market))).map(n=>n.id);
        const needs=needIds.length?needIds:truth.needs.map(n=>n.id);
        if(!needs.length)return [];
        const common={kind:'RENDER',observation:o.id,url:o.url,needs:[...new Set(needs)],targetIds:bound.map(t=>t.id),gapIds:[...new Set(bound.flatMap(t=>t.gapIds))],overviewWidth:800};
        if(!(o.renderedArtifacts??[]).length){
            if(k.attempts.some(a=>a.action.kind==='RENDER'&&a.action.observation===o.id))return [];
            return [{...common,mode:'OVERVIEW',reason:'Rendered presentation may resolve source-bound visual relationships or catalog coverage gaps',value:50+Math.min(40,bound.length*5)}];
        }
        const artifact=o.renderedArtifacts.at(-1),candidateEvidence=(o.visualEvidence??[]).findLast(row=>row.renderId===artifact.id);
        const evidence=candidateEvidence&&!projectVisualEvidence(o,k.objective,candidateEvidence).error?candidateEvidence:null;
        const controls=o.renderedControlRegions?.find(row=>row.renderId===artifact.id&&row.imageSha256===artifact.image.sha256);
        if(!evidence&&!controls)return [];
        const clarifications=(evidence?.unresolved??[]).filter(row=>clarifiableVisualUncertainty.test(row.reason??'')).flatMap(row=>(row.supportingRegionIds??[]).flatMap(regionId=>{
            const region=evidence.regions.find(candidate=>candidate.id===regionId);
            if(!region||region.scope==='GLOBAL'||region.bboxPx[2]<16||region.bboxPx[3]<16||region.bboxPx[2]*region.bboxPx[3]>artifact.image.widthPx*artifact.image.heightPx*0.5||k.attempts.some(a=>a.action.kind==='RENDER'&&a.action.mode==='CLARIFY'&&a.action.observation===o.id&&a.action.focus?.regionId===regionId))return [];
            return [{...common,mode:'CLARIFY',focus:{sourceRenderId:artifact.id,regionId,reason:row.reason},reason:'A bounded source region may clarify a specifically unresolved visual proposition',value:80}];
        })).slice(0,2);
        const states=(o.domSnapshot??[]).flatMap(row=>{
            const selectedControlId=evidence?.transformation?.diagnostics?.selectedControlId??null,selectedPeer=o.domSnapshot?.find(candidate=>candidate.id===selectedControlId);
            const kind=safeRenderedControl(row,'COOKIE_REJECT')?'COOKIE_REJECT':evidence?.transformation?.diagnostics?.presentationControlIds?.includes(row.id)&&safeRenderedControl(row,'PRESENTATION_SELECT',selectedPeer)?'PRESENTATION_SELECT':null;
            if(!kind||!controls?.regions.some(region=>region.id==='control-'+row.id&&JSON.stringify(region.bboxPx)===JSON.stringify(row.bboxPx))||k.attempts.some(a=>a.action.kind==='RENDER'&&a.action.mode==='STATE'&&a.action.observation===o.id&&(a.action.interaction?.controlId===row.id||kind==='COOKIE_REJECT'&&a.action.interaction?.kind==='COOKIE_REJECT')))return [];
            return [{...common,mode:'STATE',interaction:{kind,controlId:row.id,selectedControlId:kind==='PRESENTATION_SELECT'?selectedControlId:null,sourceRenderId:artifact.id,sourceRegionId:'control-'+row.id},reason:'Source-visible safe presentation state may distinguish unresolved subscription evidence',value:60}];
        }).slice(0,4);
        return [...clarifications,...states];
    }).slice(0,12);
}

export function retainedDomSnapshot(input) {
    if(!Array.isArray(input))return [];
    return input.slice(0,renderedResearchLimits.domElements).flatMap((row,index)=>{
        if(!row||typeof row!=='object'||typeof row.text!=='string'||row.text.length>renderedResearchLimits.domText||!Array.isArray(row.bboxPx)||row.bboxPx.length!==4||!row.bboxPx.every(Number.isFinite))return [];
        const [x,y,width,height]=row.bboxPx;
        if(x<0||y<0||width<=0||height<=0)return [];
        return [{id:'dom-'+index,text:row.text,role:typeof row.role==='string'?row.role.slice(0,128):null,ariaLabel:typeof row.ariaLabel==='string'?row.ariaLabel.slice(0,512):null,contextText:typeof row.contextText==='string'?row.contextText.slice(0,1024):null,consentDialogName:typeof row.consentDialogName==='string'?row.consentDialogName.slice(0,256):null,groupId:typeof row.groupId==='string'?row.groupId.slice(0,256):null,selected:row.selected===true?true:row.selected===false?false:null,disabled:row.disabled===true?true:row.disabled===false?false:null,bboxPx:[x,y,width,height],truthAuthority:'NONE'}];
    });
}

export function browserPageObservation(action,parent,objective,page) {
    if(!page||typeof page.body!=='string'||Buffer.byteLength(page.body)>4*1024*1024||page.httpStatus!==200||page.completeness!=='COMPLETE')throw Error('RENDERED_PAGE_INVALID');
    const url=normalizeUrl(page.url);
    if(!url||!providerBound(objective,url)||normalizeUrl(page.requestedUrl)!==parent.url||!page.transport||typeof page.transport!=='object')throw Error('RENDERED_PAGE_PROVENANCE_INVALID');
    if(parent.context.transport==='DECODO') {
        if(page.transport.kind!=='DECODO'||page.transport.verification!=='BRACKET_VERIFIED'||page.transport.verifiedCountry!==parent.context.networkGeography)throw Error('RENDERED_GEOGRAPHY_UNVERIFIED');
    } else if(page.transport.kind!=='DIRECT'||page.transport.verification!=='UNBOUND')throw Error('RENDERED_GEOGRAPHY_UNVERIFIED');
    return {id:action.id,action:action.id,kind:'PROVIDER',url,requestedUrl:parent.url,context:structuredClone(parent.context),outcome:'OK',truncated:false,body:page.body,bytes:Buffer.byteLength(page.body),sha256:digest(page.body),format:'WEB',contentType:page.contentType??'text/html',httpStatus:200,acquiredAt:page.acquiredAt??new Date().toISOString(),transport:structuredClone(page.transport),access:structuredClone(page.access??[]),completeness:'COMPLETE',responseMetadata:structuredClone(page.responseMetadata??{}),redirects:structuredClone(page.redirects??[]),acquisitionTiming:structuredClone(page.acquisitionTiming??{}),renderParentObservation:parent.id,candidates:[]};
}

export function retainRenderedObservation(parent,{pngBytes,capture,journey,finalUrl,dom}={},{overviewWidth=800}={}) {
    if(finalUrl!==parent.url||!Buffer.isBuffer(pngBytes)&&!(pngBytes instanceof Uint8Array))throw Error('RENDERED_RESOURCE_BINDING_INVALID');
    const artifact=createRenderedArtifact(parent,{imageBytes:pngBytes,capture,journey});
    validateRenderedArtifact(parent,artifact);
    const overview=createRenderedOverview(pngBytes,{width:Math.min(overviewWidth,artifact.image.widthPx)});
    validateRenderedOverview(artifact,overview);
    const retainedDom=retainedDomSnapshot(dom);
    const controlRegions={renderId:artifact.id,imageSha256:artifact.image.sha256,regions:retainedDom.filter(row=>['button','tab','radio','switch'].includes(row.role)&&row.bboxPx[0]+row.bboxPx[2]<=artifact.image.widthPx&&row.bboxPx[1]+row.bboxPx[3]<=artifact.image.heightPx).map(row=>({id:'control-'+row.id,bboxPx:row.bboxPx,scope:'CONTROL',source:'VISIBLE_DOM_BOUNDS'}))};
    return {artifact,overview,dom:retainedDom,controlRegions};
}

export function retainControlSourceEvidence(parent,objective,artifact) {
    if((parent.visualEvidence??[]).some(row=>row.renderId===artifact.id&&!projectVisualEvidence(parent,objective,row).error))return false;
    const controls=parent.renderedControlRegions?.find(row=>row.renderId===artifact.id&&row.imageSha256===artifact.image.sha256);
    const service=parent.domSnapshot?.filter(row=>row.text.toLocaleLowerCase('en').includes(objective.serviceName.toLocaleLowerCase('en'))&&row.bboxPx[0]+row.bboxPx[2]<=artifact.image.widthPx&&row.bboxPx[1]+row.bboxPx[3]<=artifact.image.heightPx).sort((a,b)=>a.text.length-b.text.length)[0];
    if(!controls?.regions.length||!service)return false;
    const regions=[{id:'page',bboxPx:[0,0,artifact.image.widthPx,artifact.image.heightPx],parentId:null,scope:'GLOBAL'},{id:'dom-service',bboxPx:service.bboxPx,parentId:'page',scope:'TEXT'},...controls.regions.map(row=>({id:row.id,bboxPx:row.bboxPx,parentId:'page',scope:'CONTROL'}))];
    const transcriptions=[{id:'t-dom-service',regionId:'dom-service',verbatimText:service.text,readability:'READABLE',evidenceKind:'DIRECT_TEXT',uncertaintyReasons:[]},...controls.regions.flatMap(region=>{const row=parent.domSnapshot.find(candidate=>'control-'+candidate.id===region.id);return row?[{id:'t-'+region.id,regionId:region.id,verbatimText:row.text,readability:'READABLE',evidenceKind:'DIRECT_TEXT',uncertaintyReasons:[]}]:[];})];
    const envelope={schema:'V3_VISUAL_EVIDENCE_V1',observationId:parent.id,observationSha256:parent.sha256,renderId:artifact.id,imageSha256:artifact.image.sha256,transformation:{provider:'PLAYWRIGHT',modelOrTool:'VISIBLE_DOM',modelRevision:null,adapterRevision:'visible-dom-controls-v1',schemaRevision:'V3_VISUAL_EVIDENCE_V1',promptHash:digest('NO_PROMPT_DETERMINISTIC_DOM'),requestHash:digest([parent.id,artifact.id,controls]),responseHash:digest([regions,transcriptions]),createdAt:artifact.capture.capturedAt,diagnostics:{purpose:'SAFE_CONTROL_PROVENANCE',truthAuthority:'NONE'}},regions,transcriptions,relationships:[],service:{name:objective.serviceName,ambiguity:false,support:['t-dom-service']},offers:[],unresolved:[]};
    const validation=projectVisualEvidence(parent,objective,envelope);
    if(validation.error)return false;
    parent.visualEvidence??=[];parent.visualEvidence.unshift(envelope);
    parent.candidates=projectObservation(parent,objective).candidates;
    return true;
}

export function admitRenderedInterpretation(parent,objective,envelope) {
    if(!envelope)return {accepted:[],rejected:[],errors:[],reason:'VISUAL_INTERPRETATION_UNAVAILABLE'};
    const visual=projectVisualEvidence(parent,objective,envelope);
    parent.visualEvidence??=[];
    parent.visualEvidence.push(structuredClone(envelope));
    const projection=projectObservation(parent,objective);
    parent.candidates=projection.candidates;
    return {accepted:visual.accepted??[],rejected:visual.rejected??[],errors:projection.errors??[],reason:projection.errors?.length?'VISUAL_INTERPRETATION_REJECTED':'PROJECTED'};
}

export function visualFingerprint(artifact,overview,contract,dom=[]) {
    return digest([artifact.image.sha256,overview.sha256,contract?.model??null,contract?.promptHash??null,contract?.schemaRevision??null,dom.map(row=>[row.text,row.role,row.selected,row.disabled,row.bboxPx,row.groupId,row.contextText])]);
}
