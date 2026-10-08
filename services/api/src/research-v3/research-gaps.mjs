// Research diagnostics only. No admission/truth module consumes hypotheses.
import {digest,canonical} from './model.mjs';
import {semanticMaterial} from './source.mjs';
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
  gaps.push({id,type,affected,market,propositions,support,reason,missingEvidence:questions[type]??'Source-bound interpretation or accessible authoritative evidence',hypotheses:hypothesis.map(description=>({description,truthAuthority:'NONE'})),dependencies,reviewedSupport:support.flatMap(s=>(k.gapReviews??[]).flatMap(r=>r.findings.filter(f=>f.observation===s.observation).map(f=>({action:r.action,observation:f.observation,start:f.start,end:f.end})))).slice(0,8),attempted:(k.attempts??[]).filter(a=>a.action.gapIds?.includes(id)).slice(-gapLimits.history).map(a=>({id:a.id,status:a.status})),truthAuthority:'NONE'});
 };
 for(const offer of truth.offers??[])for(const [p,v]of Object.entries(offer.propositions??{}))if(v.state!=='ESTABLISHED')add(types[p]??p,offer.id,offer.market,[p],v.evidence??[],'Deterministic proposition '+v.state+'; seek sufficient source-bound support');
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
 if(!candidates.length&&!truth.offers?.length)for(const n of truth.needs??[])add(k.observations.some(o=>o.outcome==='OK')?types[n.proposition]??'SOURCE':'SOURCE',n.id,n.market,[n.proposition],[],'No sufficient authoritative offering evidence');
 if(k.catalog?.state!=='CATALOG_EXHAUSTED'&&k.objective.kind==='PRICE')add('CATALOG_SCOPE','SERVICE_CATALOG',null,[],k.catalog?.scopeEvidence??[],'Provider-bounded relevant catalog scope remains unresolved');
 if(k.semanticUnavailable)add('MODEL_ASSISTANCE_UNAVAILABLE','SEMANTIC_ASSISTANCE',null,[],[],'Optional semantic assistance unavailable; independent paths remain valid');
 if(k.policyBlocks?.length)add('ACCESS_BLOCKED','AUTHORITY_FRONTIER',null,[],k.policyBlocks.slice(0,8),'Existing policy/authority prevents inspection; no authority expansion');
 return {version:1,candidateDriven:candidates.length>0,truthAuthority:'NONE',gaps,limited,capacity:gapLimits,established:truth.offers?.flatMap(o=>Object.entries(o.propositions).filter(([,p])=>p.state==='ESTABLISHED').map(([p])=>({offering:o.id,proposition:p}))).slice(0,gapLimits.gaps)??[]};
}
export function gapQueries(objective,market,needs,k){
 if(!k?.gapState?.candidateDriven)return [];
 const types=[...new Set(k.gapState.gaps.filter(g=>questions[g.type]&&(g.market===null||g.market===market)).map(g=>g.type))];
 // Specific diagnoses beat a generic catalog question, but remain hypotheses.
 const priority=t=>{const i=['MONETARY_SCALE','TAX_ROLE','PRICE_ROLE','BILLING_CADENCE','MONETARY_REPRESENTATION','CATALOG_SCOPE'].indexOf(t);return i<0?99:i;};
 types.sort((a,b)=>priority(a)-priority(b));
 const scope=objective.providerHosts.map(h=>'site:'+h).join(' OR ');
 return types.slice(0,gapLimits.questions).map(type=>({kind:'DISCOVER',market,needs,family:'gap-'+type,query:[objective.serviceName,market,questions[type],'('+scope+')'].filter(Boolean).join(' ').slice(0,1000),reason:'Seek discriminating source evidence for '+type,value:8,gapIds:k.gapState.gaps.filter(g=>g.type===type).map(g=>g.id).slice(0,gapLimits.gaps),gapType:type,strategist:{question:questions[type],reviewedSources:(k.gapReviews??[]).slice(-8).map(r=>r.action),truthAuthority:'NONE'}}));
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
 const gaps=gapState?.candidateDriven?gapState.gaps:[],matched=gaps.filter(g=>action.gapIds?.includes(g.id)||action.observation&&g.support.some(s=>s.observation===action.observation));
 if(action.inspection==='GAP_SOURCE')return {information:85,sourceFamily:0,redundancy:0,covers:matched.map(g=>g.id)};
 const text=[resource?.role??'',action.url??''].join(' '),billing=gaps.some(g=>['BILLING_CADENCE','PRICE_ROLE','TAX_ROLE'].includes(g.type));
 const sourceFamily=billing&&/billing|payment|checkout|purchase|support|help|terms/i.test(text)?65:0;
 const redundant=gaps.some(g=>['MONETARY_SCALE','TAX_ROLE','BILLING_CADENCE'].includes(g.type))&&resource?.role==='LOCALE';
 return {information:action.gapType?140:0,sourceFamily,redundancy:redundant?-55:0,covers:matched.map(g=>g.id)};
}
export function gapTermination(k,evaluated){
 const blocked=evaluated.filter(r=>r.reason==='CAPACITY_BOUND_REACHED');
 if(blocked.length)return {kind:'CAPACITY',remainingActions:blocked.map(r=>r.action.id).slice(0,64)};
 if(evaluated.some(r=>['PROVIDER_ACCESS_POLICY','UNGROUNDED_DESTINATION'].includes(r.reason))||k.gapState?.gaps.some(g=>g.type==='ACCESS_BLOCKED'))return {kind:'ACCESS'};
 if(evaluated.some(r=>r.reason==='CAPABILITY_NOT_PERMITTED_OR_AVAILABLE'))return {kind:'CAPABILITY',missing:[...new Set(evaluated.filter(r=>r.reason==='CAPABILITY_NOT_PERMITTED_OR_AVAILABLE').map(r=>r.action.kind))]};
 return {kind:'SCOPED_UNRESOLVED',modelAssistance:k.semanticUnavailable?'UNAVAILABLE':'AVAILABLE_OR_NOT_NEEDED',remainingEvidenceClasses:[...new Set((k.gapState?.gaps??[]).map(g=>g.type))],universalExhaustion:false};
}
