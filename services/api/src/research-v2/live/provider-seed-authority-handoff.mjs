// Durable representation bridge from one provider-seed campaign into ordinary
// KNOWN_SERVICE research. It replays the existing provider and Service reviews;
// it does not create authority, market, catalog, price, or Truth semantics.
import fs from 'node:fs';
import path from 'node:path';
import {canonical,digest} from '../../research-v3/model.mjs';
import {reviewProviderSeedAuthority} from '../../research-v3/provider-authority-review.mjs';
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

export function createProviderSeedAuthorityHandoff({root,researchTarget,providerAuthorityBinding,service,authorityObservation,providerObservation}){
 const authorityReference=retainProviderSeedObservation(root,authorityObservation),providerReference=retainProviderSeedObservation(root,providerObservation),reviewed=reviewProviderSeedAuthority(authorityObservation,researchTarget,{candidateHosts:[providerAuthorityBinding?.host]});
 if(!reviewed||canonical(reviewed)!==canonical(providerAuthorityBinding))throw Error('PROVIDER_SEED_HANDOFF_AUTHORITY_INVALID');
 const admission=rehydrateSubscriptionService({admission:{status:'ADMITTED',service},observation:providerObservation,researchTarget,providerAuthorityBinding});if(admission.status!=='ADMITTED'||canonical(admission.service)!==canonical(service))throw Error('PROVIDER_SEED_HANDOFF_SERVICE_INVALID');
 return {contractVersion:1,researchTarget:structuredClone(researchTarget),providerAuthorityBinding:structuredClone(providerAuthorityBinding),service:structuredClone(service),authorityProof:{observation:publicObservation(authorityObservation),bodyReference:authorityReference},serviceProof:{observation:publicObservation(providerObservation),bodyReference:providerReference}};
}

export function rehydrateProviderSeedAuthorityHandoff({root,target,handoff}){
 if(handoff?.contractVersion!==1||handoff.service?.serviceId!==target.service||handoff.service?.serviceName!==target.serviceName||handoff.researchTarget?.targetMarket!==target.market)throw Error('PROVIDER_SEED_HANDOFF_INVALID');
 const authorityObservation=restoreProviderSeedObservation(root,handoff.authorityProof?.observation,handoff.authorityProof?.bodyReference),providerObservation=restoreProviderSeedObservation(root,handoff.serviceProof?.observation,handoff.serviceProof?.bodyReference);
 const binding=reviewProviderSeedAuthority(authorityObservation,handoff.researchTarget,{candidateHosts:[handoff.providerAuthorityBinding?.host]});if(!binding||canonical(binding)!==canonical(handoff.providerAuthorityBinding))throw Error('PROVIDER_SEED_HANDOFF_AUTHORITY_INVALID');
 const admission=rehydrateSubscriptionService({admission:{status:'ADMITTED',service:handoff.service},observation:providerObservation,researchTarget:handoff.researchTarget,providerAuthorityBinding:binding});if(admission.status!=='ADMITTED'||canonical(admission.service)!==canonical(handoff.service))throw Error('PROVIDER_SEED_HANDOFF_SERVICE_INVALID');
 installRunScopedProviderSeedAuthority(target,{contractVersion:1,researchTarget:handoff.researchTarget,providerAuthorityBinding:binding,service:admission.service,authorityObservation,providerObservation});
 return {providerAuthorityBinding:binding,service:admission.service};
}
