import {createHash} from 'node:crypto';
import path from 'node:path';
import {countryCurrencies} from '../../../../packages/contracts/src/markets.ts';
import {resolveCapabilities} from '../research-v2/capabilities/config.mjs';
import {resolvePriceResearchIdentity,admitDurableResearchIdentity} from '../research-v3/research-identity-store.mjs';
import {providerOrBrandResearchTarget} from '../research-v3/research-target.mjs';
import {runProviderSeedCampaign} from '../research-v2/inventory/provider-seed-campaign.mjs';
import {runAdaptiveCampaign} from '../research-v2/inventory/adaptive-campaign.mjs';
import {runAdminV4FirstResearch,v3ResultFromTarget} from '../google-ai/admin-live-pipeline.mjs';
import {createPriceResearchAdapters,priceResearchCapabilityPreflight} from './price-research-live.mjs';
import {applyResearchHandoff} from '../research-v2/inventory/reviewed-cohort-execution.mjs';
import {loadPriceResearchTargeting,selectPriceResearchTargets} from './price-research-targeting.mjs';
import {executePriceResearchBatch} from './price-research-batch.mjs';
import {learnProviderPricingRoutesFromTarget} from '../research-v2/live/hybrid-provider-resource-memory.mjs';
import {canonicalReviewedProviderRoot} from '../research-v3/reviewed-provider-namespaces.mjs';

export function reviewedNamespacePriceResearchSeed(identity){
 const reviewedProviderNamespaces=identity.reviewedProviderNamespaces??[],root=reviewedProviderNamespaces.map(canonicalReviewedProviderRoot).find(Boolean);
 return {reviewedProviderNamespaces,urls:root?[root.url]:[],...(root?{leads:[{url:root.url,title:identity.serviceName+' provider root',originKind:'SEED',providerRootSeed:true,from:{method:'REVIEWED_NAMESPACE_ROOT',sourceUrl:root.sourceUrl},truthAuthority:'NONE',authoritative:false,evidenceStatus:'DISCOVERY_LEAD_ONLY'}]}:{})};
}

const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail=(code,status=400)=>{throw Object.assign(Error(code),{status});};
const capabilities=input=>{try{return resolveCapabilities(input);}catch{return fail('INVALID_CAPABILITIES');}};
const validBatchTarget=target=>target&&typeof target.serviceId==='string'&&/^[a-z0-9][a-z0-9-]{0,159}$/.test(target.serviceId)&&typeof target.serviceName==='string'&&target.serviceName.length>0&&target.serviceName.length<=240&&typeof target.targetMarket==='string'&&/^[A-Z]{2}$/.test(target.targetMarket)&&target.id===`price-research:${target.serviceId}:${target.targetMarket}`&&target.marketApplicabilityEstablished===false;
const requestCeilingFor=count=>{const ceiling=count*96;if(!Number.isSafeInteger(count)||count<1||!Number.isSafeInteger(ceiling))fail('PRICE_RESEARCH_REQUEST_CEILING_OVERFLOW');return ceiling;};

