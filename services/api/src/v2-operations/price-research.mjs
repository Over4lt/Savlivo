import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {countryCurrencies} from '../../../../packages/contracts/src/markets.ts';
import {resolveCapabilities} from '../research-v2/capabilities/config.mjs';
import {resolvePriceResearchIdentity,admitDurableResearchIdentity} from '../research-v3/research-identity-store.mjs';
import {resolveProjectedResearchService} from '../research-v3/research-service-projection.mjs';
import {providerOrBrandResearchTarget} from '../research-v3/research-target.mjs';
import {runProviderSeedCampaign} from '../research-v2/inventory/provider-seed-campaign.mjs';
import {runAdaptiveCampaign} from '../research-v2/inventory/adaptive-campaign.mjs';
import {recordResearchLinkResult} from './research-links.mjs';
import {researchLinkSnapshot} from './research-link-snapshot.mjs';
import {runAdminSuggestedOnlyResearch,runAdminV4FirstResearch,v3ResultFromTarget} from '../google-ai/admin-live-pipeline.mjs';
import {createPriceResearchAdapters,priceResearchCapabilityPreflight} from './price-research-live.mjs';
import {applyResearchHandoff} from '../research-v2/inventory/reviewed-cohort-execution.mjs';
import {loadPriceResearchTargeting,selectPriceResearchTargets} from './price-research-targeting.mjs';
import {discoverOfficialMarketAvailability} from './market-availability.mjs';
import {listMarketExclusions} from './market-exclusions.mjs';
import {executePriceResearchBatch,recoverCompletedPricingRoutes} from './price-research-batch.mjs';
import {learnProviderPricingRoutesFromTarget,prioritizeDerivedCountryCandidates,providerPricingStrategiesForTarget} from '../research-v2/live/hybrid-provider-resource-memory.mjs';
import {loadPricingRouteMemory} from '../research-v2/storage/pricing-route-memory.mjs';
import {canonicalReviewedProviderRoot} from '../research-v3/reviewed-provider-namespaces.mjs';
import {baselineProviderSourceHosts} from '../research-v3/provider-source-family.mjs';
import {researchLinkPriorityTarget} from '../research-v2/live/retained-render-source.mjs';
import {derivedCountrySourceCandidates} from '../research-v2/live/derived-country-sources.mjs';
import {researchModeOf,perTargetRequestCeiling,suggestedOnlyRequestCeiling,modeCapabilities,aiProvidersOf} from './price-research-mode.mjs';
export {researchLinkPriorityTarget} from '../research-v2/live/retained-render-source.mjs';

export function reviewedNamespacePriceResearchSeed(identity){
 const reviewedProviderNamespaces=identity.reviewedProviderNamespaces??[],root=reviewedProviderNamespaces.map(canonicalReviewedProviderRoot).find(Boolean);
 return {reviewedProviderNamespaces,urls:root?[root.url]:[],...(root?{leads:[{url:root.url,title:identity.serviceName+' provider root',originKind:'SEED',providerRootSeed:true,from:{method:'REVIEWED_NAMESPACE_ROOT',sourceUrl:root.sourceUrl},truthAuthority:'NONE',authoritative:false,evidenceStatus:'DISCOVERY_LEAD_ONLY'}]}:{})};
}

const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail=(code,status=400)=>{throw Object.assign(Error(code),{status});};
const capabilities=input=>{try{return resolveCapabilities(input);}catch{return fail('INVALID_CAPABILITIES');}};
const validBatchTarget=target=>target&&typeof target.serviceId==='string'&&/^[a-z0-9][a-z0-9-]{0,159}$/.test(target.serviceId)&&typeof target.serviceName==='string'&&target.serviceName.length>0&&target.serviceName.length<=240&&typeof target.targetMarket==='string'&&/^[A-Z]{2}$/.test(target.targetMarket)&&target.id===`price-research:${target.serviceId}:${target.targetMarket}`&&target.marketApplicabilityEstablished===false;
const requestCeilingFor=(count,perTarget=96)=>{const ceiling=count*perTarget;if(!Number.isSafeInteger(count)||count<1||!Number.isSafeInteger(ceiling))fail('PRICE_RESEARCH_REQUEST_CEILING_OVERFLOW');return ceiling;};
async function requireAvailableMarket(serviceId,serviceName,market,options){
 const proof=options.marketAvailability?.find(row=>row?.serviceId===serviceId)??(options.availabilityDiscovery===true
  ?await discoverOfficialMarketAvailability({serviceId,name:serviceName},{...options.availabilityOptions,ledgerRoot:options.root,paidSearchEnabled:options.availabilityPaidSearch===true&&!options.revalidateFrozen}).catch(()=>null):null);
 if(proof?.unavailableMarkets?.includes(market)&&proof.serviceId===serviceId&&proof.version===1&&/^[a-f0-9]{64}$/u.test(proof.sourceHash??'')&&
    Number.isFinite(Date.parse(proof.checkedAt??''))&&Date.parse(proof.checkedAt)<=Date.now()&&Date.now()-Date.parse(proof.checkedAt)<6*60*60*1000)fail('PRICE_RESEARCH_MARKET_UNAVAILABLE',409);
}

