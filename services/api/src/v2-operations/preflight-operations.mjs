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
  if(r.kind==='START'){const job=db.jobs.find(j=>j.actor===r.actor&&j.idempotencyKey==='manual:'+r.token);if(job){r.status='SUCCEEDED';r.result=job;delete r.error;}}
  if(r.status==='RUNNING'&&(!alive(r.ownerPid)||(r.ownerPid===process.pid&&(r.ownerBoot!==bootId||!activeOperations.has(r.id))))){r.status='FAILED';r.error='PREFLIGHT_INTERRUPTED';}
  if(r.kind!=='START'&&r.status==='SUCCEEDED'&&Date.parse(r.result.expiresAt)<=now){r.status='EXPIRED';delete r.result;}
 }
 db.preflightOperations=db.preflightOperations.filter(r=>r.status==='RUNNING'||now-Date.parse(r.createdAt)<retentionMs).slice(-32);
}
const view=r=>({id:r.id,kind:r.kind??'PREFLIGHT',status:r.status,createdAt:r.createdAt,...(r.kind!=='START'?{input:r.input}:{config:r.config??r.result?.config}),...(r.result?{result:r.result}:{}),...(r.error?{error:r.error}:{})});
export function preflightStatus(ops,actor,id,kind='PREFLIGHT'){
 if(!ops.config.control)fail('RUN_CONTROL_DISABLED',403);
 const db=ops.db();prune(db);const rows=db.preflightOperations.filter(r=>r.actor===actor&&(r.kind??'PREFLIGHT')===kind);
  if(kind==='START')for(const job of db.jobs.filter(j=>j.actor===actor&&j.idempotencyKey?.startsWith('manual:'))){
   if(!rows.some(r=>r.result?.id===job.id))rows.push({id:job.id,kind:'START',status:'SUCCEEDED',createdAt:job.createdAt,result:job});
  }
  if(!id)return {rows:rows.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,32).map(view)};
  const r=rows.find(r=>r.id===id);if(!r)fail('PREFLIGHT_NOT_FOUND',404);return view(r);
}

export function launchPreflight(config,input,actor,done,action='PREFLIGHT'){
 const worker=new Worker(new URL('./preflight-worker.mjs',import.meta.url),{workerData:{config,input,actor,action},resourceLimits:{maxOldGenerationSizeMb:256}});
 let reported=false;
 const finish=value=>{if(reported)return;reported=true;clearTimeout(timer);done(value);};
 const timer=setTimeout(()=>{void worker.terminate().then(()=>finish({error:'PREFLIGHT_DEADLINE_EXCEEDED'}));},900000);timer.unref();
 worker.once('message',finish);
 worker.once('error',error=>{console.error(JSON.stringify(operationsDiagnostic(error,'preflight-worker')));finish({error:'PREFLIGHT_WORKER_FAILED'});});
 worker.once('exit',code=>finish({error:'PREFLIGHT_WORKER_EXITED'}));
}
export function beginPreflight(ops,input,actor,launch=launchPreflight){
 if(input&&Object.hasOwn(input,'humanLeadSnapshot'))fail('CLIENT_LEAD_SNAPSHOT_FORBIDDEN',400);
 if(!ops.config.control)fail('RUN_CONTROL_DISABLED',403);
 if(!input||!['MATURE_LIFECYCLE','LOGIN_MANAGE'].includes(input.objective))fail('INVALID_CONFIG',400);
 // No authenticated lifecycle work on the HTTP thread. The worker performs all original checks.
 const requestKey=hash(canonical({...input,...(Array.isArray(input.services)?{services:[...input.services].sort()}: {})}));
 let created=false;
 const record=ops.transaction(db=>{prune(db);const key=input.objective==='MATURE_LIFECYCLE'?hash(canonical({requestKey,leads:(db.humanLeads??[]).filter(l=>l.status==='UNVERIFIED'&&(!input.services?.length||input.services.includes(l.serviceId))).sort((a,b)=>a.leadId.localeCompare(b.leadId))})):requestKey;const same=db.preflightOperations.find(r=>r.kind!=='START'&&r.actor===actor&&r.key===key&&['RUNNING','SUCCEEDED'].includes(r.status));if(same)return view(same);
  if(db.preflightOperations.some(r=>r.status==='RUNNING'))fail('PREFLIGHT_BUSY');
  if(db.preflightOperations.length>=32)db.preflightOperations.shift();
  const r={id:randomUUID(),key,actor,input:structuredClone(input),createdAt:new Date().toISOString(),ownerPid:process.pid,ownerBoot:bootId,status:'RUNNING'};db.preflightOperations.push(r);created=true;return view(r);
 });
 if(created)dispatch(ops,record,input,actor,launch);
 return record;
}

