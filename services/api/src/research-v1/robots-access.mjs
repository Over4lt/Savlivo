// In-run research policy only. No transport, cache or environment work at import.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createPublicReader, normalizePublicUrl, PublicNetworkError, researchProductToken, researchUserAgent,safeResponseDiagnostic} from './public-network.mjs';
import {createFreePublicAdapter} from './public-web-adapter.mjs';
const error=code=>{throw new PublicNetworkError(code);};
const digest=s=>createHash('sha256').update(s).digest('hex');
const permitted=new Set(['ALLOWED','NO_ROBOTS_POLICY']);
// RFC 9309: preserve encoded reserved octets; decode unreserved octets; encode UTF-8.
function octets(s){return s.replace(/[^\x00-\x7f]/gu,c=>encodeURIComponent(c)).replace(/%([\da-f]{2})/gi,(_,h)=>{
  const c=String.fromCharCode(parseInt(h,16));return /[a-z\d._~-]/i.test(c)?c:'%'+h.toUpperCase();
});}
// Bounded wildcard matching without a regex backtracking engine. Rules are prefix matches unless $ ends them.
function matches(pattern,path,budget){
  const end=pattern.endsWith('$');if(end)pattern=pattern.slice(0,-1);else pattern+='*';
  let p=0,t=0,star=-1,checkpoint=0;
  while(t<path.length){if(--budget.steps<0)return null;if(pattern[p]===path[t]&&pattern[p]!=='*'){p++;t++;}
    else if(pattern[p]==='*'){star=p++;checkpoint=t;}
    else if(star>=0){p=star+1;t=++checkpoint;}else return false;}
  while(pattern[p]==='*')p++;return p===pattern.length;
}
export function parseRobots(body,{diagnostics=false}={}){
  assert(typeof body==='string');
  if(Buffer.byteLength(body)>512000)return {invalid:'OVERSIZED_POLICY'};
  if(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]|<\/?(?:html|head|body|!doctype)\b/i.test(body))return {invalid:'INVALID_BODY'};
  const groups=[];let group=null,hasRules=false;
  const lines=body.replace(/^\uFEFF/,'').split(/\r\n|\r|\n/);
  if(lines.length>10000)return {invalid:'POLICY_COMPLEXITY'};
  for(let i=0;i<lines.length;i++){
    const line=lines[i].split('#')[0].trim();if(!line)continue;
    if(line.length>2048)return {invalid:'POLICY_COMPLEXITY'};
    const m=line.match(/^([a-z-]+)\s*:\s*(.*?)\s*$/i);if(!m)return {invalid:'MALFORMED_LINE'};
    const key=m[1].toLowerCase(),value=m[2];
    const reject=reason=>({invalid:reason,...(diagnostics?{diagnostic:{version:1,line:i+1,directive:key,valueLength:value.length,
      missingLeadingSlash:reason==='INVALID_PATH'&&!!value&&!value.startsWith('/'),whitespace:/\s/.test(value),malformedPercent:/%(?![\da-f]{2})/i.test(value),
      firstInvalidOffset:reason==='INVALID_AGENT'?value.search(/[^a-z_-]/i):value.search(/\s|%(?![\da-f]{2})/i),
      agentHasDigit:reason==='INVALID_AGENT'&&/\d/.test(value),agentHasSlash:reason==='INVALID_AGENT'&&value.includes('/')}}:{})});
    if(key==='user-agent'){
      if(!/^(?:[a-z_-]+|\*)$/i.test(value))return reject('INVALID_AGENT');
      if(!group||hasRules){group={agents:[],rules:[]};groups.push(group);hasRules=false;}
      group.agents.push(value.toLowerCase());
    }else if(key==='allow'||key==='disallow'){
      if(!group)return {invalid:'RULE_WITHOUT_GROUP'};
      hasRules=true;
      if(value&&!value.startsWith('/')||/[\s]|%(?![\da-f]{2})/i.test(value))return reject('INVALID_PATH');
      if(value)group.rules.push({directive:key,path:value,line:i+1});
    }else if(key==='crawl-delay'||key==='request-rate'){
      // Do not ignore a requested pacing policy that this small adapter cannot implement.
      if(!group)return {invalid:'PACING_WITHOUT_GROUP'};
      group.pacing=true;hasRules=true;
    }
    // Sitemap and other extension records do not terminate a group (RFC 9309 §2.2.4).
  }
  return {groups};
}
export function evaluateRobots(parsed,target,productToken=researchProductToken){
  if(parsed.invalid)return {decision:'ROBOTS_INVALID',reason:parsed.invalid,groups:[],rule:null};
  const specific=parsed.groups.filter(g=>g.agents.includes(productToken.toLowerCase()));
  const selected=specific.length?specific:parsed.groups.filter(g=>g.agents.includes('*'));
  const groups=selected.map(g=>g.agents);
  if(selected.some(g=>g.pacing))return {decision:'REVIEW_REQUIRED',reason:'UNSUPPORTED_PACING_DIRECTIVE',groups,rule:null};
  const u=new URL(target),path=octets(u.pathname+u.search);
  const rules=[],budget={steps:250000};
  if(path.length>8192)return {decision:'REVIEW_REQUIRED',reason:'MATCH_COMPLEXITY_LIMIT',groups,rule:null};
  for(const r of selected.flatMap(g=>g.rules)){
    const normalized=octets(r.path),match=matches(normalized,path,budget);
    if(match===null)return {decision:'REVIEW_REQUIRED',reason:'MATCH_COMPLEXITY_LIMIT',groups,rule:null};
    if(match)rules.push({...r,normalized});
  }
  // Compare normalized pattern octets, including wildcard/end-marker syntax.
  const specificity=r=>r.normalized.length;
  rules.sort((a,b)=>specificity(b)-specificity(a)||(a.directive===b.directive?0:a.directive==='allow'?-1:1));
  const rule=rules[0];
  return {decision:rule?.directive==='disallow'?'DISALLOWED':'ALLOWED',reason:rule?'MATCHED_RULE':'NO_APPLICABLE_RESTRICTION',groups,
    rule:rule?{directive:rule.directive,path:rule.path,line:rule.line}:null};
}

