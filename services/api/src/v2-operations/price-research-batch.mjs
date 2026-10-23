import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {TargetResearchFailure} from '../research-v2/live/target-research-failure.mjs';
import {createProviderPricingRouteMemory,learnProviderPricingRoutesFromTarget,recordProviderPricingRouteFailure} from '../research-v2/live/hybrid-provider-resource-memory.mjs';
import {loadPricingRouteMemory,publishPricingRouteMemory,publishPricingMethodOutcomes,isPublicPricingRouteUrl} from '../research-v2/storage/pricing-route-memory.mjs';
import {loadRetainedVerifiedEvidence} from './verified-reconciliation-v1.mjs';
import {loadSinglePriceRouteProof,loadBrowserPriceRouteProof} from './single-price-route-proof.mjs';
import {researchModeOf,perTargetRequestCeiling} from './price-research-mode.mjs';
import {createSuggestedOnlyGoogleGate} from './suggested-only-google-gate.mjs';

const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const safeCode=value=>typeof value==='string'&&/^[A-Z][A-Z0-9_]{0,159}$/.test(value)?value:'PRICE_RESEARCH_CHILD_FAILED';
const validTarget=target=>target&&typeof target.serviceId==='string'&&/^[a-z0-9][a-z0-9-]{0,159}$/.test(target.serviceId)&&typeof target.serviceName==='string'&&target.serviceName.length>0&&target.serviceName.length<=240&&typeof target.targetMarket==='string'&&/^[A-Z]{2}$/.test(target.targetMarket)&&target.id===`price-research:${target.serviceId}:${target.targetMarket}`&&target.marketApplicabilityEstablished===false;
const writeJson=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});const pending=file+`.${process.pid}.pending`;fs.writeFileSync(pending,JSON.stringify(value,null,2)+'\n',{mode:0o600});fs.renameSync(pending,file);};
const childDirectory=(directory,target,index)=>path.join(directory,'price-research-targets',`${String(index+1).padStart(2,'0')}-${target.serviceId}-${target.targetMarket}`);
export function recoverCompletedPricingRoutes(memory,child,target,{memoryRoot=null,runsRoot=null,jobId=null,recordedAt=null,replayFailures=true,result=null,knownService=false}={}){
 // A completed target's journal time is required even for in-batch learning:
 // replay must never turn an old acquisition into a new success.
 if(!Number.isFinite(Date.parse(recordedAt)))return;
 for(const attempt of ['priority-research-links','known-service','known-service-v3-verification-retry-1']){
  const campaign=path.join(child,attempt),file=path.join(campaign,'adaptive-state.json');if(!fs.existsSync(file))continue;
  let current,learned;
  const priorSuccess=new Map(memory.routes);
  try{
   const state=JSON.parse(fs.readFileSync(file,'utf8'));current=state.targets?.[target.id];
   learned=learnProviderPricingRoutesFromTarget({memory,target:current,directory:path.join(campaign,'targets',target.id,'open-web-discovery'),now:recordedAt});
  }catch{/* Corrupt route metadata cannot grant routing priority. */continue;}
  const useful=new Set(learned.map(row=>row.url));
  if(replayFailures)for(const lead of current?.leads??[])if(lead.learnedProviderPricingRoute===true&&!useful.has(lead.url)&&(current.reads??[]).some(read=>read.requestedUrl===lead.url))recordProviderPricingRouteFailure(memory,current,lead.url);
  const confirmedSuccessUrls=[],confirmedSuccessMethods={};
  if(memoryRoot&&jobId&&recordedAt)for(const row of learned){
   if(!isPublicPricingRouteUrl(row.url))continue;
   const source=row.sources.findLast(source=>source.market===target.targetMarket);if(!source)continue;
   let proof;try{proof=(current.providerInterpretations??[]).some(item=>item.renderedAcquisition===true&&item.v3Observation?.sha256===source.sha256)?loadBrowserPriceRouteProof({jobRoot:knownService?child:path.join(runsRoot,jobId),child,jobId,service:target.serviceId,market:target.targetMarket,sourceHash:source.sha256,checkpoint:attempt}):knownService?loadSinglePriceRouteProof({jobRoot:child,jobId,service:target.serviceId,market:target.targetMarket,sourceHash:source.sha256}):loadRetainedVerifiedEvidence({runsRoot,jobId,service:target.serviceId,market:target.targetMarket,sourceHash:source.sha256});}catch{continue;}
   const acquiredAt=Date.parse(proof.acquiredAt);
   if(proof.sourceUrl!==row.url||!Number.isFinite(acquiredAt)||acquiredAt>Date.parse(recordedAt)||acquiredAt>Date.now())continue;
   const prior=priorSuccess.get(row.service+'|'+row.url)?.lastSuccessAt;
   row.lastSuccessAt=new Date(Math.max(acquiredAt,Number.isFinite(Date.parse(prior))?Date.parse(prior):acquiredAt)).toISOString();
   const currentRoute=memory.routes.get(row.service+'|'+row.url);
   if(currentRoute)currentRoute.lastSuccessAt=row.lastSuccessAt;
   publishPricingRouteMemory(memoryRoot,[row],{jobId,checkpoint:attempt,market:target.targetMarket,recordedAt,acquiredAt:proof.acquiredAt});
   confirmedSuccessUrls.push(row.url);
   confirmedSuccessMethods[row.url]=proof.attempt?.method??proof.method??null;
  }
  if(memoryRoot&&jobId&&recordedAt)publishPricingMethodOutcomes(memoryRoot,{jobId,checkpoint:attempt,service:target.serviceId,market:target.targetMarket,recordedAt,checkpointFile:file,result,confirmedSuccessUrls,confirmedSuccessMethods});
 }
}
const binding=config=>digest({targetingRevision:config.targetingRevision,services:config.services,markets:config.markets,batchTargets:config.batchTargets,logicalTargetCount:config.logicalTargetCount,perTargetRequestCeiling:config.perTargetRequestCeiling,batchRequestCeiling:config.batchRequestCeiling,...(config.researchMode?{researchMode:config.researchMode}:{}),...(config.aiProviders?{aiProviders:config.aiProviders}:{})});
const legacyBinding=config=>digest({targetingRevision:config.targetingRevision,services:config.services,markets:config.markets,cursor:config.cursor??null,batchTargets:config.batchTargets,logicalTargetCount:config.logicalTargetCount,continuationCursor:config.continuationCursor??null,perTargetRequestCeiling:config.perTargetRequestCeiling,batchRequestCeiling:config.batchRequestCeiling});
const progressFile=directory=>path.join(directory,'price-research-batch-progress.json');
const journalFile=directory=>path.join(directory,'price-research-batch-progress.jsonl');
const appendEvent=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});fs.appendFileSync(file,JSON.stringify(value)+'\n',{mode:0o600});};

