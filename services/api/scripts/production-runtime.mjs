// Process supervision only. No research planning, credentials or transport here.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const shutdownGraceMs=20_000;
export const featureGates=['ANALYTICS_V2_OPERATIONS_ENABLED','ANALYTICS_V2_RUN_CONTROL_ENABLED','ANALYTICS_V2_SCHEDULING_ENABLED'];
export const repositoryRoot=fileURLToPath(new URL('../../../',import.meta.url));
export function runtimeConfiguration(env=process.env){
 const root=path.resolve(repositoryRoot);
 if(env.V2_OPERATIONS_REPOSITORY_ROOT&&path.resolve(env.V2_OPERATIONS_REPOSITORY_ROOT)!==root)throw Error('RUNTIME_REPOSITORY_ROOT_MISMATCH');
 const configured={...env,V2_OPERATIONS_REPOSITORY_ROOT:root};
 for(const gate of featureGates){if(configured[gate]===undefined)configured[gate]='false';if(!['true','false'].includes(configured[gate]))throw Error('INVALID_RUNTIME_FEATURE_GATE');}
 return {cwd:root,env:configured,children:[
  {name:'api',args:[path.join(root,'services/api/dist/services/api/src/server.js')]},
  {name:'v2-poller',args:['--import','tsx',path.join(root,'services/api/src/v2-operations/worker.mjs'),'--poll'],ipc:true}
 ]};
}
function signalGroup(pid,signal){if(!pid)return;try{process.kill(-pid,signal);}catch(e){if(e.code!=='ESRCH')throw e;}}
function groupAlive(pid){if(!pid)return false;try{process.kill(-pid,0);return true;}catch(e){return e.code!=='ESRCH';}}

// Exported for subprocess smoke tests with local, network-free child fixtures.
export async function supervise({children,cwd,env=process.env,graceMs=shutdownGraceMs,log=e=>console.log(JSON.stringify(e))}){
 if(process.platform==='win32')throw Error('POSIX_PROCESS_GROUPS_REQUIRED');
 if(!Number.isInteger(graceMs)||graceMs<100||graceMs>shutdownGraceMs)throw Error('INVALID_SHUTDOWN_GRACE');
 const running=[];let stopping=false,code=0,forced=false,timer,poll,finish;
 const result=new Promise(resolve=>{finish=resolve;});
 const emit=(event,extra={})=>log({component:'savlivo-runtime',event,...extra});
 const clean=()=>{clearTimeout(timer);clearInterval(poll);process.off('SIGTERM',term);process.off('SIGINT',interrupt);};
 const check=()=>{if(stopping&&running.every(r=>r.exited)&&running.every(r=>!groupAlive(r.child.pid))){clean();finish(code);}};
 const stop=(signal='SIGTERM',exitCode=0)=>{
  if(stopping)return;stopping=true;code=exitCode;emit('STOPPING',{signal,graceMs});
  // Signal leaders first. The poller drains its execution children at native checkpoints.
  for(const r of running)try{if(!r.exited)r.child.kill(signal);else signalGroup(r.child.pid,'SIGTERM');}catch(e){emit('SIGNAL_ERROR',{name:r.name,code:e.code});code=1;}
  timer=setTimeout(()=>{
   forced=true;emit('SHUTDOWN_DEADLINE');
   for(const r of running)try{signalGroup(r.child.pid,'SIGKILL');}catch(e){emit('SIGNAL_ERROR',{name:r.name,code:e.code});code=1;}
   // No unbounded shutdown: Render may enforce its own final process deadline.
   timer=setTimeout(()=>{clean();finish(code||1);},1000);
   check();
  },graceMs);
  poll=setInterval(check,50);check();
 };
 const term=()=>stop('SIGTERM'),interrupt=()=>stop('SIGINT');
 process.on('SIGTERM',term);process.on('SIGINT',interrupt);
 for(const spec of children){
  if(stopping)break;
  try{
   const child=spawn(process.execPath,spec.args,{cwd,env,detached:true,stdio:spec.ipc?['inherit','inherit','inherit','ipc']:'inherit'});
   const record={name:spec.name,child,exited:false};running.push(record);
   child.once('spawn',()=>emit('CHILD_STARTED',{name:spec.name,pid:child.pid}));
   child.once('error',e=>{record.exited=true;emit('CHILD_ERROR',{name:spec.name,code:e.code});stop('SIGTERM',1);check();});
   child.once('exit',(exitCode,signal)=>{record.exited=true;emit('CHILD_EXIT',{name:spec.name,exitCode,signal});if(!stopping)stop('SIGTERM',1);check();});
  }catch(e){emit('SPAWN_ERROR',{name:spec.name,code:e.code});stop('SIGTERM',1);}
 }
 const exitCode=await result;emit('STOPPED',{exitCode,forced});return exitCode;
}
export async function main(){
 const config=runtimeConfiguration();
 for(const file of [config.children[0].args[0],config.children[1].args[2]])if(!fs.existsSync(file))throw Error('RUNTIME_FILE_MISSING:'+path.relative(config.cwd,file));
 import.meta.resolve('tsx');
 return supervise(config);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{process.exitCode=await main();}catch(e){console.error('SAVLIVO_RUNTIME_START_FAILED',e.message);process.exitCode=1;}
}
