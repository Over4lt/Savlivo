import {safeRuntimeCors} from '../../research-v1/public-network.mjs';
import {visualQuietMs,visualReadinessExpression} from './page-runtime-visual-readiness.mjs';
import {captureRenderedPage} from './page-runtime-screenshot.mjs';
import {resolve} from 'node:path';
import {createRuntimeDiagnostics,withRuntimeDiagnostics} from './page-runtime-diagnostics.mjs';
// One isolated page, intercepted requests only. No provider transport or credentials here.
import assert from 'node:assert/strict';
const runtimeAcquisitionVersion='MATURE_BOUNDED_RENDERER_V1';
import {openOfflineBrowser,browserStartupReasons} from './docker-browser-host.mjs';
export {openOfflineBrowser} from './docker-browser-host.mjs';
import {resourceHash,associatedResourceUrl} from '../../research-v1/associated-structured-resources.mjs';
export const runtimeResourceVersion='OBSERVED_STRUCTURED_RESOURCE_V1';
import {runtimeResourceLimits} from '../../research-v1/page-runtime-limits.mjs';
export {runtimeResourceLimits} from '../../research-v1/page-runtime-limits.mjs';
const fail=code=>{throw Object.assign(new Error(code),{code});};
const allowed=d=>['ALLOWED','NO_ROBOTS_POLICY'].includes(d.decision);
export function createPageRuntime({openBrowser=openOfflineBrowser,available=()=>false,limits={},startupTimeoutMs=20000,artifactDirectory=resolve('.savlivo/research-v1/browser-artifacts'),...unsupported}={}){
 assert.equal(Object.keys(unsupported).length,0,'UNSUPPORTED_PAGE_RUNTIME_OPTION');
 assert(Number.isSafeInteger(startupTimeoutMs)&&startupTimeoutMs>0&&startupTimeoutMs<=20000);
 const cap={...runtimeResourceLimits,...limits};for(const [k,v] of Object.entries(cap))assert(Number.isSafeInteger(v)&&v>0&&v<=runtimeResourceLimits[k]);
 return {setArtifactDirectory:directory=>{artifactDirectory=resolve(directory);},version:runtimeResourceVersion,acquisitionVersion:runtimeAcquisitionVersion,available:available(),limits:cap,
 async execute({parent,bindingRef,readResource,clock=()=>new Date().toISOString(),staticExhausted=false}){
  assert(staticExhausted&&parent?.structuredResourceDiscovery?.status==='NO_STATIC_STRUCTURED_RESOURCE_ACQUIRED','STATIC_DISCOVERY_NOT_EXHAUSTED');
  assert(parent.authority?.status==='CONFIGURED_REVIEWED'&&parent.outcome==='OK'&&parent.httpStatus===200&&parent.sourceIntegrity.sha256===resourceHash(parent.rawSource.text)&&parent.accessDecisions?.every(allowed));
  const result={version:runtimeResourceVersion,parentUrl:parent.url,parentHash:parent.sourceIntegrity.sha256,bindingRef,startedAt:clock(),outcome:'UNRESOLVED',reason:null,requests:[],scripts:[],resources:[],used:{requests:0,interceptions:0,bytes:0},limits:cap};
  result.acquisitionAccounting={mode:'DEFAULT',ceiling:cap.requests,highWaterMark:0,categories:{},rejectedAtCeiling:0};
  result.eventAccounting={mode:'DEFAULT',ceiling:cap.events,highWaterMark:0,categories:{}};
  assert(Buffer.byteLength(parent.rawSource.text)<=1000000,'RETAINED_PARENT_BYTE_BOUND');
  result.retainedParent={purpose:'OFFLINE_REPLAY_ONLY',url:parent.url,bindingRef,outcome:'OK',httpStatus:200,contentType:parent.contentType,authority:{status:parent.authority.status},sourceIntegrity:{sha256:result.parentHash},rawSource:{text:parent.rawSource.text},accessDecisions:parent.accessDecisions.map(d=>({decision:d.decision})),structuredResourceDiscovery:{status:'NO_STATIC_STRUCTURED_RESOURCE_ACQUIRED'}};
  const diagnostics=createRuntimeDiagnostics();result.diagnostics=diagnostics.result;result.retainedScripts=[];result.retainedScriptBytes=0;
  const monotonicStart=performance.now();let runtimeStart=null;
  const elapsed=()=>runtimeStart===null?0:Math.max(0,Math.floor(performance.now()-runtimeStart));
  result.timing={startupLimitMs:startupTimeoutMs,startupDurationMs:null,runtimeLimitMs:cap.timeoutMs,runtimeElapsedMs:0,runtimeRemainingMs:cap.timeoutMs};
  let activeAcquisition=null,readinessTimer,readinessAvailable=false,lastNetworkActivity=0,lastLayoutActivity=0,lastLayout=null,normalCompletion=false;const visualPending=new Set();
  result.visualReadiness={quietMs:visualQuietMs,readyState:null,lastDomActivityMs:null,lastNetworkActivityMs:0,lastLayoutActivityMs:0,pendingEligibleRequests:0};
  let browser,sessionId,frameId,parentServed=false,eventCount=0,stopped=false,queue=Promise.resolve();const abort=new AbortController(),network=new Map(),correlations=new Map();
  let finish;const completed=new Promise(resolve=>{finish=reason=>{if(!stopped){stopped=true;result.reason=reason;Object.assign(result.timing,{startupDurationMs:result.timing.startupDurationMs??Math.floor(performance.now()-monotonicStart),runtimeElapsedMs:elapsed(),runtimeRemainingMs:Math.max(0,cap.timeoutMs-elapsed())});result.stop={reason,elapsedMs:elapsed(),limitMs:runtimeStart===null?startupTimeoutMs:cap.timeoutMs,phase:activeAcquisition?'HOST_ACQUISITION':runtimeStart!==null?'PAGE_EXECUTION':'BROWSER_STARTUP'};if(activeAcquisition){const {row,kind}=activeAcquisition;if(reason==='RUNTIME_TIMEOUT')row.reason='RUNTIME_DEADLINE_DURING_ACQUISITION';result.stop.inFlight={url:row.url,kind,...row.acquisition};}abort.abort();resolve();}};});
  let timer;const startupTimer=setTimeout(()=>finish('RENDERER_STARTUP_TIMEOUT'),startupTimeoutMs);
  const preparing=p=>Promise.race([p,completed.then(()=>fail(result.reason))]);
  try{
   result.browserLaunchAttempted=true;browser=withRuntimeDiagnostics(await preparing(Promise.resolve().then(()=>openBrowser()).then(async b=>{if(stopped){await b.close();fail('RENDERER_STARTUP_TIMEOUT');}return b;})),diagnostics);assert(browser.networkIsolation==='OS_DENY_TCP_UDP');result.browserRevision=browser.revision;result.browserLaunched=true;
   const {targetId}=await preparing(browser.send('Target.createTarget',{url:'about:blank'}));sessionId=(await preparing(browser.send('Target.attachToTarget',{targetId,flatten:true}))).sessionId;
   const send=(method,params={})=>{if(stopped&&method!=='Fetch.failRequest')fail('RUNTIME_STOPPED');return runtimeStart===null?preparing(browser.send(method,params,sessionId)):browser.send(method,params,sessionId);};
   const reject=id=>send('Fetch.failRequest',{requestId:id,errorReason:'BlockedByClient'}).catch(()=>{});
   const serve=(id,body,type,status=200,cors={})=>send('Fetch.fulfillRequest',{requestId:id,responseCode:status,responseHeaders:[{name:'Content-Type',value:type},...Object.entries(safeRuntimeCors(cors)).map(([name,value])=>({name,value}))],body:Buffer.from(body).toString('base64')});
   const handle=async p=>{
    if(stopped){await reject(p.requestId);return;}result.used.interceptions++;
    const r=p.request,row={url:typeof r?.url==='string'?r.url:null,type:typeof p.resourceType==='string'?p.resourceType:'OTHER',startedAt:clock(),outcome:'REJECTED'};result.requests.push(row);
    if(!r||typeof r.url!=='string'||typeof p.resourceType!=='string'){row.reason='MALFORMED_REQUEST';await reject(p.requestId);return;}
    if(p.frameId!==frameId||(r.method!=='GET'||r.hasPostData||r.postData||Object.keys(r.headers??{}).some(k=>/authorization|cookie|token|api.?key/i.test(k)))){row.reason='REQUEST_SCOPE_OR_AUTH_REJECTED';await reject(p.requestId);return;}
    // Charge only after scope, authority and causality eligibility. Rejected
    // noise still consumes the global event ceiling and interception diagnostics.
    const acquire=async()=>{if(result.used.requests>=cap.requests){row.reason='RUNTIME_REQUEST_BOUND';result.acquisitionAccounting.rejectedAtCeiling++;await reject(p.requestId);finish(row.reason);return false;}result.used.requests++;result.acquisitionAccounting.highWaterMark=result.used.requests;result.acquisitionAccounting.categories[p.resourceType]=(result.acquisitionAccounting.categories[p.resourceType]??0)+1;return true;};
    if(p.resourceType==='Document'){
     if(parentServed||r.url!==parent.url){row.reason='NAVIGATION_REJECTED';await reject(p.requestId);return;}
     if(!await acquire())return;
     parentServed=true;row.outcome='BOUND_PARENT_REUSED';await serve(p.requestId,parent.rawSource.text,parent.contentType);return;
    }
    const url=associatedResourceUrl(r.url,parent.url);
    // Fetch pause may precede its Network initiator event. Keep the request
    // paused; the existing execution/event bounds also bound this correlation.
    if(url&&['Script','XHR','Fetch'].includes(p.resourceType)&&typeof p.networkId==='string'&&!network.has(p.networkId)){
     try{await Promise.race([new Promise(resolve=>correlations.set(p.networkId,resolve)),completed]);}finally{correlations.delete(p.networkId);}
     if(stopped){row.reason=result.reason;await reject(p.requestId);return;}
    }
    const n=network.get(p.networkId),initiator=n?.initiator;
    const frames=initiator?.stack?.callFrames??[],initiatorUrl=frames.find(f=>f.url===parent.url||result.scripts.some(s=>s.url===f.url))?.url;
    const script=p.resourceType==='Script',json=['XHR','Fetch'].includes(p.resourceType);
    const causal=script?(initiator?.type==='parser'&&initiator.url===parent.url||initiator?.type==='script'&&!!initiatorUrl):json&&initiator?.type==='script'&&!!initiatorUrl;
    if(!parentServed||!url||url!==r.url||!causal||!script&&!json){row.reason='UNRELATED_OR_UNSUPPORTED_REQUEST';await reject(p.requestId);return;}
    if(script&&result.scripts.length>=cap.scripts||json&&result.resources.length>=cap.json||result.used.bytes>=cap.totalBytes){row.reason='RUNTIME_RESOURCE_BOUND';await reject(p.requestId);finish(row.reason);return;}
    if(!await acquire())return;
    const kind=script?'SCRIPT':'JSON',maxBytes=Math.min(script?cap.scriptBytes:cap.jsonBytes,cap.totalBytes-result.used.bytes);
    row.acquisition={startedElapsedMs:elapsed(),remainingRuntimeMs:Math.max(0,cap.timeoutMs-elapsed()),maxBytes,receivedBytes:0};
    let observed=0;const count=n=>{assert(Number.isSafeInteger(n)&&n>=0);observed+=n;row.acquisition.receivedBytes=observed;result.used.bytes+=n;if(result.used.bytes>cap.totalBytes)fail('RUNTIME_BYTE_BOUND');};
    row.reason='HOST_ACQUISITION_PENDING';
    let page;activeAcquisition={row,kind};
    try{page=await readResource({url,kind,maxBytes,signal:abort.signal,onBytes:count});}finally{row.acquisition.completedElapsedMs=elapsed();activeAcquisition=null;}
    if(stopped){row.reason=result.reason==='RUNTIME_TIMEOUT'?'RUNTIME_DEADLINE_DURING_ACQUISITION':'ACQUISITION_INTERRUPTED_AT_RUNTIME_STOP';await reject(p.requestId);return;}
    delete row.reason;
    row.completedAt=clock();row.httpStatus=page.httpStatus;row.outcome=page.outcome;
    if(page.outcome!=='OK'||page.httpStatus!==200||!page.rawSource?.text||!page.accessDecisions?.every(allowed)){row.reason=page.failure?.code??'RESOURCE_UNAVAILABLE';await reject(p.requestId);return;}
    const bytes=Buffer.byteLength(page.rawSource.text);assert(bytes<=maxBytes&&page.sourceIntegrity?.sha256===resourceHash(page.rawSource.text));if(!observed)count(bytes);
    if(script?!['application/javascript','text/javascript'].includes(page.contentType):page.contentType!=='application/json'){row.reason='RESOURCE_CONTENT_TYPE';await reject(p.requestId);return;}
    if(json){try{JSON.parse(page.rawSource.text);}catch{row.reason='INVALID_JSON';await reject(p.requestId);return;}}
    const observation={url,kind,sourceHash:page.sourceIntegrity.sha256,bytes,startedAt:row.startedAt,completedAt:row.completedAt,initiator:{type:initiator.type,url:initiatorUrl??initiator.url},frame:'REVIEWED_PARENT',method:r.method,bindingRef};
    if(script){result.scripts.push(observation);row.outcome='RUNTIME_SCRIPT_SERVED';await serve(p.requestId,page.rawSource.text,page.contentType,200,page.runtimeCorsHeaders);
     assert(result.retainedScriptBytes+bytes<=result.used.bytes&&result.retainedScriptBytes+bytes<=cap.totalBytes);
     result.retainedScripts.push({version:'RETAINED_RUNTIME_SCRIPT_V1',url,kind:'SCRIPT',bindingRef,outcome:'OK',httpStatus:200,contentType:page.contentType,sourceIntegrity:{sha256:observation.sourceHash},bytes,rawSource:{text:page.rawSource.text},accessDecisions:page.accessDecisions.map(d=>({decision:d.decision})),fulfillment:'SERVED'});result.retainedScriptBytes+=bytes;
    }
    else {result.resources.push({page,observation});row.outcome='STRUCTURED_CAPTURED';await serve(p.requestId,page.rawSource.text,page.contentType,200,page.runtimeCorsHeaders);result.outcome='CAPTURED';normalCompletion=true;if(!readinessAvailable)finish('SUFFICIENT_STRUCTURED_RESPONSE');}
   };
   browser.onEvent(m=>{if(stopped)return;
    const category=['Network','Fetch','Runtime','Log','Page','Target','Inspector'].includes(m.method?.split('.')[0])?m.method.split('.')[0]:'OTHER';
    result.eventAccounting.categories[category]=(result.eventAccounting.categories[category]??0)+1;result.eventAccounting.highWaterMark=++eventCount;
    if(eventCount>cap.events){finish('RUNTIME_EVENT_BOUND');return;}
    if(m.method==='Target.attachedToTarget'&&m.params.targetInfo.targetId!==targetId){browser.send('Target.closeTarget',{targetId:m.params.targetInfo.targetId}).catch(()=>{});return;}
    if(m.sessionId!==sessionId)return;
    // Network notifications can arrive in a burst ahead of paused requests (and
    // include non-intercepted data URLs). They are correlation metadata, bounded
    // by the event cap; only eligible acquisitions consume the request allowance.
    if(m.method==='Network.requestWillBeSent'){network.set(m.params.requestId,m.params);correlations.get(m.params.requestId)?.();}
    if(m.method==='Page.javascriptDialogOpening')finish('RUNTIME_DIALOG_STOP');
    if(m.method==='Fetch.requestPaused'){
     const p=m.params;if(['Script','Fetch','XHR'].includes(p.resourceType)&&p.request?.method==='GET'&&associatedResourceUrl(p.request.url,parent.url)){visualPending.add(p.requestId);lastNetworkActivity=elapsed();}
     queue=queue.then(()=>handle(p)).finally(()=>{if(visualPending.delete(p.requestId))lastNetworkActivity=elapsed();}).catch(e=>{result.failure={code:['ABORTED','TIMEOUT','RUNTIME_BYTE_BOUND','READ_BUDGET_EXHAUSTED','NETWORK_BUDGET_EXHAUSTED'].includes(e.code)?e.code:'RUNTIME_REQUEST_FAILED'};finish(result.failure.code);});}
   });
   await send('Page.enable');await send('Network.enable');await send('Network.setBypassServiceWorker',{bypass:true});await send('Network.setCacheDisabled',{cacheDisabled:true});
   frameId=(await send('Page.getFrameTree')).frameTree.frame.id;
   await preparing(browser.send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:true,flatten:true}));
   await send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
   // Probe whether the renderer supports instrumentation; simple test bridges
   // without a document can still complete acquisition without inventing state.
   readinessAvailable=(await send('Runtime.evaluate',{expression:'typeof document === "object"',returnByValue:true})).result?.value===true;
   if(!stopped){clearTimeout(startupTimer);runtimeStart=performance.now();result.timing.startupDurationMs=Math.floor(runtimeStart-monotonicStart);timer=setTimeout(()=>finish('RUNTIME_TIMEOUT'),cap.timeoutMs);}
   const poll=async()=>{
    if(stopped)return;
    try{
     const r=await browser.send('Runtime.evaluate',{expression:visualReadinessExpression,returnByValue:true,timeout:500},sessionId),state=r.result?.value;
     if(state){
      const now=elapsed(),layout=state.width+'x'+state.height;if(layout!==lastLayout){lastLayout=layout;lastLayoutActivity=now;}
      Object.assign(result.visualReadiness,{readyState:state.readyState,lastDomActivityMs:Math.max(0,now-state.mutationAgeMs),lastNetworkActivityMs:lastNetworkActivity,lastLayoutActivityMs:lastLayoutActivity,pendingEligibleRequests:visualPending.size});
      if(!stopped&&state.readyState==='complete'&&visualPending.size===0&&!activeAcquisition&&state.mutationAgeMs>=visualQuietMs&&now-lastNetworkActivity>=visualQuietMs&&now-lastLayoutActivity>=visualQuietMs){result.visualReadiness.stable=true;finish(normalCompletion?'SUFFICIENT_STRUCTURED_RESPONSE':'RUNTIME_PAGE_STABLE');}
     }
    }catch{}
    if(!stopped)readinessTimer=setTimeout(poll,100);
   };
   if(readinessAvailable)readinessTimer=setTimeout(poll,100);
   if(!stopped){result.pageExecutionStarted=true;send('Page.navigate',{url:parent.url}).catch(()=>finish('RUNTIME_NAVIGATION_FAILED'));}
   await completed;await queue;
  }catch(e){result.failure={code:['BROWSER_PROTOCOL_ERROR','BROWSER_COMMAND_TIMEOUT','BROWSER_CLOSED'].includes(e.code)?e.code:'RUNTIME_FAILED',...(e.operation?{operation:e.operation}:{})};result.reason=result.reason??(['STATIC_DISCOVERY_NOT_EXHAUSTED','BROWSER_RUNTIME_UNAVAILABLE'].includes(e.code)?e.code:'RUNTIME_EXECUTION_FAILED');result.outcome='UNRESOLVED';}
  finally{clearTimeout(startupTimer);clearTimeout(timer);clearTimeout(readinessTimer);stopped=true;abort.abort();
   result.visualReadiness.pendingEligibleRequests=visualPending.size;
   if(browser){result.screenshot=await captureRenderedPage({browser,sessionId,directory:artifactDirectory,navigationElapsed:elapsed});Object.assign(result.screenshot,{runtimeDeadlineMs:cap.timeoutMs,trigger:result.reason==='RUNTIME_TIMEOUT'?'RUNTIME_DEADLINE':result.visualReadiness.stable?'PAGE_STABLE':normalCompletion?'NORMAL_COMPLETION':'OTHER_BOUNDED_STOP',visualReadiness:{...result.visualReadiness}});}try{await browser?.close();result.cleanup='CLOSED';}catch{result.cleanup='FAILED';result.outcome='UNRESOLVED';result.reason='BROWSER_CLEANUP_FAILED';}result.completedAt=clock();}
  if(result.outcome!=='CAPTURED')result.resources=[];return result;
 }};
}

// Installed Chrome is not sufficient qualification. The renderer must execute with
// Docker network denial AND Chromium's native sandbox are required by the opener.
export async function qualifyPageRuntime({openBrowser=openOfflineBrowser}={}){
 let browser,status={available:false,reason:'BROWSER_ISOLATION_PREFLIGHT_FAILED'};
 try{browser=await openBrowser();assert(browser.networkIsolation==='OS_DENY_TCP_UDP');
  const {targetId}=await browser.send('Target.createTarget',{url:'about:blank'});
  const {sessionId}=await browser.send('Target.attachToTarget',{targetId,flatten:true});
  const r=await browser.send('Runtime.evaluate',{expression:'1',returnByValue:true},sessionId);assert(r.result.value===1&&!r.exceptionDetails);
  status={available:true,reason:'ISOLATED_RENDERER_VERIFIED',revision:browser.revision};
 }catch(e){if(browserStartupReasons.includes(e.code))status.reason=e.code;}finally{try{await browser?.close();}catch{status={available:false,reason:'BROWSER_CLEANUP_FAILED'};}}
 return status;
}