function initialProgress(config){
 return {version:2,kind:'PRICE_RESEARCH_BATCH_PROGRESS',binding:binding(config),targetingRevision:config.targetingRevision,logicalTargetCount:config.logicalTargetCount,perTargetRequestCeiling:config.perTargetRequestCeiling,batchRequestCeiling:config.batchRequestCeiling,status:'PENDING',nextIndex:0,current:null};
}

function baseOutcomes(config,directory){
 return config.batchTargets.map((target,index)=>({targetId:target.id,serviceId:target.serviceId,targetMarket:target.targetMarket,status:'PENDING',artifactDirectory:path.relative(directory,childDirectory(directory,target,index))}));
}

function applyEvents(config,outcomes,events){
 for(const event of events){
  const target=config.batchTargets[event?.index],outcome=outcomes[event?.index];
  if(!Number.isSafeInteger(event?.index)||!target||event.targetId!==target.id||!['PENDING','RUNNING','COMPLETE','FAILED','STOPPED'].includes(event.status))throw Error('PRICE_RESEARCH_BATCH_BINDING_CHANGED');
  outcome.status=event.status;delete outcome.failureCode;delete outcome.failureScope;delete outcome.startedAt;delete outcome.finishedAt;
  if(typeof event.startedAt==='string')outcome.startedAt=event.startedAt;
  if(typeof event.finishedAt==='string')outcome.finishedAt=event.finishedAt;
  if(event.status==='FAILED'){
   outcome.failureCode=safeCode(event.failureCode);
   if(event.failureScope!==undefined){if(!['TARGET','JOB'].includes(event.failureScope))throw Error('PRICE_RESEARCH_BATCH_BINDING_CHANGED');outcome.failureScope=event.failureScope;}
  }
 }
 return outcomes;
}

