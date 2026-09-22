// Static source relationships only. Never execute provider JavaScript or infer price fields.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);let parser;const typeScript=()=>parser??=require('typescript');
import {retainedHtmlAttributes,extractPage} from './public-web-adapter.mjs';
import {normalizePublicUrl,PublicNetworkError} from './public-network.mjs';
export const structuredResourceVersion='ASSOCIATED_STRUCTURED_RESOURCE_V1';
export const structuredResourceLimits=Object.freeze({scripts:2,json:2,total:4,scriptBytes:512000,jsonBytes:256000,totalBytes:1536000});
export const resourceHash=s=>createHash('sha256').update(s).digest('hex');
export const scriptScanVersion='ASSOCIATED_SCRIPT_SCAN_V1';
export const scriptScanDigest=s=>resourceHash(JSON.stringify(s));
const allowed=d=>['ALLOWED','NO_ROBOTS_POLICY'].includes(d.decision);
function resourceUrl(value,parent){
 try{const p=normalizePublicUrl(parent),u=normalizePublicUrl(new URL(value,p).href);
  // Only the reviewed parent's own namespace. A lookalike or shared suffix is not authority.
  assert(u.protocol==='https:'&&p.protocol==='https:'&&(u.hostname===p.hostname||u.hostname.endsWith('.'+p.hostname)));
  assert(![...u.searchParams.keys()].some(k=>/token|secret|auth|password|session|api.?key|signature/i.test(k)));
  assert(!/(?:^|\/)(?:login|logout|signin|signup|oauth|authorize|authenticate)(?:\/|$)/i.test(u.pathname));
  assert(!u.pathname.toLowerCase().endsWith('.css'));
  assert(!u.hash&&!/\.(?:png|jpe?g|webp|gif|svg|ico|woff2?)(?:$)/i.test(u.pathname));
  assert(!/[\s\\]/.test(value)&&u.href.length<=2048);return u.href;
 }catch{return null;}
}
export const associatedResourceUrl=resourceUrl;
function reference(url,kind,source,offset,length,basis){return {url,kind,sourceUrl:source.url,sourceHash:source.sourceIntegrity.sha256,offset,length,spanHash:resourceHash(source.rawSource.text.slice(offset,offset+length)),basis};}
function intact(p){return typeof p.rawSource?.text==='string'&&p.sourceIntegrity?.sha256===resourceHash(p.rawSource.text);}
// Scan literal request references, not executable program semantics. No evaluation,
// variable resolution, imports, request options or partial-string inference.
function scannedReferences(text,parentUrl){
 const ts=typeScript(),file=ts.createSourceFile('scan.js',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),out=[];
 if(/\b(?:function|class|const|let|var)\s+fetch\b|\([^)]*\bfetch\b[^)]*\)\s*=>|function[^({]*\([^)]*\bfetch\b/.test(text))return out;
 let nodes=0;const walk=n=>{if(++nodes>100000||out.length)return;
  if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&n.expression.text==='fetch'&&n.arguments.length===1&&
    (ts.isStringLiteral(n.arguments[0])||ts.isNoSubstitutionTemplateLiteral(n.arguments[0]))){
   const offset=n.getStart(file),span=text.slice(offset,n.end),url=resourceUrl(n.arguments[0].text,parentUrl);
   if(url&&Buffer.byteLength(span)<=4096&&span.endsWith(')')&&!file.parseDiagnostics.some(d=>d.start>=offset&&d.start<=n.end))out.push({url,offset,length:span.length,span,spanHash:resourceHash(span)});
  }ts.forEachChild(n,walk);};walk(file);return out;
}
export function createAssociatedScriptScan({url,parentUrl,parentHash,parentReference,maxBytes}){
 assert(resourceUrl(url,parentUrl)===url&&/^[a-f0-9]{64}$/.test(parentHash));
 assert(parentReference?.url===url&&parentReference.sourceHash===parentHash&&parentReference.sourceUrl===parentUrl&&parentReference.kind==='SCRIPT');
 assert(Number.isSafeInteger(maxBytes)&&maxBytes>0&&maxBytes<=structuredResourceLimits.scriptBytes);
 const chunks=[];let size=0,matches=[];
 return {
  push(chunk){assert(Buffer.isBuffer(chunk)&&size+chunk.length<=maxBytes);chunks.push(chunk);size+=chunk.length;
   const text=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks),{stream:true});const access=extractPage(text.slice(0,4096),url);
   if(/captcha|verify (?:you are|that you are) human|access denied|just a moment|unusual traffic/i.test(access.title+' '+access.text.slice(0,600)))throw new PublicNetworkError('ACCESS_CONTROL_STOP');
   matches=scannedReferences(text,parentUrl);return matches.length>0;},
  finish(reason){const prefixSha256=resourceHash(Buffer.concat(chunks));return {version:scriptScanVersion,scriptUrl:url,parentUrl,parentHash,parentReference,
   scanCeiling:maxBytes,bytesScanned:size,prefixSha256,fullBodyRetained:false,stopReason:reason,
   matches:matches.map(m=>({...m,kind:'JSON',sourceUrl:url,sourceHash:prefixSha256,basis:'STATIC_SCANNED_FETCH_LITERAL'}))};}
 };
}
export function validateScriptScan(s){
 try{assert(s?.version===scriptScanVersion&&s.fullBodyRetained===false&&s.scanCeiling>0&&s.scanCeiling<=structuredResourceLimits.scriptBytes);
  assert(Number.isSafeInteger(s.bytesScanned)&&s.bytesScanned>0&&s.bytesScanned<=s.scanCeiling&&/^[a-f0-9]{64}$/.test(s.prefixSha256));
  assert(['CANDIDATE_FOUND','SCAN_BYTE_BOUND','END_OF_RESPONSE'].includes(s.stopReason)&&Array.isArray(s.matches)&&s.matches.length<=1);
  assert((s.stopReason==='CANDIDATE_FOUND')===(s.matches.length===1));
  for(const m of s.matches){assert(Number.isSafeInteger(m.offset)&&m.offset>=0&&m.offset+m.length<=s.bytesScanned&&m.length===m.span.length&&Buffer.byteLength(m.span)<=4096);
   const found=scannedReferences(m.span,s.parentUrl)[0];assert(found&&found.url===m.url&&found.offset===0&&found.length===m.length&&found.spanHash===m.spanHash&&m.sourceUrl===s.scriptUrl&&m.sourceHash===s.prefixSha256&&m.kind==='JSON'&&m.basis==='STATIC_SCANNED_FETCH_LITERAL');}
  return true;
 }catch{return false;}
}
export function discoverAssociatedResources(parent,scripts=[]){
 assert(intact(parent)&&Buffer.byteLength(parent.rawSource.text)<=8000000);assert(scripts.length<=structuredResourceLimits.scripts);
 const candidates=[],diagnostics=[];const add=(value,kind,source,start,length,basis)=>{const url=resourceUrl(value,parent.url);if(url)candidates.push(reference(url,kind,source,start,length,basis));else diagnostics.push('RESOURCE_NAMESPACE_OR_URL_REJECTED');};
 const raw=parent.rawSource.text;
 const tags=/<!--[\s\S]*?-->|<([a-z][a-z0-9-]*)\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi;
 const entries=[];let m;
 while((m=tags.exec(raw))){if(!m[1])continue;const tag=m[1].toLowerCase();if(tag==='base')return {scripts:[],json:[],diagnostics:['DOCUMENT_BASE_REQUIRES_RESOLUTION'],limited:false};
  if(tag==='script'){const closing=/<\/script\s*>/gi;closing.lastIndex=tags.lastIndex;const match=closing.exec(raw),end=match?.index??-1;if(end<0)continue;entries.push({tag,open:m[0],start:m.index,body:raw.slice(tags.lastIndex,end)});tags.lastIndex=end+8;}
  else if(tag==='link')entries.push({tag,open:m[0],start:m.index});
 }
 for(const {tag,open,start,body} of entries){const a=retainedHtmlAttributes(open);
  if(tag==='script'&&/\snomodule(?:\s|=|>)/i.test(open)){diagnostics.push('LEGACY_NOMODULE_SCRIPT_NOT_SELECTED');continue;}
  if(tag==='link'){if(a.rel==='preload'&&a.as==='fetch'&&a.type==='application/json'&&a.href)add(a.href,'JSON',parent,start,open.length,'HTML_JSON_PRELOAD');continue;}
  if(a.src&&(!a.type||['module','text/javascript','application/javascript'].includes(a.type)))add(a.src,'SCRIPT',parent,start,open.length,'HTML_SCRIPT_SRC');
  else if(!a.src&&(!a.type||['module','text/javascript','application/javascript'].includes(a.type)))scan(body,parent,start+open.length);
  else if(a.type==='application/json')diagnostics.push('BOOTSTRAP_RETAINED_NO_REQUEST_INFERENCE');
 }
 for(const script of scripts){if(script.scriptScan){assert(validateScriptScan(script.scriptScan)&&script.scriptScan.parentHash===parent.sourceIntegrity.sha256&&script.scriptScan.parentUrl===parent.url);candidates.push(...script.scriptScan.matches);continue;}
  assert(intact(script)&&Buffer.byteLength(script.rawSource.text)<=structuredResourceLimits.scriptBytes);scan(script.rawSource.text,script,0);}
 function scan(code,source,base){
  if(Buffer.byteLength(code)>structuredResourceLimits.scriptBytes){diagnostics.push('STATIC_SCRIPT_BYTE_BOUND');return;}
  const ts=typeScript();
  const file=ts.createSourceFile('provider.js',code,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);if(file.parseDiagnostics.length){diagnostics.push('SCRIPT_PARSE_UNSUPPORTED');return;}
  // Resolve only unique lexical const string bindings; no imports, eval or mutable config.
  const constants=new Map(),names=new Map(),xhr=new Map(),identifiers=[];let count=0;
  const index=n=>{assert(++count<=100000,'STATIC_SCRIPT_NODE_BOUND');
   if((ts.isVariableDeclaration(n)||ts.isParameter(n)||ts.isImportSpecifier(n))&&ts.isIdentifier(n.name)){const name=n.name.text;names.set(name,(names.get(name)??0)+1);if(ts.isVariableDeclaration(n)&&(n.parent.flags&ts.NodeFlags.Const))constants.set(name,n);}
   if(ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name)&&n.initializer&&ts.isNewExpression(n.initializer)&&ts.isIdentifier(n.initializer.expression)&&n.initializer.expression.text==='XMLHttpRequest'&&!n.initializer.arguments?.length)xhr.set(n.name.text,n);
   if(ts.isIdentifier(n))identifiers.push(n);
   ts.forEachChild(n,index);};index(file);
  function literal(n,seen=new Set()){if(n&&ts.isIdentifier(n)){const d=constants.get(n.text);if(!d||names.get(n.text)!==1||seen.has(n.text)||seen.size>=8||d.end>n.pos)return null;
   const scope=d.parent.parent.parent;let enclosing=n;while(enclosing&&enclosing!==scope)enclosing=enclosing.parent;if(!enclosing)return null;
   return literal(d.initializer,new Set([...seen,n.text]));}
if(!n)return null;if(ts.isParenthesizedExpression(n))return literal(n.expression,seen);if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n))return n.text;
   if(ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.PlusToken){const a=literal(n.left,seen),b=literal(n.right,seen);return a!==null&&b!==null&&a.length+b.length<=2048?a+b:null;}
   if(ts.isTemplateExpression(n)){let out=n.head.text;for(const s of n.templateSpans){const v=literal(s.expression,seen);if(v===null)return null;out+=v+s.literal.text;if(out.length>2048)return null;}return out;}return null;}
  let nodes=0;const walk=n=>{assert(++nodes<=100000,'STATIC_SCRIPT_NODE_BOUND');
   if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&n.expression.text==='fetch'){
    // A shadowed fetch or any options/header/body makes the request unsupported.
    const shadowed=code.match(/\b(?:function|class|const|let|var)\s+fetch\b|\([^)]*\bfetch\b[^)]*\)\s*=>|function[^({]*\([^)]*\bfetch\b/);
    const value=literal(n.arguments[0]);if(!shadowed&&n.arguments.length===1&&value!==null)add(value,'JSON',source,base+n.getStart(file),n.end-n.getStart(file),'STATIC_FETCH_LITERAL');else diagnostics.push('DYNAMIC_OR_NONDEFAULT_REQUEST_REQUIRES_RUNTIME');
   }
   if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&['open','get','request'].includes(n.expression.name.text)){
    const receiver=n.expression.expression,name=ts.isIdentifier(receiver)?receiver.text:null,decl=xhr.get(name);
    const refs=identifiers.filter(i=>i.text===name&&i!==decl?.name);const calls=refs.map(i=>i.parent).filter(p=>ts.isPropertyAccessExpression(p)&&p.expression.text===name).map(p=>p.parent);
    const sends=calls.filter(c=>ts.isCallExpression(c)&&c.expression.name?.text==='send'&&c.arguments.length===0);
    const value=literal(n.arguments[1]);
    const safe=decl&&names.get(name)===1&&!names.has('XMLHttpRequest')&&n.expression.name.text==='open'&&literal(n.arguments[0])==='GET'&&value!==null&&(n.arguments.length===2||n.arguments.length===3&&n.arguments[2].kind===ts.SyntaxKind.TrueKeyword)&&sends.length===1&&calls.length===2&&refs.length===2&&calls.includes(n)&&decl.end<n.pos&&sends[0].pos>n.pos&&decl.parent.parent.parent===n.parent.parent&&sends[0].parent.parent===n.parent.parent;
    if(safe)add(value,'JSON',source,base+n.getStart(file),sends[0].end-n.getStart(file),'STATIC_XHR_GET_LITERAL');else diagnostics.push('UNRESOLVED_REQUEST_CLIENT_OR_METHOD');
   }
   ts.forEachChild(n,walk);
  };walk(file);
 }
 const unique=[...new Map(candidates.map(c=>[c.kind+'|'+c.url,c])).values()];
 // Prefer a script whose filename mirrors the parent route, without knowing provider routes.
 const route=new URL(parent.url).pathname.split('/').filter(Boolean).at(-1);
 const scriptsAll=unique.filter(c=>c.kind==='SCRIPT'),routeMatch=c=>!!route&&new URL(c.url).pathname.split('/').at(-1).startsWith(route+'-');
 const matched=scriptsAll.find(routeMatch),directory=u=>new URL('.',u).href;
 const score=c=>routeMatch(c)?2:matched&&directory(c.url)===directory(matched.url)?1:0;
 const scriptRefs=scriptsAll.sort((a,b)=>score(b)-score(a));
 return {scripts:scriptRefs.slice(0,structuredResourceLimits.scripts),json:unique.filter(c=>c.kind==='JSON').slice(0,structuredResourceLimits.json),diagnostics:[...new Set(diagnostics)],limited:scriptRefs.length>structuredResourceLimits.scripts||unique.filter(c=>c.kind==='JSON').length>structuredResourceLimits.json};
}
export function validateStructuredRelationship(page){
 try{
  const r=page.structuredRelationship;assert(r?.version===structuredResourceVersion&&r.parent&&Array.isArray(r.scripts));const p=r.parent;
  assert(intact(p)&&p.outcome==='OK'&&p.httpStatus===200&&p.authority?.status==='CONFIGURED_REVIEWED'&&p.authority.sourceType==='OFFICIAL_PROVIDER'&&p.sourceType==='OFFICIAL_PROVIDER'&&p.authority.hostname===new URL(p.url).hostname&&p.authority.sourceUrl&&new URL(p.authority.sourceUrl).hostname===p.authority.hostname&&p.authority.checkedAt);
  assert(p.accessDecisions?.length&&p.accessDecisions.every(allowed));assert(r.scripts.length<=structuredResourceLimits.scripts);
  const proof=r.proof;assert(proof?.level==='BRACKET_VERIFIED'&&proof.equality&&proof.conflicts.length===0&&proof.bindingRef===page.transportProof?.attemptId&&proof.bindingRef===r.bindingRef);
  assert([proof.before.country,proof.after.country,proof.targetCountry,p.targetCountry,page.targetCountry,page.transportProof.requestedCountry,page.transportProof.before,page.transportProof.after].every(c=>c===p.targetCountry));
  assert(proof.before.status==='MATCH'&&proof.after.status==='MATCH'&&proof.before.evidence.bindingRef===r.bindingRef&&proof.after.evidence.bindingRef===r.bindingRef&&proof.before.address===proof.after.address&&proof.target.finalUrl===p.url);
  const check=(v,limit)=>{assert(intact(v)&&Buffer.byteLength(v.rawSource.text)<=limit&&v.outcome==='OK'&&v.httpStatus===200&&v.accessDecisions?.length&&v.accessDecisions.every(allowed));assert(r.receipts.some(x=>x.url===v.url&&x.bindingRef===r.bindingRef&&x.bodySha256===v.sourceIntegrity.sha256));assert(Date.parse(v.checkedAt)>=Date.parse(proof.before.evidence.checkedAt)&&Date.parse(v.checkedAt)<=Date.parse(proof.after.evidence.checkedAt));};
  check(p,8000000);const declared=discoverAssociatedResources(p).scripts;
  for(const s of r.scripts){if(s.scriptScan){const scan=s.scriptScan;assert(validateScriptScan(scan)&&scan.scriptUrl===s.url&&scan.parentUrl===p.url&&scan.parentHash===p.sourceIntegrity.sha256&&!s.rawSource);
    assert(declared.some(d=>JSON.stringify(d)===JSON.stringify(scan.parentReference)));assert(s.outcome==='SCAN_ONLY'&&s.httpStatus===200&&s.accessDecisions?.length&&s.accessDecisions.every(allowed));
    assert(r.receipts.some(x=>x.url===s.url&&x.bindingRef===r.bindingRef&&x.scriptScanDigest===scriptScanDigest(scan)&&x.scannedPrefixSha256===scan.prefixSha256&&x.bodyBytes===scan.bytesScanned));
    assert(Date.parse(s.checkedAt)>=Date.parse(proof.before.evidence.checkedAt)&&Date.parse(s.checkedAt)<=Date.parse(proof.after.evidence.checkedAt));
   }else check(s,structuredResourceLimits.scriptBytes);assert(declared.some(d=>d.url===s.url));assert(['application/javascript','text/javascript'].includes(s.contentType));}
  check(page,structuredResourceLimits.jsonBytes);assert(page.contentType==='application/json');JSON.parse(page.rawSource.text);
  if(r.runtime){const rt=r.runtime,ref=r.reference;
   assert(rt.version==='OBSERVED_STRUCTURED_RESOURCE_V1'&&rt.outcome==='CAPTURED'&&rt.cleanup==='CLOSED'&&rt.bindingRef===r.bindingRef&&rt.parentHash===p.sourceIntegrity.sha256&&rt.parentUrl===p.url);
   assert(p.structuredResourceDiscovery?.status==='NO_STATIC_STRUCTURED_RESOURCE_ACQUIRED'&&rt.scripts.length<=10&&rt.resources.length<=1&&rt.used.requests<=16&&rt.used.bytes<=4000000);
   assert(ref.basis==='OBSERVED_RUNTIME_REQUEST'&&ref.method==='GET'&&ref.frame==='REVIEWED_PARENT'&&ref.bindingRef===r.bindingRef&&ref.url===page.url&&resourceUrl(ref.url,p.url)===ref.url&&ref.sourceHash===page.sourceIntegrity.sha256);
   assert(rt.resources.some(o=>JSON.stringify({...o,basis:'OBSERVED_RUNTIME_REQUEST'})===JSON.stringify(ref)));
   assert(ref.initiator.type==='script'&&(ref.initiator.url===p.url||rt.scripts.some(s=>s.url===ref.initiator.url)));
   for(const s of rt.scripts)assert(resourceUrl(s.url,p.url)===s.url&&s.bindingRef===r.bindingRef&&r.receipts.some(x=>x.url===s.url&&x.bindingRef===r.bindingRef&&x.bodySha256===s.sourceHash));
   assert(Date.parse(rt.startedAt)>=Date.parse(proof.before.evidence.checkedAt)&&Date.parse(rt.completedAt)<=Date.parse(proof.after.evidence.checkedAt));
  }else {const found=discoverAssociatedResources(p,r.scripts).json;assert(found.some(d=>JSON.stringify(d)===JSON.stringify(r.reference)&&d.url===page.url));}
  assert(page.authority?.status==='DERIVED_EXACT_RESOURCE'&&page.authority.sourceUrl===page.url&&page.authority.parentUrl===p.url&&page.authority.provider===p.authority.provider&&page.authority.hostname===new URL(page.url).hostname&&page.sourceType==='OFFICIAL_PROVIDER');
  return true;
 }catch{return false;}
}
// Raw JSON object fragments: no field-name/language schema and no invented HTML/text.
export function structuredSemanticContainers(raw){
 assert(Buffer.byteLength(raw)<=structuredResourceLimits.jsonBytes);JSON.parse(raw);
 const ts=typeScript();const file=ts.parseJsonText('provider.json',raw);assert(!file.parseDiagnostics.length);const all=[];let nodes=0;
 const walk=n=>{assert(++nodes<=100000);if(ts.isObjectLiteralExpression(n)){assert(new Set(n.properties.map(p=>p.name?.text)).size===n.properties.length,'AMBIGUOUS_JSON_KEYS');const start=n.getStart(file),end=n.end,text=raw.slice(start,end);if(Buffer.byteLength(text)<=6000&&/\d/.test(text)&&/\p{L}/u.test(text))all.push({start,end,text,admission:'OFFICIAL_STRUCTURED_OBJECT_V1'});}ts.forEachChild(n,walk);};walk(file);
 const selected=[];for(const c of all.sort((a,b)=>(b.end-b.start)-(a.end-a.start)||a.start-b.start)){if(!selected.some(p=>c.start<p.end&&c.end>p.start))selected.push(c);if(selected.length===4)break;}return selected.sort((a,b)=>a.start-b.start);
}

export function structuredAmountSpan(text,start,end){
 const ts=typeScript(),file=ts.parseJsonText('fragment.json',text);if(file.parseDiagnostics.length)return false;let found=false;
 const visit=(n,parent)=>{if(ts.isNumericLiteral(n)&&n.getStart(file)===start&&n.end===end)found=true;
  if(ts.isStringLiteral(n)&&!(parent&&ts.isPropertyAssignment(parent)&&parent.name===n)&&start>n.getStart(file)&&end<n.end&&!/[\p{L}\p{N}.,]/u.test(text[start-1]??'')&&!/[\p{L}\p{N}.,]/u.test(text[end]??''))found=true;
  ts.forEachChild(n,c=>visit(c,n));};visit(file);return found;
}
