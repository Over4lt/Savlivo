// V3-only orchestration: explicit redirects, typed hooks, complete source decoding.
import {isIP} from 'node:net';
import {publicAddress} from '../research-v1/public-network.mjs';
import {normalizeUrl} from './model.mjs';
import {fault,httpRedirects,acquisitionCapacity,safeMetadata} from './acquisition-contract.mjs';
import {decodeResponse} from './acquisition-response.mjs';
export function publicSourceUrl(value) {
 const normalized=normalizeUrl(value);if(!normalized)throw fault('UNSAFE_HOST');
 const url=new URL(value);url.hash='';
 if([...url.searchParams.keys()].some(k=>/^(?:access[_-]?token|token|password|secret|authorization|session[_-]?id|api[_-]?key|signature|auth[_-]?code)$/i.test(k)))throw fault('SECRET_QUERY_REJECTED');
 return url;
}
export function createAcquisitionReader({resolveHost,requestOnce,beforeRequest,onDecodedBytes=()=>{},onRedirect=()=>{},process,validateDestination=()=>{},onProcessingPhase=()=>{},maxWireBytes=acquisitionCapacity.wireResponseBytes,maxDecodedBytes=acquisitionCapacity.decodedResponseBytes,maxObservationBytes=acquisitionCapacity.observationBytes,maxRedirects=acquisitionCapacity.redirects,jsonUrls=[],robotsPolicyRetrieval=false,onDecodedText=()=>{}}={}) {
 return async function read(input,{signal,locale=null}={}) {
  if(locale!==null&&(typeof locale!=='string'||/[\r\n]/.test(locale)))throw fault('INVALID_REQUEST');
  let current=input;const seen=new Set(),redirects=[];
  for(;;){
   if(signal?.aborted)throw fault('ABORTED');
   const url=publicSourceUrl(current);
   if(seen.has(url.href))throw fault('REDIRECT_LOOP');seen.add(url.href);
   validateDestination(url.href);
   if(beforeRequest)await beforeRequest({url:url.href,signal,redirects});
   const host=url.hostname.replace(/^\[|\]$/g,''),records=await resolveHost(host);
   if(!Array.isArray(records)||!records.length||records.some(r=>!publicAddress(r.address)||isIP(r.address)!==r.family))throw fault('UNSAFE_DNS');
   if(signal?.aborted)throw fault('ABORTED');
   const response=await requestOnce({url,...records[0],signal,maxBytes:maxWireBytes,maxDecodedBytes,maxObservationBytes,locale,acceptJson:jsonUrls.includes(url.href),robotsPolicyRetrieval});
   if(!Buffer.isBuffer(response.body)||response.complete===false)throw fault('INCOMPLETE_RESPONSE');
   if(response.body.length>maxWireBytes)throw fault('RESPONSE_TOO_LARGE','CAPACITY');
   const meta=safeMetadata(response.headers),headers=response.headers??{};
   if(httpRedirects.has(response.status)){
    const diagnostic={hop:redirects.length+1,httpStatus:response.status,fromOrigin:url.origin,toOrigin:null,sameOrigin:null,queryPresent:false,method:'GET',decision:null};
    let next;
    try{
     if(typeof headers.location!=='string'||!headers.location.length)throw fault('REDIRECT_LOCATION_MISSING');
     if(headers.location.length>2048||/[\r\n\x00]/.test(headers.location))throw fault('REDIRECT_LOCATION_INVALID');
     try{next=new URL(headers.location,url);}catch{throw fault('REDIRECT_LOCATION_INVALID');}
     diagnostic.toOrigin=next.origin;diagnostic.sameOrigin=next.origin===url.origin;diagnostic.queryPresent=!!next.search;
     try{next=publicSourceUrl(next.href);}catch{throw fault('REDIRECT_UNSAFE_DESTINATION');}
     validateDestination(next.href);
     if(redirects.length>=maxRedirects)throw fault('REDIRECT_LIMIT','CAPACITY');
     if(seen.has(next.href))throw fault('REDIRECT_LOOP');
     diagnostic.decision='FOLLOW';
    }catch(error){diagnostic.decision=error.code??'REDIRECT_LOCATION_INVALID';onRedirect(diagnostic);throw error;}
    redirects.push(diagnostic);onRedirect(diagnostic);current=next.href;continue;
   }
   // Missing/variant robots MIME is allowed only with successfully parsed policy text.
   const type=meta.contentType;
   if(response.status!==200)return {url:url.href,redirects,status:response.status,contentType:type,text:'',metadata:{...meta,wireBytes:response.body.length,decodedBytes:0,observationBytes:0,complete:true}};
   const allowed=['text/html','application/xhtml+xml','text/plain','application/rss+xml','application/xml','text/xml','application/json','application/ld+json'];
   if(!robotsPolicyRetrieval&&!allowed.includes(type))throw fault('UNSUPPORTED_CONTENT');
   const absent=robotsPolicyRetrieval&&[404,410].includes(response.status);
   if(absent)return {url:url.href,redirects,status:response.status,contentType:type,text:'',metadata:{...meta,wireBytes:response.body.length,decodedBytes:0,observationBytes:0,complete:true}};
   const decode=state=>decodeResponse(response,{maxDecodedBytes,maxObservationBytes,signal:state?.signal??signal,onDecodedBytes,onPhase:onProcessingPhase});
   const decoded=process?await process(decode):await decode();onDecodedText(decoded.text);
   return {url:url.href,redirects,status:response.status,contentType:type,text:decoded.text,metadata:{...meta,charset:decoded.charset,headerFieldBytes:response.headerFieldBytes??null,wireBytes:decoded.wireBytes,wireSha256:decoded.wireSha256,decodedBytes:decoded.decodedBytes,observationBytes:decoded.observationBytes,complete:true}};
  }
 };
}
