// Run-scoped routing permission. Historical reviewed authority remains distinct
// from autonomous V3 exact-host authority; neither is market or Truth evidence.
import {canonical,normalizeUrl} from '../../research-v3/model.mjs';
import {reviewCandidateAuthority,reviewProviderSeedAuthority} from '../../research-v3/provider-authority-review.mjs';
import {rehydrateSubscriptionService} from '../../research-v3/subscription-service-admission.mjs';

const autonomous=new WeakMap();
const providerSeed=new WeakMap();
const historical=(target,host)=>(target.authorities??[]).find(row=>row.hostname===host&&row.provider===target.serviceName&&row.checkedAt&&['OFFICIAL_PROVIDER','OFFICIAL_SUPPORT'].includes(row.sourceType));
const objective=(target,host)=>({kind:'PRICE',serviceId:target.service,serviceName:target.serviceName,providerHosts:[],candidateHosts:[host],markets:[],seeds:[]});

export function validatedV3ProviderAuthorityBinding(target,review){
 const binding=review?.providerAuthorityBinding,observation=review?.candidateObservation,host=binding?.host;
 const expected=host&&reviewCandidateAuthority(observation,objective(target,host));
 if(review?.contractVersion!==1||!expected||canonical(expected)!==canonical(binding))throw Error('V3_AUTONOMOUS_AUTHORITY_REQUIRED');
 return structuredClone(binding);
}

export function installRunScopedV3ProviderAuthority(target,review){
 const binding=validatedV3ProviderAuthorityBinding(target,review);
 const records=autonomous.get(target)??[];
 if(!records.some(row=>canonical(row.providerAuthorityBinding)===canonical(binding)))records.push(structuredClone(review));
 autonomous.set(target,records);
 return structuredClone(binding);
}

export function installRunScopedProviderSeedAuthority(target,review){
 const binding=review?.providerAuthorityBinding,expected=reviewProviderSeedAuthority(review?.authorityObservation,review?.researchTarget,{candidateHosts:[binding?.host]}),admission=rehydrateSubscriptionService({admission:{status:'ADMITTED',service:review?.service},observation:review?.providerObservation,researchTarget:review?.researchTarget,providerAuthorityBinding:binding});
 if(review?.contractVersion!==1||!expected||canonical(expected)!==canonical(binding)||admission.status!=='ADMITTED'||admission.service.serviceId!==target.service||admission.service.serviceName!==target.serviceName)throw Error('PROVIDER_SEED_HANDOFF_REQUIRED');
 const records=providerSeed.get(target)??[];if(!records.some(row=>canonical(row.providerAuthorityBinding)===canonical(binding)))records.push(structuredClone(review));providerSeed.set(target,records);return structuredClone(binding);
}

export function providerRoutingAuthority(target,url){
 const normalized=normalizeUrl(url);if(!normalized)return null;const host=new URL(normalized).hostname,reviewed=historical(target,host);
 if(reviewed)return {provenance:'HISTORICAL_REVIEWED_PROVIDER',host,authority:reviewed};
 for(const record of autonomous.get(target)??[]){
  const binding=record.providerAuthorityBinding,expected=reviewCandidateAuthority(record.candidateObservation,objective(target,host));
  if(binding?.host===host&&expected&&canonical(expected)===canonical(binding))return {provenance:'V3_AUTONOMOUS_CANDIDATE_REVIEW',host,binding:structuredClone(binding)};
 }
 for(const record of providerSeed.get(target)??[]){const binding=record.providerAuthorityBinding,expected=reviewProviderSeedAuthority(record.authorityObservation,record.researchTarget,{candidateHosts:[host]}),admission=rehydrateSubscriptionService({admission:{status:'ADMITTED',service:record.service},observation:record.providerObservation,researchTarget:record.researchTarget,providerAuthorityBinding:binding});if(binding?.host===host&&expected&&canonical(expected)===canonical(binding)&&admission.status==='ADMITTED'&&admission.service.serviceId===target.service)return {provenance:'SOURCE_BOUND_SUBSCRIPTION_SERVICE_DISCOVERY',host,binding:structuredClone(binding)};}
 return null;
}

// Revalidate the run-scoped V3 proof at the exact URL being consumed, then
// project only the authority fields expected by the existing V2 adapters.
export function autonomousProviderAuthorityDecision(target,url){
 const normalized=normalizeUrl(url),routing=normalized&&providerRoutingAuthority(target,normalized);
 if(!['V3_AUTONOMOUS_CANDIDATE_REVIEW','SOURCE_BOUND_SUBSCRIPTION_SERVICE_DISCOVERY'].includes(routing?.provenance))return null;
 return {eligible:true,url:normalized,reason:routing.provenance==='V3_AUTONOMOUS_CANDIDATE_REVIEW'?'V3_AUTONOMOUS_FIRST_PARTY_PRESENTATION':'SOURCE_BOUND_SUBSCRIPTION_SERVICE_DISCOVERY',providerAuthorityBinding:structuredClone(routing.binding),authority:{service:target.service,provider:target.serviceName,hostname:routing.host,role:'OFFICIAL_PROVIDER',validated:true,authorityScope:'EXACT_HOST_PROVIDER_SOURCING',reference:{kind:routing.provenance,binding:structuredClone(routing.binding)}}};
}

export function hasProviderRoutingAuthority(target){
 if((target.authorities??[]).some(row=>row.provider===target.serviceName&&row.checkedAt&&['OFFICIAL_PROVIDER','OFFICIAL_SUPPORT'].includes(row.sourceType)))return true;
 return [...(autonomous.get(target)??[]),...(providerSeed.get(target)??[])].some(record=>providerRoutingAuthority(target,record.providerAuthorityBinding?.proof?.url??record.providerAuthorityBinding?.url));
}

export const runScopedV3ProviderBindings=target=>[...(autonomous.get(target)??[]),...(providerSeed.get(target)??[])].map(record=>structuredClone(record.providerAuthorityBinding));
