// Durable routing hints for canonical PRICE_RESEARCH. This store never holds
// provider bytes, prices, receipts or Truth, and never grants source authority.
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {canonical,digest,safe,sha,stableBytes} from './core.mjs';
import {putEvidence,readObservation} from './evidence.mjs';
import {createProviderPricingRouteMemory,hybridProviderResourceMemoryContract,isValidatedPricingRouteLearning,validatedPricingRouteBody} from '../live/hybrid-provider-resource-memory.mjs';

const schema='V2_PROVIDER_PRICING_ROUTE_MEMORY_V1',name='provider-pricing-routes-v1.json';
const hash=value=>/^[a-f0-9]{64}$/.test(value??'');
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>keys.includes(key));
const methodResults=new Set(['SUCCESS','NO_DURABLE_SUCCESS_PROOF','ACCESS_BLOCKED','TRANSPORT_FAILED','MARKET_MISMATCH']);
const methods=new Set(['DIRECT','DECODO','BROWSER']);
const boundedCount=value=>Number.isSafeInteger(value)&&value>=0?value:null;
function publicUrl(value){try{const url=new URL(value),parameters=[...url.searchParams];return url.protocol==='https:'&&!url.username&&!url.password&&!url.hash&&!/@|[a-f0-9]{32,}/i.test(url.pathname)&&parameters.every(([key,item])=>key==='pubDate'?/^\d{8}$/.test(item):key==='redirect'&&/^(true|false)$/.test(item))?url.href:null;}catch{return null;}}
export const isPublicPricingRouteUrl=value=>publicUrl(value)===value;
function methodOutcome(row){
 const keys=['id','jobId','checkpoint','service','market','url','method','result','parserStrategy','at','checkpointHash','sourceHash','usage'],usageKeys=['reads','searches','acquisitions','retainedReviews','bytes','googleRequests','strictGeminiRequests','billedCost'];
 if(!exact(row,keys)||!keys.every(key=>Object.hasOwn(row,key))||!hash(row.id)||!/^[a-f0-9-]{36}$/.test(row.jobId??'')||!/^[a-z0-9-]{1,100}$/.test(row.checkpoint??'')||!/^[a-z0-9][a-z0-9-]{0,159}$/.test(row.service??'')||!/^([A-Z]{2})$/.test(row.market??'')||publicUrl(row.url)!==row.url||!methods.has(row.method)||!methodResults.has(row.result)||![null,'NATIVE_STRUCTURED'].includes(row.parserStrategy)||!Number.isFinite(Date.parse(row.at))||!hash(row.checkpointHash)||row.sourceHash!==null&&!hash(row.sourceHash)||!exact(row.usage,usageKeys)||!usageKeys.every(key=>Object.hasOwn(row.usage,key)))throw Error('PRICING_ROUTE_METHOD_INVALID');
 for(const [key,value] of Object.entries(row.usage))if(key==='billedCost'?value!==null:value!==null&&boundedCount(value)===null)throw Error('PRICING_ROUTE_METHOD_INVALID');
 return row;
}
function route(row){
 if(!exact(row,['service','serviceName','url','host','role','meaning','successes','failures','lastSuccessAt','sources','propositions','countryRouteEvidenceSha256']))throw Error('PRICING_ROUTE_MEMORY_INVALID');
 const url=new URL(row.url);
 if(!isPublicPricingRouteUrl(row.url)||url.hostname!==row.host||!row.service||!row.serviceName||row.role!=='PRICING'||row.meaning!==hybridProviderResourceMemoryContract.meaning||!Number.isSafeInteger(row.successes)||row.successes<1||!Number.isSafeInteger(row.failures)||row.failures<0||!Number.isFinite(Date.parse(row.lastSuccessAt))||!Array.isArray(row.sources)||!row.sources.length||row.sources.length>8||!Array.isArray(row.propositions)||row.propositions.some(p=>!['PRICE_AMOUNT','PRICE_CURRENCY','PRICE_CADENCE','PRICE_ROLE'].includes(p))||!hash(row.countryRouteEvidenceSha256))throw Error('PRICING_ROUTE_MEMORY_INVALID');
 for(const source of row.sources)if(!exact(source,['market','observation','sha256'])||!/^([A-Z]{2})$/.test(source.market??'')||!source.observation||!hash(source.sha256))throw Error('PRICING_ROUTE_MEMORY_INVALID');
 return row;
}
function readStore(root,{services=null,verifyProofs=true}={}){
 const file=safe(root,name);if(!fs.existsSync(file))return {schema,entries:[],methodOutcomes:[]};
 if(fs.statSync(file).size>16_000_000)throw Error('PRICING_ROUTE_MEMORY_BOUND');
 const value=JSON.parse(stableBytes(file)),{contentHash,...payload}=value;
 if(payload.schema!==schema||contentHash!==digest(payload)||!Array.isArray(payload.entries)||payload.entries.length>10000||payload.methodOutcomes!==undefined&&(!Array.isArray(payload.methodOutcomes)||payload.methodOutcomes.length>4096))throw Error('PRICING_ROUTE_MEMORY_INVALID');
 for(const row of payload.methodOutcomes??[])methodOutcome(row);
 for(const entry of payload.entries){
  if(!exact(entry,['route','origins'])||!Array.isArray(entry.origins)||entry.origins.length>32)throw Error('PRICING_ROUTE_MEMORY_INVALID');route(entry.route);
  for(const origin of entry.origins){
   if(!exact(origin,['jobId','checkpoint','market','sourceHash','observation','evidenceObservationId','recordedAt','acquiredAt'])||!/^[a-zA-Z0-9-]{1,100}$/.test(origin.jobId??'')||!/^([A-Z]{2})$/.test(origin.market??'')||!hash(origin.sourceHash)||!origin.observation||!Number.isFinite(Date.parse(origin.recordedAt))||!Number.isFinite(Date.parse(origin.acquiredAt))||Date.parse(origin.acquiredAt)>Date.parse(origin.recordedAt))throw Error('PRICING_ROUTE_MEMORY_INVALID');
   if(verifyProofs&&origin===entry.origins.at(-1)&&(services===null||services.includes(entry.route.service))){const proof=readObservation(root,origin.evidenceObservationId);
    if(proof.blob.sha256!==origin.sourceHash||proof.observation?.jobId!==origin.jobId||proof.observation?.market!==origin.market||proof.observation?.url!==entry.route.url||proof.observation?.truthAuthority!=='NONE')throw Error('PRICING_ROUTE_MEMORY_INVALID');}
  }
 }
 return {...payload,methodOutcomes:payload.methodOutcomes??[]};
}
export function loadPricingRouteMemory(root,{services=null}={}){
 const memory=createProviderPricingRouteMemory(),store=readStore(root,{services});
 for(const entry of store.entries){const row=structuredClone(entry.route);if(services!==null&&!services.includes(row.service))continue;row.failures=0;memory.routes.set(row.service+'|'+row.url,row);if(!memory.byService.has(row.service))memory.byService.set(row.service,new Map());memory.byService.get(row.service).set(row.url,row);}
 memory.methodOutcomes=store.methodOutcomes.filter(row=>services===null||services.includes(row.service));memory.methodOutcomesByTargetUrl=new Map();for(const row of memory.methodOutcomes){const key=row.service+'|'+row.market+'|'+row.url;if(!memory.methodOutcomesByTargetUrl.has(key))memory.methodOutcomesByTargetUrl.set(key,[]);memory.methodOutcomesByTargetUrl.get(key).push(row);}return memory;
}
export function publishPricingRouteMemory(root,learned,{jobId,checkpoint,market,recordedAt,acquiredAt}){
 if(!Array.isArray(learned)||!/^[a-zA-Z0-9-]{1,100}$/.test(jobId??'')||!/^[a-z0-9-]{1,100}$/.test(checkpoint??'')||!/^([A-Z]{2})$/.test(market??'')||!Number.isFinite(Date.parse(recordedAt))||!Number.isFinite(Date.parse(acquiredAt))||Date.parse(acquiredAt)>Date.parse(recordedAt))throw Error('PRICING_ROUTE_MEMORY_INVALID');
 if(!learned.length)return {published:0};
 fs.mkdirSync(path.resolve(root),{recursive:true,mode:0o700});
 const lock=safe(root,'provider-pricing-routes-v1.lock'),fd=fs.openSync(lock,'wx',0o600);
 try{
  const store=readStore(root,{verifyProofs:false}),entries=new Map(store.entries.map(entry=>[entry.route.service+'|'+entry.route.url,entry]));let published=0;
  for(const raw of learned){if(!isValidatedPricingRouteLearning(raw))throw Error('PRICING_ROUTE_PROOF_REQUIRED');const row=route(structuredClone(raw)),key=row.service+'|'+row.url,previous=entries.get(key),origins=[...(previous?.origins??[])],body=validatedPricingRouteBody(raw);
   const current=row.sources.filter(source=>source.market===market&&body&&sha(body)===source.sha256);if(!current.length)throw Error('PRICING_ROUTE_PROOF_REQUIRED');
   for(const source of current){
    if(origins.some(item=>item.jobId===jobId&&item.checkpoint===checkpoint&&item.market===source.market&&item.sourceHash===source.sha256))continue;
    const evidenceObservationId='pricing-route-'+digest([jobId,checkpoint,market,row.url,source.sha256]).slice(0,40);
    putEvidence(root,{bytes:body,expectedHash:source.sha256,observationId:evidenceObservationId,observation:{service:row.service,market,url:row.url,jobId,checkpoint,recordedAt,acquiredAt,truthAuthority:'NONE'}});
    readObservation(root,evidenceObservationId);
    origins.push({jobId,checkpoint,market:source.market,sourceHash:source.sha256,observation:source.observation,evidenceObservationId,recordedAt,acquiredAt});
   }
   entries.set(key,{route:row,origins:origins.slice(-32)});published++;
  }
  if(entries.size>10000)throw Error('PRICING_ROUTE_MEMORY_BOUND');
  const payload={schema,entries:[...entries.values()].sort((a,b)=>(a.route.service+'|'+a.route.url).localeCompare(b.route.service+'|'+b.route.url)),methodOutcomes:store.methodOutcomes},file=safe(root,name),pending=safe(root,name+'.pending-'+randomUUID()),bytes=canonical({...payload,contentHash:digest(payload)}),handle=fs.openSync(pending,'wx',0o600);
  try{fs.writeFileSync(handle,bytes);fs.fsyncSync(handle);}finally{fs.closeSync(handle);}
  try{fs.renameSync(pending,file);const dir=fs.openSync(root,'r');try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}}finally{if(fs.existsSync(pending))fs.unlinkSync(pending);}
  readStore(root,{verifyProofs:false});return {published};
 }finally{fs.closeSync(fd);fs.unlinkSync(lock);}
}