async function singlePriceResearchPlan(input,options={}){
 const {root,client}=options;
 if(!input||typeof input!=='object'||Array.isArray(input)||input.objective!=='PRICE_RESEARCH'||Object.keys(input).some(key=>!['objective','targetKind','seedName','serviceId','market','capabilities'].includes(key)))fail('INVALID_PRICE_RESEARCH_CONFIG');
 if(typeof input.market!=='string'||!countryCurrencies[input.market])fail('INVALID_PRICE_RESEARCH_MARKET');
 const caps=capabilities(input.capabilities),seed=input.targetKind==='PROVIDER_OR_BRAND_SEED';let identity=null;
 if(seed){if(typeof input.seedName!=='string'||input.seedName.trim().length<2||input.seedName.trim().length>120||input.serviceId!==undefined)fail('INVALID_PROVIDER_SEED');}
 else if(input.targetKind==='KNOWN_SERVICE'){if(input.seedName!==undefined)fail('INVALID_PRICE_RESEARCH_IDENTITY');const resolved=await resolvePriceResearchIdentity(input.serviceId,{client});if(resolved.status!=='RESEARCHABLE')fail('UNKNOWN_PRICE_RESEARCH_IDENTITY');identity=resolved.identity;}
 else fail('INVALID_PRICE_RESEARCH_TARGET');
 const config={objective:'PRICE_RESEARCH',targetKind:input.targetKind,...(seed?{seedName:input.seedName.trim()}:{serviceId:identity.serviceId}),market:input.market,capabilities:caps},check=await priceResearchCapabilityPreflight(caps,{...options.runtimeReadiness,env:options.env??process.env,markets:[input.market]}),manifest={objective:'PRICE_RESEARCH',catalog:[],targets:identity?[{id:`price-research:${identity.serviceId}:${input.market}`,service:identity.serviceId,serviceName:identity.serviceName,market:input.market}]:[],priceResearch:{targetKind:input.targetKind,seedName:seed?config.seedName:null,identity,market:input.market},limits:{totalRequests:seed?192:96}};
 return {config,manifest,actionable:1,liveReady:check.ready,capabilityCheck:check,source:null,catalogHash:digest(manifest.priceResearch),servicesConsidered:1,servicesExpectedNetwork:1,totalSafetyCeiling:manifest.limits.totalRequests,discovery:caps.tavily,decodo:caps.decodo,browser:caps.browser,conflicts:[],runner:'PRICE_RESEARCH V4-first identity bridge',checkpoint:path.join(root,'runs')};
}

async function canonicalSelectionPlan(input,options={}){
 if(!input||typeof input!=='object'||Array.isArray(input)||input.objective!=='PRICE_RESEARCH'||input.targetKind!=='CANONICAL_SELECTION'||Object.keys(input).some(key=>!['objective','targetKind','services','markets','targetingRevision','capabilities'].includes(key)))fail('INVALID_PRICE_RESEARCH_CONFIG');
 if(typeof input.targetingRevision!=='string'||!/^[a-f0-9]{64}$/.test(input.targetingRevision))fail('INVALID_PRICE_RESEARCH_TARGETING');
 const caps=capabilities(input.capabilities),model=await loadPriceResearchTargeting({services:input.services,markets:input.markets},options);
 if(model.revision!==input.targetingRevision)fail('TARGETING_STALE',409);
 const selection=selectPriceResearchTargets(model),batchTargets=selection.targets.map(target=>({id:target.id,serviceId:target.serviceId,serviceName:target.serviceName,targetMarket:target.targetMarket,marketApplicabilityEstablished:false})),batchRequestCeiling=requestCeilingFor(batchTargets.length);
 const config={objective:'PRICE_RESEARCH',targetKind:'CANONICAL_SELECTION',services:model.selection.effectiveServices,markets:model.selection.requestedMarkets,targetingRevision:model.revision,batchTargets,logicalTargetCount:selection.logicalTargetCount,perTargetRequestCeiling:96,batchRequestCeiling,capabilities:caps};
 const check=await priceResearchCapabilityPreflight(caps,{...options.runtimeReadiness,env:options.env??process.env,markets:[...new Set(batchTargets.map(target=>target.targetMarket))]}),manifest={objective:'PRICE_RESEARCH',catalog:[],targets:batchTargets.map(target=>({id:target.id,service:target.serviceId,serviceName:target.serviceName,market:target.targetMarket,marketApplicabilityEstablished:false})),priceResearch:{targetKind:'CANONICAL_SELECTION',services:config.services,markets:config.markets,targetingRevision:config.targetingRevision,logicalTargetCount:config.logicalTargetCount},limits:{perTargetRequests:96,totalRequests:config.batchRequestCeiling}};
 return {config,manifest,actionable:batchTargets.length,liveReady:check.ready,capabilityCheck:check,source:null,catalogHash:digest(manifest.priceResearch),servicesConsidered:config.services.length,servicesExpectedNetwork:batchTargets.length,logicalTargetCount:config.logicalTargetCount,batchTargetCount:batchTargets.length,continuationCursor:null,perTargetRequestCeiling:96,totalSafetyCeiling:config.batchRequestCeiling,discovery:caps.tavily,decodo:caps.decodo,browser:caps.browser,conflicts:[],runner:'PRICE_RESEARCH complete canonical scope',checkpoint:path.join(options.root,'runs')};
}

