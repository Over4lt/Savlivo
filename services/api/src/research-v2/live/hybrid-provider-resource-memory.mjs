// Compact routing memory for the bounded V2/V3 hybrid. It remembers where to
// reacquire current provider material; it never stores or replays Truth.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {canonical,digest,normalizeUrl} from '../../research-v3/model.mjs';
import {providerRoutingAuthority,validatedV3ProviderAuthorityBinding} from './provider-routing-authority.mjs';
import {providerSeedCampaignState} from '../../research-v3/research-target.mjs';
import {interpretSubscriptionPage,validExtractionRecipe} from '../../research-v3/subscription-page.mjs';
import {readBrowserPricingRouteEvidence} from './browser-pricing-route-evidence.mjs';
import {providerMarketSelectorRoute} from './retained-render-source.mjs';
import {canonicalReviewedProviderRoot} from '../../research-v3/reviewed-provider-namespaces.mjs';

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
export function createProviderPricingRouteMemory(){return {routes:new Map(),byService:new Map(),methodOutcomes:[],provenMethods:[],provenMethodsByService:new Map(),sharedMethodBank:new Map()};}
// This is a projection of independently proven successes, never a source or
// market authority. The durable V1 method outcomes remain the only index.
export function rememberProvenPricingMethod(memory,item){
 if(!['DIRECT','DECODO','BROWSER'].includes(item?.method)||!item?.service||!item?.id)return;
 memory.sharedMethodBank??=new Map();const parserStrategy=item.parserStrategy??null,key=item.method+'|'+(parserStrategy??'NONE');
 const row=memory.sharedMethodBank.get(key)??{method:item.method,parserStrategy,successes:new Map(),recentFailures:0};
 row.successes.set(item.id,{service:item.service,market:item.market,at:item.at,usage:item.usage??null});memory.sharedMethodBank.set(key,row);
}
const validatedPricingRouteRows=new WeakSet();
const validatedPricingRouteSeals=new WeakMap();
export const isValidatedPricingRouteLearning=row=>!!row&&validatedPricingRouteRows.has(row)&&validatedPricingRouteSeals.get(row)===canonical({...row,lastSuccessAt:null});
const validatedPricingRouteBodies=new WeakMap();
export const validatedPricingRouteBody=row=>validatedPricingRouteBodies.get(row)??null;
// The durable store is bounded separately. Keep distinct, proven routes in the
// live batch view instead of evicting one successful method with another.
const pricingRouteLimit=32;
const pricingPropositions=new Set(['PRICE_AMOUNT','PRICE_CURRENCY','PRICE_CADENCE','PRICE_ROLE']);
const routeKey=(service,url)=>service+'|'+url;
const routeRows=(memory,service)=>[...(memory?.byService?.get(service)?.values()??[])];
function recentMethodPenalty(memory,service,market,url,now=Date.now()){
 const relevant=memory?.methodOutcomesByTargetUrl?.get(service+'|'+market+'|'+url)??(memory?.methodOutcomes??[]).filter(row=>row.service===service&&row.market===market&&row.url===url);
 const rows=relevant.filter(row=>Date.parse(row.at)<=now&&now-Date.parse(row.at)<=7*86400000).sort((a,b)=>a.at.localeCompare(b.at));
 const lastSuccess=rows.findLastIndex(row=>row.result==='SUCCESS');
 return Math.min(2,rows.slice(lastSuccess+1).filter(row=>row.result!=='SUCCESS').length);
}