function readJournal(config,directory){
 const file=journalFile(directory);if(!fs.existsSync(file))return [];
 const maximum=Math.max(1024*1024,config.batchTargets.length*8192),stat=fs.statSync(file);if(stat.size>maximum)throw Error('PRICE_RESEARCH_PROGRESS_RESOURCE_BOUND');
 return fs.readFileSync(file,'utf8').split('\n').filter(Boolean).map(line=>{try{return JSON.parse(line);}catch{throw Error('PRICE_RESEARCH_BATCH_BINDING_CHANGED');}});
}

export function readPriceResearchBatchProgress(config,directory){
 const file=progressFile(directory);if(!fs.existsSync(file))return null;
 const progress=JSON.parse(fs.readFileSync(file,'utf8')),fresh=initialProgress(config);
 if(progress?.kind!==fresh.kind)throw Error('PRICE_RESEARCH_BATCH_BINDING_CHANGED');
 if(progress.version===1&&Array.isArray(progress.outcomes)){
  if(progress.binding!==legacyBinding(config)||progress.outcomes.length!==config.batchTargets.length||progress.outcomes.some((row,index)=>row.targetId!==config.batchTargets[index].id))throw Error('PRICE_RESEARCH_BATCH_BINDING_CHANGED');
  return {...progress,outcomes:progress.outcomes};
 }
 if(progress.version!==2||progress.binding!==fresh.binding||!Number.isSafeInteger(progress.nextIndex)||progress.nextIndex<0||progress.nextIndex>config.batchTargets.length)throw Error('PRICE_RESEARCH_BATCH_BINDING_CHANGED');
 return {...progress,outcomes:applyEvents(config,baseOutcomes(config,directory),readJournal(config,directory))};
}

function loadProgress(config,directory){
 const file=progressFile(directory),journal=journalFile(directory),existing=readPriceResearchBatchProgress(config,directory);
 if(existing?.version===1){
  const progress={...initialProgress(config),status:existing.status,nextIndex:existing.nextIndex,current:null,outcomes:existing.outcomes};
  const events=progress.outcomes.flatMap((outcome,index)=>outcome.status==='PENDING'?[]:[{index,targetId:config.batchTargets[index].id,status:outcome.status,...(typeof outcome.startedAt==='string'?{startedAt:outcome.startedAt}:{}),...(typeof outcome.finishedAt==='string'?{finishedAt:outcome.finishedAt}:{}),...(outcome.status==='FAILED'?{failureCode:safeCode(outcome.failureCode),...(['TARGET','JOB'].includes(outcome.failureScope)?{failureScope:outcome.failureScope}:{})}:{})}]);
  fs.writeFileSync(journal,events.map(event=>JSON.stringify(event)).join('\n')+(events.length?'\n':''),{mode:0o600});writeJson(file,compact(progress));return {file,journal,progress};
 }
 if(existing)return {file,journal,progress:existing};
 const progress={...initialProgress(config),outcomes:baseOutcomes(config,directory)};writeJson(file,initialProgress(config));return {file,journal,progress};
}

function compact(progress){
 const {outcomes,...summary}=progress;return summary;
}

function record(journal,index,target,status,fields={}){
 const event={index,targetId:target.id,status,...fields};appendEvent(journal,event);return event;
}

function legacyTargetAccessStop(directory,target,index,outcome){
 if(outcome.failureScope!==undefined||outcome.failureCode!=='DIRECT_PROVIDER_AUTHORITY_REQUIRED')return false;
 const file=path.join(childDirectory(directory,target,index),'known-service-v3-verification-retry-1','targets',target.id,'open-web-discovery','journal.jsonl');
 try{
  if(fs.statSync(file).size>4*1024*1024)return false;
  const events=fs.readFileSync(file,'utf8').split('\n').filter(Boolean);
  if(events.length>512)return false;
  const reads=events.map(line=>JSON.parse(line)).filter(event=>event.type==='ACTION_RESULT'&&event.action?.type==='READ'&&event.action.target===target.id);
  const last=reads.at(-1);
  return last?.action?.url===last?.response?.requestedUrl&&last.response.outcome==='ACCESS_CONTROL_STOP'&&last.response.failure?.code==='ROBOTS_ACCESS_STOP';
 }catch{return false;}
}

