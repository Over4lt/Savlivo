// Read model and diagnostics only; never claims, admits or executes a job.
import path from 'node:path';
import {json,alive} from './artifacts.mjs';
import {atomic,OperationError} from './control.mjs';
import {canonicalPlanEvidenceCounts} from '../google-ai/monotonic-merge.mjs';
import {readPriceResearchBatchProgress} from './price-research-batch.mjs';
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
const safeText=(value,maximum=512)=>typeof value==='string'&&value.length<=maximum?value:null;
const safeUrl=value=>{try{const parsed=new URL(value);return parsed.protocol==='https:'&&!parsed.username&&!parsed.password&&value.length<=2048?value:null;}catch{return null;}};
const retryUsageKeys=['actions','reads','searches','acquisitions','retainedReviews','bytes'];
function safeRetryUsage(value){if(!value||typeof value!=='object')return null;return Object.fromEntries(retryUsageKeys.flatMap(key=>{const amount=safeInteger(value[key]);return amount===null?[]:[[key,amount]];}));}
function safeVerificationRetry(value){
 if(!value||typeof value!=='object')return null;
 return {attempted:value.attempted===true,count:safeInteger(value.count)??0,usageScope:['TARGET','CAMPAIGN'].includes(value.usageScope)?value.usageScope:null,firstAttemptReason:code(value.firstAttemptReason),firstAttemptOutcome:code(value.firstAttemptOutcome),firstAttemptUsage:safeRetryUsage(value.firstAttemptUsage),retryOutcome:code(value.retryOutcome),retryReason:code(value.retryReason),retryUsage:safeRetryUsage(value.retryUsage),verifiedAttempt:value.verifiedAttempt===1||value.verifiedAttempt===2?value.verifiedAttempt:null};
}
const targetResultFile=(dir,target,index)=>path.join(dir,'price-research-targets',`${String(index+1).padStart(2,'0')}-${target.serviceId}-${target.targetMarket}`,'result.json');
function resultRowForTarget(result,target){return result?.kind==='ADMIN_V4_FIRST_RESEARCH_RESULT'&&Array.isArray(result.targets)?result.targets.find(item=>item?.target?.id===target.id):null;}
function safeVerificationEvidence(value){
 if(!value||typeof value!=='object'||!Number.isFinite(value.amount)||value.amount<=0)return null;
 const propositionStates=Object.fromEntries(['SERVICE_IDENTITY','PRICE_AMOUNT','CURRENCY','MONTHLY_SUBSCRIPTION','CONSUMER_SUBSCRIPTION','TARGET_MARKET','MONTHLY_CADENCE'].flatMap(name=>{const state=code(value.propositionStates?.[name]);return state?[[name,state]]:[];}));
 return {provider:safeText(value.provider),serviceId:safeText(value.serviceId,160),targetMarket:code(value.targetMarket),plan:safeText(value.plan),amount:value.amount,currency:code(value.currency),sourceUrl:safeUrl(value.sourceUrl),sourceAuthority:code(value.sourceAuthority),transport:code(value.transport),acquisitionTransport:code(value.acquisitionTransport),networkGeography:code(value.networkGeography),observationId:safeText(value.observationId),bodySha256:typeof value.bodySha256==='string'&&/^[a-f0-9]{64}$/.test(value.bodySha256)?value.bodySha256:null,truthMarket:code(value.truthMarket),eligibility:code(value.eligibility),verification:safeText(value.verification,80),verifiedAt:safeText(value.verifiedAt,80),verifiedByAgreement:value.verifiedByAgreement===true,propositionStates};
}
function canonicalTargetResult(result,resultRow,target){
 const adaptive=result?.downstreamResult,targetState=adaptive?.targets?.[target.id],serviceState=adaptive?.services?.[target.serviceId],usage={};
 const metrics={googleAiRequests:safeInteger(resultRow?.googleRequests),directAttempts:count(targetState?.reads),tavilyAttempts:count(targetState?.queries),decodoAttempts:Array.isArray(targetState?.decisions)?targetState.decisions.filter(row=>row?.route==='DECODO'&&row.acquisitionReserved===true).length:null,browserAttempts:count(targetState?.renderingOutcomes)};
 for(const [key,value]of Object.entries(metrics))if(value!==null)usage[key]=value;
 const planCounts=canonicalPlanEvidenceCounts(resultRow?.combined),suggested=planCounts?.suggestedPlans??safeInteger(resultRow?.persisted?.suggestedPlans),verified=planCounts?.verifiedPlans??safeInteger(resultRow?.persisted?.verified),resultClass=code(resultRow?.combined?.resultClass),eligibleTruth=Array.isArray(resultRow?.verificationEvidence)&&resultRow.verificationEvidence.some(evidence=>evidence?.eligibility==='ELIGIBLE'&&evidence?.targetMarket===target.targetMarket&&evidence?.truthMarket===target.targetMarket),authoritativeFinal=resultClass==='VERIFIED'&&verified>0&&eligibleTruth&&!(resultRow?.combined?.contradictions?.length),recordedStop=code(serviceState?.stop?.reason),failures=resultRow?.combined?.operationalFailures,retryExhausted=resultRow?.verificationRetry?.attempted===true&&resultRow.verificationRetry.retryOutcome==='UNRESOLVED'&&Array.isArray(failures)&&failures.some(failure=>failure?.kind==='V3_VERIFICATION_RETRY_EXHAUSTED'),stopReason=resultClass==='CONFLICT'?'AUTHORITATIVE_CONFLICT':authoritativeFinal?null:retryExhausted?'V3_VERIFICATION_RETRY_EXHAUSTED':recordedStop;
 return {resultClass,suggested,verified,usage:Object.keys(usage).length?usage:null,stopReason,verificationEvidenceAvailable:Array.isArray(resultRow?.verificationEvidence)&&resultRow.verificationEvidence.length>0,researchOutcome:resultClass==='CONFLICT'?'CONFLICT':verified>0?'VERIFIED':suggested>0?'SUGGESTED_ONLY':stopReason?'UNRESOLVED':'NOT_REPORTED'};
}
export function priceResearchBatchStatus(job,dir){
 const config=job?.config,expectedCeiling=config?.batchTargets?.length*96;if(config?.objective!=='PRICE_RESEARCH'||config.targetKind!=='CANONICAL_SELECTION'||!Array.isArray(config.batchTargets)||config.batchTargets.length<1||config.logicalTargetCount!==config.batchTargets.length||config.perTargetRequestCeiling!==96||!Number.isSafeInteger(expectedCeiling)||config.batchRequestCeiling!==expectedCeiling)return null;
 let recorded=null;try{recorded=readPriceResearchBatchProgress(config,dir);}catch{return null;}const recordedRows=Array.isArray(recorded?.outcomes)?recorded.outcomes:[];
 const status=batchStatuses.has(recorded?.status)?recorded.status:job.status==='QUEUED'?'PENDING':job.status==='RUNNING'?'RUNNING':batchStatuses.has(job.status)?job.status:'PENDING',counts={PENDING:0,RUNNING:0,COMPLETE:0,FAILED:0,STOPPED:0},rows=config.batchTargets.map((target,index)=>recordedRows[index]?.targetId===target.id?recordedRows[index]:{targetId:target.id,status:'PENDING'});
 for(const row of rows)counts[batchStatuses.has(row.status)?row.status:'PENDING']++;
 const completeProjection=jobTerminalStatuses.includes(job.status)||['COMPLETE','FAILED','STOPPED'].includes(status),indexes=rows.map((row,index)=>({row,index})).filter(({row})=>completeProjection||row.status!=='PENDING').slice(completeProjection?0:-100).map(({index})=>index);
 const outcomes=indexes.map(index=>{const target=config.batchTargets[index];
  const row=recordedRows[index]?.targetId===target.id?recordedRows[index]:null,result=row?.status==='COMPLETE'?json(targetResultFile(dir,target,index),4*1024*1024):null,resultRow=resultRowForTarget(result,target),projected=canonicalTargetResult(result,resultRow,target);
  return {position:index+1,total:config.batchTargets.length,targetId:target.id,serviceId:target.serviceId,serviceName:target.serviceName,targetMarket:target.targetMarket,status:batchStatuses.has(row?.status)?row.status:'PENDING',...(code(row?.failureCode)?{failureCode:code(row.failureCode)}:{}),...(typeof row?.startedAt==='string'?{startedAt:row.startedAt}:{}),...(typeof row?.finishedAt==='string'?{finishedAt:row.finishedAt}:{}),...(projected.resultClass?{resultClass:projected.resultClass}:{}),...(projected.suggested!==null?{suggestedPlans:projected.suggested}:{}),...(projected.verified!==null?{verified:projected.verified}:{}),...(projected.usage?{capabilityUsage:projected.usage}:{}),...(projected.stopReason?{stopReason:projected.stopReason}:{}),...(projected.verificationEvidenceAvailable?{verificationEvidenceAvailable:true}:{}),...(resultRow?{researchOutcome:projected.researchOutcome}:{})};
 });
 return {status,nextIndex:safeInteger(recorded?.nextIndex)??0,logicalTargetCount:config.logicalTargetCount,admittedTargetCount:config.batchTargets.length,serviceCount:new Set(config.batchTargets.map(target=>target.serviceId)).size,progressCounts:{pending:counts.PENDING,running:counts.RUNNING,complete:counts.COMPLETE,failed:counts.FAILED,stopped:counts.STOPPED},outcomesTruncated:outcomes.length<config.batchTargets.length,continuationCursor:null,perTargetRequestCeiling:config.perTargetRequestCeiling,batchRequestCeiling:config.batchRequestCeiling,outcomes};
}
export function priceResearchTargetEvidence(ops,id,position,actor){
 if(!/^[a-f0-9-]{36}$/.test(id))throw new OperationError('JOB_NOT_FOUND',404);
 const job=ops.db().jobs.find(candidate=>candidate.id===id&&candidate.actor===actor),index=Number(position)-1,config=job?.config;
 if(!job)throw new OperationError('JOB_NOT_FOUND',404);
 if(!config||!Number.isSafeInteger(index)||index<0||index>=config?.batchTargets?.length||config.objective!=='PRICE_RESEARCH'||config.targetKind!=='CANONICAL_SELECTION')throw new OperationError('PRICE_RESEARCH_TARGET_NOT_FOUND',404);
 const target=config.batchTargets[index],dir=path.join(ops.config.root,'runs',id);let progress;try{progress=readPriceResearchBatchProgress(config,dir);}catch{throw new OperationError('PRICE_RESEARCH_EVIDENCE_UNAVAILABLE',404);}
 if(progress?.outcomes?.[index]?.targetId!==target.id||progress.outcomes[index].status!=='COMPLETE')throw new OperationError('PRICE_RESEARCH_EVIDENCE_UNAVAILABLE',404);
 const result=json(targetResultFile(dir,target,index),4*1024*1024),row=resultRowForTarget(result,target);if(!row)throw new OperationError('PRICE_RESEARCH_EVIDENCE_UNAVAILABLE',404);
 const evidence=(row.verificationEvidence??[]).slice(0,128).map(safeVerificationEvidence).filter(Boolean),suggested=Array.isArray(row.combined?.suggested)?row.combined.suggested:[];
 return {target:{id:target.id,serviceId:target.serviceId,serviceName:target.serviceName,targetMarket:target.targetMarket},stages:{googleAiV4Suggested:suggested.filter(item=>item?.provenance==='GOOGLE_AI_V4').length,v3SourceResearchSuggested:suggested.filter(item=>item?.provenance==='V3_SOURCE_RESEARCH').length,v3TruthVerified:evidence.length},verificationRetry:safeVerificationRetry(row.verificationRetry),verificationEvidence:evidence};
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
