// One guarded HTTP hop over an HTTPS CONNECT proxy. No redirects, retries or environment reads.
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import {isIP} from 'node:net';
import {normalizePublicUrl,publicAddress,PublicNetworkError} from './public-network.mjs';
import {createAssociatedScriptScan} from './associated-structured-resources.mjs';
const fail=code=>new PublicNetworkError(code);
// In-process certificate from this pinned transport only; never a response/model flag.
const headerSizeRejections=new WeakSet(),localAbortRejections=new WeakSet();
export const isLocalAbortRejection=error=>localAbortRejections.has(error);
export const isHeaderSizeRejection=error=>headerSizeRejections.has(error);
export function createPinnedConnectRequest({httpsRequest=https.request,httpRequest=http.request,tlsConnect=tls.connect}={}){
  return async function request({url,address,proxyHost,proxyAddress,proxyPort,username,password,headers,signal,maxBytes,timeoutMs=10000,acceptJson=false,acceptImage=false,pricingScript=false,associatedStructuredResource=false,scriptScan=null,onScanChunk=()=>{},maxJsonBytes=10000,robotsPolicyRetrieval=false,onBytes=()=>{},onConnect=()=>{},onTarget=()=>{}}){
    const u=normalizePublicUrl(url);
    if(!publicAddress(address)||!publicAddress(proxyAddress)||!Number.isInteger(proxyPort)||proxyPort<1||proxyPort>65535)throw fail('UNSAFE_HOST');
    if(normalizePublicUrl('https://'+proxyHost).hostname!==proxyHost)throw fail('UNSAFE_HOST');
    if(!Number.isSafeInteger(maxJsonBytes)||maxJsonBytes<1||maxJsonBytes>(associatedStructuredResource===true?256000:10000))throw fail('INVALID_LIMIT');
    if(!Number.isSafeInteger(maxBytes)||maxBytes<1||!Number.isSafeInteger(timeoutMs)||timeoutMs<1)throw fail('INVALID_LIMIT');
    if(signal?.aborted)throw fail('ABORTED');
    return new Promise((resolve,reject)=>{
      let finished=false,outer,inner,tunnel,secure,agent;
      const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);inner?.destroy();secure?.destroy();tunnel?.destroy();outer?.destroy();agent?.destroy();};
      const finish=(error,value)=>{if(finished)return;finished=true;cleanup();error?reject(error):resolve(value);};
      // Certify only caller cancellation after this pinned hop synchronously closes
      // its sockets. Network/TLS failures never receive this certificate.
      const abort=()=>{const e=fail('ABORTED');finish(e);localAbortRejections.add(e);};
      const timer=setTimeout(()=>finish(fail('TIMEOUT')),timeoutMs);
      signal?.addEventListener('abort',abort,{once:true});
      const authority=(isIP(address)===6?'['+address+']':address)+':'+(u.protocol==='https:'?443:80);
      const start=socket=>{
        if(finished){socket.destroy();return;}
        agent=new http.Agent({keepAlive:false});agent.createConnection=()=>socket;
        // Only controlled transport headers reach the target. Proxy credentials remain CONNECT-only.
        inner=httpRequest({hostname:u.hostname,port:u.protocol==='https:'?443:80,method:'GET',path:u.pathname+u.search,agent,
          maxHeaderSize:16384,headers:{'user-agent':headers['user-agent'],accept:acceptJson?'application/json':pricingScript?'application/javascript,text/javascript':headers.accept,
            'accept-encoding':'identity',host:u.host,connection:'close',...(headers['accept-language']?{'accept-language':headers['accept-language']}:{})}},res=>{
          const status=res.statusCode,type=String(res.headers['content-type']??'').split(';')[0].trim().toLowerCase();
          const safeHeaders=Object.fromEntries(['content-type','content-length','content-encoding','content-language','location','x-robots-tag','access-control-allow-origin','access-control-allow-credentials'].filter(k=>res.headers[k]!==undefined).map(k=>[k,res.headers[k]]));
          if([301,302,303,307,308].includes(status)){res.destroy();finish(null,{status,headers:safeHeaders,body:Buffer.alloc(0),tlsVerified:u.protocol==='https:'});return;}
          if(res.headers['content-encoding']&&res.headers['content-encoding']!=='identity'){res.destroy();finish(fail('UNSUPPORTED_ENCODING'));return;}
          if(!(robotsPolicyRetrieval===true&&[404,410].includes(status))&&!(pricingScript&&['application/javascript','text/javascript'].includes(type))&&!(acceptImage&&['image/png','image/jpeg','image/webp'].includes(type))&&!(acceptJson&&type==='application/json')&&!['text/html','application/xhtml+xml','text/plain','application/rss+xml','application/xml','text/xml'].includes(type)){res.destroy();finish(new PublicNetworkError('UNSUPPORTED_CONTENT',{code:'UNSUPPORTED_CONTENT',rejectionStage:'PROXY_MIME_GATE',httpStatus:status,contentTypePresent:res.headers['content-type']!==undefined,normalizedMediaType:type}));return;}
          const responseLimit=acceptJson&&type==='application/json'?Math.min(maxBytes,maxJsonBytes):maxBytes;
          const sizeFailure=(stage,receivedBytes)=>new PublicNetworkError('RESPONSE_TOO_LARGE',{stage,limit:responseLimit,receivedBytes,declaredBytes:Number(res.headers['content-length']),contentType:type});
          if(Number(res.headers['content-length'])>responseLimit&&status===200&&associatedStructuredResource&&pricingScript&&scriptScan?.maxBytes>0&&['application/javascript','text/javascript'].includes(type)){
            let scanner;try{scanner=createAssociatedScriptScan({...scriptScan,url:u.href,maxBytes:Math.min(responseLimit,scriptScan.maxBytes)});}catch{res.destroy();finish(fail('INVALID_LIMIT'));return;}
            let scanned=0;const ceiling=Math.min(responseLimit,scriptScan.maxBytes);
            const complete=reason=>{if(finished)return;const result=scanner.finish(reason);finish(null,{status,headers:safeHeaders,body:Buffer.alloc(0),scriptScan:result,tlsVerified:u.protocol==='https:'});res.destroy();};
            // Pull bounded chunks. Never accumulate the rest of the large response or
            // pretend that a scanned prefix is the complete authoritative script.
            res.on('readable',()=>{try{while(!finished){const chunk=res.read(Math.min(16384,ceiling-scanned));if(!chunk)break;
              scanned+=chunk.length;onBytes(chunk.length);onScanChunk(chunk);
              if(scanner.push(chunk)){complete('CANDIDATE_FOUND');break;}if(scanned===ceiling){complete('SCAN_BYTE_BOUND');break;}
            }}catch(e){finish(e instanceof PublicNetworkError?e:fail('NETWORK_FAILED'));res.destroy();}});
            res.on('end',()=>complete('END_OF_RESPONSE'));res.on('aborted',()=>finish(fail('NETWORK_FAILED')));res.on('error',()=>finish(fail('NETWORK_FAILED')));return;
          }
          if(Number(res.headers['content-length'])>responseLimit){const rejected=sizeFailure('DECLARED_LENGTH',0);headerSizeRejections.add(rejected);res.destroy();finish(rejected);return;}
          const chunks=[];let size=0;
          res.on('data',chunk=>{if(finished)return;size+=chunk.length;try{onBytes(chunk.length);}catch{finish(sizeFailure('STREAM',size));return;}if(size>responseLimit){finish(sizeFailure('STREAM',size));return;}chunks.push(chunk);});
          res.on('aborted',()=>finish(fail('NETWORK_FAILED')));res.on('error',()=>finish(fail('NETWORK_FAILED')));
          res.on('end',()=>finish(null,{status,headers:safeHeaders,body:Buffer.concat(chunks),tlsVerified:u.protocol==='https:'}));
        });
        inner.on('error',()=>finish(fail('NETWORK_FAILED')));onTarget();inner.end();
      };
      const safeStart=socket=>{try{start(socket);}catch{finish(fail('NETWORK_FAILED'));}};
      try{
        outer=httpsRequest({hostname:proxyHost,port:proxyPort,servername:proxyHost,rejectUnauthorized:true,method:'CONNECT',path:authority,
          agent:false,maxHeaderSize:16384,lookup:(_host,opts,cb)=>opts.all?cb(null,[{address:proxyAddress,family:isIP(proxyAddress)}]):cb(null,proxyAddress,isIP(proxyAddress)),
          headers:{host:authority,'proxy-authorization':'Basic '+Buffer.from(username+':'+password).toString('base64')} });
        outer.on('error',()=>finish(fail('NETWORK_FAILED')));
        outer.on('response',res=>{res.destroy();finish(fail('ACCESS_CONTROL_STOP'));});
        outer.on('connect',(res,socket,head)=>{
          try{
          if(finished){socket.destroy();return;}tunnel=socket;
          if(res.statusCode!==200||head.length){finish(fail([401,402,403,407,429,451].includes(res.statusCode)?'ACCESS_CONTROL_STOP':'NETWORK_FAILED'));return;}
          if(u.protocol==='http:'){safeStart(socket);return;}
          secure=tlsConnect({socket,servername:isIP(u.hostname)?undefined:u.hostname,rejectUnauthorized:true,
            checkServerIdentity:(_name,cert)=>tls.checkServerIdentity(u.hostname,cert)});
          secure.on('error',()=>finish(fail('NETWORK_FAILED')));
          secure.once('secureConnect',()=>{if(!secure.authorized){finish(fail('NETWORK_FAILED'));return;}safeStart(secure);});
          }catch{finish(fail('NETWORK_FAILED'));}
        });
        onConnect();outer.end();
      }catch{finish(fail('NETWORK_FAILED'));}
    });
  };
}
