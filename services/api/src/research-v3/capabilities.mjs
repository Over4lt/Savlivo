// Technical transport reuse only. Construction/import performs no network requests.
import {lookup} from 'node:dns/promises';
import {randomBytes} from 'node:crypto';
import {isIP} from 'node:net';
import {createPublicReader, publicAddress, researchUserAgent} from '../research-v1/public-network.mjs';
import {parseRobots, evaluateRobots} from '../research-v1/robots-access.mjs';
import {createPinnedConnectRequest} from '../../../../docs/catalog/global-47/research-v1/proxy-connect.mjs';
import {createIndependentExitVerifier} from '../../../../docs/catalog/global-47/research-v1/independent-exit-verifier.mjs';
import {providerBound, normalizeUrl, digest} from './model.mjs';

const fault=(code,kind='ACQUISITION')=>Object.assign(new Error(code),{code,kind});
const safeCodes=new Set(['UNSAFE_DNS','UNSAFE_HOST','TIMEOUT','ABORTED','RESPONSE_TOO_LARGE','UNSUPPORTED_CONTENT','UNSUPPORTED_ENCODING','REDIRECT_LIMIT','REDIRECT_LOOP','NETWORK_FAILED','DNS_FAILED','UNSUPPORTED_OR_INVALID_CHARSET']);
const resolver=host=>lookup(host,{all:true,verbatim:true});
const verifier=createIndependentExitVerifier({approved:true});
function budget(limits) {
    let requests=0,bytes=0;
    return {
        request(){if(requests>=limits.maxRequests) throw fault('NETWORK_REQUEST_BOUND','CAPACITY');requests++;},
        bytes(n){if(!Number.isSafeInteger(n)||n<0)throw fault('INVALID_BYTE_ACCOUNTING');bytes+=n;if(bytes>limits.maxBytes)throw fault('RESPONSE_BYTE_BOUND','CAPACITY');},
        remaining(){if(bytes>=limits.maxBytes)throw fault('RESPONSE_BYTE_BOUND','CAPACITY');return limits.maxBytes-bytes;},
        result:()=>({requests,bytes})
    };
}

/** All IO overrides are trusted host dependencies, never planner/page input.
 * Credentials are explicit closure inputs. No environment/keychain side effects. */
