import {digest,canonical,providerBound} from './model.mjs';
import {admitPayment,monetaryKinds,chargeKinds,quantityKind} from './payment-semantics.mjs';
import {nativeStateContext} from './source.mjs';
import {sourceNumberCandidates,normalizeSourceNumber} from './numeric-source.mjs';
import {currencyOccurrences,resolveSourceCurrency} from './currency-sources.mjs';
import {verifiedCountryContext} from './truth-contract.mjs';
import {validateRenderedArtifact} from './rendered-observation.mjs';
import {createSourceReferenceResolver,imageRegionReference,validateRegionRegistry} from './source-references.mjs';
import {visualEvidenceSchema,visualEvidenceLimits,validateVisualWireShape,exact,label,labels,known} from './visual-wire.mjs';

const normalized=value=>value.normalize('NFKC').replace(/\s+/g,' ').trim().toLocaleLowerCase('en');
const empty=()=>({referenceKind:'IMAGE_REGION',source:{offers:[],populations:[],accountStatements:[]},bindings:{},candidates:[],accepted:[],rejected:[]});
const qualifierRows=value=>Array.isArray(value)&&value.length<=16&&value.every(row=>exact(row,['text','support'])&&label(row.text)&&labels(row.support));
const validCountry=value=>value===null||typeof value==='string'&&/^[A-Z]{2}$/.test(value);

function isolatedDisplay(row,charge) {
    let text=row.quote;
    for(const token of [charge.money.amountText,charge.money.currencyText])if(token)text=text.replace(token,' ');
    text=normalizeSourceNumber(text).trim();
    return /^(?:\/|per|a|each|every)?\s*(?:months?|years?|weeks?|days?|monthly|yearly|annually|weekly|daily)[.!]?$/i.test(text);
}

function visualArtifactBinding(observation,artifact,envelope,ids,relations=[]) {
    const transcriptions=new Map(envelope.transcriptions.map(row=>[row.id,row]));
    return {
        observation:observation.id,
        sha256:observation.sha256,
        artifact:digest(envelope),
        renderedArtifact:{schema:artifact.schema,id:artifact.id,imageSha256:artifact.image.sha256,widthPx:artifact.image.widthPx,heightPx:artifact.image.heightPx,parent:structuredClone(artifact.parent),resource:structuredClone(artifact.resource),capture:structuredClone(artifact.capture),journey:structuredClone(artifact.journey)},
        transformation:structuredClone(envelope.transformation),
        support:ids.map(id=>{
            const row=transcriptions.get(id);
            return {reference:imageRegionReference(observation,artifact,row.regionId),transcriptionId:id,verbatimText:row.verbatimText,readability:row.readability,evidenceKind:row.evidenceKind};
        }),
        relationships:relations.map(id=>structuredClone(envelope.relationships.find(row=>row.id===id)))
    };
}