export function learnProviderPricingRoutesFromTarget({memory,target,directory,now=new Date().toISOString()}){
 if(!memory?.routes||!target?.service||!target?.serviceName||!validTime(now))return [];
 const learned=[];
 for(const interpretation of target.providerInterpretations??[]){
  const observation=interpretation.v3Observation,truth=interpretation.v3Truth,url=normalizeUrl(observation?.url),hash=observation?.sha256;
  if(!url||!/^([a-f0-9]{64})$/.test(hash??'')||observation.kind!=='PROVIDER'||!truth||!/^([A-Z]{2})$/.test(target.market??''))continue;
  const propositions=[...new Set(Object.values(truth.prices??{}).flatMap(price=>Object.entries(price?.propositions??{}).filter(([name,value])=>pricingPropositions.has(name)&&value?.state==='ESTABLISHED'&&references(value,observation.id,hash)).map(([name])=>name)))];
  if(!propositions.length)continue;
  const host=new URL(url).hostname,decision=(target.decisions??[]).find(row=>row.eligible===true&&normalizeUrl(row.url)===normalizeUrl(interpretation.url));
  if(!decision||interpretation.renderedAcquisition!==true&&normalizeUrl(interpretation.url)!==url)continue;
  const directAuthority=decision.authority?.hostname===host&&decision.authority?.service===target.service&&decision.authority?.validated===true;
  const acquisition=(target.acquisitionOutcomes??[]).find(row=>row.url===decision.url&&row.runDirectory&&row.sourceHash===hash&&row.sourceClassification?.status==='PROVIDER_SOURCE'&&row.sourceClassification?.finalUrl===url&&row.sourceClassification?.sourceHash===hash&&row.countryV3Evaluation?.status==='EVALUATED'&&row.countryV3Evaluation?.sourceHash===hash&&row.countryV3Evaluation?.receiptStatus==='HASH_VERIFIED'&&row.countryV3Evaluation?.geoClass==='G1');
  const derivedCandidate=(target.derivedCountryCandidates??[]).find(row=>row.service===target.service&&row.market===target.market&&row.url===url&&/^[a-f0-9]{64}$/.test(row.providerRouteEvidenceSha256??''));
  const establishedMonthlyPrice=Object.values(truth.prices??{}).some(price=>price.established===true&&['PRICE_AMOUNT','CURRENCY','MONTHLY_CADENCE'].every(name=>price.propositions?.[name]?.state==='ESTABLISHED'&&references(price.propositions[name],observation.id,hash)));
  // Priority-phase Decodo has no Direct authority decision. Its own retained
  // body, official classification, G1 receipt and V3 result must all agree.
  const priorityAuthority=decision.acquisitionReserved===true&&decision.route==='DECODO'&&acquisition&&derivedCandidate&&truth.established===true&&establishedMonthlyPrice&&observation.context?.transport==='DECODO'&&observation.context?.networkGeography===target.market;
  let browserEvidence=null;
  if(interpretation.renderedAcquisition===true&&truth.established===true&&establishedMonthlyPrice&&directory){
   try{browserEvidence=readBrowserPricingRouteEvidence({directory,target,interpretation});}catch{/* A Browser result without complete retained proof cannot teach a route. */}
  }
  if(interpretation.renderedAcquisition===true&&!browserEvidence)continue;
  if(!directAuthority&&!priorityAuthority&&!browserEvidence)continue;
  const page=(target.reads??[]).find(row=>normalizeUrl(row.url)===url&&row.outcome==='OK'&&row.truncated!==true&&row.bodyHash===hash&&row.sourceIntegrity?.sha256===hash);
  let retained=false,retainedBody=null;
  if(page?.bodyFile&&directory){try{const file=path.resolve(directory,page.bodyFile);if(file.startsWith(path.resolve(directory)+path.sep)&&!fs.lstatSync(file).isSymbolicLink()){const body=fs.readFileSync(file,'utf8');retained=digest(body)===hash;if(retained)retainedBody=body;}}catch{/* Invalid retained body. */}}
  if(acquisition&&directory&&!retainedBody){try{const root=fs.realpathSync(path.resolve(directory,'acquisitions')),run=fs.realpathSync(acquisition.runDirectory),file=fs.realpathSync(path.join(run,'raw',hash+'.body'));if(run.startsWith(root+path.sep)&&file.startsWith(run+path.sep)&&fs.statSync(file).size<=8_000_000){const body=fs.readFileSync(file,'utf8');if(digest(body)===hash){retained=true;retainedBody=body;}}}catch{/* Invalid retained body. */}}
  if(browserEvidence){retained=true;retainedBody=browserEvidence.body;}
  if(!retained&&directAuthority&&interpretation.countryV3Evaluation?.status==='EVALUATED'&&interpretation.countryV3Evaluation.sourceHash===hash&&observation.context?.transport==='DECODO'&&observation.context?.networkGeography===target.market)retained=true;
  if(!retained)continue;
  const trace=observation.extractionTrace,currency=truth.prices?.[target.market]?.propositions?.CURRENCY?.evidence?.find(row=>references(row,observation.id,hash))?.value;
  const replayTrace={};
  if(retainedBody&&typeof currency==='string')interpretSubscriptionPage({body:retainedBody,url,providerName:target.serviceName,marketCurrencyHint:currency,extractionTrace:replayTrace});
  const decodoTraceProof=observation.context?.transport==='DECODO'&&trace?.acquisitionMethod==='DECODO'&&trace?.marketEvidence?.kind==='G1_BRACKET_VERIFIED'&&trace.marketEvidence.requestedCountry===target.market&&trace.marketEvidence.verifiedCountry===target.market&&trace.marketEvidence.sourceHash===hash;
  const selectorTraceProof=observation.context?.transport==='DIRECT'&&trace?.acquisitionMethod==='PROVIDER_SELECTED_MARKET'&&trace?.marketEvidence?.kind==='PROVIDER_SELECTED_MARKET'&&trace.marketEvidence.sourceHash===hash&&establishedMonthlyPrice;
  const recipe=trace?.sourceUrl===url&&trace?.sourceHash===hash&&trace?.market===target.market&&(decodoTraceProof||selectorTraceProof)&&validExtractionRecipe(trace.recipe)&&canonical(trace.recipe)===canonical(replayTrace.recipe)?structuredClone(trace.recipe):null;
  const key=routeKey(target.service,url),prior=memory.routes.get(key),source={market:target.market,observation:observation.id,sha256:hash,...(recipe?{extractionRecipe:recipe}:{})};
  const sources=[...(prior?.sources??[]).filter(row=>row.market!==source.market||row.sha256!==source.sha256),source].slice(-8);
  const row={service:target.service,serviceName:target.serviceName,url,host,role:'PRICING',meaning:hybridProviderResourceMemoryContract.meaning,successes:(prior?.successes??0)+Number(!prior?.sources?.some(row=>row.market===source.market&&row.sha256===source.sha256)),failures:prior?.failures??0,lastSuccessAt:now,sources,propositions:[...new Set([...(prior?.propositions??[]),...propositions])].sort(),...(priorityAuthority?{countryRouteEvidenceSha256:derivedCandidate.providerRouteEvidenceSha256}:{})};
  memory.routes.set(key,row);if(!memory.byService.has(target.service))memory.byService.set(target.service,new Map());memory.byService.get(target.service).set(url,row);const validated=structuredClone(row);validatedPricingRouteRows.add(validated);validatedPricingRouteSeals.set(validated,canonical({...validated,lastSuccessAt:null}));if(retainedBody!==null)validatedPricingRouteBodies.set(validated,Buffer.from(retainedBody));learned.push(validated);
  const method=browserEvidence?'BROWSER':observation.context?.transport==='DECODO'?'DECODO':directAuthority?'DIRECT':null;
  if(method&&retainedBody!==null&&truth.established===true&&establishedMonthlyPrice){memory.provenMethods??=[];memory.provenMethodsByService??=new Map();const id=[target.service,target.market,url,hash,method].join('|'),serviceMethods=memory.provenMethodsByService.get(target.service)??[];if(!serviceMethods.some(item=>item.id===id)){const item={id,service:target.service,market:target.market,url,sourceHash:hash,method,parserStrategy:recipe?recipe.rule+'_V1':null,at:now};memory.provenMethods.push(item);serviceMethods.push(item);memory.provenMethodsByService.set(target.service,serviceMethods);rememberProvenPricingMethod(memory,item);}}
  const serviceRows=routeRows(memory,target.service).sort((a,b)=>(b.successes-b.failures)-(a.successes-a.failures)||b.lastSuccessAt.localeCompare(a.lastSuccessAt)||a.url.localeCompare(b.url));
  for(const stale of serviceRows.slice(pricingRouteLimit)){memory.routes.delete(routeKey(stale.service,stale.url));memory.byService.get(stale.service).delete(stale.url);}
 }
 return learned;
}

