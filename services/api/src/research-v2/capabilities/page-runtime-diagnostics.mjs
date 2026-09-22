import {visualReadinessInstrumentation} from './page-runtime-visual-readiness.mjs';
// Bounded execution diagnostics only; never evidence of price or authority.
export const diagnosticLimits=Object.freeze({events:32,text:512,scripts:20,snapshotMs:500});
const safe=s=>String(s??'').slice(0,2048).replace(/(token|secret|password|authorization|cookie)\s*[:=]\s*[^\s,;]+/ig,'$1=[REDACTED]').slice(0,diagnosticLimits.text);
const safeUrl=s=>{try{const u=new URL(s);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)return null;return (u.origin+u.pathname).slice(0,512);}catch{return null;}};
export function createRuntimeDiagnostics(){
 const result={limits:diagnosticLimits,events:[],seen:0,truncated:false,state:null};
 return {result,observe(m){
  if(!['Runtime.exceptionThrown','Runtime.consoleAPICalled','Log.entryAdded','Page.domContentEventFired','Page.loadEventFired'].includes(m.method))return;
  result.seen++;if(result.events.length>=diagnosticLimits.events){result.truncated=true;return;}
  const p=m.params??{},e=p.exceptionDetails??{},entry=p.entry??{};
  result.events.push({method:m.method,...(m.method==='Runtime.exceptionThrown'?{text:safe(e.exception?.description??e.text),url:safeUrl(e.url??e.stackTrace?.callFrames?.[0]?.url),line:e.lineNumber??null}:{}),
   ...(m.method==='Runtime.consoleAPICalled'?{type:safe(p.type),text:(p.args??[]).slice(0,4).map(a=>safe(typeof a.value==='string'||typeof a.value==='number'?a.value:a.type)).join(' ').slice(0,512)}:{}),
   ...(m.method==='Log.entryAdded'?{level:safe(entry.level),text:safe(entry.text),url:safeUrl(entry.url)}:{})});
 }};
}
const instrumentation=`(()=>{const events=[];Object.defineProperty(window,'__researchOfflineScriptEvents',{value:events});for(const type of ['load','error'])document.addEventListener(type,e=>{if(e.target?.tagName==='SCRIPT'&&events.length<20)events.push({type,url:e.target.src});},true);})()`;
const snapshot=`(()=>{const storage=k=>{try{return {available:true,count:window[k].length};}catch{return {available:false};}};return {readyState:document.readyState,nextBootstrapPresent:!!document.getElementById('__NEXT_DATA__'),nextRootChildCount:document.getElementById('__next')?.childElementCount??null,nextRouterPresent:!!window.next?.router,fetchAvailable:typeof fetch==='function',xhrAvailable:typeof XMLHttpRequest==='function',cookiePresent:document.cookie.length>0,localStorage:storage('localStorage'),sessionStorage:storage('sessionStorage'),scriptEvents:(window.__researchOfflineScriptEvents??[]).slice(0,20),scripts:Array.from(document.scripts).slice(0,20).map(s=>({url:s.src,defer:s.defer,async:s.async,type:s.type}))};})()`;
export function withRuntimeDiagnostics(b,diagnostics){
 let sessionId;b.onEvent(m=>{if(m.sessionId===sessionId)diagnostics.observe(m);});
 return {...b,send:(method,p,session)=>{const pending=b.send(method,p,session);
  if(method==='Target.attachToTarget')return pending.then(r=>{sessionId=r.sessionId;return r;});
  if(method!=='Fetch.enable')return pending;
  // Install observers after Network interception is configured, before navigation.
  return pending.then(async r=>{await b.send('Runtime.enable',{},sessionId);await b.send('Log.enable',{},sessionId);await b.send('Page.addScriptToEvaluateOnNewDocument',{source:instrumentation+';'+visualReadinessInstrumentation},sessionId);return r;});
 },close:async()=>{try{if(sessionId){const r=await b.send('Runtime.evaluate',{expression:snapshot,returnByValue:true,timeout:diagnosticLimits.snapshotMs},sessionId);const state=r.result?.value;
  if(state){for(const key of ['scripts','scriptEvents'])state[key]=(state[key]??[]).slice(0,20).map(s=>({type:safe(s.type),url:safeUrl(s.url),defer:s.defer===true,async:s.async===true}));diagnostics.result.state=state;}
 }}catch{diagnostics.result.snapshotFailure='SNAPSHOT_UNAVAILABLE';}finally{await b.close();}}};
}

export {createRuntimeDiagnostics as createOfflineDiagnostics};
