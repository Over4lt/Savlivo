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
async function executeSinglePriceResearch({job,directory,apiKey,client,shouldStop=()=>false}){
 const config=job.config,adapters=await createPriceResearchAdapters({market:config.market,capabilities:config.capabilities}),runPipeline=({targets,execute})=>runAdminV4FirstResearch({targets,artifactDirectory:directory,apiKey,runDownstream:async({handoffs})=>{const adaptive=await execute(handoffs);return {result:adaptive,v3Results:v3Results(adaptive,targets)};}});
 if(shouldStop())throw Error('PRICE_RESEARCH_STOPPED');
 if(config.targetKind==='PROVIDER_OR_BRAND_SEED')return runProviderSeedCampaign({directory:path.join(directory,'provider-seed'),researchTarget:providerOrBrandResearchTarget({seedName:config.seedName,targetMarket:config.market}),createAdapters:adapters,capabilities:config.capabilities,persistResearchIdentity:payload=>admitDurableResearchIdentity(payload,{client}),runResearch:runPipeline,onTransition:()=>{if(shouldStop())throw Error('PRICE_RESEARCH_STOPPED');},profile:'PRODUCTION'});
 const resolved=await resolvePriceResearchIdentity(config.serviceId,{client});if(resolved.status!=='RESEARCHABLE')throw Error('PRICE_RESEARCH_IDENTITY_REVOKED');const target={id:`price-research:${resolved.identity.serviceId}:${config.market}`,service:resolved.identity.serviceId,serviceName:resolved.identity.serviceName,market:config.market,marketApplicabilityEstablished:false},execute=(handoffs={})=>runAdaptiveCampaign({directory:path.join(directory,'known-service'),manifest:{targets:[applyResearchHandoff({...target,operationsObjective:'PRICE_RESEARCH',researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},urls:[],knownCommercialUrls:[],authorities:[],gaps:['plan','amount','currency','cadence','priceRole','ownership','market'],reads:[],queries:[],decisions:[],verified:[],blockedOrigins:[],capabilities:config.capabilities},handoffs[target.id])],conditionalFollowupTargets:[]},profile:'PRODUCTION',createAdapters:args=>adapters({...args,stage:'KNOWN_SERVICE_CHILD'}),onTransition:()=>{if(shouldStop())throw Error('PRICE_RESEARCH_STOPPED');}});return runPipeline({targets:[target],execute});
}

export async function executePriceResearch(options){
 if(options.job?.config?.targetKind==='CANONICAL_SELECTION')return executePriceResearchBatch({...options,executeTarget:executeSinglePriceResearch});
 return executeSinglePriceResearch(options);
}
