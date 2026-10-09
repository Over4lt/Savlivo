// Offline representation boundary for intact V2 retained provider pages.
// Authority, acquisition provenance, evidence admission and Truth remain V3-owned.
import {canonical,context,digest,normalizeUrl,providerBound} from './model.mjs';
import {authorityBinding} from './discovery-authority.mjs';
import {projectObservation} from './projection.mjs';
import {admittedProjectionCandidates} from './native-structured.mjs';
import {interpretStructured} from './truth.mjs';

export const v2CurrentSourceBoundary=Object.freeze({
 contractVersion:1,
 providerAuthority:'EXISTING_V3_AUTHORITY_BINDING',
 acquisitionObservation:'EXISTING_V3_PROVIDER_OBSERVATION',
 directCountryContext:'UNBOUND',
 verifiedCountryReceipt:'V3_VERIFIED_COUNTRY_RECEIPT_V1'
});

const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function exact(value,keys,code){
 if(!object(value)||canonical(Object.keys(value).sort())!==canonical([...keys].sort()))throw Error(code);
}
function isoCountry(value){return typeof value==='string'&&/^[A-Z]{2}$/.test(value);}
function authorityShape(binding){
 if(binding?.kind==='REVIEWED_HOST')exact(binding,['host','kind'],'V2_V3_AUTHORITY_BINDING_INVALID');
 else if(binding?.kind==='REVIEWED_NAMESPACE')exact(binding,['host','kind','domain','reference'],'V2_V3_AUTHORITY_BINDING_INVALID');
 else throw Error('V2_V3_AUTHORITY_BINDING_INVALID');
}
function validateAuthority(value,objective,url){
 exact(value,['status','binding'],'V2_V3_AUTHORITY_INVALID');
 if(value.status!=='AUTHORITATIVE_PROVIDER')throw Error('V2_V3_AUTHORITY_INVALID');
 authorityShape(value.binding);
 const expected=authorityBinding(objective,url);
 if(!expected||!providerBound(objective,url)||canonical(value.binding)!==canonical(expected))throw Error('V2_V3_AUTHORITY_INVALID');
}
function acquisition(value){
 if(value?.route==='DIRECT'){
  exact(value,['route'],'V2_V3_ACQUISITION_INVALID');
  return {context:context('DIRECT')};
 }
 exact(value,['route','countryReceipt'],'V2_V3_ACQUISITION_INVALID');
 if(value.route!=='DECODO')throw Error('V2_V3_ACQUISITION_INVALID');
 const receipt=value.countryReceipt;
 exact(receipt,['contractVersion','kind','transport','verification','requestedCountry','verifiedCountry'],'V2_V3_COUNTRY_RECEIPT_INVALID');
 if(receipt.contractVersion!==1||receipt.kind!=='V3_VERIFIED_COUNTRY_RECEIPT'||receipt.transport!=='DECODO'||receipt.verification!=='BRACKET_VERIFIED'||!isoCountry(receipt.requestedCountry)||receipt.verifiedCountry!==receipt.requestedCountry)throw Error('V2_V3_COUNTRY_RECEIPT_INVALID');
 return {context:context('DECODO',receipt.verifiedCountry),transport:{verification:'BRACKET_VERIFIED',requestedCountry:receipt.requestedCountry,verifiedCountry:receipt.verifiedCountry}};
}
function retainedPage(value){
 exact(value,['url','requestedUrl','outcome','httpStatus','contentType','bodyHash','sourceIntegrity','rawSource','accessDecisions'],'V2_V3_PAGE_INVALID');
 exact(value.sourceIntegrity,['sha256'],'V2_V3_SOURCE_INTEGRITY_INVALID');
 exact(value.rawSource,['text'],'V2_V3_SOURCE_INTEGRITY_INVALID');
 if(value.outcome!=='OK'||value.httpStatus!==200||!['text/html','application/xhtml+xml','application/json'].includes(value.contentType))throw Error('V2_V3_PAGE_INVALID');
 const url=normalizeUrl(value.url),requestedUrl=normalizeUrl(value.requestedUrl);
 if(!url||!requestedUrl||typeof value.rawSource.text!=='string'||!value.rawSource.text.length||Buffer.byteLength(value.rawSource.text)>8_000_000)throw Error('V2_V3_PAGE_INVALID');
 const sha256=digest(value.rawSource.text);
 if(!/^[a-f0-9]{64}$/.test(value.bodyHash)||value.bodyHash!==sha256||value.sourceIntegrity.sha256!==sha256)throw Error('V2_V3_SOURCE_INTEGRITY_INVALID');
 if(!Array.isArray(value.accessDecisions)||!value.accessDecisions.length)throw Error('V2_V3_ACCESS_INVALID');
 for(const row of value.accessDecisions){
  if(!object(row)||!['ALLOWED','NO_ROBOTS_POLICY'].includes(row.decision))throw Error('V2_V3_ACCESS_INVALID');
  const allowed=['decision','reason','boundary','httpStatus','rule'];
  if(Object.keys(row).some(key=>!allowed.includes(key)))throw Error('V2_V3_ACCESS_INVALID');
 }
 return {url,requestedUrl,body:value.rawSource.text,sha256,access:structuredClone(value.accessDecisions)};
}

// This maps representation only. Existing V3 projection/admission decides which
// source-backed candidates may be evaluated; existing V3 Truth decides states.
export function adaptV2CurrentSource(input,objective){
 exact(input,['contractVersion','observationId','target','page','providerAuthority','acquisition'],'V2_V3_BOUNDARY_INVALID');
 if(input.contractVersion!==v2CurrentSourceBoundary.contractVersion||typeof input.observationId!=='string'||!/^[A-Za-z0-9:_-]{1,128}$/.test(input.observationId))throw Error('V2_V3_BOUNDARY_INVALID');
 exact(input.target,['service','serviceName','market'],'V2_V3_TARGET_INVALID');
 if(input.target.service!==objective?.serviceId||input.target.serviceName!==objective?.serviceName||!isoCountry(input.target.market))throw Error('V2_V3_TARGET_INVALID');
 const page=retainedPage(input.page);
 validateAuthority(input.providerAuthority,objective,page.url);
 const acquired=acquisition(input.acquisition);
 const web=input.page.contentType!=='application/json';
 const observation={id:input.observationId,kind:'PROVIDER',url:page.url,context:acquired.context,outcome:'OK',truncated:false,body:page.body,sha256:page.sha256,candidates:[],httpStatus:200,
  ...(acquired.transport?{transport:acquired.transport}:{}),
  ...(web?{format:'WEB',contentType:input.page.contentType,requestedUrl:page.requestedUrl,completeness:'COMPLETE',access:page.access}:{})};
 if(web){
  const projection=projectObservation(observation,objective);
  observation.nativeStructured=projection.nativeStructured;
  observation.candidates=admittedProjectionCandidates(projection);
 }else observation.candidates=interpretStructured(observation,objective);
 return observation;
}
