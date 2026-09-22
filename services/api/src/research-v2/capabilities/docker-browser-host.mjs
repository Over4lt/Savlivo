import assert from 'node:assert/strict';
import {spawn,execFile} from 'node:child_process';
import {existsSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {homedir,tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {promisify} from 'node:util';
const exec=promisify(execFile);
export const dockerBrowserImage='mcr.microsoft.com/playwright@sha256:68f1c3dca663d0e8331e8af4681b0b315eca7de1bd7fa934aac0accbeb9f8323';
export const dockerBrowserSeccomp=fileURLToPath(new URL('../../research-v1/browser-isolation/seccomp-chromium.json',import.meta.url));
const bridge=readFileSync(new URL('../../research-v1/browser-isolation/bridge.cjs',import.meta.url),'utf8');
export const browserStartupReasons=Object.freeze(['BROWSER_RUNTIME_UNAVAILABLE','DOCKER_UNAVAILABLE','DOCKER_IMAGE_MISSING','CHROMIUM_SANDBOX_UNAVAILABLE','BROWSER_CLOSED','BROWSER_COMMAND_TIMEOUT','BROWSER_PROTOCOL_ERROR','BROWSER_ISOLATION_PREFLIGHT_FAILED','BROWSER_CLEANUP_FAILED']);
const error=code=>Object.assign(new Error(code),{code});
export function dockerBrowserLaunch({name,config,socket,binary}){
 assert(/^research-browser-[a-f0-9-]+$/.test(name));assert(socket.startsWith('/'));
 const base=['--host','unix://'+socket,'--config',config];
 return {binary,base,args:[...base,'run','--name',name,'--rm','--pull=never','--network=none','--cap-drop=ALL',
  '--security-opt=no-new-privileges','--security-opt=seccomp='+dockerBrowserSeccomp,'--user=1000:1000','--read-only',
  '--tmpfs=/tmp:rw,nosuid,nodev,size=128m,mode=1777','--shm-size=128m','--pids-limit=256','--memory=1g','--cpus=1','--ulimit=core=0','--init','-i',
  '--entrypoint=/usr/bin/env',dockerBrowserImage,'-i','PATH=/usr/local/bin:/usr/bin:/bin','HOME=/tmp','TMPDIR=/tmp','node','-e',bridge],
  env:{PATH:'/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin',HOME:config,TMPDIR:config}};
}
// No remote Docker endpoint, inherited Docker configuration, proxy or credential env.
export async function checkDockerBrowser({run,base}){
 try{await run([...base,'version','--format','{{.Server.Version}}']);}catch{throw error('DOCKER_UNAVAILABLE');}
 try{await run([...base,'image','inspect',dockerBrowserImage,'--format','{{.Id}}']);}catch{throw error('DOCKER_IMAGE_MISSING');}
}
export function sandboxStatusVerified(text){return typeof text==='string'&&/Layer 1 Sandbox\s+Namespace/.test(text)&&['PID namespaces','Network namespaces','Seccomp-BPF sandbox','Seccomp-BPF sandbox supports TSYNC'].every(k=>text.includes(k+'\tYes'));}
export async function verifyNativeSandbox(send){
 let targetId;
 try{
  ({targetId}=await send('Target.createTarget',{url:'chrome://sandbox'}));
  const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
  for(let i=0;i<20;i++){
   const r=await send('Runtime.evaluate',{expression:'document.body.innerText',returnByValue:true},sessionId);
   if(!r.exceptionDetails&&sandboxStatusVerified(r.result?.value))return true;
   await new Promise(r=>setTimeout(r,100));
  }
  throw error('CHROMIUM_SANDBOX_UNAVAILABLE');
 }finally{if(targetId)await send('Target.closeTarget',{targetId});}
}
export async function openOfflineBrowser(){
 const binary=['/usr/local/bin/docker','/opt/homebrew/bin/docker','/usr/bin/docker'].find(existsSync);
 const socket=[join(homedir(),'.docker/run/docker.sock'),'/var/run/docker.sock'].find(existsSync);
 if(!binary||!socket)throw error('DOCKER_UNAVAILABLE');
 const config=mkdtempSync(join(tmpdir(),'research-docker-')),name='research-browser-'+randomUUID();
 writeFileSync(join(config,'config.json'),'{}',{mode:0o600});
 const launch=dockerBrowserLaunch({binary,socket,config,name});
 const run=args=>exec(binary,args,{env:launch.env,timeout:5000,maxBuffer:8192});
 try{await checkDockerBrowser({run,base:launch.base});}catch(e){rmSync(config,{recursive:true,force:true});throw e;}
 const child=spawn(binary,launch.args,{env:launch.env,stdio:['pipe','pipe','pipe']});
 let closed=false,next=0,buffer=Buffer.alloc(0),stderrBytes=0,cleanupPromise;
 const pending=new Map(),listeners=new Set();
 const rejectAll=()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(error('BROWSER_CLOSED'));}pending.clear();};
 child.on('error',()=>{closed=true;rejectAll();});child.on('exit',()=>{closed=true;rejectAll();});
 child.stdin.on('error',rejectAll);child.stdout.on('error',rejectAll);
 // Never forward arbitrary browser stderr to operator logs or evidence.
 child.stderr.on('data',chunk=>{stderrBytes=Math.min(8192,stderrBytes+chunk.length);});
 child.stdout.on('data',chunk=>{
  buffer=Buffer.concat([buffer,chunk]);if(buffer.length>([...pending.values()].some(p=>p.method==='Page.captureScreenshot')?64000000:3000000)){rejectAll();child.stdin.destroy();return;}
  let i;while((i=buffer.indexOf(0))>=0){const frame=buffer.subarray(0,i);buffer=buffer.subarray(i+1);let m;
   try{m=JSON.parse(frame);}catch{rejectAll();child.stdin.destroy();return;}
   if(m.id){const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Object.assign(error('BROWSER_PROTOCOL_ERROR'),{operation:p.method})):p.resolve(m.result);}}
   else for(const listener of listeners)listener(m);
  }
 });
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{
  if(closed){reject(error('BROWSER_CLOSED'));return;}
  const id=++next,frame=JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})})+'\0';
  if(Buffer.byteLength(frame)>3000000){reject(error('BROWSER_PROTOCOL_ERROR'));return;}
  const timer=setTimeout(()=>{pending.delete(id);reject(error('BROWSER_COMMAND_TIMEOUT'));},method==='Page.captureScreenshot'?30000:method==='Browser.getVersion'?10000:3000);
  pending.set(id,{resolve,reject,timer,method});child.stdin.write(frame);
 });
 const close=()=>cleanupPromise??=(async()=>{
  try{if(!closed)await send('Browser.close');}catch{}
  child.stdin.destroy();
  try{await run([...launch.base,'container','rm','--force',name]);}catch{}
  try{
   const {stdout}=await run([...launch.base,'container','ls','--all','--filter','name=^/'+name+'$','--format','{{.ID}}']);
   if(stdout.trim())throw error('BROWSER_CLEANUP_FAILED');
  }catch{throw error('BROWSER_CLEANUP_FAILED');}
  finally{rejectAll();child.kill('SIGTERM');child.stdout.destroy();child.stderr.destroy();rmSync(config,{recursive:true,force:true});}
 })();
 try{
  const version=await send('Browser.getVersion');assert(typeof version.product==='string');
  await verifyNativeSandbox(send);
  return {send,onEvent:fn=>listeners.add(fn),close,revision:version.product,networkIsolation:'OS_DENY_TCP_UDP',nativeSandbox:true};
 }catch(e){await close();throw e;}
}