export async function priceResearchPlan(input,options={}){
 if(input?.targetKind!=='CANONICAL_SELECTION')return singlePriceResearchPlan(input,options);
 if(options.revalidateFrozen){
  const external={objective:input.objective,targetKind:input.targetKind,services:input.services,markets:input.markets,targetingRevision:input.targetingRevision,capabilities:input.capabilities},current=await canonicalSelectionPlan(external,options);
  if(digest(current.config)!==digest(input))fail('PREFLIGHT_STALE',409);
  return current;
 }
 return canonicalSelectionPlan(input,options);
}

export function verifyPriceResearchPlanBinding(config,manifest){
 if(config?.targetKind!=='CANONICAL_SELECTION')return manifest?.objective==='PRICE_RESEARCH';
 const targets=config.batchTargets;
 const expectedCeiling=targets?.length*96;
 if(!Array.isArray(targets)||targets.length<1||targets.some(target=>!validBatchTarget(target))||new Set(targets.map(target=>`${target.serviceId}:${target.targetMarket}`)).size!==targets.length||config.logicalTargetCount!==targets.length||config.perTargetRequestCeiling!==96||!Number.isSafeInteger(expectedCeiling)||config.batchRequestCeiling!==expectedCeiling)throw Error('PRICE_RESEARCH_BATCH_BINDING_CHANGED');
 const expected=targets.map(target=>({id:target.id,service:target.serviceId,serviceName:target.serviceName,market:target.targetMarket,marketApplicabilityEstablished:false}));
 if(manifest?.objective!=='PRICE_RESEARCH'||digest(manifest.targets)!==digest(expected)||manifest.limits?.perTargetRequests!==96||manifest.limits?.totalRequests!==config.batchRequestCeiling||manifest.priceResearch?.targetingRevision!==config.targetingRevision||manifest.priceResearch?.logicalTargetCount!==targets.length)throw Error('PRICE_RESEARCH_BATCH_BINDING_CHANGED');
 return true;
}

