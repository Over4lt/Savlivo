// An explicit interactive route, or a GLOBAL Direct link declaring a redirect
// entry point, may be probed for a provider-owned market selector. This is
// routing eligibility only; no URL query or locale is market evidence.
export function providerMarketSelectorRoute(link){
 if(!link||link.enabled!==true||link.truthAuthority!=='NONE'||link.marketScope!=='GLOBAL')return false;
 if(link.kind==='INTERACTIVE_ROUTE')return true;
 try{return link.kind==='DIRECT_SOURCE'&&new URL(link.url).searchParams.get('redirect')==='true';}catch{return false;}
}

export const researchLinkPriorityTarget=(baseTarget,capabilities)=>({...baseTarget,urls:[],leads:[],knownCommercialUrls:(baseTarget.derivedCountryCandidates??[]).map(row=>row.url),capabilities:{...capabilities,direct:capabilities.direct===true&&(capabilities.browser===true&&(baseTarget.researchLinks??[]).some(providerMarketSelectorRoute)||(baseTarget.learnedPricingStrategies??[]).some(row=>row.method==='DIRECT')),tavily:false}});

// Routing permission for a Browser continuation on the exact Decodo source
// already classified as a provider source. This never supplies price Truth.
import {providerSourceDomainFamily} from '../../research-v3/provider-source-family.mjs';
import {providerRoutingAuthority} from './provider-routing-authority.mjs';

// A failed, permitted Decodo response may justify one fresh Browser acquisition.
// This is a routing proof only: it contains no provider body, market receipt or
// price evidence. Browser must obtain and verify all three independently.
export function failedDecodoBrowserRoute(target,need){
 if(target?.operationsObjective!=='PRICE_RESEARCH'||need?.kind!=='DECODO_BROWSER_REACQUISITION'||need.transport!=='DECODO'||need.market!==target.market||need.sourceHash!==null||!target.capabilities?.browser||!target.capabilities?.decodo||!providerRoutingAuthority(target,need.url))return false;
 if((target.blockedOrigins??[]).includes(new URL(need.url).origin))return false;
 const attempts=(target.acquisitionOutcomes??[]).filter(row=>row.url===need.url&&row.researchLinkId===need.researchLinkId&&row.channel==='PRICE_RESEARCH_DECODO'&&row.classification==='ACQUISITION_FAILED'&&row.responseTooLarge===true&&row.sourceClassification?.status==='UNKNOWN_SOURCE'&&row.sourceClassification?.sourceHash===null&&row.countryV3Evaluation?.status==='UNRESOLVED');
 const link=(target.researchLinks??[]).find(row=>row.id===need.researchLinkId&&row.enabled===true&&row.truthAuthority==='NONE'&&row.url===need.url&&(row.marketScope==='GLOBAL'||row.marketScope==='MARKET_SPECIFIC'&&row.marketCode===target.market));
 return attempts.length===1&&!!link;
}

export function retainedProviderRenderingAuthority(target,{url,transport,sourceHash}={}){
 if(transport!=='DECODO'||!/^[a-f0-9]{64}$/.test(sourceHash??'')||!providerSourceDomainFamily(target,url))return false;
 return (target.acquisitionOutcomes??[]).some(row=>row.sourceClassification?.status==='PROVIDER_SOURCE'&&row.sourceClassification.finalUrl===url&&row.sourceClassification.sourceHash===sourceHash&&row.countryV3Evaluation?.status==='EVALUATED'&&row.countryV3Evaluation.receiptStatus==='HASH_VERIFIED'&&row.countryV3Evaluation.geoClass==='G1');
}

// Routing permission for an exact, retained Direct read of an operator's GLOBAL
// provider route. The checked-in provider family binds identity; the link and
// static shell grant neither market nor price truth.
export function retainedProviderSelectorAuthority(target,{url,sourceHash}={}){
 if(target?.operationsObjective!=='PRICE_RESEARCH'||!/^[a-f0-9]{64}$/.test(sourceHash??''))return null;
 const source=(target.reads??[]).find(row=>row.url===url&&row.outcome==='OK'&&row.truncated!==true&&row.bodyHash===sourceHash&&row.sourceIntegrity?.sha256===sourceHash&&row.bodyFile===`bodies/${sourceHash}.txt`&&row.accessDecisions?.length&&row.accessDecisions.every(decision=>['ALLOWED','NO_ROBOTS_POLICY'].includes(decision.decision)));
 if(!source)return null;
 const link=(target.researchLinks??[]).find(row=>providerMarketSelectorRoute(row)&&row.url===source.requestedUrl);
 if(!link||new URL(link.url).origin!==new URL(url).origin)return null;
 return providerSourceDomainFamily(target,url);
}
