// Research-only state. Never imported by truth, projection, or evidence admission.
import {retainedTargetMaterial} from './evidence-targets.mjs';
import {gapActionValue} from './research-gaps.mjs';
import {researchState} from './research-strategist.mjs';
import {digest,canonical} from './model.mjs';
export const workingCapacity=Object.freeze({resources:512,families:256,hypotheses:256,variants:256,history:64,decisions:128,provenance:8,advice:64,adviceResults:24,advisoryCalls:4});
function provenance(p){return {kind:p?.kind??'UNKNOWN',observation:p?.observation??p?.source?.observation??null,action:p?.action??null,...(p?.source?{source:{start:p.source.start,end:p.source.end,sha256:p.source.sha256,bodySha256:p.source.bodySha256}}:{}),...(typeof p?.pointer==='string'?{pointer:p.pointer.slice(0,2048)}:{})};}
const roles=new Set(['PRICING','PRODUCT','SUPPORT','ACCOUNT','CONTENT','LOCALE','STATE','UNKNOWN']);
// Source labels and paths guide research, never authority or truth. Hostname
// matching alone does not distinguish a catalog from arbitrary provider pages.
export function catalogAffinity(d) {
 const text=((d?.discovery?.label??'')+' '+new URL(d.url).pathname).normalize('NFKC');
 const peripheral=/\b(?:news|blog|forum|community|privacy|profile|puzzles?|articles?)\b/i.test(text);
 const catalog=/\b(?:pricing|plans?|subscriptions?|memberships?|premium|catalog|compare)\b/i.test(text);
 const billing=/\b(?:billing|payment|renewal|commitment|cancel)\b/i.test(text);
 return {catalog:catalog&&!peripheral,billing:billing&&!peripheral,peripheral,score:peripheral?-45:catalog?45:billing?25:0,truthAuthority:'NONE'};
}
export function researchRole(d) {
 const supplied=d.discovery?.research?.role;
 if(roles.has(supplied))return supplied;
 if(d.discovery?.state)return 'STATE';
 if(d.discovery?.kind==='ALTERNATE'||d.discovery?.locale)return 'LOCALE';
 return 'UNKNOWN';
}
export function buildWorkingModel(k,truth,previous=k.workingModel) {
 const strategy=researchState(k);
 const resources=[...k.destinations].sort((a,b)=>(b.discovery?.score??0)-(a.discovery?.score??0)).slice(0,workingCapacity.resources).map(d=>{
  const history=(k.attempts??[]).filter(a=>a.action.url===d.url),observations=k.observations.filter(o=>o.url===d.url||o.requestedUrl===d.url);
  const progress=k.trace.filter(t=>t.event==='OBSERVATION'&&t.observation?.url===d.url).flatMap(t=>t.changes??[]).filter(p=>p.to?.state==='ESTABLISHED');
  const objectiveProgress=k.objective.kind==='PRICE'?progress.filter(p=>!/(?:SERVICE_IDENTITY|TARGET_MARKET)$/.test(p.id)):progress;
  const role=researchRole(d),family=d.discovery?.state?.group??d.discovery?.family??new URL(d.url).origin+new URL(d.url).pathname;
  const information=observations.some(o=>(o.candidates??[]).some(c=>c.kind==='OFFER')||o.evidence?.envelope?.offers?.length)?'PRICING_SURFACE_OBSERVED':observations.some(o=>o.outcome==='OK')?'SOURCE_OBSERVED':'UNOBSERVED';
  const newInformation=k.objective.kind==='PRICE'?information==='PRICING_SURFACE_OBSERVED'||objectiveProgress.length>0:observations.some(o=>strategy.clues.some(c=>c.observation===o.id&&(c.structured||c.clientShell)))||progress.length>0;
  const duplicates=observations.filter(o=>k.observations.some(other=>other.id!==o.id&&other.sha256===o.sha256&&other.outcome==='OK')).length;
  const relevant=observations.map(retainedTargetMaterial),representations=relevant.map(m=>m.fingerprint).filter(Boolean);
  const repeated=observations.filter(o=>{const m=retainedTargetMaterial(o);return m.fingerprint&&k.observations.some(x=>x.id!==o.id&&canonical(x.context)===canonical(o.context)&&retainedTargetMaterial(x).fingerprint===m.fingerprint);}).length;
  return {sourceContext:d.discovery?.signals?.structure??d.discovery?.context??null,discoveryKind:d.discovery?.kind??null,label:d.discovery?.label??'',representations,repeated,affinity:catalogAffinity(d),newInformation,duplicates,id:digest(d.url),destination:d.url,family,role,authority:'REVIEWED_NAVIGATION_BOUNDARY',needs:truth.needs.filter(n=>(d.needs??[]).includes(n.proposition)).map(n=>n.id),provenance:(d.provenance??[d.grounding]).slice(0,workingCapacity.provenance).map(provenance),history:history.slice(-8).map(a=>({id:a.id,context:a.action.context,status:a.status,failure:a.failure?{code:a.failure.code,stage:a.failure.stage,kind:a.failure.kind}:null})),observations:observations.map(o=>({id:o.id,sha256:o.sha256,context:o.context,outcome:o.outcome})).slice(-8),learned:information,progress:objectiveProgress.map(p=>p.id),state:d.discovery?.state??null};
 });
 const families=[...new Set(resources.map(r=>r.family))].slice(0,workingCapacity.families).map(id=>({id,members:resources.filter(r=>r.family===id).map(r=>r.id),attempted:resources.filter(r=>r.family===id&&(r.history.length||r.observations.length)).length,alternatives:resources.filter(r=>r.family===id&&!r.history.length).map(r=>r.id),yield:resources.filter(r=>r.family===id).flatMap(r=>r.progress).filter(p=>p.includes(':')||p==='SERVICE_IDENTITY').length,unproductive:resources.filter(r=>r.family===id&&(r.history.length||r.observations.length)&&!r.progress.length&&!r.newInformation).length}));
 const hypotheses=resources.map(r=>({id:'hypothesis-'+r.id,resource:r.id,kind:r.state?'ALTERNATIVE_PROVIDER_STATE':r.role==='UNKNOWN'?'UNCLASSIFIED_RESOURCE':'LIKELY_'+r.role,status:r.history.some(h=>h.status==='FAILED')?'ATTEMPT_FAILED':r.learned==='UNOBSERVED'?'UNTESTED':r.progress.length?'INFORMATION_GAINED':'UNCERTAINTY_REMAINS',provenance:r.provenance,truthAuthority:'NONE'})).slice(0,workingCapacity.hypotheses);
 const signature=digest({needs:truth.needs,resources:resources.map(r=>({id:r.id,history:r.history,progress:r.progress,learned:r.learned}))});
 const history=[...(previous?.history??[])];
 if(history.at(-1)?.signature!==signature)history.push({signature,actions:k.usage?.actions??0,needs:truth.needs.map(n=>n.id),observations:k.observations.length,failedAttempts:(k.attempts??[]).filter(a=>a.status==='FAILED').length});
 return {version:3,gaps:k.gapState??null,research:strategy,truthAuthority:'NONE',objective:{kind:k.objective?.kind??'PRICE',service:k.objective?.serviceName??null,unresolved:truth.needs.map(n=>({id:n.id,proposition:n.proposition,state:n.state})),eligibility:Object.fromEntries(Object.entries(truth.eligibility??{}).map(([market,e])=>[market,{state:e.state,result:e.result,conflicting:e.conflicting}]))},resources,families,hypotheses,variants:resources.filter(r=>r.state).map(r=>({resource:r.id,...r.state})).slice(0,workingCapacity.variants),history:history.slice(-workingCapacity.history),decisions:(previous?.decisions??[]).slice(-workingCapacity.decisions),capacity:workingCapacity};
}
export function rankResearchActions(state,{initialPerspective='AUTO'}={}) {
 const wm=state.workingModel??buildWorkingModel({...state,trace:state.trace??[]},state.truth);
 // Count low-yield acquisitions since discovery or a useful pricing surface.
 // Pressure is bounded; it changes the next decision, not execution capacity.
 let lowYield=0;
 for(const a of [...(state.attempts??[])].reverse()) {
  if(a.action.kind==='DISCOVER')break;
  if(a.action.kind!=='ACQUIRE')continue;
  const resource=wm.resources.find(r=>r.destination===a.action.url);
  if(resource?.newInformation)break;
  lowYield++;
  if(lowYield>=4)break;
 }
 return state.actions.map(action=>{
  const r=wm.resources.find(r=>r.destination===action.url),family=wm.families.find(f=>f.id===r?.family);
  const factors={base:action.kind==='INSPECT'?120:action.kind==='ACQUIRE'?30:10,unresolved:Math.min(14,(action.needs??state.truth.needs).length*2),discovery:Math.min(30,(state.destinations.find(d=>d.url===action.url)?.discovery?.score??0)*1.5),novelty:r&&!r.history.some(h=>canonical(h.context)===canonical(action.context))?30:0,familySaturation:-(family?.attempted??0)*18,role:0,state:0,sourceRelation:0,objectiveDeficit:0,informationYield:0,geography:0,cost:action.kind==='ACQUIRE'?-3:-6};
  if(r?.role==='PRICING')factors.role=45;
  if(r?.role==='PRODUCT')factors.role=15;
  if(['SUPPORT','ACCOUNT'].includes(r?.role)&&state.objective?.kind==='PRICE')factors.role=-30;
  if(r?.role==='LOCALE')factors.role=-12;
  if(r?.state)factors.state=r.state.selected?8:35;
  const destination=state.destinations.find(d=>d.url===action.url),discovery=destination?.discovery;
  // Endpoint-shaped strings are weaker than explicit provider navigation;
  // useful-looking endpoint names must not eclipse a source-visible choice.
  factors.catalogRelevance=state.objective?.kind==='PRICE'&&discovery?.kind!=='PROVIDER_ENDPOINT'?(r?.affinity?.score??0):0;
  factors.discoveryPressure=action.kind==='DISCOVER'&&state.objective?.kind==='PRICE'?Math.min(140,lowYield*45):0;
  const unresolved=new Set(state.truth.needs.map(n=>n.proposition));
  const paymentMissing=unresolved.has('MONTHLY_SUBSCRIPTION'),priceMissing=unresolved.has('PRICE_AMOUNT');
  if(r?.role==='SUPPORT'&&paymentMissing)factors.role=10;
  // The observation exposing a link is information available *before* fetching
  // the destination. Content-local transitions out of an observed pricing
  // surface are discriminating alternatives; global menus are weaker signals.
  const origins=(destination?.provenance??[destination?.grounding]).map(p=>p?.observation??p?.source?.observation).filter(Boolean);
  const sourceResources=wm.resources.filter(x=>x.observations.some(o=>origins.includes(o.id)));
  const fromPricing=sourceResources.some(x=>x.learned==='PRICING_SURFACE_OBSERVED');
  const structure=discovery?.signals?.structure??discovery?.context;
  if(['CONTENT','BODY','FORM'].includes(structure))factors.sourceRelation=fromPricing?28:12;
  if(discovery?.kind==='STRUCTURED_NAVIGATION')factors.sourceRelation+=25;
  if(r?.state||discovery?.kind==='GET_FORM'&&(r?.affinity?.catalog||r?.affinity?.billing))factors.objectiveDeficit=paymentMissing?35:priceMissing?15:0;
  if(discovery?.kind==='CANONICAL'&&sourceResources.some(x=>x.learned==='PRICING_SURFACE_OBSERVED'))factors.sourceRelation+=12;
  // Learned information yield, rather than a blanket legal/help ban. A family
  // with useful evidence keeps value; repeated zero-yield siblings lose it.
  const noYield=family?.unproductive??0;
  factors.duplicate=-Math.min(90,(r?.duplicates??0)*12+(r?.repeated??0)*30);
  // A new transport/country remains an independent observation. A known final
  // resource alias in the same context has lower expected novelty, not new trust.
  const equivalents=state.observations.filter(o=>(o.url===action.url||o.requestedUrl===action.url)&&canonical(o.context)===canonical(action.context));
  factors.observedRepresentation=action.kind==='ACQUIRE'&&equivalents.length?-80:0;
  if(discovery?.kind==='PROVIDER_ENDPOINT')factors.sourceRelation+=sourceResources.some(x=>wm.research?.clues.some(c=>x.observations.some(o=>o.id===c.observation)&&c.clientShell))?45:-15;
  factors.informationYield=-Math.min(90,noYield*22)+(family?.yield?Math.min(20,family.yield*4):0);
  if(r?.state&&sourceResources.some(x=>x.learned==='PRICING_SURFACE_OBSERVED'))factors.sourceRelation+=25;
  const intent=state.destinations.find(d=>d.url===action.url)?.discovery?.research?.stateIntent;
  if((action.needs??[]).includes('MONTHLY_SUBSCRIPTION')&&intent==='MONTHLY_PAYMENT')factors.state+=50;
  if((action.needs??[]).includes('MONTHLY_SUBSCRIPTION')&&intent==='NON_MONTHLY_PAYMENT')factors.state-=20;
  // COUNTRY and DIRECT never collapse. Geography value uses unresolved truth,
  // not language, currency, proxy preference, or destination locale.
  if(action.context?.transport==='DECODO')factors.geography=20;
  if(action.context?.transport==='DECODO'&&state.truth.needs.every(n=>n.proposition==='TARGET_MARKET'))factors.geography=70;
  if(!state.observations.length&&initialPerspective==='UNBOUND'&&action.context?.transport==='DIRECT')factors.geography=40;
  if(!state.observations.length&&initialPerspective==='COUNTRY'&&action.context?.transport==='DECODO')factors.geography=50;
  const roleFailures=r?.history.filter(h=>h.status==='FAILED'&&canonical(h.context)===canonical(action.context)).length??0;factors.failure=roleFailures?-20*roleFailures:0;
  const gapValue=gapActionValue(action,wm.gaps,r);factors.gapInformation=gapValue.information;factors.gapSourceFamily=gapValue.sourceFamily;factors.gapRedundancy=gapValue.redundancy;
  const value=Object.values(factors).reduce((a,b)=>a+b,0);
  return {targetCoverage:gapValue.targets,targetExpectations:gapValue.expectations,actionId:action.id,value,factors,gapCoverage:gapValue.covers,resource:r?.id??null,family:r?.family??null,needs:action.needs,expectedInformation:action.strategist?.question??(action.kind==='INSPECT'?'Source-bound interpretation of retained monetary material':action.kind==='DISCOVER'?'New authoritative destinations':r?.state?'Discriminate source-exposed provider state':'Resolve '+(action.needs??state.truth.needs.map(n=>n.proposition)).join(', ')),support:action.strategist?.provenance?[action.strategist.provenance]:r?.provenance??[],reason:'Objective deficits, source-local transitions, observed family information yield, novelty and verified acquisition context'};
 }).sort((a,b)=>b.value-a.value||a.actionId.localeCompare(b.actionId));
}
export function workingDecision(wm,ranked,selected,budgets,snapshot=null) {
 // Complete ranking without duplicating identical contracts for every resource.
 // Set references are content-addressed and reconstructible from this receipt.
 const sets={};const retain=value=>{const key=digest(value);sets[key]=value;return key;};
 const considered=ranked.map(({targetCoverage=[],targetExpectations=[],gapCoverage=[],...r})=>({...r,targetCoverageSet:retain(targetCoverage),targetExpectationsSet:retain(targetExpectations),gapCoverageSet:retain(gapCoverage)}));
 const record={snapshot,selected,selectedRanking:ranked.find(r=>r.actionId===selected)??null,considered,sets,rankingComplete:true,budgets:structuredClone(budgets),unresolved:wm.objective.unresolved,gaps:wm.gaps};
 wm.decisions.push(record);wm.decisions=wm.decisions.slice(-workingCapacity.decisions);return record;
}
