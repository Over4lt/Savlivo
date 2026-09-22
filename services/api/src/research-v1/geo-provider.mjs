// Provider/session primitives only. No research workflow, runtime, environment or network on import.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateCost,unknownCost,freeCost,boundedCall} from './executor-adapters.mjs';
import {normalizePublicUrl,publicAddress,PublicNetworkError,researchUserAgent} from './public-network.mjs';

export const geoProtocolVersion=1; // Historical protocol remains the default.
export const transportVerificationLevels=Object.freeze(['PER_HOP_VERIFIED','BRACKET_VERIFIED','UNVERIFIED']);
export function verificationPolicy(p){
  if(!p.verification)return {version:1,level:'PER_HOP_VERIFIED'};
  exact(p.verification,['version','level','sticky']);
  assert.equal(p.verification.version,2);assert(transportVerificationLevels.includes(p.verification.level));
  assert(typeof p.verification.sticky==='boolean');
  if(p.verification.level==='BRACKET_VERIFIED')assert(p.mode==='SESSION'&&p.verification.sticky,'Sticky session required');
  return p.verification;
}
export const gatewaySafety=Object.freeze(['PUBLIC_URL','REMOTE_DNS_PINNING','NO_PRIVATE_TARGETS','SINGLE_HOP',
  'BOUNDED_BODY','ABORT_AND_DEADLINE','NO_ACCESS_BYPASS','BOUND_EXIT','TLS_IDENTITY','SPEND_CEILING','IDEMPOTENT_RELEASE','SESSION_EXPIRY']);
export const geoId=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0,24);
const id=v=>assert(typeof v==='string'&&/^[a-zA-Z0-9_.:-]{1,120}$/.test(v),'Invalid configuration reference');
const country=v=>assert(typeof v==='string'&&/^[A-Z]{2}$/.test(v),'Invalid country');
const exact=(v,keys)=>assert(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k)),'Unexpected fields');
export function money(value){
  assert(typeof value==='string'&&/^(0|[1-9]\d{0,11})(\.\d{1,6})?$/.test(value),'Bounded decimal required');
  const [whole,part='']=value.split('.');return BigInt(whole)*1000000n+BigInt(part.padEnd(6,'0'));
}
const decimal=n=>`${n/1000000n}.${String(n%1000000n).padStart(6,'0')}`;
export function knownCost(c){exact(c,['status','amount','currency']);validateCost(c);assert.equal(c.status,'KNOWN');money(c.amount);return c;}

