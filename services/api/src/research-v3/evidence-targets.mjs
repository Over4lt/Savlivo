// Research routing only. Never a source of admitted evidence or truth.
import {digest,canonical} from './model.mjs';
import {semanticMaterial} from './source.mjs';
import {paymentLanguages,conceptMatches} from './payment-language-concepts.mjs';
export const targetLimits=Object.freeze({targets:192,observations:32,fragments:32,characters:4096});
const has=(text,concept)=>paymentLanguages.some(l=>conceptMatches(text,l,concept).length>0);
const monetary=text=>/\p{Sc}\s*\p{N}|\p{N}[\p{N}.,\s]*\p{Sc}|\b[A-Z]{3}\s*\p{N}|\p{N}[\p{N}.,\s]*\s*[A-Z]{3}\b/u.test(text);
export function targetTextSignals(text){
 const subscription=has(text,'subscription'),cadence=has(text,'month')||has(text,'year'),payment=has(text,'pay'),money=monetary(text);
 return {subscription,cadence,payment,money,temporal:has(text,'then')||has(text,'trial')||has(text,'initial'),effective:has(text,'effective'),relevant:subscription&&(cadence||payment||money)||money&&(cadence||payment),truthAuthority:'NONE'};
}
export function targetMaterialValue(text){const s=targetTextSignals(text);return s.relevant?(s.subscription?8:0)+(s.money?8:0)+(s.cadence?6:0)+(s.payment?6:0)+(s.temporal?4:0):0;}
const cache=new WeakMap();
export function retainedTargetMaterial(o){
 if(!o||o.kind!=='PROVIDER'||o.outcome!=='OK'||o.truncated||!o.body)return {fragments:[],fingerprint:null};
 const old=cache.get(o);if(old?.sha256===o.sha256&&old.body===o.body)return old.result;
 if(o.sha256!==digest(o.body))return {fragments:[],fingerprint:null};
 const fragments=[];const material=semanticMaterial(o);
 for(const s of material.segments){
  if(s.text.length>targetLimits.characters)continue;
  const signals=targetTextSignals(s.text);if(!signals.relevant)continue;
  fragments.push({observation:o.id,sha256:o.sha256,start:s.start,end:s.end,signals,textHash:digest(s.text.normalize('NFKC').replace(/\s+/g,' ').trim()),truthAuthority:'NONE'});
  if(fragments.length>=targetLimits.fragments)break;
 }
 // Price and cadence are often separate text nodes. A bounded provider
 // presentation is a research context, never permission to compose truth.
 for(const p of material.presentations){
  if(fragments.length>=targetLimits.fragments)break;
  if(p.tag==='script-data'||p.end-p.start>targetLimits.characters)continue;
  const rows=material.segments.filter(s=>s.start>=p.start&&s.end<=p.end);
  if(rows.length<2)continue;
  const text=rows.map(s=>s.text).join(' ');if(text.length>targetLimits.characters)continue;
  const signals=targetTextSignals(text);if(!signals.relevant||!signals.money||!signals.cadence)continue;
  if(fragments.some(f=>f.start>=p.start&&f.end<=p.end))continue;
  fragments.push({observation:o.id,sha256:o.sha256,start:p.start,end:p.end,presentation:p.id,signals,textHash:digest(text.normalize('NFKC').replace(/\s+/g,' ').trim()),truthAuthority:'NONE'});
 }
 const result={fragments,fingerprint:fragments.length?digest([...new Set(fragments.map(f=>f.textHash))].sort()):null,limited:material.limited||fragments.length>=targetLimits.fragments};
 cache.set(o,{sha256:o.sha256,body:o.body,result});return result;
}
const contracts=Object.freeze({
 MONETARY_SCALE:['SOURCE_MONETARY_UNITS','Provider-formatted currency amount or explicit unit relationship for the same offering and raw monetary value','Same offering, currency and monetary value; explicit source relationship before conversion'],
 MONETARY_REPRESENTATION:['CONSUMER_CHARGE_PRESENTATION','Provider presentation binding an offering to a currency amount and charge role','Same offering; distinguish base, total, equivalent and introductory amounts'],
 TAX_ROLE:['CONSUMER_TAX_RELATIONSHIP','Provider statement relating base, tax and consumer charge for the same offering','Same offering and charge; no tax arithmetic or total-field preference'],
 PRICE_ROLE:['ORDINARY_CHARGE_RELATIONSHIP','Provider relationship between introductory/trial charge and subsequent ordinary recurring charge','Same offering and temporal sequence; preserve separate monetary roles'],
 BILLING_CADENCE:['ACTUAL_PAYMENT_TERMS','Explicit payment/renewal cadence distinguishing actual billing from displayed equivalents','Same offering; payment cadence independent of display cadence and commitment'],
 MARKET:['MARKET_APPLICABILITY','Explicit provider market applicability for the offering or bounded catalog','Source-established market; language, currency, URL and proxy are insufficient'],
 CURRENCY:['SOURCE_CURRENCY_RELATIONSHIP','Explicit currency representation bound to the offering charge','Same offering and amount; no geography-based currency inference'],
 OFFERING_RELATIONSHIP:['OFFERING_IDENTITY','Provider subscription/product relationship identifying the relevant offering','Same source container or explicit cross-resource offering relationship'],
 CATALOG_SCOPE:['BOUNDED_SUBSCRIPTION_CHOICES','Provider-established relevant subscription choice boundary and additional offering availability','Defined service/market scope; an annual observation or collection end is not exhaustion'],
 SOURCE:['AUTHORITATIVE_OFFERING_SOURCE','Relevant provider subscription/catalog observation','Existing reviewed authority policy must authorize acquisition']
});
export function evidenceTargets(gaps,attempts=[]){return gaps.filter(g=>contracts[g.type]).slice(0,targetLimits.targets).map(g=>{
 const [kind,expectedObservation,binding]=contracts[g.type],id=digest(['evidence-target',g.id,kind]);
 return {id,kind,gapIds:[g.id],affected:g.affected,market:g.market,propositions:g.propositions,support:g.support,reason:g.reason,expectedObservation,binding,hypotheses:g.hypotheses,discriminates:g.hypotheses.length>1,status:'ACTIVE',attempted:attempts.filter(a=>a.action.targetIds?.includes(id)||a.action.gapIds?.includes(g.id)).slice(-24).map(a=>({action:a.id,status:a.status})),truthAuthority:'NONE'};
});}
export function actionTargets(action,gapState,resource){
 const text=[action.url??'',resource?.role??'',resource?.label??''].join(' ');
 const peripheral=resource?.affinity?.peripheral===true;
 const pricing=resource?.affinity?.catalog===true||resource?.role==='PRICING';
 const billing=resource?.affinity?.billing===true||/billing|payment|checkout|purchase|renewal/i.test(text);
 return (gapState?.targets??[]).flatMap(t=>{
  let basis=null,sourceLink=null;
  if(action.targetIds?.includes(t.id)||action.gapIds?.some(id=>t.gapIds.includes(id)))basis='EXPLICIT_TARGETED_ACTION';
  else if(action.kind==='INSPECT'&&t.support.some(s=>s.observation===action.observation))basis='RETAINED_SOURCE_SUPPORT';
  else if(action.kind==='ACQUIRE'&&!peripheral&&resource?.discoveryKind!=='PROVIDER_ENDPOINT'&&!(t.market&&action.context?.transport==='DECODO'&&t.market!==action.context.networkGeography)){
   if(['CONTENT','BODY','FORM'].includes(resource?.sourceContext))sourceLink=(resource.provenance??[]).find(p=>t.support.some(s=>s.observation===p.observation&&p.source&&Number.isFinite(s.start??s.source?.start)&&Math.abs(p.source.start-(s.start??s.source.start))<=targetLimits.characters));
   if(sourceLink)basis='SOURCE_LOCAL_NAVIGATION';
   else if(pricing)basis='PROVIDER_CATALOG_RESEARCH_HINT';
   else if(billing&&['ACTUAL_PAYMENT_TERMS','ORDINARY_CHARGE_RELATIONSHIP','CONSUMER_TAX_RELATIONSHIP','CONSUMER_CHARGE_PRESENTATION','BOUNDED_SUBSCRIPTION_CHOICES'].includes(t.kind))basis='PROVIDER_BILLING_RESEARCH_HINT';
  }
  return basis?[{...t,actionBindingPotential:{basis,sourceLink:sourceLink??null,truthAuthority:'NONE'}}]:[];
 }).slice(0,targetLimits.targets);
}
export function targetOutcome(before,after,observations,priorObservations,truthBefore,truthAfter,action,rank){
 const refs=observations.filter(o=>!priorObservations.has(o.id)).map(o=>({observation:o.id,sha256:o.sha256,url:o.url,context:o.context,...retainedTargetMaterial(o)}));
 const priorFingerprints=new Set(before.fingerprints??[]);
 const novelty=refs.filter(r=>r.fingerprint&&!priorFingerprints.has(r.fingerprint));
 const flat=t=>Object.fromEntries((t.offers??[]).flatMap(o=>Object.entries(o.propositions).map(([p,v])=>[o.id+':'+p,{state:v.state,value:v.value}])));
 const a=flat(truthBefore),b=flat(truthAfter),propositionChanges=Object.entries(b).filter(([id,v])=>canonical(a[id])!==canonical(v)).map(([id,to])=>({id,from:a[id]??null,to}));
 const next=new Set((after.targets??[]).map(t=>t.id));
 return {action:action.id,targetIds:rank?.targetCoverage??[],expected:rank?.targetExpectations??[],observations:refs,resolvedTargets:(before.targets??[]).filter(t=>!next.has(t.id)).map(t=>t.id),propositionChanges,newRelevantRepresentations:novelty.length,informationGain:propositionChanges.some(p=>p.to.state==='ESTABLISHED')?'DETERMINISTIC_PROPOSITION_PROGRESS':novelty.length?'NEW_RELEVANT_SOURCE_MATERIAL':action.kind==='DISCOVER'?'DISCOVERY_FRONTIER_ONLY':'NO_DEMONSTRATED_TARGET_GAIN',meaning:'Material relevance is not evidence admission; target disappearance is not truth',truthAuthority:'NONE'};
}
