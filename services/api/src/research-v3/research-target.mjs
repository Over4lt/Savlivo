// Orchestration identity only. A research seed is never a Service, Truth fact,
// catalog owner, or market-availability assertion.
import {canonical,normalizeUrl} from './model.mjs';

export const researchTargetKinds=Object.freeze({KNOWN_SERVICE:'KNOWN_SERVICE',PROVIDER_OR_BRAND_SEED:'PROVIDER_OR_BRAND_SEED'});
export const serviceDiscoveryObjective='SUBSCRIPTION_SERVICE_DISCOVERY';
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const clean=(value,max=120)=>typeof value==='string'&&value===value.trim()&&value.length>0&&value.length<=max?value:null;
const market=value=>typeof value==='string'&&/^[A-Z]{2}$/.test(value)?value:null;

export function createResearchTarget(input){
 if(!object(input)||!Object.values(researchTargetKinds).includes(input.targetKind))throw Error('RESEARCH_TARGET_INVALID');
 const seedName=clean(input.seedName),targetMarket=market(input.targetMarket);if(!seedName||!targetMarket)throw Error('RESEARCH_TARGET_INVALID');
 if(input.targetKind===researchTargetKinds.KNOWN_SERVICE){
  if(!clean(input.serviceId,256)||!clean(input.serviceName)||Object.keys(input).some(key=>!['targetKind','seedName','targetMarket','serviceId','serviceName'].includes(key)))throw Error('KNOWN_SERVICE_TARGET_INVALID');
  return Object.freeze({targetKind:input.targetKind,seedName,targetMarket,serviceId:input.serviceId,serviceName:input.serviceName});
 }
 if(Object.hasOwn(input,'serviceId')||Object.hasOwn(input,'serviceName')||Object.keys(input).some(key=>!['targetKind','seedName','targetMarket'].includes(key)))throw Error('PROVIDER_SEED_CANNOT_DECLARE_SERVICE');
 return Object.freeze({targetKind:input.targetKind,seedName,targetMarket});
}

export const knownServiceResearchTarget=({serviceId,serviceName,targetMarket,seedName=serviceName})=>createResearchTarget({targetKind:researchTargetKinds.KNOWN_SERVICE,seedName,targetMarket,serviceId,serviceName});
export const providerOrBrandResearchTarget=({seedName,targetMarket})=>createResearchTarget({targetKind:researchTargetKinds.PROVIDER_OR_BRAND_SEED,seedName,targetMarket});

export function researchTargetFromLegacyService(target){
 if(!object(target))throw Error('KNOWN_SERVICE_TARGET_INVALID');
 return knownServiceResearchTarget({serviceId:target.service??target.serviceId,serviceName:target.serviceName,targetMarket:target.market??target.targetMarket,seedName:target.seedName??target.serviceName});
}

export function serviceObjectiveForResearchTarget(target,{providerHosts=[],candidateHosts=[],seeds=[],kind='PRICE'}={}){
 const normalized=createResearchTarget(target);
 if(normalized.targetKind!==researchTargetKinds.KNOWN_SERVICE)throw Error('SUBSCRIPTION_SERVICE_DISCOVERY_REQUIRED');
 return {kind,serviceId:normalized.serviceId,serviceName:normalized.serviceName,providerHosts:[...providerHosts],candidateHosts:[...candidateHosts],markets:[normalized.targetMarket],seeds:[...seeds]};
}

export function providerSeedCampaignState(target,{providerAuthorityBinding=null,providerResources=[]}={}){
 const normalized=createResearchTarget(target);
 if(normalized.targetKind!==researchTargetKinds.PROVIDER_OR_BRAND_SEED)throw Error('PROVIDER_SEED_TARGET_REQUIRED');
 if(!Array.isArray(providerResources))throw Error('PROVIDER_RESOURCE_SCOPE_INVALID');
 if(providerAuthorityBinding){
  if(providerAuthorityBinding.contractVersion!==1||providerAuthorityBinding.researchTarget?.targetKind!==normalized.targetKind||canonical(providerAuthorityBinding.researchTarget)!==canonical(normalized)||!clean(providerAuthorityBinding.providerIdentity?.presentationName)||!normalizeUrl(providerAuthorityBinding.proof?.url)||new URL(providerAuthorityBinding.proof.url).hostname!==providerAuthorityBinding.host||providerAuthorityBinding.proof.scope!=='EXACT_HOST_PROVIDER_SOURCING')throw Error('PROVIDER_BINDING_INVALID');
 }
 if(providerResources.length&&!providerAuthorityBinding)throw Error('PROVIDER_BINDING_REQUIRED');
 for(const row of providerResources)if(!object(row)||row.scope!=='PROVIDER'||row.service!==null||canonical(row.researchTarget)!==canonical(normalized)||row.host!==providerAuthorityBinding.host||canonical(row.authority?.binding)!==canonical(providerAuthorityBinding)||row.meaning!=='ROUTING_ONLY_REQUIRES_FRESH_ACQUISITION'||row.resource?.reacquisition!=='REQUIRED')throw Error('PROVIDER_RESOURCE_SCOPE_INVALID');
 return {
  contractVersion:1,
  researchTarget:structuredClone(normalized),
  providerAuthority:providerAuthorityBinding?{status:'ESTABLISHED',binding:structuredClone(providerAuthorityBinding)}:{status:'UNRESOLVED',binding:null},
  providerResources:structuredClone(providerResources),
  services:[],
  serviceDiscovery:{objective:serviceDiscoveryObjective,status:providerAuthorityBinding?'PROVIDER_ESTABLISHED_SERVICE_DISCOVERY_REQUIRED':'PROVIDER_AUTHORITY_REQUIRED'},
  productionEligible:false
 };
}