export function providerPricingRoutesForTarget(memory,target){
 if(!memory?.routes||!target?.service||!target?.serviceName)return [];
 return routeRows(memory,target.service).filter(row=>row.serviceName===target.serviceName&&row.successes>0&&row.failures<row.successes+2).sort((a,b)=>(b.successes-b.failures-recentMethodPenalty(memory,b.service,target.market,b.url))-(a.successes-a.failures-recentMethodPenalty(memory,a.service,target.market,a.url))||b.lastSuccessAt.localeCompare(a.lastSuccessAt)||a.url.localeCompare(b.url)).flatMap(row=>{
  // Recipes are parsing hints, scoped to this canonical service and checked
  // again against the newly acquired document by the current parser.
  const recipe=[...(row.sources??[])].reverse().sort((a,b)=>Number(b.market===target.market)-Number(a.market===target.market)).find(source=>validExtractionRecipe(source.extractionRecipe))?.extractionRecipe;
  if(!row.countryRouteEvidenceSha256)return [{...structuredClone(row),learningSourceUrl:row.url,...(recipe?{extractionRecipe:structuredClone(recipe)}:{})}];
  // A country route is reused only through this target's independently
  // supported route map. Neither the old body nor its receipt is projected.
  const candidates=(target.derivedCountryCandidates??[]).filter(candidate=>candidate.service===target.service&&candidate.market===target.market&&candidate.providerRouteEvidenceSha256===row.countryRouteEvidenceSha256&&normalizeUrl(candidate.url)&&new URL(candidate.url).hostname===row.host);
  const sourceLanguage=new URL(row.url).pathname.split('/').filter(Boolean).at(-1);
  return candidates.sort((a,b)=>recentMethodPenalty(memory,row.service,target.market,a.url)-recentMethodPenalty(memory,row.service,target.market,b.url)||Number(new URL(b.url).pathname.split('/').filter(Boolean).at(-1)===sourceLanguage)-Number(new URL(a.url).pathname.split('/').filter(Boolean).at(-1)===sourceLanguage)).slice(0,2).map(candidate=>({service:row.service,serviceName:row.serviceName,url:candidate.url,learningSourceUrl:row.url,host:row.host,role:row.role,meaning:row.meaning,successes:row.successes,failures:row.failures,lastSuccessAt:row.lastSuccessAt,propositions:row.propositions,countryRouteEvidenceSha256:row.countryRouteEvidenceSha256,...(recipe?{extractionRecipe:structuredClone(recipe)}:{})}));
 });
}

