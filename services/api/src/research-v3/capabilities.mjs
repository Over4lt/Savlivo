// V3-owned bounded acquisition; shared helpers only vet public addresses/geo.
import {lookup} from 'node:dns/promises';
import {randomBytes} from 'node:crypto';
import {isIP} from 'node:net';
import {publicAddress,researchUserAgent} from '../research-v1/public-network.mjs';
import {createIndependentExitVerifier} from '../../../../docs/catalog/global-47/research-v1/independent-exit-verifier.mjs';
import {navigationOwned,validateNamespaces} from './discovery-authority.mjs';
import {normalizeUrl,digest} from './model.mjs';
import {boundedOperation,directHop,createProxyHop,systemTiming,safeOrigin} from './acquisition-io.mjs';
import {createAcquisitionReader} from './acquisition-reader.mjs';
import {parseAcquisitionRobots,evaluateAcquisitionRobots} from './acquisition-robots.mjs';
import {acquisitionCapacity as cap,fault,normalizedFailure,failureClass,safeMetadata} from './acquisition-contract.mjs';
const resolver=host=>lookup(host,{all:true,verbatim:true});
const verifier=createIndependentExitVerifier({approved:true});
function budget(limits) {
 let requests=0,bytes=0,decodedBytes=0,retainedBytes=0;
 const decodedLimit=limits.maxDecodedBytes??cap.objectiveDecodedBytes;
 return {
  request(){if(requests>=limits.maxRequests)throw fault('NETWORK_REQUEST_BOUND','CAPACITY');requests++;},
  bytes(n){if(!Number.isSafeInteger(n)||n<0)throw fault('INVALID_BYTE_ACCOUNTING');bytes+=n;if(bytes>limits.maxBytes)throw fault('WIRE_BYTE_BOUND','CAPACITY');},
  decoded(n){decodedBytes+=n;if(decodedBytes>decodedLimit)throw fault('DECODED_BYTE_BOUND','CAPACITY');},
  retained(n){retainedBytes+=n;},
  remaining(){if(bytes>=limits.maxBytes)throw fault('WIRE_BYTE_BOUND','CAPACITY');return limits.maxBytes-bytes;},
  decodedRemaining(){if(decodedBytes>=decodedLimit)throw fault('DECODED_BYTE_BOUND','CAPACITY');return decodedLimit-decodedBytes;},
  result:()=>({requests,bytes,decodedBytes,retainedBytes})
 };
}
export function createCapabilities({objective,permissions={},network={},tavily={},decodo={},clock=()=>new Date().toISOString(),timeoutMs,acquisitionTimeoutMs=timeoutMs===undefined?cap.acquisitionMs:Math.min(180000,timeoutMs*6),timing=systemTiming}={}) {
 if(!Number.isSafeInteger(acquisitionTimeoutMs)||acquisitionTimeoutMs<1||acquisitionTimeoutMs>600000||timeoutMs!==undefined&&(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>90000))throw fault('INVALID_TIMEOUT');
 validateNamespaces(objective);
 const journeys=new Map();
 const check=url=>{if(!normalizeUrl(url)||!navigationOwned(objective,url))throw fault('PROVIDER_BOUNDARY');};
 async function acquire(action,limits,geo) {
  const account=budget(limits),access=[],controller=new AbortController(),ledger=[],redirects=[],navigationDocuments=[],operations=[],secretTokens=[],attemptId=randomBytes(12).toString('hex'),started=timing.now();let lastFailure=null,stage='SETUP',status=null,finalUrl=action.url;
  const acquisitionDeadline=Math.min(acquisitionTimeoutMs,limits.maxAcquisitionMs??acquisitionTimeoutMs);
  const checkDeadline=()=>{if(timing.now()-started>acquisitionDeadline)throw fault('ACQUISITION_DEADLINE_EXCEEDED');};
  const timer=timing.set(()=>controller.abort('ACQUISITION_DEADLINE_EXCEEDED'),acquisitionDeadline);
  const explicitAbort=()=>controller.abort('EXPLICIT_CANCELLATION');limits.signal?.addEventListener('abort',explicitAbort,{once:true});if(limits.signal?.aborted)explicitAbort();
  const hopDeadline=purpose=>timeoutMs??(purpose.startsWith('GEO_')?cap.geographyRequestMs:purpose==='ROBOTS'?cap.robotsRequestMs:cap.providerRequestMs);
  const details=()=>({requestLedger:ledger,redirects,navigationDocuments,acquisitionOperations:operations,acquisitionTiming:{attemptId,elapsedMs:Math.max(0,Math.round(timing.now()-started)),requestTimeoutMs:timeoutMs??cap.providerRequestMs,acquisitionTimeoutMs:acquisitionDeadline},acquisitionCapacity:cap,externalHttpRequests:ledger.reduce((n,r)=>n+Math.max(1,r.transportRequests.length),0)});
  const base={format:'WEB',url:action.url,requestedUrl:action.url,context:action.context,acquiredAt:clock(),body:'',truncated:false,completeness:'REJECTED',access};
  const recordFailure=(error,extra={})=>{lastFailure={...normalizedFailure(error),stage,...extra};};
  let transport={kind:'DIRECT',networkGeography:'UNBOUND'};
  try{
   check(action.url);
   if(action.context.transport!==(geo?'DECODO':'DIRECT')||geo&&!objective.markets.includes(action.context.networkGeography)||!geo&&action.context.networkGeography!=='UNBOUND')throw fault('INVALID_CONTEXT');
   let requestOnce=network.requestOnce??directHop,before=null;
   const resolveHost=async host=>{
    const began=timing.now(),deadline=timeoutMs??cap.dnsMs,operation={phase:'DNS',purpose:stage,destinationOrigin:safeOrigin('https://'+host),deadlineMs:deadline,startOffsetMs:Math.round(began-started),state:'STARTED'};operations.push(operation);
    try{const result=await boundedOperation({signal:controller.signal,timeoutMs:deadline,timing,phase:()=>stage+'_DNS',onFailure:e=>recordFailure(e,{phase:'DNS',destinationOrigin:safeOrigin('https://'+host),elapsedMs:Math.round(timing.now()-began),deadlineMs:deadline}),run:()=> (network.resolveHost??resolver)(host)});operation.state='COMPLETED';return result;}
    catch(e){if(!lastFailure)recordFailure(fault('DNS_FAILED'),{phase:'DNS',destinationOrigin:safeOrigin('https://'+host)});operation.state='FAILED';operation.failure=lastFailure.code;throw e;}
    finally{operation.elapsedMs=Math.max(0,Math.round(timing.now()-began));}
   };
   const wireRequest=async(r,purpose)=>{
    const wireLimit=Math.min(r.maxBytes,account.remaining());account.request();const deadline=hopDeadline(purpose),row={sequence:ledger.length+1,actionId:action.id??null,attemptId,transport:action.context.transport,purpose,destinationOrigin:safeOrigin(r.url),destinationHash:digest(r.url.href),requestedGeography:action.context.networkGeography,startOrder:ledger.length+1,startOffsetMs:Math.round(timing.now()-started),elapsedMs:0,deadlineMs:deadline,acquisitionDeadlineMs:acquisitionDeadline,phase:'CONNECT_TLS',wireLimitBytes:wireLimit,decodedLimitBytes:r.maxDecodedBytes,observationLimitBytes:r.maxObservationBytes,transportRequests:[],state:'STARTED',httpStatus:null,bytes:0,decodedBytes:0,retainedBytes:0,redirectFrom:ledger.filter(x=>x.purpose===purpose).at(-1)?.redirect===true?ledger.filter(x=>x.purpose===purpose).at(-1).sequence:null};ledger.push(row);const began=timing.now();let phaseTimer;
    const safePhase=p=>['CONNECT_TLS','PROXY_CONNECT','TARGET_TLS','HEADERS','BODY'].includes(p)?p:'CONNECT_TLS';
    try{
     const result=await boundedOperation({signal:controller.signal,timeoutMs:deadline,timing,phase:()=>purpose+'_'+row.phase,onFailure:e=>recordFailure(e,{phase:row.phase,requestSequence:row.sequence}),run:state=>{
      const enter=p=>{if(!state.active||phaseController.signal.aborted)return;const next=safePhase(p);if(row.phase===next&&phaseTimer)return;row.phase=next;
       timing.clear(phaseTimer);const ms=timeoutMs??(next==='BODY'?cap.bodyMs:next==='HEADERS'?cap.headersMs:cap.connectMs);row.phaseDeadlineMs=ms;
       // Independent absolute phase timer, not reset by body chunks.
       phaseTimer=timing.set(()=>{if(!state.active)return;recordFailure(fault(purpose+'_'+row.phase+'_TIMEOUT'),{phase:row.phase,requestSequence:row.sequence});phaseController.abort();},ms);
      };
      const phaseController=new AbortController();const inherit=()=>phaseController.abort(state.signal.reason);state.signal.addEventListener('abort',inherit,{once:true});if(state.signal.aborted)inherit();
      enter('CONNECT_TLS');
      const request=Promise.resolve(requestOnce({...r,maxBytes:Math.min(r.maxBytes,account.remaining()),deferContentProcessing:true,userAgent:researchUserAgent,signal:phaseController.signal,
       onPhase:enter,onTransportRequest:method=>{if(state.active&&!phaseController.signal.aborted&&['CONNECT','GET'].includes(method))row.transportRequests.push({method,order:row.transportRequests.length+1,destinationOrigin:method==='CONNECT'?'https://gate.decodo.com:7000':row.destinationOrigin});},onProxyHeaders:n=>{if(state.active&&!phaseController.signal.aborted&&Number.isInteger(n)){row.proxyHttpStatus=n;const request=row.transportRequests.find(x=>x.method==='CONNECT');if(request)request.httpStatus=n;}},onHeaders:(n,meta)=>{if(state.active&&!phaseController.signal.aborted&&Number.isInteger(n)){row.httpStatus=n;const target=row.transportRequests.find(x=>x.method==='GET');if(target)target.httpStatus=n;if(meta)Object.assign(row,meta);}},
       onBodyBytes:n=>{if(!state.active||phaseController.signal.aborted)return;enter('BODY');row.bytes+=n;account.bytes(n);}}));
      const aborted=new Promise((_,reject)=>phaseController.signal.addEventListener('abort',()=>reject(fault(lastFailure?.requestSequence===row.sequence?lastFailure.code:phaseController.signal.reason==='ACQUISITION_DEADLINE_EXCEEDED'?'ACQUISITION_DEADLINE_EXCEEDED':'ABORTED')),{once:true}));
      return Promise.race([request,aborted]).finally(()=>{state.signal.removeEventListener('abort',inherit);phaseController.abort('COMPLETED');});
     }});
     if(!row.bytes&&result.body?.length){row.bytes=result.body.length;account.bytes(row.bytes);}
     row.httpStatus=result.status;const target=row.transportRequests.find(x=>x.method==='GET');if(target)target.httpStatus=result.status;Object.assign(row,safeMetadata(result.headers));row.redirect=[301,302,303,307,308].includes(result.status);row.state='COMPLETED';return result;
    }catch(e){const failure=lastFailure?.requestSequence===row.sequence?lastFailure:normalizedFailure(e,'NETWORK_FAILED');row.state='FAILED';row.failure=failure.code;row.failureClass=failure.classification;if(e.diagnostics?.cause)row.transportCause=e.diagnostics.cause;recordFailure({code:failure.code},{phase:row.phase,requestSequence:row.sequence});throw e;}
    finally{timing.clear(phaseTimer);row.elapsedMs=Math.max(0,Math.round(timing.now()-began));}
   };
   const makeReader=(extra={},purpose=stage)=>{const read=createAcquisitionReader({resolveHost:host=>{stage=purpose;return resolveHost(host);},requestOnce:r=>wireRequest(r,purpose),validateDestination:check,maxWireBytes:Math.min(cap.wireResponseBytes,account.remaining()),maxDecodedBytes:Math.min(cap.decodedResponseBytes,account.decodedRemaining()),maxObservationBytes:cap.observationBytes,
    onDecodedText:text=>{if(secretTokens.some(s=>text.includes(s)))throw fault('SECRET_IN_RESPONSE');},
    onRedirect:decision=>{const row=ledger.filter(r=>r.purpose===purpose).at(-1);redirects.push({...decision,requestSequence:row?.sequence??null,purpose});if(row)row.redirectDecision=decision;},
    onDecodedBytes:n=>{const row=ledger.filter(r=>r.purpose===purpose).at(-1);if(row)row.decodedBytes+=n;account.decoded(n);},
    onProcessingPhase:p=>{const row=ledger.filter(r=>r.purpose===purpose).at(-1);if(row)row.processingPhase=p;},
    process:async run=>{const row=ledger.filter(r=>r.purpose===purpose).at(-1),begin=timing.now(),deadline=timeoutMs??cap.processingMs;if(row)row.processingDeadlineMs=deadline;
     try{const result=await boundedOperation({signal:controller.signal,timeoutMs:deadline,timing,phase:()=>purpose+'_'+(row?.processingPhase??'PROCESSING'),run});if(timing.now()-begin>deadline)throw fault(purpose+'_PROCESSING_TIMEOUT');if(row)row.processingState='COMPLETED';return result;}
     catch(e){if(row){row.processingState='FAILED';row.processingFailure=normalizedFailure(e).code;}recordFailure(e,{phase:row?.processingPhase??'PROCESSING',requestSequence:row?.sequence??null});throw e;}finally{if(row)row.processingElapsedMs=Math.max(0,Math.round(timing.now()-begin));}},...extra});
    return async(...args)=>{try{const result=await read(...args);checkDeadline();return result;}catch(e){
     const row=ledger.filter(r=>r.purpose===purpose).at(-1);
     if(!lastFailure){if(row&&row.state==='COMPLETED'){row.processingState='FAILED';row.processingFailure=normalizedFailure(e).code;}recordFailure(e,{phase:row?.processingPhase??(row?.redirect?'REDIRECT':'PROCESSING'),requestSequence:row?.sequence??null});}
     throw e;}};};
   if(geo){
    const {username,password}=decodo;
    if(typeof username!=='string'||!username||typeof password!=='string'||!password||/[:\r\n]|^user-|-country-|-session-/i.test(username)||/[\r\n]/.test(password))throw fault('DECODO_CONFIGURATION_REQUIRED');
    const proxyHost='gate.decodo.com',proxyPort=7000,addresses=await resolveHost(proxyHost);
    if(!addresses?.length||addresses.some(a=>!publicAddress(a.address)||isIP(a.address)!==a.family))throw fault('UNSAFE_DNS');
    const journeyKey=typeof action.journey==='string'&&/^state-[a-f0-9]{24}$/.test(action.journey)?digest([action.journey,action.context.networkGeography]):null;
    let journey=journeyKey?journeys.get(journeyKey):null;
    if(journey&&(journey.steps>=8||timing.now()-journey.started>900000)){journeys.delete(journeyKey);journey=null;}
    const binding=journey?.binding??randomBytes(16).toString('hex');
    if(journeyKey){if(!journey){if(journeys.size>=64)journeys.delete(journeys.keys().next().value);journey={binding,steps:0,started:timing.now()};journeys.set(journeyKey,journey);}journey.steps++;}
    const authUsername='user-'+username+'-country-'+action.context.networkGeography.toLowerCase()+'-session-'+binding,requestHop=decodo.requestHop??createProxyHop();
    secretTokens.push(username,password,authUsername,Buffer.from(authUsername+':'+password).toString('base64'));
    requestOnce=async r=>{let counted=0;
     const result=await requestHop({...r,proxyHost,proxyPort,proxyAddress:addresses[0].address,username:authUsername,password,timeoutMs:hopDeadline(stage),onConnect:()=>r.onPhase('CONNECT_TLS'),onTarget:()=>r.onPhase('HEADERS'),headers:{'user-agent':researchUserAgent,accept:'text/html,text/plain,application/xhtml+xml',...(r.locale?{'accept-language':r.locale}:{})},onBytes:n=>{counted+=n;r.onBodyBytes(n);}});
     if(!result.tlsVerified)throw fault('DECODO_TLS_NOT_VERIFIED');if(!counted&&result.body?.length)r.onBodyBytes(result.body.length);
     const material=JSON.stringify(result.headers)+'\n'+result.body?.toString('utf8');
     if([username,password,authUsername,Buffer.from(authUsername+':'+password).toString('base64')].some(s=>material.includes(s)))throw fault('SECRET_IN_RESPONSE');return result;
    };
    transport={kind:'DECODO',sessionMode:journeyKey?'SOURCE_STATE_JOURNEY':'INDEPENDENT_FETCH',...(journeyKey?{journey:journeyKey,journeyStep:journey.steps}:{}),requestedCountry:action.context.networkGeography,binding:digest(binding),gateway:proxyHost,verification:'PENDING'};
   }
   const probe=async purpose=>{
    stage=purpose;const r=await makeReader({maxWireBytes:Math.min(cap.geographyBytes,account.remaining()),maxDecodedBytes:cap.geographyBytes,maxObservationBytes:cap.geographyBytes,jsonUrls:[verifier.url],maxRedirects:0,validateDestination:u=>{if(u!==verifier.url)throw fault('GEO_VERIFIER_REDIRECT');}},purpose)(verifier.url,{signal:controller.signal});
    if(r.status!==200)throw fault('GEO_VERIFICATION_FAILED');let proof;
    try{proof=verifier.parse({text:r.text});}catch{recordFailure(fault('GEO_VERIFICATION_FAILED'),{phase:'GEO_PARSE',requestSequence:ledger.at(-1)?.sequence});throw fault('GEO_VERIFICATION_FAILED');}
    if(proof.country!==action.context.networkGeography)throw fault('GEO_COUNTRY_MISMATCH');return proof;
   };
   if(geo)before=await probe('GEO_PRE');
   const policies=new Map();
   const page=await makeReader({beforeRequest:async r=>{
    check(r.url);stage='ROBOTS';const origin=new URL(r.url).origin;let policy=policies.get(origin);
    if(!policy){
     const result=await makeReader({maxWireBytes:Math.min(cap.robotsBytes,account.remaining()),maxDecodedBytes:cap.robotsBytes,maxObservationBytes:cap.robotsBytes,robotsPolicyRetrieval:true,maxRedirects:cap.robotsRedirects},'ROBOTS')(origin+'/robots.txt',{signal:controller.signal});
     if([404,410].includes(result.status))policy={absent:true,status:result.status};
     else if(result.status===200){
      const row=ledger.at(-1);if(row)row.processingPhase='ROBOTS_PARSE';
      // Retain the decoded source before local parsing can fail. This is an
      // auxiliary policy artifact, never provider pricing evidence. Capacity
      // and credential checks apply equally to successful and rejected policies.
      if(geo&&[decodo.username,decodo.password].some(s=>result.text.includes(s)))throw fault('SECRET_IN_RESPONSE');
      const policyArtifact={kind:'ROBOTS',url:result.url,body:result.text,sha256:digest(result.text),completeness:'COMPLETE',httpStatus:result.status,requestSequence:row?.sequence??null,encodedBytes:row?.bytes??null,decodedBytes:row?.decodedBytes??null,contentType:row?.contentType??null,contentEncoding:row?.contentEncoding??null,processingState:'PENDING',declarations:[]};
      navigationDocuments.push(policyArtifact);account.retained(Buffer.byteLength(result.text));if(row)row.retainedBytes=Buffer.byteLength(result.text);
      try{const parsedAt=timing.now();policy={parsed:parseAcquisitionRobots(result.text),status:result.status,artifact:policyArtifact};
       policyArtifact.declarations=policy.parsed.sitemaps;policyArtifact.processingState='COMPLETED';
       if(timing.now()-parsedAt>(timeoutMs??cap.processingMs))throw fault('ROBOTS_PROCESSING_TIMEOUT');checkDeadline();if(row){row.robotsDiagnostics=policy.parsed.diagnostics;row.processingState='COMPLETED';}}
      catch(e){policyArtifact.processingState='FAILED';policyArtifact.failure={code:e.code,diagnostics:e.diagnostics??null};if(row){row.processingState='FAILED';row.processingFailure=e.code;row.robotsDiagnostic=e.diagnostics??null;}recordFailure(e,{phase:'ROBOTS_PARSE',requestSequence:row?.sequence??null});throw e;}
     }else throw fault('ROBOTS_HTTP_UNAVAILABLE');policies.set(origin,policy);
    }
    const evaluationRow=ledger.filter(x=>x.purpose==='ROBOTS').at(-1);if(evaluationRow)evaluationRow.processingPhase='ROBOTS_EVALUATE';
    const evaluatedAt=timing.now();const evaluation=policy.absent?{decision:'ALLOWED',reason:'ROBOTS_ABSENT'}:evaluateAcquisitionRobots(policy.parsed,r.url);
    if(timing.now()-evaluatedAt>(timeoutMs??cap.processingMs))throw fault('ROBOTS_PROCESSING_TIMEOUT');checkDeadline();
    const safeEvaluation={...evaluation,...(evaluation.rule?{rule:{directive:evaluation.rule.directive,line:evaluation.rule.line,pathHash:digest(evaluation.rule.path??'')}}:{})};
    if(policy.artifact)policy.artifact.decision=safeEvaluation;
    access.push({destinationOrigin:safeOrigin(r.url),destinationHash:digest(r.url),status:policy.status,...safeEvaluation});if(evaluationRow)evaluationRow.robotsDecision=safeEvaluation;
    if(evaluation.decision==='DISALLOWED')throw fault('ROBOTS_DISALLOWED','POLICY');if(evaluation.decision!=='ALLOWED')throw fault('ROBOTS_REVIEW_REQUIRED','POLICY');stage='PROVIDER';
   }},'PROVIDER')(action.url,{signal:controller.signal,locale:objective.language??null});
   status=page.status;finalUrl=page.url;
   if(geo&&[decodo.username,decodo.password].some(s=>page.text.includes(s)))throw fault('SECRET_IN_RESPONSE');
   if([401,403].includes(page.status))throw fault('PROVIDER_ACCESS_CONTROL','POLICY');
   if(geo){const after=await probe('GEO_POST');if(before.address!==after.address)throw fault('GEO_BINDING_CHANGED');transport={...transport,verification:'BRACKET_VERIFIED',verifiedCountry:after.country,exitAddressHash:digest(after.address)};}
   account.retained(page.metadata.observationBytes);const row=ledger.filter(x=>x.purpose==='PROVIDER').at(-1);if(row)row.retainedBytes=page.metadata.observationBytes;
   return {...base,url:page.url,httpStatus:page.status,contentType:page.contentType,body:page.text,outcome:page.status===200?'OK':'HTTP_UNAVAILABLE',completeness:'COMPLETE',responseMetadata:page.metadata,transport,accounting:account.result(),...details()};
  }catch(error){
   const code=controller.signal.reason==='ACQUISITION_DEADLINE_EXCEEDED'?'ACQUISITION_DEADLINE_EXCEEDED':controller.signal.reason==='EXPLICIT_CANCELLATION'?'EXPLICIT_CANCELLATION':lastFailure?.code??normalizedFailure(error).code;
   const policy=error.kind==='POLICY',capacity=error.kind==='CAPACITY'||failureClass(code).includes('CAPACITY');
   return {...base,url:finalUrl,httpStatus:status??ledger.filter(x=>x.purpose==='PROVIDER').at(-1)?.httpStatus??null,outcome:policy?'POLICY_BLOCKED':'ERROR',policyScope:'URL',transport,accounting:account.result(),...details(),...(policy?{}:{failure:{kind:capacity?'CAPACITY':'ACQUISITION',stage,...lastFailure,code,classification:failureClass(code)}})};
  }finally{timing.clear(timer);limits.signal?.removeEventListener('abort',explicitAbort);controller.abort('COMPLETED');}
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
            const res=await (tavily.fetchImpl??fetch)('https://api.tavily.com/search',{method:'POST',redirect:'error',signal:AbortSignal.timeout(timeoutMs??cap.geographyRequestMs),headers:{'Content-Type':'application/json',Authorization:'Bearer '+tavily.apiKey},body:JSON.stringify({query:action.query,include_domains:[...new Set([...objective.providerHosts,...(objective.providerNamespaces??[]).map(s=>s.domain)])],max_results:Math.min(8,limits.maxResults),include_answer:false,include_raw_content:false,include_images:false,search_depth:'basic'})});
            if(!res.ok)throw fault('TAVILY_HTTP_UNAVAILABLE');
            const reader=res.body.getReader(), chunks=[];
            try {for(;;){const {done,value}=await reader.read();if(done)break;account.bytes(value.byteLength);chunks.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}
            const material=Buffer.concat(chunks);account.decoded(material.length);
            const data=JSON.parse(material.toString('utf8'));
            if(!Array.isArray(data.results))throw fault('TAVILY_INVALID_RESPONSE');
            const results=data.results.slice(0,Math.min(8,limits.maxResults)).filter(r=>typeof r.url==='string'&&!r.url.includes(tavily.apiKey)&&navigationOwned(objective,r.url)).map(r=>({url:normalizeUrl(r.url),title:typeof r.title==='string'?r.title.slice(0,240):'',content:typeof r.content==='string'?r.content.slice(0,512):'',language:typeof r.language==='string'?r.language.slice(0,32):null,truthAuthority:'NONE'}));
            return {results,accounting:account.result()};
        }catch(error){return {results:[],accounting:account.result(),failure:{kind:error.kind==='CAPACITY'?'CAPACITY':'DISCOVERY',code:'TAVILY_REQUEST_UNAVAILABLE'}};}
    };
    return capabilities;
}
