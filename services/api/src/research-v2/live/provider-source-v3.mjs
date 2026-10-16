// Shared retained-provider-source boundary into the existing V3 adapter and Truth.
// Country authority comes only from the canonical hash-verified G1 receipt.
import {authorityBinding} from '../../research-v3/discovery-authority.mjs';
import {adaptV2CurrentSource} from '../../research-v3/v2-current-source-adapter.mjs';
import {evaluate} from '../../research-v3/truth.mjs';
import {refreshCatalog} from '../../research-v3/subscription-catalog.mjs';
import {digest,normalizeUrl} from '../../research-v3/model.mjs';
import {extractNavigation} from '../../research-v3/discovery.mjs';
import {providerRoutingAuthority} from './provider-routing-authority.mjs';
import {classifyAcquiredSource} from './source-classification.mjs';
import {discoverSubscriptionServices} from '../../research-v3/subscription-service-discovery.mjs';
import {projectV3SuggestedCandidates} from '../../research-v3/suggested-projection.mjs';
import {sourceBoundLineageBindings} from '../../research-v3/source-lineage.mjs';

const allowedAccessFields=new Set(['decision','reason','boundary','httpStatus','rule']);
const hex=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const country=value=>typeof value==='string'&&/^[A-Z]{2}$/.test(value);
const fail=code=>{throw Error(code);};

function compactObservation(observation){
 return {id:observation.id,kind:observation.kind,url:observation.url,sha256:observation.sha256,context:observation.context,candidateCount:observation.candidates.length,nativeStructuredFacts:observation.nativeStructured?.facts?.length??0};
}

const normalized=value=>String(value??'').normalize('NFKC').replace(/\s+/gu,' ').trim().toLocaleLowerCase('en');
export function establishProviderSeedCandidateServiceContext({target,providerAuthorityBinding,observations}){
 const existing=target.providerSeedCandidateServiceContext;if(!existing||!target.providerSeedResearchTarget||!providerAuthorityBinding||!Array.isArray(observations)||!observations.length)return existing??null;
 const discovery=discoverSubscriptionServices({researchTarget:target.providerSeedResearchTarget,providerAuthorityBinding,observations}),anchor=existing.objectiveResource?.url,seed=normalized(target.providerSeedResearchTarget.seedName),ranked=discovery.services.map(service=>({service,anchor:Number(service.provenance?.sourceUrl===anchor),seed:Number(normalized(service.serviceName)===seed)})).sort((a,b)=>b.anchor-a.anchor||b.seed-a.seed||a.service.serviceId.localeCompare(b.service.serviceId)),selected=ranked[0]?.service??null;
 target.providerSeedCandidateServiceContext={...structuredClone(existing),status:selected?'CANDIDATE_SERVICE_UNDERSTOOD':'SERVICE_UNRESOLVED',serviceName:selected?.serviceName??existing.serviceName,sourceServiceId:selected?.serviceId??null,identityType:selected?.identityType??null,sourceRelationship:selected?{providerHost:selected.provenance.providerHost,sourceUrl:selected.provenance.sourceUrl,sourceHash:selected.provenance.sourceHash,providerObservation:selected.provenance.providerObservation,subscription:structuredClone(selected.provenance.subscription)}:null,unresolved:structuredClone(discovery.unresolved),truthAuthority:'NONE',admitted:false,researchPermission:false};
 return target.providerSeedCandidateServiceContext;
}