async function singlePriceResearchPlan(input,options={}){
 const {root,client}=options;
 if(!input||typeof input!=='object'||Array.isArray(input)||input.objective!=='PRICE_RESEARCH'||Object.keys(input).some(key=>!['objective','targetKind','seedName','serviceId','market','capabilities','identityDiscoveryConsent','researchMode','aiProviders',...(options.revalidateFrozen?['perTargetRequestCeiling']:[])].includes(key)))fail('INVALID_PRICE_RESEARCH_CONFIG');
 if(typeof input.market!=='string'||!countryCurrencies[input.market])fail('INVALID_PRICE_RESEARCH_MARKET');
 let mode;try{mode=researchModeOf(input);}catch{fail('INVALID_PRICE_RESEARCH_MODE');}
 let aiProviders;try{aiProviders=aiProvidersOf(input);}catch{fail('INVALID_PRICE_RESEARCH_AI_PROVIDERS');}
 const caps=modeCapabilities(mode,capabilities(input.capabilities)),seed=input.targetKind==='PROVIDER_OR_BRAND_SEED';if(seed&&mode==='suggested_only')fail('SUGGESTED_ONLY_REQUIRES_KNOWN_SERVICE');let identity=null,seedIdentityStatus=null;
 if(seed){
  if(typeof input.seedName!=='string'||input.seedName.trim().length<2||input.seedName.trim().length>120||input.serviceId!==undefined)fail('INVALID_PROVIDER_SEED');
  if(input.identityDiscoveryConsent!==true)fail('IDENTITY_DISCOVERY_CONSENT_REQUIRED',409);
  const projection=await loadPriceResearchTargeting({},options),resolved=resolveProjectedResearchService({rows:projection.services},input.seedName.trim(),{includeNames:true});
  if(resolved.status==='AMBIGUOUS')fail('AMBIGUOUS_PRICE_RESEARCH_IDENTITY',409);
  if(resolved.status==='UNRESOLVED'&&resolved.matches?.length)fail('UNKNOWN_PRICE_RESEARCH_IDENTITY',409);
  seedIdentityStatus=resolved.status==='RESEARCHABLE'?'KNOWN_SERVICE_SEED':'UNKNOWN_SERVICE_SEED';
  if(resolved.status==='RESEARCHABLE'){
   const excluded=options.marketExclusions??await listMarketExclusions([resolved.identity.serviceId],{client});
   if(excluded.some(row=>row.market_code===input.market))fail('PRICE_RESEARCH_MARKET_EXCLUDED',409);
   await requireAvailableMarket(resolved.identity.serviceId,resolved.identity.serviceName,input.market,options);
  }
 }
 else if(input.targetKind==='KNOWN_SERVICE'){if(input.seedName!==undefined||input.identityDiscoveryConsent!==undefined)fail('INVALID_PRICE_RESEARCH_IDENTITY');const resolved=await resolvePriceResearchIdentity(input.serviceId,{client});if(resolved.status!=='RESEARCHABLE')fail('UNKNOWN_PRICE_RESEARCH_IDENTITY');identity=resolved.identity;const excluded=options.marketExclusions??await listMarketExclusions([identity.serviceId],{client});if(excluded.some(row=>row.market_code===input.market))fail('PRICE_RESEARCH_MARKET_EXCLUDED',409);await requireAvailableMarket(identity.serviceId,identity.serviceName,input.market,options);}
 else fail('INVALID_PRICE_RESEARCH_TARGET');
 const modeField=mode==='suggested_only'?{researchMode:mode}:{},aiField=input.aiProviders?{aiProviders}:{},config={objective:'PRICE_RESEARCH',targetKind:input.targetKind,...(seed?{seedName:input.seedName.trim(),identityDiscoveryConsent:true}:{serviceId:identity.serviceId}),market:input.market,...modeField,...aiField,...(mode==='suggested_only'?{perTargetRequestCeiling:options.revalidateFrozen&&input.perTargetRequestCeiling!==2?1:suggestedOnlyRequestCeiling}:{}),capabilities:caps},check=await priceResearchCapabilityPreflight(caps,{...options.runtimeReadiness,env:options.env??process.env,markets:[input.market],aiProviders}),manifest={objective:'PRICE_RESEARCH',catalog:[],targets:identity?[{id:`price-research:${identity.serviceId}:${input.market}`,service:identity.serviceId,serviceName:identity.serviceName,market:input.market}]:[],priceResearch:{targetKind:input.targetKind,seedName:seed?config.seedName:null,identity,market:input.market,...modeField,...aiField},limits:{totalRequests:seed?192:perTargetRequestCeiling(config)}};
 return {config,manifest,actionable:1,liveReady:check.ready&&(mode!=='suggested_only'||check.auxiliary?.googleAi?.available===true),capabilityCheck:check,source:null,catalogHash:digest(manifest.priceResearch),servicesConsidered:1,servicesExpectedNetwork:1,totalSafetyCeiling:manifest.limits.totalRequests,discovery:caps.tavily,decodo:caps.decodo,browser:caps.browser,conflicts:[],...(seed?{identityDiscovery:{status:seedIdentityStatus,explicitConsent:true,initialDiscoveryCanConsumeRequests:true}}:{}),runner:seed?'PRICE_RESEARCH explicit provider identity discovery':mode==='suggested_only'?'PRICE_RESEARCH bounded Suggested only':'PRICE_RESEARCH V4-first identity bridge',checkpoint:path.join(root,'runs')};
}

