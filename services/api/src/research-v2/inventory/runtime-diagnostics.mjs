// Scalar-only best-effort telemetry; never part of campaign state or hashes.
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {monitorEventLoopDelay} from 'node:perf_hooks';
// No periodic logging: volume is proportional to existing bounded campaign work.
// Every operation is paired; only ASSESS is sampled (first, then each 32nd).
// No global cutoff may hide the final expensive boundary of a long run.
let histogram,users=0;
export function runtimeDiagnostics(directory){
 let fd,monitor=false,sequence=0,assessments=0;const session=randomUUID();
 try{fd=fs.openSync(directory+'/runtime-diagnostics.jsonl','a',0o600);}catch{}
 try{histogram??=monitorEventLoopDelay({resolution:100});if(users===0)histogram.enable();users++;monitor=true;}catch{}
 const emit=(event,operationId=null,durationMs=null)=>{try{
  const m=process.memoryUsage(),samples=monitor?histogram.count:0;
  const record={version:1,at:new Date().toISOString(),pid:process.pid,session,sequence:++sequence,event,operationId,durationMs,rssBytes:m.rss,heapTotalBytes:m.heapTotal,heapUsedBytes:m.heapUsed,externalBytes:m.external,arrayBuffersBytes:m.arrayBuffers,maxRssKiB:process.resourceUsage().maxRSS,eventLoopSamples:samples,eventLoopMaxMs:samples?histogram.max/1e6:null,eventLoopMeanMs:samples?histogram.mean/1e6:null};
  if(monitor)histogram.reset();if(fd!==undefined)fs.writeSync(fd,JSON.stringify(record)+'\n');
 }catch{}};
 const start=name=>{const enabled=name!=='ASSESS'||assessments++%32===0;const id=sequence+1,time=process.hrtime.bigint();if(enabled)emit(name+'_START',id);return {enabled,id,time,name};};
 const finish=(span,suffix)=>{if(span.enabled)emit(span.name+'_'+suffix,span.id,Number(process.hrtime.bigint()-span.time)/1e6);};
 return {emit,
  sync(name,fn){const span=start(name);try{const value=fn();finish(span,'END');return value;}catch(error){finish(span,'ERROR');throw error;}},
  async async(name,fn){const span=start(name);try{const value=await fn();finish(span,'END');return value;}catch(error){finish(span,'ERROR');throw error;}},
  close(){try{if(fd!==undefined)fs.closeSync(fd);}catch{}try{if(monitor&&--users===0)histogram.disable();}catch{}}
 };
}
