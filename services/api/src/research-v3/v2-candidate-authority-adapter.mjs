// Offline representation boundary from one intact V2 retained candidate page
// to the existing V3 deterministic candidate authority review.
import {canonical,digest,normalizeUrl} from './model.mjs';
import {reviewCandidateAuthority} from './provider-authority-review.mjs';

export const v2CandidateAuthorityBoundary=Object.freeze({contractVersion:1,inputRole:'NON_AUTHORITATIVE_CANDIDATE',review:'EXISTING_V3_CANDIDATE_AUTHORITY',authorityScope:'EXACT_HOST_PROVIDER_SOURCING'});
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function exact(value,keys,code){if(!object(value)||canonical(Object.keys(value).sort())!==canonical([...keys].sort()))throw Error(code);}
const failed=reason=>({contractVersion:1,candidateObservation:null,providerAuthorityBinding:null,reason});

export function reviewV2CandidateAuthority(input){
 exact(input,['contractVersion','observationId','target','page'],'V2_V3_CANDIDATE_BOUNDARY_INVALID');
 exact(input.target,['service','serviceName'],'V2_V3_CANDIDATE_TARGET_INVALID');
 exact(input.page,['url','requestedUrl','outcome','httpStatus','contentType','truncated','bodyHash','sourceIntegrity','rawSource','accessDecisions'],'V2_V3_CANDIDATE_PAGE_INVALID');
 exact(input.page.sourceIntegrity,['sha256'],'V2_V3_CANDIDATE_SOURCE_INVALID');
 exact(input.page.rawSource,['text'],'V2_V3_CANDIDATE_SOURCE_INVALID');
 if(input.contractVersion!==1||typeof input.observationId!=='string'||!/^[A-Za-z0-9:_-]{1,128}$/.test(input.observationId)||typeof input.target.service!=='string'||!input.target.service||typeof input.target.serviceName!=='string'||!input.target.serviceName.trim())throw Error('V2_V3_CANDIDATE_BOUNDARY_INVALID');
 const page=input.page,body=page.rawSource.text,url=normalizeUrl(page.url),requestedUrl=normalizeUrl(page.requestedUrl);
 if(!url||url!==page.url||!requestedUrl||requestedUrl!==page.requestedUrl||new URL(url).hostname!==new URL(requestedUrl).hostname)return failed('CANDIDATE_REDIRECT_HOST_CHANGED');
 if(page.outcome!=='OK'||page.truncated===true||page.httpStatus<200||page.httpStatus>=300||!['text/html','application/xhtml+xml'].includes(page.contentType)||typeof body!=='string'||!body.trim())return failed('CANDIDATE_ACQUISITION_INCOMPLETE');
 if(!/^[a-f0-9]{64}$/.test(page.bodyHash)||page.bodyHash!==digest(body)||page.sourceIntegrity.sha256!==page.bodyHash)return failed('CANDIDATE_SOURCE_INTEGRITY_INVALID');
 if(!Array.isArray(page.accessDecisions)||!page.accessDecisions.length||page.accessDecisions.some(row=>!object(row)||row.decision!=='ALLOWED'))return failed('CANDIDATE_ACCESS_UNPROVEN');
 const observation={id:input.observationId,kind:'CANDIDATE',authority:'UNREVIEWED_CANDIDATE',url,context:{transport:'DIRECT',networkGeography:'UNBOUND',representation:'CANDIDATE_PAGE'},outcome:'OK',truncated:false,completeness:'COMPLETE',format:'WEB',contentType:page.contentType,httpStatus:page.httpStatus,access:page.accessDecisions.map(row=>({decision:row.decision})),body,sha256:page.bodyHash};
 const objective={kind:'PRICE',serviceId:input.target.service,serviceName:input.target.serviceName,providerHosts:[],candidateHosts:[new URL(requestedUrl).hostname],markets:[],seeds:[requestedUrl]};
 return {contractVersion:1,candidateObservation:observation,providerAuthorityBinding:reviewCandidateAuthority(observation,objective),reason:null};
}