const suggestedParallelism=value=>value===1||value===2||value===3?value:1;
const firstUnfinished=outcomes=>{const index=outcomes.findIndex(row=>row.status!=='COMPLETE'&&!(row.status==='FAILED'&&row.failureScope==='TARGET'));return index<0?outcomes.length:index;};
const parallelResultFile=(directory,target,index)=>path.join(childDirectory(directory,target,index),'result.json');
const parallelReceiptFile=(directory,target,index)=>path.join(childDirectory(directory,target,index),'suggested-only-completion.json');

function checkedSuggestedResult(result,target,perTarget){
 const row=result?.targets?.[0],usage=row?.capabilityUsage;
 if(result?.kind!=='ADMIN_V4_FIRST_RESEARCH_RESULT'||result.researchMode!=='suggested_only'||result.targets.length!==1||row?.target?.id!==target.id||row?.target?.market!==target.targetMarket||row?.target?.service!==target.serviceId||!Number.isSafeInteger(usage?.googleAiRequests)||usage.googleAiRequests<0||usage.googleAiRequests>perTarget||row?.persisted?.verified!==0||result.downstreamResult!==null||['directAttempts','tavilyAttempts','decodoAttempts','browserAttempts'].some(key=>usage[key]!==0))throw Error('SUGGESTED_ONLY_RESULT_INVALID');
}

function completedParallelResult(config,directory,target,index,perTarget){
 try{
  const receiptFile=parallelReceiptFile(directory,target,index),resultFile=parallelResultFile(directory,target,index);
  if(fs.lstatSync(receiptFile).isSymbolicLink()||fs.lstatSync(resultFile).isSymbolicLink()||fs.statSync(resultFile).size>4*1024*1024)return null;
  const receipt=JSON.parse(fs.readFileSync(receiptFile,'utf8')),bytes=fs.readFileSync(resultFile),result=JSON.parse(bytes);
  if(receipt.kind!=='SUGGESTED_ONLY_COMPLETION'||receipt.binding!==binding(config)||receipt.targetId!==target.id||receipt.resultHash!==createHash('sha256').update(bytes).digest('hex')||!Number.isFinite(Date.parse(receipt.startedAt))||!Number.isFinite(Date.parse(receipt.finishedAt)))return null;
  checkedSuggestedResult(result,target,perTarget);
  return receipt;
 }catch{return null;}
}

