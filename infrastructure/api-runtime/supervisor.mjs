import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const repositoryRoot=fileURLToPath(new URL('../../',import.meta.url));
export const browserHost='127.0.0.1';
export const browserPort=3001;
export const startupTimeoutMs=20_000;
export const shutdownGraceMs=20_000;

const safeLocale=value=>typeof value==='string'&&/^[A-Za-z0-9_.@-]{1,80}$/.test(value)?value:undefined;

export function playwrightChildEnvironment(base=process.env){
 const env={PATH:base.PATH||'/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',HOME:'/home/pwuser',PLAYWRIGHT_BROWSERS_PATH:'/ms-playwright',NODE_ENV:'production'};
 for(const name of ['LANG','LC_ALL']){const value=safeLocale(base[name]);if(value)env[name]=value;}
 return Object.freeze(env);
}

export function pwuserIdentity(passwd=fs.readFileSync('/etc/passwd','utf8')){
 const fields=String(passwd).split('\n').find(line=>line.startsWith('pwuser:'))?.split(':');
 const uid=Number(fields?.[2]),gid=Number(fields?.[3]);
 if(!Number.isSafeInteger(uid)||uid<1||!Number.isSafeInteger(gid)||gid<1)throw Error('PWUSER_IDENTITY_UNAVAILABLE');
 return Object.freeze({uid,gid});
}

export function runtimeConfiguration(env=process.env,{root=repositoryRoot,passwd}={}){
 if(env.SAVLIVO_BROWSER_RUNTIME!=='LOCAL_CONTAINER')throw Error('LOCAL_CONTAINER_BROWSER_RUNTIME_REQUIRED');
 if(env.SAVLIVO_BROWSER_WS_ENDPOINT)throw Error('BROWSER_ENDPOINT_OVERRIDE_FORBIDDEN');
 const identity=pwuserIdentity(passwd),cli=path.join(root,'infrastructure/browser-runtime/node_modules/playwright/cli.js'),api=path.join(root,'services/api/scripts/production-runtime.mjs');
 for(const file of [cli,api])if(!fs.existsSync(file))throw Error('RUNTIME_FILE_MISSING:'+path.relative(root,file));
 return Object.freeze({root,browser:Object.freeze({name:'playwright',command:process.execPath,args:[cli,'run-server','--host',browserHost,'--port',String(browserPort),'--max-clients','1'],cwd:root,env:playwrightChildEnvironment(env),stdin:'pipe',...identity}),api:Object.freeze({name:'api-runtime',command:process.execPath,args:[api],cwd:root,env})});
}

function signalGroup(child,signal){if(!child?.pid)return;try{process.kill(-child.pid,signal);}catch(error){if(error.code!=='ESRCH')throw error;}}
function launch(spec){return spawn(spec.command,spec.args,{cwd:spec.cwd,env:spec.env,uid:spec.uid,gid:spec.gid,detached:true,stdio:spec.stdin==='pipe'?['pipe','inherit','inherit']:'inherit'});}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export async function waitForBrowser({host=browserHost,port=browserPort,timeoutMs=startupTimeoutMs,stopped=()=>false}={}){
 const deadline=Date.now()+timeoutMs;
 while(Date.now()<deadline){
  if(stopped())throw Error('PLAYWRIGHT_SERVER_EXITED_DURING_STARTUP');
  const ready=await new Promise(resolve=>{const socket=net.createConnection({host,port});socket.setTimeout(250);socket.once('connect',()=>{socket.destroy();resolve(true);});const failed=()=>{socket.destroy();resolve(false);};socket.once('error',failed);socket.once('timeout',failed);});
  if(ready)return;await delay(50);
 }
 throw Error('PLAYWRIGHT_SERVER_START_TIMEOUT');
}

export async function supervise(config=runtimeConfiguration(),{graceMs=shutdownGraceMs,log=event=>console.log(JSON.stringify(event))}={}){
 if(process.platform==='win32')throw Error('POSIX_PROCESS_GROUPS_REQUIRED');
 let browser,api,stopping=false,browserExited=false,resolveDone;
 const done=new Promise(resolve=>resolveDone=resolve),emit=(event,extra={})=>log({component:'savlivo-container-runtime',event,...extra});
 let exitCode=0,shutdownTimer;
 const stop=(reason,code=0,signal='SIGTERM')=>{
  if(stopping)return;stopping=true;exitCode=code;emit('STOPPING',{reason,signal});
  try{signalGroup(api,signal);}catch(error){emit('SIGNAL_ERROR',{code:error.code});exitCode=1;}
  try{browser?.stdin?.end();browser?.stdin?.destroy();signalGroup(browser,'SIGINT');}catch(error){emit('SIGNAL_ERROR',{code:error.code});exitCode=1;}
  shutdownTimer=setTimeout(()=>{for(const child of [api,browser])try{signalGroup(child,'SIGKILL');}catch{}resolveDone(exitCode||1);},graceMs);
 };
 const settled=()=>{if(stopping&&(!api||api.exitCode!==null||api.signalCode!==null)&&(!browser||browser.exitCode!==null||browser.signalCode!==null)){clearTimeout(shutdownTimer);resolveDone(exitCode);}};
 const term=()=>stop('HOST_SIGNAL',0,'SIGTERM'),interrupt=()=>stop('HOST_SIGNAL',0,'SIGINT');process.on('SIGTERM',term);process.on('SIGINT',interrupt);
 try{
  browser=launch(config.browser);browser.once('spawn',()=>emit('CHILD_STARTED',{name:'playwright',pid:browser.pid,uid:config.browser.uid}));browser.once('error',error=>stop('PLAYWRIGHT_SPAWN_ERROR',1));browser.once('exit',(code,signal)=>{browserExited=true;emit('CHILD_EXIT',{name:'playwright',code,signal});if(!stopping)stop('PLAYWRIGHT_EXITED',1);settled();});
  await waitForBrowser({stopped:()=>browserExited});emit('PLAYWRIGHT_READY',{host:browserHost,port:browserPort});
  if(stopping)return await done;
  api=launch(config.api);api.once('spawn',()=>emit('CHILD_STARTED',{name:'api-runtime',pid:api.pid}));api.once('error',()=>stop('API_SPAWN_ERROR',1));api.once('exit',(code,signal)=>{emit('CHILD_EXIT',{name:'api-runtime',code,signal});if(!stopping)stop('API_EXITED',code??1);settled();});
  return await done;
 }catch(error){stop(error.message,1);return await done;}
 finally{clearTimeout(shutdownTimer);process.off('SIGTERM',term);process.off('SIGINT',interrupt);}
}

export async function main(){return supervise(runtimeConfiguration());}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))process.exitCode=await main().catch(error=>{console.error('SAVLIVO_CONTAINER_RUNTIME_START_FAILED '+error.message);return 1;});
