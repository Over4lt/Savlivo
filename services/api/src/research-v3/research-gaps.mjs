// Research diagnostics only. No admission/truth module consumes hypotheses.
import {digest,canonical} from './model.mjs';
import {semanticMaterial} from './source.mjs';
import {evidenceTargets,retainedTargetMaterial,actionTargets} from './evidence-targets.mjs';
import {parseDataLiteral} from './embedded-state.mjs';
export const gapLimits=Object.freeze({gaps:192,objects:32,findings:32,questions:6,history:24,characters:4096});
const questions=Object.freeze({
 MONETARY_REPRESENTATION:'subscription purchase displayed consumer price currency amount units',
 MONETARY_SCALE:'subscription price amount formatting decimal units',
 PRICE_ROLE:'subscription ordinary recurring price trial then renewal',
 TAX_ROLE:'subscription consumer price tax included billing total',
 BILLING_CADENCE:'subscription billing payment renewal frequency terms',
 MARKET:'subscription availability country market billing',
 OFFERING_RELATIONSHIP:'subscription product plan catalog purchase',
 CATALOG_SCOPE:'all subscription offerings catalog comparison choices',
 CURRENCY:'subscription price currency billing',
 SOURCE:'official subscription pricing catalog'
});
const types={PRICE_AMOUNT:'MONETARY_REPRESENTATION',CURRENCY:'CURRENCY',MONTHLY_CADENCE:'BILLING_CADENCE',MONTHLY_SUBSCRIPTION:'BILLING_CADENCE',TARGET_MARKET:'MARKET',CONSUMER_SUBSCRIPTION:'OFFERING_RELATIONSHIP',SERVICE_IDENTITY:'OFFERING_RELATIONSHIP'};
function recordSignals(raw){
 const value=parseDataLiteral(raw);let count=0,integerMoney=false,tax=false,temporal=false;
 const visit=v=>{if(++count>512||!v||typeof v!=='object')return;
  const pairs=Object.entries(v);const currency=pairs.some(([k,x])=>/currency/i.test(k)&&typeof x==='string');
  if(currency&&pairs.some(([k,x])=>/amount|price|cost/i.test(k)&&typeof x==='string'&&/^\d+$/.test(x)))integerMoney=true;
  tax ||= pairs.some(([k])=>/tax/i.test(k));temporal ||= pairs.some(([k])=>/trial|intro|incentive/i.test(k));
  for(const [,x]of pairs)if(x&&typeof x==='object')visit(x);
 };visit(value);return {integerMoney,tax,temporal,representationParsed:!!value};
}
export function diagnoseGaps(k,truth) {
 const gaps=[],seen=new Set();let limited=false;
 const add=(type,affected,market,propositions,support,reason,dependencies=[])=>{
  const id=digest([type,affected,market]);if(seen.has(id))return;seen.add(id);
  if(gaps.length>=gapLimits.gaps){limited=true;if(['CATALOG_SCOPE','MODEL_ASSISTANCE_UNAVAILABLE','ACCESS_BLOCKED'].includes(type))gaps.pop();else return;}
  const hypothesis=type==='MONETARY_SCALE'?['Raw amount may be major units','Raw amount may use another source-defined unit']:type==='TAX_ROLE'?['An amount may be a base charge','Another amount may be a consumer total']:[];
  gaps.push({id,type,affected,market,propositions,support,reason,missingEvidence:questions[type]??'Source-bound interpretation or accessible authoritative evidence',hypotheses:hypothesis.map(description=>({description,truthAuthority:'NONE'})),dependencies,reviewedSupport:support.flatMap(s=>(k.gapReviews??[]).flatMap(r=>(r.findings??[]).filter(f=>f.observation===s.observation).map(f=>({action:r.action,observation:f.observation,start:f.start,end:f.end})))).slice(0,8),attempted:(k.attempts??[]).filter(a=>a.action.gapIds?.includes(id)).slice(-gapLimits.history).map(a=>({id:a.id,status:a.status})),truthAuthority:'NONE'});
 };
 for(const offer of truth.offers??[])for(const [p,v]of Object.entries(offer.propositions??{}))if(v.state!=='ESTABLISHED'&&!(p==='MONTHLY_CADENCE'&&Object.values(truth.prices??{}).some(price=>price.established&&price.id===offer.id)))add(types[p]??p,offer.id,offer.market,[p],(v.evidence?.length?v.evidence:Object.values(offer.propositions).flatMap(p=>p.evidence??[])).map(e=>e.reference??e),'Deterministic proposition '+v.state+'; seek sufficient source-bound support');
 const candidates=(k.catalog?.offerings??[]).filter(c=>{if(c.classification!=='CANDIDATE_ONLY')return false;const o=k.observations.find(o=>o.id===c.observation);return ![o?.evidence,...(o?.evidenceFragments??[])].some(e=>e?.unit?.id===c.unit&&e.envelope?.offers?.length);});
 const grouped=new Map();for(const c of candidates){const key=canonical([c.sha256,c.source]);if(!grouped.has(key))grouped.set(key,c);}
 if(grouped.size>gapLimits.objects)limited=true;
 for(const c of [...grouped.values()].slice(0,gapLimits.objects)){
  const o=k.observations.find(o=>o.id===c.observation);if(!o)continue;
  const support=[{observation:o.id,sha256:o.sha256,...c.source,structuralPath:c.structuralPath}],market=k.objective.markets.length===1?k.objective.markets[0]:null;
  const s=recordSignals(o.body.slice(c.source.start,c.source.end));
  for(const [type,props]of [['OFFERING_RELATIONSHIP',['SERVICE_IDENTITY','CONSUMER_SUBSCRIPTION']],['MONETARY_REPRESENTATION',['PRICE_AMOUNT','CURRENCY']],['BILLING_CADENCE',['MONTHLY_CADENCE','MONTHLY_SUBSCRIPTION']],['MARKET',['TARGET_MARKET']]])add(type,c.id,market,props,support,'Preserved candidate container is not yet admissible interpreted offering evidence',k.semanticUnavailable?['MODEL_ASSISTANCE_UNAVAILABLE']:[]);
  if(s.integerMoney)add('MONETARY_SCALE',c.id,market,['PRICE_AMOUNT'],support,'Integer monetary-looking source values have no admitted unit relationship');
  if(s.tax)add('TAX_ROLE',c.id,market,['PRICE_AMOUNT'],support,'Several monetary/tax representations need a source-established consumer charge relationship');
  if(s.temporal)add('PRICE_ROLE',c.id,market,['PRICE_AMOUNT'],support,'Intro/incentive and ordinary charge relationships need interpretation');
 }
 // Retained text can motivate research before offer evidence is admitted. These
 // clues never enter payment admission, market truth or catalog completeness.
 const material=k.observations.filter(o=>o.outcome==='OK').slice(-gapLimits.objects).map(o=>({o,...retainedTargetMaterial(o)}));
 for(const {o,fragments} of material)for(const f of fragments.slice(0,4)){
  const support=[{observation:o.id,sha256:o.sha256,start:f.start,end:f.end}],affected='source-clue-'+digest([o.url,f.textHash]),market=k.objective.markets.length===1?k.objective.markets[0]:null;
  if(f.signals.subscription||f.signals.cadence)add('BILLING_CADENCE',affected,market,['MONTHLY_SUBSCRIPTION'],support,'Retained subscription/cadence material requires actual payment and availability discrimination');
  if(f.signals.money)add('MONETARY_REPRESENTATION',affected,market,['PRICE_AMOUNT','CURRENCY'],support,'Retained monetary presentation needs offering and charge-role binding');
  if(f.signals.temporal)add('PRICE_ROLE',affected,market,['PRICE_AMOUNT'],support,'Retained temporal presentation needs separate initial and ordinary charges');
 }
 if(!candidates.length&&!truth.offers?.length)for(const n of truth.needs??[])add(k.observations.some(o=>o.outcome==='OK')?types[n.proposition]??'SOURCE':'SOURCE',n.id,n.market,[n.proposition],[],'No sufficient authoritative offering evidence');
 if(k.catalog?.state!=='CATALOG_EXHAUSTED'&&k.objective.kind==='PRICE')add('CATALOG_SCOPE','SERVICE_CATALOG',null,[],k.catalog?.scopeEvidence??[],'Provider-bounded relevant catalog scope remains unresolved');
 if(k.semanticUnavailable)add('MODEL_ASSISTANCE_UNAVAILABLE','SEMANTIC_ASSISTANCE',null,[],[],'Optional semantic assistance unavailable; independent paths remain valid');
 if(k.policyBlocks?.length)add('ACCESS_BLOCKED','AUTHORITY_FRONTIER',null,[],k.policyBlocks.slice(0,8),'Existing policy/authority prevents inspection; no authority expansion');
 return {version:2,candidateDriven:candidates.length>0,targetDriven:gaps.some(g=>g.support.length&&questions[g.type]),targets:evidenceTargets(gaps,k.attempts),fingerprints:material.map(m=>m.fingerprint).filter(Boolean),truthAuthority:'NONE',gaps,limited,capacity:gapLimits,established:truth.offers?.flatMap(o=>Object.entries(o.propositions).filter(([,p])=>p.state==='ESTABLISHED').map(([p])=>({offering:o.id,proposition:p}))).slice(0,gapLimits.gaps)??[]};
}
export function gapQueries(objective,market,needs,k){
 if(!k?.gapState?.targetDriven&&!k?.gapState?.candidateDriven&&!k?.gapState?.gaps.some(g=>g.support.length&&questions[g.type]))return [];
 const types=[...new Set(k.gapState.gaps.filter(g=>questions[g.type]&&(g.market===null||g.market===market)).map(g=>g.type))];
 // Specific diagnoses beat a generic catalog question, but remain hypotheses.
 const priority=t=>{const i=['MONETARY_SCALE','TAX_ROLE','PRICE_ROLE','BILLING_CADENCE','MONETARY_REPRESENTATION','CATALOG_SCOPE'].indexOf(t);return i<0?99:i;};
 types.sort((a,b)=>priority(a)-priority(b));
 const scope=objective.providerHosts.map(h=>'site:'+h).join(' OR ');
 return types.slice(0,gapLimits.questions).map(type=>({kind:'DISCOVER',market,needs,family:'gap-'+type,query:[objective.serviceName,market,questions[type],'('+scope+')'].filter(Boolean).join(' ').slice(0,1000),reason:'Seek discriminating source evidence for '+type,value:8,gapIds:k.gapState.gaps.filter(g=>g.type===type).map(g=>g.id).slice(0,gapLimits.gaps),gapType:type,targetIds:(k.gapState.targets??[]).filter(t=>t.gapIds.some(id=>k.gapState.gaps.some(g=>g.id===id&&g.type===type))).map(t=>t.id),strategist:{question:questions[type],reviewedSources:(k.gapReviews??[]).slice(-8).map(r=>r.action),truthAuthority:'NONE'}}));
}
export function gapInspectionActions(k,needs){
 const used=new Set((k.attempts??[]).filter(a=>a.action.inspection==='GAP_SOURCE').map(a=>a.action.bodySha256));
 const sources=[...new Set((k.gapState?.gaps??[]).flatMap(g=>g.support.map(s=>s.observation).filter(Boolean)))];
 return sources.slice(0,gapLimits.objects).flatMap(id=>{const o=k.observations.find(o=>o.id===id);if(!o||used.has(o.sha256)||!semanticMaterial(o).presentations.some(p=>p.embedded))return [];used.add(o.sha256);return [{kind:'INSPECT',inspection:'GAP_SOURCE',observation:id,bodySha256:o.sha256,url:o.url,needs,value:45,reason:'Inspect retained offering structure for discriminating representations before another network request',gapIds:k.gapState.gaps.filter(g=>g.support.some(s=>s.observation===id)).map(g=>g.id)}];});
}
export function inspectGapSource(o){
 const m=semanticMaterial(o),findings=[],formattedFragments=[];
 for(const s of m.segments){if(formattedFragments.length>=gapLimits.findings)break;if(s.text.length<=512&&/\p{Sc}\s*\p{N}|\p{N}[^\n]{0,12}\p{Sc}|\b[A-Z]{3}\s*\p{N}/u.test(s.text))formattedFragments.push({observation:o.id,sha256:o.sha256,start:s.start,end:s.end,truthAuthority:'NONE'});}
 for(const p of m.presentations.filter(p=>p.tag==='script-data').slice(0,gapLimits.objects)){
  if(p.end-p.start>gapLimits.characters)continue;
  findings.push({observation:o.id,sha256:o.sha256,start:p.start,end:p.end,structuralPath:p.structuredPath??null,...recordSignals(o.body.slice(p.start,p.end)),truthAuthority:'NONE'});
 }
 return {findings:findings.slice(0,gapLimits.findings),formattedFragments,limited:m.limited||m.structuredLimited||findings.length>=gapLimits.findings,interpretation:'RESEARCH_CLUES_ONLY',truthAuthority:'NONE'};
}
export function gapActionValue(action,gapState,resource){
 const matched=actionTargets(action,gapState,resource),gaps=gapState?.gaps??[];
 const supported=matched.filter(t=>t.support.length),discriminating=supported.some(t=>t.discriminates);
 // A source review only repeats diagnostic booleans. Its availability is useful,
 // but it cannot claim the information gain of new interpreted evidence.
 const review=action.inspection==='GAP_SOURCE';
 const peripheral=resource?.affinity?.peripheral;
 const billing=supported.some(t=>['ACTUAL_PAYMENT_TERMS','ORDINARY_CHARGE_RELATIONSHIP','CONSUMER_TAX_RELATIONSHIP'].includes(t.kind));
 const sourceFamily=!peripheral&&billing&&/billing|payment|checkout|purchase|support|help/i.test([resource?.role??'',action.url??''].join(' '))?65:0;
 const information=review?0:action.gapType?(supported.length?140:90):matched.length&&action.kind==='ACQUIRE'?Math.min(120,60+new Set(matched.map(t=>t.kind)).size*10)+(discriminating?20:0):matched.length?40:0;
 const redundant=review?-120:resource?.role==='LOCALE'&&gaps.some(g=>['MONETARY_SCALE','TAX_ROLE','BILLING_CADENCE'].includes(g.type))?-55:0;
 return {information,sourceFamily,redundancy:redundant,covers:[...new Set(matched.flatMap(t=>t.gapIds))],targets:matched.map(t=>t.id),expectations:[...new Map(matched.map(t=>[t.kind,t])).values()].slice(0,10).map(t=>({target:t.id,affected:t.affected,propositions:t.propositions,observation:t.expectedObservation,binding:t.binding,discriminates:t.discriminates,routing:t.actionBindingPotential,reason:t.actionBindingPotential.basis}))};
}
export function gapTermination(k,evaluated){
 const blocked=evaluated.filter(r=>r.reason==='CAPACITY_BOUND_REACHED');
 if(blocked.length)return {kind:'CAPACITY',remainingActions:blocked.map(r=>r.action.id).slice(0,64)};
 if(evaluated.some(r=>['PROVIDER_ACCESS_POLICY','UNGROUNDED_DESTINATION'].includes(r.reason))||k.gapState?.gaps.some(g=>g.type==='ACCESS_BLOCKED'))return {kind:'ACCESS'};
 if(evaluated.some(r=>r.reason==='CAPABILITY_NOT_PERMITTED_OR_AVAILABLE'))return {kind:'CAPABILITY',missing:[...new Set(evaluated.filter(r=>r.reason==='CAPABILITY_NOT_PERMITTED_OR_AVAILABLE').map(r=>r.action.kind))]};
 return {kind:'SCOPED_UNRESOLVED',modelAssistance:k.semanticUnavailable?'UNAVAILABLE':'AVAILABLE_OR_NOT_NEEDED',remainingEvidenceClasses:[...new Set((k.gapState?.gaps??[]).map(g=>g.type))],universalExhaustion:false};
}
