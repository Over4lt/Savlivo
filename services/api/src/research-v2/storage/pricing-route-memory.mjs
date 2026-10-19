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
function route(row){
 if(!exact(row,['service','serviceName','url','host','role','meaning','successes','failures','lastSuccessAt','sources','propositions','countryRouteEvidenceSha256']))throw Error('PRICING_ROUTE_MEMORY_INVALID');
 const url=new URL(row.url);
 if(url.protocol!=='https:'||url.username||url.password||url.hash||url.hostname!==row.host||[...url.searchParams.keys()].some(key=>/token|secret|password|auth|session|api.?key/i.test(key))||!row.service||!row.serviceName||row.role!=='PRICING'||row.meaning!==hybridProviderResourceMemoryContract.meaning||!Number.isSafeInteger(row.successes)||row.successes<1||!Number.isSafeInteger(row.failures)||row.failures<0||!Number.isFinite(Date.parse(row.lastSuccessAt))||!Array.isArray(row.sources)||!row.sources.length||row.sources.length>8||!Array.isArray(row.propositions)||row.propositions.some(p=>!['PRICE_AMOUNT','PRICE_CURRENCY','PRICE_CADENCE','PRICE_ROLE'].includes(p))||!hash(row.countryRouteEvidenceSha256))throw Error('PRICING_ROUTE_MEMORY_INVALID');
 for(const source of row.sources)if(!exact(source,['market','observation','sha256'])||!/^([A-Z]{2})$/.test(source.market??'')||!source.observation||!hash(source.sha256))throw Error('PRICING_ROUTE_MEMORY_INVALID');
 return row;
}
function readStore(root,{services=null,verifyProofs=true}={}){
 const file=safe(root,name);if(!fs.existsSync(file))return {schema,entries:[]};
 if(fs.statSync(file).size>16_000_000)throw Error('PRICING_ROUTE_MEMORY_BOUND');
 const value=JSON.parse(stableBytes(file)),{contentHash,...payload}=value;
 if(payload.schema!==schema||contentHash!==digest(payload)||!Array.isArray(payload.entries)||payload.entries.length>10000)throw Error('PRICING_ROUTE_MEMORY_INVALID');
 for(const entry of payload.entries){
  if(!exact(entry,['route','origins'])||!Array.isArray(entry.origins)||entry.origins.length>32)throw Error('PRICING_ROUTE_MEMORY_INVALID');route(entry.route);
  for(const origin of entry.origins){
   if(!exact(origin,['jobId','checkpoint','market','sourceHash','observation','evidenceObservationId','recordedAt','acquiredAt'])||!/^[a-zA-Z0-9-]{1,100}$/.test(origin.jobId??'')||!/^([A-Z]{2})$/.test(origin.market??'')||!hash(origin.sourceHash)||!origin.observation||!Number.isFinite(Date.parse(origin.recordedAt))||!Number.isFinite(Date.parse(origin.acquiredAt))||Date.parse(origin.acquiredAt)>Date.parse(origin.recordedAt))throw Error('PRICING_ROUTE_MEMORY_INVALID');
   if(verifyProofs&&origin===entry.origins.at(-1)&&(services===null||services.includes(entry.route.service))){const proof=readObservation(root,origin.evidenceObservationId);
    if(proof.blob.sha256!==origin.sourceHash||proof.observation?.jobId!==origin.jobId||proof.observation?.market!==origin.market||proof.observation?.url!==entry.route.url||proof.observation?.truthAuthority!=='NONE')throw Error('PRICING_ROUTE_MEMORY_INVALID');}
  }
 }
 return payload;
}
export function loadPricingRouteMemory(root,{services=null}={}){
 const memory=createProviderPricingRouteMemory(),store=readStore(root,{services});
 for(const entry of store.entries){const row=structuredClone(entry.route);if(services!==null&&!services.includes(row.service))continue;memory.routes.set(row.service+'|'+row.url,row);if(!memory.byService.has(row.service))memory.byService.set(row.service,new Map());memory.byService.get(row.service).set(row.url,row);}
 return memory;
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
  const payload={schema,entries:[...entries.values()].sort((a,b)=>(a.route.service+'|'+a.route.url).localeCompare(b.route.service+'|'+b.route.url))},file=safe(root,name),pending=safe(root,name+'.pending-'+randomUUID()),bytes=canonical({...payload,contentHash:digest(payload)}),handle=fs.openSync(pending,'wx',0o600);
  try{fs.writeFileSync(handle,bytes);fs.fsyncSync(handle);}finally{fs.closeSync(handle);}
  try{fs.renameSync(pending,file);const dir=fs.openSync(root,'r');try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}}finally{if(fs.existsSync(pending))fs.unlinkSync(pending);}
  readStore(root,{verifyProofs:false});return {published};
 }finally{fs.closeSync(fd);fs.unlinkSync(lock);}
}
