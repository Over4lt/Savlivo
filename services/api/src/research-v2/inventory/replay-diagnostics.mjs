// Diagnostic state only: never an evidence receipt, checkpoint or recovery instruction.
import fs from 'node:fs';
import path from 'node:path';
import {streamJson} from '../storage/core.mjs';
export const replayDiagnosticVersion=1;
export const replayStages=Object.freeze(['INPUT_LOAD','SOURCE_PREPARATION','ACCOUNT_ACCESS_INSPECTION','NAVIGATION_EXTRACTION','REPLAY_RECORD_LOOKUP','INTERPRETATION_RESERVATION','SOURCE_VALIDATION','ACQUISITION_RECORD','INTERPRETATION','TARGETED_VERIFICATION','SOURCE_ENRICHMENT','REPLAY_RECORD_PERSISTENCE','RESERVATION_REMOVAL','VERIFIED_RESULT_INTEGRATION','PRICE_EVIDENCE_NEEDS_MERGE','QUARANTINE_REVIEW_INTEGRATION','RESEARCH_MEMORY','LEAD_INTEGRATION','PAGES_PUBLICATION','CANCELLATION_REVIEW','RESULT_PUBLICATION']);
const bestEffort=fn=>{try{return fn();}catch{return undefined;}};
const token=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x)?x:null;
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x)?x:null;
const safeUrl=x=>{try{const u=new URL(x);return ['http:','https:'].includes(u.protocol)?(u.origin+u.pathname).slice(0,2048):null;}catch{return null;}};
// Preserve exact machine errors; never persist arbitrary exception text (which
// can include bodies, URL credentials, queries or filesystem contents).
export function replayError(error){const message=error?.message;return {name:token(error?.name)??'Error',code:typeof message==='string'&&/^[A-Z][A-Z0-9_]{0,159}$/.test(message)?message:token(error?.code)??'UNCLASSIFIED_EXCEPTION',messageClassification:typeof message==='string'&&/^[A-Z][A-Z0-9_]{0,159}$/.test(message)?'EXACT_MACHINE_MESSAGE':'UNSAFE_MESSAGE_OMITTED'};}
export function projectionMetrics(value){
 if(value==null)return null;
 const limit=4*1024*1024;let bytes=0,complete=true;
 try{streamJson(value,chunk=>{bytes+=Buffer.byteLength(chunk);if(bytes>limit)throw Error('DIAGNOSTIC_MEASUREMENT_BOUND');});}catch{complete=false;}
 return {sources:Array.isArray(value.sources)?value.sources.length:null,claims:Array.isArray(value.claims)?value.claims.length:null,serializedBytes:complete?bytes:null,measurementComplete:complete,measurementByteLimit:limit};
}
export function replayDiagnostics(directory,targetId){
 const file=path.join(directory,'replay-progress.json');
 const state={version:replayDiagnosticVersion,meaning:'DIAGNOSTIC_ONLY_NOT_ADMISSION_OR_RECOVERY',targetId:token(targetId),status:'RUNNING',stage:'INPUT_LOAD',selectedSourceCount:null,current:null,lastIntegrated:null};
 const save=()=>{
  const pending=file+'.pending';let opened=false;
  try{
   const bytes=Buffer.from(JSON.stringify(state,null,2)+'\n');
   const fd=fs.openSync(pending,'w',0o600);opened=true;
   try{let offset=0;while(offset<bytes.length){const n=fs.writeSync(fd,bytes,offset,bytes.length-offset);if(!Number.isInteger(n)||n<=0||n>bytes.length-offset)throw Error('DIAGNOSTIC_WRITE_NO_PROGRESS');offset+=n;}fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
   fs.renameSync(pending,file);opened=false;
   // Same directory-fsync pattern as storage/core; still diagnostic-only.
   const dir=fs.openSync(directory,'r');try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}
  }catch(error){bestEffort(()=>{state.persistenceError=replayError(error);});}
  finally{if(opened)bestEffort(()=>fs.unlinkSync(pending));}
 };
 const methods={
  stage(stage,identity={}){if(!replayStages.includes(stage))return;state.stage=stage;if(state.current&&identity.runDirectory)state.current.acquisition=token(path.basename(identity.runDirectory));save();},
  inputs(count){state.selectedSourceCount=count;save();},
  source(page,ordinal){state.current={ordinal,sourceHash:hash(page.bodyHash),url:safeUrl(page.url),replayRecord:null,acquisition:null,recordPersisted:false,integrationComplete:false};state.stage='SOURCE_PREPARATION';save();},
  record(file,price){state.current.replayRecord=token(path.basename(file));if(price?.runDirectory)state.current.acquisition=token(path.basename(price.runDirectory));save();},
  persisted(){state.current.recordPersisted=true;save();},
  integrated(){state.current.integrationComplete=true;state.lastIntegrated={...state.current};save();},
  complete(){state.status='COMPLETE';save();},
  fail(error,metrics){state.status='FAILED';state.error=replayError(error);if(metrics)state.metrics=metrics;save();const diagnostic=structuredClone(state);try{Object.defineProperty(error,'replayDiagnostic',{value:diagnostic,configurable:true});}catch{}bestEffort(()=>console.error(JSON.stringify({event:'V2_RETAINED_REPLAY_FAILED',...diagnostic})));return diagnostic;}
 };
 return Object.fromEntries(Object.entries(methods).map(([name,fn])=>[name,(...args)=>bestEffort(()=>fn(...args))]));
}
// Preserve the existing high-level disposition and fail-closed error predicate.
export function retainedReplayFailure(error,artifact){
 if(/HASH|AUTHORITY|POLICY/.test(error.message))throw error;
 return {reason:'RETAINED_INTERPRETATION_REVIEW_REQUIRED',artifact,rawEvidencePreserved:true,...(error.replayDiagnostic?{diagnostic:error.replayDiagnostic}:{})};
}