async function executeSuggestedOnlyParallelBatch({job,directory,apiKey,client,shouldStop,executeTarget,config,perTarget,file,journal,progress,parallelism,googleRequestGate}){
 const outcomes=progress.outcomes;
 const refresh=()=>{progress.nextIndex=firstUnfinished(outcomes);const index=outcomes.findIndex(row=>row.status==='RUNNING');progress.current=index<0?null:{index,targetId:config.batchTargets[index].id,status:'RUNNING',startedAt:outcomes[index].startedAt};writeJson(file,compact(progress));};
 const update=(index,status,fields={})=>{const target=config.batchTargets[index],outcome=outcomes[index];Object.assign(outcome,record(journal,index,target,status,fields));delete outcome.index;progress.status='RUNNING';refresh();};
 // A completed child is recoverable only after its exact result and binding
 // receipt were durably published. An uncertain request is never replayed.
 const recoverable=new Map();
 for(let index=0;index<outcomes.length;index++){
  const outcome=outcomes[index],target=config.batchTargets[index];
  if(outcome.status==='RUNNING'){
   const receipt=completedParallelResult(config,directory,target,index,perTarget);
   if(!receipt)throw Error('PRICE_RESEARCH_CHILD_RECOVERY_UNSAFE');
   recoverable.set(index,receipt);
  }else if(outcome.status==='FAILED'&&outcome.failureScope!=='TARGET')throw Error('PRICE_RESEARCH_BATCH_CHILD_FAILED');
 }
 for(let index=0;index<outcomes.length;index++){
  const outcome=outcomes[index],receipt=recoverable.get(index);
  if(receipt)update(index,'COMPLETE',{startedAt:receipt.startedAt,finishedAt:receipt.finishedAt});
  else if(outcome.status==='STOPPED'&&!shouldStop())update(index,'PENDING');
 }
 const groups=new Map();
 for(let index=0;index<config.batchTargets.length;index++){
  const service=config.batchTargets[index].serviceId;
  if(!groups.has(service))groups.set(service,[]);
  groups.get(service).push(index);
 }
 const gate=googleRequestGate??createSuggestedOnlyGoogleGate();
 let fatal=null;
 for(const indexes of groups.values()){
  if(fatal||shouldStop())break;
  let cursor=0;
  const worker=async()=>{
   while(cursor<indexes.length&&!fatal&&!shouldStop()){
    const index=indexes[cursor++],target=config.batchTargets[index],outcome=outcomes[index];
    if(outcome.status==='COMPLETE'||outcome.status==='FAILED')continue;
    const childDir=childDirectory(directory,target,index),startedAt=new Date().toISOString();
    try{
     update(index,'RUNNING',{startedAt});
     const result=await executeTarget({job:{...job,config:{objective:'PRICE_RESEARCH',targetKind:'KNOWN_SERVICE',serviceId:target.serviceId,market:target.targetMarket,researchMode:'suggested_only',perTargetRequestCeiling:perTarget,...(config.aiProviders?{aiProviders:config.aiProviders}:{}),capabilities:config.capabilities}},directory:childDir,apiKey,client,shouldStop:()=>false,googleRequestGate:gate});
     checkedSuggestedResult(result,target,perTarget);
     const finishedAt=new Date().toISOString(),resultFile=parallelResultFile(directory,target,index);
     writeJson(resultFile,result);
     const bytes=fs.readFileSync(resultFile);
     writeJson(parallelReceiptFile(directory,target,index),{kind:'SUGGESTED_ONLY_COMPLETION',binding:binding(config),targetId:target.id,resultHash:createHash('sha256').update(bytes).digest('hex'),startedAt,finishedAt});
     update(index,'COMPLETE',{startedAt,finishedAt});
    }catch(error){
     const finishedAt=new Date().toISOString(),targetLocal=error instanceof TargetResearchFailure;
     if(!targetLocal)fatal=error;
     if(shouldStop()&&error?.message==='PRICE_RESEARCH_STOPPED'){update(index,'STOPPED',{startedAt,finishedAt});continue;}
     update(index,'FAILED',{startedAt,finishedAt,failureCode:safeCode(error?.message),failureScope:targetLocal?'TARGET':'JOB'});
    }
   }
  };
  const settled=await Promise.allSettled(Array.from({length:Math.min(parallelism,indexes.length)},worker));
  const journalError=settled.find(row=>row.status==='rejected');
  if(journalError)throw journalError.reason;
  if(fatal)throw Error('PRICE_RESEARCH_BATCH_CHILD_FAILED');
 }
 progress.status=shouldStop()?'STOPPED':'COMPLETE';refresh();return {...progress};
}