// These are operational observations, not provider facts. Checkpoint bytes are
// hashed before extraction; no snippets, query text, prices or receipts enter
// the durable index. Unknown billed costs remain null.
export function publishPricingMethodOutcomes(root,{jobId,checkpoint,service,market,recordedAt,checkpointFile,result=null,confirmedSuccessUrls=[],confirmedSuccessMethods={}}){
 if(!/^[a-f0-9-]{36}$/.test(jobId??'')||!/^[a-z0-9-]{1,100}$/.test(checkpoint??'')||!/^[a-z0-9][a-z0-9-]{0,159}$/.test(service??'')||!/^([A-Z]{2})$/.test(market??'')||!Number.isFinite(Date.parse(recordedAt))||path.basename(checkpointFile??'')!=='adaptive-state.json')throw Error('PRICING_ROUTE_METHOD_INVALID');
 const stateBytes=stableBytes(checkpointFile);if(stateBytes.length>32_000_000)throw Error('PRICING_ROUTE_METHOD_BOUND');
 const state=JSON.parse(stateBytes),target=state.targets?.[`price-research:${service}:${market}`];if(target?.service!==service||target.market!==market)throw Error('PRICING_ROUTE_METHOD_INVALID');
 const usage=state.services?.[service]?.used??{},targetResult=result?.targets?.find(row=>row.target?.service===service&&row.target?.market===market),counts={reads:boundedCount(usage.reads),searches:boundedCount(usage.searches),acquisitions:boundedCount(usage.acquisitions),retainedReviews:boundedCount(usage.retainedReviews),bytes:boundedCount(usage.bytes),googleRequests:boundedCount(targetResult?.googleRequests),strictGeminiRequests:boundedCount(targetResult?.strictGeminiRequests),billedCost:null};
 const proven=confirmedSuccessUrls.length?readStore(root,{services:[service]}):null;
 const learnedUrls=new Set(confirmedSuccessUrls);
 const observations=[];
 for(const confirmed of confirmedSuccessUrls){const url=publicUrl(confirmed);if(!url)continue;
  const interpretation=(target.providerInterpretations??[]).find(row=>row.url===url&&row.v3Truth?.established===true),observation=interpretation?.v3Observation,sourceHash=hash(observation?.sha256)?observation.sha256:null;
  if(!sourceHash)continue;
  if(!proven.entries.some(entry=>entry.route.service===service&&entry.route.url===url&&entry.origins.some(origin=>origin.jobId===jobId&&origin.checkpoint===checkpoint&&origin.market===market&&origin.sourceHash===sourceHash)))continue;
  const acquiredBy=confirmedSuccessMethods[url],method=acquiredBy==='APPROVED_PROXY'?'DECODO':acquiredBy==='BROWSER'?'BROWSER':acquiredBy==='DIRECT'?'DIRECT':null;
  if(!method)continue;
  observations.push(methodOutcome({id:digest([jobId,checkpoint,service,market,url,method,'SUCCESS',sourceHash]),jobId,checkpoint,service,market,url,method,result:'SUCCESS',parserStrategy:(observation.nativeStructuredFacts??0)>0?'NATIVE_STRUCTURED':null,at:recordedAt,checkpointHash:sha(stateBytes),sourceHash,usage:counts}));
 }
 const candidates=[...(target.leads??[]).filter(row=>row.learnedProviderPricingRoute===true),...(target.derivedCountryCandidates??[]).filter(row=>row.service===service&&row.market===market&&hash(row.providerRouteEvidenceSha256))];
 for(const lead of candidates.slice(0,16)){const url=publicUrl(lead.url);if(!url||learnedUrls.has(url))continue;
  const read=(target.reads??[]).findLast(row=>row.requestedUrl===url);if(!read)continue;
  const result=read.outcome==='ACCESS_CONTROL_STOP'?'ACCESS_BLOCKED':read.outcome==='OK'?'NO_DURABLE_SUCCESS_PROOF':'TRANSPORT_FAILED',sourceHash=hash(read.bodyHash)?read.bodyHash:null;
  const row={id:digest([jobId,checkpoint,service,market,url,'DIRECT',result,sourceHash]),jobId,checkpoint,service,market,url,method:'DIRECT',result,parserStrategy:null,at:recordedAt,checkpointHash:sha(stateBytes),sourceHash,usage:counts};observations.push(methodOutcome(row));
 }
 for(const lead of candidates.slice(0,16)){const url=publicUrl(lead.url);if(!url||learnedUrls.has(url))continue;
  const acquisition=(target.acquisitionOutcomes??[]).findLast(row=>row.url===url&&row.transport==='DECODO');if(!acquisition)continue;
  const result=acquisition.classification==='MARKET_MISMATCH'?'MARKET_MISMATCH':acquisition.classification==='ACCESS_BLOCKED'?'ACCESS_BLOCKED':acquisition.classification==='TRANSPORT_FAILED'?'TRANSPORT_FAILED':'NO_DURABLE_SUCCESS_PROOF',sourceHash=hash(acquisition.sourceHash)?acquisition.sourceHash:null;
  const row={id:digest([jobId,checkpoint,service,market,url,'DECODO',result,sourceHash]),jobId,checkpoint,service,market,url,method:'DECODO',result,parserStrategy:null,at:recordedAt,checkpointHash:sha(stateBytes),sourceHash,usage:counts};observations.push(methodOutcome(row));
 }
 const unique=[...new Map(observations.map(row=>[row.id,row])).values()];
 if(!unique.length)return {published:0};
 fs.mkdirSync(path.resolve(root),{recursive:true,mode:0o700});const lock=safe(root,'provider-pricing-routes-v1.lock'),fd=fs.openSync(lock,'wx',0o600);
 try{const store=readStore(root,{verifyProofs:false}),old=new Map(store.methodOutcomes.map(row=>[row.id,row]));for(const row of unique)if(!old.has(row.id))old.set(row.id,row);
  const payload={schema,entries:store.entries,methodOutcomes:[...old.values()].sort((a,b)=>a.at.localeCompare(b.at)||a.id.localeCompare(b.id)).slice(-4096)},file=safe(root,name),pending=safe(root,name+'.pending-'+randomUUID()),bytes=canonical({...payload,contentHash:digest(payload)}),handle=fs.openSync(pending,'wx',0o600);
  try{fs.writeFileSync(handle,bytes);fs.fsyncSync(handle);}finally{fs.closeSync(handle);}
  try{fs.renameSync(pending,file);const dir=fs.openSync(root,'r');try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}}finally{if(fs.existsSync(pending))fs.unlinkSync(pending);}
  readStore(root,{verifyProofs:false});return {published:unique.length};
 }finally{fs.closeSync(fd);fs.unlinkSync(lock);}
}
