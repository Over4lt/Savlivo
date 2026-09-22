import fs from 'node:fs';import {createHash} from 'node:crypto';
import {resolveCapabilities,requireCapability,capabilityLimits} from './config.mjs';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
// Durable intent is never refunded, including dispatch failures and uncertain exits.
export function capabilityLedger(directory,capabilities,{limits=capabilityLimits,model=null}={}){
 const config={capabilities:resolveCapabilities(capabilities),limits,model},file=directory+'/capability-ledger.jsonl';
 fs.mkdirSync(directory,{recursive:true});
 const rows=fs.existsSync(file)?fs.readFileSync(file,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
 const append=row=>{const fd=fs.openSync(file,'a',0o600);try{fs.writeSync(fd,JSON.stringify(row)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}rows.push(row);};
 if(rows.length&&rows[0].fingerprint!==hash(config))throw Error('CAPABILITY_CHECKPOINT_CHANGED');
 if(!rows.length)append({type:'CONFIG',fingerprint:hash(config),...config});
 return {rows,async attempt(kind,{service,url,sourceHash,trigger,policy='v1'},execute){
  requireCapability(config.capabilities,kind);const key=hash({kind,service,url,sourceHash,policy,model});
  const prior=rows.find(r=>r.type==='INTENT'&&r.key===key);
  if(prior){const completed=rows.find(r=>r.type==='RESULT'&&r.key===key);return completed?.result??{status:'HUMAN_REVIEW_REQUIRED',reason:'UNCERTAIN_CAPABILITY_DISPATCH'};}
  const used=rows.filter(r=>r.type==='INTENT'&&r.kind===kind);
  if(used.length>=limits[kind+'PerRun']||used.filter(r=>r.service===service).length>=limits[kind+'PerService'])return {status:'UNRESOLVED',reason:'CAPABILITY_BUDGET_EXHAUSTED'};
  append({type:'INTENT',key,kind,service,url,sourceHash,trigger,model:kind==='groq'?model:null,at:new Date().toISOString()});
  let result;try{result=await execute();}catch{result={status:'UNRESOLVED',reason:'CAPABILITY_FAILED_CLOSED'};}
  append({type:'RESULT',key,kind,service,result,at:new Date().toISOString()});return result;
 }};
}