export async function executePriceResearchBatch({job,directory,apiKey,client,shouldStop=()=>false,executeTarget,memoryRoot=null,suggestedOnlyParallelism=1,googleRequestGate=null}){
 const config=job?.config;
 const perTarget=perTargetRequestCeiling(config),expectedCeiling=config?.batchTargets?.length*perTarget;
 if(config?.targetKind!=='CANONICAL_SELECTION'||!Array.isArray(config.batchTargets)||config.batchTargets.length<1||config.batchTargets.some(target=>!validTarget(target))||new Set(config.batchTargets.map(target=>`${target.serviceId}:${target.targetMarket}`)).size!==config.batchTargets.length||config.logicalTargetCount!==config.batchTargets.length||config.perTargetRequestCeiling!==perTarget||!Number.isSafeInteger(expectedCeiling)||config.batchRequestCeiling!==expectedCeiling||typeof executeTarget!=='function')throw Error('INVALID_PRICE_RESEARCH_BATCH');
 const {file,journal,progress}=loadProgress(config,directory);let providerPricingRouteMemory=createProviderPricingRouteMemory();
 if(memoryRoot)try{providerPricingRouteMemory=loadPricingRouteMemory(memoryRoot,{services:config.services});}catch{/* Invalid durable hints cannot grant authority or interrupt research. */}
 const parallelism=suggestedParallelism(suggestedOnlyParallelism);
 if(researchModeOf(config)==='suggested_only'&&parallelism>1)return executeSuggestedOnlyParallelBatch({job,directory,apiKey,client,shouldStop,executeTarget,config,perTarget,file,journal,progress,parallelism,googleRequestGate});
 const serialGoogleRequestGate=researchModeOf(config)==='suggested_only'?googleRequestGate??createSuggestedOnlyGoogleGate():null;
 for(let index=0;index<config.batchTargets.length;index++){
  const target=config.batchTargets[index],outcome=progress.outcomes[index];
  if(outcome.status==='COMPLETE'){recoverCompletedPricingRoutes(providerPricingRouteMemory,childDirectory(directory,target,index),target,{memoryRoot,runsRoot:path.dirname(directory),jobId:job.id,recordedAt:outcome.finishedAt});continue;}
  if(outcome.status==='RUNNING')throw Error('PRICE_RESEARCH_CHILD_RECOVERY_UNSAFE');
  if(outcome.status==='FAILED'){
   // Older checkpoints predate typed scopes. Resume only when the target's
   // retained retry journal also proves the access stop behind that code.
   if(outcome.failureScope==='TARGET'||legacyTargetAccessStop(directory,target,index,outcome)){progress.nextIndex=index+1;continue;}
   throw Error('PRICE_RESEARCH_BATCH_CHILD_FAILED');
  }
  if(outcome.status==='STOPPED'&&!shouldStop()){Object.assign(outcome,record(journal,index,target,'PENDING'));delete outcome.index;}
  if(shouldStop()){progress.status='STOPPED';progress.nextIndex=index;progress.current=null;writeJson(file,compact(progress));return {...progress};}
  const childDir=childDirectory(directory,target,index),startedAt=new Date().toISOString();Object.assign(outcome,record(journal,index,target,'RUNNING',{startedAt}));delete outcome.index;progress.status='RUNNING';progress.nextIndex=index;progress.current={index,targetId:target.id,status:'RUNNING',startedAt};writeJson(file,compact(progress));
  let result;
  try{result=await executeTarget({job:{...job,config:{objective:'PRICE_RESEARCH',targetKind:'KNOWN_SERVICE',serviceId:target.serviceId,market:target.targetMarket,...(researchModeOf(config)==='suggested_only'?{researchMode:'suggested_only',perTargetRequestCeiling:perTarget}:{}),...(config.aiProviders?{aiProviders:config.aiProviders}:{}),capabilities:config.capabilities}},directory:childDir,apiKey,client,shouldStop,providerPricingRouteMemory,googleRequestGate:serialGoogleRequestGate});}
  catch(error){
   const finishedAt=new Date().toISOString();
   if(shouldStop()||error?.message==='PRICE_RESEARCH_STOPPED'){Object.assign(outcome,record(journal,index,target,'STOPPED',{startedAt,finishedAt}));delete outcome.index;progress.status='STOPPED';progress.nextIndex=index;progress.current=null;writeJson(file,compact(progress));return {...progress};}
   const failureCode=safeCode(error?.message),targetLocal=error instanceof TargetResearchFailure;
   Object.assign(outcome,record(journal,index,target,'FAILED',{startedAt,finishedAt,failureCode,failureScope:targetLocal?'TARGET':'JOB'}));delete outcome.index;progress.status=targetLocal?'RUNNING':'FAILED';progress.nextIndex=targetLocal?index+1:index;progress.current=null;writeJson(file,compact(progress));
   if(targetLocal)continue;
   throw Error('PRICE_RESEARCH_BATCH_CHILD_FAILED');
  }
  const finishedAt=new Date().toISOString();
  // Result publication and checkpoint writes are job-global persistence work.
  // Their failure leaves RUNNING evidence for safe recovery review.
  writeJson(path.join(childDir,'result.json'),result);Object.assign(outcome,record(journal,index,target,'COMPLETE',{startedAt,finishedAt}));delete outcome.index;progress.nextIndex=index+1;progress.current=null;writeJson(file,compact(progress));recoverCompletedPricingRoutes(providerPricingRouteMemory,childDir,target,{memoryRoot,runsRoot:path.dirname(directory),jobId:job.id,recordedAt:finishedAt,replayFailures:false,result});
 }
 progress.status='COMPLETE';progress.nextIndex=config.batchTargets.length;progress.current=null;writeJson(file,compact(progress));return {...progress};
}
