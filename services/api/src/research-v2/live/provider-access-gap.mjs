import {pendingMarketProof,pendingV3MarketProof,marketProofContradicted} from './market-proof-continuation.mjs';
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

// A country request which produced no provider receipt is an acquisition
// failure, not a semantic observation of the resource. It may remain
// executable while the existing finite acquisition budget has capacity.
export function countryAcquisitionDisposition(outcome){
 if(!outcome)return 'NO_ATTEMPT';
 if(outcome.classification==='ACQUISITION_FAILED'&&outcome.countryV3Evaluation?.status==='UNRESOLVED'&&outcome.countryV3Evaluation.reason==='COUNTRY_PROVIDER_RECEIPT_UNAVAILABLE')return 'RETRYABLE_ACQUISITION_FAILURE';
 if(outcome.countryV3Evaluation?.status==='EVALUATED')return 'OBSERVATION_EVALUATED';
 if(outcome.classification==='ACQUISITION_FAILED')return 'NON_RETRYABLE_ACQUISITION_FAILURE';
 return 'SEMANTIC_ATTEMPT_COMPLETE';
}

function directInterpretations(target){return [...(target.providerInterpretations??[]),{url:target.v3Observation?.url,v3Observation:target.v3Observation,v3Truth:target.v3Truth}].filter(row=>row?.v3Observation?.kind==='PROVIDER'&&row.v3Observation.context?.transport==='DIRECT'&&row.v3Observation.context?.networkGeography==='UNBOUND'&&Array.isArray(row.v3Truth?.needs));}
function directInterpretation(target,url,hash=null){const normalized=url&&normalizeUrl(url);return directInterpretations(target).find(row=>{const observation=row.v3Observation;return (!normalized||normalizeUrl(observation.url)===normalized)&&(!hash||observation.sha256===hash);})??null;}
export function unresolvedV3TargetNeed(target,url=null){
 if(!(target.v3Truth?.needs??[]).some(need=>need?.state==='UNRESOLVED'&&(need.market==null||need.market===target.market)))return null;
 const owner=directInterpretations(target).find(row=>{const observation=row.v3Observation;if(url&&normalizeUrl(observation.url)!==normalizeUrl(url))return false;return row.v3Truth.needs.some(need=>need?.state==='UNRESOLVED'&&(need.market==null||need.market===target.market));});
 if(!owner)return null;return {url:normalizeUrl(owner.v3Observation.url),hash:owner.v3Observation.sha256,observation:owner.v3Observation,need:owner.v3Truth.needs.find(need=>need?.state==='UNRESOLVED'&&(need.market==null||need.market===target.market))};
}
function directGrounding(target,url,owner){
 const normalized=normalizeUrl(url),authority=normalized&&providerRoutingAuthority(target,normalized),observation=owner?.observation??owner?.v3Observation;if(!authority||!observation)return null;
 const page=(target.reads??[]).find(row=>normalizeUrl(row.requestedUrl)===normalized||normalizeUrl(row.url)===normalized);
 const requested=normalizeUrl(page?.requestedUrl??page?.url),final=normalizeUrl(page?.url??page?.requestedUrl),sourceHash=page?.bodyHash??page?.sourceIntegrity?.sha256;
 if(!page||page.outcome!=='OK'||!requested||!final||requested!==normalized||final!==normalized||new URL(requested).hostname!==authority.host||new URL(final).hostname!==authority.host||!page.accessDecisions?.length||page.accessDecisions.some(row=>!['ALLOWED','NO_ROBOTS_POLICY'].includes(row.decision)))return null;
 if(observation?.kind!=='PROVIDER'||observation.context?.transport!=='DIRECT'||observation.context?.networkGeography!=='UNBOUND'||normalizeUrl(observation.url)!==normalized||sourceHash!==observation.sha256)return null;
 return {page,observation,authority};
}

// A precise offering/market join or an unresolved V3 target need plus an
// explicitly permitted exact-host Direct grounding can justify a distinct
// country-bound observation. Scheduling the observation never establishes a fact.
export function targetMarketAcquisition(target,url){
 const marketObjectives=pendingMarketProof(target),preciseObjectives=marketObjectives.filter(row=>normalizeUrl(row.identity?.sourceUrl)&&/^[a-f0-9]{64}$/.test(row.identity?.sourceHash??'')),v3MarketObjective=pendingV3MarketProof(target,url),preciseOwner=v3MarketObjective&&directInterpretation(target,v3MarketObjective.identity.sourceUrl,v3MarketObjective.identity.sourceHash),exploratoryNeed=!preciseObjectives.length&&unresolvedV3TargetNeed(target,url),owner=preciseOwner??exploratoryNeed,grounding=directGrounding(target,url,owner);
 if(target.researchObjective!=='SERVICE_COVERAGE'||!/^([A-Z]{2})$/.test(target.market??'')||marketProofContradicted(target)||(!v3MarketObjective&&!exploratoryNeed)||!grounding)return null;
 return {eligible:true,primaryFailureReason:'TARGET_MARKET_OBSERVATION_REQUIRED',routeBenefit:{kind:'TARGET_COUNTRY_OBSERVATION',targetMarket:target.market},marketProofIdentityKeys:v3MarketObjective?[v3MarketObjective.key]:[]};
}
