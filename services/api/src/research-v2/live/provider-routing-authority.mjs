// Run-scoped routing permission. Historical reviewed authority remains distinct
// from autonomous V3 exact-host authority; neither is market or Truth evidence.
import {canonical,normalizeUrl} from '../../research-v3/model.mjs';
import {reviewCandidateAuthority} from '../../research-v3/provider-authority-review.mjs';

const autonomous=new WeakMap();
const historical=(target,host)=>(target.authorities??[]).find(row=>row.hostname===host&&row.provider===target.serviceName&&row.checkedAt&&['OFFICIAL_PROVIDER','OFFICIAL_SUPPORT'].includes(row.sourceType));
const objective=(target,host)=>({kind:'PRICE',serviceId:target.service,serviceName:target.serviceName,providerHosts:[],candidateHosts:[host],markets:[],seeds:[]});

export function installRunScopedV3ProviderAuthority(target,review){
 const binding=review?.providerAuthorityBinding,observation=review?.candidateObservation,host=binding?.host;
 const expected=host&&reviewCandidateAuthority(observation,objective(target,host));
 if(review?.contractVersion!==1||!expected||canonical(expected)!==canonical(binding))throw Error('V3_AUTONOMOUS_AUTHORITY_REQUIRED');
 const records=autonomous.get(target)??[];
 if(!records.some(row=>canonical(row.providerAuthorityBinding)===canonical(binding)))records.push(structuredClone(review));
 autonomous.set(target,records);
 return structuredClone(binding);
}

export function providerRoutingAuthority(target,url){
 const normalized=normalizeUrl(url);if(!normalized)return null;const host=new URL(normalized).hostname,reviewed=historical(target,host);
 if(reviewed)return {provenance:'HISTORICAL_REVIEWED_PROVIDER',host,authority:reviewed};
 for(const record of autonomous.get(target)??[]){
  const binding=record.providerAuthorityBinding,expected=reviewCandidateAuthority(record.candidateObservation,objective(target,host));
  if(binding?.host===host&&expected&&canonical(expected)===canonical(binding))return {provenance:'V3_AUTONOMOUS_CANDIDATE_REVIEW',host,binding:structuredClone(binding)};
 }
 return null;
}

export function hasProviderRoutingAuthority(target){
 if((target.authorities??[]).some(row=>row.provider===target.serviceName&&row.checkedAt&&['OFFICIAL_PROVIDER','OFFICIAL_SUPPORT'].includes(row.sourceType)))return true;
 return (autonomous.get(target)??[]).some(record=>providerRoutingAuthority(target,record.providerAuthorityBinding?.url));
}

export const runScopedV3ProviderBindings=target=>(autonomous.get(target)??[]).map(record=>structuredClone(record.providerAuthorityBinding));
