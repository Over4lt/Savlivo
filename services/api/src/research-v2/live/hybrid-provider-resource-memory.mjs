// Compact routing memory for the bounded V2/V3 hybrid. It remembers where to
// reacquire current provider material; it never stores or replays Truth.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {canonical,digest,normalizeUrl} from '../../research-v3/model.mjs';
import {validatedV3ProviderAuthorityBinding} from './provider-routing-authority.mjs';
import {providerSeedCampaignState} from '../../research-v3/research-target.mjs';

export const hybridProviderResourceMemoryContract=Object.freeze({
 contractVersion:1,
 namespace:'SAVLIVO_RESEARCH_ENGINE_V1_PROVIDER_RESOURCES',
 meaning:'ROUTING_ONLY_REQUIRES_FRESH_ACQUISITION'
});
export const hybridProviderResourceRoles=Object.freeze(['PRICING','PLAN_CATALOG']);
const routes=new Set(['DIRECT','DECODO']);
const outcomes=new Set(['ACQUISITION_FAILED','INSUFFICIENT','MOVED','ACCESS_BLOCKED']);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const stable=value=>JSON.stringify(value,(_,v)=>object(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
function exact(value,keys,code){if(!object(value)||canonical(Object.keys(value).sort())!==canonical([...keys].sort()))throw Error(code);}
function publicUrl(value){const normalized=normalizeUrl(value);if(!normalized||normalized!==value)throw Error('HYBRID_RESOURCE_URL_INVALID');return normalized;}
function validTime(value){return typeof value==='string'&&Number.isFinite(Date.parse(value));}
function rootPath(root){if(typeof root!=='string'||!root)return null;return path.resolve(root);}
const storeFile=root=>path.join(root,'provider-resources.json');
const blank=()=>({contractVersion:1,namespace:hybridProviderResourceMemoryContract.namespace,meaning:hybridProviderResourceMemoryContract.meaning,resources:[]});

export function defaultHybridProviderResourceMemoryRoot(home=os.homedir()){
 return path.join(home,'.savlivo','research-engine-v1');
}

function atomic(file,value){
 fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});const pending=file+'.pending',fd=fs.openSync(pending,'w',0o600);
 try{fs.writeSync(fd,stable(value)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 fs.renameSync(pending,file);
}

function assertObservation(value){
 exact(value,['id','kind','authority','url','context','outcome','truncated','completeness','format','contentType','httpStatus','access','sha256'],'HYBRID_AUTHORITY_PROOF_INVALID');
 if(value.kind!=='CANDIDATE'||value.authority!=='UNREVIEWED_CANDIDATE'||value.outcome!=='OK'||value.truncated!==false||value.completeness!=='COMPLETE'||value.format!=='WEB'||!/^([a-f0-9]{64})$/.test(value.sha256)||publicUrl(value.url)!==value.url||!Array.isArray(value.access))throw Error('HYBRID_AUTHORITY_PROOF_INVALID');
}

function assertRecord(row){
 exact(row,['contractVersion','id','service','market','host','authority','resource','meaning'],'HYBRID_RESOURCE_RECORD_INVALID');
 exact(row.service,['id','name'],'HYBRID_RESOURCE_RECORD_INVALID');
 exact(row.authority,['provenance','binding','proof'],'HYBRID_RESOURCE_RECORD_INVALID');
 exact(row.authority.proof,['observation','bodyReference'],'HYBRID_RESOURCE_RECORD_INVALID');
 exact(row.authority.proof.bodyReference,['path','sha256'],'HYBRID_RESOURCE_RECORD_INVALID');
 exact(row.resource,['url','role','acquisitionRoute','lastUsefulAt','lastAttempt','lastOutcome','failures','nextRetryAt'],'HYBRID_RESOURCE_RECORD_INVALID');
 assertObservation(row.authority.proof.observation);
 if(row.contractVersion!==1||typeof row.id!=='string'||!row.id.startsWith('hybrid-provider-resource:')||typeof row.service.id!=='string'||!row.service.id||typeof row.service.name!=='string'||!row.service.name||!/^([A-Z]{2})$/.test(row.market)||typeof row.host!=='string'||row.authority.provenance!=='V3_AUTONOMOUS_CANDIDATE_REVIEW'||row.authority.binding?.host!==row.host||row.meaning!==hybridProviderResourceMemoryContract.meaning)throw Error('HYBRID_RESOURCE_RECORD_INVALID');
 if(!/^proofs\/[a-f0-9]{64}\.txt$/.test(row.authority.proof.bodyReference.path)||row.authority.proof.bodyReference.sha256!==row.authority.proof.observation.sha256)throw Error('HYBRID_AUTHORITY_PROOF_INVALID');
 const url=publicUrl(row.resource.url),expectedId='hybrid-provider-resource:'+digest([row.service.id,row.market,row.host,url,row.resource.role]);if(row.id!==expectedId||new URL(url).hostname!==row.host||!hybridProviderResourceRoles.includes(row.resource.role)||!routes.has(row.resource.acquisitionRoute)||!validTime(row.resource.lastUsefulAt)||row.resource.lastAttempt!==null&&!validTime(row.resource.lastAttempt)||!['USEFUL',...outcomes].includes(row.resource.lastOutcome)||!Number.isSafeInteger(row.resource.failures)||row.resource.failures<0||row.resource.nextRetryAt!==null&&!validTime(row.resource.nextRetryAt))throw Error('HYBRID_RESOURCE_RECORD_INVALID');
}

function readStore(root){
 const file=storeFile(root);if(!fs.existsSync(file))return blank();if(fs.lstatSync(file).isSymbolicLink())throw Error('HYBRID_RESOURCE_MEMORY_CORRUPT');
 const state=JSON.parse(fs.readFileSync(file,'utf8'));exact(state,['contractVersion','namespace','meaning','resources'],'HYBRID_RESOURCE_MEMORY_CORRUPT');
 if(state.contractVersion!==1||state.namespace!==hybridProviderResourceMemoryContract.namespace||state.meaning!==hybridProviderResourceMemoryContract.meaning||!Array.isArray(state.resources)||state.resources.length>512)throw Error('HYBRID_RESOURCE_MEMORY_CORRUPT');
 for(const row of state.resources)assertRecord(row);return state;
}

function proofBody(root,reference){
 const base=path.join(root,'proofs'),file=path.resolve(root,reference.path);if(!file.startsWith(base+path.sep)||!fs.existsSync(file)||fs.lstatSync(file).isSymbolicLink())throw Error('HYBRID_AUTHORITY_PROOF_INVALID');
 const body=fs.readFileSync(file,'utf8');if(digest(body)!==reference.sha256)throw Error('HYBRID_AUTHORITY_PROOF_INVALID');return body;
}

function reviewForRecord(root,target,row){
 const review={contractVersion:1,candidateObservation:{...structuredClone(row.authority.proof.observation),body:proofBody(root,row.authority.proof.bodyReference)},providerAuthorityBinding:structuredClone(row.authority.binding),reason:null};
 const binding=validatedV3ProviderAuthorityBinding(target,review);if(canonical(binding)!==canonical(row.authority.binding)||binding.host!==row.host)throw Error('HYBRID_AUTHORITY_PROOF_INVALID');return review;
}

function references(value,id,sha256,seen=new Set()){
 if(!value||typeof value!=='object'||seen.has(value))return false;seen.add(value);
 if(value.observation===id&&value.sha256===sha256)return true;
 return Object.values(value).some(child=>references(child,id,sha256,seen));
}

function writeProof(root,observation){
 const directory=path.join(root,'proofs'),relative='proofs/'+observation.sha256+'.txt',file=path.join(root,relative);fs.mkdirSync(directory,{recursive:true,mode:0o700});
 if(fs.existsSync(file)){if(fs.lstatSync(file).isSymbolicLink()||digest(fs.readFileSync(file,'utf8'))!==observation.sha256)throw Error('HYBRID_AUTHORITY_PROOF_INVALID');}
 else {const fd=fs.openSync(file,'wx',0o600);try{fs.writeSync(fd,observation.body);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
 return {path:relative,sha256:observation.sha256};
}

export function rememberHybridProviderResource({root,target,authorityReview,providerObservation,truth,catalog=null,acquisition,acquiredAt}){
 const directory=rootPath(root);if(!directory||!target||!/^([A-Z]{2})$/.test(target.market??'')||!validTime(acquiredAt)||!routes.has(acquisition?.route))throw Error('HYBRID_RESOURCE_INPUT_INVALID');
 const binding=validatedV3ProviderAuthorityBinding(target,authorityReview),observation=providerObservation,url=publicUrl(observation?.url);
 if(observation?.kind!=='PROVIDER'||observation.outcome!=='OK'||observation.truncated===true||typeof observation.body!=='string'||digest(observation.body)!==observation.sha256||new URL(url).hostname!==binding.host)throw Error('CURRENT_PROVIDER_OBSERVATION_REQUIRED');
 const priceUseful=truth?.established===true&&references(truth,observation.id,observation.sha256),catalogUseful=references(catalog,observation.id,observation.sha256);
 if(!priceUseful&&!catalogUseful)throw Error('CURRENT_PROVIDER_RESOURCE_NOT_USEFUL');
 const proof={...structuredClone(authorityReview.candidateObservation)};delete proof.body;assertObservation(proof);
 const bodyReference=writeProof(directory,authorityReview.candidateObservation),role=priceUseful?'PRICING':'PLAN_CATALOG',id='hybrid-provider-resource:'+digest([target.service,target.market,binding.host,url,role]);
 const row={contractVersion:1,id,service:{id:target.service,name:target.serviceName},market:target.market,host:binding.host,authority:{provenance:'V3_AUTONOMOUS_CANDIDATE_REVIEW',binding:structuredClone(binding),proof:{observation:proof,bodyReference}},resource:{url,role,acquisitionRoute:acquisition.route,lastUsefulAt:acquiredAt,lastAttempt:acquiredAt,lastOutcome:'USEFUL',failures:0,nextRetryAt:null},meaning:hybridProviderResourceMemoryContract.meaning};
 assertRecord(row);const state=readStore(directory),index=state.resources.findIndex(item=>item.id===id);if(index<0)state.resources.push(row);else state.resources[index]=row;state.resources.sort((a,b)=>a.id.localeCompare(b.id));atomic(storeFile(directory),state);return structuredClone(row);
}

export function loadHybridProviderResources({root,target,now}){
 const directory=rootPath(root);if(!directory||!validTime(now))return {resources:[],rejected:true,reason:'HYBRID_RESOURCE_INPUT_INVALID'};
 try{
  const state=readStore(directory),resources=[],skipped=[];
  for(const row of state.resources){
   if(row.service.id!==target.service||row.service.name!==target.serviceName||row.market!==target.market)continue;
   const review=reviewForRecord(directory,target,row);if(row.resource.nextRetryAt&&Date.parse(now)<Date.parse(row.resource.nextRetryAt)){skipped.push({id:row.id,reason:'FAILURE_BACKOFF'});continue;}
   resources.push({record:structuredClone(row),authorityReview:review});
  }
  return {resources,skipped,rejected:false,meaning:hybridProviderResourceMemoryContract.meaning};
 }catch(error){return {resources:[],skipped:[],rejected:true,reason:error.message};}
}

export function recordHybridProviderResourceFailure({root,target,resourceId,outcome,now}){
 const directory=rootPath(root);if(!directory||!outcomes.has(outcome)||!validTime(now))throw Error('HYBRID_RESOURCE_FAILURE_INVALID');const state=readStore(directory),row=state.resources.find(item=>item.id===resourceId);
 if(!row||row.service.id!==target.service||row.service.name!==target.serviceName||row.market!==target.market)throw Error('HYBRID_RESOURCE_SCOPE_MISMATCH');reviewForRecord(directory,target,row);
 if(row.resource.lastAttempt&&Date.parse(now)<Date.parse(row.resource.lastAttempt))throw Error('HYBRID_RESOURCE_FAILURE_NON_MONOTONIC');
 row.resource.failures++;row.resource.lastAttempt=now;row.resource.lastOutcome=outcome;const days=Math.min(30,2**Math.min(row.resource.failures,5));row.resource.nextRetryAt=new Date(Date.parse(now)+days*86400000).toISOString();assertRecord(row);atomic(storeFile(directory),state);return structuredClone(row);
}

// The durable hybrid records above require a V3 autonomous authority proof and
// are market scoped. Known-service PRICE_RESEARCH also uses this bounded,
// routing-only batch view. It is rebuilt from completed child checkpoints on
// resume; no prior-market observation or Truth is passed to a new target.
export function createProviderPricingRouteMemory(){return {routes:new Map(),byService:new Map()};}
const validatedPricingRouteRows=new WeakSet();
export const isValidatedPricingRouteLearning=row=>!!row&&validatedPricingRouteRows.has(row);
const validatedPricingRouteBodies=new WeakMap();
export const validatedPricingRouteBody=row=>validatedPricingRouteBodies.get(row)??null;
const pricingRouteLimit=8;
const pricingPropositions=new Set(['PRICE_AMOUNT','PRICE_CURRENCY','PRICE_CADENCE','PRICE_ROLE']);
const routeKey=(service,url)=>service+'|'+url;
const routeRows=(memory,service)=>[...(memory?.byService?.get(service)?.values()??[])];

export function learnProviderPricingRoutesFromTarget({memory,target,directory,now=new Date().toISOString()}){
 if(!memory?.routes||!target?.service||!target?.serviceName||!validTime(now))return [];
 const learned=[];
 for(const interpretation of target.providerInterpretations??[]){
  const observation=interpretation.v3Observation,truth=interpretation.v3Truth,url=normalizeUrl(observation?.url),hash=observation?.sha256;
  if(!url||!/^([a-f0-9]{64})$/.test(hash??'')||observation.kind!=='PROVIDER'||!truth||!/^([A-Z]{2})$/.test(target.market??''))continue;
  const propositions=[...new Set(Object.values(truth.prices??{}).flatMap(price=>Object.entries(price?.propositions??{}).filter(([name,value])=>pricingPropositions.has(name)&&value?.state==='ESTABLISHED'&&references(value,observation.id,hash)).map(([name])=>name)))];
  if(!propositions.length)continue;
  const host=new URL(url).hostname,decision=(target.decisions??[]).find(row=>row.eligible===true&&normalizeUrl(row.url)===normalizeUrl(interpretation.url));
  if(!decision||normalizeUrl(interpretation.url)!==url)continue;
  const directAuthority=decision.authority?.hostname===host&&decision.authority?.service===target.service&&decision.authority?.validated===true;
  const acquisition=(target.acquisitionOutcomes??[]).find(row=>row.url===decision.url&&row.runDirectory&&row.sourceHash===hash&&row.sourceClassification?.status==='PROVIDER_SOURCE'&&row.sourceClassification?.finalUrl===url&&row.sourceClassification?.sourceHash===hash&&row.countryV3Evaluation?.status==='EVALUATED'&&row.countryV3Evaluation?.sourceHash===hash&&row.countryV3Evaluation?.receiptStatus==='HASH_VERIFIED'&&row.countryV3Evaluation?.geoClass==='G1');
  const derivedCandidate=(target.derivedCountryCandidates??[]).find(row=>row.service===target.service&&row.market===target.market&&row.url===url&&/^[a-f0-9]{64}$/.test(row.providerRouteEvidenceSha256??''));
  const establishedMonthlyPrice=Object.values(truth.prices??{}).some(price=>price.established===true&&['PRICE_AMOUNT','CURRENCY','MONTHLY_CADENCE'].every(name=>price.propositions?.[name]?.state==='ESTABLISHED'&&references(price.propositions[name],observation.id,hash)));
  // Priority-phase Decodo has no Direct authority decision. Its own retained
  // body, official classification, G1 receipt and V3 result must all agree.
  const priorityAuthority=decision.acquisitionReserved===true&&decision.route==='DECODO'&&acquisition&&derivedCandidate&&truth.established===true&&establishedMonthlyPrice&&observation.context?.transport==='DECODO'&&observation.context?.networkGeography===target.market;
  if(!directAuthority&&!priorityAuthority)continue;
  const page=(target.reads??[]).find(row=>normalizeUrl(row.url)===url&&row.outcome==='OK'&&row.truncated!==true&&row.bodyHash===hash&&row.sourceIntegrity?.sha256===hash);
  let retained=false,retainedBody=null;
  if(page?.bodyFile&&directory){try{const file=path.resolve(directory,page.bodyFile);if(file.startsWith(path.resolve(directory)+path.sep)&&!fs.lstatSync(file).isSymbolicLink()){const body=fs.readFileSync(file,'utf8');retained=digest(body)===hash;if(retained)retainedBody=body;}}catch{/* Invalid retained body. */}}
  if(!retained&&priorityAuthority&&directory){try{const root=fs.realpathSync(path.resolve(directory,'acquisitions')),run=fs.realpathSync(acquisition.runDirectory),file=fs.realpathSync(path.join(run,'raw',hash+'.body'));if(run.startsWith(root+path.sep)&&file.startsWith(run+path.sep)&&fs.statSync(file).size<=8_000_000){const body=fs.readFileSync(file,'utf8');retained=digest(body)===hash;if(retained)retainedBody=body;}}catch{/* Invalid retained body. */}}
  if(!retained&&directAuthority&&interpretation.countryV3Evaluation?.status==='EVALUATED'&&interpretation.countryV3Evaluation.sourceHash===hash&&observation.context?.transport==='DECODO'&&observation.context?.networkGeography===target.market)retained=true;
  if(!retained)continue;
  const key=routeKey(target.service,url),prior=memory.routes.get(key),source={market:target.market,observation:observation.id,sha256:hash};
  const sources=[...(prior?.sources??[]).filter(row=>row.market!==source.market||row.sha256!==source.sha256),source].slice(-8);
  const row={service:target.service,serviceName:target.serviceName,url,host,role:'PRICING',meaning:hybridProviderResourceMemoryContract.meaning,successes:(prior?.successes??0)+Number(!prior?.sources?.some(row=>row.market===source.market&&row.sha256===source.sha256)),failures:prior?.failures??0,lastSuccessAt:now,sources,propositions:[...new Set([...(prior?.propositions??[]),...propositions])].sort(),...(priorityAuthority?{countryRouteEvidenceSha256:derivedCandidate.providerRouteEvidenceSha256}:{})};
  memory.routes.set(key,row);if(!memory.byService.has(target.service))memory.byService.set(target.service,new Map());memory.byService.get(target.service).set(url,row);const validated=structuredClone(row);validatedPricingRouteRows.add(validated);if(retainedBody!==null)validatedPricingRouteBodies.set(validated,Buffer.from(retainedBody));learned.push(validated);
  const serviceRows=routeRows(memory,target.service).sort((a,b)=>(b.successes-b.failures)-(a.successes-a.failures)||b.lastSuccessAt.localeCompare(a.lastSuccessAt)||a.url.localeCompare(b.url));
  for(const stale of serviceRows.slice(pricingRouteLimit)){memory.routes.delete(routeKey(stale.service,stale.url));memory.byService.get(stale.service).delete(stale.url);}
 }
 return learned;
}

export function providerPricingRoutesForTarget(memory,target){
 if(!memory?.routes||!target?.service||!target?.serviceName)return [];
 return routeRows(memory,target.service).filter(row=>row.serviceName===target.serviceName&&row.successes>0&&row.failures<row.successes+2).sort((a,b)=>(b.successes-b.failures)-(a.successes-a.failures)||b.lastSuccessAt.localeCompare(a.lastSuccessAt)||a.url.localeCompare(b.url)).flatMap(row=>{
  if(!row.countryRouteEvidenceSha256)return [structuredClone(row)];
  // A country route is reused only through this target's independently
  // supported route map. Neither the old body nor its receipt is projected.
  const candidates=(target.derivedCountryCandidates??[]).filter(candidate=>candidate.service===target.service&&candidate.market===target.market&&candidate.providerRouteEvidenceSha256===row.countryRouteEvidenceSha256&&normalizeUrl(candidate.url)&&new URL(candidate.url).hostname===row.host);
  const sourceLanguage=new URL(row.url).pathname.split('/').filter(Boolean).at(-1);
  return candidates.sort((a,b)=>Number(new URL(b.url).pathname.split('/').filter(Boolean).at(-1)===sourceLanguage)-Number(new URL(a.url).pathname.split('/').filter(Boolean).at(-1)===sourceLanguage)).slice(0,2).map(candidate=>({service:row.service,serviceName:row.serviceName,url:candidate.url,host:row.host,role:row.role,meaning:row.meaning,successes:row.successes,failures:row.failures,lastSuccessAt:row.lastSuccessAt,propositions:row.propositions,countryRouteEvidenceSha256:row.countryRouteEvidenceSha256}));
 });
}

export function prioritizeDerivedCountryCandidates(memory,target,candidates){
 const routes=routeRows(memory,target.service).filter(row=>row.serviceName===target.serviceName&&row.countryRouteEvidenceSha256&&row.successes>0&&row.failures<row.successes+2);
 const score=candidate=>Math.max(0,...routes.filter(row=>candidate.service===target.service&&candidate.market===target.market&&candidate.providerRouteEvidenceSha256===row.countryRouteEvidenceSha256&&new URL(candidate.url).hostname===row.host).map(row=>new URL(candidate.url).pathname.split('/').filter(Boolean).at(-1)===new URL(row.url).pathname.split('/').filter(Boolean).at(-1)?2:1));
 return [...candidates].sort((a,b)=>score(b)-score(a));
}

export function recordProviderPricingRouteFailure(memory,target,url){
 const normalized=normalizeUrl(url),row=normalized&&memory?.routes?.get(routeKey(target?.service,normalized));if(!row||row.serviceName!==target?.serviceName)return null;
 row.failures=Math.min(32,row.failures+1);return structuredClone(row);
}

// Phase-1 representation for routing from a source-bound ProviderBinding before
// any consumer Service exists. Persistence/replay remains deliberately outside
// this phase; the record contains no Truth and always requires fresh acquisition.
export function providerScopedRoutingRecord({researchTarget,providerAuthorityBinding,url,role='SERVICE_DISCOVERY',acquisitionRoute='DIRECT',observedAt}){
 const state=providerSeedCampaignState(researchTarget,{providerAuthorityBinding}),normalized=normalizeUrl(url);
 if(!normalized||new URL(normalized).hostname!==providerAuthorityBinding.host||role!=='SERVICE_DISCOVERY'||!routes.has(acquisitionRoute)||!validTime(observedAt))throw Error('PROVIDER_RESOURCE_SCOPE_INVALID');
 return {
  contractVersion:1,
  id:'hybrid-provider-resource:'+digest(['PROVIDER',state.researchTarget.seedName,state.researchTarget.targetMarket,providerAuthorityBinding.host,normalized,role]),
  scope:'PROVIDER',researchTarget:structuredClone(state.researchTarget),service:null,host:providerAuthorityBinding.host,
  authority:{provenance:'V3_AUTONOMOUS_CANDIDATE_REVIEW',binding:structuredClone(providerAuthorityBinding)},
  resource:{url:normalized,role,acquisitionRoute,observedAt,reacquisition:'REQUIRED'},
  marketContext:{targetMarket:state.researchTarget.targetMarket,availabilityEstablished:false},
  meaning:hybridProviderResourceMemoryContract.meaning
 };
}
