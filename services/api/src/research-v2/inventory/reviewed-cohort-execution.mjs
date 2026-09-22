import {resolveCapabilities,requireCapability} from '../capabilities/config.mjs';
import {capabilityLedger} from '../capabilities/ledger.mjs';
import {enrichProvider} from '../capabilities/enrichment.mjs';
import {claimLeases,releaseLeases} from '../../v2-operations/leases.mjs';
import {validateLifecycleSnapshot,lifecycleSeed,evaluateProviderCandidate,writeLifecycleDisposition,writeLifecycleReviewQueue,lifecycleBudgets} from './lifecycle-continuation.mjs';
// Reuses the mature adaptive controller, public reader and verifier boundaries.
import fs from 'node:fs';import path from 'node:path';
import {countryCurrencyData} from '../../../../../packages/contracts/src/markets.ts';
import {runAdaptiveCampaign} from './adaptive-campaign.mjs';
import {atomic} from './expansion-campaign.mjs';
import {createResearchMemory,combineResearchMemory} from '../live/research-memory.mjs';
import {providerNavigation} from '../live/provider-navigation.mjs';
import {inspectLoginManage,mergeTargetCapabilities} from '../intelligence/login-manage.mjs';
import {extractClaimProposals,verifyClaim} from '../../research-v1/claim-verification.mjs';
import {interpretDirectProvider} from '../live/direct-provider-evidence.mjs';
import {retainedPriceReview} from '../live/open-web-discovery.mjs';
import {loadProviderSourceRegistry} from '../live/provider-source-registry.mjs';
import {officialCandidate} from '../live/online-discovery.mjs';
import {createV2RobotsPublicAdapter} from '../live/robots-policy.mjs';
import {createTavilyDiscovery} from '../live/tavily-discovery.mjs';
import {loadDecodoRuntimeConfig} from '../../research-v1/decodo-runtime-config.mjs';
import {createDecodoProvider} from '../../../../../docs/catalog/global-47/research-v1/decodo-adapter.mjs';
import {runLive} from '../live/runner.mjs';
import {createTavilySearch} from '../live/tavily-search.mjs';
import {digest,json,runDirectory} from './new-service-controller.mjs';
import {admitRetained,additionalRequestLimit} from './reviewed-cohort-handoff.mjs';
const supported=new Set(countryCurrencyData.map(([m])=>m));
export const nativeLimits=Object.freeze({reads:4,searches:2,acquisitions:2,retainedReviews:32,turns:512});
export function priceTargets(targets,researchMarkets,ids){
 if(!researchMarkets||typeof researchMarkets!=='object'||Array.isArray(researchMarkets)||Object.keys(researchMarkets).some(id=>!ids.includes(id)))throw Error('HANDOFF_MARKET_SCOPE');
 for(const values of Object.values(researchMarkets))if(!Array.isArray(values)||new Set(values).size!==values.length||values.some(m=>!supported.has(m)))throw Error('HANDOFF_MARKET_SCOPE');
 return targets.flatMap(t=>(researchMarkets[t.service]??[]).map(m=>({...t,id:t.service+'-price-'+m,market:m,researchObjective:'SERVICE_COVERAGE',gaps:['plan','amount','currency','cadence','priceRole','ownership','market'],marketApplicabilityEstablished:false,currency:null,scopeBasis:'OPERATOR_RESEARCH_HYPOTHESIS_NOT_AVAILABILITY'})));
}
export function continuationLocation(handoff,researchMarkets,candidateRound=false,reconciliation=null,continuation=null,lifecycle=null){
 const code=['provider-review-input.mjs','reviewed-cohort-execution.mjs','reviewed-cohort-handoff.mjs','native-authority-evidence.mjs','provider-authority-bootstrap.mjs','adaptive-campaign.mjs'].map(f=>digest(fs.readFileSync(new URL(f,import.meta.url))));
 const fingerprint=digest({input:handoff.inputHashes,review:handoff.document,researchMarkets,candidateRound,reconciliation,continuation,lifecycle:lifecycle?[lifecycle.key,lifecycle.snapshotHash]:null,code,limits:nativeLimits});
 return {fingerprint,directory:(lifecycle?(handoff.config?.runsRoot??'.savlivo/research-v2/universe-expansion/runs')+'/mature-lifecycle-':'.savlivo/research-v2/universe-expansion/runs/v15-mature-continuation-')+fingerprint.slice(0,16)};
}
export function cancellationReview(target,page){
 if(!supported.has(target.market))return {status:'REVIEW_REQUIRED',reason:'MARKET_CONTEXT_REQUIRED_BY_EXISTING_CLAIM_VERIFIER',decisions:[]};
 const task={id:target.id,canonicalSlug:target.service,serviceName:target.serviceName,countryCode:target.market},marketName=new Intl.DisplayNames(['en'],{type:'region'}).of(target.market);
 const decisions=extractClaimProposals(task,page,marketName).filter(o=>['cancelWeb','billingRoutes'].includes(o.fact)).map(observation=>({observation,verification:verifyClaim({task,page,observation,at:new Date().toISOString(),marketName,providerHosts:target.authorities.map(a=>a.hostname)})}));
 return {status:decisions.some(d=>d.verification.accepted)?'VERIFIED':'UNRESOLVED',decisions};
}
export async function replayTarget({target,directory,sourceDirectory,registry,interpret=interpretDirectProvider,quarantine=[]}) {
 fs.mkdirSync(directory,{recursive:true});const resultFile=directory+'/retained-replay.json';if(fs.existsSync(resultFile))return json(resultFile);
 const pages=json(sourceDirectory+'/pages.json'),accepted=[],rejected=[],t=structuredClone(target);t.leads=[];
 for(const p of pages){const admission=admitRetained({target:t,page:p,directory:sourceDirectory,registry});if(!admission.accepted){rejected.push({url:p.url,reason:admission.reason});continue;}
  const page=admission.page;fs.mkdirSync(directory+'/bodies',{recursive:true});fs.copyFileSync(sourceDirectory+'/'+page.bodyFile,directory+'/'+page.bodyFile);accepted.push(page);
  const body=fs.readFileSync(directory+'/'+page.bodyFile,'utf8');
  const proof=inspectLoginManage({body,sourceHash:page.bodyHash,url:page.url,service:t.service,provider:t.serviceName,market:t.market,authorityEstablished:true,reference:{path:directory+'/'+page.bodyFile,hash:page.bodyHash}});
  if(t.researchObjective==='CATALOG_ONLY')mergeTargetCapabilities(t,proof);
  for(const link of providerNavigation(t,body,page.url,{maxBytes:2097152,depth:0}).links)t.leads.push({...link,title:link.label,rank:0,from:{url:page.url,bodyHash:page.bodyHash}});
  if(t.researchObjective!=='CATALOG_ONLY'){
   // Normal V2 journal/interpretation, never a synthetic result or regenerated acquisition.
   const key=digest([page.bodyHash,t.market]),record=directory+'/price-'+key+'.json',pending=record+'.dispatched';
   let price;
   if(fs.existsSync(record))price=json(record);
   else{if(fs.existsSync(pending))throw Error('HANDOFF_RETAINED_INTERPRETATION_RECONCILIATION_REQUIRED');fs.writeFileSync(pending,'reserved',{flag:'wx'});price=await interpret({target:t,page,directory});atomic(record,price);fs.unlinkSync(pending);}
   t.verified??=[];t.verified.push(...price.verified??[]);applyPriceQuarantine(t,quarantine);const retained=retainedPriceReview(price.runDirectory,t);if(retained)t.retainedPriceReview=retained;
  }
 }
 // Old network usage remains in lineage; memory suppresses repeated attempted provider routes.
 t.researchMemory=createResearchMemory({...t,reads:pages,queries:[]},{path:sourceDirectory+'/pages.json',hash:digest(fs.readFileSync(sourceDirectory+'/pages.json'))});
 t.leads=[...new Map([...t.leads,...t.urls.map(url=>({url,title:t.serviceName,rank:0}))].map(l=>[l.url,l])).values()];
 atomic(directory+'/pages.json',accepted);
 const cancellation=accepted.map(p=>({url:p.url,...cancellationReview(t,p)}));
 const result={target:t,rejected,accepted:accepted.length,cancellation,executionComplete:true,researchComplete:false,completionMeaning:'RETAINED_REPLAY_NOT_SERVICE_QUALIFICATION',networkCalls:0};atomic(resultFile,result);return result;
}
export async function runNativeTargets({directory,targets,retainedStates=[],createAdapters,offline=true,shouldStop=()=>false,onTransition=()=>{},isolateFailures=false,evidenceUpdates=[]}){
 if(!targets.length)return {complete:true,completionMeaning:'NO_AUTHORITY_READY_TARGETS',targets:{}};
 // One existing adaptive action per turn permits safe operator stop between native checkpoints.
 let state;do{state=await runAdaptiveCampaign({directory,manifest:{targets,conditionalFollowupTargets:[]},retainedStates,limits:nativeLimits,createAdapters,stopBeforeNetwork:offline,maxActions:offline?Infinity:1,onTransition,isolateFailures,evidenceUpdates});}while(!offline&&!state.complete&&!shouldStop());
 return state;
}
export async function executeHandoff({handoff,researchMarkets,directory,mode='plan',key,shouldStop=()=>false,candidateRound=false,reconciliation=null,continuation=null,lifecycle=null}) {
 const capabilities=resolveCapabilities(handoff.config?.capabilities);
 if(!['plan','replay','live'].includes(mode))throw Error('HANDOFF_MODE');
 if(lifecycle){validateLifecycleSnapshot(lifecycle);if(candidateRound||continuation||reconciliation)throw Error('HANDOFF_LIFECYCLE_MODE');}
 const continuationState=continuation?validateReviewedContinuation(handoff,researchMarkets,continuation):null;
 if(continuation&&(candidateRound||reconciliation))throw Error('HANDOFF_CONTINUATION_MODE');
 const lifecycleBudget=lifecycle?lifecycleBudgets(handoff,additionalRequestLimit):null;
 const reconciliationState=reconciliation?validateRetainedReconciliation(handoff,reconciliation):null;
 if(reconciliation&&mode!=='replay')throw Error('HANDOFF_RECONCILIATION_OFFLINE_ONLY');
 const selected=reconciliation?handoff.targets.filter(t=>reconciliation.services.includes(t.service)):handoff.targets;
 for(const target of selected)target.capabilities=capabilities;
 let prices=priceTargets(selected,researchMarkets,handoff.cohort.manifest.serviceIds);
 if(mode==='live'&&!candidateRound&&!continuation&&!lifecycle&&(handoff.targets.length!==188||new Set(prices.map(t=>t.service)).size!==188))throw Error('HANDOFF_FULL_COHORT_REVIEW_OR_SCOPE_REQUIRED');
 const location=continuationLocation(handoff,researchMarkets,candidateRound,reconciliation,continuation,lifecycle);if(directory!==location.directory)throw Error('HANDOFF_OUTPUT_SCOPE');
 const parent=path.dirname(directory);fs.mkdirSync(parent,{recursive:true});
 for(const name of fs.readdirSync(parent)){const other=path.join(parent,name);if((name.startsWith('v15-mature-continuation-')||name.startsWith('mature-lifecycle-'))&&other!==directory&&(!lifecycle||!fs.existsSync(other+'/lineage.json')||digest(json(other+'/lineage.json').cohort)===digest(handoff.cohort.manifest.serviceIds))&&fs.existsSync(other+'/network.jsonl')&&fs.statSync(other+'/network.jsonl').size>0&&other!==reconciliationState?.parentDirectory&&!continuationState?.parents.includes(other)&&!lifecycle?.parents.some(p=>p.directory===other))throw Error('HANDOFF_PREVIOUS_CONTINUATION_RECONCILIATION_REQUIRED');}
 let cursor=process.cwd();for(const part of directory.split('/')){cursor=path.join(cursor,part);if(fs.existsSync(cursor)&&fs.lstatSync(cursor).isSymbolicLink())throw Error('HANDOFF_SYMLINK_OUTPUT');}
 fs.mkdirSync(directory,{recursive:true});const lock=directory+'/handoff.lock';
 if(fs.existsSync(lock)){const pid=Number(fs.readFileSync(lock));if(!Number.isInteger(pid)||pid<1)throw Error('HANDOFF_LOCK');try{process.kill(pid,0);throw Error('HANDOFF_ACTIVE');}catch(e){if(e.code!=='ESRCH')throw e;}fs.unlinkSync(lock);}fs.writeFileSync(lock,String(process.pid),{flag:'wx'});
 let cohortLeases=[];try{
 if(lifecycle)cohortLeases=claimLeases([path.join(parent,'cohort-'+digest(handoff.cohort.manifest.serviceIds).slice(0,16)+'.lock')]);
 const lineage={capabilities,fingerprint:location.fingerprint,cohort:handoff.cohort.manifest.serviceIds,inputHashes:handoff.inputHashes,historicalRequests:handoff.summary.historicalRequests,historicalSearches:handoff.summary.historicalSearches,historicalReads:handoff.summary.historicalReads,previousRun:runDirectory,review:handoff.document,researchMarkets,candidateRound,reconciliation,continuation,lifecycle:lifecycle?{key:lifecycle.key,parents:lifecycle.parents,inputHashes:lifecycle.inputHashes}:null,parentRequests:lifecycle?.parentRequests??continuationState?.parentRequests??reconciliationState?.parentRequests??0,additionalRequestCeiling:reconciliation?0:lifecycle?lifecycleBudget.total:continuation?selected.length*additionalRequestLimit:188*additionalRequestLimit};
 if(fs.existsSync(directory+'/lineage.json')&&json(directory+'/lineage.json').fingerprint!==lineage.fingerprint)throw Error('HANDOFF_LINEAGE_CHANGED');if(!fs.existsSync(directory+'/lineage.json'))atomic(directory+'/lineage.json',lineage);
 const ledgerFile=directory+'/network.jsonl',events=fs.existsSync(ledgerFile)?fs.readFileSync(ledgerFile,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[],used=new Map();
 for(const e of events)used.set(e.service,(used.get(e.service)??0)+1);
 const charge=(service,kind)=>{if(!(continuation?selected.map(t=>t.service):lineage.cohort).includes(service)||events.length>=lineage.additionalRequestCeiling||(used.get(service)??0)>=(lifecycleBudget?.byService[service]??additionalRequestLimit))throw Error('HANDOFF_REQUEST_BOUND');const e={service,kind,at:new Date().toISOString()};const fd=fs.openSync(ledgerFile,'a',0o600);try{fs.writeSync(fd,JSON.stringify(e)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}events.push(e);used.set(service,(used.get(service)??0)+1);};
 const observe=(phase,event,state=null)=>{if(!lifecycle)return;const record={at:new Date().toISOString(),phase,event,wave:phase==='catalog'?1:phase==='pricing'?2:phase==='feedback'?3:null,turn:state?.turn??null,service:state?.pending?.targetId?state.targets?.[state.pending.targetId]?.service??null:null,requestsConsumed:events.length,requestsRemaining:Math.max(0,lineage.additionalRequestCeiling-events.length)};atomic(directory+'/lifecycle-progress.json',record);fs.appendFileSync(directory+'/lifecycle-events.jsonl',JSON.stringify(record)+'\n');};
 observe('bootstrap','LIFECYCLE_STARTED');
 const stopped=()=>shouldStop()||(lifecycle&&events.length>=lineage.additionalRequestCeiling);
 const capabilityState=mode==='live'?capabilityLedger(directory,capabilities,{model:capabilities.groq?process.env.SAVLIVO_PRICE_SEMANTIC_MODEL:null}):null;
 const searches=new Map();const registry=loadProviderSourceRegistry({targets:handoff.targets});
 let runtime,bundle;
 if(mode==='live'&&capabilities.decodo){
  runtime=await loadDecodoRuntimeConfig({env:process.env});bundle=createDecodoProvider({env:runtime});
  if(!bundle.provider.ready||!bundle.provider.configured||!bundle.verifier.approved)throw Error('HANDOFF_DECODO_CONFIGURATION_NOT_READY');
 }
 const enrich=async(args,result)=>mode!=='live'?result:await enrichProvider({...args,capabilities,ledger:capabilityState,result,charge,verify:interpretDirectProvider,readResource:async({url,kind,maxBytes,signal,onBytes})=>{requireCapability(capabilities,'direct');return createV2RobotsPublicAdapter({authorities:args.target.authorities,retainRaw:true,maxReads:1,maxRequests:4,network:{maxBytes,timeoutMs:15000,maxRedirects:0,retainRuntimeCors:true,onBodyBytes:onBytes,...(kind==='SCRIPT'?{scriptUrls:[url]}:{structuredJsonUrls:[url]})}}).read({url,maxRedirects:0,signal,onBytes,consumeNetwork:k=>charge(args.target.service,k)});}});
 const adapters=async({directory:nativeDirectory,targets})=>{
  // Reuse the mature direct-access proof and gated geo fallback unchanged.
  const fallback=mode==='live'&&capabilities.decodo?(await createTavilyDiscovery({inventory:targets,readKeychain:async()=>key,bounds:nativeLimits,coveredServices:[],searchEnabled:capabilities.tavily})).bind({dir:nativeDirectory,runtime,bundle:{...bundle,transport:{...bundle.transport,request:async r=>{charge(targets[0].service,'DECODO');return bundle.transport.request(r);}}},runLive,dependencies:{}}):null;
  return {
  search:async args=>{requireCapability(capabilities,'tavily');if(mode!=='live')throw Error('OFFLINE_NETWORK_FORBIDDEN');let search=searches.get(args.target.service);if(!search){search=await createTavilySearch({readKeychain:async()=>key,maxCalls:4});searches.set(args.target.service,search);}charge(args.target.service,'DISCOVERY');return search(args);},
  read:async({url,target})=>{requireCapability(capabilities,'direct');if(mode!=='live')throw Error('OFFLINE_NETWORK_FORBIDDEN');const reader=createV2RobotsPublicAdapter({authorities:target.authorities,retainRaw:true,maxLinks:80,maxReads:1,maxRequests:4,network:{timeoutMs:15000,maxBytes:2097152,maxRedirects:1}});const page=await reader.read({url,targetCountry:target.market,maxRedirects:1,consumeNetwork:k=>charge(target.service,k)});if(page.outcome==='OK'&&page.authority?.status==='CONFIGURED_REVIEWED'){if(lifecycle)fs.appendFileSync(nativeDirectory+'/field-review.jsonl',JSON.stringify({service:target.service,...matureFieldReview(target,page)})+'\n');fs.appendFileSync(nativeDirectory+'/cancellation-review.jsonl',JSON.stringify({service:target.service,url:page.url,...cancellationReview(target,page)})+'\n');}return page;},
  classify:async({target,page})=>officialCandidate(target,{url:page.url??page.requestedUrl,label:'consumer subscription account pricing'},registry.domains),
  consumeProvider:async args=>{let result=await (fallback?.consumeProvider??interpretDirectProvider)(args);result=await enrich(args,result);return filterQuarantinedResult(args.target,result,lifecycle?.quarantine??continuationState?.quarantine??[]);},
  ...(fallback?{acquire:async args=>{requireCapability(capabilities,'decodo');return filterQuarantinedResult(args.target,await fallback.acquire(args),lifecycle?.quarantine??continuationState?.quarantine??[]);}}:{})
 };};
 const bootstrap=[];
 if(candidateRound||lifecycle){
  for(const row of handoff.rows){
   if(stopped())break;
   const reviewed=handoff.targets.some(t=>t.service===row.service),candidate=row.providerReview.selectedCandidate;
   const dest=directory+'/bootstrap/'+row.service;const resultFile=dest+'/result.json';
   if(fs.existsSync(resultFile)){bootstrap.push(json(resultFile));continue;}
   const result={service:row.service,candidateUrl:candidate?.url??null,status:reviewed?'REVIEWED_NATIVE_PATH':candidate?'PENDING_ACQUISITION':'UNRESOLVED_IDENTITY',authorityPromoted:false,researchComplete:false};
   if(lifecycle&&!reviewed){const retained=lifecycle.sources[row.service]?.filter(s=>s.page.url===candidate?.url||s.page.requestedUrl===candidate?.url).at(-1);if(retained){Object.assign(result,{status:'HUMAN_REVIEW_REQUIRED',reason:'EXPLICIT_OWNERSHIP_REVIEW_REQUIRED',retainedSource:retained});fs.mkdirSync(dest,{recursive:true});atomic(resultFile,result);bootstrap.push(result);continue;}}
   if(mode!=='live'){bootstrap.push(result);continue;}
   fs.mkdirSync(dest,{recursive:true});
   if(!reviewed&&candidate&&!capabilities.direct){result.status='UNRESOLVED';result.reason='CAPABILITY_DISABLED_DIRECT';}
   if(!reviewed&&candidate&&capabilities.direct){
    const pending=dest+'/dispatched.json';
    if(fs.existsSync(pending)){result.status='INTERRUPTED_REVIEW_REQUIRED';result.reason='Prior dispatch preserved; no automatic repeated acquisition';}
    else{
     atomic(pending,{url:candidate.url,at:new Date().toISOString()});
     try{
      // Existing public reader accepts discovery sources without granting ownership.
      const reader=createV2RobotsPublicAdapter({authorities:[],retainRaw:true,maxLinks:80,maxReads:1,maxRequests:4,network:{timeoutMs:15000,maxBytes:2097152,maxRedirects:1}});
      const page=await reader.read({url:candidate.url,targetCountry:researchMarkets[row.service]?.[0]??null,maxRedirects:1,consumeNetwork:k=>charge(row.service,k)});
      if(page.rawSource){const body=page.rawSource.text;page.bodyHash=digest(body);page.bodyFile='bodies/'+page.bodyHash+'.txt';fs.mkdirSync(dest+'/bodies',{recursive:true});fs.writeFileSync(dest+'/'+page.bodyFile,body);delete page.rawSource;}
      atomic(dest+'/pages.json',[page]);if(lifecycle)Object.assign(result,{authorityEvaluation:evaluateProviderCandidate({service:row.service,page,targets:handoff.targets}),evidence:{path:dest+'/pages.json',sha256:digest(fs.readFileSync(dest+'/pages.json')),pageIndex:0,sourceUrl:page.url,bodyHash:page.bodyHash}});result.status=page.outcome==='OK'?'REVIEW_REQUIRED':'UNRESOLVED';result.outcome=page.outcome;result.sourceType=page.sourceType;result.authority=page.authority;result.reason='Candidate acquisition is not reviewed provider ownership';if(lifecycle)result.status='HUMAN_REVIEW_REQUIRED';
     }catch{result.status='FAILED';result.reason='Candidate acquisition failed; reservation and ledger retained';}
    }
   }
   atomic(resultFile,result);bootstrap.push(result);
  }
  atomic(directory+'/bootstrap-summary.json',{cohort:handoff.cohort.manifest.serviceIds.length,services:bootstrap,online:mode==='live',authorityPromoted:false});
 }
 if(lifecycle)writeLifecycleReviewQueue(directory,handoff,bootstrap);
 if(reconciliationState)atomic(directory+'/reconciled-pricing-projection.json',reconciliationState.pricingProjection);
 const phases={};for(const phase of ['catalog','pricing']){
  const targets=phase==='catalog'?selected:prices;
  const retained=[];
  for(const target of targets){if(stopped())break;const dest=directory+'/replay/'+target.id;
   if(lifecycle){
    const seedFile=dest+'/lifecycle-seed.json';if(fs.existsSync(seedFile)){retained.push(json(seedFile));continue;}
    const seed=lifecycleSeed(target,lifecycle);applyPriceQuarantine(seed,lifecycle.quarantine??[]);
    const material=[...(lifecycle.sources[target.service]??[])];
    // Pages acquired by catalog research flow to market/pricing in this same run.
    if(phase==='pricing'&&phases.catalog?.targets){const ct=Object.values(phases.catalog.targets).find(t=>t.service===target.service);if(ct)for(const page of ct.reads??[])material.push({directory:directory+'/catalog/targets/'+ct.id+'/open-web-discovery',page});}
    const unique=[...new Map(material.map(x=>[x.page.bodyHash+'|'+x.page.url,x])).values()].reverse().filter(x=>admitRetained({target:seed,page:x.page,directory:x.directory,registry}).accepted).slice(0,nativeLimits.retainedReviews);
    fs.mkdirSync(dest+'/input/bodies',{recursive:true});const pages=[];for(const x of unique){fs.copyFileSync(x.directory+'/'+x.page.bodyFile,dest+'/input/'+x.page.bodyFile);pages.push(x.page);}atomic(dest+'/input/pages.json',pages);
    // Reinterpret price under current generic safety rules before reusing old sufficiency.
    if(phase==='pricing'){seed.priorVerifiedRequiringCurrentSafetyReview=seed.verified??[];seed.verified=[];delete seed.retainedPriceReview;}
    let replay;try{replay=await replayTarget({target:seed,directory:dest+'/evidence',sourceDirectory:dest+'/input',registry,interpret:async args=>enrich(args,await interpretDirectProvider(args)),quarantine:lifecycle.quarantine??[]});}catch(error){if(/HASH|AUTHORITY|POLICY/.test(error.message))throw error;seed.executionBlocked='RETAINED_INTERPRETATION_REVIEW_REQUIRED';seed.retainedFailure={reason:seed.executionBlocked,artifact:dest+'/evidence',rawEvidencePreserved:true};replay={target:seed};}

    replay.target.leads=[...new Map([...(seed.leads??[]),...(replay.target.leads??[])].map(l=>[l.url,l])).values()];
    replay.target.researchMemory=combineResearchMemory(replay.target,[seed.researchMemory,replay.target.researchMemory].filter(Boolean));
    for(const page of pages){const review=matureFieldReview(target,page);fs.mkdirSync(directory+'/'+phase,{recursive:true});fs.appendFileSync(directory+'/'+phase+'/field-review.jsonl',JSON.stringify({service:target.service,...review,source:dest+'/input/pages.json'})+'\n');}
    atomic(seedFile,replay.target);retained.push(replay.target);continue;
   }
   if(continuationState){retained.push(continuationState.targets[target.id]);continue;}
   if(mode==='plan'){if(fs.existsSync(dest+'/retained-replay.json'))retained.push(json(dest+'/retained-replay.json').target);continue;}
   retained.push((await replayTarget({target,directory:dest,sourceDirectory:reconciliation?.sources[target.service]??runDirectory+'/services/'+target.service,registry,quarantine:reconciliationState?.quarantine??[]})).target);
  }
  if(stopped())break;
  phases[phase]=await runNativeTargets({directory:directory+(mode==='plan'?'/plan/':'/')+phase,targets,retainedStates:retained,createAdapters:adapters,offline:mode!=='live',shouldStop:stopped,isolateFailures:!!lifecycle,onTransition:(event,state)=>{observe(phase,event,state);console.log(JSON.stringify({phase,event}));}});
  if(lifecycle)writeLifecycleDisposition({directory,handoff,phases,events,bootstrap,researchMarkets,executionComplete:false});
  if(lifecycle&&phase==='catalog'){
   for(const row of lifecycleFieldReviews(directory+'/catalog'))for(const d of row.decisions??[])if(d.verification.accepted&&d.observation.fact==='availability'&&d.observation.value==='AVAILABLE'&&supported.has(d.market))researchMarkets[row.service]=[...new Set([...(researchMarkets[row.service]??[]),d.market])];
   prices=priceTargets(selected,researchMarkets,handoff.cohort.manifest.serviceIds);
  }
 }
 if(lifecycle&&phases.pricing&&!stopped()){
  const updates=[];for(const priced of Object.values(phases.pricing.targets??{})){const target=selected.find(t=>t.service===priced.service);if(!target)continue;const source=directory+'/pricing/targets/'+priced.id+'/open-web-discovery';
   for(const page of priced.reads??[]){const admission=admitRetained({target,page,directory:source,registry});if(!admission.accepted)continue;const body=fs.readFileSync(source+'/'+page.bodyFile,'utf8');
    const proof=inspectLoginManage({body,sourceHash:page.bodyHash,url:page.url,service:target.service,provider:target.serviceName,market:target.market,authorityEstablished:true,reference:{path:source+'/'+page.bodyFile,hash:page.bodyHash}});
    updates.push({targetId:target.id,proofs:[proof],leads:providerNavigation(target,body,page.url,{maxBytes:2097152,depth:0}).links.map(l=>({...l,title:l.label,rank:0})),reference:{path:source+'/'+page.bodyFile,hash:page.bodyHash}});
   }
  }
  if(updates.length){const retained=selected.map(t=>json(directory+'/replay/'+t.id+'/lifecycle-seed.json'));phases.catalog=await runNativeTargets({directory:directory+(mode==='plan'?'/plan/':'/')+'catalog',targets:selected,retainedStates:retained,createAdapters:adapters,offline:mode!=='live',shouldStop:stopped,isolateFailures:true,evidenceUpdates:updates,onTransition:(event,state)=>observe('feedback',event,state)});}
 }
 observe('final',shouldStop()?'STOP_REQUESTED':events.length>=lineage.additionalRequestCeiling?'BUDGET_EXHAUSTED':'EXECUTION_TERMINAL');
 if(lifecycle)writeLifecycleDisposition({directory,handoff,phases,events,bootstrap,researchMarkets,executionComplete:Object.values(phases).every(s=>s.complete)&&!shouldStop()});
 const summary={cohort:handoff.cohort.manifest.serviceIds.length,baselineExcluded:handoff.summary.baselineExcluded,candidateRound,bootstrapServices:bootstrap.length,reviewed:handoff.targets.length,reviewRequired:handoff.cohort.manifest.serviceIds.length-handoff.targets.length,pricingScopedServices:new Set(prices.map(t=>t.service)).size,historicalRequests:lineage.historicalRequests,additionalRequests:events.length,lineageRequests:lineage.historicalRequests+(lineage.parentRequests??0)+events.length,reconciledParentRequests:lineage.parentRequests??0,replayedServices:selected.length,executionComplete:Object.values(phases).every(s=>s.complete),researchComplete:false,completionMeaning:'NATIVE_SCHEDULER_TERMINAL_NOT_FULL_RESEARCH',productionPromoted:false,phases:Object.fromEntries(Object.entries(phases).map(([k,v])=>[k,{complete:v.complete,completionMeaning:v.completionMeaning,services:v.services??{}}]))};atomic(directory+(mode==='plan'?'/plan-summary.json':'/summary.json'),summary);return summary;
 }finally{releaseLeases(cohortLeases,process.pid);fs.unlinkSync(lock);}
}

export function applyPriceQuarantine(target,entries){
 const matches=v=>entries.find(e=>e.service===target.service&&e.market===target.market&&e.monthlyPlanId===v.monthlyPlanId&&e.amount===v.amount&&e.currency===v.currency&&JSON.stringify([...e.sourceHashes].sort())===JSON.stringify([...(v.sourceHashes??[])].sort()));
 const rejected=(target.verified??[]).filter(matches);target.verified=(target.verified??[]).filter(v=>!matches(v));
 if(rejected.length){target.quarantinedVerified=[...(target.quarantinedVerified??[]),...rejected.map(v=>({value:v,decision:matches(v)}))];target.researchComplete=false;delete target.retainedPriceReview;}
 return rejected.length;
}
export function validateRetainedReconciliation(handoff,r){
 if(r.schemaVersion!==1||r.mode!=='OFFLINE_REPLAY_ONLY'||r.historicalRequests!==handoff.summary.historicalRequests||!Array.isArray(r.services)||!r.services.length||new Set(r.services).size!==r.services.length||r.services.some(id=>!handoff.targets.some(t=>t.service===id))||Object.keys(r.sources??{}).length!==r.services.length)throw Error('HANDOFF_RECONCILIATION_SCOPE');
 const parent=r.parentDirectory;
 if(typeof parent!=='string'||!/^\.savlivo\/research-v2\/universe-expansion\/runs\/v15-mature-continuation-[a-f0-9]{16}$/.test(parent))throw Error('HANDOFF_RECONCILIATION_PARENT');
 const required=[parent+'/network.jsonl',parent+'/lineage.json',parent+'/summary.json',parent+'/catalog/adaptive-state.json',parent+'/pricing/adaptive-state.json',r.quarantineFile];
 for(const id of r.services){if(r.sources[id]!==parent+'/bootstrap/'+id)throw Error('HANDOFF_RECONCILIATION_SOURCE');required.push(r.sources[id]+'/pages.json');const pages=json(r.sources[id]+'/pages.json');for(const p of pages){if(!/^bodies\/[a-f0-9]{64}\.txt$/.test(p.bodyFile??''))throw Error('HANDOFF_RECONCILIATION_BODY');required.push(r.sources[id]+'/'+p.bodyFile);}}
 for(const f of required){if(!r.inputHashes?.[f]||!fs.realpathSync(f).startsWith(process.cwd()+path.sep)||digest(fs.readFileSync(f))!==r.inputHashes[f])throw Error('HANDOFF_RECONCILIATION_HASH');}
 const source=json(parent+'/lineage.json'),summary=json(parent+'/summary.json'),events=fs.readFileSync(parent+'/network.jsonl','utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
 if(source.fingerprint!==r.parentFingerprint||JSON.stringify(source.cohort)!==JSON.stringify(handoff.cohort.manifest.serviceIds)||events.length!==r.parentRequests||summary.additionalRequests!==events.length||!summary.executionComplete||events.some(e=>!source.cohort.includes(e.service))||json(parent+'/catalog/adaptive-state.json').pending||json(parent+'/pricing/adaptive-state.json').pending)throw Error('HANDOFF_RECONCILIATION_ACCOUNTING');
 const quarantine=json(r.quarantineFile).entries,pricing=json(parent+'/pricing/adaptive-state.json');let removed=0;
 for(const e of quarantine){if(e.status!=='REJECTED_INVALID_PRICE_INTERPRETATION'||e.source!==parent+'/pricing/adaptive-state.json'||e.sourceHash!==r.inputHashes[e.source]||!pricing.targets[e.target]?.verified.some(v=>digest(v)===digest(e.originalVerified)))throw Error('HANDOFF_QUARANTINE_PROOF');}
 for(const t of Object.values(pricing.targets)){removed+=applyPriceQuarantine(t,quarantine);delete t.historicalSchedulerTerminal;delete t.adaptiveExecution;}
 if(removed!==quarantine.length)throw Error('HANDOFF_QUARANTINE_MATCH');
 return {parentDirectory:parent,parentRequests:events.length,quarantine,pricingProjection:{source:parent+'/pricing/adaptive-state.json',sourceHash:r.inputHashes[parent+'/pricing/adaptive-state.json'],meaning:'OFFLINE_RECONCILED_EVIDENCE_NOT_SCHEDULER_CHECKPOINT',quarantined:removed,productionPromoted:false,targets:pricing.targets}};
}

// Explicit immutable handoff to the same adaptive runner; no authority promotion.
export function filterQuarantinedResult(target,result,entries){
 const copy={...result},projection={...target,verified:copy.verified??[]};
 if(applyPriceQuarantine(projection,entries)){copy.verified=projection.verified;copy.quarantinedVerified=projection.quarantinedVerified;copy.quarantinedRunDirectory=copy.runDirectory;copy.runDirectory=null;}
 return copy;
}
export function validateReviewedContinuation(handoff,researchMarkets,c){
 if(c.schemaVersion!==1||c.mode!=='REVIEWED_ONLINE_CONTINUATION'||c.services.length!==104||new Set(c.services).size!==104||JSON.stringify([...c.services].sort())!==JSON.stringify(handoff.targets.map(t=>t.service).sort())||c.historicalRequests!==3838||c.parentRequests!==721)throw Error('HANDOFF_CONTINUATION_SCOPE');
 const r=json(c.reconciliationFile),reconciled=validateRetainedReconciliation(handoff,r);
 const expected=[...handoff.targets,...priceTargets(handoff.targets,researchMarkets,handoff.cohort.manifest.serviceIds)];
 const required=[c.reconciliationFile,c.derivedDirectory+'/summary.json',c.derivedDirectory+'/lineage.json',c.derivedDirectory+'/catalog/adaptive-state.json',c.derivedDirectory+'/pricing/adaptive-state.json',reconciled.parentDirectory+'/catalog/adaptive-state.json',reconciled.parentDirectory+'/pricing/adaptive-state.json',c.statesFile];
 for(const f of required){if(!c.inputHashes?.[f]||!fs.realpathSync(f).startsWith(process.cwd()+path.sep)||digest(fs.readFileSync(f))!==c.inputHashes[f])throw Error('HANDOFF_CONTINUATION_HASH');}
 const derived=json(c.derivedDirectory+'/summary.json');if(derived.additionalRequests!==0||derived.reconciledParentRequests!==721||!derived.executionComplete)throw Error('HANDOFF_CONTINUATION_PARENT');
 const states=json(c.statesFile);if(Object.keys(states).length!==expected.length)throw Error('HANDOFF_CONTINUATION_TARGETS');
 for(const target of expected){const t=states[target.id];if(!t||t.service!==target.service||t.market!==target.market||digest(t.authorities)!==digest(target.authorities)||t.researchObjective!==target.researchObjective)throw Error('HANDOFF_CONTINUATION_AUTHORITY');applyPriceQuarantine(t,reconciled.quarantine);}
 return {targets:states,parents:[reconciled.parentDirectory],parentRequests:721,quarantine:reconciled.quarantine};
}

export function matureFieldReview(target,page){
 const markets=supported.has(target.market)?[target.market]:[...supported],decisions=[];
 for(const market of markets){const task={id:target.id,canonicalSlug:target.service,serviceName:target.serviceName,countryCode:market},marketName=new Intl.DisplayNames(['en'],{type:'region'}).of(market);
 for(const observation of extractClaimProposals(task,page,marketName).filter(o=>['identity','availability','cancelWeb','billingRoutes'].includes(o.fact)))decisions.push({market,observation,verification:verifyClaim({task,page,observation,at:page.checkedAt??new Date().toISOString(),marketName,providerHosts:target.authorities.map(a=>a.hostname)})});}
 return {market:target.market,url:page.url,bodyHash:page.bodyHash,decisions};
}

function lifecycleFieldReviews(dir){if(!fs.existsSync(dir))return [];return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?lifecycleFieldReviews(dir+'/'+e.name):e.name==='field-review.jsonl'?fs.readFileSync(dir+'/'+e.name,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[]);}
