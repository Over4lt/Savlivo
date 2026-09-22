// Runs inside the network-free container. CDP only; no acquisition or credentials.
'use strict';
const {spawn}=require('node:child_process');
const {Transform}=require('node:stream');
const {mkdtempSync}=require('node:fs');
if(process.getuid()===0||Object.keys(process.env).some(k=>!['PATH','HOME','TMPDIR'].includes(k)))process.exit(70);
const profile=mkdtempSync('/tmp/research-browser-');
const child=spawn('/ms-playwright/chromium-1208/chrome-linux/chrome',[
 '--headless=new','--remote-debugging-pipe','--no-first-run','--no-default-browser-check',
 '--disable-background-networking','--disable-component-update','--disable-extensions',
 '--disable-sync','--disable-quic','--noerrdialogs','--user-data-dir='+profile,'about:blank'
],{env:process.env,stdio:['ignore','ignore','pipe','pipe','pipe']});
let stopping=false,stderrBytes=0;
const stop=()=>{if(stopping)return;stopping=true;child.kill('SIGTERM');setTimeout(()=>child.kill('SIGKILL'),500).unref();};
let watchdog=setTimeout(stop,45000);
const screenshots=new Set();
// Acquisition commands retain the original frame/total limits. Screenshot
// responses have a separate transfer envelope within the 1 GB container.
function boundedInput(){let buffer=Buffer.alloc(0),total=0;return new Transform({transform(chunk,encoding,done){
 total+=chunk.length;if(total>64000000){done(Error('CDP_TOTAL_BOUND'));return;}
 buffer=Buffer.concat([buffer,chunk]);let i;
 while((i=buffer.indexOf(0))>=0){const frame=buffer.subarray(0,i);buffer=buffer.subarray(i+1);if(frame.length>3000000){done(Error('CDP_FRAME_BOUND'));return;}
  try{const m=JSON.parse(frame);
   if(m.method==='Emulation.setScriptExecutionDisabled'&&m.params?.value===true){clearTimeout(watchdog);watchdog=setTimeout(stop,120000);}
   if(m.method==='Page.captureScreenshot')screenshots.add(m.id);
  }catch{done(Error('CDP_FRAME_INVALID'));return;}
 }
 if(buffer.length>3000000){done(Error('CDP_FRAME_BOUND'));return;}done(null,chunk);
}});}
function boundedOutput(){let parts=[],size=0,discard=false,total=0,visualTotal=0;return new Transform({transform(chunk,encoding,done){
 let start=0;
 for(let i=0;i<=chunk.length;i++)if(i===chunk.length||chunk[i]===0){
  const part=chunk.subarray(start,i);size+=part.length;
  if(size>(screenshots.size?64000000:3000000)){if(!screenshots.size){done(Error('CDP_FRAME_BOUND'));return;}discard=true;parts=[];}
  if(!discard)parts.push(part);
  if(i<chunk.length){
   if(discard){const id=screenshots.values().next().value;screenshots.delete(id);this.push(JSON.stringify({id,error:{message:'SCREENSHOT_TRANSFER_BOUND'}})+'\0');}
   else{
    const frame=Buffer.concat(parts);let m;try{m=JSON.parse(frame);}catch{done(Error('CDP_FRAME_INVALID'));return;}
    if(screenshots.delete(m.id)){visualTotal+=size;if(visualTotal>256000000)this.push(JSON.stringify({id:m.id,error:{message:'SCREENSHOT_TRANSFER_BOUND'}})+'\0');else{this.push(frame);this.push(Buffer.from([0]));}}
    else{total+=size;if(total>64000000){done(Error('CDP_TOTAL_BOUND'));return;}this.push(frame);this.push(Buffer.from([0]));}
   }
   parts=[];size=0;discard=false;start=i+1;
  }
 }
 done();
}});}
const input=boundedInput(),output=boundedOutput();
for(const stream of [process.stdin,process.stdout,input,output,child.stdio[3],child.stdio[4]])stream.on('error',stop);
process.stdin.pipe(input).pipe(child.stdio[3]);child.stdio[4].pipe(output).pipe(process.stdout);
process.stdin.on('end',stop);process.on('SIGTERM',stop);process.on('SIGINT',stop);
child.stderr.on('data',chunk=>{const remaining=8192-stderrBytes;if(remaining>0){const part=chunk.subarray(0,remaining);stderrBytes+=part.length;process.stderr.write(part);}});
child.on('error',()=>{clearTimeout(watchdog);process.exit(71);});
child.on('exit',(code)=>{clearTimeout(watchdog);process.stdin.destroy();process.exitCode=code??72;});
