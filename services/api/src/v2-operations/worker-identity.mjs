import fs from 'node:fs';
import {alive} from './artifacts.mjs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
// A numeric PID is not execution ownership. Unknown inspection fails closed.
export function executionWorkerActive(repo,job){
 if(!alive(job.pid))return false;
 const worker=path.join(repo,'services/api/src/v2-operations/worker.mjs');
 if(process.platform==='linux'){
  try{
   const args=fs.readFileSync(`/proc/${job.pid}/cmdline`,'utf8').split('\0').filter(Boolean);
   return args.length>=4&&args.at(-3)===worker&&args.at(-2)==='--execute'&&args.at(-1)===job.id;
  }catch(error){
   if(error.code==='ENOENT'&&fs.existsSync('/proc/self/cmdline'))return false;
   return true;
  }
 }
 const result=spawnSync('ps',['-p',String(job.pid),'-o','command='],{encoding:'utf8',timeout:1000,maxBuffer:65536});
 if(result.error)return true;
 if(result.status===1&&!result.stdout.trim()&&!result.stderr.trim())return false;
 if(result.status!==0)return true;
 return result.stdout.trim().endsWith(` ${worker} --execute ${job.id}`);
}