export function createCapabilities({objective,permissions={},network={},tavily={},decodo={},clock=()=>new Date().toISOString(),timeoutMs=15000}={}) {
    if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000)throw fault('INVALID_TIMEOUT');
    const check=url=>{if(!normalizeUrl(url)||!providerBound(objective,url))throw fault('PROVIDER_BOUNDARY');};
    async function acquire(action,limits,geo) {
        const account=budget(limits), access=[], controller=new AbortController();
        const timer=setTimeout(()=>controller.abort(),timeoutMs);
        const base={format:'WEB',url:action.url,requestedUrl:action.url,context:action.context,acquiredAt:clock(),body:'',truncated:false,access};
        let stage='SETUP',status=null,finalUrl=action.url;
        try {
            check(action.url);
            if(action.context.transport!==(geo?'DECODO':'DIRECT')||geo&&!objective.markets.includes(action.context.networkGeography)||!geo&&action.context.networkGeography!=='UNBOUND')throw fault('INVALID_CONTEXT');
            let requestOnce=network.requestOnce, before=null, transport={kind:'DIRECT',networkGeography:'UNBOUND'};
            const resolveHost=host=>new Promise((resolve,reject)=>{
                const abort=()=>reject(fault('ABORTED'));
                if(controller.signal.aborted)return abort();
                controller.signal.addEventListener('abort',abort,{once:true});
                Promise.resolve().then(()=>(network.resolveHost??resolver)(host)).then(resolve,reject).finally(()=>controller.signal.removeEventListener('abort',abort));
            });
            const makeReader=(extra={})=>createPublicReader({resolveHost,requestOnce,timeoutMs,maxBytes:Math.max(1,account.remaining()),maxRedirects:3,onBodyBytes:n=>account.bytes(n),...extra});
            if(geo) {
                const {username,password}=decodo;
                if(typeof username!=='string'||!username||typeof password!=='string'||!password||/[:\r\n]|^user-|-country-|-session-/i.test(username)||/[\r\n]/.test(password))throw fault('DECODO_CONFIGURATION_REQUIRED');
                const proxyHost='gate.decodo.com', proxyPort=7000;
                const addresses=await resolveHost(proxyHost);
                if(!addresses?.length||addresses.some(a=>!publicAddress(a.address)||isIP(a.address)!==a.family))throw fault('UNSAFE_DNS');
                const binding=randomBytes(16).toString('hex');
                const authUsername='user-'+username+'-country-'+action.context.networkGeography.toLowerCase()+'-session-'+binding;
                const requestHop=decodo.requestHop??createPinnedConnectRequest();
                requestOnce=async r=> {
                    let counted=0;
                    const result=await requestHop({...r,proxyHost,proxyPort,proxyAddress:addresses[0].address,username:authUsername,password,timeoutMs,
                        headers:{'user-agent':researchUserAgent,accept:'text/html,text/plain,application/xhtml+xml'},
                        onBytes:n=>{counted+=n;r.onBodyBytes(n);}});
                    if(!result.tlsVerified)throw fault('DECODO_TLS_NOT_VERIFIED');
                    if(!counted&&result.body?.length)r.onBodyBytes(result.body.length);
                    const material=JSON.stringify(result.headers)+'\n'+result.body?.toString('utf8');
                    if([username,password,authUsername,Buffer.from(authUsername+':'+password).toString('base64')].some(s=>material.includes(s)))throw fault('SECRET_IN_RESPONSE');
                    return result;
                };
                transport={kind:'DECODO',requestedCountry:action.context.networkGeography,binding:digest(binding),gateway:proxyHost,verification:'PENDING'};
            }
            const probe=async()=>{
                stage='GEO_VERIFICATION';
                const result=await makeReader({maxBytes:Math.min(10000,account.remaining()),jsonUrls:[verifier.url],maxRedirects:0,beforeRequest:r=>{if(r.url!==verifier.url)throw fault('GEO_VERIFIER_REDIRECT');account.request();}})(verifier.url,{signal:controller.signal});
                if(result.status!==200)throw fault('GEO_VERIFICATION_FAILED');
                const proof=verifier.parse({text:result.text});
                if(proof.country!==action.context.networkGeography)throw fault('GEO_COUNTRY_MISMATCH');
                return proof;
            };
            if(geo) before=await probe();
            const policies=new Map();
            const page=await makeReader({beforeRequest:async r=>{
                check(r.url);stage='ROBOTS';
                const origin=new URL(r.url).origin;
                let policy=policies.get(origin);
                if(!policy) {
                    const result=await makeReader({maxBytes:Math.min(64000,account.remaining()),robotsPolicyRetrieval:true,beforeRequest:x=>{check(x.url);account.request();}})(origin+'/robots.txt',{signal:controller.signal});
                    if([404,410].includes(result.status))policy={absent:true,status:result.status};
                    else if(result.status===200&&result.contentType==='text/plain')policy={parsed:parseRobots(result.text),status:result.status};
                    else throw fault('ROBOTS_UNAVAILABLE');
                    policies.set(origin,policy);
                }
                const evaluation=policy.absent?{decision:'ALLOWED',reason:'ROBOTS_ABSENT'}:evaluateRobots(policy.parsed,r.url);
                access.push({url:r.url,status:policy.status,...evaluation});
                if(evaluation.decision==='DISALLOWED')throw fault('ROBOTS_DISALLOWED','POLICY');
                if(evaluation.decision!=='ALLOWED')throw fault('ROBOTS_UNAVAILABLE');
                stage='PROVIDER';account.request();
            }})(action.url,{signal:controller.signal,locale:objective.language??null});
            status=page.status;finalUrl=page.url;
            if([401,403].includes(page.status))throw fault('PROVIDER_ACCESS_CONTROL','POLICY');
            if(geo) {
                const after=await probe();
                if(before.address!==after.address)throw fault('GEO_BINDING_CHANGED');
                transport={...transport,verification:'BRACKET_VERIFIED',verifiedCountry:after.country,exitAddressHash:digest(after.address)};
            }
            // Account for a decoded UTF-8 representation larger than received bytes.
            const extraRepresentation=Math.max(0,Buffer.byteLength(page.text)-account.result().bytes);
            if(extraRepresentation)account.bytes(extraRepresentation);
            return {...base,url:page.url,httpStatus:page.status,contentType:page.contentType,body:page.text,outcome:page.status===200?'OK':'HTTP_UNAVAILABLE',transport,accounting:account.result()};
        } catch(error) {
            // The reused public reader wraps unknown hook errors. Recover only our
            // typed policy decision, never arbitrary exception text or credentials.
            const denied=access.at(-1)?.decision==='DISALLOWED';
            const policy=denied||error.kind==='POLICY';
            const spent=account.result(), capacity=error.kind==='CAPACITY'||spent.bytes>=limits.maxBytes||spent.requests>=limits.maxRequests&&error.code==='NETWORK_FAILED'||error.code==='RESPONSE_TOO_LARGE';
            const code=denied?'ROBOTS_DISALLOWED':error.code&&(/^(?:DECODO_|GEO_|ROBOTS_|PROVIDER_|SECRET_|NETWORK_REQUEST_BOUND|RESPONSE_BYTE_BOUND)/.test(error.code)||safeCodes.has(error.code))?error.code:'ACQUISITION_FAILED';
            return {...base,url:finalUrl,httpStatus:status,outcome:policy?'POLICY_BLOCKED':'ERROR',policyScope:'URL',accounting:spent,
                ...(policy?{}:{failure:{kind:capacity?'CAPACITY':'ACQUISITION',code,stage}})};
        } finally {clearTimeout(timer);controller.abort();}
    }
    const capabilities={};
    if(permissions.DIRECT)capabilities.DIRECT=(a,l)=>acquire(a,l,false);
    if(permissions.DECODO)capabilities.DECODO=(a,l)=>acquire(a,l,true);
    if(permissions.TAVILY) capabilities.TAVILY=async(action,limits)=>{
        const account=budget(limits);
        try {
            if(typeof tavily.apiKey!=='string'||!tavily.apiKey)throw fault('TAVILY_CONFIGURATION_REQUIRED');
            if(action.query.includes(tavily.apiKey))throw fault('INVALID_DISCOVERY_QUERY');
            account.request();
            const res=await (tavily.fetchImpl??fetch)('https://api.tavily.com/search',{method:'POST',redirect:'error',signal:AbortSignal.timeout(timeoutMs),headers:{'Content-Type':'application/json',Authorization:'Bearer '+tavily.apiKey},body:JSON.stringify({query:action.query,include_domains:objective.providerHosts,max_results:Math.min(8,limits.maxResults),include_answer:false,include_raw_content:false,include_images:false,search_depth:'basic'})});
            if(!res.ok)throw fault('TAVILY_HTTP_UNAVAILABLE');
            const reader=res.body.getReader(), chunks=[];
            try {for(;;){const {done,value}=await reader.read();if(done)break;account.bytes(value.byteLength);chunks.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}
            const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
            if(!Array.isArray(data.results))throw fault('TAVILY_INVALID_RESPONSE');
            const results=data.results.slice(0,Math.min(8,limits.maxResults)).filter(r=>typeof r.url==='string'&&!r.url.includes(tavily.apiKey)&&providerBound(objective,r.url)).map(r=>({url:normalizeUrl(r.url)}));
            return {results,accounting:account.result()};
        }catch(error){return {results:[],accounting:account.result(),failure:{kind:error.kind==='CAPACITY'?'CAPACITY':'DISCOVERY',code:'TAVILY_REQUEST_UNAVAILABLE'}};}
    };
    return capabilities;
}