// A strategy is an acquisition hint only. Its source success is joined to a
// proven route; the new market still needs its own acquisition and V3 proof.
function targetOwnedMethodCandidates(target){
 const candidates=new Map(),add=(url,kind,relevance,link=null)=>{const normalized=normalizeUrl(url);if(!normalized)return;const parsed=new URL(normalized);if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.hash)return;const prior=candidates.get(normalized);if(!prior||relevance>prior.relevance)candidates.set(normalized,{url:normalized,kind,relevance,link});};
 for(const row of target.derivedCountryCandidates??[])if(row.service===target.service&&row.market===target.market&&/^[a-f0-9]{64}$/.test(row.providerRouteEvidenceSha256??''))add(row.url,'TARGET_MARKET_ROUTE',3);
 for(const link of target.researchLinks??[])if(link.enabled===true&&link.truthAuthority==='NONE'&&(link.marketScope==='GLOBAL'||link.marketScope==='MARKET_SPECIFIC'&&link.marketCode===target.market))add(link.url,link.marketScope==='MARKET_SPECIFIC'?'TARGET_MARKET_RESEARCH_LINK':'TARGET_GLOBAL_RESEARCH_LINK',link.marketScope==='MARKET_SPECIFIC'?3:2,link);
 for(const url of target.knownCommercialUrls??[])if(providerRoutingAuthority(target,url))add(url,'TARGET_OFFICIAL_COMMERCIAL_URL',2);
 for(const binding of target.reviewedProviderNamespaces??[]){const root=canonicalReviewedProviderRoot(binding);if(root&&providerRoutingAuthority(target,root.url))add(root.url,'TARGET_REVIEWED_PROVIDER_ROOT',1);}
 return [...candidates.values()].sort((a,b)=>b.relevance-a.relevance||a.url.localeCompare(b.url)).slice(0,8);
}
export function providerPricingStrategiesForTarget(memory,target){
 if(!memory?.provenMethods||!target?.service||!target?.market)return [];
 const serviceMethods=memory.provenMethodsByService?.get(target.service)??memory.provenMethods.filter(item=>item.service===target.service);
 const routes=providerPricingRoutesForTarget(memory,target),strategies=[];
 for(const route of routes){
  const sourceUrl=route.learningSourceUrl??route.url;
  if(!route.countryRouteEvidenceSha256&&route.url!==sourceUrl)continue;
  const globalRoute=(target.researchLinks??[]).some(link=>link.enabled&&link.marketScope==='GLOBAL'&&link.url===route.url);
  if(!route.countryRouteEvidenceSha256&&!route.sources?.some(source=>source.market===target.market)&&!globalRoute)continue;
  const methods=serviceMethods.filter(item=>item.url===sourceUrl&&(route.countryRouteEvidenceSha256||globalRoute||item.market===target.market));
  for(const method of methods){
   if(method.method==='BROWSER'&&!(target.researchLinks??[]).some(link=>link.enabled&&link.url===route.url)&&method.market!==target.market)continue;
   const sameMarket=method.market===target.market,penalty=recentMethodPenalty(memory,target.service,target.market,route.url),cost={DIRECT:1,DECODO:3,BROWSER:5}[method.method];
   strategies.push({id:digest([target.service,target.market,route.url,method.method,sourceUrl]),service:target.service,market:target.market,url:route.url,method:method.method,sourceMarket:method.market,sourceUrl,priorityTier:sameMarket?1:2,compatibilityReason:sameMarket?'SAME_SERVICE_MARKET_PROVEN':'SAME_SERVICE_ROUTE_DERIVED',score:route.successes*10-penalty*4-cost,meaning:hybridProviderResourceMemoryContract.meaning});
  }
 }
 for(const candidate of targetOwnedMethodCandidates(target))for(const profile of memory.sharedMethodBank?.values()??[]){
  const proven=[...profile.successes.values()].filter(row=>row.service!==target.service),services=[...new Set(proven.map(row=>row.service))].sort();if(!services.length)continue;
  if(profile.method==='BROWSER'&&!(candidate.link&&target.capabilities?.browser===true&&(providerMarketSelectorRoute(candidate.link)&&target.capabilities?.direct===true||target.capabilities?.decodo===true)))continue;
  if(profile.method==='DECODO'&&(candidate.kind==='TARGET_REVIEWED_PROVIDER_ROOT'||target.capabilities?.decodo===false))continue;
  if(profile.method==='DIRECT'&&target.capabilities?.direct===false)continue;
  const cost={DIRECT:1,DECODO:3,BROWSER:5}[profile.method],usage=proven.map(row=>row.usage?.acquisitions).filter(Number.isSafeInteger),averageAcquisitions=usage.length?usage.reduce((sum,value)=>sum+value,0)/usage.length:cost;
  strategies.push({id:digest([target.service,target.market,candidate.url,profile.method,profile.parserStrategy]),service:target.service,market:target.market,url:candidate.url,method:profile.method,sourceServices:services.slice(0,8),parserStrategy:profile.parserStrategy,priorityTier:3,compatibilityReason:candidate.kind,score:Math.min(100,proven.length*10)+services.length*5+candidate.relevance*2-Math.min(2,profile.recentFailures)*4-averageAcquisitions-cost,meaning:hybridProviderResourceMemoryContract.meaning});
 }
 const ranked=strategies.sort((a,b)=>a.priorityTier-b.priorityTier||b.score-a.score||a.url.localeCompare(b.url)||a.method.localeCompare(b.method)),unique=new Map();
 for(const row of ranked){const key=row.method+'|'+row.url;if(!unique.has(key))unique.set(key,row);}
 const distinct=[...unique.values()];
 // Keep room for a transferable fallback when many service-owned routes are
 // present but unavailable in this run. The durable index retains every proof.
 return [...distinct.filter(row=>row.priorityTier<3).slice(0,12),...distinct.filter(row=>row.priorityTier===3).slice(0,4)];
}

export function prioritizeDerivedCountryCandidates(memory,target,candidates){
 const routes=routeRows(memory,target.service).filter(row=>row.serviceName===target.serviceName&&row.countryRouteEvidenceSha256&&row.successes>0&&row.failures<row.successes+2);
 const score=candidate=>Math.max(0,...routes.filter(row=>candidate.service===target.service&&candidate.market===target.market&&candidate.providerRouteEvidenceSha256===row.countryRouteEvidenceSha256&&new URL(candidate.url).hostname===row.host).map(row=>new URL(candidate.url).pathname.split('/').filter(Boolean).at(-1)===new URL(row.url).pathname.split('/').filter(Boolean).at(-1)?2:1))-recentMethodPenalty(memory,target.service,target.market,candidate.url);
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
