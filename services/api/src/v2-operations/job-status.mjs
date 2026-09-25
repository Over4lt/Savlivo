// Read model and diagnostics only; never claims, admits or executes a job.
import path from 'node:path';
import {json,alive} from './artifacts.mjs';
import {atomic,OperationError} from './control.mjs';
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
 return {id:job.id,status:job.status,terminal:jobTerminalStatuses.includes(job.status),phase:preparation,diagnostic:terminationDiagnostic(job,phase,Number.isInteger(job.pid)&&job.pid>1?alive(job.pid):null),services:job.config?.services??[],createdAt:job.createdAt,startedAt:job.startedAt??null,updatedAt:job.updatedAt,finishedAt:job.finishedAt??null,maximumRequests:manifest?.limits?.totalRequests??manifest?.safety?.totalRequests??null};
}
