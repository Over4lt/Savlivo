import fs from 'node:fs';
import {alive} from './artifacts.mjs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
// A numeric PID is not execution ownership. Unknown inspection fails closed.
export function executionWorkerActive(repo,job){return workerActive(repo,job.pid,job.id);}
// The global execution lease excludes every job and the poller during transfer.
export function executionLeaseActive(repo,pid){return pid===process.pid||workerActive(repo,pid,null);}
// Direct mature CLI entrypoints can own the same handoff as an Operations worker.
export function handoffOwnerActive(repo,pid){
 const entries=['run-v15-mature-v2.mjs','reconcile-v15-retained.mjs','prepare-reviewed-continuation.mjs'].map(name=>'docs/catalog/global-47/research-v2/'+name);
 return pid===process.pid||workerActive(repo,pid,null,args=>entries.some(entry=>args.includes(path.join(repo,entry))||args.includes(entry)||args.includes('./'+entry)));
}
// Historical locks require the recorded generation, never a poller or PID equality.
// Legacy lineage without a generation and direct mature CLI owners stay conservative.
export function historicalLifecycleOwnerActive(repo,pid,lineage){
 const entries=['run-v15-mature-v2.mjs','reconcile-v15-retained.mjs','prepare-reviewed-continuation.mjs'].map(name=>'docs/catalog/global-47/research-v2/'+name);
 return workerActive(repo,pid,lineage.executionGeneration??null,args=>entries.some(entry=>args.includes(path.join(repo,entry))||args.includes(entry)||args.includes('./'+entry)),false);
}
function workerActive(repo,pid,jobId,additionalOwner=()=>false,allowPoller=true){
 if(!alive(pid))return false;
 const worker=path.join(repo,'services/api/src/v2-operations/worker.mjs');
 if(process.platform==='linux'){
  try{
   const args=fs.readFileSync(`/proc/${pid}/cmdline`,'utf8').split('\0').filter(Boolean);
   return additionalOwner(args)||(allowPoller&&jobId===null&&args.at(-2)===worker&&args.at(-1)==='--poll')||(args.length>=4&&args.at(-3)===worker&&args.at(-2)==='--execute'&&(jobId===null?/^[a-f0-9-]{36}$/.test(args.at(-1)):args.at(-1)===jobId));
  }catch(error){
   if(error.code==='ENOENT'&&fs.existsSync('/proc/self/cmdline'))return false;
   return true;
  }
 }
 const result=spawnSync('ps',['-p',String(pid),'-o','command='],{encoding:'utf8',timeout:1000,maxBuffer:65536});
 if(result.error)return true;
 if(result.status===1&&!result.stdout.trim()&&!result.stderr.trim())return false;
 if(result.status!==0)return true;
 const command=result.stdout.trim(),id=jobId??command.split(' ').at(-1);
 return additionalOwner(command.split(/\s+/))||(allowPoller&&jobId===null&&command.endsWith(` ${worker} --poll`))||((jobId!==null||/^[a-f0-9-]{36}$/.test(id))&&command.endsWith(` ${worker} --execute ${id}`));
}