async function canonicalSelectionPlan(input,options={}){
 if(!input||typeof input!=='object'||Array.isArray(input)||input.objective!=='PRICE_RESEARCH'||input.targetKind!=='CANONICAL_SELECTION'||Object.keys(input).some(key=>!['objective','targetKind','services','markets','targetingRevision','capabilities','researchMode','aiProviders'].includes(key)))fail('INVALID_PRICE_RESEARCH_CONFIG');
 if(typeof input.targetingRevision!=='string'||!/^[a-f0-9]{64}$/.test(input.targetingRevision))fail('INVALID_PRICE_RESEARCH_TARGETING');
 let mode;try{mode=researchModeOf(input);}catch{fail('INVALID_PRICE_RESEARCH_MODE');}
 let aiProviders;try{aiProviders=aiProvidersOf(input);}catch{fail('INVALID_PRICE_RESEARCH_AI_PROVIDERS');}
 const caps=modeCapabilities(mode,capabilities(input.capabilities)),initial=await loadPriceResearchTargeting({services:input.services,markets:input.markets},{...options,availabilityPaidSearch:false});
 if(initial.revision!==input.targetingRevision)fail('TARGETING_STALE',409);
 // A paid availability lookup is a preflight action, never a checkbox action.
 // A newly proven exclusion may change the revision after the initial user
 // selection has been validated; the returned preflight freezes that revision.
 const model=!options.revalidateFrozen&&options.availabilityDiscovery===true&&options.availabilityPaidSearch===true&&options.root
  ?await loadPriceResearchTargeting({services:input.services,markets:input.markets},{...options,availabilityPaidSearch:true}):initial;
 const selection=selectPriceResearchTargets(model),batchTargets=selection.targets.map(target=>({id:target.id,serviceId:target.serviceId,serviceName:target.serviceName,targetMarket:target.targetMarket,marketApplicabilityEstablished:false})),perTarget=perTargetRequestCeiling({researchMode:mode,perTargetRequestCeiling:suggestedOnlyRequestCeiling}),batchRequestCeiling=requestCeilingFor(batchTargets.length,perTarget),modeField=mode==='suggested_only'?{researchMode:mode}:{},aiField=input.aiProviders?{aiProviders}:{};
 const config={objective:'PRICE_RESEARCH',targetKind:'CANONICAL_SELECTION',services:model.selection.effectiveServices,markets:model.selection.requestedMarkets,targetingRevision:model.revision,batchTargets,logicalTargetCount:selection.logicalTargetCount,perTargetRequestCeiling:perTarget,batchRequestCeiling,...(model.availabilityProofs.length?{availabilityProofs:model.availabilityProofs}:{}),...modeField,...aiField,capabilities:caps};
 const check=await priceResearchCapabilityPreflight(caps,{...options.runtimeReadiness,env:options.env??process.env,markets:[...new Set(batchTargets.map(target=>target.targetMarket))],aiProviders}),manifest={objective:'PRICE_RESEARCH',catalog:[],targets:batchTargets.map(target=>({id:target.id,service:target.serviceId,serviceName:target.serviceName,market:target.targetMarket,marketApplicabilityEstablished:false})),priceResearch:{targetKind:'CANONICAL_SELECTION',services:config.services,markets:config.markets,targetingRevision:config.targetingRevision,logicalTargetCount:config.logicalTargetCount,...(config.availabilityProofs?{availabilityProofs:config.availabilityProofs}:{}),...modeField,...aiField},limits:{perTargetRequests:perTarget,totalRequests:config.batchRequestCeiling}};
 return {config,manifest,actionable:batchTargets.length,liveReady:check.ready&&(mode!=='suggested_only'||check.auxiliary?.googleAi?.available===true),capabilityCheck:check,source:null,catalogHash:digest(manifest.priceResearch),servicesConsidered:config.services.length,servicesExpectedNetwork:batchTargets.length,logicalTargetCount:config.logicalTargetCount,batchTargetCount:batchTargets.length,excludedTargetCount:model.excludedTargetCount,autoSkippedTargetCount:model.autoSkippedTargetCount,autoSkippedPairs:model.autoSkippedPairs,continuationCursor:null,perTargetRequestCeiling:perTarget,totalSafetyCeiling:config.batchRequestCeiling,discovery:caps.tavily,decodo:caps.decodo,browser:caps.browser,conflicts:[],runner:mode==='suggested_only'?'PRICE_RESEARCH bounded Suggested only':'PRICE_RESEARCH complete canonical scope',checkpoint:path.join(options.root,'runs')};
}

