import {createHash} from 'node:crypto';
import path from 'node:path';
import {countryCurrencies} from '../../../../packages/contracts/src/markets.ts';
import {resolveCapabilities,capabilityPreflight} from '../research-v2/capabilities/config.mjs';
import {resolvePriceResearchIdentity,admitDurableResearchIdentity} from '../research-v3/research-identity-store.mjs';
import {providerOrBrandResearchTarget} from '../research-v3/research-target.mjs';
import {runProviderSeedCampaign} from '../research-v2/inventory/provider-seed-campaign.mjs';
import {runAdaptiveCampaign} from '../research-v2/inventory/adaptive-campaign.mjs';
import {runAdminV4FirstResearch,v3ResultFromTarget} from '../google-ai/admin-live-pipeline.mjs';
import {createPriceResearchAdapters} from './price-research-live.mjs';
import {applyResearchHandoff} from '../research-v2/inventory/reviewed-cohort-execution.mjs';

const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail=code=>{throw Object.assign(Error(code),{status:400});};
const capabilities=input=>{try{return resolveCapabilities(input);}catch{return fail('INVALID_CAPABILITIES');}};

export async function priceResearchPlan(input,{repo,root,client}={}){
 if(!input||typeof input!=='object'||Array.isArray(input)||input.objective!=='PRICE_RESEARCH'||Object.keys(input).some(key=>!['objective','targetKind','seedName','serviceId','market','capabilities'].includes(key)))fail('INVALID_PRICE_RESEARCH_CONFIG');
 if(typeof input.market!=='string'||!countryCurrencies[input.market])fail('INVALID_PRICE_RESEARCH_MARKET');
 const caps=capabilities(input.capabilities),seed=input.targetKind==='PROVIDER_OR_BRAND_SEED';let identity=null;
 if(seed){if(typeof input.seedName!=='string'||input.seedName.trim().length<2||input.seedName.trim().length>120||input.serviceId!==undefined)fail('INVALID_PROVIDER_SEED');}
 else if(input.targetKind==='KNOWN_SERVICE'){if(input.seedName!==undefined)fail('INVALID_PRICE_RESEARCH_IDENTITY');const resolved=await resolvePriceResearchIdentity(input.serviceId,{client});if(resolved.status!=='RESEARCHABLE')fail('UNKNOWN_PRICE_RESEARCH_IDENTITY');identity=resolved.identity;}
 else fail('INVALID_PRICE_RESEARCH_TARGET');
 const config={objective:'PRICE_RESEARCH',targetKind:input.targetKind,...(seed?{seedName:input.seedName.trim()}:{serviceId:identity.serviceId}),market:input.market,capabilities:caps},check=capabilityPreflight(caps),manifest={objective:'PRICE_RESEARCH',catalog:[],targets:identity?[{id:`price-research:${identity.serviceId}:${input.market}`,service:identity.serviceId,serviceName:identity.serviceName,market:input.market}]:[],priceResearch:{targetKind:input.targetKind,seedName:seed?config.seedName:null,identity,market:input.market},limits:{totalRequests:seed?192:96}};
 return {config,manifest,actionable:1,liveReady:check.ready,capabilityCheck:check,source:null,catalogHash:digest(manifest.priceResearch),servicesConsidered:1,servicesExpectedNetwork:1,totalSafetyCeiling:manifest.limits.totalRequests,discovery:caps.tavily,decodo:caps.decodo,browser:caps.browser,conflicts:[],runner:'PRICE_RESEARCH V4-first identity bridge',checkpoint:path.join(root,'runs')};
}

const v3Results=(state,targets)=>Object.fromEntries(targets.map(target=>[target.id,v3ResultFromTarget(state?.targets?.[target.id])]));
export async function executePriceResearch({job,directory,apiKey,client,shouldStop=()=>false}){
 const config=job.config,adapters=await createPriceResearchAdapters({market:config.market,capabilities:config.capabilities}),runPipeline=({targets,execute})=>runAdminV4FirstResearch({targets,artifactDirectory:directory,apiKey,runDownstream:async({handoffs})=>{const adaptive=await execute(handoffs);return {result:adaptive,v3Results:v3Results(adaptive,targets)};}});
 if(config.targetKind==='PROVIDER_OR_BRAND_SEED')return runProviderSeedCampaign({directory:path.join(directory,'provider-seed'),researchTarget:providerOrBrandResearchTarget({seedName:config.seedName,targetMarket:config.market}),createAdapters:adapters,capabilities:config.capabilities,persistResearchIdentity:payload=>admitDurableResearchIdentity(payload,{client}),runResearch:runPipeline,onTransition:()=>{if(shouldStop())throw Error('PRICE_RESEARCH_STOPPED');},profile:'PRODUCTION'});
 const resolved=await resolvePriceResearchIdentity(config.serviceId,{client});if(resolved.status!=='RESEARCHABLE')throw Error('PRICE_RESEARCH_IDENTITY_REVOKED');const target={id:`price-research:${resolved.identity.serviceId}:${config.market}`,service:resolved.identity.serviceId,serviceName:resolved.identity.serviceName,market:config.market},execute=(handoffs={})=>runAdaptiveCampaign({directory:path.join(directory,'known-service'),manifest:{targets:[applyResearchHandoff({...target,researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},urls:[],knownCommercialUrls:[],authorities:[],gaps:['plan','amount','currency','cadence','priceRole','ownership','market'],reads:[],queries:[],decisions:[],verified:[],blockedOrigins:[],capabilities:config.capabilities},handoffs[target.id])],conditionalFollowupTargets:[]},profile:'PRODUCTION',createAdapters:args=>adapters({...args,stage:'KNOWN_SERVICE_CHILD'})});return runPipeline({targets:[target],execute});
}