/** Registry is trusted operator input. Readiness and review attestations are NOT page/model input. */
export function selectGeoProviders(registry,{targetCountry,capability,transports,secretAvailable}){
  country(targetCountry);id(capability);assert(Array.isArray(registry)&&registry.length<=32);
  const considered=[],eligible=[],ids=new Set();
  for(const p of registry){
    id(p.id);assert(!ids.has(p.id),'Duplicate provider');ids.add(p.id);
    let reason=null;
    try{
      exact(p,['id','enabled','approved','configured','ready','costClass','endpoint','transportRef','secretRef','countries','capabilities','priority','mode','safety','reviewRef','cost',...(p.verification?['verification']:[]),...(p.transportPolicy?['transportPolicy']:[])]);
      const verification=verificationPolicy(p);
      if(p.transportPolicy){
        exact(p.transportPolicy,['version','destination','spend']);
        assert.equal(p.transportPolicy.version,1);assert.equal(p.transportPolicy.destination,'PINNED_CONNECT');
        assert.equal(p.transportPolicy.spend,'LOCAL_AUTHORIZATION');assert.equal(verification.level,'BRACKET_VERIFIED');
      }
      id(p.transportRef);id(p.reviewRef);assert(['SESSION','REQUEST'].includes(p.mode));
      assert(['FREE','PAID'].includes(p.costClass));assert(Number.isSafeInteger(p.priority)&&p.priority>=0);
      const u=normalizePublicUrl(p.endpoint);assert(u.protocol==='https:'&&!u.search&&!new URL(p.endpoint).hash);
      assert(Array.isArray(p.countries)&&p.countries.length<=250);p.countries.forEach(country);
      assert(Array.isArray(p.capabilities)&&p.capabilities.length<=16);p.capabilities.forEach(id);
      assert(Array.isArray(p.safety));
      if(p.secretRef!==null)id(p.secretRef);
      if(p.enabled!==true)reason='DISABLED';else if(p.approved!==true)reason='NOT_APPROVED';
      else if(p.configured!==true||typeof transports[p.transportRef]?.request!=='function'||(p.mode==='SESSION'&&['open','close'].some(k=>typeof transports[p.transportRef]?.[k]!=='function'))||(p.secretRef!==null&&!secretAvailable(p.secretRef)))reason='UNCONFIGURED';
      else if(p.ready!==true)reason='NOT_READY';
      else if(!p.countries.includes(targetCountry))reason='UNSUPPORTED_COUNTRY';
      else if(!p.capabilities.includes(capability))reason='UNSUPPORTED_CAPABILITY';
      else if(p.costClass==='FREE'&&p.secretRef!==null)reason='FREE_REQUIRES_CREDENTIALS';
      else if(verification.level==='UNVERIFIED')reason='UNVERIFIED_TRANSPORT';
      else if(!gatewaySafety.filter(k=>(verification.level!=='BRACKET_VERIFIED'||k!=='BOUND_EXIT')&&(!p.transportPolicy||!['REMOTE_DNS_PINNING','SPEND_CEILING'].includes(k))).every(k=>p.safety.includes(k))||verification.level==='BRACKET_VERIFIED'&&!p.safety.includes('STICKY_BINDING')||p.transportPolicy&&!['PINNED_CONNECT','LOCAL_SPEND_AUTHORIZATION'].every(k=>p.safety.includes(k)))reason='UNREVIEWED_SAFETY';
      else {
        exact(p.cost,['estimate','ceiling','unit']);id(p.cost.unit);
        if(p.costClass==='FREE'){
          exact(p.cost.estimate,['status','amount','currency']);exact(p.cost.ceiling,['status','amount','currency']);validateCost(p.cost.estimate);validateCost(p.cost.ceiling);
          assert.equal(p.cost.estimate.status,'NOT_CHARGED');assert.equal(p.cost.ceiling.status,'NOT_CHARGED');
        }else {knownCost(p.cost.estimate);knownCost(p.cost.ceiling);assert.equal(p.cost.estimate.currency,p.cost.ceiling.currency);
          assert(money(p.cost.estimate.amount)<=money(p.cost.ceiling.amount));}
      }
    }catch{reason='INVALID_CONFIGURATION_OR_COST';}
    considered.push({providerId:p.id,costClass:['FREE','PAID'].includes(p.costClass)?p.costClass:null,reason:reason??'ELIGIBLE',...(!reason?{priority:p.priority,mode:p.mode,cost:structuredClone(p.cost)}:{})});
    if(!reason)eligible.push(p);
  }
  const paid=eligible.filter(p=>p.costClass==='PAID');
  const comparable=new Set(paid.map(p=>p.cost.estimate.currency+'|'+p.cost.unit)).size<=1;
  eligible.sort((a,b)=>{
    if(a.costClass!==b.costClass)return a.costClass==='FREE'?-1:1;
    if(a.costClass==='PAID'&&comparable){const d=money(a.cost.estimate.amount)-money(b.cost.estimate.amount);if(d)return d<0n?-1:1;}
    return a.priority-b.priority||a.id.localeCompare(b.id,'en');
  });
  return {eligible,considered,comparison:comparable?'COMPARABLE_ESTIMATED_OPERATION_COST':'INCOMPARABLE_CONFIGURED_PRIORITY'};
}

/** In-process atomic authorization ledger. Unknown charges retain the entire reservation.
 * Share one ledger across overlapping approved scopes. Multi-process use needs an atomic external backend. */