function providerSeedServiceUnderstanding({target,retained,observationId,contentType,accessDecisions}){
 const researchTarget=target.providerSeedResearchTarget,routing=researchTarget&&providerRoutingAuthority(target,retained.url);if(!researchTarget||!routing?.binding)return null;
 const body=retained.rawSource.text,observation={id:observationId+'-service',kind:'PROVIDER',authority:'REVIEWED_PROVIDER',url:retained.url,context:{transport:retained.networkGeography&&retained.networkGeography!=='UNBOUND'?'DECODO':'DIRECT',networkGeography:retained.networkGeography??'UNBOUND',representation:'PROVIDER_PAGE'},outcome:'OK',truncated:false,completeness:'COMPLETE',format:contentType.includes('json')?'JSON':'WEB',contentType,httpStatus:retained.httpStatus,access:accessDecisions,body,sha256:digest(body)},discovery=discoverSubscriptionServices({researchTarget,providerAuthorityBinding:routing.binding,observations:[observation]});
 const service=discovery.services[0]??null,context=target.providerSeedCandidateServiceContext;if(service&&context?.status!=='CANDIDATE_SERVICE_UNDERSTOOD')establishProviderSeedCandidateServiceContext({target,providerAuthorityBinding:routing.binding,observations:[observation]});const candidate=target.providerSeedCandidateServiceContext,understood=candidate?.status==='CANDIDATE_SERVICE_UNDERSTOOD'?{serviceId:target.service,sourceServiceId:candidate.sourceServiceId,serviceName:candidate.serviceName,identityType:candidate.identityType,provenance:structuredClone(candidate.sourceRelationship)}:service?{serviceId:target.service,sourceServiceId:service.serviceId,serviceName:service.serviceName,identityType:service.identityType,provenance:structuredClone(service.provenance)}:null;
 return {status:understood?'CANDIDATE_SERVICE_UNDERSTOOD':'SERVICE_UNRESOLVED',service:understood,candidateContext:candidate?structuredClone(candidate):null,unresolved:structuredClone(discovery.unresolved),sourceObservation:observation.id,truthAuthority:'NONE'};
}

export function evaluateProviderSourceTruth({target,retained,acquisition,observationId}){
 if(retained.truncated===true||retained.completeness==='INCOMPLETE')fail('PROVIDER_SOURCE_INCOMPLETE');
 const url=retained.url,host=new URL(url).hostname;
 const contentType=String(retained.contentType??'text/html').split(';')[0].trim().toLowerCase();
 const accessDecisions=retained.accessDecisions.map(row=>Object.fromEntries(Object.entries(row).filter(([key,value])=>allowedAccessFields.has(key)&&value!==undefined)));
 const serviceUnderstanding=providerSeedServiceUnderstanding({target,retained,observationId,contentType,accessDecisions}),serviceName=serviceUnderstanding?.service?.serviceName??target.providerSeedCandidateServiceContext?.serviceName??target.serviceName,objective={kind:'PRICE',serviceId:target.service,serviceName,providerHosts:[host],markets:[target.market],seeds:[target.providerSeedCandidateServiceContext?.objectiveResource?.url??url]};
 const providerAuthority={status:'AUTHORITATIVE_PROVIDER',binding:authorityBinding(objective,url)};
 const observation=adaptV2CurrentSource({contractVersion:1,observationId,target:{service:target.service,serviceName,market:target.market},page:{url,requestedUrl:retained.requestedUrl??url,outcome:'OK',httpStatus:retained.httpStatus,contentType,bodyHash:retained.bodyHash,sourceIntegrity:{sha256:retained.sourceIntegrity.sha256},rawSource:{text:retained.rawSource.text},accessDecisions},providerAuthority,acquisition},objective);
 const knowledge={objective,observations:[observation],attempts:[],policyBlocks:[],stop:null},truth=evaluate(knowledge),catalog=refreshCatalog(knowledge,truth),{navigation,v3Continuations}=sourceBoundContinuations(observation,objective,truth);
 const projected=projectV3SuggestedCandidates({observation,objective,targetMarket:target.market,providerAuthority,truth});
 const researchCandidateLineage=(target.researchCandidateLineage??[]).map(row=>!row.sourceHash&&normalizeUrl(row.sourceUrl)===normalizeUrl(observation.url)?{...row,sourceHash:observation.sha256}:row);
 const v3ResearchLineage=sourceBoundLineageBindings({handoff:{adaptiveTargetPatch:{researchCandidateLineage}},observation,candidates:projected});
 const v3SuggestedCandidates=projectV3SuggestedCandidates({observation,objective,targetMarket:target.market,providerAuthority,truth,researchLineage:v3ResearchLineage.bindings});
 return {v3Observation:{...compactObservation(observation),continuationCount:v3Continuations.length,continuationLimited:navigation.limited},v3ServiceUnderstanding:serviceUnderstanding,v3Truth:truth,v3Catalog:structuredClone(catalog),v3SuggestedCandidates,v3ResearchLineage,v3Continuations};
}