function dispatch(ops,record,input,actor,launch,action='PREFLIGHT'){
activeOperations.add(record.id);console.error(JSON.stringify({event:'V2_CONTROL_OPERATION',kind:action,id:record.id,status:'RUNNING'}));const complete=(outcome,attempt=0)=>{try{const published=ops.transaction(db=>{const r=db.preflightOperations?.find(r=>r.id===record.id);if(!r||r.status!=='RUNNING')return;
  r.status=outcome.result?'SUCCEEDED':'FAILED';if(outcome.result)r.result=outcome.result;else r.error=outcome.error??'PREFLIGHT_FAILED';
  return {event:'V2_CONTROL_OPERATION',kind:action,id:r.id,status:r.status,durationMs:Date.now()-Date.parse(r.createdAt)};
 });if(published)console.error(JSON.stringify(published));activeOperations.delete(record.id);}catch(error){if(error.message==='CONTROL_BUSY'&&attempt<40)setTimeout(()=>complete(outcome,attempt+1),50);else {activeOperations.delete(record.id);console.error(JSON.stringify(operationsDiagnostic(error,'preflight-publication')));}}};try{launch({...ops.config,diagnosticContext:{purpose:action,operationId:record.id}},input,actor,complete,action);}catch(error){complete({error:'PREFLIGHT_WORKER_FAILED'});}
}

export function beginStart(ops,body,actor,launch=launchPreflight){
 if(!ops.config.control)fail('RUN_CONTROL_DISABLED',403);
 if(!body||Object.keys(body).some(k=>!['token','confirmed'].includes(k)))fail('INVALID_BODY',400);
 if(body.confirmed!==true)fail('CONFIRMATION_REQUIRED',400);
 if(typeof body.token!=='string'||body.token.length>100)fail('PREFLIGHT_EXPIRED');
 let created=false;
 const record=ops.transaction(db=>{
  prune(db);
  const job=db.jobs.find(j=>j.actor===actor&&j.idempotencyKey==='manual:'+body.token);
  let existing=db.preflightOperations.find(r=>r.kind==='START'&&r.actor===actor&&r.token===body.token);
  if(existing&&['RUNNING','SUCCEEDED'].includes(existing.status))return view(existing);
  if(job)return {id:job.id,kind:'START',status:'SUCCEEDED',result:job};
  const p=db.preflights.find(p=>p.token===body.token&&p.actor===actor);
  if(!p||p.expiresAt<=new Date().toISOString())fail('PREFLIGHT_EXPIRED');
  if(db.preflightOperations.some(r=>r.status==='RUNNING'))fail('PREFLIGHT_BUSY');
  if(!existing){if(db.preflightOperations.length>=32)db.preflightOperations.shift();existing={id:randomUUID(),kind:'START',actor,token:body.token};db.preflightOperations.push(existing);}
  Object.assign(existing,{config:structuredClone(p.config),status:'RUNNING',createdAt:new Date().toISOString(),ownerPid:process.pid,ownerBoot:bootId});delete existing.error;
  created=true;return view(existing);
 });
 if(created)dispatch(ops,record,{token:body.token,confirmed:true},actor,launch,'START');
 return record;
}
