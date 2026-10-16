// Acquisition permission for a PRICE_RESEARCH lead. This is deliberately not
// provider authority and must never be supplied to V3 as evidence.
import {normalizePublicUrl} from '../../research-v1/public-network.mjs';
import {candidateRelevant} from './candidate-authority-routing.mjs';
import {normalizeFrontierUrl} from './source-frontier.mjs';

const same=(a,b)=>!!a&&!!b&&!!normalizeFrontierUrl(a).url&&normalizeFrontierUrl(a).url===normalizeFrontierUrl(b).url;

export function priceResearchAcquisitionCandidate(target,value){
 if(target?.operationsObjective!=='PRICE_RESEARCH')return null;
 let url;try{url=normalizePublicUrl(value).href;}catch{return null;}
 if(!normalizeFrontierUrl(url).url)return null;
 const suggested=(target.researchCandidateLineage??[]).some(row=>row.truthAuthority==='NONE'&&row.sourceUrl&&same(row.sourceUrl,url));
 const lead=(target.leads??[]).find(row=>same(row.url,url));
 const discovered=lead&&['SEARCH','CHILD'].includes(lead.originKind)&&candidateRelevant(target,lead);
 const routed=lead&&candidateRelevant(target,lead)&&(lead.providerRootSeed===true||lead.learnedProviderPricingRoute===true||lead.providerSeedObjectiveLead===true||lead.sourceBoundCandidate===true||lead.originSuggestedIds?.length>0||/^GOOGLE_AI_/u.test(lead.origin??''));
 const known=(target.knownCommercialUrls??[]).some(row=>same(row,url))&&candidateRelevant(target,{url});
 if(!suggested&&!discovered&&!routed&&!known)return null;
 return {url,eligible:true,reason:'PRICE_RESEARCH_SOURCE_CANDIDATE',truthAuthority:'NONE',origin:suggested?'V4_SUGGESTED_SOURCE':lead?.origin??lead?.originKind??'KNOWN_COMMERCIAL_URL'};
}
