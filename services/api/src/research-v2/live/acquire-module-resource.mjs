import fs from 'node:fs';
import {runLive} from './runner.mjs';
import {moduleResourceAdapterFactory} from './module-resource-adapter.mjs';
import {createGeoEscalation} from '../../../../../docs/catalog/global-47/research-v1/geo-escalation.mjs';
import {iterateMarketRunRecords} from '../../research-v1/market-run-store.mjs';
// Host callback; transport and configuration must come from the established provider.
// Caller reserves execution first. All actual transport requests and bytes are charged.
export function createModuleAcquirer({runtime,bundle,root,event=()=>{},resolveHost}){return async ({target,url,reference,authority,maxBytes,budget})=>{
 const allowed=new Set([url,new URL('/robots.txt',url).href,bundle.verifier.url,new URL('/robots.txt',bundle.verifier.url).href]);
 const wrapped={...bundle,transport:{...bundle.transport,async request(r){if(!allowed.has(r.url.href))throw Error('RESOURCE_SCOPE_STOP');budget.request('module',r.maxBytes);event('REQUEST_STARTED',{target:target.id,url:r.url.href});let bytes=0;try{const response=await bundle.transport.request({...r,onBodyBytes:n=>{bytes+=n;budget.traffic('module',n);r.onBodyBytes?.(n);}});if(!bytes)budget.traffic('module',response.body.length);return response;}finally{budget.settled();event('REQUEST_FINISHED',{url:r.url.href,observedBytes:bytes});}}}};
 const run=await runLive({inventory:[{...target,urls:[url],moduleReference:reference}],root,maxRetries:0,dependencies:{...(resolveHost?{resolveHost}:{}),loadConfig:async()=>runtime,providerFactory:()=>wrapped,interpret:async()=>{},engineFactory:opts=>createGeoEscalation({...opts,limits:{...opts.limits,reads:8,networkRequests:12},robotsAdapterFactory:moduleResourceAdapterFactory(url,maxBytes)})}});
 const records=[...iterateMarketRunRecords(run.directory+'/journal')],result=records.findLast(r=>r.type==='V2_ACQUISITION_RESULT')?.payload.result;
 const attempt=result?.attempts?.at(-1),receipt=records.findLast(r=>r.type==='RESPONSE_CAPTURED'&&r.payload.url===url&&r.payload.status===200)?.payload;
 event('RESOURCE_RESULT',{target:target.id,url,directory:run.directory,failure:attempt?.failure??null,policy:attempt?.transportVerification?.accessAdmission??null,reservation:attempt?.authorization??null});
 const restriction=attempt?.failure==='ACCESS_POLICY_STOP'||attempt?.reads?.some(r=>r.httpStatus===403||r.outcome==='ACCESS_CONTROL_STOP');
 if(!receipt||result?.outcome!=='OBSERVED')return {complete:false,policyAllowed:!restriction,restriction,receipt:{runDirectory:run.directory},failure:attempt?.failure};
 return {url,code:fs.readFileSync(run.directory+'/'+receipt.bodyFile,'utf8'),sha256:receipt.bodyHash,complete:true,policyAllowed:true,geoVerified:attempt.transportVerification?.level==='BRACKET_VERIFIED',receipt:{runDirectory:run.directory,record:receipt,transportVerification:attempt.transportVerification},contentType:receipt.contentType};
};}
