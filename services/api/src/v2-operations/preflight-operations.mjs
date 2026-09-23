import {Worker} from 'node:worker_threads';
import {randomUUID} from 'node:crypto';
import {hash,alive} from './artifacts.mjs';
import {operationsDiagnostic} from './diagnostics.mjs';
const retentionMs=24*60*60*1000;
const bootId=randomUUID();
const activeOperations=new Set();
const fail=(message,status=409)=>{throw Object.assign(Error(message),{status});};
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
function prune(db){
 const now=Date.now();db.preflightOperations??=[];
 for(const r of db.preflightOperations){
  if(r.status==='RUNNING'&&(!alive(r.ownerPid)||(r.ownerPid===process.pid&&(r.ownerBoot!==bootId||!activeOperations.has(r.id))))){r.status='FAILED';r.error='PREFLIGHT_INTERRUPTED';}
  if(r.status==='SUCCEEDED'&&Date.parse(r.result.expiresAt)<=now){r.status='EXPIRED';delete r.result;}
 }
 db.preflightOperations=db.preflightOperations.filter(r=>r.status==='RUNNING'||now-Date.parse(r.createdAt)<retentionMs).slice(-32);
}
const view=r=>({id:r.id,status:r.status,createdAt:r.createdAt,input:r.input,...(r.result?{result:r.result}:{}),...(r.error?{error:r.error}:{})});
export function preflightStatus(ops,actor,id){
 if(!ops.config.control)fail('RUN_CONTROL_DISABLED',403);
 const db=ops.db();prune(db);const rows=db.preflightOperations.filter(r=>r.actor===actor);
  if(!id)return {rows:rows.map(view).reverse()};
  const r=rows.find(r=>r.id===id);if(!r)fail('PREFLIGHT_NOT_FOUND',404);return view(r);
}

export function launchPreflight(config,input,actor,done){
 const worker=new Worker(new URL('./preflight-worker.mjs',import.meta.url),{workerData:{config,input,actor},resourceLimits:{maxOldGenerationSizeMb:256}});
 let reported=false;
 const finish=value=>{if(reported)return;reported=true;clearTimeout(timer);done(value);};
 const timer=setTimeout(()=>{void worker.terminate().then(()=>finish({error:'PREFLIGHT_DEADLINE_EXCEEDED'}));},900000);timer.unref();
 worker.once('message',finish);
 worker.once('error',error=>{console.error(JSON.stringify(operationsDiagnostic(error,'preflight-worker')));finish({error:'PREFLIGHT_WORKER_FAILED'});});
 worker.once('exit',code=>finish({error:'PREFLIGHT_WORKER_EXITED'}));
}
export function beginPreflight(ops,input,actor,launch=launchPreflight){
 if(!ops.config.control)fail('RUN_CONTROL_DISABLED',403);
 if(!input||!['MATURE_LIFECYCLE','LOGIN_MANAGE'].includes(input.objective))fail('INVALID_CONFIG',400);
 // No authenticated lifecycle work on the HTTP thread. The worker performs all original checks.
 const key=hash(canonical({...input,...(Array.isArray(input.services)?{services:[...input.services].sort()}: {})}));
 let created=false;
 const record=ops.transaction(db=>{prune(db);const same=db.preflightOperations.find(r=>r.actor===actor&&r.key===key&&['RUNNING','SUCCEEDED'].includes(r.status));if(same)return view(same);
  if(db.preflightOperations.some(r=>r.status==='RUNNING'))fail('PREFLIGHT_BUSY');
  if(db.preflightOperations.length>=32)db.preflightOperations.shift();
  const r={id:randomUUID(),key,actor,input:structuredClone(input),createdAt:new Date().toISOString(),ownerPid:process.pid,ownerBoot:bootId,status:'RUNNING'};db.preflightOperations.push(r);created=true;return view(r);
 });
 if(created){activeOperations.add(record.id);console.error(JSON.stringify({event:'V2_PREFLIGHT_OPERATION',id:record.id,status:'RUNNING'}));const complete=(outcome,attempt=0)=>{try{const published=ops.transaction(db=>{const r=db.preflightOperations?.find(r=>r.id===record.id);if(!r||r.status!=='RUNNING')return;
  r.status=outcome.result?'SUCCEEDED':'FAILED';if(outcome.result)r.result=outcome.result;else r.error=outcome.error??'PREFLIGHT_FAILED';
  return {event:'V2_PREFLIGHT_OPERATION',id:r.id,status:r.status,durationMs:Date.now()-Date.parse(r.createdAt)};
 });if(published)console.error(JSON.stringify(published));activeOperations.delete(record.id);}catch(error){if(error.message==='CONTROL_BUSY'&&attempt<40)setTimeout(()=>complete(outcome,attempt+1),50);else {activeOperations.delete(record.id);console.error(JSON.stringify(operationsDiagnostic(error,'preflight-publication')));}}};try{launch(ops.config,input,actor,complete);}catch(error){complete({error:'PREFLIGHT_WORKER_FAILED'});}}
 return record;
}