export function projectVisualEvidence(observation,objective,envelope) {
    const result=empty();
    try {
        if(!envelope||envelope.schema!==visualEvidenceSchema||envelope.observationId!==observation.id||envelope.observationSha256!==observation.sha256||digest(observation.body)!==observation.sha256||!providerBound(objective,observation.url))throw Error('VISUAL_OBSERVATION_BINDING_INVALID');
        const artifact=(observation.renderedArtifacts??[]).find(row=>row.id===envelope.renderId);
        if(!artifact)throw Error('VISUAL_RENDERED_ARTIFACT_MISSING');
        validateRenderedArtifact(observation,artifact);
        if(envelope.imageSha256!==artifact.image.sha256)throw Error('VISUAL_IMAGE_HASH_MISMATCH');
        const {transcriptions,relationships}=validateVisualWireShape(envelope),regions=validateRegionRegistry(artifact,envelope.regions),resolver=createSourceReferenceResolver({observation,artifact,regions:envelope.regions});
        if(artifact.journey.parentRenderId!==null) {
            const parent=(observation.renderedArtifacts??[]).find(row=>row.id===artifact.journey.parentRenderId);
            if(!parent)throw Error('VISUAL_PARENT_RENDER_MISSING');
            validateRenderedArtifact(observation,parent);
            const parentEvidence=(observation.visualEvidence??[]).find(row=>row.renderId===parent.id);
            if(!parentEvidence||parentEvidence.observationId!==observation.id||parentEvidence.observationSha256!==observation.sha256||parentEvidence.imageSha256!==parent.image.sha256)throw Error('VISUAL_INTERACTION_SOURCE_INVALID');
            validateVisualWireShape(parentEvidence);
            const parentRegions=validateRegionRegistry(parent,parentEvidence.regions);
            if(artifact.journey.interactions.some(row=>row.sourceControlRef.imageSha256!==parent.image.sha256||parentRegions.get(row.sourceControlRef.regionId)?.scope!=='CONTROL'))throw Error('VISUAL_INTERACTION_SOURCE_INVALID');
        }
        for(const row of transcriptions.values())if(!regions.has(row.regionId))throw Error('VISUAL_TRANSCRIPTION_REGION_INVALID');
        for(const row of relationships.values())for(const id of [...row.fromRegionIds,...row.toRegionIds,...row.witnessRegionIds,...row.scopeRegionIds])if(!regions.has(id))throw Error('VISUAL_RELATIONSHIP_REGION_INVALID');
        for(const row of envelope.unresolved)for(const id of row.supportingRegionIds)if(!regions.has(id))throw Error('VISUAL_UNRESOLVED_REGION_INVALID');
        for(const row of artifact.journey.interactions)if(row.observedStateRefs.some(id=>!transcriptions.has(id)&&!relationships.has(id)))throw Error('VISUAL_INTERACTION_STATE_INVALID');

        const refs=new Map([...regions].map(([id])=>[id,imageRegionReference(observation,artifact,id)]));
        const inside=(inner,outer)=>resolver.contains(refs.get(outer),refs.get(inner));
        const support=(ids,presentationRegionId=null)=>{
            if(!labels(ids)||ids.length<1)return null;
            const rows=ids.map(id=>transcriptions.get(id));
            if(rows.some(row=>!row||row.readability!=='READABLE'||row.evidenceKind!=='DIRECT_TEXT'||row.uncertaintyReasons.length))return null;
            if(presentationRegionId&&rows.some(row=>!inside(row.regionId,presentationRegionId)))return null;
            return rows;
        };
        const contains=(ids,text)=>typeof text==='string'&&text.length>0&&(support(ids)?.some(row=>row.verbatimText.includes(text))??false);
        const relation=(id,{allowKinds=null}={})=>{
            const row=relationships.get(id);
            if(!row||row.evidenceKind!=='VISUAL_RELATION'||row.kind==='UNKNOWN'||row.uncertaintyReasons.length||allowKinds&&!allowKinds.includes(row.kind))return null;
            return row;
        };
        const connects=(row,left,right)=>{
            if(!row)return false;
            const forward=left.every(id=>row.fromRegionIds.includes(id))&&right.every(id=>row.toRegionIds.includes(id));
            const reverse=left.every(id=>row.toRegionIds.includes(id))&&right.every(id=>row.fromRegionIds.includes(id));
            return forward||reverse;
        };
        const directRows=ids=>support(ids)?.map(row=>({start:0,end:row.verbatimText.length,quote:row.verbatimText,sourceId:row.id,reference:refs.get(row.regionId)}))??[];
        const binding=(ids,relationIds=[])=>visualArtifactBinding(observation,artifact,envelope,[...new Set(ids)],relationIds);

        const service=envelope.service,serviceRows=support(service.support),serviceRegions=serviceRows?.map(row=>row.regionId)??[];
        if(!serviceRows||service.ambiguity||normalized(service.name)!==normalized(objective.serviceName)||!serviceRows.some(row=>normalized(row.verbatimText).includes(normalized(service.name))))throw Error('VISUAL_SERVICE_ASSOCIATION_UNSUPPORTED');
        result.source.serviceId=objective.serviceId;
        result.bindings['/serviceId']=binding(service.support);

        for(const [offerIndex,offer] of envelope.offers.entries()) {
            const reject=(reason,extra={})=>result.rejected.push({offer:offerIndex,reason,...extra});
            if(!exact(offer,['id','name','service','audience','relationship','ambiguity','presentationRegionId','nameSupport','serviceAssociationRef','qualifiers','market','availability','charges','transitions'])||!label(offer.id,256)||!label(offer.name,256)||offer.service!==service.name||!known(offer.audience,['CONSUMER','BUSINESS','UNKNOWN'])||!known(offer.relationship,['SUBSCRIPTION','MEMBERSHIP','INSTALLMENT','ONE_TIME','UNKNOWN'])||typeof offer.ambiguity!=='boolean'||!label(offer.presentationRegionId,256)||!labels(offer.nameSupport)||!label(offer.serviceAssociationRef,256)||!qualifierRows(offer.qualifiers)||!Array.isArray(offer.charges)||offer.charges.length>visualEvidenceLimits.charges||!Array.isArray(offer.transitions)||offer.transitions.length>visualEvidenceLimits.charges)throw Error('VISUAL_OFFER_INVALID');
            const presentation=regions.get(offer.presentationRegionId),nameRows=support(offer.nameSupport,offer.presentationRegionId),serviceRelation=relation(offer.serviceAssociationRef,{allowKinds:['WITHIN_PRESENTATION','LABELS','APPLIES_TO','ROW_COLUMN_ASSOCIATION']});
            if(!presentation||presentation.scope!=='OFFERING'||!nameRows||!nameRows.some(row=>normalized(row.verbatimText).includes(normalized(offer.name)))||!connects(serviceRelation,[offer.presentationRegionId],serviceRegions)){reject('VISUAL_OFFER_ASSOCIATION_UNSUPPORTED');continue;}
            if(!offer.qualifiers.every(row=>support(row.support,offer.presentationRegionId)&&contains(row.support,row.text))){reject('VISUAL_QUALIFIER_SUPPORT_INVALID');continue;}
            const market=offer.market;
            if(!exact(market,['country','basis','ambiguity','support','exclusions'])||!validCountry(market.country)||!known(market.basis,['EXPLICIT','UNKNOWN'])||typeof market.ambiguity!=='boolean'||!labels(market.support)||!Array.isArray(market.exclusions)||market.exclusions.length>16)throw Error('VISUAL_MARKET_INVALID');
            if(market.country!==null&&(market.basis!=='EXPLICIT'||!support(market.support,offer.presentationRegionId))){reject('VISUAL_MARKET_SUPPORT_INVALID');continue;}
            if(market.country===null&&market.basis!=='UNKNOWN')throw Error('VISUAL_MARKET_INVALID');
            if(market.support.length&&!support(market.support,offer.presentationRegionId)){reject('VISUAL_MARKET_SUPPORT_INVALID');continue;}
            if(!market.exclusions.every(row=>exact(row,['country','support'])&&/^[A-Z]{2}$/.test(row.country)&&support(row.support,offer.presentationRegionId)))throw Error('VISUAL_MARKET_INVALID');

            const availability=offer.availability;
            if(availability!==null) {
                if(!exact(availability,['scope','choiceSet','cadences','support','associationRef','payment'])||!known(availability.scope,['SERVICE','PLAN','UNKNOWN'])||!known(availability.choiceSet,['COMPLETE','PARTIAL','EXPLICIT_NO_MONTHLY','UNKNOWN'])||!Array.isArray(availability.cadences)||availability.cadences.length>8||!availability.cadences.every(value=>known(value,['MONTHLY','YEARLY','WEEKLY','DAILY','UNKNOWN']))||!labels(availability.support)||!label(availability.associationRef,256)||!exact(availability.payment,['kind','text','support'])||!known(availability.payment.kind,['ACTUAL_PAYMENT','UNKNOWN'])||!(availability.payment.text===null||label(availability.payment.text))||!labels(availability.payment.support))throw Error('VISUAL_AVAILABILITY_INVALID');
                const rows=support(availability.support,availability.scope==='PLAN'?offer.presentationRegionId:null),association=relation(availability.associationRef,{allowKinds:['APPLIES_TO','SELECTED_IN','WITHIN_PRESENTATION','LABELS']});
                const targets=availability.scope==='SERVICE'?serviceRegions:[offer.presentationRegionId];
                const related=rows&&connects(association,rows.map(row=>row.regionId),targets);
                if(related&&!offer.ambiguity&&availability.scope==='SERVICE'&&!availability.cadences.includes('MONTHLY')&&(availability.choiceSet==='EXPLICIT_NO_MONTHLY'||availability.choiceSet==='COMPLETE'&&availability.cadences.length&&!availability.cadences.includes('UNKNOWN'))) {
                    result.source.subscriptionChoices??=[];
                    result.source.subscriptionChoices.push({monthlyOffered:false,scope:'SERVICE',basis:availability.choiceSet,market:market.country,marketAmbiguous:market.ambiguity,excludedMarkets:market.exclusions.map(row=>row.country)});
                    result.bindings['/subscriptionChoices/'+(result.source.subscriptionChoices.length-1)]={...binding(availability.support,[availability.associationRef]),visualAvailability:structuredClone(availability)};
                }
                if(related&&!offer.ambiguity&&availability.cadences.includes('MONTHLY')&&['SERVICE','PLAN'].includes(availability.scope)&&['COMPLETE','PARTIAL'].includes(availability.choiceSet)) {
                    const paymentRows=directRows(availability.payment.support),payment=admitPayment({cadence:'MONTHLY',kind:availability.payment.kind,text:availability.payment.text,rows:paymentRows,valid:()=>true,displayOnly:row=>isolatedDisplay(row,{money:{amountText:null,currencyText:null}}),native:row=>nativeStateContext(row.quote).cadence});
                    if(payment.kind==='ACTUAL_PAYMENT') {
                        result.source.subscriptionChoices??=[];
                        result.source.subscriptionChoices.push({monthlyOffered:true,scope:availability.scope,basis:availability.choiceSet,payment:{kind:payment.kind,cadence:payment.cadence},market:market.country,marketAmbiguous:market.ambiguity,excludedMarkets:market.exclusions.map(row=>row.country)});
                        result.bindings['/subscriptionChoices/'+(result.source.subscriptionChoices.length-1)]={...binding(availability.payment.support,[availability.associationRef]),payment,visualAvailability:structuredClone(availability)};
                    }
                }
            }

            const charges=new Map();
            for(const charge of offer.charges) {
                if(!exact(charge,['id','money','cadence','role','derivation','duration','qualifiers','ambiguity','support','associationRef','payment','temporal','monetary'])||!label(charge.id,256)||charges.has(charge.id)||!exact(charge.money,['amount','amountText','amountOccurrence','currency','currencyText','currencyOccurrence'])||!(charge.money.amount===null||typeof charge.money.amount==='number'&&Number.isFinite(charge.money.amount))||!(charge.money.amountText===null||label(charge.money.amountText))||!(charge.money.currency===null||/^[A-Z]{3}$/.test(charge.money.currency))||!(charge.money.currencyText===null||label(charge.money.currencyText))||!exact(charge.cadence,['unit','expression'])||!known(charge.cadence.unit,['MONTHLY','YEARLY','WEEKLY','DAILY','UNKNOWN'])||!(charge.cadence.expression===null||label(charge.cadence.expression))||!known(charge.role,['INTRODUCTORY','ORDINARY','SUBSEQUENT','BENEFIT','CREDIT','DISCOUNT','INSTALLMENT','TAX','OTHER','UNKNOWN'])||!known(charge.derivation,['EXPLICIT','ARITHMETIC','UNKNOWN'])||!(charge.duration===null||label(charge.duration))||!qualifierRows(charge.qualifiers)||typeof charge.ambiguity!=='boolean'||!labels(charge.support)||!label(charge.associationRef,256))throw Error('VISUAL_CHARGE_INVALID');
                if(!exact(charge.payment,['kind','text','support'])||!known(charge.payment.kind,['ACTUAL_PAYMENT','UNKNOWN'])||!(charge.payment.text===null||label(charge.payment.text))||!labels(charge.payment.support))throw Error('VISUAL_PAYMENT_INVALID');
                if(!exact(charge.temporal,['billingCadence','billingSupport','commitmentText','commitmentSupport','priceKind'])||!known(charge.temporal.billingCadence,['MONTHLY','YEARLY','WEEKLY','DAILY','UNKNOWN'])||!labels(charge.temporal.billingSupport)||!(charge.temporal.commitmentText===null||label(charge.temporal.commitmentText))||!labels(charge.temporal.commitmentSupport)||!known(charge.temporal.priceKind,['CHARGE','EQUIVALENT','UNKNOWN']))throw Error('VISUAL_TEMPORAL_INVALID');
                if(!exact(charge.monetary,['kind','relatedCharge','relation','support'])||!known(charge.monetary.kind,monetaryKinds)||!(charge.monetary.relatedCharge===null||label(charge.monetary.relatedCharge,256))||!known(charge.monetary.relation,['CHARGE_FOR','EQUIVALENT_OF','BENEFIT_OF','DISCOUNT_OF','REFERENCE_FOR','TAX_ON','UNKNOWN'])||!labels(charge.monetary.support))throw Error('VISUAL_MONETARY_INVALID');
                const rows=support(charge.support,offer.presentationRegionId),association=relation(charge.associationRef,{allowKinds:['WITHIN_PRESENTATION','LABELS','APPLIES_TO','ROW_COLUMN_ASSOCIATION']});
                if(!rows||!connects(association,rows.map(row=>row.regionId),[offer.presentationRegionId])){reject('VISUAL_CHARGE_ASSOCIATION_UNSUPPORTED',{charge:charge.id});continue;}
                if(!charge.qualifiers.every(row=>support(row.support,offer.presentationRegionId)&&contains(row.support,row.text))){reject('VISUAL_CHARGE_QUALIFIER_INVALID',{charge:charge.id});continue;}
                let amountGrounded=false;
                if(charge.money.amount===null)amountGrounded=charge.money.amountText===null&&charge.money.amountOccurrence===null;
                else if(exact(charge.money.amountOccurrence,['transcriptionId','startUtf16','endUtf16','quote'])) {
                    const occurrence=charge.money.amountOccurrence,row=transcriptions.get(occurrence.transcriptionId);
                    amountGrounded=rows.includes(row)&&Number.isSafeInteger(occurrence.startUtf16)&&Number.isSafeInteger(occurrence.endUtf16)&&occurrence.startUtf16>=0&&occurrence.endUtf16>occurrence.startUtf16&&row.verbatimText.slice(occurrence.startUtf16,occurrence.endUtf16)===occurrence.quote&&occurrence.quote===charge.money.amountText&&sourceNumberCandidates(occurrence.quote).includes(charge.money.amount);
                }
                if(!amountGrounded){reject('VISUAL_AMOUNT_SUPPORT_INVALID',{charge:charge.id});continue;}
                let currency=charge.money.currency,currencyDiagnostic=null;
                if(currency===null) {
                    if(charge.money.currencyText!==null||charge.money.currencyOccurrence!==null){reject('VISUAL_CURRENCY_SUPPORT_INVALID',{charge:charge.id});continue;}
                } else {
                    if(!exact(charge.money.currencyOccurrence,['transcriptionId','startUtf16','endUtf16','quote'])){reject('VISUAL_CURRENCY_SUPPORT_INVALID',{charge:charge.id});continue;}
                    const occurrence=charge.money.currencyOccurrence,row=transcriptions.get(occurrence.transcriptionId);
                    if(!rows.includes(row)||row.verbatimText.slice(occurrence.startUtf16,occurrence.endUtf16)!==occurrence.quote||occurrence.quote!==charge.money.currencyText){reject('VISUAL_CURRENCY_SUPPORT_INVALID',{charge:charge.id});continue;}
                    const material={segments:[{start:0,end:row.verbatimText.length,text:row.verbatimText}]},all=currencyOccurrences({observation:{id:observation.id,sha256:observation.sha256},material}),source=all.find(item=>item.start===occurrence.startUtf16&&item.end===occurrence.endUtf16&&item.raw===occurrence.quote);
                    const explicit=[...new Set(rows.flatMap(item=>currencyOccurrences({observation:{id:observation.id,sha256:observation.sha256},material:{segments:[{start:0,end:item.verbatimText.length,text:item.verbatimText}]}}).filter(found=>found.explicit).flatMap(found=>found.candidates)))];
                    const verified=verifiedCountryContext(observation),marketContext=!market.ambiguity&&(!market.country||market.country===verified)&&!market.exclusions.some(row=>row.country===verified)?verified:null;
                    if(!source){reject('VISUAL_CURRENCY_SUPPORT_INVALID',{charge:charge.id});continue;}
                    const resolved=resolveSourceCurrency({occurrence:source,selected:currency,explicit,market:marketContext,verification:marketContext?observation.transport?.verification:null});
                    if(resolved.code!==currency){reject('VISUAL_CURRENCY_SUPPORT_INVALID',{charge:charge.id});continue;}
                    currencyDiagnostic=resolved.diagnostics;
                }
                const cadenceGrounded=charge.cadence.unit==='UNKNOWN'?charge.cadence.expression===null:contains(charge.support,charge.cadence.expression);
                const commitmentRows=support(charge.temporal.commitmentSupport,offer.presentationRegionId),commitmentGrounded=charge.temporal.commitmentText===null||commitmentRows&&commitmentRows.some(row=>row.verbatimText.includes(charge.temporal.commitmentText));
                const billingRows=support(charge.temporal.billingSupport,offer.presentationRegionId),paymentSupport=support(charge.payment.support,offer.presentationRegionId);
                let payment={kind:'UNKNOWN',cadence:'UNKNOWN',support:[],text:null,reason:'PAYMENT_RELATION_UNSUPPORTED'};
                if(billingRows&&paymentSupport&&charge.payment.support.every(id=>charge.support.includes(id)))payment=admitPayment({cadence:charge.temporal.billingCadence,kind:charge.payment.kind,text:charge.payment.text,rows:directRows(charge.payment.support),valid:()=>true,displayOnly:row=>isolatedDisplay(row,charge),commitment:charge.temporal.commitmentText,native:row=>nativeStateContext(row.quote).cadence});
                const billingCadence=payment.kind==='ACTUAL_PAYMENT'?charge.temporal.billingCadence:'UNKNOWN';
                if(!cadenceGrounded||!commitmentGrounded){reject('VISUAL_CHARGE_SUPPORT_INVALID',{charge:charge.id});continue;}
                const monetaryRows=support(charge.monetary.support,offer.presentationRegionId),monetaryKind=quantityKind(charge.monetary);
                if(!monetaryRows||!monetaryKinds.includes(monetaryKind)){reject('VISUAL_MONETARY_SUPPORT_INVALID',{charge:charge.id});continue;}
                const grounded=amountGrounded&&cadenceGrounded&&rows.every(row=>row.readability==='READABLE');
                charges.set(charge.id,{charge,grounded,payment,billingCadence,currency,currencyDiagnostic,monetaryKind});
            }

            const transitions=[];
            for(const link of offer.transitions) {
                if(!exact(link,['from','to','kind','ambiguity','support','relationshipRef'])||!label(link.from,256)||!label(link.to,256)||!known(link.kind,['RECURS_AFTER_INTRO','UNKNOWN'])||typeof link.ambiguity!=='boolean'||!labels(link.support)||!label(link.relationshipRef,256))throw Error('VISUAL_TRANSITION_INVALID');
                const from=charges.get(link.from),to=charges.get(link.to),rows=support(link.support,offer.presentationRegionId),relationship=relation(link.relationshipRef,{allowKinds:['FOLLOWED_BY','APPLIES_TO']});
                const fromRegions=from?.charge.support.map(id=>transcriptions.get(id)?.regionId).filter(Boolean)??[],toRegions=to?.charge.support.map(id=>transcriptions.get(id)?.regionId).filter(Boolean)??[];
                const grounded=from?.grounded&&to?.grounded&&from.charge.role==='INTRODUCTORY'&&['ORDINARY','SUBSEQUENT'].includes(to.charge.role)&&rows&&connects(relationship,fromRegions,toRegions)&&contains(link.support,from.charge.money.amountText)&&contains(link.support,to.charge.money.amountText);
                if(grounded&&!link.ambiguity&&link.kind==='RECURS_AFTER_INTRO')transitions.push(link);
                else reject('VISUAL_TRANSITION_UNSUPPORTED_OR_AMBIGUOUS',{relationship:[link.from,link.to]});
            }

            for(const {charge,grounded,payment,billingCadence,currency,currencyDiagnostic,monetaryKind} of charges.values()) {
                if(!grounded)continue;
                const sequence=charge.role!=='SUBSEQUENT'||transitions.some(link=>link.to===charge.id),kindPermitsCharge=chargeKinds.has(monetaryKind),explicit=!offer.ambiguity&&!charge.ambiguity&&sequence&&kindPermitsCharge;
                const phase=charge.role==='SUBSEQUENT'?'ORDINARY':charge.role,ordinal=[...charges.values()].filter(row=>(row.charge.role==='SUBSEQUENT'?'ORDINARY':row.charge.role)===phase).findIndex(row=>row.charge===charge);
                const pointer='/offers/'+result.source.offers.length;
                result.source.offers.push({id:digest([new URL(observation.url).hostname,normalized(service.name),normalized(offer.name),phase,ordinal,'VISUAL_SOURCE_LOCAL',observation.url,artifact.id,offer.presentationRegionId]),monetaryKind,monetaryRelation:{relatedCharge:charge.monetary.relatedCharge,kind:charge.monetary.relation},amount:explicit?charge.money.amount:null,currency:explicit?currency:null,cadence:explicit?charge.cadence.unit:'UNKNOWN',consumer:!offer.ambiguity?(offer.audience==='CONSUMER'?true:offer.audience==='BUSINESS'?false:null):null,relationship:!offer.ambiguity?offer.relationship:'UNKNOWN',role:explicit?(charge.role==='INTRODUCTORY'?'TRIAL':charge.role==='SUBSEQUENT'?'ORDINARY':charge.role):'UNKNOWN',amountDerivation:explicit?(charge.temporal.priceKind==='EQUIVALENT'?'ARITHMETIC':charge.derivation):'UNKNOWN',billingCadence:!offer.ambiguity&&!charge.ambiguity&&sequence?billingCadence:'UNKNOWN',commitment:charge.temporal.commitmentText??charge.duration??null,market:!market.ambiguity&&market.basis==='EXPLICIT'?market.country:null,marketAmbiguous:market.ambiguity,...(market.exclusions.length?{excludedMarkets:market.exclusions.map(row=>row.country)}:{}),conditions:offer.qualifiers.length||charge.qualifiers.length?canonical([...offer.qualifiers.map(row=>row.text),...charge.qualifiers.map(row=>row.text)]):null});
                const supportIds=[...offer.nameSupport,...charge.support,...market.support,...market.exclusions.flatMap(row=>row.support),...transitions.filter(link=>link.to===charge.id).flatMap(link=>link.support)];
                const relationIds=[offer.serviceAssociationRef,charge.associationRef,...transitions.filter(link=>link.to===charge.id).map(link=>link.relationshipRef)];
                result.bindings[pointer]={offerIndex,offer:offer.name,charge:charge.id,presentation:imageRegionReference(observation,artifact,offer.presentationRegionId),serviceAssociation:offer.serviceAssociationRef,currencyResolution:currencyDiagnostic,payment,monetary:structuredClone(charge.monetary),temporal:{...structuredClone(charge.temporal),billingCadence},duration:charge.duration,qualifiers:[...offer.qualifiers.map(row=>row.text),...charge.qualifiers.map(row=>row.text)],...binding(supportIds,relationIds)};
                if(explicit)result.accepted.push({offer:offerIndex,charge:charge.id});
                else reject(sequence?'VISUAL_SEMANTIC_AMBIGUITY':'VISUAL_TRANSITION_REQUIRED',{charge:charge.id});
            }
        }
        result.candidates=[{kind:'SERVICE',pointer:''},...result.source.offers.map((_,index)=>({kind:'OFFER',pointer:'/offers/'+index}))];
        return result;
    } catch(error) {
        return {...empty(),error:/^(?:VISUAL|RENDERED|IMAGE_REGION|SOURCE_REFERENCE)_[A-Z_]+$/.test(error.message)?error.message:'VISUAL_EVIDENCE_INVALID'};
    }
}
