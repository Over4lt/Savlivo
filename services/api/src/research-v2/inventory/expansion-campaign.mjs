// One resumable campaign, bounded batches over the existing V2 discovery/acquisition loop.
// Batching controls resource budgets; it never selects first-N services.
import fs from 'node:fs';
import {hash} from './candidate-universe.mjs';
import {runOpenWebResearch} from '../live/open-web-discovery.mjs';
export const expansionBounds=Object.freeze({services:20,searches:40,reads:80,acquisitions:30,perServiceSearches:2,perServiceReads:4,perServiceAcquisitions:2});
export function fairBatches(targets,size=20){
 if(!Number.isInteger(size)||size<1||size>20)throw Error('INVALID_BATCH_SIZE');
 const groups=new Map();for(const t of [...targets].sort((a,b)=>(a.service+'|'+a.market).localeCompare(b.service+'|'+b.market))){if(!groups.has(t.service))groups.set(t.service,[]);groups.get(t.service).push(t);}
 const ordered=[];while([...groups.values()].some(g=>g.length))for(const g of groups.values())if(g.length)ordered.push(g.shift());
 const batches=[];for(let i=0;i<ordered.length;i+=size)batches.push(ordered.slice(i,i+size));return batches;
}
export function atomic(file,value){const fd=fs.openSync(file+'.pending','w',0o600);try{fs.writeSync(fd,JSON.stringify(value,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(file+'.pending',file);}
export function recoverInterrupted(directory){
 const file=directory+'/state.json';if(!fs.existsSync(file))return [];
 const state=JSON.parse(fs.readFileSync(file)),parked=[];
 if(state.pending?.dispatched){const t=state.targets.find(t=>t.id===state.pending.target);if(!t)throw Error('CORRUPT_PENDING_TARGET');t.done='INTERRUPTED_ACTION_NOT_RETRIED';parked.push(t.id);state.pending=null;}
 // A reservation may have reached the provider before a crash. Never silently pay twice.
 const events=fs.existsSync(directory+'/journal.jsonl')?fs.readFileSync(directory+'/journal.jsonl','utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
 for(const t of state.targets){const reserved=t.decisions.filter(d=>d.acquisitionReserved).length;const completed=events.filter(e=>e.type==='AUTHORITATIVE_RESULT'&&e.target===t.id);
  if(reserved>completed.length){t.done='INTERRUPTED_ACQUISITION_RECONCILIATION_REQUIRED';parked.push(t.id);}
  const direct=events.filter(e=>e.type==='PROVIDER_INTERPRETATION'&&e.target===t.id);if(t.decisions.filter(d=>d.directInterpretationReserved).length>direct.length){t.done='INTERRUPTED_DIRECT_INTERPRETATION_RECONCILIATION_REQUIRED';parked.push(t.id);}
  for(const e of [...completed,...direct]){for(const v of e.outcome?.verified??[])if(!t.verified.some(x=>JSON.stringify(x)===JSON.stringify(v)))t.verified.push(v);}
 }
 atomic(file,state);return [...new Set(parked)];
}
export async function runExpansionCampaign({directory,targets,catalog,createAdapters,onProgress=()=>{},preparedPriorityBatches=null,conditionalFollowupTargets=null,adaptiveOptions={}}){
 if(conditionalFollowupTargets!==null){const {runAdaptiveCampaign}=await import('./adaptive-campaign.mjs');return runAdaptiveCampaign({...adaptiveOptions,directory,manifest:{targets,conditionalFollowupTargets},createAdapters});}
 if(!targets.length||new Set(targets.map(t=>t.id)).size!==targets.length)throw Error('INVALID_CAMPAIGN_TARGETS');
 fs.mkdirSync(directory,{recursive:true});const lock=directory+'/campaign.lock';
 if(fs.existsSync(lock)){const pid=Number(fs.readFileSync(lock,'utf8'));if(!Number.isInteger(pid)||pid<1)throw Error('CORRUPT_CAMPAIGN_LOCK');try{process.kill(pid,0);throw Error('CAMPAIGN_ALREADY_RUNNING');}catch(e){if(e.code!=='ESRCH')throw e;}fs.unlinkSync(lock);}
 const fd=fs.openSync(lock,'wx');fs.writeSync(fd,String(process.pid));fs.closeSync(fd);
 try{
 const file=directory+'/campaign.json',fingerprint=hash(JSON.stringify({targets,catalog,bounds:expansionBounds,...(preparedPriorityBatches?{preparedPriorityBatches}:{})}));
 const state=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):{version:1,fingerprint,completedBatches:[],parked:[],results:[],networkAuthorization:'EXTERNAL_ADAPTERS_REQUIRED',production:false};
 if(state.fingerprint!==fingerprint)throw Error('CAMPAIGN_INPUT_CHANGED');atomic(file,state);
 const batches=preparedPriorityBatches?validatedPriorityBatches(targets,preparedPriorityBatches):fairBatches(targets);
 for(const [i,originalBatch]of batches.entries()){
  if(state.completedBatches.includes(i))continue;
  const batch=originalBatch.map(t=>{const prior=state.results.find(r=>r.service===t.service&&r.retainedPriceReview?.sourceBound);return t.smartResearch?.version===2&&t.researchObjective==='SERVICE_COVERAGE'&&prior?{...t,retainedPriceReview:{...prior.retainedPriceReview,objective:'SERVICE_COVERAGE'}}:t;});
  const dir=directory+'/batch-'+String(i).padStart(4,'0'),discovery=dir+'/open-web-discovery';fs.mkdirSync(dir,{recursive:true});
  state.parked.push(...recoverInterrupted(discovery));const adapters=await createAdapters({directory:dir,targets:batch,bounds:expansionBounds});
  const fatal=error=>{if(/INTEGRITY|HASH_MISMATCH|INPUT_CHANGED|CORRUPT|AUTHORITY_URL_MISMATCH/.test(error?.message??''))throw error;};
  const localFailure=(phase,error)=>{fatal(error);return {failure:{code:phase+'_FAILED_REDACTED'}};};
  const search=async a=>{try{return await adapters.search(a);}catch(e){return localFailure('SEARCH',e);}};
  const read=async a=>{try{return await adapters.read(a);}catch(e){return {outcome:'UNRESOLVED',...localFailure('READ',e)};}};
  const classify=async a=>{try{return await adapters.classify(a);}catch(e){fatal(e);return {eligible:false,reason:'AUTHORITY_REVIEW_FAILED'};}};
  const acquire=async a=>{try{return await adapters.acquire(a);}catch(e){fatal(e);return {classification:'ACQUISITION_FAILED_RECONCILE_RETAINED_CHILD',verified:[],failure:'REDACTED'};}};
  const consumeProvider=adapters.consumeProvider?async a=>{try{return await adapters.consumeProvider(a);}catch(e){fatal(e);return {classification:'DIRECT_INTERPRETATION_FAILED',verified:[],failure:'REDACTED',needsGeo:false};}}:undefined;
  const result=await runOpenWebResearch({directory:discovery,targets:batch,catalog,bounds:expansionBounds,search,read,classify,acquire,consumeProvider});
  state.results.push(...result.targets.map(t=>({id:t.id,service:t.service,market:t.market,status:t.verified.length?'VERIFIED':t.done??'BOUNDS_EXHAUSTED',verified:t.verified,comprehensive:t.verified.length>0,completionMeaning:t.verified.length?'SUFFICIENT_VERIFIED_OFFER':'SCHEDULER_TERMINAL_NOT_COMPREHENSIVE_RESEARCH',retainedPriceReview:t.retainedPriceReview??null,researchPlan:t.researchPlan??null,researchDiagnosis:t.researchDiagnosis??null,providerInterpretations:t.providerInterpretations??[],remainingAuthorizedLeads:t.remainingAuthorizedLeads??[],queries:t.queries.length,reads:t.reads.length,acquisitions:t.decisions.filter(d=>d.acquisitionReserved).length,evidenceDirectory:discovery})));
  state.completedBatches.push(i);atomic(file,state);onProgress({completed:state.results.length,total:targets.length,batch:i});
 }
 state.complete=state.results.length===targets.length;state.completionMeaning='ALL_TARGETS_REACHED_BOUNDED_SCHEDULER_TERMINAL';state.researchComplete=state.results.every(r=>r.comprehensive===true);state.metrics={targets:targets.length,completed:state.results.length,verifiedServices:new Set(state.results.filter(r=>r.verified.length).map(r=>r.service)).size,verifiedPairs:state.results.filter(r=>r.verified.length).length,verifiedIdentities:state.results.reduce((n,r)=>n+r.verified.length,0),queries:state.results.reduce((n,r)=>n+r.queries,0),reads:state.results.reduce((n,r)=>n+r.reads,0),acquisitions:state.results.reduce((n,r)=>n+r.acquisitions,0)};atomic(file,state);return state;
 }finally{fs.unlinkSync(lock);}
}

export function validatedPriorityBatches(targets,batches){if(!Array.isArray(batches))throw Error('INVALID_PRIORITY_BATCHES');const ids=batches.flat();if(batches.some(b=>!Array.isArray(b)||!b.length||b.length>20)||ids.length!==targets.length||new Set(ids).size!==ids.length||ids.some(id=>!targets.some(t=>t.id===id)))throw Error('INVALID_PRIORITY_BATCHES');const byId=new Map(targets.map(t=>[t.id,t]));return batches.map(b=>b.map(id=>byId.get(id)));}
