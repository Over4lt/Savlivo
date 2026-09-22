// Field-level shadow intelligence. A missing field remains UNKNOWN, never FALSE.
// This consumes verifier decisions, not discovery labels or arbitrary snippets.
import {createHash} from 'node:crypto';
import {htmlTree} from '../offline-recovery/extract.mjs';
const pathOf=n=>n.parent?pathOf(n.parent)+'/'+n.tag+'['+n.index+']':'$';
const sha=x=>createHash('sha256').update(x).digest('hex');
export function retainPriceObservation(decision,{body,sourceUrl,scope={}}={}){
 if(typeof body!=='string'||sha(body)!==decision.sourceHash||!sourceUrl)throw Error('INTACT_ORIGINAL_PROVIDER_REQUIRED');
 const provenance=decision.fields?.provenance?.evidence??[];
 if(!provenance.some(e=>e.evidence?.intact===true&&e.evidence?.serviceEstablished===true&&e.evidence?.bodyHash===decision.sourceHash))throw Error('ADMITTED_PROVIDER_RECEIPT_REQUIRED');
 const fields=Object.fromEntries(Object.entries(decision.fields).map(([k,v])=>[k,{status:v.status==='VERIFIED'||v.status==='CLEAR'?'ESTABLISHED':'UNKNOWN',evidence:structuredClone(v.evidence),blocker:v.blocker??null}]));
 // Scope must be a verbatim span in the retained response, structurally owned by
 // the same price container. A caller-supplied city/label alone is not evidence.
 for(const [key,s]of Object.entries(scope)){
  if(!['city','location','branch','activity','access','eligibility','channel','configuration'].includes(key)||s.sourceHash!==decision.sourceHash||!Number.isInteger(s.start)||!Number.isInteger(s.end)||s.start<0||s.end<=s.start||body.slice(s.start,s.end)!==s.raw||!s.value||!s.raw.includes(s.value)||!s.ownerPath)throw Error('SCOPE_NOT_PROVIDER_BOUND');
  const container=htmlTree(body).nodes.find(n=>pathOf(n)===s.ownerPath);if(!container||s.start<container.start||s.end>container.end)throw Error('SCOPE_OUTSIDE_PRICE_CONTAINER');
  const owners=decision.fields.ownership?.evidence??[];
  if(!owners.some(e=>e.evidence?.owner?.path===s.ownerPath&&(e.path===s.ownerPath||e.path?.startsWith(s.ownerPath+'/'))))throw Error('SCOPE_PRICE_OWNER_MISMATCH');
 }
 const complete=decision.status==='V2_VERIFIED'&&Object.values(fields).every(f=>f.status==='ESTABLISHED');
 const useful=fields.amount?.status==='ESTABLISHED'&&(fields.monthlyCadence?.status==='ESTABLISHED'||fields.plan?.status==='ESTABLISHED'&&fields.currency?.status==='ESTABLISHED');
 const status=complete?(Object.keys(scope).length?'VERIFIED_SCOPED_PROVIDER_PRICE':'VERIFIED_PROVIDER_PRICE'):useful?'QUALIFIED_PROVIDER_PRICE':'INCOMPLETE_PROVIDER_PRICE_OBSERVATION';
 return {version:1,status,service:decision.service,market:decision.market,plan:fields.plan?.status==='ESTABLISHED'?decision.plan:null,amount:fields.amount?.status==='ESTABLISHED'?decision.amount:null,currency:fields.currency?.status==='ESTABLISHED'?decision.currency:null,billingInterval:fields.monthlyCadence?.status==='ESTABLISHED'?decision.billingInterval:null,cadenceFamily:decision.cadenceFamily,fields,scope:structuredClone(scope),source:{kind:'ORIGINAL_PROVIDER',url:sourceUrl,hash:decision.sourceHash},nationallyUniversal:false,canonicalIdentityStatus:decision.status,appPromotion:false};
}
// Offline annotation, not a claim that an unexecuted journey contains prices.
export function offlineTerminalClassification({verified=[],interrupted=false,journeys=[]}={}){
 if(interrupted)return {status:'INTERRUPTED_RECONCILIATION_REQUIRED',acquisitionComplete:false,retry:'RECONCILE_DISPATCHED_ACTION_BEFORE_EXPLICIT_RETRY'};
 if(verified.length)return {status:'VERIFIED',acquisitionComplete:true};
 if(journeys.some(j=>j.classification==='CONFIGURATOR'&&j.signals?.some(s=>s.dimension!=='plan')&&j.source?.hash&&j.executable===false))return {status:'CONFIGURATOR_EXECUTION_DEFERRED',acquisitionComplete:false,priceExists:'UNKNOWN',retry:'AFTER_REVIEWED_REQUEST_CONTRACT'};
 return {status:'EVIDENCE_INSUFFICIENT',acquisitionComplete:false};
}
export function interruptedRetryPlan(campaign){
 const results=campaign.results??[],interrupted=results.filter(r=>/^INTERRUPTED_/.test(r.status));
 return {schedulerTerminalTargets:results.length,acquisitionComplete:campaign.complete===true&&interrupted.length===0,requiresReconciliation:interrupted.map(r=>({target:r.id,status:r.status,retainedEvidenceDirectory:r.evidenceDirectory??null})),retryTargetIds:interrupted.map(r=>r.id),completedTargetsExcluded:results.filter(r=>!/^INTERRUPTED_/.test(r.status)).map(r=>r.id),automaticRetry:false,requiresExplicitReconciliation:true};
}
