import {resolveDecodoCredentials} from '../../../../services/api/src/research-v1/decodo-credentials.mjs';
import {validateRuntimeSessionBudget} from '../../../../services/api/src/research-v1/runtime-session-budget.mjs';
// Provider-specific configuration and transport only. No network/environment reads on import.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {randomBytes} from 'node:crypto';
import {countryCurrencyData} from '../../../../packages/contracts/src/markets.ts';
import {gatewaySafety,geoId,knownCost} from './geo-provider.mjs';
import {freeCost,unknownCost} from './executor-adapters.mjs';
import {normalizePublicUrl,publicAddress,PublicNetworkError} from './public-network.mjs';
import {createPinnedConnectRequest,isHeaderSizeRejection,isLocalAbortRejection} from './proxy-connect.mjs';
import {structuredResourceLimits} from './associated-structured-resources.mjs';
import {extractPage} from './public-web-adapter.mjs';
import {createIndependentExitVerifier} from './independent-exit-verifier.mjs';
const table=JSON.parse(readFileSync(new URL('./decodo-capabilities.json',import.meta.url),'utf8'));
const country=c=>{assert(typeof c==='string'&&/^[a-z]{2}$/i.test(c.trim()),'Invalid country');return c.trim().toUpperCase();};
const error=code=>{throw new PublicNetworkError(code);};
export function decodoCapabilities(markets=countryCurrencyData,overrides={}){
  return markets.map(([raw])=>{
    const countryCode=country(raw),row=table.rows.find(r=>r.country===countryCode),override=overrides[countryCode];
    assert(!override||['UNSUPPORTED','UNKNOWN'].includes(override),'Overrides can only restrict published capabilities');
    return {countryCode,status:override??(row?'SUPPORTED':'UNKNOWN'),endpoint:row?.host??null,stickyPorts:row?.ports??null,
      sourceUrl:table.sourceUrl,checkedAt:table.checkedAt,method:override?'OPERATOR_RESTRICTION':table.method};
  });
}
export function resolveDecodoRoute(input,allowedPorts,capabilities=decodoCapabilities()){
  const code=country(input),cap=capabilities.find(c=>c.countryCode===code);
  if(cap?.status!=='SUPPORTED')error('UNSUPPORTED_COUNTRY');
  assert(Array.isArray(allowedPorts)&&allowedPorts.length>0&&allowedPorts.length<=32,'Explicit sticky ports required');
  assert(allowedPorts.every(p=>Number.isInteger(p)&&p>=cap.stickyPorts[0]&&p<=cap.stickyPorts[1]),'Port outside documented sticky range');
  return {countryCode:code,hostname:cap.endpoint,port:[...new Set(allowedPorts)].sort((a,b)=>a-b)[0],capability:structuredClone(cap)};
}
export function createDecodoProvider({env=process.env,requestHop=createPinnedConnectRequest(),resolveHost=h=>lookup(h,{all:true,verbatim:true}),now=()=>Date.now()}={}){
  // No ambient credentials in the descriptor, artifacts or exceptions.
  const {username,password,configured:hasCredentials}=resolveDecodoCredentials(env);
  const routingMode=env.SAVLIVO_DECODO_ROUTING_MODE??'COUNTRY_ENDPOINT';
  const common=routingMode==='COMMON_GATEWAY';
  // Common mode accepts the base credential only, never preconfigured routing parameters.
  let ports={},restricted={},configurationValid=['COUNTRY_ENDPOINT','COMMON_GATEWAY'].includes(routingMode)
    &&(!common||(!/^user-/i.test(username)&&!/-country-|-session|-city-|-state-|-zip-|-asn-|-ip-/i.test(username)));
  try{ports=common?{}:JSON.parse(env.SAVLIVO_DECODO_STICKY_PORTS??'{}');restricted=JSON.parse(env.SAVLIVO_DECODO_CAPABILITY_RESTRICTIONS??'{}');
    assert(ports&&!Array.isArray(ports)&&typeof ports==='object');assert(restricted&&!Array.isArray(restricted)&&typeof restricted==='object');
  }catch{configurationValid=false;ports={};restricted={};}
  let capabilities;
  try{capabilities=decodoCapabilities(countryCurrencyData,restricted);}catch{configurationValid=false;capabilities=decodoCapabilities();}
  const routes=new Map();
  for(const c of capabilities)if(c.status==='SUPPORTED'&&(common||ports[c.countryCode]))try{routes.set(c.countryCode,common?{countryCode:c.countryCode,hostname:'gate.decodo.com',port:7000}:resolveDecodoRoute(c.countryCode,ports[c.countryCode],capabilities));}catch{configurationValid=false;}
  const noCharge=env.SAVLIVO_DECODO_COST_CLASS==='FREE'&&env.SAVLIVO_DECODO_NOT_CHARGED_CONFIRMED==='true';
  let estimate=unknownCost(),ceiling=unknownCost();
  try{if(noCharge){estimate=freeCost();ceiling=freeCost();}else{
    estimate=knownCost({status:'KNOWN',amount:env.SAVLIVO_DECODO_ESTIMATED_COST,currency:env.SAVLIVO_DECODO_CURRENCY});
    ceiling=knownCost({status:'KNOWN',amount:env.SAVLIVO_DECODO_RESERVED_COST,currency:env.SAVLIVO_DECODO_CURRENCY});
  }}catch{/* Unknown monetary cost makes PAID unavailable in the existing selector. */}
  const configuredBodyLimit=Number(env.SAVLIVO_DECODO_MAX_BODY_BYTES??1000000),stickyMs=Number(env.SAVLIVO_DECODO_STICKY_MS??600000);
  if(!Number.isSafeInteger(configuredBodyLimit)||configuredBodyLimit<1||configuredBodyLimit>10000000||!Number.isSafeInteger(stickyMs)||stickyMs<1000||stickyMs>600000)configurationValid=false;
  const provider={id:'decodo',enabled:env.SAVLIVO_DECODO_ENABLED==='true',approved:env.SAVLIVO_DECODO_APPROVED==='true',
    configured:hasCredentials&&configurationValid&&routes.size>0,ready:hasCredentials&&configurationValid,
    costClass:noCharge?'FREE':'PAID',endpoint:'https://gate.decodo.com',transportRef:'decodo',secretRef:null,
    countries:[...routes.keys()].sort(),capabilities:['PUBLIC_HTTP'],priority:100,mode:'SESSION',
    safety:[...gatewaySafety.filter(s=>!['BOUND_EXIT','REMOTE_DNS_PINNING','SPEND_CEILING'].includes(s)),'STICKY_BINDING','PINNED_CONNECT','LOCAL_SPEND_AUTHORIZATION'],
    reviewRef:'decodo-operator-approval-required',cost:{estimate,ceiling,unit:'OPERATION'},
    verification:{version:2,level:'BRACKET_VERIFIED',sticky:true},transportPolicy:{version:1,destination:'PINNED_CONNECT',spend:'LOCAL_AUTHORIZATION'}};
  let session=null,lastStats=null;
  const forbidden=[username,password,Buffer.from(username+':'+password).toString('base64')].filter(Boolean);
  const secretSafe=(r,secrets)=>{
    const body=r.body.toString('utf8'),extracted=extractPage(body,'https://redaction.example.com');
    const text=JSON.stringify(r.headers)+'\n'+body+'\n'+JSON.stringify(extracted);
    if(secrets.some(s=>[s,encodeURIComponent(s),JSON.stringify(s).slice(1,-1)].some(v=>text.includes(v))))error('SECRET_IN_RESPONSE');
  };
  const accounting=s=>({ceiling:s.bodyLimit,consumed:s.bodyBytes,remaining:Math.max(0,s.bodyLimit-s.bodyBytes),stageCeilings:s.bodyBudget?.stages??null,consumedByStage:{...s.stageBytes},remainingByStage:s.bodyBudget?Object.fromEntries(Object.entries(s.bodyBudget.stages).map(([k,v])=>[k,Math.max(0,v-(s.stageBytes[k]??0))])):null,consumedByCategory:{...s.categoryBytes},lastRejection:s.lastRejection??null,rejections:[...s.rejections]});
  const recordRejection=(s,r)=>{s.lastRejection=r;if(s.rejections.length<128)s.rejections.push({...r,requestIndex:s.requests,consumed:s.bodyBytes});};
  const transport={
    async open(r){
      if(!provider.enabled||!provider.approved||!provider.configured||session)error('PROVIDER_UNAVAILABLE');
      assert.deepEqual(r.ceiling,provider.cost.ceiling);assert(Number.isSafeInteger(r.maxRequests)&&r.maxRequests>0&&r.maxRequests<=1000000);
      assert(Number.isSafeInteger(r.ttlMs)&&r.ttlMs>0&&typeof r.bindingRef==='string'&&/^[\w:-]{1,120}$/.test(r.bindingRef));
      const bodyBudget=r.bodyBudget?structuredClone(validateRuntimeSessionBudget(r.bodyBudget)):null;
      const bodyLimit=bodyBudget?Math.min(bodyBudget.ceiling,env.SAVLIVO_DECODO_MAX_BODY_BYTES===undefined?bodyBudget.ceiling:configuredBodyLimit):configuredBodyLimit;
      const route=routes.get(country(r.targetCountry));if(!route)error('UNSUPPORTED_COUNTRY');
      if(r.signal?.aborted)error('ABORTED');
      const addresses=await resolveHost(route.hostname);
      if(!addresses?.length||addresses.some(a=>!publicAddress(a.address)||isIP(a.address)!==a.family))error('UNSAFE_DNS');
      if(r.signal?.aborted)error('ABORTED');
      const sessionId=common?randomBytes(16).toString('hex'):null;
      const authUsername=common?'user-'+username+'-country-'+route.countryCode.toLowerCase()+'-session-'+sessionId:username;
      const secrets=common?[...forbidden,sessionId,authUsername,Buffer.from(authUsername+':'+password).toString('base64')]:forbidden;
      const ref='decodo-'+geoId(common?[r.bindingRef,route.hostname,route.port,sessionId]:[r.bindingRef,route.hostname,route.port]);
      session={bodyBudget,bodyLimit,rejections:[],stageBytes:{},categoryBytes:{},bindingRef:r.bindingRef,ref,route:Object.freeze({...route}),authUsername,secrets,proxyAddress:addresses[0].address,expires:now()+Math.min(r.ttlMs,stickyMs),requests:0,proxyConnectRequests:0,targetRequests:0,bodyBytes:0,maxRequests:r.maxRequests,busy:false,invalid:false,controller:null};
      return {handle:ref+'-private',continuityRef:ref,transportMetadata:{endpointHostname:route.hostname,stickyPort:route.port,capabilityStatus:'SUPPORTED',capabilitySource:table.sourceUrl}};
    },
    async request(r){
      const s=session;
      if(!s||s.invalid||s.busy||now()>=s.expires||r.bindingRef!==s.bindingRef||r.handle!==s.ref+'-private'||r.targetCountry!==s.route.countryCode)error('BINDING_CHANGED');
      const bodyLimit=s.bodyLimit,stage=s.bodyBudget?r.bodyStage:'LEGACY';
      if(s.bodyBudget&&!Object.hasOwn(s.bodyBudget.stages,stage))error('INVALID_LIMIT');
      const stageRemaining=s.bodyBudget?s.bodyBudget.stages[stage]-(s.stageBytes[stage]??0):bodyLimit-s.bodyBytes;
      const effectiveLimit=Math.min(r.maxBytes,bodyLimit-s.bodyBytes,stageRemaining);
      const limitCause=effectiveLimit===bodyLimit-s.bodyBytes?'SESSION_BYTES':effectiveLimit===stageRemaining?'STAGE_'+stage:'REQUEST_BYTES';
      const rejectBudget=()=>{recordRejection(s,{limit:limitCause,effectiveLimit:Math.max(0,effectiveLimit),stage});error('RESPONSE_TOO_LARGE');};
      normalizePublicUrl(r.url);if(!publicAddress(r.address))error('UNSAFE_HOST');
      if(s.requests>=s.maxRequests)error('NETWORK_BUDGET_EXHAUSTED');
      if(effectiveLimit<=0)rejectBudget();
      s.requests++;s.busy=true;s.controller=new AbortController();
      const abort=()=>s.controller?.abort();r.signal?.addEventListener('abort',abort,{once:true});if(r.signal?.aborted)abort();
      const timer=setTimeout(abort,Math.max(1,s.expires-now()));
      const bodyBytesBefore=s.bodyBytes;
      let scanTail=Buffer.alloc(0);
      try{
        const response=await requestHop({...r,proxyHost:s.route.hostname,proxyAddress:s.proxyAddress,proxyPort:s.route.port,
          // Preserve one existing JSON allowance and the verifier's 10 KB response
          // allowance; do not enlarge the session body ceiling.
          ...(r.scriptScan?{scriptScan:{...r.scriptScan,maxBytes:Math.max(0,Math.min(r.maxBytes,structuredResourceLimits.scriptBytes,bodyLimit-s.bodyBytes-structuredResourceLimits.jsonBytes-10000))}}:{}),
          onScanChunk:chunk=>{const inspected=Buffer.concat([scanTail,chunk]);secretSafe({body:inspected,headers:{}},s.secrets);scanTail=inspected.subarray(Math.max(0,inspected.length-4096));},
          username:s.authUsername,password,signal:s.controller.signal,onConnect:()=>{if(++s.proxyConnectRequests>s.maxRequests)error('NETWORK_BUDGET_EXHAUSTED');},onTarget:()=>{if(++s.targetRequests>s.maxRequests)error('NETWORK_BUDGET_EXHAUSTED');},maxBytes:effectiveLimit,
          timeoutMs:Math.max(1,Math.min(10000,s.expires-now())),onBytes:n=>{assert(Number.isSafeInteger(n)&&n>=0);s.bodyBytes+=n;s.stageBytes[stage]=(s.stageBytes[stage]??0)+n;const category=r.robotsPolicyRetrieval&&stage!=='ROBOTS'?stage+'_ROBOTS':stage;s.categoryBytes[category]=(s.categoryBytes[category]??0)+n;r.onBodyBytes?.(n);if(s.bodyBytes>bodyLimit||s.bodyBudget&&s.stageBytes[stage]>s.bodyBudget.stages[stage])error('RESPONSE_TOO_LARGE');}});
        if(s.invalid||s.controller.signal.aborted||now()>=s.expires)error('BINDING_CHANGED');
        secretSafe(response,s.secrets);
        if(response.scriptScan)secretSafe({body:Buffer.from(JSON.stringify(response.scriptScan)),headers:{}},s.secrets);
        return {...response,proof:{bindingRef:s.bindingRef,continuityRef:s.ref,bindingChanged:false,url:r.url.href,singleHop:true,
          destinationMode:'PINNED_CONNECT',requestedAddress:r.address,tlsVerified:response.tlsVerified,access:'PUBLIC'}};
      }catch(e){
        // A locally refused child response is not an exit/session change. The pinned
        // hop has closed its sockets without consuming a body; never retry that URL.
        if(e?.code==='RESPONSE_TOO_LARGE')recordRejection(s,{limit:e.bodyDiagnostic?.limit<effectiveLimit?'CONTENT_TYPE_BYTES':limitCause,effectiveLimit:e.bodyDiagnostic?.limit??effectiveLimit,stage,...(e.bodyDiagnostic?{bodyDiagnostic:e.bodyDiagnostic}:{})});
        const safeRuntimeAbort=stage==='RUNTIME'&&r.signal?.aborted&&isLocalAbortRejection(e)&&!s.invalid&&now()<s.expires&&s.bodyBytes<bodyLimit&&s.stageBytes[stage]<=s.bodyBudget.stages[stage];
        const boundedChildRejection=r.associatedStructuredResource===true&&isHeaderSizeRejection(e)&&s.bodyBytes===bodyBytesBefore&&
          !s.invalid&&!s.controller.signal.aborted&&now()<s.expires&&s.bodyBytes<bodyLimit&&s.requests<s.maxRequests;
        if(!boundedChildRejection&&!safeRuntimeAbort)s.invalid=true;
        const wrapped=new PublicNetworkError(['ACCESS_CONTROL_STOP','UNSAFE_HOST','UNSAFE_DNS','TIMEOUT','ABORTED','RESPONSE_TOO_LARGE','UNSUPPORTED_CONTENT','UNSUPPORTED_ENCODING','SECRET_IN_RESPONSE','BINDING_CHANGED'].includes(e?.code)?e.code:'NETWORK_FAILED',e?.code==='RESPONSE_TOO_LARGE'?e?.bodyDiagnostic:e?.responseDiagnostic);
        for(const key of ['responseDiagnostic','bodyDiagnostic'])if(wrapped[key]&&s.secrets.some(secret=>JSON.stringify(wrapped[key]).toLowerCase().includes(secret.toLowerCase())))delete wrapped[key];
        throw wrapped;}
      finally{clearTimeout(timer);r.signal?.removeEventListener('abort',abort);s.busy=false;s.controller=null;}
    },
    async close(r){if(session?.bindingRef===r.bindingRef){session.invalid=true;session.controller?.abort();lastStats={...(session.bodyBudget?{bodyBudget:accounting(session)}:{}),requests:session.requests,proxyConnectRequests:session.proxyConnectRequests,targetRequests:session.targetRequests,responseBodyBytes:session.bodyBytes,measurement:'RESPONSE_BODY_BYTES_ONLY',cleanup:'LOCAL_BINDING_RELEASED'};session=null;}return {closed:true};},
    async usage(){return noCharge?freeCost():unknownCost();}
  };
  return {provider,transport,capabilities,verifier:createIndependentExitVerifier({approved:env.SAVLIVO_GEO_VERIFIER_APPROVED==='true'}),
    statistics:()=>lastStats?{...lastStats}:null,liveEnabled:env.SAVLIVO_DECODO_LIVE_TEST==='true'};
}
