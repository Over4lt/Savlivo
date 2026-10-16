// Classify one retained response. A discovery claim is never input to this
// decision, and the binding is never reusable without the retained body.
import fs from 'node:fs';
import path from 'node:path';
import {digest} from '../../research-v3/model.mjs';
import {reviewV2CandidateAuthority} from '../../research-v3/v2-candidate-authority-adapter.mjs';
import {normalizeFrontierUrl} from './source-frontier.mjs';

const thirdParty=/\b(?:not affiliated with|unaffiliated with|independent of|unofficial|third.party (?:seller|reseller|review)|affiliate|reseller|comparison site|news article|independent review)\b/iu;

export function classifyAcquiredSource({target,page,body,observationId}){
 const finalUrl=page?.url??null,sourceHash=typeof body==='string'?digest(body):null;
 const base={status:'UNKNOWN_SOURCE',reason:'SOURCE_NOT_ADMITTED',finalUrl,requestedUrl:page?.requestedUrl??null,sourceHash,observationId};
 if(!sourceHash||page?.bodyHash!==sourceHash||page?.sourceIntegrity?.sha256!==sourceHash)return {...base,reason:'SOURCE_INTEGRITY_INVALID'};
 const input={contractVersion:1,observationId,target:{service:target.service,serviceName:target.serviceName},page:{url:finalUrl,requestedUrl:page.requestedUrl??finalUrl,outcome:page.outcome??'ERROR',httpStatus:page.httpStatus??0,contentType:String(page.contentType??'').split(';')[0].toLowerCase(),truncated:page.truncated===true,bodyHash:sourceHash,sourceIntegrity:{sha256:sourceHash},rawSource:{text:body},accessDecisions:(page.accessDecisions??[]).map(row=>({decision:row.decision}))}};
 let review;try{review=reviewV2CandidateAuthority(input);}catch{return {...base,reason:'SOURCE_REVIEW_INVALID'};}
 if(thirdParty.test(body))return {...base,status:'THIRD_PARTY_SOURCE',reason:'EXPLICIT_THIRD_PARTY_PRESENTATION',review};
 if(review.providerAuthorityBinding)return {...base,status:'PROVIDER_SOURCE',reason:review.providerAuthorityBinding.reason,review,binding:review.providerAuthorityBinding};
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
