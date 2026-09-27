// Best-effort scalar telemetry only; never imported by the offline verifier.
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

// Bound reads even for procfs files, whose stat size is often zero.
function smallRead(file){
 let fd;try{fd=fs.openSync(file,'r');const b=Buffer.alloc(4096);const n=fs.readSync(fd,b,0,b.length,null);return n<b.length?b.toString('utf8',0,n).trim():null;}catch{return null;}finally{if(fd!==undefined)try{fs.closeSync(fd);}catch{}}
}
function bytes(text){if(!/^\d+$/.test(text??''))return null;const n=Number(text);return Number.isSafeInteger(n)?n:null;}
export function containerMemory(root='/sys/fs/cgroup'){
 for(const [version,usage,limit] of [[2,'memory.current','memory.max'],[1,'memory/memory.usage_in_bytes','memory/memory.limit_in_bytes']]){
  const current=bytes(smallRead(path.join(root,usage)));if(current===null)continue;
  return {cgroupVersion:version,cgroupCurrentBytes:current,cgroupLimitBytes:bytes(smallRead(path.join(root,limit)))};
 }
 return {cgroupVersion:null,cgroupCurrentBytes:null,cgroupLimitBytes:null};
}

// Two records per invocation, no timer/history/state traversal and no fsync.
// Location supplies acquisition/interpretation correlation without payloads or URLs.
export function verificationDiagnostics(directory){
 let session,start,finished=false;
 const emit=(event,childPid=null,exitCode=null,signal=null)=>{try{
  const m=process.memoryUsage();
  const record={version:1,at:new Date().toISOString(),event,session,parentPid:process.pid,childPid,
   exitCode,signal,durationMs:event==='TARGETED_VERIFICATION_START'?null:Number(process.hrtime.bigint()-start)/1e6,
   rssBytes:m.rss,heapUsedBytes:m.heapUsed,externalBytes:m.external,arrayBuffersBytes:m.arrayBuffers,...containerMemory()};
  fs.appendFileSync(path.join(directory,'targeted-runtime-diagnostics.jsonl'),JSON.stringify(record)+'\n',{mode:0o600});
 }catch{}};
 try{session=randomUUID();start=process.hrtime.bigint();emit('TARGETED_VERIFICATION_START');}catch{}
 return (event,pid,code,signal)=>{if(finished)return;finished=true;emit(event,pid??null,code??null,signal??null);};
}
