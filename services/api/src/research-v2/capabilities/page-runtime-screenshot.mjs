// Visual debugging only. No acquisition, OCR, interpretation or verification input.
import {mkdirSync,openSync,closeSync,writeSync,renameSync,rmSync,statSync,createReadStream} from 'node:fs';
import {resolve,join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const signature=Buffer.from([137,80,78,71,13,10,26,10]);
export function pngDimensions(b){assert(b.length>=33&&b.subarray(0,8).equals(signature)&&b.toString('ascii',12,16)==='IHDR','INVALID_SCREENSHOT_PNG');return {width:b.readUInt32BE(16),height:b.readUInt32BE(20)};}
async function digest(path){const h=createHash('sha256');for await(const b of createReadStream(path))h.update(b);return h.digest('hex');}
export async function captureRenderedPage({browser,sessionId,directory,navigationElapsed=()=>null}){
 const meta={purpose:'VISUAL_ARTIFACT_ONLY',outcome:'FAILED',artifactPath:null,capturedAt:new Date().toISOString(),documentDimensions:null,viewportDimensions:null,pngDimensions:null,bytes:0,sha256:null,method:null};
 let temporary;
 try{
  assert(sessionId,'SCREENSHOT_SESSION_UNAVAILABLE');
  // No scrolling, viewport resize or further page JS; all host reads already stopped.
  await browser.send('Emulation.setScriptExecutionDisabled',{value:true},sessionId);
  await browser.send('Page.stopLoading',{},sessionId);
  const state=await browser.send('Runtime.evaluate',{expression:'document.readyState',returnByValue:true,timeout:500},sessionId);meta.readyState=typeof state.result?.value==='string'?state.result.value:null;
  const m=await browser.send('Page.getLayoutMetrics',{},sessionId),d=m.cssContentSize??m.contentSize,v=m.cssLayoutViewport??m.layoutViewport;
  const width=Math.ceil(d.width),height=Math.ceil(d.height);
  assert(width*height<=16000000,'SCREENSHOT_PIXEL_BOUND');
  assert(Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&width>0&&height>0&&width<=0x7fffffff&&height<=0x7fffffff,'PNG_DIMENSION_UNREPRESENTABLE');
  meta.documentDimensions={width,height};meta.viewportDimensions={width:v.clientWidth,height:v.clientHeight};
  const path=join(resolve(directory),'page-runtime-'+randomUUID()+'.png');temporary=path+'.partial';
  mkdirSync(resolve(directory),{recursive:true,mode:0o700});
  const capture=async(x,y,w,h)=>{
   if(meta.navigationToCaptureMs===undefined){meta.navigationToCaptureMs=navigationElapsed();meta.capturedAt=new Date().toISOString();}
   const r=await browser.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:true,optimizeForSpeed:false,clip:{x:(d.x??0)+x,y:(d.y??0)+y,width:w,height:h,scale:1}},sessionId);
   assert(typeof r.data==='string'&&r.data.length<=8000000,'SCREENSHOT_BYTE_BOUND');const b=Buffer.from(r.data,'base64');assert(b.length<=6000000,'SCREENSHOT_BYTE_BOUND');assert.deepEqual(pngDimensions(b),{width:w,height:h});return b;
  };
  const bytes=await capture(0,0,width,height),fd=openSync(temporary,'wx',0o600);try{writeSync(fd,bytes);}finally{closeSync(fd);}meta.method='single-full-page';
  renameSync(temporary,path);temporary=null;
  Object.assign(meta,{outcome:'CAPTURED',artifactPath:path,pngDimensions:{width,height},bytes:statSync(path).size,sha256:await digest(path)});
 }catch(e){meta.reason=['BROWSER_CLOSED','BROWSER_COMMAND_TIMEOUT','SCREENSHOT_TRANSFER_BOUND'].includes(e.code)?e.code:'SCREENSHOT_CAPTURE_FAILED';}
 finally{if(temporary)try{rmSync(temporary,{force:true});}catch{}}
 return meta;
}