export function validateMonetaryAuthorizationMode(mode){
 assert(mode===undefined||mode==='BOUNDED'||mode==='UNBOUNDED','Invalid monetary authorization mode');return mode??'BOUNDED';
}
export function createGeoBudget(authorizations){
  assert(Array.isArray(authorizations)&&authorizations.length<=10000);
  const modes=new Set(authorizations.map(a=>validateMonetaryAuthorizationMode(a.monetaryAuthorizationMode)));assert(modes.size<=1,'Mixed monetary authorization modes');
  const unbounded=modes.has('UNBOUNDED');
  const accounts=new Map(),reservations=new Map(),ids=new Set();let frozen=false;
  for(const a of authorizations){exact(a,['id','scope','key','currency','ceiling',...(a.monetaryAuthorizationMode!==undefined?['monetaryAuthorizationMode']:[])]);id(a.id);assert(!ids.has(a.id),'Duplicate authorization reference');ids.add(a.id);id(a.key);
    assert(['TASK','MARKET','RUN'].includes(a.scope)&&/^[A-Z]{3}$/.test(a.currency));
    const k=a.scope+'|'+a.key+'|'+a.currency;assert(!accounts.has(k));accounts.set(k,{...a,limit:unbounded?(assert.equal(a.ceiling,'UNBOUNDED'),null):money(a.ceiling),used:0n});}
  function decision(r){
    if(r.operation==='RESERVE'){
      knownCost(r.ceiling);const amount=money(r.ceiling.amount),keys=[['TASK',r.researchId],['MARKET',r.targetCountry],['RUN',r.runId]];
      const selected=keys.map(([scope,key])=>accounts.get(scope+'|'+key+'|'+r.ceiling.currency));
      if(frozen)return {allowed:false,reason:'BUDGET_FROZEN'};
      if(selected.some(a=>!a))return {allowed:false,reason:'NO_AUTHORIZATION'};
      if(!unbounded&&selected.some(a=>a.used+amount>a.limit))return {allowed:false,reason:'INSUFFICIENT_BUDGET'};
      const reservationId='reserve-'+geoId([r.runId,r.attemptId]);
      if(reservations.has(reservationId))return {allowed:false,reason:'DUPLICATE_RESERVATION'};
      selected.forEach(a=>a.used+=amount);reservations.set(reservationId,{selected,amount,currency:r.ceiling.currency,settled:false});
      return {allowed:true,reservationId,authorizationIds:selected.map(a=>a.id),ceiling:structuredClone(r.ceiling)};
    }
    if(r.operation==='SETTLE'){
      const held=reservations.get(r.reservationId);assert(held&&!held.settled,'Unknown/settled reservation');validateCost(r.actualCost);
      let charged=held.amount,overspend=false;
      if(r.actualCost.status==='KNOWN'){
        if(r.actualCost.currency!==held.currency){frozen=true;return {state:'CURRENCY_MISMATCH',frozen:true};}
        charged=money(r.actualCost.amount);overspend=charged>held.amount;
      }else if(r.actualCost.status==='NOT_CHARGED')charged=0n;
      held.selected.forEach(a=>a.used+=charged-held.amount);held.settled=true;frozen||=overspend;
      return {state:overspend?'OVERSPEND':r.actualCost.status==='UNKNOWN'?'UNKNOWN_COST_RESERVATION_RETAINED':'SETTLED',frozen};
    }
    return {allowed:false,reason:'RESERVATION_REQUIRED'};
  }
  decision.snapshot=()=>({...(unbounded?{monetaryAuthorizationMode:'UNBOUNDED'}:{}),frozen,accounts:[...accounts.values()].map(a=>({id:a.id,scope:a.scope,key:a.key,currency:a.currency,ceiling:a.ceiling,consumed:decimal(a.used)}))});
  return decision;
}

/** Approved adapters must implement remote safeguards before connecting, not after returning.
 * Receipts allow validation/audit but cannot make an untrusted gateway trustworthy. */