const v3Results=(state,targets)=>Object.fromEntries(targets.map(target=>[target.id,v3ResultFromTarget(state?.targets?.[target.id])]));
const retryableVerificationReasons=new Set(['NO_EXECUTABLE_PROGRESS_RECONCILE']);
const usageKeys=['reads','searches','acquisitions','retainedReviews','bytes'];
const allUsageKeys=['actions',...usageKeys];
const uniqueRows=rows=>[...new Map(rows.map(row=>[JSON.stringify(row),row])).values()];
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
 const initialUsage=adaptiveUsage(first),retryHandoffs=Object.fromEntries(retryTargets.map(target=>[target.id,handoffs[target.id]])),retryOutput=await execute(retryHandoffs,{attempt:2,targetIds:retryTargets.map(target=>target.id),initialUsage,artifactName:'v3-verification-retry-1'}),retry=retryOutput?.adaptive??retryOutput,retryResults=retryOutput?.v3Results??v3Results(retry,retryTargets),totalUsage=adaptiveUsage(retry);
 for(const [used,bound]of Object.entries({actions:'turns',reads:'reads',searches:'searches',acquisitions:'acquisitions',retainedReviews:'retainedReviews',bytes:'bytes'}))if(Number.isSafeInteger(retry?.bounds?.[bound])&&totalUsage[used]>retry.bounds[bound])throw Error('V3_VERIFICATION_RETRY_BUDGET_VIOLATION');
 const merged={...firstResults},outcomes={};for(const target of retryTargets){const retried=retryResults[target.id]??{suggested:[],verified:[],contradictions:[],operationalFailures:[{kind:'V3_RESULT_UNAVAILABLE'}]},retryStateDiagnostic=retryDiagnostic(retry,target,retried),authoritative=(retried.verified?.length??0)>0||(retried.contradictions?.length??0)>0,exhausted=!authoritative;merged[target.id]=mergeV3Attempts(firstResults[target.id],retried,{exhausted,reason:retryStateDiagnostic.reason});outcomes[target.id]={status:authoritative?'AUTHORITATIVE_PROGRESS':'RETRY_EXHAUSTED',reason:retryStateDiagnostic.reason};targetSummaries[target.id]={...targetSummaries[target.id],attempted:true,count:1,retryOutcome:attemptOutcome(retried),retryReason:retryStateDiagnostic.reason,retryUsage:usageDelta(totalUsage,initialUsage),verifiedAttempt:(retried.verified?.length??0)>0?2:null};}
 return {result:{...first,v3VerificationRetry:{maximumPerTarget:1,attemptedTargetIds:retryTargets.map(target=>target.id),firstAttemptArtifact:'primary',retryAttemptArtifact:'v3-verification-retry-1',initialUsage,totalUsage,outcomes}},v3Results:merged,verificationRetry:{maximumPerTarget:1,attemptedTargetIds:retryTargets.map(target=>target.id),diagnostics,outcomes,targets:targetSummaries}};
}
async function executeSinglePriceResearch({job,directory,apiKey,client,shouldStop=()=>false,providerPricingRouteMemory=null}){
 const config=job.config,adapters=await createPriceResearchAdapters({market:config.market,capabilities:config.capabilities}),runPipeline=({targets,execute})=>runAdminV4FirstResearch({targets,artifactDirectory:directory,apiKey,runDownstream:({handoffs})=>runBoundedV3Verification({targets,handoffs,execute})});
 if(shouldStop())throw Error('PRICE_RESEARCH_STOPPED');
 if(config.targetKind==='PROVIDER_OR_BRAND_SEED')return runProviderSeedCampaign({directory:path.join(directory,'provider-seed'),researchTarget:providerOrBrandResearchTarget({seedName:config.seedName,targetMarket:config.market}),createAdapters:adapters,capabilities:config.capabilities,persistResearchIdentity:payload=>admitDurableResearchIdentity(payload,{client}),runResearch:runPipeline,onTransition:()=>{if(shouldStop())throw Error('PRICE_RESEARCH_STOPPED');},profile:'PRODUCTION'});
 const resolved=await resolvePriceResearchIdentity(config.serviceId,{client});if(resolved.status!=='RESEARCHABLE')throw Error('PRICE_RESEARCH_IDENTITY_REVOKED');const namespaceSeed=reviewedNamespacePriceResearchSeed(resolved.identity),target={id:`price-research:${resolved.identity.serviceId}:${config.market}`,service:resolved.identity.serviceId,serviceName:resolved.identity.serviceName,market:config.market,marketApplicabilityEstablished:false,reviewedProviderNamespaces:namespaceSeed.reviewedProviderNamespaces},baseTarget={...target,...namespaceSeed,operationsObjective:'PRICE_RESEARCH',researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},knownCommercialUrls:[],authorities:[],gaps:['plan','amount','currency','cadence','priceRole','ownership','market'],reads:[],queries:[],decisions:[],verified:[],blockedOrigins:[],capabilities:config.capabilities},execute=async(handoffs={},options={})=>{const campaignDirectory=path.join(directory,options.attempt===2?'known-service-v3-verification-retry-1':'known-service'),state=await runAdaptiveCampaign({directory:campaignDirectory,manifest:{targets:[applyResearchHandoff(baseTarget,handoffs[target.id])],conditionalFollowupTargets:[]},profile:'PRODUCTION',...(options.attempt===2?{budgetScope:'CAMPAIGN',initialUsage:options.initialUsage}:{}),providerPricingRouteMemory,createAdapters:args=>adapters({...args,stage:'KNOWN_SERVICE_CHILD'}),onTransition:()=>{if(shouldStop())throw Error('PRICE_RESEARCH_STOPPED');}});learnProviderPricingRoutesFromTarget({memory:providerPricingRouteMemory,target:state.targets?.[target.id],directory:path.join(campaignDirectory,'targets',target.id,'open-web-discovery')});return state;};return runPipeline({targets:[target],execute});
}

export async function executePriceResearch(options){
 if(options.job?.config?.targetKind==='CANONICAL_SELECTION')return executePriceResearchBatch({...options,executeTarget:executeSinglePriceResearch});
 return executeSinglePriceResearch(options);
}
