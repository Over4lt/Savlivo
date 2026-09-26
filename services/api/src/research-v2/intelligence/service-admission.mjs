// Product admission, not research candidacy or provider-price verification.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {adjudicateProposition,evidencePolicyVersion} from './evidence-persistence.mjs';
import {inspectServiceAdmission} from './service-admission-source.mjs';
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const manifestBytes=fs.readFileSync(new URL('../../../../../docs/product/service-universe-manifest.json',import.meta.url),'utf8');
const manifest=JSON.parse(manifestBytes);
export const admissionVersion='SERVICE_ADMISSION_V1';
export const admissionEvidenceVersion='SOURCE_BOUND_SERVICE_QUALIFICATION_V1';
export const admissionContract=Object.freeze({id:manifest.id,version:manifest.version,sha256:hash(manifestBytes),minimumUsers:manifest.admission.criteria.service_size.minimum_users,corroborationThreshold:manifest.evidence_policy.corroboration_threshold,evidencePolicyVersion});
if(admissionContract.corroborationThreshold!==3||admissionContract.minimumUsers!==100000||manifest.admission.all_required!==true||manifest.pricing.provider_price_required_for_admission!==false)throw Error('SERVICE_ADMISSION_MANIFEST_UNSUPPORTED');
export const admissionDimensions=Object.freeze(['serviceSize','monthlyRecurring','accountLogin','membershipManagement']);
const sha=/^[a-f0-9]{64}$/;

// This envelope is produced only after source-byte validation. Replay rechecks the
// version, contract, authority, age and digest, never a legacy qualification boolean.
export function sealAdmissionEvidence(value){const payload=JSON.parse(JSON.stringify({...value,version:admissionEvidenceVersion,contractHash:admissionContract.sha256}));return {...payload,digest:hash(payload)};}
export function evaluateServiceAdmission(service,evidence=[],{at=Date.now(),maxAgeDays=30,authorities,invalidatedEvidence=[],prior=[]}={}){
 const valid=[],rejected=[];
 for(const proof of [...new Map((Array.isArray(evidence)?evidence:[]).map(p=>[p?.digest,p])).values()]){
  const {digest,...payload}=proof??{};let reason=null;
  if(payload.version!==admissionEvidenceVersion||payload.contractHash!==admissionContract.sha256||digest!==hash(payload))reason='QUALIFICATION_REVALIDATION_REQUIRED';
  else if(payload.service!==service||!sha.test(payload.sourceHash??'')||payload.reference?.hash!==payload.sourceHash||payload.authority?.status!=='CONFIGURED_REVIEWED'||payload.authority?.service!==service)reason='QUALIFICATION_SOURCE_UNBOUND';
  else {let host;try{host=new URL(payload.url).hostname;}catch{}if(!host||host!==payload.authority.hostname||authorities&&!authorities.some(a=>a.hostname===host&&a.provider===payload.authority.provider&&/^OFFICIAL_/.test(a.sourceType)))reason='QUALIFICATION_AUTHORITY_UNBOUND';}
  const age=Number(at)-Date.parse(payload.capturedAt??'');
  if(!reason&&(!Number.isFinite(age)||age<0||age>Math.min(maxAgeDays,30)*86400000))reason='QUALIFICATION_FRESHNESS_UNRESOLVED';
  if(!reason&&invalidatedEvidence.includes(payload.sourceHash))reason='QUALIFICATION_SOURCE_INVALIDATED';
  if(!reason){try{
   if(fs.statSync(payload.reference.path).size>8000000)throw Error('SOURCE_BOUND');
   const body=fs.readFileSync(payload.reference.path,'utf8');
   const derived=inspectServiceAdmission({body,sourceHash:payload.sourceHash,url:payload.url,service,serviceName:payload.authority.provider,authority:payload.authority,capturedAt:payload.capturedAt,reference:payload.reference});
   if(!derived||hash(derived.facts)!==hash(payload.facts)||derived.strength!==payload.strength||hash(derived.dependencyRoots)!==hash(payload.dependencyRoots))throw Error('SOURCE_CHANGED');
  }catch{reason='QUALIFICATION_SOURCE_REVALIDATION_REQUIRED';}}
  if(reason){rejected.push({url:payload.url??null,sourceHash:payload.sourceHash??null,reason});continue;}
  for(const fact of payload.facts??[])if(admissionDimensions.includes(fact.dimension)&&['ESTABLISHED','DISQUALIFIED','UNRESOLVED'].includes(fact.status)&&fact.quote&&Number.isInteger(fact.locator?.offset))valid.push({...fact,source:{url:payload.url,sourceHash:payload.sourceHash,reference:payload.reference,capturedAt:payload.capturedAt,authority:payload.authority},proofDigest:digest,strength:payload.strength??'DIRECT',dependencies:[...(payload.dependencyRoots??['provider:'+service]),'body:'+payload.sourceHash,'statement:'+hash(fact.quote.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim())]});
 }
 const dimensions=Object.fromEntries(admissionDimensions.map(d=>{
  const facts=valid.filter(f=>f.dimension===d),proposition=JSON.stringify([service,d,d==='serviceSize'?admissionContract.minimumUsers:d==='monthlyRecurring'?'CONSUMER_PROVIDER_BILLED_P1M':'SUBSCRIBER_ACCOUNT']);
  const decision=adjudicateProposition({proposition,contractHash:admissionContract.sha256,threshold:admissionContract.corroborationThreshold,
   observations:facts.filter(f=>f.status!=='UNRESOLVED').map(f=>({id:hash([f.proofDigest,f.locator,d,f.status]),proposition,polarity:f.status==='ESTABLISHED'?'POSITIVE':'NEGATIVE',strength:f.strength,dependencies:f.dependencies,evidence:f})),
   prior:prior.filter(p=>p?.version===admissionVersion&&p.service===service).map(p=>p.dimensions?.[d]?.decision?.receipt),
   validate:o=>validDimensionFact(d,o.evidence)&&o.evidence.status===(o.polarity==='POSITIVE'?'ESTABLISHED':'DISQUALIFIED')});
  const persisted=decision.receipt?.observations.map(o=>o.evidence)??[];
  const all=[...new Map([...persisted,...facts].map(f=>[hash([f.proofDigest,f.locator,d,f.status]),f])).values()];
  return [d,{status:decision.status,reasons:decision.status==='ESTABLISHED'?[]:[decision.reason,...new Set(all.map(f=>f.reason).filter(Boolean))],evidence:all,decision}];
 }));
 const status=Object.values(dimensions).every(d=>d.status==='ESTABLISHED')?'ESTABLISHED':Object.values(dimensions).some(d=>d.status==='DISQUALIFIED')?'DISQUALIFIED':'UNRESOLVED';
 return {version:admissionVersion,contract:admissionContract,service,status,dimensions,reasons:Object.entries(dimensions).filter(([,d])=>d.status!=='ESTABLISHED').map(([dimension,d])=>({dimension,status:d.status,reasons:d.reasons})),rejectedEvidence:rejected,providerPriceRequired:false,cancellationRequired:false,researchCandidacy:'RESEARCH_ONLY_UNLESS_ADMISSION_ESTABLISHED'};
}
export function revalidateTargetAdmission(target,options={}){
 target.serviceAdmission=evaluateServiceAdmission(target.service,target.serviceAdmissionEvidence??[],{authorities:target.authorities,maxAgeDays:target.retainedMaxAgeDays??30,invalidatedEvidence:target.invalidatedEvidence??[],prior:[target.serviceAdmission],...options});
 target.productionEligible=target.serviceAdmission.status==='ESTABLISHED';
 target.pricingExposure=target.productionEligible?'ADMITTED_SERVICE_PRICING':'RESEARCH_HYPOTHESIS_ONLY';
 return target.serviceAdmission;
}
export function mergeAdmissionEvidence(target,proof,options={}){
 target.serviceAdmissionEvidence??=[];
 if(proof&&!target.serviceAdmissionEvidence.some(p=>p.digest===proof.digest))target.serviceAdmissionEvidence.push(proof);
 return revalidateTargetAdmission(target,options);
}

