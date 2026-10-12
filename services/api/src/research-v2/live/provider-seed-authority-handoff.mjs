// Durable representation bridge from one provider-seed campaign into ordinary
// KNOWN_SERVICE research. It replays the existing provider and Service reviews;
// it does not create authority, market, catalog, price, or Truth semantics.
import fs from 'node:fs';
import path from 'node:path';
import {canonical,digest} from '../../research-v3/model.mjs';
import {reviewProviderSeedAuthority,reviewProviderSeedAuthorityWithDiagnostic} from '../../research-v3/provider-authority-review.mjs';
import {rehydrateSubscriptionService} from '../../research-v3/subscription-service-admission.mjs';
import {installRunScopedProviderSeedAuthority} from './provider-routing-authority.mjs';

const publicObservation=observation=>{const copy=structuredClone(observation);delete copy.body;return copy;};
const bodyPath=(root,sha256)=>path.join(root,'provider-seed-evidence','bodies',sha256+'.txt');
export function retainProviderSeedObservation(root,observation){
 if(typeof observation?.body!=='string'||digest(observation.body)!==observation.sha256)throw Error('PROVIDER_SEED_HANDOFF_SOURCE_INVALID');
 const file=bodyPath(root,observation.sha256);fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
 if(fs.existsSync(file)){if(fs.lstatSync(file).isSymbolicLink()||digest(fs.readFileSync(file,'utf8'))!==observation.sha256)throw Error('PROVIDER_SEED_HANDOFF_SOURCE_INVALID');}
 else{const fd=fs.openSync(file,'wx',0o600);try{fs.writeSync(fd,observation.body);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
 return {path:path.relative(root,file),sha256:observation.sha256};
}
export function restoreProviderSeedObservation(root,metadata,reference){
 if(!/^provider-seed-evidence\/bodies\/[a-f0-9]{64}\.txt$/.test(reference?.path??'')||reference.sha256!==metadata?.sha256)throw Error('PROVIDER_SEED_HANDOFF_SOURCE_INVALID');
 const base=path.join(path.resolve(root),'provider-seed-evidence','bodies'),file=path.resolve(root,reference.path);if(!file.startsWith(base+path.sep)||!fs.existsSync(file)||fs.lstatSync(file).isSymbolicLink())throw Error('PROVIDER_SEED_HANDOFF_SOURCE_INVALID');
 const body=fs.readFileSync(file,'utf8');if(digest(body)!==reference.sha256)throw Error('PROVIDER_SEED_HANDOFF_SOURCE_INVALID');return {...structuredClone(metadata),body};
}

export function restoreProviderSeedCandidateReview(root,review){
 if(typeof review?.observation!=='string'||review.observationMetadata?.id!==review.observation||review.observationMetadata?.sha256!==review.bodySha256||review.bodyReference?.sha256!==review.bodySha256)throw Error('PROVIDER_SEED_CANDIDATE_REVIEW_INVALID');
 return restoreProviderSeedObservation(root,review.observationMetadata,review.bodyReference);
}

export function replayProviderSeedCandidateReview({root,review,researchTarget,candidateHosts}){
 const observation=restoreProviderSeedCandidateReview(root,review);
 return reviewProviderSeedAuthorityWithDiagnostic(observation,researchTarget,{candidateHosts});
}

export function createProviderSeedAuthorityHandoff({root,researchTarget,providerAuthorityBinding,service,authorityObservation,providerObservation}){
 const authorityReference=retainProviderSeedObservation(root,authorityObservation),providerReference=retainProviderSeedObservation(root,providerObservation),reviewed=reviewProviderSeedAuthority(authorityObservation,researchTarget,{candidateHosts:[providerAuthorityBinding?.host]});
 if(!reviewed||canonical(reviewed)!==canonical(providerAuthorityBinding))throw Error('PROVIDER_SEED_HANDOFF_AUTHORITY_INVALID');
 const admission=rehydrateSubscriptionService({admission:{status:'ADMITTED',service},observation:providerObservation,researchTarget,providerAuthorityBinding});if(admission.status!=='ADMITTED'||canonical(admission.service)!==canonical(service))throw Error('PROVIDER_SEED_HANDOFF_SERVICE_INVALID');
 return {contractVersion:1,researchTarget:structuredClone(researchTarget),providerAuthorityBinding:structuredClone(providerAuthorityBinding),service:structuredClone(service),authorityProof:{observation:publicObservation(authorityObservation),bodyReference:authorityReference},serviceProof:{observation:publicObservation(providerObservation),bodyReference:providerReference}};
}

// Production research handoff. Candidate service identity is scheduling metadata;
// it is deliberately not a Service admission or a Truth claim.
export function createProviderSeedResearchHandoff({root,researchTarget,providerAuthorityBinding,candidateService,authorityObservation,providerObservations}){
 const reviewed=reviewProviderSeedAuthority(authorityObservation,researchTarget,{candidateHosts:[providerAuthorityBinding?.host]});
 if(!reviewed||canonical(reviewed)!==canonical(providerAuthorityBinding))throw Error('PROVIDER_SEED_HANDOFF_AUTHORITY_INVALID');
 if(!candidateService?.serviceId||!candidateService?.serviceName||!Array.isArray(providerObservations)||!providerObservations.length)throw Error('PROVIDER_SEED_RESEARCH_HANDOFF_INVALID');
 const evidence=providerObservations.map(observation=>{
  if(observation?.kind!=='PROVIDER'||observation.outcome!=='OK'||observation.truncated||observation.completeness!=='COMPLETE'||digest(observation.body)!==observation.sha256||new URL(observation.url).hostname!==providerAuthorityBinding.host)throw Error('PROVIDER_SEED_RESEARCH_HANDOFF_INVALID');
  return {observation:publicObservation(observation),bodyReference:retainProviderSeedObservation(root,observation)};
 });
 return {contractVersion:2,researchTarget:structuredClone(researchTarget),providerAuthorityBinding:structuredClone(providerAuthorityBinding),candidateService:structuredClone(candidateService),authorityProof:{observation:publicObservation(authorityObservation),bodyReference:retainProviderSeedObservation(root,authorityObservation)},providerEvidence:evidence};
}

export function rehydrateProviderSeedAuthorityHandoff({root,target,handoff}){
 if(![1,2].includes(handoff?.contractVersion)||handoff.researchTarget?.targetMarket!==target.market)throw Error('PROVIDER_SEED_HANDOFF_INVALID');
 const authorityObservation=restoreProviderSeedObservation(root,handoff.authorityProof?.observation,handoff.authorityProof?.bodyReference);
 const binding=reviewProviderSeedAuthority(authorityObservation,handoff.researchTarget,{candidateHosts:[handoff.providerAuthorityBinding?.host]});if(!binding||canonical(binding)!==canonical(handoff.providerAuthorityBinding))throw Error('PROVIDER_SEED_HANDOFF_AUTHORITY_INVALID');
 if(handoff.contractVersion===1){
  if(handoff.service?.serviceId!==target.service||handoff.service?.serviceName!==target.serviceName)throw Error('PROVIDER_SEED_HANDOFF_INVALID');
  const providerObservation=restoreProviderSeedObservation(root,handoff.serviceProof?.observation,handoff.serviceProof?.bodyReference),admission=rehydrateSubscriptionService({admission:{status:'ADMITTED',service:handoff.service},observation:providerObservation,researchTarget:handoff.researchTarget,providerAuthorityBinding:binding});if(admission.status!=='ADMITTED'||canonical(admission.service)!==canonical(handoff.service))throw Error('PROVIDER_SEED_HANDOFF_SERVICE_INVALID');
  installRunScopedProviderSeedAuthority(target,{contractVersion:1,researchTarget:handoff.researchTarget,providerAuthorityBinding:binding,service:admission.service,authorityObservation,providerObservation});
  return {providerAuthorityBinding:binding,service:admission.service,authorityObservation,providerObservation,providerObservations:[providerObservation]};
 }
 if(handoff.candidateService?.serviceId!==target.service||handoff.candidateService?.serviceName!==target.serviceName||!Array.isArray(handoff.providerEvidence)||!handoff.providerEvidence.length)throw Error('PROVIDER_SEED_RESEARCH_HANDOFF_INVALID');
 const providerObservations=handoff.providerEvidence.map(row=>restoreProviderSeedObservation(root,row.observation,row.bodyReference));
 if(providerObservations.some(observation=>observation.kind!=='PROVIDER'||observation.outcome!=='OK'||observation.truncated||observation.completeness!=='COMPLETE'||digest(observation.body)!==observation.sha256||new URL(observation.url).hostname!==binding.host))throw Error('PROVIDER_SEED_RESEARCH_HANDOFF_INVALID');
 const review={contractVersion:2,researchTarget:handoff.researchTarget,providerAuthorityBinding:binding,candidateService:handoff.candidateService,authorityObservation,providerObservations};installRunScopedProviderSeedAuthority(target,review);
 return {providerAuthorityBinding:binding,candidateService:structuredClone(handoff.candidateService),authorityObservation,providerObservation:providerObservations[0],providerObservations};
}