export function sourceBoundContinuations(observation,objective,truth){
 const navigation=observation?.format==='WEB'?extractNavigation(observation,objective,(truth?.needs??[]).map(row=>row.proposition)):{candidates:[],limited:false};
 return {navigation,v3Continuations:navigation.candidates.map(row=>({id:row.id,url:row.url,kind:row.kind,label:row.label,locale:row.locale,context:row.context,score:row.score,needs:row.needs,authority:row.authority,source:structuredClone(row.source),state:row.state??null,signals:structuredClone(row.signals),truthAuthority:'NONE'}))};
}

function canonicalCountrySource({target,sourceCheck,attempt}){
 const receipt=sourceCheck?.receipt,geo=receipt?.geo,page=attempt?.page,verification=attempt?.transportVerification;
 if(sourceCheck?.status!=='HASH_VERIFIED'||!receipt?.intact||receipt.service!==target.service||receipt.serviceEstablished!==true||receipt.bindingEstablished!==true)fail('COUNTRY_PROVIDER_RECEIPT_INVALID');
 if(!country(target.market)||geo?.classification!=='G1'||geo.reasons?.length||geo.targetCountry!==target.market||geo.geoCountry!==target.market)fail('COUNTRY_PROVIDER_RECEIPT_INVALID');
 if(!attempt||attempt.id!==geo.attemptId||attempt.outcome!=='OBSERVED'||attempt.providerId!=='decodo'||attempt.method!=='APPROVED_PROXY'||attempt.mode!=='SESSION'||attempt.cleanup!=='RELEASED'||attempt.bindingRef!==attempt.id||!attempt.sessionRef||attempt.targetCountry!==target.market)fail('COUNTRY_PROVIDER_SESSION_INVALID');
 if(geo.transport?.providerId!=='decodo'||geo.transport.method!=='APPROVED_PROXY'||geo.transport.mode!=='SESSION'||geo.transport.bindingRef!==attempt.id)fail('COUNTRY_PROVIDER_SESSION_INVALID');
 if(verification?.version!==2||verification.level!=='BRACKET_VERIFIED'||verification.providerId!=='decodo'||verification.bindingRef!==attempt.id||verification.targetCountry!==target.market||verification.equality!==true||verification.continuity!=='NO_OBSERVED_CHANGE'||verification.conflicts?.length)fail('COUNTRY_PROVIDER_SESSION_INVALID');
 if(verification.before?.status!=='MATCH'||verification.after?.status!=='MATCH'||verification.before.country!==target.market||verification.after.country!==target.market||verification.target?.outcome!=='OK')fail('COUNTRY_PROVIDER_SESSION_INVALID');
 if(!page||page.outcome!=='OK'||page.httpStatus!==200||page.targetCountry!==target.market||verification.target.finalUrl!==page.url||receipt.sourceUrl!==page.url||geo.sourceUrl!==page.url)fail('COUNTRY_PROVIDER_SOURCE_INVALID');
 const body=page.rawSource?.text,bodyHash=typeof body==='string'?digest(body):null;
 if(!hex(bodyHash)||sourceCheck.hash!==bodyHash||receipt.bodyHash!==bodyHash||geo.bodyHash!==bodyHash||page.sourceIntegrity?.sha256!==bodyHash)fail('COUNTRY_PROVIDER_HASH_MISMATCH');
 const host=new URL(page.url).hostname,routing=providerRoutingAuthority(target,page.url),family=routing?null:classifyAcquiredSource({target,page:{...page,requestedUrl:page.requestedUrl??attempt.requestedUrl??page.url,bodyHash},body,observationId:'country-source-'+bodyHash.slice(0,24)});
 if(!(routing?.host===host||family?.status==='PROVIDER_SOURCE'&&family.binding?.kind==='PROVIDER_SOURCE_DOMAIN_FAMILY')||page.authority?.status!=='CONFIGURED_REVIEWED'||page.authority.hostname!==host||page.authority.provider!==target.serviceName)fail('COUNTRY_PROVIDER_AUTHORITY_REQUIRED');
 if(!Array.isArray(page.accessDecisions)||!page.accessDecisions.length||page.accessDecisions.some(row=>!['ALLOWED','NO_ROBOTS_POLICY'].includes(row.decision)))fail('COUNTRY_PROVIDER_POLICY_UNPROVEN');
 const indexes=geo.receiptIndexes,rows=attempt.receipts;
 if(!Array.isArray(rows)||![indexes?.before,indexes?.response,indexes?.after].every(Number.isInteger)||!(indexes.before<indexes.response&&indexes.response<indexes.after))fail('COUNTRY_PROVIDER_RECEIPT_INVALID');
 const before=rows[indexes.before],response=rows[indexes.response],after=rows[indexes.after],used=[before,response,after];
 if(response?.url!==page.url||response?.bodySha256!==bodyHash||before?.bodySha256!==geo.geoProofHashes?.before||after?.bodySha256!==geo.geoProofHashes?.after)fail('COUNTRY_PROVIDER_RECEIPT_INVALID');
 if(used.some(row=>!row||row.bindingRef!==attempt.id||row.bindingChanged!==false||row.destinationMode!=='PINNED_CONNECT'||!row.continuityRef)||new Set(used.map(row=>row.continuityRef)).size!==1)fail('COUNTRY_PROVIDER_SESSION_INVALID');
 return {...page,requestedUrl:page.requestedUrl??attempt.requestedUrl??page.url,bodyHash,rawSource:{text:body}};
}