export async function priceResearchPlan(input,options={}){
 if(input?.targetKind!=='CANONICAL_SELECTION')return singlePriceResearchPlan(input,{...options,availabilityPaidSearch:options.availabilityPaidSearch===true&&!options.revalidateFrozen});
 if(options.revalidateFrozen){
  const external={objective:input.objective,targetKind:input.targetKind,services:input.services,markets:input.markets,targetingRevision:input.targetingRevision,capabilities:input.capabilities,...(input.researchMode?{researchMode:input.researchMode}:{}),...(input.aiProviders?{aiProviders:input.aiProviders}:{})},current=await canonicalSelectionPlan(external,options);
  if(digest(current.config)!==digest(input))fail('PREFLIGHT_STALE',409);
  return current;
 }
 return canonicalSelectionPlan(input,options);
}

export function verifyPriceResearchPlanBinding(config,manifest){
 if(config?.targetKind!=='CANONICAL_SELECTION')return manifest?.objective==='PRICE_RESEARCH'&&digest(aiProvidersOf(manifest.priceResearch))===digest(aiProvidersOf(config));
 const targets=config.batchTargets;
 const perTarget=perTargetRequestCeiling(config),expectedCeiling=targets?.length*perTarget;
 if(!Array.isArray(targets)||targets.length<1||targets.some(target=>!validBatchTarget(target))||new Set(targets.map(target=>`${target.serviceId}:${target.targetMarket}`)).size!==targets.length||config.logicalTargetCount!==targets.length||config.perTargetRequestCeiling!==perTarget||!Number.isSafeInteger(expectedCeiling)||config.batchRequestCeiling!==expectedCeiling)throw Error('PRICE_RESEARCH_BATCH_BINDING_CHANGED');
 const expected=targets.map(target=>({id:target.id,service:target.serviceId,serviceName:target.serviceName,market:target.targetMarket,marketApplicabilityEstablished:false}));
 if(manifest?.objective!=='PRICE_RESEARCH'||digest(manifest.targets)!==digest(expected)||manifest.limits?.perTargetRequests!==perTarget||manifest.limits?.totalRequests!==config.batchRequestCeiling||manifest.priceResearch?.targetingRevision!==config.targetingRevision||manifest.priceResearch?.logicalTargetCount!==targets.length||digest(manifest.priceResearch?.availabilityProofs??[])!==digest(config.availabilityProofs??[])||researchModeOf(manifest.priceResearch)!==researchModeOf(config)||digest(aiProvidersOf(manifest.priceResearch))!==digest(aiProvidersOf(config)))throw Error('PRICE_RESEARCH_BATCH_BINDING_CHANGED');
 return true;
}