export function createGeoBinding(provider,transport,{bindingRef,targetCountry,secret,timeoutMs=10000,ceiling,maxRequests=18,bodyBudget=null,onControl=()=>{}}){
  const policy=verificationPolicy(provider),bracket=policy.level==='BRACKET_VERIFIED';
  let handle=null,opened=false,exitAddress=null,continuityRef=null;const receipts=[];
  const clean=value=>{
    const text=Buffer.isBuffer(value)?value.toString('utf8'):JSON.stringify(value);
    if([secret,handle].some(s=>typeof s==='string'&&s.length&&text?.includes(s)))throw new PublicNetworkError('SECRET_IN_RESPONSE');return value;
  };
  const call=(fn,request)=>{onControl();return boundedCall(fn,{...request,bindingRef,targetCountry,endpoint:provider.endpoint,secret}, {timeoutMs,maxResponseBytes:200000});};
  const context=()=>({handle,bindingRef,targetCountry});
  return {
    async open(){
      if(provider.mode==='SESSION'){opened=true;const r=await call(transport.open.bind(transport),{...context(),ceiling,ttlMs:timeoutMs*12,maxRequests,...(bodyBudget?{bodyBudget}:{})});assert(r&&typeof r.handle==='string'&&r.handle.length>0&&r.handle.length<=4096);handle=r.handle;
        if(bracket){clean(r.continuityRef);id(r.continuityRef);continuityRef=r.continuityRef;
          if(r.reportedAddress!=null){clean(r.reportedAddress);assert(publicAddress(r.reportedAddress));}}
        let transportMetadata;
        if(provider.transportPolicy){
          clean(r.transportMetadata);exact(r.transportMetadata,['endpointHostname','stickyPort','capabilitySource','capabilityStatus']);
          const m=r.transportMetadata;assert.equal(normalizePublicUrl('https://'+m.endpointHostname).hostname,m.endpointHostname);
          assert(Number.isInteger(m.stickyPort)&&m.stickyPort>0&&m.stickyPort<=65535);
          normalizePublicUrl(m.capabilitySource);assert.equal(m.capabilityStatus,'SUPPORTED');transportMetadata=structuredClone(m);
        }
        return {...(transportMetadata?{transportMetadata}:{}),...(bracket?{reportedAddress:r.reportedAddress??null}:{}),reportedCountry:typeof r.reportedCountry==='string'&&/^[A-Z]{2}$/.test(r.reportedCountry)?r.reportedCountry:null};}
      return {reportedCountry:null};
    },
    setVerifiedExit(address){assert(publicAddress(address)&&exitAddress===address,'Verification must match the bound egress');},
    async requestOnce(request){
      const r=await transport.request({...request,...context(),secret,endpoint:provider.endpoint,ceiling,
        headers:{'user-agent':researchUserAgent,accept:'text/html,text/plain', 'accept-encoding':'identity',...(request.locale?{'accept-language':request.locale}:{})}});
      clean(r.body);clean(r.proof);clean(r.headers);if(r.scriptScan)clean(r.scriptScan);
      const proof=r.proof;
      assert(proof&&['PUBLIC','ACCESS_CONTROL_STOP'].includes(proof.access),'Missing remote access decision');
      if(proof.access==='ACCESS_CONTROL_STOP')throw new PublicNetworkError('ACCESS_CONTROL_STOP');
      assert(proof.tlsVerified===true||request.url.protocol==='http:','Unverified remote TLS identity');
      assert(proof&&proof.bindingRef===bindingRef&&proof.url===request.url.href&&proof.singleHop===true,'Unbound gateway response');
      if(provider.transportPolicy){
        assert.equal(proof.destinationMode,'PINNED_CONNECT');
        assert(publicAddress(request.address)&&proof.requestedAddress===request.address,'Unpinned CONNECT destination');
        assert(!Object.hasOwn(proof,'connectedAddress')&&!Object.hasOwn(proof,'resolvedAddresses'),'Do not invent remote observations');
      }else{
        assert(Array.isArray(proof.resolvedAddresses)&&proof.resolvedAddresses.length>0&&proof.resolvedAddresses.length<=32);
        assert(proof.resolvedAddresses.every(publicAddress)&&proof.resolvedAddresses.includes(proof.connectedAddress),'Unsafe remote DNS/connection');
      }
      if(bracket){
        if(proof.continuityRef!==continuityRef||proof.bindingChanged!==false)throw new PublicNetworkError('BINDING_CHANGED');
      }else{
        assert(publicAddress(proof.exitAddress),'Missing public exit address');
        if(exitAddress&&proof.exitAddress!==exitAddress)throw new PublicNetworkError('EXIT_CHANGED');
        exitAddress??=proof.exitAddress;
      } // Pin even robots hops before independent verification; this is not yet country proof.
      assert(Buffer.isBuffer(r.body)&&r.body.length<=request.maxBytes);assert(Number.isInteger(r.status));
      if(proof.reportedCountry!=null)country(proof.reportedCountry);
      if(bracket&&proof.reportedAddress!=null)assert(publicAddress(proof.reportedAddress));
      let scanReceipt={};if(r.scriptScan){const {validateScriptScan,scriptScanDigest}=await import('./associated-structured-resources.mjs');
        assert(provider.transportPolicy&&bracket&&request.scriptScan&&request.associatedStructuredResource&&r.body.length===0&&validateScriptScan(r.scriptScan));
        assert(r.scriptScan.scriptUrl===request.url.href&&r.scriptScan.parentHash===request.scriptScan.parentHash&&r.scriptScan.parentUrl===request.scriptScan.parentUrl);
        scanReceipt={scriptScanDigest:scriptScanDigest(r.scriptScan),scannedPrefixSha256:r.scriptScan.prefixSha256,bodyBytes:r.scriptScan.bytesScanned};}
      receipts.push({...(proof.reportedCountry!=null?{reportedCountry:proof.reportedCountry}:{}),url:proof.url,bindingRef,...(provider.transportPolicy?{destinationMode:'PINNED_CONNECT',requestedAddress:proof.requestedAddress,bodyBytes:r.body.length}:{connectedAddress:proof.connectedAddress}),...(bracket?{continuityRef,bindingChanged:false,...(proof.reportedAddress?{reportedAddress:proof.reportedAddress}: {})}:{exitAddress:proof.exitAddress}),...scanReceipt,...(!r.scriptScan?{bodySha256:createHash('sha256').update(r.body).digest('hex')}:{})});
      return {status:r.status,headers:r.headers,body:r.body,...(r.scriptScan?{scriptScan:r.scriptScan}:{})};
    },
    receipts:()=>structuredClone(receipts),
    async close(){if(opened)await call(transport.close.bind(transport),context());},
    async usage(){
      if(typeof transport.usage!=='function')return provider.costClass==='FREE'?freeCost():unknownCost();
      const cost=clean(await call(transport.usage.bind(transport),context()));validateCost(cost);
      if(cost.status==='KNOWN')knownCost(cost);
      return {status:cost.status,amount:cost.amount,currency:cost.currency};
    }
  };
}
