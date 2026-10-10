import {normalizeFrontierUrl} from './source-frontier.mjs';

// Acquisition scheduling only. This objective and every signal below are
// non-authoritative and cannot establish provider identity, ownership or Truth.
export const authorityAcquisitionObjective='PROVIDER_AUTHORITY_ACQUISITION';
export const authorityAcquisitionTiers=Object.freeze({EXACT_SERVICE_DOMAIN:0,SERVICE_HOST_AFFINITY:1,IDENTITY_RESOURCE:2,GENERAL_CANDIDATE:3});

const safe=u=>{try{const value=normalizeFrontierUrl(u).url;return value?new URL(value):null;}catch{return null;}};
const words=value=>String(value??'').normalize('NFKD').replace(/\p{M}/gu,'').normalize('NFC').toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)??[];
const identityPath=/(?:^|[\s\/_-])(?:about(?:-us)?|company|corporate|contact(?:-us)?|imprint|impressum|legal|terms(?:-of-service)?|who-we-are)(?:[\s\/_-]|$)/iu;

export function serviceDomainHint(t){const value=String(t.serviceName??t.service??'').trim().toLowerCase();if(/\s/u.test(value)||!value.includes('.'))return null;const url=safe('https://'+value.replace(/^www\./,'')+'/');return url?.hostname.replace(/^www\./,'')??null;}
export function serviceIdentityTokens(t){const value=String(t.serviceName??t.service??'').trim().toLowerCase(),domain=serviceDomainHint(t);return [...new Set(words(domain?domain.split('.')[0]:value))];}
export const candidateRelevant=(t,l)=>{const text=String((l?.title??l?.label??'')+' '+(l?.url??'')).normalize('NFKD').replace(/\p{M}/gu,'').normalize('NFC').toLowerCase();return serviceIdentityTokens(t).some(word=>text.includes(word));};

export function candidateIdentityPriority(t,lead){
 const url=safe(lead?.url);if(!url)return 0;const tokens=serviceIdentityTokens(t);if(!tokens.length)return 0;
 const hostname=url.hostname.replace(/^www\./,''),labels=hostname.split('.'),parts=labels.flatMap(words),first=words(labels[0]);
 if(serviceDomainHint(t)===hostname)return -40;
 if(tokens.some(token=>first.includes(token)))return -30;
 if(tokens.some(token=>parts.includes(token)))return -20;
 return 0;
}

export function candidateOriginKind(lead){if(lead?.originKind)return lead.originKind;if(lead?.from?.queryId)return 'SEARCH';if(lead?.from?.url)return 'CHILD';return 'SEED';}

export function authorityAcquisitionRelevance(t,lead){
 const url=safe(lead?.url);if(!url)return {tier:authorityAcquisitionTiers.GENERAL_CANDIDATE,role:'GENERAL_CANDIDATE',signals:[]};
 let pathname=url.pathname;try{pathname=decodeURIComponent(pathname);}catch{/* Malformed display text stays a general routing hint. */}
 const host=url.hostname.replace(/^www\./,''),hint=serviceDomainHint(t),identity=candidateIdentityPriority(t,lead),text=pathname+' '+String(lead?.label??lead?.title??'');
 if(hint&&host===hint)return {tier:authorityAcquisitionTiers.EXACT_SERVICE_DOMAIN,role:'EXACT_SERVICE_DOMAIN',signals:['DOTTED_SERVICE_DOMAIN_EXACT_HOST']};
 if(identity<0)return {tier:authorityAcquisitionTiers.SERVICE_HOST_AFFINITY,role:'SERVICE_HOST_AFFINITY',signals:['SERVICE_IDENTITY_HOST_AFFINITY']};
 if(url.pathname==='/'||identityPath.test(text))return {tier:authorityAcquisitionTiers.IDENTITY_RESOURCE,role:'IDENTITY_RESOURCE',signals:[url.pathname==='/'?'ROOT_RESOURCE_HYPOTHESIS':'IDENTITY_PATH_OR_LABEL_HYPOTHESIS']};
 return {tier:authorityAcquisitionTiers.GENERAL_CANDIDATE,role:'GENERAL_CANDIDATE',signals:[]};
}

function parentRead(t,lead){const parent=normalizeFrontierUrl(lead?.from?.url).url;if(!parent)return null;return (t.reads??[]).find(row=>[row.requestedUrl,row.url].some(url=>normalizeFrontierUrl(url).url===parent))??null;}
export function candidateBranchPreference(t,lead,relevance=authorityAcquisitionRelevance(t,lead)){
 if(candidateOriginKind(lead)!=='CHILD')return {order:0,status:'INDEPENDENT_CANDIDATE',generic:false};
 const parent=parentRead(t,lead),failed=parent&&((parent.outcome&&parent.outcome!=='OK')||['CANDIDATE_SOURCE_NOT_RETAINED','CANDIDATE_ACQUISITION_INCOMPLETE','CANDIDATE_REDIRECT_HOST_CHANGED'].includes(parent.v3AuthorityReview?.reason));
 return {order:failed?2:1,status:failed?'FAILED_PARENT_BRANCH':'UNRESOLVED_PARENT_BRANCH',generic:relevance.tier===authorityAcquisitionTiers.GENERAL_CANDIDATE};
}

export function candidateAuthorityRouting(t,lead,index=0){
 const relevance=authorityAcquisitionRelevance(t,lead),branch=candidateBranchPreference(t,lead,relevance),originKind=candidateOriginKind(lead),searchRank=originKind==='SEARCH'&&Number.isSafeInteger(lead?.rank)?lead.rank:Number.MAX_SAFE_INTEGER,childOrder=originKind==='CHILD'&&Number.isSafeInteger(lead?.childOrder)?lead.childOrder:Number.MAX_SAFE_INTEGER,insertionOrder=Number.isSafeInteger(lead?.frontierOrder)?lead.frontierOrder:index;
 return {objective:authorityAcquisitionObjective,authorityRelevanceTier:relevance.tier,authorityRole:relevance.role,authoritySignals:relevance.signals,branchPreference:branch.order,branchStatus:branch.status,genericChild:branch.generic,originKind,searchRank,childOrder,insertionOrder};
}

export const compareCandidateAuthorityRows=(a,b)=>a.authorityRelevanceTier-b.authorityRelevanceTier||a.branchPreference-b.branchPreference||a.searchRank-b.searchRank||a.childOrder-b.childOrder||a.insertionOrder-b.insertionOrder||a.url.localeCompare(b.url);

export function orderCandidateAuthorityRows(rows,{remainingReads=Infinity}={}){
 const ordered=[...rows].sort(compareCandidateAuthorityRows);
 if(remainingReads!==1||ordered[0]?.originKind!=='CHILD')return ordered;
 const independent=ordered.find(row=>row.originKind!=='CHILD'&&row.authorityRelevanceTier<=ordered[0].authorityRelevanceTier);
 if(!independent)return ordered;
 return [independent,...ordered.filter(row=>row!==independent)];
}