const v3Results=(state,targets)=>Object.fromEntries(targets.map(target=>[target.id,v3ResultFromTarget(state?.targets?.[target.id])]));
const retryableVerificationReasons=new Set(['NO_EXECUTABLE_PROGRESS_RECONCILE']);
const usageKeys=['reads','searches','acquisitions','retainedReviews','bytes'];
const allUsageKeys=['actions',...usageKeys];
const uniqueRows=rows=>[...new Map(rows.map(row=>[JSON.stringify(row),row])).values()];
export function priorityRetainedV3Evidence({priorityState,target,root}){
 const current=priorityState?.targets?.[target.id],observation=current?.v3Observation,source=(current?.acquisitionOutcomes??[]).findLast(row=>row.researchLinkId&&row.sourceHash===observation?.sha256&&row.sourceClassification?.status==='PROVIDER_SOURCE'&&row.sourceClassification.finalUrl===observation?.url&&row.countryV3Evaluation?.status==='EVALUATED'&&row.countryV3Evaluation?.receiptStatus==='HASH_VERIFIED'&&row.countryV3Evaluation?.geoClass==='G1');
 if(!source||!current.v3Truth||!/^[a-f0-9]{64}$/.test(observation?.sha256??''))return null;
 try{
  const allowed=fs.realpathSync(path.join(root,'priority-research-links')),directory=fs.realpathSync(source.runDirectory),file=fs.realpathSync(path.join(directory,'raw',observation.sha256+'.body'));
  if(!directory.startsWith(allowed+path.sep)||!file.startsWith(directory+path.sep)||fs.statSync(file).size>8_000_000)return null;
  const body=fs.readFileSync(file,'utf8');if(createHash('sha256').update(body).digest('hex')!==observation.sha256)return null;
  const leads=(current.leads??[]).filter(row=>row.sourceBoundCandidate===true&&row.from?.bodyHash===observation.sha256&&row.from?.observation===observation.id&&row.truthAuthority==='NONE'&&row.authoritative===false&&Number.isSafeInteger(row.source?.start)&&Number.isSafeInteger(row.source?.end)&&row.source.start>=0&&row.source.end<=body.length&&row.source.start<row.source.end&&createHash('sha256').update(body.slice(row.source.start,row.source.end)).digest('hex')===row.source.sha256);
  return {v3Truth:structuredClone(current.v3Truth),v3Observation:structuredClone(observation),...(current.v3Catalog?{v3Catalog:structuredClone(current.v3Catalog)}:{}),v3SuggestedCandidates:structuredClone(current.v3SuggestedCandidates??[]),v3ResearchLineage:structuredClone(current.v3ResearchLineage??null),sourceBoundContinuationParents:structuredClone((current.sourceBoundContinuationParents??[]).filter(row=>row.id===observation.id&&row.sha256===observation.sha256)),leads:structuredClone(leads)};
 }catch{return null;}
}
function adaptiveUsage(state){
 const usage={actions:Number.isSafeInteger(state?.turn)?state.turn:0,reads:0,searches:0,acquisitions:0,retainedReviews:0,bytes:0},initial=state?.budgetScope==='CAMPAIGN'?state.initialUsage??{}:{};
 for(const key of usageKeys)usage[key]=Number.isSafeInteger(initial[key])?initial[key]:0;
 for(const service of Object.values(state?.services??{}))for(const key of usageKeys)usage[key]+=Number.isSafeInteger(service?.used?.[key])?service.used[key]:0;
 return usage;
}
function retryDiagnostic(state,target,v3Result){
 const current=state?.targets?.[target.id],service=state?.services?.[current?.service??target.service],reason=current?.executionBlocked??service?.stop?.reason??null,bounds=state?.bounds??{},usage=adaptiveUsage(state),hardBudgetExhausted=service?.stop?.kind==='BUDGET_LIMITED'||reason==='BUDGET_EXHAUSTED'||Object.entries({actions:'turns',reads:'reads',searches:'searches',acquisitions:'acquisitions',retainedReviews:'retainedReviews',bytes:'bytes'}).some(([used,bound])=>Number.isSafeInteger(bounds[bound])&&usage[used]>=bounds[bound]);
 return {reason,verificationRequired:Boolean(current?.v4VerificationRequirement)&&(v3Result?.verified?.length??0)===0,hardBudgetExhausted,authoritativeContradiction:(v3Result?.contradictions?.length??0)>0,usage,bounds};
}
const attemptOutcome=result=>(result?.contradictions?.length??0)>0?'CONFLICT':(result?.verified?.length??0)>0?'VERIFIED':'UNRESOLVED';
const usageDelta=(total,initial)=>Object.fromEntries(allUsageKeys.map(key=>[key,Math.max(0,(total?.[key]??0)-(initial?.[key]??0))]));
// Routing memory for this job only. A complete, country-bound unpriced page,
// or an identical response proven over the fixed body limit, cannot advance
// a second acquisition. This grants no source or market authority to V3.
function noProgressProviderUrls(state,targetId){
 const target=state?.targets?.[targetId];if(!target)return [];
 return [...new Set((target.acquisitionOutcomes??[]).filter(row=>row.responseTooLarge===true||['CONTENT_NOT_COMMERCIAL','COMMERCIAL_FIELDS_INSUFFICIENT'].includes(row.classification)&&row.sourceClassification?.status==='PROVIDER_SOURCE'&&/^[a-f0-9]{64}$/u.test(row.sourceClassification.sourceHash??'')&&row.countryV3Evaluation?.status==='EVALUATED'&&row.countryV3Evaluation?.receiptStatus==='HASH_VERIFIED'&&row.countryV3Evaluation?.geoClass==='G1').flatMap(row=>row.responseTooLarge===true?[row.url]:[row.url,row.sourceClassification.finalUrl].filter(Boolean)))];
}
function retrySummary(diagnostic,result,usageScope){
 return {attempted:false,count:0,usageScope,firstAttemptReason:diagnostic.reason,firstAttemptOutcome:attemptOutcome(result),firstAttemptUsage:diagnostic.usage,retryOutcome:null,retryReason:null,retryUsage:null,verifiedAttempt:(result?.verified?.length??0)>0?1:null};
}
function mergeV3Attempts(first,retry,{exhausted=false,reason=null}={}){
 const operationalFailures=uniqueRows([...(first?.operationalFailures??[]),...(retry?.operationalFailures??[]),...(exhausted?[{kind:'V3_VERIFICATION_RETRY_EXHAUSTED',reason:reason??'NO_AUTHORITATIVE_PROGRESS'}]:[])]);
 return {suggested:uniqueRows([...(first?.suggested??[]),...(retry?.suggested??[])]),verified:uniqueRows([...(first?.verified??[]),...(retry?.verified??[])]),contradictions:uniqueRows([...(first?.contradictions??[]),...(retry?.contradictions??[])]),operationalFailures};
}
export async function runBoundedV3Verification({targets,handoffs,execute}){
 const firstOutput=await execute(handoffs,{attempt:1,targetIds:targets.map(target=>target.id)}),first=firstOutput?.adaptive??firstOutput,firstResults=firstOutput?.v3Results??v3Results(first,targets),diagnostics=Object.fromEntries(targets.map(target=>[target.id,retryDiagnostic(first,target,firstResults[target.id])])),targetSummaries=Object.fromEntries(targets.map(target=>[target.id,retrySummary(diagnostics[target.id],firstResults[target.id],targets.length===1?'TARGET':'CAMPAIGN')]));
 const retryTargets=targets.filter(target=>{const handoff=handoffs[target.id],result=firstResults[target.id],diagnostic=diagnostics[target.id];return (handoff?.researchLeads?.candidatePlans?.length??0)>0&&(result?.verified?.length??0)===0&&diagnostic.verificationRequired&&retryableVerificationReasons.has(diagnostic.reason)&&!diagnostic.authoritativeContradiction&&!diagnostic.hardBudgetExhausted;});
 if(!retryTargets.length)return {result:first,v3Results:firstResults,verificationRetry:{maximumPerTarget:1,attemptedTargetIds:[],diagnostics,targets:targetSummaries}};
 const initialUsage=adaptiveUsage(first),retryHandoffs=Object.fromEntries(retryTargets.map(target=>[target.id,handoffs[target.id]])),priorResearchLinkOutcomes=Object.fromEntries(retryTargets.map(target=>[target.id,first.targets?.[target.id]?.researchLinkOutcomes??[]])),priorNoProgressProviderUrls=Object.fromEntries(retryTargets.map(target=>[target.id,noProgressProviderUrls(first,target.id)])),retryOutput=await execute(retryHandoffs,{attempt:2,targetIds:retryTargets.map(target=>target.id),initialUsage,priorResearchLinkOutcomes,priorNoProgressProviderUrls,artifactName:'v3-verification-retry-1'}),retry=retryOutput?.adaptive??retryOutput,retryResults=retryOutput?.v3Results??v3Results(retry,retryTargets),totalUsage=adaptiveUsage(retry);
 for(const [used,bound]of Object.entries({actions:'turns',reads:'reads',searches:'searches',acquisitions:'acquisitions',retainedReviews:'retainedReviews',bytes:'bytes'}))if(Number.isSafeInteger(retry?.bounds?.[bound])&&totalUsage[used]>retry.bounds[bound])throw Error('V3_VERIFICATION_RETRY_BUDGET_VIOLATION');
 const merged={...firstResults},outcomes={};for(const target of retryTargets){const retried=retryResults[target.id]??{suggested:[],verified:[],contradictions:[],operationalFailures:[{kind:'V3_RESULT_UNAVAILABLE'}]},retryStateDiagnostic=retryDiagnostic(retry,target,retried),authoritative=(retried.verified?.length??0)>0||(retried.contradictions?.length??0)>0,exhausted=!authoritative;merged[target.id]=mergeV3Attempts(firstResults[target.id],retried,{exhausted,reason:retryStateDiagnostic.reason});outcomes[target.id]={status:authoritative?'AUTHORITATIVE_PROGRESS':'RETRY_EXHAUSTED',reason:retryStateDiagnostic.reason};targetSummaries[target.id]={...targetSummaries[target.id],attempted:true,count:1,retryOutcome:attemptOutcome(retried),retryReason:retryStateDiagnostic.reason,retryUsage:usageDelta(totalUsage,initialUsage),verifiedAttempt:(retried.verified?.length??0)>0?2:null};}
 return {result:{...first,v3VerificationRetry:{maximumPerTarget:1,attemptedTargetIds:retryTargets.map(target=>target.id),firstAttemptArtifact:'primary',retryAttemptArtifact:'v3-verification-retry-1',initialUsage,totalUsage,outcomes}},v3Results:merged,verificationRetry:{maximumPerTarget:1,attemptedTargetIds:retryTargets.map(target=>target.id),diagnostics,outcomes,targets:targetSummaries}};
}
async function executeSinglePriceResearch({job,directory,apiKey,client,shouldStop=()=>false,providerPricingRouteMemory=null,googleRequestGate=null}){
 const config=job.config,aiProviders=aiProvidersOf(config);if(!aiProviders.gemini)apiKey=null;if(config.targetKind==='PROVIDER_OR_BRAND_SEED'&&config.identityDiscoveryConsent!==true)throw Error('IDENTITY_DISCOVERY_CONSENT_REQUIRED');
 if(researchModeOf(config)==='suggested_only'){
  if(config.targetKind!=='KNOWN_SERVICE')throw Error('SUGGESTED_ONLY_REQUIRES_KNOWN_SERVICE');
  if(!aiProviders.gemini)throw Error('SUGGESTED_ONLY_REQUIRES_GEMINI');
  if(shouldStop())throw Error('PRICE_RESEARCH_STOPPED');
  const resolved=await resolvePriceResearchIdentity(config.serviceId,{client});if(resolved.status!=='RESEARCHABLE')throw Error('PRICE_RESEARCH_IDENTITY_REVOKED');
  if((await listMarketExclusions([resolved.identity.serviceId],{client})).some(row=>row.market_code===config.market))throw Error('PRICE_RESEARCH_MARKET_EXCLUDED');
  const target={id:`price-research:${resolved.identity.serviceId}:${config.market}`,service:resolved.identity.serviceId,serviceName:resolved.identity.serviceName,market:config.market,reviewedProviderNamespaces:resolved.identity.reviewedProviderNamespaces??[]};
  return runAdminSuggestedOnlyResearch({targets:[target],artifactDirectory:directory,apiKey,maxGoogleRequests:perTargetRequestCeiling(config),googleRequestGate});
 }
 const adapters=await createPriceResearchAdapters({market:config.market,capabilities:config.capabilities,aiProviders}),runPipeline=({targets,execute,beforeGoogle=null})=>runAdminV4FirstResearch({targets,artifactDirectory:directory,apiKey,allowGoogleAi:aiProviders.gemini,beforeGoogle,runDownstream:({handoffs})=>runBoundedV3Verification({targets,handoffs,execute})});
 if(shouldStop())throw Error('PRICE_RESEARCH_STOPPED');
 if(config.targetKind==='PROVIDER_OR_BRAND_SEED')return runProviderSeedCampaign({directory:path.join(directory,'provider-seed'),researchTarget:providerOrBrandResearchTarget({seedName:config.seedName,targetMarket:config.market}),createAdapters:adapters,capabilities:config.capabilities,persistResearchIdentity:payload=>admitDurableResearchIdentity(payload,{client}),includeChild:async identity=>!(await listMarketExclusions([identity.serviceId],{client})).some(row=>row.market_code===config.market),runResearch:runPipeline,operationsObjective:'PRICE_RESEARCH',onTransition:()=>{if(shouldStop())throw Error('PRICE_RESEARCH_STOPPED');},profile:'PRODUCTION'});
 const resolved=await resolvePriceResearchIdentity(config.serviceId,{client});if(resolved.status!=='RESEARCHABLE')throw Error('PRICE_RESEARCH_IDENTITY_REVOKED');
 const linkState=await researchLinkSnapshot({directory,serviceId:resolved.identity.serviceId,canonicalSlug:resolved.identity.canonicalSlug,market:config.market,client});
 const namespaceSeed=reviewedNamespacePriceResearchSeed(resolved.identity),target={id:`price-research:${resolved.identity.serviceId}:${config.market}`,service:resolved.identity.serviceId,serviceName:resolved.identity.serviceName,market:config.market,marketApplicabilityEstablished:false,reviewedProviderNamespaces:namespaceSeed.reviewedProviderNamespaces};
 const derivedCountryCandidates=prioritizeDerivedCountryCandidates(providerPricingRouteMemory,target,derivedCountrySourceCandidates({service:resolved.identity.serviceId,market:config.market,patternLinks:linkState.patternLinks,researchLinks:linkState.links}));
 const baseTarget={...target,...namespaceSeed,operationsObjective:'PRICE_RESEARCH',researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},knownCommercialUrls:[],authorities:[],providerSourceIdentityHosts:baselineProviderSourceHosts(resolved.identity.serviceId,resolved.identity.serviceName),gaps:['plan','amount','currency','cadence','priceRole','ownership','market'],reads:[],queries:[],decisions:[],verified:[],blockedOrigins:[],capabilities:config.capabilities,persistedVerifiedCount:linkState.persistedVerifiedCount,researchLinks:linkState.links,successfulResearchLinkHints:linkState.patternLinks,researchLinkOutcomes:[],derivedCountryCandidates};
 baseTarget.learnedPricingStrategies=providerPricingStrategiesForTarget(providerPricingRouteMemory,baseTarget);
 let priorityState=null;
 const beforeGoogle=linkState.links.length||derivedCountryCandidates.length||baseTarget.learnedPricingStrategies.length?async()=>{
  const priorityTarget=researchLinkPriorityTarget(baseTarget,config.capabilities),campaignDirectory=path.join(directory,'priority-research-links');
  priorityState=await runAdaptiveCampaign({directory:campaignDirectory,manifest:{targets:[priorityTarget],conditionalFollowupTargets:[]},profile:'PRODUCTION',maxActions:Math.min(40,(linkState.links.length+derivedCountryCandidates.length+baseTarget.learnedPricingStrategies.length)*3),providerPricingRouteMemory,createAdapters:args=>adapters({...args,stage:'RESEARCH_LINK_PRIORITY'}),onTransition:()=>{if(shouldStop())throw Error('PRICE_RESEARCH_STOPPED');}});
  learnProviderPricingRoutesFromTarget({memory:providerPricingRouteMemory,target:priorityState.targets?.[target.id],directory:path.join(campaignDirectory,'targets',target.id,'open-web-discovery')});
  const current=priorityState.targets?.[target.id];for(const row of current?.researchLinkOutcomes??[])await recordResearchLinkResult({id:row.id,attemptedAt:row.at,result:row.result,client});
  const v3Result=v3ResultFromTarget(current),satisfied=v3Result.verified.length>0;
  return {satisfiedTargetIds:satisfied?[target.id]:[],downstream:satisfied?{result:priorityState,v3Results:{[target.id]:v3Result},verificationRetry:{maximumPerTarget:1,attemptedTargetIds:[],targets:{[target.id]:{attempted:false,count:0,verifiedAttempt:1}}}}:null};
 }:null;
 const execute=async(handoffs={},options={})=>{const campaignDirectory=path.join(directory,options.attempt===2?'known-service-v3-verification-retry-1':'known-service'),priorityEvidence=priorityRetainedV3Evidence({priorityState,target,root:directory}),input={...baseTarget,...priorityEvidence,learnedStrategyTrace:priorityState?.targets?.[target.id]?.learnedStrategyTrace,researchLinkOutcomes:options.priorResearchLinkOutcomes?.[target.id]??priorityState?.targets?.[target.id]?.researchLinkOutcomes??[],priorNoProgressProviderUrls:[...new Set([...noProgressProviderUrls(priorityState,target.id),...(options.priorNoProgressProviderUrls?.[target.id]??[])])]},initialUsage=options.attempt===2?options.initialUsage:priorityState?adaptiveUsage(priorityState):null,state=await runAdaptiveCampaign({directory:campaignDirectory,manifest:{targets:[applyResearchHandoff(input,handoffs[target.id])],conditionalFollowupTargets:[]},profile:'PRODUCTION',...(initialUsage?{budgetScope:'CAMPAIGN',initialUsage}:{}),providerPricingRouteMemory,createAdapters:args=>adapters({...args,stage:'KNOWN_SERVICE_CHILD'}),onTransition:()=>{if(shouldStop())throw Error('PRICE_RESEARCH_STOPPED');}});learnProviderPricingRoutesFromTarget({memory:providerPricingRouteMemory,target:state.targets?.[target.id],directory:path.join(campaignDirectory,'targets',target.id,'open-web-discovery')});for(const row of state.targets?.[target.id]?.researchLinkOutcomes??[])await recordResearchLinkResult({id:row.id,attemptedAt:row.at,result:row.result,client});return state;};return runPipeline({targets:[target],execute,beforeGoogle});
}

