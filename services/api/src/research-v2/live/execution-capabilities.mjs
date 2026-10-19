import {countryAcquisitionDisposition,targetMarketAcquisition} from './provider-access-gap.mjs';
import {usableResearchMemory} from './research-memory.mjs';
import {managementInformation} from '../intelligence/management-targeting.mjs';
import {hasProviderRoutingAuthority,providerRoutingAuthority} from './provider-routing-authority.mjs';
import {activeRenderingNeed} from './rendering-diagnosis.mjs';
import {retainedProviderRenderingAuthority,retainedProviderSelectorAuthority} from './retained-render-source.mjs';
import {priceResearchAcquisitionCandidate} from './price-research-candidate.mjs';
import {normalizePublicUrl} from '../../research-v1/public-network.mjs';
// One executable action space for planning and dispatch. No transport or evidence grants.
import {navigationKey,navigationRank} from './provider-navigation.mjs';
export const executionBounds=Object.freeze({managementReserveOnly:0,perServiceReads:4,perServiceSearches:2,perServiceAcquisitions:2,reads:80,searches:40,acquisitions:30,bytes:2*1024*1024,bytesPerPage:2*1024*1024});
export function resourceKey(url){const u=new URL(url),m=u.pathname.match(/^\/hc\/[^/]+\/(articles|sections)\/(\d+)/),app=u.pathname.match(/^\/([a-z]{2})\/app\/[^/]+\/(id\d+)/);return m?u.origin+'/'+m[1]+'/'+m[2]:app?u.origin+'/'+app[1]+'/'+app[2]:navigationKey(u.href);}
export function alreadyAccountedSameCampaignRead(t,row){
 const marker=row?.sameCampaignEvidenceReuse,proof=t?.providerSeedAuthorityHandoff?.serviceProof?.observation,campaign=t?.currentCampaignEvidenceCampaign;if(!marker||!proof||!/^([a-f0-9]{64})$/.test(campaign??'')||marker.campaign!==campaign)return false;
 const key=[marker.observation,row.url,marker.sha256].join(':');return marker.observation===proof.id&&marker.sha256===proof.sha256&&row.url===proof.url&&row.requestedUrl===proof.url&&row.outcome==='OK'&&row.truncated!==true&&row.bodyHash===marker.sha256&&row.sourceIntegrity?.sha256===marker.sha256&&row.bodyFile===`bodies/${marker.sha256}.txt`&&marker.networkRequests===0&&marker.bytes===0&&marker.acquisitions===0&&(t.currentCampaignEvidenceReuses??[]).includes(key)&&row.stale!==true&&!(t.invalidatedEvidence??[]).includes(marker.sha256);
}
export const directAcquisitionReads=t=>(t.reads??[]).filter(row=>!alreadyAccountedSameCampaignRead(t,row));
export function equivalentCountryAcquisitionAttempted(t,url){
 const key=resourceKey(url),outcomes=(t.acquisitionOutcomes??[]).filter(row=>resourceKey(row.url)===key),retryable=outcomes.length>0&&outcomes.every(row=>countryAcquisitionDisposition(row)==='RETRYABLE_ACQUISITION_FAILURE');
 if(outcomes.length&&!retryable)return true;
 const priorLinkAcquisition=(t.researchLinkOutcomes??[]).some(row=>row.decodoAttempted===true&&(t.researchLinks??[]).some(link=>link.id===row.id&&resourceKey(link.url)===key));
 return priorLinkAcquisition||!retryable&&(t.decisions??[]).some(row=>row.acquisitionReserved&&['DECODO','CONDITIONAL_DECODO'].includes(row.route)&&resourceKey(row.url)===key);
}
export function destinationReadAllowed(t,lead,bounds=executionBounds,{candidateAuthorityReview=false}={}){const reviewed=providerRoutingAuthority(t,lead.url),priceCandidate=priceResearchAcquisitionCandidate(t,lead.url),authorityEvidence=candidateAuthorityReview&&typeof lead.authorityEvidenceFor==='string',sourceBoundCandidate=candidateAuthorityReview&&lead.sourceBoundCandidate===true,objectiveLeadCandidate=candidateAuthorityReview&&lead.providerSeedObjectiveLead===true,boundedAuthorityCandidate=authorityEvidence||sourceBoundCandidate||objectiveLeadCandidate,count=directAcquisitionReads(t).filter(r=>new URL(r.requestedUrl).origin===new URL(lead.url).origin).length;return (!hasProviderRoutingAuthority(t)||reviewed||priceCandidate||boundedAuthorityCandidate)&&count<(reviewed&&navigationRank(t,lead)<=15?bounds.perServiceReads:authorityEvidence?2:sourceBoundCandidate||objectiveLeadCandidate?1:2);}
export function executableAction(t,action,{bounds=executionBounds,usage={reads:0,searches:0,acquisitions:0,bytes:0},available={direct:true,discovery:true,decodo:true,browser:true}}={}){
 if(t.capabilities)available={direct:available.direct!==false&&t.capabilities.direct,discovery:available.discovery!==false&&t.capabilities.tavily,decodo:available.decodo!==false&&t.capabilities.decodo,browser:available.browser!==false&&t.capabilities.browser};
 const no=reason=>({executable:false,reason}),yes=()=>({executable:true,reason:'CAPABILITY_AND_BUDGET_ALLOWED'}),route=action.route;
 if(route==='REUSE_RETAINED')return yes();
 if(route==='PARK_RENDERING'){
  const need=activeRenderingNeed(t);if(!need||need.url!==action.url)return no('RENDERING_NEED_RECONCILED');
  if(available.browser!==true)return no('BROWSER_DISABLED');if(!providerRoutingAuthority(t,need.url)&&!retainedProviderRenderingAuthority(t,{url:need.url,transport:need.transport,sourceHash:need.sourceHash})&&!retainedProviderSelectorAuthority(t,{url:need.url,sourceHash:need.sourceHash}))return no('AUTHORITY_UNRESOLVED');
  if(usage.acquisitions>=bounds.acquisitions||(t.decisions??[]).filter(row=>row.acquisitionReserved).length>=bounds.perServiceAcquisitions)return no('DECODO_BUDGET_EXHAUSTED');return yes();
 }
 if(route==='AUTHORITY_DISCOVERY'&&action.url)return executableAction(t,{route:'DIRECT',url:action.url,candidateAuthorityReview:true},{bounds,usage,available});
 if(route==='DIRECT'){
 if(bounds.managementReserveOnly===1){const lead=(t.leads??[]).find(l=>l.url===action.url),m=managementInformation(t,action.url,lead?.label??lead?.title??'');if(t.researchObjective!=='CATALOG_ONLY'||!m.strongManagement||m.missing.join('|')!=='WEB_MANAGEMENT')return no('MANAGEMENT_RESERVE_DESTINATION_REQUIRED');}
 if(available.direct===false)return no('DIRECT_DISABLED');if(usage.bytes>=bounds.bytes||bounds.bytesPerPage===0)return no('BYTE_BUDGET_EXHAUSTED');if(directAcquisitionReads(t).length>=bounds.perServiceReads||usage.reads>=bounds.reads)return no('DIRECT_BUDGET_EXHAUSTED');
 let url;try{url=t.operationsObjective==='PRICE_RESEARCH'?normalizePublicUrl(action.url):new URL(action.url);}catch{return no('INVALID_URL');}const l=(t.leads??[]).find(l=>navigationKey(l.url)===navigationKey(url.href))??{url:url.href};
 if((l.navigationDepth??0)>Math.min(3,t.smartResearch?.navigationDepth??3))return no('NAVIGATION_DEPTH_EXHAUSTED');
 if((t.blockedOrigins??[]).includes(url.origin))return no('PROVIDER_ACCESS_POLICY_STOP');
 if(!destinationReadAllowed(t,l,bounds,{candidateAuthorityReview:action.candidateAuthorityReview===true}))return no('DESTINATION_OR_ORIGIN_LIMIT');
 if((t.reads??[]).some(r=>resourceKey(r.requestedUrl)===resourceKey(url.href)||resourceKey(r.url??r.requestedUrl)===resourceKey(url.href)))return no('EQUIVALENT_RESOURCE_ALREADY_READ');
 if((t.reads??[]).some(r=>r.outcome==='ACCESS_CONTROL_STOP'&&new URL(r.requestedUrl).pathname===url.pathname))return no('ACCESS_CONTROL_PATH_STOP');return yes();
 }
 if(['DISCOVERY','AUTHORITY_DISCOVERY'].includes(route)){if(available.discovery===false)return no('DISCOVERY_DISABLED');if(t.lastSearchFailure)return no('DISCOVERY_FAILURE_REQUIRES_REVIEW');if((t.queries??[]).length>=bounds.perServiceSearches||usage.searches>=bounds.searches)return no('DISCOVERY_BUDGET_EXHAUSTED');if(action.query&&(t.queries??[]).some(q=>q.query===action.query))return no('DUPLICATE_DISCOVERY_QUERY');return yes();}
 if(route==='DECODO'){
  if(usage.bytes>=bounds.bytes||bounds.bytesPerPage===0)return no('BYTE_BUDGET_EXHAUSTED');
  const semantic=!!targetMarketAcquisition(t,action.url);
  const verification=action.reason==='PRICE_RESEARCH_VERIFICATION_REQUIRED'&&t.operationsObjective==='PRICE_RESEARCH';
  if((t.capabilities?.direct!==false&&!semantic&&!verification)||t.capabilities?.decodo!==true||available.decodo===false)return no('INDEPENDENT_DECODO_PERMISSION_REQUIRED');
  if(!(/^[A-Z]{2}$/.test(t.market??'')))return no('DECODO_ADMITTED_MARKET_REQUIRED');
  let url;try{url=t.operationsObjective==='PRICE_RESEARCH'?normalizePublicUrl(action.url):new URL(action.url);}catch{return no('INVALID_URL');}
  if(url.protocol!=='https:'||url.username||url.password)return no('INVALID_URL');
  if(!providerRoutingAuthority(t,url.href)&&!(verification&&priceResearchAcquisitionCandidate(t,url.href)))return no('AUTHORITY_UNRESOLVED');
  const memory=usableResearchMemory(t);if(memory.rejected)return no('RESEARCH_MEMORY_RECONCILIATION_REQUIRED');
  if([...(t.blockedOrigins??[]),...memory.blockedOrigins].includes(url.origin))return no('PROVIDER_ACCESS_POLICY_STOP');
  if(verification&&(t.reads??[]).some(row=>row.outcome==='ACCESS_CONTROL_STOP'&&new URL(row.requestedUrl).pathname===url.pathname))return no('ACCESS_CONTROL_PATH_STOP');
  const lead=(t.leads??[]).find(l=>l.url===action.url);if((lead?.navigationDepth??0)>Math.min(3,t.smartResearch?.navigationDepth??3))return no('NAVIGATION_DEPTH_EXHAUSTED');
  const derivedCountrySource=t.service==='max'&&(t.derivedCountryCandidates??[]).some(row=>resourceKey(row.url)===resourceKey(url.href));
  if(verification&&!action.researchLinkId&&!derivedCountrySource&&((t.decisions??[]).some(row=>row.route==='DECODO'&&row.acquisitionReserved)||(t.acquisitionOutcomes??[]).length>0))return no('EQUIVALENT_RESOURCE_ALREADY_ATTEMPTED');
  const prior=[...(semantic||verification?[]:(t.reads??[]).map(r=>r.requestedUrl)),...(semantic?(equivalentCountryAcquisitionAttempted(t,url.href)?[url.href]:[]):[...(t.acquisitionOutcomes??[]).map(r=>r.url),...(t.decisions??[]).filter(d=>d.acquisitionReserved&&(!verification||d.route==='DECODO')).map(d=>d.url)]),...memory.attempts.filter(a=>a.completed&&a.url&&(!(semantic||verification)||a.route==='DECODO')).map(a=>a.url)];
  if(prior.some(u=>resourceKey(u)===resourceKey(url.href)))return no('EQUIVALENT_RESOURCE_ALREADY_ATTEMPTED');
  if((t.decisions??[]).filter(d=>d.acquisitionReserved).length>=bounds.perServiceAcquisitions||usage.acquisitions>=bounds.acquisitions)return no('DECODO_BUDGET_EXHAUSTED');
  return yes();
 }
 if(route==='CONDITIONAL_DECODO'){if(usage.bytes>=bounds.bytes||bounds.bytesPerPage===0)return no('BYTE_BUDGET_EXHAUSTED');if(available.decodo===false)return no('DECODO_DISABLED');if(!action.escalation?.eligible)return no('ACQUISITION_FAILURE_PROOF_REQUIRED');if((t.decisions??[]).filter(d=>d.acquisitionReserved).length>=bounds.perServiceAcquisitions||usage.acquisitions>=bounds.acquisitions)return no('DECODO_BUDGET_EXHAUSTED');return yes();}
 return no('NON_RUNNABLE_RESEARCH_STATE');
}

// Exact failure semantics: an ALLOWED result is never evidence of exhaustion.
const exhaustedBudgetReasons=new Set(['DIRECT_BUDGET_EXHAUSTED','DISCOVERY_BUDGET_EXHAUSTED','DECODO_BUDGET_EXHAUSTED','BYTE_BUDGET_EXHAUSTED']);
export const exhaustedExecutionBudget=result=>result?.executable===false&&exhaustedBudgetReasons.has(result.reason);
