import assert from 'node:assert/strict';
import {runFieldGapFallback} from './fallback.mjs';
import {references,validateReference,sha256,indexBundle} from './module-resources.mjs';
export const moduleValidationCaps=Object.freeze({module:{urls:6,executions:8,retries:2,requests:48,bytes:12582912},endpoint:{urls:3,executions:4,retries:1,requests:24,bytes:4194304},total:{urls:9,executions:12,retries:3,requests:72,bytes:16777216}});
export class ResourceBudget {
 constructor(persist=()=>{},caps=moduleValidationCaps,parent=null){for(const k of ['module','endpoint','total'])for(const f of ['urls','executions','retries','requests','bytes'])assert(Number.isSafeInteger(caps[k]?.[f])&&caps[k][f]>=0);this.caps=caps;this.parent=parent;this.persist=persist;this.state={module:{urls:[],executions:0,retries:0,requests:0,bytes:0},endpoint:{urls:[],executions:0,retries:0,requests:0,bytes:0},total:{urls:[],executions:0,retries:0,requests:0,bytes:0},stop:null};this.pending=0;}
 fail(reason){this.state.stop=reason;this.persist(this.state);throw Error(reason);}
 execution(kind,url,retry=false){assert(['module','endpoint'].includes(kind));if(this.state.stop)this.fail(this.state.stop);for(const k of [kind,'total']){const s=this.state[k],c=this.caps[k];if(s.executions>=c.executions||retry&&s.retries>=c.retries||!s.urls.includes(url)&&s.urls.length>=c.urls)this.fail('EXECUTION_OR_URL_BOUND');}this.parent?.execution(kind,url,retry);for(const k of [kind,'total']){const s=this.state[k];s.executions++;if(retry)s.retries++;if(!s.urls.includes(url))s.urls.push(url);}this.persist(this.state);}
 request(kind,maxBytes){assert(Number.isSafeInteger(maxBytes)&&maxBytes>0);if(this.pending)this.fail('CONCURRENT_RESOURCE_REQUEST');if(this.state.stop)this.fail(this.state.stop);for(const k of [kind,'total']){const s=this.state[k],c=this.caps[k];if(s.requests>=c.requests||s.bytes+maxBytes+65536>c.bytes)this.fail('REQUEST_OR_TRAFFIC_BOUND');}this.parent?.request(kind,maxBytes);this.pending=maxBytes;for(const k of [kind,'total'])this.state[k].requests++;this.persist(this.state);}
 traffic(kind,n){assert(Number.isSafeInteger(n)&&n>=0);for(const k of [kind,'total'])this.state[k].bytes+=n;this.persist(this.state);this.parent?.traffic(kind,n);if([kind,'total'].some(k=>this.state[k].bytes>this.caps[k].bytes))this.fail('TRAFFIC_VIOLATION');}
 settled(){this.parent?.settled();this.pending=0;this.persist(this.state);}
}
export async function acquireMissingModules({target,input,parents,bootstrapUrls=[],acquire,budget,persist,signal}){
 assert(typeof persist==='function'&&typeof acquire==='function'&&budget instanceof ResourceBudget);
 const state={target,steps:[],modules:[...input.modules],endpointCandidates:[],status:'TRACE',analysisWork:0};
 let result=runFieldGapFallback(input);if(!result.activation.active){state.status='FALLBACK_NOT_APPLICABLE';persist(state);return state;}
 // Secondary fetches require a hash-bound field-consumer dependency proof.
 // Explicit bootstrap authorization remains separate from required dependencies.
 // No resumable side effects are inferred from a partly written log. Caller must supply
 // verified retained bodies on restart; unknown in-flight attempts require reconciliation.
 const sources=[...parents,...input.modules],seen=new Set(),entries=[...input.entries];let acquired=0;
 while(true){
  if(signal?.aborted){state.status='INTERRUPTED';break;}
  state.analysisWork+=result.counts.work;if(state.analysisWork>=200000){state.status='TRACE_BOUND_EXHAUSTED';break;}
  state.endpointCandidates=result.candidates.filter(x=>x.acquisitionEligible);if(state.endpointCandidates.length){state.status='DERIVED_ENDPOINT_PROVEN';break;}
  if(!result.complete&&!result.linking?.complete){state.status='TRACE_BOUND_EXHAUSTED';break;}
  const missing=new Set(result.stops.filter(x=>x.reason==='MISSING_RETAINED_MODULE').map(x=>x.detail));
  const required=new Set((result.dependencyProofs??[]).filter(d=>d.state==='REQUIRED_PROVEN'&&d.acquisitionEligible).map(d=>d.url));
  const retainedMappings=(result.mapping?.complete?result.mapping.mappings:[])?.filter(m=>m.status==='PROVEN'&&m.acquisitionEligible&&m.alreadyRetained)??[];
  let rebound=false;for(const m of retainedMappings){const retained=state.modules.find(s=>s.url===m.url&&sha256(s.code)===s.sha256);if(retained&&!retained.parentEvidence){retained.parentEvidence={reference:m.reference,retainedHash:retained.sha256};retained.providerControlled=true;rebound=true;}}
  if(rebound){result=runFieldGapFallback({...input,modules:state.modules,limits:{...input.limits,work:200000-state.analysisWork}});continue;}
  const mapped=(result.mapping?.complete?result.mapping.mappings:[])?.filter(m=>m.status==='PROVEN'&&m.acquisitionEligible).map(m=>m.reference)??[];
  const queue=[...sources.flatMap(p=>references(p).references),...mapped].filter(r=>!seen.has(r.url)&&!state.modules.some(m=>m.url===r.url)&&(bootstrapUrls.includes(r.url)||required.has(r.url)))
   .sort((a,b)=>Number(missing.has(b.url))-Number(missing.has(a.url))||a.depth-b.depth||a.url.localeCompare(b.url,'en'));
  if(!queue.length){state.status=missing.size?'MISSING_RESOURCE_DEMAND_PROOF_UNRESOLVED':'TRACE_COMPLETE_NO_PROVEN_ENDPOINT';break;}
  if(acquired>=2){state.status='TARGET_RESOURCE_BOUND';break;}
  const ref=queue[0];seen.add(ref.url);const parent=sources.find(s=>s.url===ref.parentUrl),eligibility=ref.kind==='PROVEN_CHUNK_MAPPING'?{eligible:mapped.includes(ref)&&!!parent&&sha256(parent.code)===ref.parentHash,authority:result.mapping.mappings.find(m=>m.reference===ref)?.authority,reason:'RECOMPUTED_STATIC_MAPPING'}:validateReference(ref,parent,input.authorities);
  const step={reference:ref,dependencyProof:result.dependencyProofs?.find(d=>d.url===ref.url&&d.state==='REQUIRED_PROVEN')??null,eligibility,status:'MISSING_REQUIRED_RESOURCE'};state.steps.push(step);persist(state);
  if(!eligibility.eligible){step.status='RESOURCE_INELIGIBLE';persist(state);continue;}
  // Host acquisition callback must enforce policy + geo + streamed accounting before
  // returning a complete retained resource. No code in this controller calls the network.
  try{budget.execution('module',ref.url);}catch{state.status='VALIDATION_BOUND_STOP';break;}acquired++;step.status='DISPATCH_RESERVED';persist(state);
  let response;try{response=await acquire({target,url:ref.url,reference:ref,authority:eligibility.authority,kind:'module',maxBytes:2097152,budget});}catch{step.status='RESOURCE_FETCH_FAILED';persist(state);state.status=budget.state.stop??'RESOURCE_FETCH_FAILED';break;}
  if(response.policyAllowed!==true||response.restriction){step.status='RESOURCE_POLICY_BLOCKED';state.status=step.status;persist(state);break;}
  if(!response.complete||response.geoVerified!==true||response.url!==ref.url||typeof response.code!=='string'||sha256(response.code)!==response.sha256||Buffer.byteLength(response.code)>2097152||!response.receipt){step.status='RESOURCE_FETCH_FAILED';persist(state);continue;}
  const module={url:ref.url,code:response.code,sha256:response.sha256,providerControlled:true,parentEvidence:{reference:ref,receipt:response.receipt},rootContext:parent.rootContext??{sha256:parent.parentEvidence?.reference?.parentHash??parent.parentEvidence?.parentHash??parent.parentEvidence?.pageHash,url:parent.parentEvidence?.reference?.parentUrl??parent.parentEvidence?.parentUrl??parent.parentEvidence?.page},depth:ref.depth};
  step.response={sha256:module.sha256,receipt:response.receipt,bytes:Buffer.byteLength(module.code)};
  sources.push(module);state.modules.push(module);entries.push(module.url);step.status='HASH_VERIFIED';persist(state);
  step.bundleIndex=indexBundle(module);
  result=runFieldGapFallback({...input,entries:[...new Set(entries)],modules:state.modules,limits:{...input.limits,work:200000-state.analysisWork}});
 }
 state.trace=result;persist(state);return state;
}
