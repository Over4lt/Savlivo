// Read model and diagnostics only; never claims, admits or executes a job.
import path from 'node:path';
import {json,alive} from './artifacts.mjs';
import {atomic,OperationError} from './control.mjs';
import {canonicalPlanEvidenceCounts} from '../google-ai/monotonic-merge.mjs';
export const jobTerminalStatuses=['COMPLETE','FAILED','STOPPED','INTERRUPTED','SKIPPED_CONFLICT','SKIPPED_NOT_DUE'];
export function recordJobPhase(config,job,event){
 const record={event,jobId:job.id,purpose:event.startsWith('PREPARATION_')?'WORKER_PREPARE':'EXECUTION',pid:process.pid,at:new Date().toISOString()};
 console.error(JSON.stringify({...record,eventType:event,event:'V2_JOB_EXECUTION'}));
 if(event==='RUNNING_PUBLISHED'||event==='CHILD_SPAWNED')return;
 // Observability failure must not change lease, admission or execution behavior.
 try{atomic(path.join(config.root,'runs',job.id,'execution-phase.json'),record);}catch{console.error(JSON.stringify({event:'V2_JOB_DIAGNOSTIC_WRITE_FAILED',jobId:job.id}));}
}
// Only bounded machine codes are exposed; arbitrary exception/log text can contain secrets.
const code=value=>typeof value==='string'&&/^[A-Z][A-Z0-9_]{0,159}$/.test(value)?value:null;
const batchStatuses=new Set(['PENDING','RUNNING','COMPLETE','FAILED','STOPPED']);
const safeInteger=value=>Number.isSafeInteger(value)&&value>=0?value:null;
const count=value=>Array.isArray(value)?value.length:null;
function canonicalTargetResult(result,resultRow,target){
 const adaptive=result?.downstreamResult,targetState=adaptive?.targets?.[target.id],serviceState=adaptive?.services?.[target.serviceId],usage={};
 const metrics={googleAiRequests:safeInteger(resultRow?.googleRequests),directAttempts:count(targetState?.reads),tavilyAttempts:count(targetState?.queries),decodoAttempts:Array.isArray(targetState?.decisions)?targetState.decisions.filter(row=>row?.route==='DECODO'&&row.acquisitionReserved===true).length:null,browserAttempts:count(targetState?.renderingOutcomes)};
 for(const [key,value]of Object.entries(metrics))if(value!==null)usage[key]=value;
 const planCounts=canonicalPlanEvidenceCounts(resultRow?.combined),stopReason=code(serviceState?.stop?.reason),suggested=planCounts?.suggestedPlans??safeInteger(resultRow?.persisted?.suggestedPlans),verified=planCounts?.verifiedPlans??safeInteger(resultRow?.persisted?.verified),resultClass=code(resultRow?.combined?.resultClass);
 return {resultClass,suggested,verified,usage:Object.keys(usage).length?usage:null,stopReason,researchOutcome:verified>0?'VERIFIED':suggested>0?'SUGGESTED_ONLY':stopReason?'UNRESOLVED':'NOT_REPORTED'};
}
export function priceResearchBatchStatus(job,dir){
 const config=job?.config;if(config?.objective!=='PRICE_RESEARCH'||config.targetKind!=='CANONICAL_SELECTION'||!Array.isArray(config.batchTargets)||config.batchTargets.length<1||config.batchTargets.length>10)return null;
 const recorded=json(path.join(dir,'price-research-batch-progress.json'),1024*1024),recordedRows=Array.isArray(recorded?.outcomes)?recorded.outcomes:[];
 const outcomes=config.batchTargets.map((target,index)=>{
  const row=recordedRows[index]?.targetId===target.id?recordedRows[index]:null,result=json(path.join(dir,'price-research-targets',`${String(index+1).padStart(2,'0')}-${target.serviceId}-${target.targetMarket}`,'result.json'),4*1024*1024),resultRow=result?.kind==='ADMIN_V4_FIRST_RESEARCH_RESULT'&&Array.isArray(result.targets)?result.targets.find(item=>item?.target?.id===target.id):null,projected=canonicalTargetResult(result,resultRow,target);
  return {position:index+1,total:config.batchTargets.length,targetId:target.id,serviceId:target.serviceId,serviceName:target.serviceName,targetMarket:target.targetMarket,status:batchStatuses.has(row?.status)?row.status:'PENDING',...(code(row?.failureCode)?{failureCode:code(row.failureCode)}:{}),...(typeof row?.startedAt==='string'?{startedAt:row.startedAt}:{}),...(typeof row?.finishedAt==='string'?{finishedAt:row.finishedAt}:{}),...(projected.resultClass?{resultClass:projected.resultClass}:{}),...(projected.suggested!==null?{suggestedPlans:projected.suggested}:{}),...(projected.verified!==null?{verified:projected.verified}:{}),...(projected.usage?{capabilityUsage:projected.usage}:{}),...(projected.stopReason?{stopReason:projected.stopReason}:{}),...(resultRow?{researchOutcome:projected.researchOutcome}:{})};
 });
 return {status:batchStatuses.has(recorded?.status)?recorded.status:job.status==='QUEUED'?'PENDING':job.status==='RUNNING'?'RUNNING':batchStatuses.has(job.status)?job.status:'PENDING',nextIndex:safeInteger(recorded?.nextIndex)??0,logicalTargetCount:config.logicalTargetCount,cursor:config.cursor??null,continuationCursor:config.continuationCursor??null,perTargetRequestCeiling:config.perTargetRequestCeiling,batchRequestCeiling:config.batchRequestCeiling,outcomes};
}
export function terminationDiagnostic(job,phase,processAlive){
 if(['COMPLETE','SKIPPED_NOT_DUE'].includes(job.status))return null;
 const abnormal=['FAILED','INTERRUPTED','STOPPED','SKIPPED_CONFLICT'].includes(job.status);
 const lastPhase=phase?.jobId===job.id?code(phase.event):null;
 const context={lastPhase,lastPhaseAt:lastPhase?phase.at??null:null};
 if(abnormal){
  const error=code(job.error);
  if(error)return {...context,kind:'CAUSE',reason:error};
  if(job.status==='STOPPED'&&job.stopRequested===true)return {...context,kind:'CAUSE',reason:'OPERATOR_STOP_REQUESTED'};
  if(lastPhase?.endsWith('_FAILED'))return {...context,kind:'CAUSE',reason:lastPhase};
  return {...context,kind:'UNKNOWN',reason:'Cause unavailable from recorded status.'};
 }
 if(job.status==='RUNNING'&&processAlive===false)return {...context,kind:'PROBABLE_CAUSE',reason:'Execution process may have exited; recorded RUNNING job PID is no longer observable. Exit cause is unknown.'};
 return null;
}
export function jobStatus(ops,id,actor){
 if(!/^[a-f0-9-]{36}$/.test(id))throw new OperationError('JOB_NOT_FOUND',404);
 const job=ops.db().jobs.find(j=>j.id===id&&j.actor===actor);if(!job)throw new OperationError('JOB_NOT_FOUND',404);
 const dir=path.join(ops.config.root,'runs',id),phase=json(path.join(dir,'execution-phase.json')),manifest=json(path.join(dir,'manifest.json'));
 let preparation=null;
 if(phase?.jobId===id&&alive(phase.pid)){
  if(job.status==='QUEUED'&&phase.event==='PREPARATION_STARTED'&&json(path.join(ops.config.root,'control.lock'))===phase.pid)preparation='Preparing execution';
  if(job.status==='RUNNING'&&phase.pid===job.pid)preparation=phase.event==='AUTHORITATIVE_VALIDATION_STARTED'?'Validating execution integrity':phase.event==='AUTHORITATIVE_VALIDATION_COMPLETED'?'Lifecycle execution':phase.event==='EXECUTION_STARTED'?'Preparing execution':null;
 }
 return {id:job.id,status:job.status,terminal:jobTerminalStatuses.includes(job.status),phase:preparation,diagnostic:terminationDiagnostic(job,phase,Number.isInteger(job.pid)&&job.pid>1?alive(job.pid):null),services:job.config?.services??[],createdAt:job.createdAt,startedAt:job.startedAt??null,updatedAt:job.updatedAt,finishedAt:job.finishedAt??null,maximumRequests:manifest?.limits?.totalRequests??manifest?.safety?.totalRequests??null,batchProgress:priceResearchBatchStatus(job,dir)};
}