export function evaluateCountryProviderTruth({target,sourceCheck,attempt}){
 const retained=canonicalCountrySource({target,sourceCheck,attempt});
 return evaluateProviderSourceTruth({target,retained,observationId:'country-v3-'+retained.bodyHash.slice(0,24),acquisition:{route:'DECODO',countryReceipt:{contractVersion:1,kind:'V3_VERIFIED_COUNTRY_RECEIPT',transport:'DECODO',verification:'BRACKET_VERIFIED',requestedCountry:target.market,verifiedCountry:target.market}}});
}

export function evaluateVerifiedCountryRun({target,verification,records}){
 const attempts=records.filter(row=>row.type==='V2_ACQUISITION_RESULT'&&row.payload.target?.id===target.id).flatMap(row=>row.payload.result?.attempts??[]),checks=verification?.sourceChecks??[];
 let reason='COUNTRY_PROVIDER_RECEIPT_UNAVAILABLE';
 for(const sourceCheck of checks){
  const attempt=attempts.find(row=>row.id===sourceCheck.receipt?.geo?.attemptId);
  try{return {...evaluateCountryProviderTruth({target,sourceCheck,attempt}),countryV3Evaluation:{status:'EVALUATED',sourceHash:sourceCheck.hash,receiptStatus:sourceCheck.status,geoClass:sourceCheck.receipt.geo.classification}};}
  catch(error){reason=/^COUNTRY_[A-Z0-9_]+$/.test(String(error?.message))?error.message:'COUNTRY_PROVIDER_EVALUATION_FAILED';}
 }
 return {countryV3Evaluation:{status:'UNRESOLVED',reason}};
}