// Recheck typed semantics even for persisted receipts. Receipt integrity protects
// the original validation record; missing current metadata is not a counterfact.
function validDimensionFact(d,f){
 if(f?.dimension!==d||!f.quote||!sha.test(f.source?.sourceHash??'')||f.source?.authority?.status!=='CONFIGURED_REVIEWED')return false;
 if(f.status==='DISQUALIFIED'){
  if(d==='serviceSize')return f.scope==='EXACT_SERVICE'&&['exact','up to','fewer than'].includes(f.qualifier)&&f.count<admissionContract.minimumUsers;
  if(d==='monthlyRecurring')return f.scope==='ALL_SERVICE_CONSUMER_OFFERS'&&f.reason==='SERVICE_EXPLICITLY_NON_MONTHLY';
  return f.scope==='ALL_SERVICE_SUBSCRIBERS'&&f.reason===(d==='accountLogin'?'SUBSCRIBER_LOGIN_EXPLICITLY_UNAVAILABLE':'ACCOUNT_MEMBERSHIP_MANAGEMENT_EXPLICITLY_UNAVAILABLE');
 }
 if(f.status!=='ESTABLISHED')return false;
 if(d==='monthlyRecurring')return f.billingInterval==='P1M'&&f.commercialRole==='CONSUMER_SUBSCRIPTION_BILLING';
 if(d==='serviceSize')return f.scope==='EXACT_SERVICE'&&['users','active users','members','customers','subscribers','paying subscribers'].includes(f.metric)&&['exact','over','more than','at least'].includes(f.qualifier)&&f.count>=admissionContract.minimumUsers;
 return f.reason===(d==='accountLogin'?'PROVIDER_ACCOUNT_LOGIN':'PROVIDER_ACCOUNT_MEMBERSHIP_MANAGEMENT');
}
