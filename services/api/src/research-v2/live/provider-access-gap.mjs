import {pendingMarketProof,pendingV3MarketProof,marketProofContradicted} from './market-proof-continuation.mjs';
import {targetMarketPriceReview} from './retained-pricing.mjs';
import {providerRoutingAuthority} from './provider-routing-authority.mjs';
import {normalizeUrl} from '../../research-v3/model.mjs';
// A transient provider response failure after an explicit permitted access check.
// Never treats robots uncertainty, 403/challenges, redirects or parser zeros as permission.
export function providerAccessGap(page){
 if(page?.outcome!=='UNRESOLVED'||!page.accessDecisions?.length||page.accessDecisions.some(p=>!['ALLOWED','NO_ROBOTS_POLICY'].includes(p.decision)))return null;
 const f=page.failure;if(!f)return null;
 if(!(['TIMEOUT','NETWORK_FAILED'].includes(f.code)||f.code==='HTTP_STATUS'&&[502,503,504].includes(f.status)))return null;
 return {kind:'PERMITTED_DIRECT_PROVIDER_TRANSIENT_FAILURE',failure:f,accessDecisions:page.accessDecisions};
}

// Semantic diagnoses never grant an alternate transport. The caller must retain
// the original page/failure proof and a materially different authorized route.
export function acquisitionEscalation({page,alternateRoute=true,targetMarket=null}={}){
 const proof=providerAccessGap(page);
 if(!proof)return {eligible:false,primaryFailureReason:'NO_DEMONSTRATED_ACQUISITION_FAILURE',acquisitionFailureEvidence:null,routeBenefit:null};
 if(!alternateRoute)return {eligible:false,primaryFailureReason:'NO_ALTERNATE_ROUTE_BENEFIT',acquisitionFailureEvidence:proof,routeBenefit:null};
 return {eligible:true,primaryFailureReason:'DIRECT_ACCESS_FAILED',acquisitionFailureEvidence:proof,routeBenefit:{kind:'INDEPENDENT_APPROVED_PROXY_TRANSPORT',targetMarket,why:'Permitted original endpoint failed through Direct; alternate transport can change reachability.'}};
}

export function unresolvedV3TargetNeed(target){return (target.v3Truth?.needs??[]).some(need=>need?.state==='UNRESOLVED'&&(need.market==null||need.market===target.market));}
function directGrounding(target,url){
 const normalized=normalizeUrl(url),authority=normalized&&providerRoutingAuthority(target,normalized);if(!authority)return null;
 const page=(target.reads??[]).find(row=>normalizeUrl(row.requestedUrl)===normalized||normalizeUrl(row.url)===normalized),observation=target.v3Observation;
 const requested=normalizeUrl(page?.requestedUrl??page?.url),final=normalizeUrl(page?.url??page?.requestedUrl),sourceHash=page?.bodyHash??page?.sourceIntegrity?.sha256;
 if(!page||page.outcome!=='OK'||!requested||!final||requested!==normalized||final!==normalized||new URL(requested).hostname!==authority.host||new URL(final).hostname!==authority.host||!page.accessDecisions?.length||page.accessDecisions.some(row=>!['ALLOWED','NO_ROBOTS_POLICY'].includes(row.decision)))return null;
 if(observation?.kind!=='PROVIDER'||observation.context?.transport!=='DIRECT'||observation.context?.networkGeography!=='UNBOUND'||normalizeUrl(observation.url)!==normalized||sourceHash!==observation.sha256)return null;
 return {page,observation,authority};
}

// A precise offering/market join or an unresolved V3 target need plus an
// explicitly permitted exact-host Direct grounding can justify a distinct
// country-bound observation. Scheduling the observation never establishes a fact.
export function targetMarketAcquisition(target,url){
 const marketObjectives=pendingMarketProof(target),v3MarketNeed=!!pendingV3MarketProof(target,url),exploratoryNeed=unresolvedV3TargetNeed(target),grounding=directGrounding(target,url);
 if(target.researchObjective!=='SERVICE_COVERAGE'||!/^([A-Z]{2})$/.test(target.market??'')||marketProofContradicted(target)||(!marketObjectives.length&&!exploratoryNeed)||(!v3MarketNeed&&!exploratoryNeed&&targetMarketPriceReview(target))||!grounding)return null;
 return {eligible:true,primaryFailureReason:'TARGET_MARKET_OBSERVATION_REQUIRED',routeBenefit:{kind:'TARGET_COUNTRY_OBSERVATION',targetMarket:target.market},marketProofIdentityKeys:pendingMarketProof(target).map(o=>o.key)};
}
