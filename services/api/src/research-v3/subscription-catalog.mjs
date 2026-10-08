// Catalog research is independent of offering truth. Routing scores and model
// output cannot certify a complete catalog. All records refer to retained sources.
import {digest,requiredPricePropositions,providerBound} from './model.mjs';
import {projectObservation} from './projection.mjs';
import {semanticMaterial} from './source.mjs';
import {offeringRoutingValue} from './semantic-units.mjs';
export const catalogLimits=Object.freeze({offerings:128});
export function researchTruth(k,truth) {
    if(k.objective.kind!=='PRICE')return truth;
    // Even established prices leave catalog questions open. Use existing action
    // intents/channels; neither these research needs nor their scores are truth.
    const needs=truth.needs.length?truth.needs:k.objective.markets.flatMap(m=>requiredPricePropositions.map(proposition=>({id:m+':'+proposition,market:m,proposition})));
    return {...truth,needs,established:false};
}
export function refreshCatalog(k,truth) {
    if(k.objective.kind!=='PRICE')return null;
    const offerings=[],scopeEvidence=[];let limited=false;
    const retain=value=>{if(offerings.length<catalogLimits.offerings)offerings.push(value);else limited=true;};
    for(const o of k.observations) {
        if(o.semantic||o.kind!=='PROVIDER'||o.outcome!=='OK'||o.truncated||digest(o.body)!==o.sha256||!providerBound(k.objective,o.url))continue;
        if(o.format==='WEB') {
            const material=semanticMaterial(o);
            for(const p of material.presentations.filter(p=>p.tag==='script-data'&&offeringRoutingValue(o.body.slice(p.start,p.end))>=6)) {
                const unit=o.semanticUnits?.find(u=>u.presentationIds.includes(p.id));
                retain({id:digest([o.id,p.id]),observation:o.id,sha256:o.sha256,source:{start:p.start,end:p.end},structuralPath:p.structuredPath??null,parentPath:p.parentPath??null,presentation:p.id,unit:unit?.id??null,processing:unit?o.semanticAttempts?.findLast(a=>a.unit===unit.id)?.status??'PENDING':'PENDING',classification:'CANDIDATE_ONLY'});
            }
        }
        const projection=o.format==='WEB'?projectObservation(o,k.objective):null;
        let source;try{source=projection?.source??JSON.parse(o.body);}catch{continue;}
        for(const [i,offer]of (Array.isArray(source.offers)?source.offers:[]).entries())retain({id:offer.id??digest([o.id,i]),observation:o.id,sha256:o.sha256,source:projection?.bindings['/offers/'+i]??{pointer:'/offers/'+i},evidence:structuredClone(offer),name:projection?.bindings['/offers/'+i]?.offer??null,processing:'REPRESENTED',truth:truth.offers.filter(g=>g.id===offer.id)});
        // An explicit provider-native bounded catalog declaration is one supported
        // evidence class, not an array-ending heuristic or a model verdict. Its
        // service, market and complete member set must all be source established.
        const c=source.catalog;
        if(o.format!=='WEB'&&source.serviceId===k.objective.serviceId&&c?.scope==='SERVICE_MARKET'&&c.coverage==='COMPLETE'&&k.objective.markets.includes(c.market)&&Array.isArray(source.offers)&&Array.isArray(c.offerIds)&&c.offerIds.every(id=>typeof id==='string'&&id.length>0&&id.length<=256)&&source.offers.length===c.offerIds.length&&c.offerIds.length&&c.offerIds.length<=catalogLimits.offerings&&new Set(c.offerIds).size===c.offerIds.length&&c.offerIds.every(id=>source.offers?.some(v=>v.id===id))&&source.offers?.every(v=>c.offerIds.includes(v.id)))scopeEvidence.push({observation:o.id,sha256:o.sha256,pointer:'/catalog',market:c.market,offerIds:[...c.offerIds]});
    }
    if(offerings.length>catalogLimits.offerings)limited=true;
    const pending=offerings.some(o=>o.processing==='PENDING'||o.processing==='RESERVED');
    const complete=!limited&&k.objective.markets.every(m=>scopeEvidence.some(s=>s.market===m));
    const state=complete?'CATALOG_EXHAUSTED':limited||k.stop?.reason==='CAPACITY_BOUND_REACHED'?'CAPACITY':k.stop&&((k.policyBlocks?.length??0)>0||k.attempts.some(a=>a.failure?.kind==='ACQUISITION'))?'ACCESS':'CATALOG_UNRESOLVED';
    k.catalog={objective:'DISCOVER_COMPLETE_RELEVANT_SUBSCRIPTION_CATALOG',state,offeringState:offerings.length?'OFFERING_FOUND':'MORE_OFFERINGS_POSSIBLE',scope:scopeEvidence.length?'CATALOG_SCOPE_ESTABLISHED':'UNRESOLVED',scopeEvidence,offerings:offerings.slice(0,catalogLimits.offerings),pending,limited};
    return k.catalog;
}
