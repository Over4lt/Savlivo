// Research-only state. Never imported by truth, projection, or evidence admission.
import {digest,canonical} from './model.mjs';
export const workingCapacity=Object.freeze({resources:128,families:128,hypotheses:256,variants:256,history:64,decisions:128,provenance:8,advice:64,adviceResults:24,advisoryCalls:4});
function provenance(p){return {kind:p?.kind??'UNKNOWN',observation:p?.observation??p?.source?.observation??null,action:p?.action??null,...(p?.source?{source:{start:p.source.start,end:p.source.end,sha256:p.source.sha256,bodySha256:p.source.bodySha256}}:{}),...(typeof p?.pointer==='string'?{pointer:p.pointer.slice(0,2048)}:{})};}
const roles=new Set(['PRICING','PRODUCT','SUPPORT','ACCOUNT','CONTENT','LOCALE','STATE','UNKNOWN']);
export function researchRole(d) {
 const supplied=d.discovery?.research?.role;
 if(roles.has(supplied))return supplied;
 if(d.discovery?.state)return 'STATE';
 if(d.discovery?.kind==='ALTERNATE'||d.discovery?.locale)return 'LOCALE';
 return 'UNKNOWN';
}
export function buildWorkingModel(k,truth,previous=k.workingModel) {
 const resources=k.destinations.slice(0,workingCapacity.resources).map(d=>{
  const history=(k.attempts??[]).filter(a=>a.action.url===d.url),observations=k.observations.filter(o=>o.url===d.url);
  const progress=k.trace.filter(t=>t.event==='OBSERVATION'&&t.observation?.url===d.url).flatMap(t=>t.changes??[]).filter(p=>p.to?.state==='ESTABLISHED');
  const role=researchRole(d),family=d.discovery?.state?.group??d.discovery?.family??new URL(d.url).origin+new URL(d.url).pathname;
  const information=observations.some(o=>(o.candidates??[]).some(c=>c.kind==='OFFER')||o.evidence?.envelope?.offers?.length)?'PRICING_SURFACE_OBSERVED':observations.some(o=>o.outcome==='OK')?'SOURCE_OBSERVED':'UNOBSERVED';
  return {id:digest(d.url),destination:d.url,family,role,authority:'REVIEWED_NAVIGATION_BOUNDARY',needs:truth.needs.filter(n=>(d.needs??[]).includes(n.proposition)).map(n=>n.id),provenance:(d.provenance??[d.grounding]).slice(0,workingCapacity.provenance).map(provenance),history:history.slice(-8).map(a=>({id:a.id,context:a.action.context,status:a.status,failure:a.failure?{code:a.failure.code,stage:a.failure.stage,kind:a.failure.kind}:null})),observations:observations.map(o=>({id:o.id,sha256:o.sha256,context:o.context,outcome:o.outcome})).slice(-8),learned:information,progress:progress.map(p=>p.id),state:d.discovery?.state??null};
 });
 const families=[...new Set(resources.map(r=>r.family))].slice(0,workingCapacity.families).map(id=>({id,members:resources.filter(r=>r.family===id).map(r=>r.id),attempted:resources.filter(r=>r.family===id&&(r.history.length||r.observations.length)).length,alternatives:resources.filter(r=>r.family===id&&!r.history.length).map(r=>r.id),yield:resources.filter(r=>r.family===id).flatMap(r=>r.progress).filter(p=>p.includes(':')||p==='SERVICE_IDENTITY').length,unproductive:resources.filter(r=>r.family===id&&(r.history.length||r.observations.length)&&!r.progress.length).length}));
 const hypotheses=resources.map(r=>({id:'hypothesis-'+r.id,resource:r.id,kind:r.state?'ALTERNATIVE_PROVIDER_STATE':r.role==='UNKNOWN'?'UNCLASSIFIED_RESOURCE':'LIKELY_'+r.role,status:r.history.some(h=>h.status==='FAILED')?'ATTEMPT_FAILED':r.learned==='UNOBSERVED'?'UNTESTED':r.progress.length?'INFORMATION_GAINED':'UNCERTAINTY_REMAINS',provenance:r.provenance,truthAuthority:'NONE'})).slice(0,workingCapacity.hypotheses);
 const signature=digest({needs:truth.needs,resources:resources.map(r=>({id:r.id,history:r.history,progress:r.progress,learned:r.learned}))});
 const history=[...(previous?.history??[])];
 if(history.at(-1)?.signature!==signature)history.push({signature,actions:k.usage?.actions??0,needs:truth.needs.map(n=>n.id),observations:k.observations.length,failedAttempts:(k.attempts??[]).filter(a=>a.status==='FAILED').length});
 return {version:1,truthAuthority:'NONE',objective:{kind:k.objective?.kind??'PRICE',service:k.objective?.serviceName??null,unresolved:truth.needs.map(n=>({id:n.id,proposition:n.proposition,state:n.state})),eligibility:Object.fromEntries(Object.entries(truth.eligibility??{}).map(([market,e])=>[market,{state:e.state,result:e.result,conflicting:e.conflicting}]))},resources,families,hypotheses,variants:resources.filter(r=>r.state).map(r=>({resource:r.id,...r.state})).slice(0,workingCapacity.variants),history:history.slice(-workingCapacity.history),decisions:(previous?.decisions??[]).slice(-workingCapacity.decisions),capacity:workingCapacity};
}
export function rankResearchActions(state,{initialPerspective='AUTO'}={}) {
 const wm=state.workingModel??buildWorkingModel({...state,trace:state.trace??[]},state.truth);
 return state.actions.map(action=>{
  const r=wm.resources.find(r=>r.destination===action.url),family=wm.families.find(f=>f.id===r?.family);
  const factors={base:action.kind==='ACQUIRE'?30:10,unresolved:Math.min(14,(action.needs??state.truth.needs).length*2),discovery:Math.min(30,(state.destinations.find(d=>d.url===action.url)?.discovery?.score??0)*1.5),novelty:r&&!r.history.some(h=>canonical(h.context)===canonical(action.context))?30:0,familySaturation:-(family?.attempted??0)*18,role:0,state:0,sourceRelation:0,objectiveDeficit:0,informationYield:0,geography:0,cost:action.kind==='ACQUIRE'?-3:-6};
  if(r?.role==='PRICING')factors.role=45;
  if(r?.role==='PRODUCT')factors.role=15;
  if(['SUPPORT','ACCOUNT'].includes(r?.role)&&state.objective?.kind==='PRICE')factors.role=-30;
  if(r?.role==='LOCALE')factors.role=-12;
  if(r?.state)factors.state=r.state.selected?8:35;
  const destination=state.destinations.find(d=>d.url===action.url),discovery=destination?.discovery;
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
  if(discovery?.kind==='GET_FORM'||r?.state)factors.objectiveDeficit=paymentMissing?35:priceMissing?15:0;
  if(discovery?.kind==='CANONICAL'&&sourceResources.some(x=>x.learned==='PRICING_SURFACE_OBSERVED'))factors.sourceRelation+=12;
  // Learned information yield, rather than a blanket legal/help ban. A family
  // with useful evidence keeps value; repeated zero-yield siblings lose it.
  const noYield=family?.unproductive??0;
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
  const value=Object.values(factors).reduce((a,b)=>a+b,0);
  return {actionId:action.id,value,factors,resource:r?.id??null,family:r?.family??null,needs:action.needs,expectedInformation:action.kind==='DISCOVER'?'New authoritative destinations':r?.state?'Discriminate source-exposed provider state':'Resolve '+(action.needs??state.truth.needs.map(n=>n.proposition)).join(', '),support:r?.provenance??[],reason:'Objective deficits, source-local transitions, observed family information yield, novelty and verified acquisition context'};
 }).sort((a,b)=>b.value-a.value||a.actionId.localeCompare(b.actionId));
}
export function workingDecision(wm,ranked,selected,budgets) {
 const record={selected,considered:ranked.slice(0,64),deferred:ranked.slice(64).map(r=>r.actionId).slice(0,64),budgets:structuredClone(budgets),unresolved:wm.objective.unresolved};
 wm.decisions.push(record);wm.decisions=wm.decisions.slice(-workingCapacity.decisions);return record;
}
