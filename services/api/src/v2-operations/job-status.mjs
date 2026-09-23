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
export function jobStatus(ops,id,actor){
 if(!/^[a-f0-9-]{36}$/.test(id))throw new OperationError('JOB_NOT_FOUND',404);
 const job=ops.db().jobs.find(j=>j.id===id&&j.actor===actor);if(!job)throw new OperationError('JOB_NOT_FOUND',404);
 const dir=path.join(ops.config.root,'runs',id),phase=json(path.join(dir,'execution-phase.json')),manifest=json(path.join(dir,'manifest.json'));
 let preparation=null;
 if(phase?.jobId===id&&alive(phase.pid)){
  if(job.status==='QUEUED'&&phase.event==='PREPARATION_STARTED'&&json(path.join(ops.config.root,'control.lock'))===phase.pid)preparation='Validating execution';
  if(job.status==='RUNNING'&&phase.pid===job.pid&&phase.event==='EXECUTION_STARTED')preparation='Lifecycle execution';
 }
 return {id:job.id,status:job.status,terminal:jobTerminalStatuses.includes(job.status),phase:preparation,services:job.config?.services??[],createdAt:job.createdAt,startedAt:job.startedAt??null,updatedAt:job.updatedAt,finishedAt:job.finishedAt??null,maximumRequests:manifest?.limits?.totalRequests??manifest?.safety?.totalRequests??null};
}
