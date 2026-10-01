// V3 host IO only. No credentials/environment/state reads and no retries.
import https from 'node:https';
export const systemTiming={now:()=>performance.now(),set:setTimeout,clear:clearTimeout};
export function safeOrigin(value) {try{return new URL(value).origin;}catch{return null;}}
export async function boundedOperation({signal,timeoutMs,timing=systemTiming,onFailure,phase,run}) {
 const child=new AbortController();let timer,active=true,settled=false;
 const state={get active(){return active&&!settled;},signal:child.signal};
 let abort;
 try {
  return await new Promise((resolve,reject)=>{
   const fail=reason=>{if(settled)return;settled=true;const e=Object.assign(Error(reason),{code:reason});onFailure?.(e);reject(e);child.abort(reason);};
   abort=()=>fail(signal?.reason==='ACQUISITION_DEADLINE_EXCEEDED'?'ACQUISITION_DEADLINE_EXCEEDED':'EXPLICIT_CANCELLATION');
   signal?.addEventListener('abort',abort,{once:true});
   if(signal?.aborted){abort();return;}
   timer=timing.set(()=>fail(phase()+'_TIMEOUT'),timeoutMs);
   Promise.resolve().then(()=>{if(!settled)return run(state);}).then(value=>{if(!settled){settled=true;resolve(value);}},error=>{if(!settled){settled=true;reject(error);}});
  });
 } finally {active=false;timing.clear(timer);signal?.removeEventListener('abort',abort);child.abort('COMPLETED');}
}
// Public-reader DNS vetting happens first. This hop pins that vetted address.
export function directHop({url,address,family,signal,maxBytes,onBodyBytes,onPhase,onHeaders,userAgent,locale,acceptJson=false,robotsPolicyRetrieval=false,requestImpl=https.request}) {
 return new Promise((resolve,reject)=>{
  let settled=false,request,response;
  const finish=(error,value)=>{if(settled)return;settled=true;signal?.removeEventListener('abort',abort);response?.destroy();request?.destroy();error?reject(error):resolve(value);};
  const fail=code=>Object.assign(Error(code),{code});
  const abort=()=>finish(fail('ABORTED'));
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted){abort();return;}
  try {
   onPhase('CONNECT_TLS');
   request=requestImpl({hostname:url.hostname,port:443,path:url.pathname+url.search,method:'GET',agent:false,rejectUnauthorized:true,maxHeaderSize:16384,
    lookup:(_host,opts,callback)=>opts.all?callback(null,[{address,family}]):callback(null,address,family),
    headers:{'user-agent':userAgent,'accept':acceptJson?'application/json':'text/html,application/xhtml+xml,application/rss+xml,application/xml,text/plain;q=0.8','accept-encoding':'identity',...(locale?{'accept-language':locale}:{})}},res=>{
     response=res;onPhase('BODY');onHeaders(res.statusCode);
     const headers=Object.fromEntries(['content-type','content-length','content-encoding','location','x-robots-tag','content-language'].filter(k=>res.headers[k]!==undefined).map(k=>[k,res.headers[k]]));
     if([301,302,303,307,308].includes(res.statusCode)){finish(null,{status:res.statusCode,headers,body:Buffer.alloc(0)});return;}
     if(res.headers['content-encoding']&&res.headers['content-encoding']!=='identity'){finish(fail('UNSUPPORTED_ENCODING'));return;}
     const type=String(res.headers['content-type']??'').split(';')[0].trim().toLowerCase();
     if(!(robotsPolicyRetrieval&&[404,410].includes(res.statusCode))&&!(acceptJson&&type==='application/json')&&!['text/html','application/xhtml+xml','text/plain','application/rss+xml','application/xml','text/xml'].includes(type)){finish(fail('UNSUPPORTED_CONTENT'));return;}
     if(Number(res.headers['content-length'])>maxBytes){finish(fail('RESPONSE_TOO_LARGE'));return;}
     const chunks=[];let bytes=0;
     res.on('data',chunk=>{if(settled)return;onPhase('BODY');try{bytes+=chunk.length;onBodyBytes(chunk.length);if(bytes>maxBytes){finish(fail('RESPONSE_TOO_LARGE'));return;}chunks.push(chunk);}catch(e){finish(e);}});
     res.on('end',()=>finish(null,{status:res.statusCode,headers,body:Buffer.concat(chunks)}));res.on('error',()=>finish(fail('NETWORK_FAILED')));res.on('aborted',()=>finish(fail('NETWORK_FAILED')));
    });
   request.on('socket',socket=>socket.once('secureConnect',()=>{if(!settled)onPhase('HEADERS');}));request.on('error',()=>finish(fail('NETWORK_FAILED')));request.end();
  } catch(e){finish(e);}
 });
}
