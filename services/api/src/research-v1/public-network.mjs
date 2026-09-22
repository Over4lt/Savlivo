// Public-only HTTP transport. No network or environment configuration read at import.
import http from 'node:http';
import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export const researchUserAgent = 'SavlivoCatalogResearch/1.0 (public evidence; no authentication)';
export const researchProductToken = 'SavlivoCatalogResearch';

export class PublicNetworkError extends Error {
  constructor(code,diagnostic) { super(code); this.code = code;
    const safe=code==='UNSUPPORTED_CONTENT'?safeResponseDiagnostic(diagnostic):null;
    const body=code==='RESPONSE_TOO_LARGE'?safeBodyDiagnostic(diagnostic):null;if(body)this.bodyDiagnostic=body;
    if(safe)this.responseDiagnostic=safe;
  }
}
// Diagnostic projection only; never changes transport admission. Parameters/raw headers
// are excluded; malformed or oversized media types are withheld, not repaired.
export function safeResponseDiagnostic(d){
  if(!d||d.code!=='UNSUPPORTED_CONTENT'||!['PROXY_MIME_GATE','PUBLIC_READER_MIME_GATE'].includes(d.rejectionStage)||typeof d.contentTypePresent!=='boolean')return null;
  const type=d.normalizedMediaType;
  return {code:'UNSUPPORTED_CONTENT',rejectionStage:d.rejectionStage,
    httpStatus:Number.isInteger(d.httpStatus)&&d.httpStatus>=100&&d.httpStatus<=599?d.httpStatus:null,
    contentTypePresent:d.contentTypePresent,
    normalizedMediaType:d.contentTypePresent&&typeof type==='string'&&type.length<=127&&/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(type)?type:null};
}
export function safeBodyDiagnostic(d){
  if(!d||!['DECLARED_LENGTH','STREAM'].includes(d.stage)||!Number.isSafeInteger(d.limit)||d.limit<1||!Number.isSafeInteger(d.receivedBytes)||d.receivedBytes<0)return null;
  return {version:1,stage:d.stage,limit:d.limit,receivedBytes:d.receivedBytes,declaredBytes:Number.isSafeInteger(d.declaredBytes)&&d.declaredBytes>=0?d.declaredBytes:null,
    contentType:typeof d.contentType==='string'&&/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(d.contentType)&&d.contentType.length<=127?d.contentType:null,encoding:'identity'};
}
const fail = code => { throw new PublicNetworkError(code); };
export function publicAddress(address) {
  if (isIP(address) === 4) {
    const [a,b,c] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || a === 100 && b >= 64 && b <= 127
      || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31
      || a === 192 && (b === 168 || b === 0 && (c === 0 || c === 2) || b === 88 && c === 99)
      || a === 198 && (b === 18 || b === 19 || b === 51 && c === 100) || a === 203 && b === 0 && c === 113);
  }
  if (isIP(address) === 6) {
    // Conservative global unicast only: excludes mapped IPv4, NAT64, ULA, link-local, multicast.
    const parts = address.toLowerCase().split(':');
    const first = parseInt(parts[0],16), second = parseInt(parts[1] || '0',16);
    return first >= 0x2000 && first <= 0x3fff && first !== 0x2002 && first !== 0x3fff
      && !(first === 0x2001 && (second < 0x0200 || second === 0x0db8));
  }
  return false;
}
export function normalizePublicUrl(value) {
  let u;
  try { u = new URL(value); } catch { fail('INVALID_URL'); }
  if (!['http:','https:'].includes(u.protocol) || u.username || u.password || u.port) fail('UNSUPPORTED_URL');
  const host = u.hostname.replace(/^\[|\]$/g,'').replace(/\.$/,'').toLowerCase();
  if (!host || /(^|\.)(localhost|local|internal|invalid|test|onion)$/.test(host) || host === 'metadata.google.internal') fail('UNSAFE_HOST');
  if (isIP(host) ? !publicAddress(host) : !host.includes('.')) fail('UNSAFE_HOST');
  u.hash = ''; return u;
}
function defaultRequest({ url, address, family, signal, maxBytes, locale, acceptJson=false, maxJsonBytes=10000, pricingScript=false, onBodyBytes=()=>{} }) {
  return new Promise((resolve,reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request(url, {
      method: 'GET', agent: false, signal,
      lookup: (_host, options, callback) => options.all ? callback(null,[{address,family}]) : callback(null,address,family),
      headers: { 'User-Agent': researchUserAgent,
        Accept: acceptJson?'application/json':pricingScript?'application/javascript,text/javascript':'text/html,application/xhtml+xml,application/rss+xml,application/xml,text/plain;q=0.8',
        'Accept-Encoding': 'identity', ...(locale ? {'Accept-Language':locale} : {}) }
    }, res => {
      const headers = res.headers, status = res.statusCode;
      if ([301,302,303,307,308].includes(status)) { res.destroy(); resolve({status,headers,body:Buffer.alloc(0)}); return; }
      const encoding = String(headers['content-encoding'] ?? 'identity');
      if (encoding !== 'identity') { res.destroy(); reject(new PublicNetworkError('UNSUPPORTED_ENCODING')); return; }
      const type = String(headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
      if (!(acceptJson&&type==='application/json')&&!(pricingScript&&['application/javascript','text/javascript'].includes(type))&&!['text/html','application/xhtml+xml','text/plain','application/rss+xml','application/xml','text/xml'].includes(type)) {
        res.destroy(); reject(new PublicNetworkError('UNSUPPORTED_CONTENT')); return;
      }
      const responseLimit=acceptJson&&type==='application/json'?Math.min(maxBytes,maxJsonBytes):maxBytes;
      if (Number(headers['content-length']) > responseLimit) { res.destroy(); const e=new PublicNetworkError('RESPONSE_TOO_LARGE');e.bodyDiagnostic=safeBodyDiagnostic({stage:'DECLARED_LENGTH',limit:responseLimit,declaredBytes:Number(headers['content-length']),receivedBytes:0,contentType:type});reject(e); return; }
      const chunks = []; let size = 0;
      res.on('data',chunk => { size += chunk.length;try{onBodyBytes(chunk.length);}catch(e){res.destroy(e);return;} if (size > responseLimit) { const e=new PublicNetworkError('RESPONSE_TOO_LARGE');e.bodyDiagnostic=safeBodyDiagnostic({stage:'STREAM',limit:responseLimit,receivedBytes:size,declaredBytes:Number(headers['content-length']),contentType:type});res.destroy(e); } else chunks.push(chunk); });
      res.on('error',reject); res.on('end',()=>resolve({status,headers,body:Buffer.concat(chunks)}));
    });
    req.on('error',reject); req.end();
  });
}

// Default direct transport uses both defaults. Injected transports are trusted code:
// deterministic tests or the reviewed geo binding, which additionally validates remote receipts.
export function safeRuntimeCors(headers={}){
 const out={},origin=headers['access-control-allow-origin'];
 if(typeof origin==='string'&&origin.length<=2048&&(origin==='*'||/^https:\/\/[a-z0-9.-]+(?::[0-9]+)?$/i.test(origin)))out['access-control-allow-origin']=origin;
 if(headers['access-control-allow-credentials']==='true')out['access-control-allow-credentials']='true';
 return out;
}
export function createPublicReader({ resolveHost = host => lookup(host,{all:true,verbatim:true}), requestOnce = defaultRequest,
  timeoutMs = 10000, maxBytes = 1000000, maxRedirects: redirectCap = 4, beforeRequest = null, jsonUrls=[],mixedJsonUrls=[],pricingResources=false,robotsPolicyRetrieval=false,imageUrls=[],scriptUrls=[],structuredJsonUrls=[],retainRuntimeCors=false,
  authorityOrigins=null,onBodyBytes=()=>{},scriptScan=null } = {}) {
  if(authorityOrigins!==null&&(!Array.isArray(authorityOrigins)||!authorityOrigins.length||authorityOrigins.length>32||authorityOrigins.some(o=>normalizePublicUrl(o).origin!==o||!o.startsWith('https://'))))fail('INVALID_AUTHORITY_POLICY');
  const authorityCheck=u=>{if(authorityOrigins!==null&&(u.protocol!=='https:'||!authorityOrigins.includes(u.origin)||/(?:^|\/)(?:login|signin|servicelogin|oauth|authorize)(?:\/|$)/i.test(decodeURIComponent(u.pathname))))fail('AUTHORITY_POLICY_STOP');};
  if(!Array.isArray(jsonUrls)||jsonUrls.length>4)fail('INVALID_JSON_ALLOWLIST');
  if(!Array.isArray(imageUrls)||imageUrls.length>4)fail('INVALID_IMAGE_ALLOWLIST');
  for(const urls of [scriptUrls,structuredJsonUrls])if(!Array.isArray(urls)||urls.length>2)fail('INVALID_RESOURCE_ALLOWLIST');
  const scriptAllowed=new Set(scriptUrls.map(u=>normalizePublicUrl(u).href)),structuredAllowed=new Set(structuredJsonUrls.map(u=>normalizePublicUrl(u).href));
  const imageAllowed=new Set(imageUrls.map(u=>normalizePublicUrl(u).href));
  const jsonAllowed=new Set(jsonUrls.map(u=>normalizePublicUrl(u).href));
  if(!Array.isArray(mixedJsonUrls)||mixedJsonUrls.length>4)fail('INVALID_JSON_ALLOWLIST');
  const mixedJsonAllowed=new Set(mixedJsonUrls.map(u=>normalizePublicUrl(u).href));
  for (const n of [timeoutMs,maxBytes]) if (!Number.isSafeInteger(n) || n <= 0) fail('INVALID_LIMIT');
  if (!Number.isSafeInteger(redirectCap) || redirectCap < 0) fail('INVALID_LIMIT');
  return async function read(input, {signal, locale=null, maxRedirects=redirectCap} = {}) {
    if (!Number.isSafeInteger(maxRedirects) || maxRedirects < 0 || locale !== null && (typeof locale !== 'string' || /[\r\n]/.test(locale))) fail('INVALID_REQUEST');
    const controller = new AbortController(); let timer;
    const abort = () => controller.abort();
    signal?.addEventListener('abort',abort,{once:true});
    if (signal?.aborted) abort();
    const redirects = []; let current = input;
    try {
      const run = async () => {
        const seen = new Set();
        for (;;) {
          if (controller.signal.aborted) fail('ABORTED');
          const u = normalizePublicUrl(current);
          authorityCheck(u);
          if (seen.has(u.href)) fail('REDIRECT_LOOP'); seen.add(u.href);
          const host = u.hostname.replace(/^\[|\]$/g,'');
          const records = isIP(host) ? [{address:host,family:isIP(host)}] : await resolveHost(host);
          if (!Array.isArray(records) || !records.length || records.some(r => !publicAddress(r.address) || isIP(r.address) !== r.family)) fail('UNSAFE_DNS');
          if (controller.signal.aborted) fail('ABORTED');
          if (beforeRequest) await beforeRequest({url:u.href,signal:controller.signal,redirects:[...redirects]});
          if (controller.signal.aborted) fail('ABORTED');
          // No second resolver lookup: the socket receives only this vetted address.
          const pricingHost=pricingResources===true&&u.origin==='https://one.google.com';
          const pricingJson=pricingHost&&/^\/intl\/ALL_[a-z]{2}\/about\/feeds\/pricing_\d{4}_\d{2}_\d{2}\.json$/.test(u.pathname)&&!u.search;
          const pricingScript=scriptAllowed.has(u.href)||pricingHost&&/^\/about\/assets\/d\/[a-zA-Z0-9_-]+\.min\.js$/.test(u.pathname)&&!u.search;
          const acceptImage=imageAllowed.has(u.href);
          const jsonLimit=structuredAllowed.has(u.href)?256000:10000;
          const acceptJson=structuredAllowed.has(u.href)||jsonAllowed.has(u.href)||mixedJsonAllowed.has(u.href)||pricingJson,bodyLimit=(pricingJson||jsonAllowed.has(u.href))?Math.min(maxBytes,10000):maxBytes;
          let observedBytes=0;
          const countBytes=n=>{if(!Number.isSafeInteger(n)||n<0)fail('INVALID_BYTE_ACCOUNTING');observedBytes+=n;onBodyBytes(n);};
          const response = await requestOnce({url:u,...records[0],signal:controller.signal,maxBytes:bodyLimit,locale,onBodyBytes:countBytes,...(acceptImage?{acceptImage:true}:{}),...((scriptAllowed.has(u.href)||structuredAllowed.has(u.href))?{associatedStructuredResource:true}:{}),...(scriptScan&&scriptAllowed.has(u.href)?{scriptScan}:{}),...(acceptJson?{acceptJson:true,maxJsonBytes:Math.min(maxBytes,jsonLimit)}:{}),...(pricingScript?{pricingScript:true}:{}),...(robotsPolicyRetrieval===true?{robotsPolicyRetrieval:true}:{})});
          if (controller.signal.aborted) fail('ABORTED');
          const {status,headers,body} = response;
          if(response.scriptScan){if(!scriptScan||!scriptAllowed.has(u.href)||status!==200||!Buffer.isBuffer(body)||body.length)fail('INVALID_SCRIPT_SCAN');
            if(!observedBytes)countBytes(response.scriptScan.bytesScanned);
            return {url:u.href,redirects,status,contentType:String(headers['content-type']).split(';')[0].trim().toLowerCase(),scriptScan:response.scriptScan};}
          if(Buffer.isBuffer(body)&&observedBytes===0)countBytes(body.length); // Injected/offline transports return a bounded complete body.
          if ([301,302,303,307,308].includes(status)) {
            if (redirects.length >= Math.min(maxRedirects,redirectCap)) {
              const e=new PublicNetworkError('REDIRECT_LIMIT');let destination={valid:false};
              try{if(typeof headers.location==='string'&&headers.location.length<=2048&&!/[\r\n]/.test(headers.location)){const n=new URL(headers.location,u);destination={valid:true,https:n.protocol==='https:',sameOrigin:n.origin===u.origin,userinfo:!!(n.username||n.password),query:!!n.search,fragment:!!n.hash,pathLength:n.pathname.length};}}catch{/* Never retain arbitrary Location text. */}
              e.redirectDiagnostic={version:1,stage:robotsPolicyRetrieval?'ROBOTS':'PAGE',httpStatus:status,limit:Math.min(maxRedirects,redirectCap),followed:redirects.length,destination};throw e;
            }
            if (typeof headers.location !== 'string' || !headers.location.trim() || /[\r\n]/.test(headers.location)) fail('INVALID_REDIRECT');
            if(authorityOrigins!==null&&(headers.location.length>2048||/[\\\x00-\x20\x7f]/.test(headers.location)))fail('INVALID_REDIRECT');
            let next; try { next = new URL(headers.location,u).href; } catch { fail('INVALID_REDIRECT'); }
            const nextUrl=normalizePublicUrl(next);authorityCheck(nextUrl); redirects.push(nextUrl.href); current = nextUrl.href; continue;
          }
          if (!Buffer.isBuffer(body) || body.length > bodyLimit) fail('RESPONSE_TOO_LARGE');
          const type = String(headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
          if(type==='application/json'&&acceptJson&&body.length>Math.min(maxBytes,jsonLimit))throw new PublicNetworkError('RESPONSE_TOO_LARGE',{stage:'STREAM',limit:Math.min(maxBytes,jsonLimit),receivedBytes:body.length,contentType:type});
          // Status-only absence for a private robots-reader context. Body is not policy.
          if(robotsPolicyRetrieval===true&&[404,410].includes(status)&&!['text/html','application/xhtml+xml','text/plain','application/rss+xml','application/xml','text/xml'].includes(type)){
            if(headers['content-encoding']&&headers['content-encoding']!=='identity')fail('UNSUPPORTED_ENCODING');
            return {url:u.href,redirects,status,contentType:null,declaredLanguage:null,text:'',bodyOmitted:true};
          }
          if(acceptImage&&['image/png','image/jpeg','image/webp'].includes(type)){if(headers['content-encoding']&&headers['content-encoding']!=='identity')fail('UNSUPPORTED_ENCODING');return {url:u.href,redirects,status,contentType:type,bytes:body};}
          if (!(acceptJson&&type==='application/json')&&!(pricingScript&&['application/javascript','text/javascript'].includes(type))&&!['text/html','application/xhtml+xml','text/plain','application/rss+xml','application/xml','text/xml'].includes(type)) throw new PublicNetworkError('UNSUPPORTED_CONTENT',{code:'UNSUPPORTED_CONTENT',rejectionStage:'PUBLIC_READER_MIME_GATE',httpStatus:status,contentTypePresent:headers['content-type']!==undefined,normalizedMediaType:type});
          if (headers['content-encoding'] && headers['content-encoding'] !== 'identity') fail('UNSUPPORTED_ENCODING');
          const charset = String(headers['content-type'] ?? '').match(/charset\s*=\s*["']?([^;\s"']+)/i)?.[1] ?? 'utf-8';
          let text; try { text = new TextDecoder(charset,{fatal:true}).decode(body); } catch { fail('UNSUPPORTED_OR_INVALID_CHARSET'); }
          return {url:u.href,redirects,status,contentType:type,declaredLanguage:headers['content-language'] ?? null,text,...(retainRuntimeCors?{runtimeCorsHeaders:safeRuntimeCors(headers)}:{}),
            ...(headers['x-robots-tag'] ? {indexingDirectives:{xRobotsTag:headers['x-robots-tag']}} : {})};
        }
      };
      return await Promise.race([run(),new Promise((_,reject)=> {
        timer=setTimeout(()=>{reject(new PublicNetworkError('TIMEOUT'));controller.abort();},timeoutMs);
        controller.signal.addEventListener('abort',()=>reject(new PublicNetworkError('ABORTED')),{once:true});
      })]);
    } catch (e) {
      const error = e instanceof PublicNetworkError ? e : new PublicNetworkError(e?.code === 'ENOTFOUND' || e?.code === 'EAI_AGAIN' ? 'DNS_FAILED' : 'NETWORK_FAILED');
      error.redirects = redirects; throw error;
    } finally { clearTimeout(timer); signal?.removeEventListener('abort',abort); controller.abort(); }
  };
}
