// Deterministic admission of a consumer subscription Service from one retained,
// exact-host provider observation. This boundary creates no price or market Truth.
import {canonical,digest,normalizeUrl} from './model.mjs';
import {createResearchTarget,providerSeedCampaignState,researchTargetKinds} from './research-target.mjs';

export const subscriptionServiceAdmissionContract=Object.freeze({contractVersion:1,objective:'SUBSCRIPTION_SERVICE_DISCOVERY',states:['ADMITTED','UNRESOLVED']});
const mechanisms=new Set(['JSON_LD','PROVIDER_NATIVE_JSON','NATIVE_HTML']);
const identities=new Set(['Service','SoftwareApplication','WebApplication','MobileApplication','Product']);
const relationships=new Set(['EXPLICIT_SUBSCRIPTION','EXPLICIT_MEMBERSHIP','RECURRING_OFFER_SPACE','SUBSCRIPTION_OFFER_CATALOG']);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const normalizedName=value=>typeof value==='string'?value.normalize('NFKC').replace(/\s+/gu,' ').trim():null;
export const canonicalServiceId=value=>{
 const name=normalizedName(value);if(!name)return null;
 return name.normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('en').replace(/\+/gu,' plus ').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/gu,'-')||null;
};
const failed=(reason,candidate=null)=>({contractVersion:1,status:'UNRESOLVED',reason,candidate:candidate?structuredClone(candidate):null,service:null});

function pointerValue(value,pointer){
 if(pointer==='')return value;if(typeof pointer!=='string'||!pointer.startsWith('/'))throw Error('SERVICE_DISCOVERY_LOCATOR_INVALID');
 let current=value;for(const token of pointer.slice(1).split('/').map(row=>row.replaceAll('~1','/').replaceAll('~0','~'))){if((!object(current)&&!Array.isArray(current))||!Object.hasOwn(current,token))throw Error('SERVICE_DISCOVERY_LOCATOR_INVALID');current=current[token];}return current;
}

function validLocator(body,locator){
 if(!object(locator))return false;
 if(locator.kind==='SPAN')return Number.isSafeInteger(locator.start)&&Number.isSafeInteger(locator.end)&&locator.start>=0&&locator.end>locator.start&&body.slice(locator.start,locator.end)===locator.quote&&digest(locator.quote)===locator.sha256;
 if(locator.kind!=='JSON_POINTER'||!object(locator.source)||!Number.isSafeInteger(locator.source.start)||!Number.isSafeInteger(locator.source.end)||locator.source.start<0||locator.source.end<=locator.source.start)return false;
 const raw=body.slice(locator.source.start,locator.source.end);if(digest(raw)!==locator.source.sha256)return false;
 try{return canonical(pointerValue(JSON.parse(raw),locator.pointer))===canonical(locator.value);}catch{return false;}
}

export function admitSubscriptionService({candidate,observation,researchTarget,providerAuthorityBinding}){
 let target;try{target=createResearchTarget(researchTarget);providerSeedCampaignState(target,{providerAuthorityBinding});}catch{return failed('PROVIDER_BINDING_REQUIRED',candidate);}
 if(target.targetKind!==researchTargetKinds.PROVIDER_OR_BRAND_SEED)return failed('PROVIDER_SEED_TARGET_REQUIRED',candidate);
 const url=normalizeUrl(observation?.url),body=observation?.body;
 if(observation?.kind!=='PROVIDER'||observation.semantic||observation.outcome!=='OK'||observation.truncated||observation.completeness!=='COMPLETE'||typeof body!=='string'||!body||digest(body)!==observation.sha256||!url||url!==observation.url||new URL(url).hostname!==providerAuthorityBinding.host)return failed('AUTHORITATIVE_PROVIDER_OBSERVATION_REQUIRED',candidate);
 const name=normalizedName(candidate?.identity?.name),type=candidate?.identity?.type,mechanism=candidate?.source?.mechanism,relationship=candidate?.subscription?.kind;
 if(!name||name.length<2||name.length>120||!identities.has(type))return failed('DISTINCT_SERVICE_IDENTITY_REQUIRED',candidate);
 if(!mechanisms.has(mechanism)||candidate.source.observation!==observation.id||candidate.source.url!==url||candidate.source.sha256!==observation.sha256||candidate.source.providerHost!==providerAuthorityBinding.host)return failed('SOURCE_BOUND_PROVENANCE_REQUIRED',candidate);
 if(!validLocator(body,candidate.identity.locator))return failed('SERVICE_IDENTITY_LOCATOR_INVALID',candidate);
 if(!relationships.has(relationship)||!validLocator(body,candidate.subscription.locator))return failed('SUBSCRIPTION_RELATIONSHIP_REQUIRED',candidate);
 if(candidate.ambiguous===true)return failed('AMBIGUOUS_SERVICE_IDENTITY',candidate);
 const serviceId=canonicalServiceId(name);if(!serviceId)return failed('DISTINCT_SERVICE_IDENTITY_REQUIRED',candidate);
 const bindingReference={host:providerAuthorityBinding.host,observation:providerAuthorityBinding.proof.observation,bodySha256:providerAuthorityBinding.proof.bodySha256,digest:digest(providerAuthorityBinding)};
 return {contractVersion:1,status:'ADMITTED',reason:'SOURCE_BOUND_CONSUMER_SUBSCRIPTION_SERVICE',service:{serviceId,serviceName:name,identityType:type,providerBinding:bindingReference,provenance:{providerObservation:observation.id,sourceUrl:url,bodySha256:observation.sha256,identity:structuredClone(candidate.identity.locator),subscription:structuredClone(candidate.subscription.locator),extractionMechanism:mechanism,relationship}},candidate:null};
}

export function rehydrateSubscriptionService({admission,observation,researchTarget,providerAuthorityBinding}){
 if(admission?.status!=='ADMITTED'||!admission.service?.provenance)return failed('SERVICE_ADMISSION_REQUIRED');
 const p=admission.service.provenance,candidate={identity:{name:admission.service.serviceName,type:admission.service.identityType,locator:p.identity},subscription:{kind:p.relationship,locator:p.subscription},source:{mechanism:p.extractionMechanism,observation:p.providerObservation,url:p.sourceUrl,sha256:p.bodySha256,providerHost:admission.service.providerBinding?.host},ambiguous:false};
 // Older/current records do not rely on an inferred type: retain it explicitly
 // when present, otherwise rehydration fails closed rather than broadening.
 if(!admission.service.identityType)return failed('SERVICE_IDENTITY_TYPE_REQUIRED');
 candidate.identity.type=admission.service.identityType;
 const current=admitSubscriptionService({candidate,observation,researchTarget,providerAuthorityBinding});
 return current.status==='ADMITTED'&&canonical(current.service)===canonical(admission.service)?current:failed('SERVICE_ADMISSION_REVALIDATION_FAILED');
}
