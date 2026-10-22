// Classify one retained response. A discovery claim is never input to this
// decision, and the binding is never reusable without the retained body.
import fs from 'node:fs';
import path from 'node:path';
import {digest} from '../../research-v3/model.mjs';
import {reviewV2CandidateAuthority} from '../../research-v3/v2-candidate-authority-adapter.mjs';
import {providerSourceDomainFamily} from '../../research-v3/provider-source-family.mjs';
import {normalizeFrontierUrl} from './source-frontier.mjs';

const thirdParty=/\b(?:not affiliated with|unaffiliated with|independent of|unofficial|third.party (?:seller|reseller|review)|affiliate|reseller|comparison site|news article|independent review)\b/iu;
// Max's own /affiliate footer link appears in the HTML and serialized CMS
// beside its Affiliate-program label. These exact navigation tokens do not
// describe the price page. Inspect every other third-party mention as usual.
function thirdPartyPresentation(body,target,url){
 let maxNavigation=false;
 try{maxNavigation=target?.service==='max'&&new URL(url).hostname==='www.hbomax.com';}catch{/* Invalid URLs remain under the ordinary classifier. */}
 for(const match of body.matchAll(new RegExp(thirdParty.source,'giu'))){
  // HTML's affiliate-data attribute labels a smart-app banner; it is not a
  // declaration that the page is an affiliate or third-party price source.
  if(match[0].toLowerCase()==='affiliate'&&/^affiliate-data\s*=/iu.test(body.slice(match.index,match.index+32))&&body.lastIndexOf('<',match.index)>body.lastIndexOf('>',match.index))continue;
  if(maxNavigation&&match[0].toLowerCase()==='affiliate'){
   const at=match.index,after=body.slice(at+match[0].length);
   if(body[at-1]==='/'&&/^(?:["'\\]|\b)/u.test(after))continue;
   if(/^[- ]program\b/iu.test(after)&&/\/affiliate\b/iu.test(body.slice(Math.max(0,at-256),at+256)))continue;
  }
  return true;
 }
 return false;
}
const identity=value=>String(value??'').normalize('NFKC').toLocaleLowerCase('en').match(/[\p{L}\p{N}]+/gu)?.join(' ')??'';
function competingProviderDeclaration(body,serviceName){
 const expected=identity(serviceName),compatible=value=>{const current=identity(value);return current&&expected&&(current===expected||current.startsWith(expected+' ')||current.endsWith(' '+expected)||current.includes(' '+expected+' '));};
 const head=body.slice(0,256*1024);
 for(const tag of head.match(/<meta\b[^>]*>/giu)??[]){
  const key=/(?:property|name)\s*=\s*["'](?:og:site_name|application-name)["']/iu.test(tag),value=/\bcontent\s*=\s*["']([^"']{1,512})["']/iu.exec(tag)?.[1];
  if(key&&value&&!compatible(value)&&/\b(?:provider|company|corporation|service|brand|retailer|reseller)\b/iu.test(value))return true;
 }
 for(const script of head.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]{1,65536}?)<\/script>/giu)){
  let data;try{data=JSON.parse(script[1]);}catch{continue;}
  const stack=[data];let seen=0;
  while(stack.length&&++seen<=128){const row=stack.pop();if(!row||typeof row!=='object')continue;if(Array.isArray(row)){stack.push(...row.slice(0,32));continue;}
   const types=Array.isArray(row['@type'])?row['@type']:[row['@type']];
   if(types.some(type=>['Organization','Corporation','WebSite'].includes(type))&&typeof row.name==='string'&&!compatible(row.name))return true;
   if(Array.isArray(row['@graph']))stack.push(...row['@graph'].slice(0,32));
  }
 }
 return false;
}

export function classifyAcquiredSource({target,page,body,observationId}){
 const finalUrl=page?.url??null,sourceHash=typeof body==='string'?digest(body):null;
 const base={status:'UNKNOWN_SOURCE',reason:'SOURCE_NOT_ADMITTED',finalUrl,requestedUrl:page?.requestedUrl??null,sourceHash,observationId};
 if(!sourceHash||page?.bodyHash!==sourceHash||page?.sourceIntegrity?.sha256!==sourceHash)return {...base,reason:'SOURCE_INTEGRITY_INVALID'};
 const input={contractVersion:1,observationId,target:{service:target.service,serviceName:target.serviceName},page:{url:finalUrl,requestedUrl:page.requestedUrl??finalUrl,outcome:page.outcome??'ERROR',httpStatus:page.httpStatus??0,contentType:String(page.contentType??'').split(';')[0].toLowerCase(),truncated:page.truncated===true,bodyHash:sourceHash,sourceIntegrity:{sha256:sourceHash},rawSource:{text:body},accessDecisions:(page.accessDecisions??[]).map(row=>({decision:row.decision}))}};
 let review;try{review=reviewV2CandidateAuthority(input);}catch{return {...base,reason:'SOURCE_REVIEW_INVALID'};}
 if(thirdPartyPresentation(body,target,finalUrl))return {...base,status:'THIRD_PARTY_SOURCE',reason:'EXPLICIT_THIRD_PARTY_PRESENTATION',review};
 if(competingProviderDeclaration(body,target.serviceName))return {...base,status:'THIRD_PARTY_SOURCE',reason:'COMPETING_SERVICE_IDENTITY',review};
 if(review.providerAuthorityBinding)return {...base,status:'PROVIDER_SOURCE',reason:review.providerAuthorityBinding.reason,review,binding:review.providerAuthorityBinding};
 const family=providerSourceDomainFamily(target,finalUrl);
 if(family){
  const complete=page?.outcome==='OK'&&page?.httpStatus===200&&page?.truncated!==true&&['text/html','application/xhtml+xml'].includes(input.page.contentType)&&typeof body==='string'&&body.trim()&&Array.isArray(page?.accessDecisions)&&page.accessDecisions.length>0&&page.accessDecisions.every(row=>['ALLOWED','NO_ROBOTS_POLICY'].includes(row?.decision));
  if(!complete)return {...base,reason:'SOURCE_OBSERVATION_INCOMPLETE'};
  return {...base,status:'PROVIDER_SOURCE',reason:family.reason,review,binding:{kind:'PROVIDER_SOURCE_DOMAIN_FAMILY',host:family.host,establishedHost:family.establishedHost,registrableDomain:family.registrableDomain,serviceId:target.service,serviceName:target.serviceName,sourceHash,url:finalUrl}};
 }
 if((target?.providerSourceIdentityHosts?.length??0)||(target?.authorities?.length??0)||(target?.reviewedProviderNamespaces?.length??0))return {...base,reason:'FINAL_URL_OUTSIDE_PROVIDER_DOMAIN',review};
 return {...base,status:'UNKNOWN_SOURCE',reason:review.reason??'PROVIDER_PROOF_UNRESOLVED'};
}

export function classifyRetainedSource({directory,target,page,observationId}){
 if(!/^bodies\/[a-f0-9]{64}\.txt$/u.test(page?.bodyFile??''))return {status:'UNKNOWN_SOURCE',reason:'SOURCE_NOT_RETAINED',finalUrl:page?.url??null,requestedUrl:page?.requestedUrl??null,sourceHash:null,observationId};
 let body;try{body=fs.readFileSync(path.join(directory,page.bodyFile),'utf8');}catch{return {status:'UNKNOWN_SOURCE',reason:'SOURCE_NOT_RETAINED',finalUrl:page?.url??null,requestedUrl:page?.requestedUrl??null,sourceHash:null,observationId};}
 return classifyAcquiredSource({target,page,body,observationId});
}

export function recordSuggestedSourceLifecycle(target,classification){
 const key=normalizeFrontierUrl(classification?.requestedUrl).url;
 if(!key)return;
 for(const row of target.researchCandidateLineage??[]){
  if(normalizeFrontierUrl(row.sourceUrl).url!==key||row.truthAuthority!=='NONE')continue;
  if((row.sourceAcquisition?.sourceHash&&!classification.sourceHash)||(row.sourceAcquisition?.status==='PROVIDER_SOURCE'&&classification.status!=='PROVIDER_SOURCE'))continue;
  row.sourceAcquisition={status:classification.status,reason:classification.reason,finalUrl:classification.finalUrl,sourceHash:classification.sourceHash,observationId:classification.observationId};
  row.currentSourceWarning=classification.status==='PROVIDER_SOURCE'?null:classification.status==='THIRD_PARTY_SOURCE'?'THIRD_PARTY_SOURCE':classification.sourceHash?'SOURCE_IDENTITY_UNRESOLVED':'OFFICIAL_SOURCE_NOT_ACQUIRED';
 }
}
