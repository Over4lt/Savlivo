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
// DNS pinning happens before either hop. Same raw response handling for both.
import http from 'node:http';
import tls from 'node:tls';
import {isIP} from 'node:net';
import {fault,acquisitionCapacity,httpRedirects,safeMetadata} from './acquisition-contract.mjs';
export function ioFailure(error,phase) {
 if(error?.code==='HPE_HEADER_OVERFLOW')return fault('HEADERS_TOO_LARGE','CAPACITY');
 if(error?.code==='ABORTED')return error;
 if(typeof error?.code==='string'&&error.code.startsWith('HPE_'))return fault('HTTP_PROTOCOL_FAILED');
 const cause=['ECONNRESET','ECONNREFUSED','EPIPE','ETIMEDOUT','ENETUNREACH','EHOSTUNREACH','CERT_HAS_EXPIRED','ERR_TLS_CERT_ALTNAME_INVALID','UNABLE_TO_VERIFY_LEAF_SIGNATURE'].includes(error?.code)?error.code:null;
 return fault(phase==='PROXY_CONNECT'?'PROXY_CONNECT_FAILED':phase==='TARGET_TLS'?'TARGET_TLS_FAILED':phase==='BODY'?'BODY_READ_FAILED':phase==='CONNECT_TLS'?'CONNECTION_FAILED':'NETWORK_FAILED','ACQUISITION',{cause,phase});
}
function responseBody(res,{maxBytes,onBodyBytes=()=>{},onPhase=()=>{},onHeaders=()=>{},deferContentProcessing=false,acceptJson=false,robotsPolicyRetrieval=false},finish) {
 let active=true;const complete=finish;finish=(error,value)=>{if(!active)return;active=false;complete(error,value);};
 const raw=res.rawHeaders??Object.entries(res.headers).flatMap(([k,v])=>[k,String(v)]);let headerFieldBytes=2;for(let i=0;i<raw.length;i+=2)headerFieldBytes+=Buffer.byteLength(raw[i]+': '+raw[i+1]+'\r\n');
 onPhase('BODY');onHeaders(res.statusCode,{...safeMetadata(res.headers),headerFieldBytes});
 const headers=Object.fromEntries(['content-type','content-length','content-encoding','location','x-robots-tag','content-language'].filter(k=>res.headers[k]!==undefined).map(k=>[k,res.headers[k]]));
 if(httpRedirects.has(res.statusCode)){finish(null,{status:res.statusCode,headers,headerFieldBytes,body:Buffer.alloc(0)});return;}
 const type=safeMetadata(headers).contentType;
 if(!deferContentProcessing&&!(robotsPolicyRetrieval&&[404,410].includes(res.statusCode))&&!(acceptJson&&type==='application/json')&&!['text/html','application/xhtml+xml','text/plain','application/rss+xml','application/xml','text/xml'].includes(type)){finish(fault('UNSUPPORTED_CONTENT'));return;}
 if(Number(headers['content-length'])>maxBytes){finish(fault('RESPONSE_TOO_LARGE','CAPACITY'));return;}
 const chunks=[];let bytes=0;
 res.on('data',chunk=>{if(!active)return;try{
  onPhase('BODY');bytes+=chunk.length;onBodyBytes(chunk.length);
  // Count observed bytes, but never store/admit the chunk that crosses the cap.
  if(bytes>maxBytes){finish(fault('RESPONSE_TOO_LARGE','CAPACITY'));return;}chunks.push(chunk);
 }catch(e){finish(e);}});
 res.on('end',()=>{if(!active)return;const declared=Number(headers['content-length']);if(res.complete===false||(headers['content-length']!==undefined&&Number.isSafeInteger(declared)&&declared>=0&&declared!==bytes)){finish(fault('INCOMPLETE_RESPONSE'));return;}finish(null,{status:res.statusCode,headers,headerFieldBytes,body:Buffer.concat(chunks,bytes)});});
 res.on('error',()=>finish(fault('BODY_READ_FAILED')));res.on('aborted',()=>finish(fault('INCOMPLETE_RESPONSE')));
}
export function directHop({url,address,family,signal,maxBytes,onBodyBytes,onPhase=()=>{},onHeaders,userAgent,locale,acceptJson=false,robotsPolicyRetrieval=false,deferContentProcessing=false,onTransportRequest=()=>{},requestImpl=https.request}) {
 return new Promise((resolve,reject)=>{
  let settled=false,request,response,phase='CONNECT_TLS';
  const finish=(error,value)=>{if(settled)return;settled=true;signal?.removeEventListener('abort',abort);response?.destroy();request?.destroy();error?reject(error):resolve(value);};
  const abort=()=>finish(fault('ABORTED'));
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted){abort();return;}
  try {
   onPhase(phase);
   request=requestImpl({hostname:url.hostname,port:443,path:url.pathname+url.search,method:'GET',agent:false,rejectUnauthorized:true,maxHeaderSize:acquisitionCapacity.headerBytes,highWaterMark:16384,
    lookup:(_host,opts,callback)=>opts.all?callback(null,[{address,family}]):callback(null,address,family),
    headers:{'user-agent':userAgent,'accept':acceptJson?'application/json':'text/html,application/xhtml+xml,text/plain;q=0.8','accept-encoding':'gzip, br, deflate',...(locale?{'accept-language':locale}:{})}},res=>{
     if(settled){res.destroy();return;}response=res;
     responseBody(res,{maxBytes,onBodyBytes:n=>{if(!settled)onBodyBytes?.(n);},onPhase:p=>{if(!settled){phase=p;onPhase(p);}},onHeaders,deferContentProcessing,acceptJson,robotsPolicyRetrieval},finish);
    });
   // Preserve all fields inside the finite byte ceiling; Node otherwise silently drops fields after its pair cap.
   request.maxHeadersCount=0;
   request.on('socket',socket=>socket.once('secureConnect',()=>{if(!settled){phase='HEADERS';onPhase(phase);}}));
   request.on('error',error=>finish(ioFailure(error,phase)));onTransportRequest('GET');request.end();
  }catch(error){finish(ioFailure(error,phase));}
 });
}
export function createProxyHop({httpsRequest=https.request,httpRequest=http.request,tlsConnect=tls.connect}={}) {
 return async function proxyHop({url,address,proxyHost,proxyAddress,proxyPort,username,password,headers={},signal,maxBytes,onBytes=()=>{},onConnect=()=>{},onTarget=()=>{},onPhase=()=>{},onHeaders=()=>{},onProxyHeaders=()=>{},onTransportRequest=()=>{},acceptJson=false,robotsPolicyRetrieval=false,deferContentProcessing=true}) {
  return new Promise((resolve,reject)=>{
   let settled=false,outer,inner,tunnel,secure,agent,response,phase='PROXY_CONNECT';
   const cleanup=()=>{signal?.removeEventListener('abort',abort);response?.destroy();inner?.destroy();secure?.destroy();tunnel?.destroy();outer?.destroy();agent?.destroy();};
   const finish=(e,r)=>{if(settled)return;settled=true;cleanup();e?reject(e):resolve({...r,tlsVerified:true});};
   const abort=()=>finish(fault('ABORTED'));signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted){abort();return;}
   if(!isIP(address)||!isIP(proxyAddress)||!Number.isSafeInteger(proxyPort)||proxyPort<1||proxyPort>65535||typeof proxyHost!=='string'||/[\r\n]/.test(proxyHost)||typeof username!=='string'||/[:\r\n]/.test(username)||typeof password!=='string'||/[\r\n]/.test(password)){finish(fault('DECODO_CONFIGURATION_REQUIRED'));return;}
   const authority=(isIP(address)===6?'['+address+']':address)+':443';
   const start=socket=>{
    if(settled){socket.destroy();return;}
    agent=new http.Agent({keepAlive:false});agent.createConnection=()=>socket;
    phase='HEADERS';onPhase(phase);onTarget();
    inner=httpRequest({hostname:url.hostname,port:443,path:url.pathname+url.search,method:'GET',agent,maxHeaderSize:acquisitionCapacity.headerBytes,highWaterMark:16384,
     headers:{host:url.host,'user-agent':headers['user-agent'],accept:acceptJson?'application/json':headers.accept??'text/html,text/plain','accept-encoding':'gzip, br, deflate',connection:'close',...(headers['accept-language']?{'accept-language':headers['accept-language']}:{})}},res=>{
      if(settled){res.destroy();return;}response=res;
      responseBody(res,{maxBytes,onBodyBytes:n=>{if(!settled)onBytes(n);},onHeaders,onPhase:p=>{if(!settled){phase=p;onPhase(p);}},deferContentProcessing,acceptJson,robotsPolicyRetrieval},finish);
     });
    inner.maxHeadersCount=0;
    inner.on('error',e=>finish(ioFailure(e,phase)));onTransportRequest('GET');inner.end();
   };
   try{
    outer=httpsRequest({hostname:proxyHost,port:proxyPort,servername:proxyHost,rejectUnauthorized:true,method:'CONNECT',path:authority,agent:false,maxHeaderSize:acquisitionCapacity.headerBytes,
     lookup:(_h,opts,cb)=>opts.all?cb(null,[{address:proxyAddress,family:isIP(proxyAddress)}]):cb(null,proxyAddress,isIP(proxyAddress)),
     headers:{host:authority,'proxy-authorization':'Basic '+Buffer.from(username+':'+password).toString('base64')} });
    outer.maxHeadersCount=0;
    outer.on('error',e=>finish(ioFailure(e,phase)));
    outer.on('response',res=>{onProxyHeaders(res.statusCode);res.destroy();finish(fault('PROXY_ACCESS_DENIED'));});
    outer.on('connect',(res,socket,head)=>{try{
     if(settled){socket.destroy();return;}tunnel=socket;
     onProxyHeaders(res.statusCode);
     if(res.statusCode!==200||head.length){finish(fault('PROXY_ACCESS_DENIED'));return;}
     phase='TARGET_TLS';onPhase(phase);
     secure=tlsConnect({socket,servername:isIP(url.hostname)?undefined:url.hostname,rejectUnauthorized:true,checkServerIdentity:(_name,cert)=>tls.checkServerIdentity(url.hostname,cert)});
     secure.on('error',e=>finish(ioFailure(e,phase)));
     secure.once('secureConnect',()=>{if(!secure.authorized){finish(fault('TARGET_TLS_FAILED'));return;}try{start(secure);}catch(e){finish(ioFailure(e,phase));}});
    }catch(e){finish(ioFailure(e,phase));}});
    onPhase(phase);onTransportRequest('CONNECT');outer.end();
   }catch(e){finish(ioFailure(e,phase));}
  });
 };
}