/** One instance per run (or isolated geo binding). Network overrides require trusted
 * deterministic tests or the reviewed geo binding; never accept page/model-supplied hooks.
 * Counts every actual page/robots HTTP hop, including redirects, before dispatch.
 * Caller can additionally charge the census shared network budget through consumeNetwork.
 */
export function createRobotsPublicAdapter({clock=()=>new Date().toISOString(),network={},maxRequests=72,maxReads=24,maxOrigins=32,cacheTtlMs=3600000,publicEvidence=null,policyImplementation=null,...pageOptions}={}){
  for(const n of [maxRequests,maxReads,maxOrigins,cacheTtlMs])assert(Number.isSafeInteger(n)&&n>0);
  assert(cacheTtlMs<=86400000);assert(!Object.hasOwn(network,'beforeRequest'));
  const cache=new Map();let busy=false,reads=0;
  const stats={requests:0,robotsRequests:0,pageRequests:0,cacheHits:0,originsChecked:0,pageSuccesses:0,pageFailures:0,decisions:[]};
  if(publicEvidence){
    assert(Object.keys(publicEvidence).every(k=>['maxRedirects','maxBodyBytes','maxTotalBodyBytes'].includes(k)));
    const {maxRedirects,maxBodyBytes,maxTotalBodyBytes}=publicEvidence;
    assert(Number.isSafeInteger(maxRedirects)&&maxRedirects>=0&&maxRedirects<=3);
    assert(Number.isSafeInteger(maxBodyBytes)&&maxBodyBytes>=1&&maxBodyBytes<=4000000);
    assert(Number.isSafeInteger(maxTotalBodyBytes)&&maxTotalBodyBytes>=maxBodyBytes&&maxTotalBodyBytes<=16000000);
    const authorities=pageOptions.authorities;
    assert(authorities?.length&&authorities.every(a=>a.sourceUrl&&a.checkedAt&&a.provider&&['OFFICIAL_PROVIDER','OFFICIAL_SUPPORT'].includes(a.sourceType)&&new URL(a.sourceUrl).hostname===a.hostname));
    stats.responseBodyBytes=0;stats.maxTotalBodyBytes=maxTotalBodyBytes;
    network={...network,maxRedirects,maxBytes:maxBodyBytes,authorityOrigins:[...new Set(authorities.map(a=>'https://'+a.hostname))],onBodyBytes:n=>{
      stats.responseBodyBytes+=n;if(stats.responseBodyBytes>maxTotalBodyBytes)error('BODY_BUDGET_EXHAUSTED');
    }};
  }
  const inspect=async(input,options)=>{
    const decisions=[];
    const charge=kind=>{
      if(stats.requests>=maxRequests)error('NETWORK_BUDGET_EXHAUSTED');
      options.consumeNetwork?.(kind);
      stats.requests++;stats[kind==='robots'?'robotsRequests':'pageRequests']++;
    };
    const policy=async({url,signal})=>{
      const u=normalizePublicUrl(url),key=u.origin+'|'+researchProductToken;
      let entry=cache.get(key),hit=!!entry&&Date.parse(clock())-entry.storedAt<cacheTtlMs;
      if(hit)stats.cacheHits++;
      else {
        // Never evict and refetch a failed origin repeatedly during a bounded run.
        if(!entry&&cache.size>=maxOrigins){entry={decision:'REVIEW_REQUIRED',reason:'ORIGIN_CACHE_LIMIT',checkedAt:clock(),redirects:[]};}
        else {
          stats.originsChecked++;
          entry={checkedAt:clock(),storedAt:Date.parse(clock()),redirects:[]};
          try{
            const response=await createPublicReader({...network,robotsPolicyRetrieval:true,timeoutMs:Math.max(1,Math.floor((network.timeoutMs??10000)/2)),maxBytes:512000,beforeRequest:()=>charge('robots')})(u.origin+'/robots.txt',{signal,maxRedirects:options.maxRedirects});
            Object.assign(entry,{status:response.status,robotsFinalUrl:response.url,redirects:response.redirects,...(!response.bodyOmitted?{bodyHash:digest(response.text)}:{})});
            if([404,410].includes(response.status))Object.assign(entry,{decision:'NO_ROBOTS_POLICY',reason:'HTTP_ABSENCE'});
            else if(response.status!==200)Object.assign(entry,{decision:'ROBOTS_UNAVAILABLE',reason:'HTTP_'+response.status});
            else if(response.contentType!=='text/plain')Object.assign(entry,{decision:'ROBOTS_INVALID',reason:'ROBOTS_NOT_TEXT_PLAIN'});
            else entry.parsed=(policyImplementation?.parse??parseRobots)(response.text,{diagnostics:true});
          }catch(e){Object.assign(entry,{decision:'ROBOTS_UNAVAILABLE',reason:e.code??'NETWORK_FAILED',redirects:e.redirects??[]});
            if(e.redirectDiagnostic)entry.rejectionDiagnostic=e.redirectDiagnostic;
            const diagnostic=e.code==='UNSUPPORTED_CONTENT'?safeResponseDiagnostic(e.responseDiagnostic):null;
            if(diagnostic)entry.responseDiagnostic=diagnostic;
          }
          cache.set(key,entry);
        }
      }
      const evaluation=entry.parsed?(policyImplementation?.evaluate??evaluateRobots)(entry.parsed,u.href):{decision:entry.decision,reason:entry.reason,groups:[],rule:null};
      const d={targetUrl:u.href,origin:u.origin,robotsUrl:u.origin+'/robots.txt',userAgent:researchUserAgent,productToken:researchProductToken,
        checkedAt:entry.checkedAt,cacheHit:hit,redirects:entry.redirects,...(entry.robotsFinalUrl?{robotsFinalUrl:entry.robotsFinalUrl}:{}),
        ...(entry.bodyHash?{bodyHash:entry.bodyHash}:{}),...(entry.status?{httpStatus:entry.status}:{}),
        ...(entry.parsed?.diagnostic||entry.rejectionDiagnostic?{rejectionDiagnostic:entry.parsed?.diagnostic??entry.rejectionDiagnostic}:{}),
        ...(entry.responseDiagnostic?{responseDiagnostic:entry.responseDiagnostic,httpStatus:entry.responseDiagnostic.httpStatus}:{}),...evaluation};
      decisions.push(d);stats.decisions.push(d);
      if(!permitted.has(d.decision))error('ROBOTS_ACCESS_STOP');
    };
    try{
      if(options.accessOnly){
        await policy({url:input,signal:options.signal});
        return decisions;
      }
      const response=await createPublicReader({...network,beforeRequest:async r=>{await policy(r);charge('page');}})(input,options);
      if(response.status===200)stats.pageSuccesses++;else stats.pageFailures++;
      return {...response,accessDecisions:decisions};
    }catch(e){if(!options.accessOnly)stats.pageFailures++;e.accessDecisions=decisions;throw e;}
  };
  const adapter=createFreePublicAdapter({...pageOptions,clock,reader:inspect});
  // Reader options are private to this call, never model/page supplied. Serial use prevents storms.
  const original=adapter.read;
  return {...adapter,provider:'robots-policy+'+adapter.provider,
    // Search is supplied by the existing host bridge, not a second uncontrolled transport path.
    async search(request){if(pageOptions.searchEnabled===true){if(busy)throw new PublicNetworkError('CONCURRENT_READ_NOT_ALLOWED');busy=true;try{return await adapter.search(request);}finally{busy=false;}}const {query,locale,targetCountry}=request;return {costClass:'FREE',query,locale,targetCountry,checkedAt:clock(),results:[],failure:{code:'SEARCH_BRIDGE_REQUIRED'}};},
    accessPolicy:Object.freeze({robotsAndRedirectsEnforced:true,networkBudget:true,networkRequestLimit:maxRequests,...(publicEvidence?{officialEvidenceRedirects:publicEvidence.maxRedirects}:{})}),
    async checkAccess(url,{consumeNetwork,maxRedirects=4}={}){
      if(busy)throw new PublicNetworkError('CONCURRENT_READ_NOT_ALLOWED');busy=true;
      try{return await inspect(url,{consumeNetwork,maxRedirects,accessOnly:true});}finally{busy=false;}
    },
    statistics:()=>structuredClone({...stats,cacheEntries:cache.size,maxRequests,maxOrigins}),
    async readImage(request){
      assert(network.imageUrls?.includes(request.url),'IMAGE_NOT_ADMITTED');
      if(reads>=maxReads)throw new PublicNetworkError('READ_BUDGET_EXHAUSTED');reads++;
      if(busy)throw new PublicNetworkError('CONCURRENT_READ_NOT_ALLOWED');busy=true;
      try{return await inspect(request.url,{...request,maxRedirects:0});}finally{busy=false;}
    },
    async read(request){
      if(reads>=maxReads)throw new PublicNetworkError('READ_BUDGET_EXHAUSTED');reads++;
      if(busy)throw new PublicNetworkError('CONCURRENT_READ_NOT_ALLOWED');busy=true;
      try{return await original({...request,...(publicEvidence?{maxRedirects:Math.min(request.maxRedirects??publicEvidence.maxRedirects,publicEvidence.maxRedirects)}:{})});}finally{busy=false;}
    }};
}
