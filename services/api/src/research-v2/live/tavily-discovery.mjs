import {providerAccessGap,acquisitionEscalation,targetMarketAcquisition} from './provider-access-gap.mjs';
import {interpretDirectProvider,directGeoGap} from './direct-provider-evidence.mjs';
// Runtime binding for the existing bounded controller, public reader and geo acquirer.
import {createTavilySearch} from './tavily-search.mjs';
import {createV2RobotsPublicAdapter} from './robots-policy.mjs';
import {DiscoveryJournal,officialCandidate} from './online-discovery.mjs';
import {discoveryInputs,createDiscoveryAcquirer,retainedParents} from './online-discovery-stage.mjs';
import {canonical,digest} from '../../research-v3/model.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {providerRoutingAuthority} from './provider-routing-authority.mjs';
import {runHybridRenderedAcquisition} from './hybrid-rendered-acquisition.mjs';
import {activeRenderingNeed} from './rendering-diagnosis.mjs';
import {failedDecodoBrowserRoute} from './retained-render-source.mjs';
import {priceResearchAcquisitionCandidate} from './price-research-candidate.mjs';
import {sourceBoundPriceDecodoContinuation} from './source-bound-price-priority.mjs';
import {providerSourceDomainFamily} from '../../research-v3/provider-source-family.mjs';
import {executionBounds,resourceKey} from './execution-capabilities.mjs';
export function nonObservedDirectProviderPage(page,url){
 if(page.outcome==='OK')return null;
 return {url,classification:page.outcome==='ACCESS_CONTROL_STOP'?'DIRECT_ACCESS_BLOCKED':'DIRECT_ACQUISITION_UNRESOLVED',verified:[],needsGeo:false,blockers:[page.failure?.code??page.outcome],channel:'DIRECT_FAILED'};
}
export function admittedDiscoveryCandidate(candidate,target){
 const decision=candidate.authority;
 if(decision?.eligible!==true||!decision.authority?.validated||new URL(decision.url).hostname!==decision.authority.hostname)throw Error('DISCOVERY_AUTHORITY_URL_MISMATCH');
 if(decision.providerAuthorityBinding){
  const current=target&&providerRoutingAuthority(target,decision.url);
  const mechanisms=new Set(['V3_AUTONOMOUS_CANDIDATE_REVIEW','SOURCE_BOUND_SUBSCRIPTION_SERVICE_DISCOVERY','REVIEWED_PROVIDER_NAMESPACE']);
  if(!mechanisms.has(current?.provenance)||decision.authority.reference?.kind!==current.provenance||current.host!==decision.authority.hostname||canonical(current.binding)!==canonical(decision.providerAuthorityBinding)||canonical(decision.authority.reference?.binding)!==canonical(current.binding))throw Error('DISCOVERY_AUTHORITY_URL_MISMATCH');
 }
 // Authority belongs to the reviewed final URL, not an untrusted redirecting lead.
 return {url:decision.url,authority:decision.authority,discoveryLeadUrl:candidate.url};
}
export async function createTavilyDiscovery({inventory,env=process.env,readKeychain,bounds,coveredServices=[],searchEnabled=true}={}){
 const search=searchEnabled?await createTavilySearch({env,readKeychain,maxCalls:bounds?.searches??50}):async()=>{throw Error('CAPABILITY_DISABLED_TAVILY');};
 return {search,bounds,coveredServices,bind({dir,runtime,bundle,runLive,dependencies}){
  const {registry}=discoveryInputs(inventory),dest=dir+'/open-web-discovery',journal=new DiscoveryJournal(dest+'/acquisition-budget');
  const acquire=createDiscoveryAcquirer({runtime,bundle,runLive,root:dest+'/acquisitions',dependencies});
  let requests=journal.events.filter(e=>e.type==='LEAD_READ_REQUEST').length,bytes=journal.events.filter(e=>e.type==='LEAD_READ_USAGE').at(-1)?.bytes??0;const perTarget=new Map();for(const e of journal.events.filter(e=>e.type==='LEAD_READ_REQUEST'))perTarget.set(e.target,(perTarget.get(e.target)??0)+1);
  return {search,bounds,coveredServices,
   async read({url,target,maxBytes=2097152}){
    const adapter=createV2RobotsPublicAdapter({authorities:target.authorities,retainRaw:true,maxLinks:80,maxReads:1,maxRequests:8,network:{timeoutMs:15000,maxBytes,maxRedirects:2,onBodyBytes:n=>{bytes+=n;if(bytes>48*1024*1024)throw Error('DISCOVERY_READ_BYTES_BOUND');}}});
    const page=await adapter.read({url,targetCountry:target.market,maxRedirects:2,consumeNetwork:kind=>{if(requests>=180||(perTarget.get(target.id)??0)>=24)throw Error('DISCOVERY_READ_REQUEST_BOUND');requests++;perTarget.set(target.id,(perTarget.get(target.id)??0)+1);journal.append('LEAD_READ_REQUEST',{target:target.id,url,kind});}});
    journal.append('LEAD_READ_USAGE',{target:target.id,requests,bytes});return page;
   },
   async classify({target,page}){return officialCandidate(target,{url:page.url??page.requestedUrl,label:'subscription pricing',method:'TAVILY_DISCOVERED_SOURCE'},registry.domains);},
   async consumeProvider({target,candidate,page,directory}){
    const admitted=admittedDiscoveryCandidate(candidate,target),gapProof=providerAccessGap(page);
    if(gapProof)return {url:admitted.url,classification:'DIRECT_ACCESS_GAP',verified:[],needsGeo:true,gapProof,acquisitionEscalation:acquisitionEscalation({page,targetMarket:target.market}),blockers:[page.failure.code],channel:'DIRECT_FAILED'};
    const blocked=nonObservedDirectProviderPage(page,admitted.url);if(blocked)return blocked;
    const direct=await interpretDirectProvider({target,page,directory});
    journal.append('DIRECT_INTERPRETED',{target:target.id,url:admitted.url,runDirectory:direct.runDirectory,monetary:direct.monetary,verified:direct.verified.length,blockers:direct.blockers});
    return {...direct,needsGeo:directGeoGap(direct)};
   },
   async acquire({target,candidate,direct,route,reason,maxBytes=2097152}){
    if(target.capabilities?.decodo===false)throw Error('CAPABILITY_DISABLED_DECODO');
    const semantic=route==='DECODO'&&reason==='TARGET_MARKET_OBSERVATION_REQUIRED'?targetMarketAcquisition(target,candidate.url):null;
    if(semantic){if(target.capabilities?.decodo!==true)throw Error('CAPABILITY_DISABLED_DECODO');direct={needsGeo:true,acquisitionEscalation:semantic};}
    const independent=route==='DECODO'&&reason==='DIRECT_PROHIBITED_DECODO_PERMITTED';
    const continuation=route==='DECODO'&&reason==='SOURCE_BOUND_PRICE_DECODO_CONTINUATION'&&target.operationsObjective==='PRICE_RESEARCH'&&target.capabilities?.decodo===true
     ?(target.leads??[]).map(lead=>sourceBoundPriceDecodoContinuation(target,lead)).find(proof=>proof?.url===candidate?.url):null;
    if(reason==='SOURCE_BOUND_PRICE_DECODO_CONTINUATION'){
     const reserved=(target.decisions??[]).filter(row=>row.route==='DECODO'&&row.acquisitionReserved===true&&row.url===candidate?.url);
     const proof=reserved[0]?.sourceBoundPriceContinuation,authority=candidate?.authority;
     const official=continuation&&(providerSourceDomainFamily(target,continuation.url)||providerRoutingAuthority(target,continuation.url));
     const lead=(target.leads??[]).find(row=>row.url===continuation?.url&&row.from?.observation===continuation.parentObservation);
     const parent=(target.sourceBoundContinuationParents??[]).find(row=>row.id===continuation?.parentObservation&&row.sha256===continuation.parentHash);
     const parentSource=(target.acquisitionOutcomes??[]).find(row=>row.sourceClassification?.finalUrl===lead?.from?.url&&row.sourceClassification.sourceHash===continuation?.parentHash);
     const sameResource=continuation&&(target.acquisitionOutcomes??[]).some(row=>resourceKey(row.url)===resourceKey(continuation.url));
     if(!continuation||!official||!parent||parent.url!==lead?.from?.url||!parentSource||!/^([A-Z]{2})$/u.test(target.market??'')||target.id!==`price-research:${target.service}:${target.market}`||
      !authority?.eligible||authority.url!==continuation.url||authority.truthAuthority!=='NONE'||authority.reason!=='PRICE_RESEARCH_SOURCE_CANDIDATE'||
      reserved.length!==1||reserved[0].routingReason!==reason||canonical(proof)!==canonical(continuation)||
      (target.decisions??[]).filter(row=>row.acquisitionReserved===true).length>executionBounds.perServiceAcquisitions||sameResource||
      (target.blockedOrigins??[]).includes(new URL(continuation.url).origin))throw Error('SOURCE_BOUND_PRICE_CONTINUATION_REQUIRED');
    }
    const verification=route==='DECODO'&&(reason==='PRICE_RESEARCH_VERIFICATION_REQUIRED'||!!continuation)&&target.operationsObjective==='PRICE_RESEARCH'&&target.capabilities?.decodo===true;
    // Reservation already exists at dispatch; validate permission again without treating this reservation as a duplicate.
    if(independent&&!(target.capabilities?.direct===false&&target.capabilities?.decodo===true))throw Error('INDEPENDENT_DECODO_PERMISSION_REQUIRED');
    if(!independent&&!verification&&(!direct?.needsGeo||!direct.acquisitionEscalation?.eligible))throw Error('DISCOVERY_ACQUISITION_FAILURE_PROOF_REQUIRED');
    const routingOnly=verification&&priceResearchAcquisitionCandidate(target,candidate.url);
    const admitted=routingOnly?{url:routingOnly.url,acquisitionCandidate:routingOnly}:admittedDiscoveryCandidate(candidate,target);try{journal.reserve(target.id,'pages');}catch(error){if(String(error?.message).startsWith('DISCOVERY_BOUND_'))return {classification:'BUDGET_STOP',hardStop:false,followUp:'NEEDS_DECODO',direct,channel:verification?'PRICE_RESEARCH_DECODO':independent?'INDEPENDENT_DECODO':'DIRECT_THEN_GEO',routingReason:verification||independent?reason:direct.acquisitionEscalation.primaryFailureReason};throw error;}
    journal.append(verification?'PRICE_RESEARCH_DECODO_ADMITTED':independent?'INDEPENDENT_DECODO_ADMITTED':'GEO_ESCALATION_ELIGIBLE',{target:target.id,url:admitted.url,reason:verification||independent?reason:direct.acquisitionEscalation.primaryFailureReason,...(!independent&&!verification?{proof:direct.acquisitionEscalation,blockers:direct.blockers}:{})});
    const start=journal.events.length,geo=await acquire({target,candidate:admitted,journal,maxBytes});
    if(journal.events.slice(start).some(e=>e.type==='BOUND_STOP'))return {...geo,classification:'BUDGET_STOP',hardStop:false,followUp:'NEEDS_DECODO',direct};
    return {...geo,channel:verification?'PRICE_RESEARCH_DECODO':independent?'INDEPENDENT_DECODO':'DIRECT_THEN_GEO',routingReason:verification||independent?reason:direct.acquisitionEscalation.primaryFailureReason,...(!independent&&!verification?{direct}:{})};
   },
   async render({target,directory,need=activeRenderingNeed(target)}){
    const reacquisition=failedDecodoBrowserRoute(target,need);
    if(!need||!need.runDirectory&&!reacquisition)throw Error('RENDERED_PARENT_REQUIRED');
    const rows=reacquisition?[]:need.transport==='DIRECT'&&need.runDirectory===directory?(target.reads??[]).filter(row=>row.outcome==='OK'&&row.url===need.url&&row.bodyHash===need.sourceHash&&row.bodyFile===`bodies/${row.bodyHash}.txt`).map(row=>{const body=fs.readFileSync(path.join(directory,row.bodyFile),'utf8');if(digest(body)!==row.bodyHash)throw Error('RENDERED_PARENT_HASH_FAILURE');return {url:row.url,body,bodyHash:row.bodyHash};}):retainedParents(need.runDirectory,target),raw=rows.find(row=>row.url===need.url&&(!need.sourceHash||row.bodyHash===need.sourceHash));if(!raw&&!reacquisition)throw Error('RENDERED_PARENT_REQUIRED');
    const prior=raw&&[...(target.providerInterpretations??[]),{v3Observation:target.v3Observation}].reverse().map(row=>row?.v3Observation).find(row=>row?.url===need.url&&row.sha256===raw.bodyHash),parent=reacquisition?{id:'browser-route-'+digest([target.id,need.url,target.market]).slice(0,24),kind:'ROUTING_HINT',url:need.url,context:{transport:'DECODO',networkGeography:target.market,representation:'ROUTING_ONLY'},outcome:'UNOBSERVED'}:{id:prior?.id??'render-parent-'+raw.bodyHash.slice(0,24),kind:'PROVIDER',url:raw.url,context:prior?.context??{transport:need.transport,networkGeography:need.transport==='DECODO'?target.market:'UNBOUND',representation:'PROVIDER_PAGE'},outcome:'OK',body:raw.body,sha256:raw.bodyHash};
    const serviceName=target.providerSeedCandidateServiceContext?.serviceName??target.serviceName,objective={kind:'PRICE',serviceId:target.service,serviceName,providerHosts:[new URL(need.url).hostname],markets:[target.market],seeds:[target.providerSeedCandidateServiceContext?.objectiveResource?.url??need.url]},browser=dependencies.createRenderedBrowser?await dependencies.createRenderedBrowser({target,need}):dependencies.renderedBrowser;
    if(typeof browser!=='function')throw Error('RENDERED_BROWSER_CONFIGURATION_REQUIRED');
    return (dependencies.runHybridRenderedAcquisition??runHybridRenderedAcquisition)({directory:directory+'/hybrid-rendered',target:{...target,serviceName},objective,parent,url:need.url,transport:need.transport,browser,interpretVisual:dependencies.interpretVisual});
   }
  };
 }};
}
