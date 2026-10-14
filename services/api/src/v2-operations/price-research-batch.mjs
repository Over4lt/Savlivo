import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const safeCode=value=>typeof value==='string'&&/^[A-Z][A-Z0-9_]{0,159}$/.test(value)?value:'PRICE_RESEARCH_CHILD_FAILED';
const validTarget=target=>target&&typeof target.serviceId==='string'&&/^[a-z0-9][a-z0-9-]{0,159}$/.test(target.serviceId)&&typeof target.serviceName==='string'&&target.serviceName.length>0&&target.serviceName.length<=240&&typeof target.targetMarket==='string'&&/^[A-Z]{2}$/.test(target.targetMarket)&&target.id===`price-research:${target.serviceId}:${target.targetMarket}`&&target.marketApplicabilityEstablished===false;
const writeJson=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});const pending=file+`.${process.pid}.pending`;fs.writeFileSync(pending,JSON.stringify(value,null,2)+'\n',{mode:0o600});fs.renameSync(pending,file);};
const childDirectory=(directory,target,index)=>path.join(directory,'price-research-targets',`${String(index+1).padStart(2,'0')}-${target.serviceId}-${target.targetMarket}`);
const binding=config=>digest({targetingRevision:config.targetingRevision,services:config.services,markets:config.markets,cursor:config.cursor,batchTargets:config.batchTargets,logicalTargetCount:config.logicalTargetCount,continuationCursor:config.continuationCursor,perTargetRequestCeiling:config.perTargetRequestCeiling,batchRequestCeiling:config.batchRequestCeiling});

function initialProgress(config,directory){
 return {version:1,kind:'PRICE_RESEARCH_BATCH_PROGRESS',binding:binding(config),targetingRevision:config.targetingRevision,logicalTargetCount:config.logicalTargetCount,cursor:config.cursor,continuationCursor:config.continuationCursor,perTargetRequestCeiling:config.perTargetRequestCeiling,batchRequestCeiling:config.batchRequestCeiling,status:'PENDING',nextIndex:0,outcomes:config.batchTargets.map((target,index)=>({targetId:target.id,serviceId:target.serviceId,targetMarket:target.targetMarket,status:'PENDING',artifactDirectory:path.relative(directory,childDirectory(directory,target,index))}))};
}

function loadProgress(config,directory){
 const file=path.join(directory,'price-research-batch-progress.json'),fresh=initialProgress(config,directory);
 if(!fs.existsSync(file)){writeJson(file,fresh);return {file,progress:fresh};}
 const progress=JSON.parse(fs.readFileSync(file,'utf8'));
 if(progress?.kind!==fresh.kind||progress.binding!==fresh.binding||progress.outcomes?.length!==fresh.outcomes.length||progress.outcomes.some((row,index)=>row.targetId!==fresh.outcomes[index].targetId))throw Error('PRICE_RESEARCH_BATCH_BINDING_CHANGED');
 return {file,progress};
}

export async function executePriceResearchBatch({job,directory,apiKey,client,shouldStop=()=>false,executeTarget}){
 const config=job?.config;
 if(config?.targetKind!=='CANONICAL_SELECTION'||!Array.isArray(config.batchTargets)||config.batchTargets.length<1||config.batchTargets.length>10||config.batchTargets.some(target=>!validTarget(target))||new Set(config.batchTargets.map(target=>`${target.serviceId}:${target.targetMarket}`)).size!==config.batchTargets.length||!Number.isSafeInteger(config.logicalTargetCount)||config.logicalTargetCount<config.batchTargets.length||config.perTargetRequestCeiling!==96||config.batchRequestCeiling!==config.batchTargets.length*96||config.batchRequestCeiling>960||typeof executeTarget!=='function')throw Error('INVALID_PRICE_RESEARCH_BATCH');
 const {file,progress}=loadProgress(config,directory);
 for(let index=0;index<config.batchTargets.length;index++){
  const target=config.batchTargets[index],outcome=progress.outcomes[index];
  if(outcome.status==='COMPLETE')continue;
  if(outcome.status==='RUNNING')throw Error('PRICE_RESEARCH_CHILD_RECOVERY_UNSAFE');
  if(outcome.status==='FAILED')throw Error('PRICE_RESEARCH_BATCH_CHILD_FAILED');
  if(outcome.status==='STOPPED'||shouldStop()){progress.status='STOPPED';progress.nextIndex=index;writeJson(file,progress);return {...progress};}
  const childDir=childDirectory(directory,target,index);outcome.status='RUNNING';outcome.startedAt=new Date().toISOString();progress.status='RUNNING';progress.nextIndex=index;writeJson(file,progress);
  try{
   const result=await executeTarget({job:{...job,config:{objective:'PRICE_RESEARCH',targetKind:'KNOWN_SERVICE',serviceId:target.serviceId,market:target.targetMarket,capabilities:config.capabilities}},directory:childDir,apiKey,client,shouldStop});
   writeJson(path.join(childDir,'result.json'),result);outcome.status='COMPLETE';outcome.finishedAt=new Date().toISOString();progress.nextIndex=index+1;writeJson(file,progress);
  }catch(error){
   if(shouldStop()||error?.message==='PRICE_RESEARCH_STOPPED'){outcome.status='STOPPED';outcome.finishedAt=new Date().toISOString();progress.status='STOPPED';progress.nextIndex=index;writeJson(file,progress);return {...progress};}
   outcome.status='FAILED';outcome.failureCode=safeCode(error?.message);outcome.finishedAt=new Date().toISOString();progress.status='FAILED';progress.nextIndex=index;writeJson(file,progress);throw Error('PRICE_RESEARCH_BATCH_CHILD_FAILED');
  }
 }
 progress.status='COMPLETE';progress.nextIndex=config.batchTargets.length;writeJson(file,progress);return {...progress};
}
