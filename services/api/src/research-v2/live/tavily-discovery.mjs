import {providerAccessGap,acquisitionEscalation} from './provider-access-gap.mjs';
import {interpretDirectProvider,directGeoGap} from './direct-provider-evidence.mjs';
// Runtime binding for the existing bounded controller, public reader and geo acquirer.
import {createTavilySearch} from './tavily-search.mjs';
import {createV2RobotsPublicAdapter} from './robots-policy.mjs';
import {DiscoveryJournal,officialCandidate} from './online-discovery.mjs';
import {discoveryInputs,createDiscoveryAcquirer} from './online-discovery-stage.mjs';
export function admittedDiscoveryCandidate(candidate){
 const decision=candidate.authority;
 if(decision?.eligible!==true||!decision.authority?.validated||new URL(decision.url).hostname!==decision.authority.hostname)throw Error('DISCOVERY_AUTHORITY_URL_MISMATCH');
 // Authority belongs to the reviewed final URL, not an untrusted redirecting lead.
 return {url:decision.url,authority:decision.authority,discoveryLeadUrl:candidate.url};
}
export async function createTavilyDiscovery({inventory,readKeychain,bounds,coveredServices=[],searchEnabled=true}={}){
 const search=searchEnabled?await createTavilySearch({readKeychain,maxCalls:bounds?.searches??50}):async()=>{throw Error('CAPABILITY_DISABLED_TAVILY');};
 return {search,bounds,coveredServices,bind({dir,runtime,bundle,runLive,dependencies}){
  const {registry}=discoveryInputs(inventory),dest=dir+'/open-web-discovery',journal=new DiscoveryJournal(dest+'/acquisition-budget');
  const acquire=createDiscoveryAcquirer({runtime,bundle,runLive,root:dest+'/acquisitions',dependencies});
  let requests=journal.events.filter(e=>e.type==='LEAD_READ_REQUEST').length,bytes=journal.events.filter(e=>e.type==='LEAD_READ_USAGE').at(-1)?.bytes??0;const perTarget=new Map();for(const e of journal.events.filter(e=>e.type==='LEAD_READ_REQUEST'))perTarget.set(e.target,(perTarget.get(e.target)??0)+1);
  return {search,bounds,coveredServices,
   async read({url,target}){
    const adapter=createV2RobotsPublicAdapter({authorities:target.authorities,retainRaw:true,maxLinks:80,maxReads:1,maxRequests:8,network:{timeoutMs:15000,maxBytes:2097152,maxRedirects:2,onBodyBytes:n=>{bytes+=n;if(bytes>48*1024*1024)throw Error('DISCOVERY_READ_BYTES_BOUND');}}});
    const page=await adapter.read({url,targetCountry:target.market,maxRedirects:2,consumeNetwork:kind=>{if(requests>=180||(perTarget.get(target.id)??0)>=24)throw Error('DISCOVERY_READ_REQUEST_BOUND');requests++;perTarget.set(target.id,(perTarget.get(target.id)??0)+1);journal.append('LEAD_READ_REQUEST',{target:target.id,url,kind});}});
    journal.append('LEAD_READ_USAGE',{target:target.id,requests,bytes});return page;
   },
   async classify({target,page}){return officialCandidate(target,{url:page.url??page.requestedUrl,label:'subscription pricing',method:'TAVILY_DISCOVERED_SOURCE'},registry.domains);},
   async consumeProvider({target,candidate,page,directory}){
    const admitted=admittedDiscoveryCandidate(candidate),gapProof=providerAccessGap(page);
    if(gapProof)return {url:admitted.url,classification:'DIRECT_ACCESS_GAP',verified:[],needsGeo:true,gapProof,acquisitionEscalation:acquisitionEscalation({page,targetMarket:target.market}),blockers:[page.failure.code],channel:'DIRECT_FAILED'};
    const direct=await interpretDirectProvider({target,page,directory});
    journal.append('DIRECT_INTERPRETED',{target:target.id,url:admitted.url,runDirectory:direct.runDirectory,monetary:direct.monetary,verified:direct.verified.length,blockers:direct.blockers});
    return {...direct,needsGeo:directGeoGap(direct)};
   },
   async acquire({target,candidate,direct,route,reason}){
    if(target.capabilities?.decodo===false)throw Error('CAPABILITY_DISABLED_DECODO');
    const independent=route==='DECODO'&&reason==='DIRECT_PROHIBITED_DECODO_PERMITTED';
    // Reservation already exists at dispatch; validate permission again without treating this reservation as a duplicate.
    if(independent&&!(target.capabilities?.direct===false&&target.capabilities?.decodo===true))throw Error('INDEPENDENT_DECODO_PERMISSION_REQUIRED');
    if(!independent&&(!direct?.needsGeo||!direct.acquisitionEscalation?.eligible))throw Error('DISCOVERY_ACQUISITION_FAILURE_PROOF_REQUIRED');
    const admitted=admittedDiscoveryCandidate(candidate);journal.reserve(target.id,'pages');
    journal.append(independent?'INDEPENDENT_DECODO_ADMITTED':'GEO_ESCALATION_ELIGIBLE',{target:target.id,url:admitted.url,reason:independent?reason:direct.acquisitionEscalation.primaryFailureReason,...(!independent?{proof:direct.acquisitionEscalation,blockers:direct.blockers}:{})});
    const start=journal.events.length,geo=await acquire({target,candidate:admitted,journal});
    if(journal.events.slice(start).some(e=>e.type==='BOUND_STOP'))return {...geo,classification:'BUDGET_STOP',hardStop:false,followUp:'NEEDS_DECODO',direct};
    return {...geo,channel:independent?'INDEPENDENT_DECODO':'DIRECT_THEN_GEO',routingReason:independent?reason:direct.acquisitionEscalation.primaryFailureReason,...(!independent?{direct}:{})};
   }
  };
 }};
}