export async function executePriceResearch(options){
 // Runtime tuning is bounded to 1–3 workers; an invalid value falls back to
 // the existing serial path. It does not change the frozen target or call cap.
 if(options.job?.config?.targetKind==='CANONICAL_SELECTION')return executePriceResearchBatch({...options,suggestedOnlyParallelism:options.suggestedOnlyParallelism??Number(process.env.SAVLIVO_SUGGESTED_ONLY_PARALLELISM??2),executeTarget:executeSinglePriceResearch});
 let providerPricingRouteMemory=null;
 if(options.memoryRoot&&options.job?.config?.targetKind==='KNOWN_SERVICE')try{providerPricingRouteMemory=loadPricingRouteMemory(options.memoryRoot,{services:[options.job.config.serviceId]});}catch{/* Invalid hints must not grant authority or interrupt research. */}
 const result=await executeSinglePriceResearch({...options,providerPricingRouteMemory});
 if(options.memoryRoot&&options.job?.config?.targetKind==='KNOWN_SERVICE'&&options.job.id&&options.directory&&result?.kind==='ADMIN_V4_FIRST_RESEARCH_RESULT'){
  const service=options.job.config.serviceId,market=options.job.config.market,target={id:`price-research:${service}:${market}`,serviceId:service,targetMarket:market};
  recoverCompletedPricingRoutes(providerPricingRouteMemory,options.directory,target,{memoryRoot:options.memoryRoot,jobId:options.job.id,recordedAt:new Date().toISOString(),replayFailures:false,result,knownService:true});
 }
 return result;
}
