// Deterministic routing only. Signals do not establish source semantics or truth.
import {digest} from './model.mjs';
import {selectedStateContext,providerStates} from './provider-states.mjs';
import {semanticMaterial,semanticDestinations,projectWebSource} from './source.mjs';
export const semanticUnitLimits=Object.freeze({units:4,preparedCandidates:16,presentations:16,segments:64,sourceBytes:4096,sourceCharacters:4096,requestBytes:8192,modelCallsPerAction:4,destinations:16});
const money=s=>/\p{Sc}\s*\p{N}|\p{N}[\p{N}.,\s]*\p{Sc}|\b[A-Z]{3}\s*\p{N}|\p{N}[\p{N}.,\s]*\s*[A-Z]{3}\b/u.test(s);
const inside=(s,p)=>s.start>=p.start&&s.end<=p.end;
import {offeringRoutingValue} from './structured-material.mjs';
export {offeringRoutingValue} from './structured-material.mjs';
export function materialForUnit(o,unit) {
    const all=semanticMaterial(o);
    if(all.limited)throw Error('EVIDENCE_MATERIAL_BOUND');
    const state=providerStates(o);if(state.scanLimited)throw Error('EVIDENCE_MATERIAL_BOUND');
    const presentations=all.presentations.filter(p=>unit.presentationIds.includes(p.id));
    if(presentations.length!==unit.presentationIds.length||!presentations.length||presentations.length>semanticUnitLimits.presentations)throw Error('EVIDENCE_UNIT_INVALID');
    const segments=all.segments.filter(s=>unit.segmentSpans?unit.segmentSpans.some(b=>s.start===b.start&&s.end===b.end):presentations.some(p=>inside(s,p))||unit.identitySpans.some(b=>s.start===b.start&&s.end===b.end));
    if(unit.segmentSpans&&segments.length!==unit.segmentSpans.length)throw Error('EVIDENCE_UNIT_INVALID');
    if(segments.some(s=>(state.incompleteScopes??[]).some(p=>s.start<p.end&&s.end>p.start)))throw Error('EVIDENCE_MATERIAL_BOUND');
    const source=segments.map(s=>s.text).join('');
    if(segments.length>semanticUnitLimits.segments||source.length>semanticUnitLimits.sourceCharacters||Buffer.byteLength(source)>semanticUnitLimits.sourceBytes)throw Error('EVIDENCE_UNIT_BOUND');
    const identity={observation:o.id,sha256:o.sha256,presentationIds:unit.presentationIds,identitySpans:unit.identitySpans,needs:unit.needs,...(unit.segmentSpans?{segmentSpans:unit.segmentSpans}:{} )};
    if(unit.id!==digest(identity))throw Error('EVIDENCE_UNIT_INVALID');
    const destinations=semanticDestinations(o).filter(d=>presentations.some(p=>inside(d,p))).slice(0,semanticUnitLimits.destinations);
    const contexts=providerStates(o).groups.filter(g=>g.scope&&presentations.some(p=>p.start<=g.scope.end&&p.end>=g.scope.start)).flatMap(g=>g.variants.filter(v=>v.selected&&v.submission!=='OMIT').map(v=>({group:g.id,variant:v.id,scope:g.scope,source:v.source,spans:v.labelSpans}))).slice(0,16).filter(c=>c.spans.some(b=>segments.some(s=>s.start<=b.start&&s.end>=b.end)));
    return {segments,presentations,limited:false,destinations,...(contexts.length?{contexts}: {})};
}
export function selectSemanticPlan(o,objective,needs) {
    const all=semanticMaterial(o);if(all.limited)return {units:[],capacityHit:true,reason:'MATERIAL_BOUND'};
    const native=projectWebSource(o,objective),identity=native.bindings['/serviceId'];
    const identitySpans=all.segments.filter(s=>identity&&inside(s,identity)).map(({start,end})=>({start,end}));
    const wanted=needs??(objective.kind==='PRICE'?['PRICE_AMOUNT','CURRENCY','MONTHLY_CADENCE','MONTHLY_SUBSCRIPTION','CONSUMER_SUBSCRIPTION','TARGET_MARKET','SERVICE_IDENTITY']:['SERVICE_IDENTITY','SERVICE_SIZE_100K_PLUS','ACCOUNT_LOGIN_EXISTS','MEMBERSHIP_MANAGEMENT_EXISTS']);
    const pricing=wanted.some(n=>/PRICE|CURRENCY|CADENCE|SUBSCRIPTION|MARKET/.test(n));
    const account=wanted.some(n=>/ACCOUNT|MANAGEMENT|CANCELLATION/.test(n));
    const destinations=semanticDestinations(o);
    const stateContexts=wanted.some(n=>n.includes('MONTHLY_SUBSCRIPTION'))?selectedStateContext(o,{start:0,end:o.body.length}):[];
    const structuredPrice=s=>all.presentations.some(p=>p.tag==='script-data'&&inside(s,p)&&['Offer','AggregateOffer','UnitPriceSpecification','Product','Service','StructuredObject'].includes(p.itemType));
    const stateSegment=s=>stateContexts.some(c=>c.spans.some(b=>s.start<=b.start&&s.end>=b.end));
    const anchors=all.segments.filter(s=>(pricing&&(money(s.text)||structuredPrice(s)))||stateSegment(s)||(account&&destinations.some(d=>inside(s,d)))||(wanted.includes('SERVICE_SIZE_100K_PLUS')&&/\p{N}/u.test(s.text)));
    const make=(presentations,complete=false,segmentSpans=null)=>{
        const rows=all.segments.filter(s=>segmentSpans?segmentSpans.some(b=>s.start===b.start&&s.end===b.end):presentations.some(p=>inside(s,p)));
        const hasMoney=rows.some(s=>money(s.text)||structuredPrice(s)),hasState=rows.some(stateSegment),hasDestinations=destinations.some(d=>presentations.some(p=>inside(d,p)));
        const routed=objective.kind==='PRICE'&&hasMoney?[...new Set([...wanted,'SERVICE_IDENTITY','PRICE_AMOUNT','CURRENCY','MONTHLY_CADENCE','MONTHLY_SUBSCRIPTION','CONSUMER_SUBSCRIPTION','TARGET_MARKET'])]:wanted;
        const relevant=routed.filter(n=>complete||n==='SERVICE_IDENTITY'||n==='MONTHLY_SUBSCRIPTION'&&hasState||/ACCOUNT|MANAGEMENT|CANCELLATION/.test(n)&&hasDestinations||/SIZE/.test(n)&&rows.some(s=>/\p{N}/u.test(s.text))||/PRICE|CURRENCY|CADENCE|SUBSCRIPTION|MARKET/.test(n)&&hasMoney);
        if(!relevant.length)return null;
        const presentationIds=presentations.map(p=>p.id),unit={presentationIds,identitySpans,needs:relevant,...(segmentSpans?{segmentSpans}: {})};
        unit.id=digest({observation:o.id,sha256:o.sha256,...unit});
        try {materialForUnit(o,unit);return unit;}catch{return null;}
    };
    // A genuinely small complete presentation needs no arbitrary slicing.
    const whole=make(all.presentations,true);
    const independentOfferings=all.presentations.filter(p=>p.tag==='script-data'&&offeringRoutingValue(o.body.slice(p.start,p.end))>=6).length;
    if(whole&&wanted.length&&independentOfferings<=1)return {units:[whole],capacityHit:all.structuredLimited===true,reason:'SMALL_COMPLETE_PRESENTATION'};
    const candidates=[];let oversized=0;
    for(const anchor of anchors) {
        // Largest fitting ancestor preserves headings, temporal context and qualifiers.
        const enclosing=all.presentations.filter(p=>inside(anchor,p)).sort((a,b)=>(b.end-b.start)-(a.end-a.start));
        let found=false;
        for(const parent of enclosing) {
            const members=all.presentations.filter(p=>inside(p,parent));
            let unit=make(members.length>semanticUnitLimits.presentations?[parent]:members);
            const context=selectedStateContext(o,parent);
            if(context.length){
                const scopes=context.map(c=>c.scope),container=all.presentations.filter(p=>scopes.every(b=>p.start<=b.start&&p.end>=b.end)).sort((a,b)=>(a.end-a.start)-(b.end-b.start))[0];
                const headings=all.presentations.filter(h=>['h1','h2','h3'].includes(h.tag)&&h.end<=anchor.start&&context.some(c=>h.start>=c.scope.start&&h.end<=c.scope.end)).map(h=>({h,common:all.presentations.filter(p=>p.start<=h.start&&p.end>=anchor.end&&p.start<=parent.start&&p.end>=parent.end).sort((a,b)=>(a.end-a.start)-(b.end-b.start))[0]})).filter(x=>x.common).sort((a,b)=>(a.common.end-a.common.start)-(b.common.end-b.common.start)||b.h.start-a.h.start).slice(0,1).map(x=>x.h);
                const rows=all.segments.filter(s=>inside(s,parent)||headings.some(h=>inside(s,h))||identitySpans.some(b=>b.start===s.start&&b.end===s.end)||context.some(c=>c.spans.some(b=>s.start<=b.start&&s.end>=b.end)));
                if(container){unit=make([...new Map([container,...members].map(p=>[p.id,p])).values()],false,rows.map(({start,end})=>({start,end})));}
            }
            if(unit){candidates.push({unit,parent});found=true;break;}
        }
        if(!found)oversized++;
    }
    const value=c=>offeringRoutingValue(o.body.slice(c.parent.start,c.parent.end));
    const unique=[...new Map(candidates.map(c=>[c.unit.id,c])).values()].sort((a,b)=>value(b)-value(a)||Number(a.parent.tag==='script-data')-Number(b.parent.tag==='script-data')||a.parent.start-b.parent.start);
    const chosen=[];
    for(const c of unique)if(!chosen.some(old=>inside(c.parent,old.parent)))chosen.push(c);
    return {candidates:chosen.slice(0,semanticUnitLimits.preparedCandidates).map(c=>({...c.unit,researchValue:value(c)})),units:chosen.slice(0,semanticUnitLimits.units).map(c=>({...c.unit,researchValue:value(c)})),capacityHit:all.structuredLimited===true||oversized>0||chosen.length>semanticUnitLimits.preparedCandidates,reason:oversized?'INDIVISIBLE_PRESENTATION_BOUND':chosen.length>semanticUnitLimits.preparedCandidates?'PREPARED_CANDIDATE_BOUND':'LOCAL_STRUCTURAL_CANDIDATES'};
}

export const selectSemanticUnits=(o,objective,needs)=>selectSemanticPlan(o,objective,needs).units;
