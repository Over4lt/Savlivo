// Deterministic routing only. Signals do not establish source semantics or truth.
import {digest} from './model.mjs';
import {semanticMaterial,semanticDestinations,projectWebSource} from './source.mjs';
export const semanticUnitLimits=Object.freeze({units:4,presentations:16,segments:64,sourceBytes:4096,sourceCharacters:4096,requestBytes:8192,modelCallsPerAction:4,destinations:16});
const money=s=>/\p{Sc}\s*\p{N}|\p{N}[\p{N}.,\s]*\p{Sc}|\b[A-Z]{3}\s*\d|\d[\d.,\s]*\s*[A-Z]{3}\b/u.test(s);
const inside=(s,p)=>s.start>=p.start&&s.end<=p.end;
export function materialForUnit(o,unit) {
    const all=semanticMaterial(o);
    if(all.limited)throw Error('EVIDENCE_MATERIAL_BOUND');
    const presentations=all.presentations.filter(p=>unit.presentationIds.includes(p.id));
    if(presentations.length!==unit.presentationIds.length||!presentations.length||presentations.length>semanticUnitLimits.presentations)throw Error('EVIDENCE_UNIT_INVALID');
    const segments=all.segments.filter(s=>presentations.some(p=>inside(s,p))||unit.identitySpans.some(b=>s.start===b.start&&s.end===b.end));
    const source=segments.map(s=>s.text).join('');
    if(segments.length>semanticUnitLimits.segments||source.length>semanticUnitLimits.sourceCharacters||Buffer.byteLength(source)>semanticUnitLimits.sourceBytes)throw Error('EVIDENCE_UNIT_BOUND');
    const identity={observation:o.id,sha256:o.sha256,presentationIds:unit.presentationIds,identitySpans:unit.identitySpans,needs:unit.needs};
    if(unit.id!==digest(identity))throw Error('EVIDENCE_UNIT_INVALID');
    const destinations=semanticDestinations(o).filter(d=>presentations.some(p=>inside(d,p))).slice(0,semanticUnitLimits.destinations);
    return {segments,presentations,limited:false,destinations};
}
export function selectSemanticPlan(o,objective,needs) {
    const all=semanticMaterial(o);if(all.limited)return {units:[],capacityHit:true,reason:'MATERIAL_BOUND'};
    const native=projectWebSource(o,objective),identity=native.bindings['/serviceId'];
    const identitySpans=all.segments.filter(s=>identity&&inside(s,identity)).map(({start,end})=>({start,end}));
    const wanted=needs??(objective.kind==='PRICE'?['PRICE_AMOUNT','CURRENCY','MONTHLY_CADENCE','CONSUMER_SUBSCRIPTION','TARGET_MARKET','SERVICE_IDENTITY']:['SERVICE_IDENTITY','SERVICE_SIZE_100K_PLUS','ACCOUNT_LOGIN_EXISTS','MEMBERSHIP_MANAGEMENT_EXISTS']);
    const pricing=wanted.some(n=>/PRICE|CURRENCY|CADENCE|SUBSCRIPTION|MARKET/.test(n));
    const account=wanted.some(n=>/ACCOUNT|MANAGEMENT|CANCELLATION/.test(n));
    const destinations=semanticDestinations(o);
    const anchors=all.segments.filter(s=>(pricing&&money(s.text))||(account&&destinations.some(d=>inside(s,d)))||(wanted.includes('SERVICE_SIZE_100K_PLUS')&&/\p{N}/u.test(s.text)));
    const make=(presentations,complete=false)=>{
        const rows=all.segments.filter(s=>presentations.some(p=>inside(s,p)));
        const hasMoney=rows.some(s=>money(s.text)),hasDestinations=destinations.some(d=>presentations.some(p=>inside(d,p)));
        const routed=objective.kind==='PRICE'&&hasMoney?[...new Set([...wanted,'SERVICE_IDENTITY','PRICE_AMOUNT','CURRENCY','MONTHLY_CADENCE','CONSUMER_SUBSCRIPTION','TARGET_MARKET'])]:wanted;
        const relevant=routed.filter(n=>complete||n==='SERVICE_IDENTITY'||/ACCOUNT|MANAGEMENT|CANCELLATION/.test(n)&&hasDestinations||/SIZE/.test(n)&&rows.some(s=>/\p{N}/u.test(s.text))||/PRICE|CURRENCY|CADENCE|SUBSCRIPTION|MARKET/.test(n)&&hasMoney);
        if(!relevant.length)return null;
        const presentationIds=presentations.map(p=>p.id),unit={presentationIds,identitySpans,needs:relevant};
        unit.id=digest({observation:o.id,sha256:o.sha256,...unit});
        try {materialForUnit(o,unit);return unit;}catch{return null;}
    };
    // A genuinely small complete presentation needs no arbitrary slicing.
    const whole=make(all.presentations,true);
    if(whole&&wanted.length)return {units:[whole],capacityHit:false,reason:'SMALL_COMPLETE_PRESENTATION'};
    const candidates=[];let oversized=0;
    for(const anchor of anchors) {
        // Largest fitting ancestor preserves headings, temporal context and qualifiers.
        const enclosing=all.presentations.filter(p=>inside(anchor,p)).sort((a,b)=>(b.end-b.start)-(a.end-a.start));
        let found=false;
        for(const parent of enclosing) {
            const members=all.presentations.filter(p=>inside(p,parent));
            const unit=make(members);if(unit){candidates.push({unit,parent});found=true;break;}
        }
        if(!found)oversized++;
    }
    const unique=[...new Map(candidates.map(c=>[c.unit.id,c])).values()].sort((a,b)=>a.parent.start-b.parent.start);
    const chosen=[];
    for(const c of unique)if(!chosen.some(old=>inside(c.parent,old.parent)))chosen.push(c);
    return {units:chosen.slice(0,semanticUnitLimits.units).map(c=>c.unit),capacityHit:oversized>0||chosen.length>semanticUnitLimits.units,reason:oversized?'INDIVISIBLE_PRESENTATION_BOUND':chosen.length>semanticUnitLimits.units?'UNIT_COUNT_BOUND':'LOCAL_STRUCTURAL_CANDIDATES'};
}

export const selectSemanticUnits=(o,objective,needs)=>selectSemanticPlan(o,objective,needs).units;
