import {targetMarketAcquisition,unresolvedV3TargetNeed} from './provider-access-gap.mjs';
import {pendingMarketProof,pendingV3MarketProof,marketProofContradicted} from './market-proof-continuation.mjs';
import {currentRetainedPriceReview,targetMarketPriceReview} from './retained-pricing.mjs';
import {priceNeedsStop,priceNeedRelevance,researchablePriceNeeds} from '../intelligence/price-evidence-needs.mjs';
import {managementInformation} from '../intelligence/management-targeting.mjs';
import {catalogObjective,capabilityDestination} from '../intelligence/login-manage.mjs';
import {retainedSuccesses} from './retained-success.mjs';
import {executableAction,exhaustedExecutionBudget} from './execution-capabilities.mjs';
import {hasProviderRoutingAuthority,providerRoutingAuthority} from './provider-routing-authority.mjs';
import {providerStageRoutingObjective,providerResourceRelevance,providerBranchPreference} from './provider-resource-routing.mjs';
import {authorityAcquisitionObjective,candidateAuthorityRouting,orderCandidateAuthorityRows} from './candidate-authority-routing.mjs';
// Ordinal information value, not a probability or provider fact. No transport.
import {normalizeFrontierUrl,semanticReasons} from './source-frontier.mjs';
const norm=u=>normalizeFrontierUrl(u).url;
export function destinationInformation(t,url,{diagnosis=null,unresolvedFields=[],attempts=[]}={}){
 const normalized=norm(url);if(!normalized)return {url:null,eligible:false,reason:'UNSAFE_URL'};const u=new URL(normalized),authority=providerRoutingAuthority(t,normalized);
 if(!authority)return {url:normalized,eligible:false,reason:'AUTHORITY_UNRESOLVED'};
 const regional=u.pathname.match(/^\/[a-z]{2,3}-([a-z]{2})(?:\/|$)/i)?.[1]?.toUpperCase();if(regional&&regional!==t.market)return {url:normalized,eligible:false,reason:'FOREIGN_LOCALE_DESTINATION'};
 const lead=(t.leads??[]).find(l=>norm(l.url)===normalized);const sem=semanticReasons(normalized,lead?.label??lead?.title??'');let p;try{p=decodeURIComponent(u.pathname).toLowerCase();}catch{return {url:normalized,eligible:false,reason:'MALFORMED_PATH'};}
 if(catalogObjective(t)){const c=managementInformation(t,normalized,lead?.label??lead?.title??'',{history:attempts});return {url:normalized,...c,discoveryRank:lead?.rank??0,traversalOrder:0};}
 if(sem.reject||/\/(?:login|signin|account|manage|logout|unsubscribe)(?:\/|$)/.test(p)||/privacy|cookie|career|investor|press|blog/.test(p))return {url:normalized,eligible:false,reason:'IRRELEVANT_OR_ACCOUNT_DESTINATION'};
 const missing=[diagnosis,...unresolvedFields].join(' '),terms=/COMMITMENT|TERM|RENEWAL|CANCEL/.test(missing),support=/support|help|faq|terms|legal|billing/.test(u.hostname+' '+p);
 const ranked=Number.isFinite(lead?.navigationPriority);let gain=ranked?Math.max(0,6-lead.navigationPriority/10):sem.priority<=10?5:p==='/'?2:3,reason='COMMERCIAL_DESTINATION';if(support){gain=terms?8:ranked?gain:/pricing|price|plans|membership|subscription|abonnement|tarif/.test(p)?4:1;reason=terms?'RESOLVE_TERM_OR_RENEWAL_FIELD':'SUBSCRIPTION_SUPPORT';}
 if(/cancel|downgrade|delete/.test(p)&&!terms){gain=0;reason='LOW_VALUE_FOR_PRICE_DISCOVERY';}
 if(!ranked&&(t.knownCommercialUrls??[]).some(x=>norm(x)===normalized))gain+=1;
 const marketObjective=pendingMarketProof(t).length>0;
 if(marketObjective){const sourceIntent=targetMarketAcquisition(t,normalized),relevant=!!sourceIntent||/country|region|market|availability|terms|legal|membership|subscription|bedingungen/iu.test(p+' '+(lead?.label??lead?.title??'')),objective=providerStageRoutingObjective(t),relevance=providerResourceRelevance(t,lead??{url:normalized,title:''},objective);return {url:normalized,eligible:relevant,informationGain:relevant?9:0,value:relevant?9:0,reason:sourceIntent?'SOURCE_BOUND_MARKET_OBJECTIVE':relevant?'RESOLVE_MARKET_PROOF':'NOT_MARKET_PROOF_DESTINATION',objective,objectiveRelevanceTier:relevance.tier,objectiveRole:relevance.role,objectiveSignals:relevance.signals,branchPreference:providerBranchPreference(t,lead,relevance),discoveryRank:lead?.rank??0,traversalOrder:lead?(t.leads??[]).indexOf(lead):(t.urls??[]).indexOf(url),marketApplicabilityEstablished:false};}
 const need=priceNeedRelevance(t,normalized,lead?.label??lead?.title??'');if(need&&gain>0){gain+=need.bonus;reason=need.reason;}
 const objective=providerStageRoutingObjective(t),relevance=providerResourceRelevance(t,lead??{url:normalized,title:''},objective);return {url:normalized,eligible:gain>0,informationGain:gain,relativeCost:1,value:gain,reason,objective,objectiveRelevanceTier:relevance.tier,objectiveRole:relevance.role,objectiveSignals:relevance.signals,branchPreference:providerBranchPreference(t,lead,relevance),discoveryRank:lead?.rank??0,traversalOrder:lead?(t.leads??[]).indexOf(lead):(t.urls??[]).indexOf(url),marketApplicabilityEstablished:false};
}
const compareDestination=(a,b)=>(a.objectiveRelevanceTier??3)-(b.objectiveRelevanceTier??3)||(a.branchPreference??0)-(b.branchPreference??0)||b.value-a.value||a.discoveryRank-b.discoveryRank||a.traversalOrder-b.traversalOrder||a.url.localeCompare(b.url);
export function actionableDestinations(t,{knowledge,urls=t.urls??[],executionContext}={}){
 const k=knowledge??{attempts:[],blockedOrigins:[],unresolvedFields:[]},attempts=k.attempts??[],evaluated=[...new Set(urls)].map(url=>{const x=destinationInformation(t,url,k);return {...x,capability:x.url?executableAction(t,{route:t.capabilities?.direct===false&&t.capabilities?.decodo===true?'DECODO':'DIRECT',url:x.url},executionContext):{executable:false,reason:'UNSAFE_URL'}};});
 const valid=evaluated.filter(x=>x.eligible&&!k.blockedOrigins?.includes(new URL(x.url).origin));
 const completed=a=>a.completed&&a.route==='DIRECT',seen=new Set(attempts.filter(a=>a.completed&&['DIRECT','DECODO'].includes(a.route)).flatMap(a=>[a.url,a.finalUrl].map(norm).filter(Boolean)));
 // A refresh is explicit metadata, not an implicit time-based retry or provider fact.
 const refresh=t.refreshReview?.approved===true&&typeof t.refreshReview.reason==='string'&&!!t.refreshReview.reference;
 const successes=t.adaptiveExecution&&!catalogObjective(t)?retainedSuccesses(t):[],reuse=successes.filter(r=>r.intact&&!r.reviewed&&!r.stale).sort((a,b)=>Number(!!b.sufficient)-Number(!!a.sufficient)||a.url.localeCompare(b.url))[0],reacquire=new Set(successes.filter(r=>r.intact&&(r.reviewed||r.stale)&&!r.sufficient).map(r=>r.url));
 const candidates=valid.map(x=>reacquire.has(x.url)?{...x,value:x.value+1,reason:'PREVIOUS_PROVIDER_SUCCESS_INSUFFICIENT_REACQUIRE_ONCE'}:x).filter(x=>x.capability.executable&&(!pendingMarketProof(t).length&&(refresh||reacquire.has(x.url)&&x.informationGain>=4)||!seen.has(x.url))).sort(compareDestination);
 const budgetBlocked=valid.filter(x=>exhaustedExecutionBudget(x.capability)&&(!pendingMarketProof(t).length&&(refresh||reacquire.has(x.url)&&x.informationGain>=4)||!seen.has(x.url))).sort(compareDestination);
 return {k,attempts,evaluated,valid,completed,seen,refresh,reuse,candidates,budgetBlocked};
}
function candidateAuthorityFrontier(t,urls,executionContext,knowledge){
 const attempted=new Set([...(t.reads??[]).flatMap(r=>[r.requestedUrl,r.url]),...(knowledge?.attempts??[]).flatMap(a=>[a.url,a.finalUrl])].map(norm).filter(Boolean));
 const blocked=new Set(knowledge?.blockedOrigins??t.blockedOrigins??[]);
 const rows=[...new Set(urls)].map((url,index)=>{const normalized=norm(url);if(!normalized||attempted.has(normalized)||blocked.has(new URL(normalized).origin))return null;const lead=(t.leads??[]).find(l=>norm(l.url)===normalized)??{url:normalized,originKind:'SEED',frontierOrder:index},capability=executableAction(t,{route:'DIRECT',url:normalized},executionContext);return {url:normalized,index,lead,...candidateAuthorityRouting(t,lead,index),capability};}).filter(Boolean),remainingReads=Math.min((executionContext?.bounds?.perServiceReads??Infinity)-(t.reads?.length??0),(executionContext?.bounds?.reads??Infinity)-(executionContext?.usage?.reads??0));
 return {objective:authorityAcquisitionObjective,candidates:orderCandidateAuthorityRows(rows.filter(row=>row.capability.executable),{remainingReads}),budgetBlocked:orderCandidateAuthorityRows(rows.filter(row=>exhaustedExecutionBudget(row.capability)),{remainingReads})};
}
function sourceBoundCandidateFrontier(t,executionContext,knowledge){
 const attempted=new Set([...(t.reads??[]).flatMap(r=>[r.requestedUrl,r.url]),...(knowledge?.attempts??[]).flatMap(a=>[a.url,a.finalUrl])].map(norm).filter(Boolean)),blocked=new Set(knowledge?.blockedOrigins??t.blockedOrigins??[]);
 const reads=t.reads??[],rows=(t.leads??[]).map((lead,index)=>{
  const url=norm(lead.url),source=lead.source,parent=reads.find(read=>norm(read.url??read.requestedUrl)===norm(lead.from?.url)&&read.bodyHash===source?.bodySha256&&read.sourceIntegrity?.sha256===source?.bodySha256);
  if(lead.sourceBoundCandidate!==true||lead.truthAuthority!=='NONE'||lead.authoritative!==false||!url||providerRoutingAuthority(t,url)||attempted.has(url)||blocked.has(new URL(url).origin)||!parent||lead.from?.mechanism!=='V3_SOURCE_BOUND_CONTINUATION'||lead.from?.bodyHash!==source?.bodySha256||lead.from?.locator?.sha256!==source?.sha256||source?.observation!==lead.from?.locator?.observation||!Number.isSafeInteger(source?.start)||!Number.isSafeInteger(source?.end)||source.start<0||source.start>=source.end)return null;
  const capability=executableAction(t,{route:'AUTHORITY_DISCOVERY',url},executionContext);
  return {url,index,lead,continuationId:lead.continuationId,continuationScore:Number.isFinite(lead.continuationScore)?lead.continuationScore:0,capability,authorityRole:'SOURCE_BOUND_PROVIDER_CANDIDATE',truthAuthority:'NONE'};
 }).filter(Boolean).sort((a,b)=>b.continuationScore-a.continuationScore||a.index-b.index||a.url.localeCompare(b.url));
 return {candidates:rows.filter(row=>row.capability.executable),budgetBlocked:rows.filter(row=>exhaustedExecutionBudget(row.capability))};
}
export function chooseInformationAction(t,{knowledge,retained=null,configurationDemonstrated=false,renderingDemonstrated=false,urls=t.urls??[],discoveryAllowed=true,discoveryQuery=null,executionContext}={}){
 const {k,attempts,evaluated,valid,completed,seen,refresh,reuse,candidates,budgetBlocked}=actionableDestinations(t,{knowledge,urls,executionContext});
 const authorityFrontier=!hasProviderRoutingAuthority(t)?candidateAuthorityFrontier(t,urls,executionContext,k):{candidates:[],budgetBlocked:[]};
 const continuationFrontier=hasProviderRoutingAuthority(t)?sourceBoundCandidateFrontier(t,executionContext,k):{candidates:[],budgetBlocked:[]};
 const countryIntents=valid.map((row,index)=>({row,index,intent:targetMarketAcquisition(t,row.url)})).filter(item=>item.intent&&executableAction(t,{route:'DECODO',url:item.row.url},executionContext).executable).sort((a,b)=>Number(b.intent.marketProofIdentityKeys.length>0)-Number(a.intent.marketProofIdentityKeys.length>0)||a.index-b.index);
 let route,reason,url=null,selectedCountryIntent=null;
 const pendingMarket=pendingMarketProof(t),v3MarketNeed=!!pendingV3MarketProof(t),unresolvedV3Need=unresolvedV3TargetNeed(t),sufficientReview=t.market?targetMarketPriceReview(t,retained):currentRetainedPriceReview(t,retained);
 if(!unresolvedV3Need&&(!pendingMarket.length||(!v3MarketNeed&&currentRetainedPriceReview(t,retained)?.market===t.market))&&!marketProofContradicted(t)&&!catalogObjective(t)&&sufficientReview?.sourceBound&&['HIGH','MEDIUM'].includes(retained.confidence)&&(retained.market===t.market||retained.objective==='SERVICE_COVERAGE')){route='RETAINED_SUFFICIENT';reason='SOURCE_BOUND_PRICE_ALREADY_AVAILABLE';}
 else if(marketProofContradicted(t)){route='STOP';reason='MARKET_CONTRADICTED';}
 else if(k.memoryRejected){route='STOP';reason='RESEARCH_MEMORY_RECONCILIATION_REQUIRED';}
 else if(t.researchObjective==='CATALOG_ONLY'&&t.loginManageEstablished===true){route='STOP';reason='CATALOG_OBJECTIVE_ALREADY_SATISFIED';}
 else if(configurationDemonstrated){route='PARK_CONFIGURATOR';reason='CONFIGURATOR_REQUIRED';}
 else if(renderingDemonstrated){route='PARK_RENDERING';reason='RENDERING_REQUIRED';}
 else if(!hasProviderRoutingAuthority(t)&&authorityFrontier.candidates.length){route='AUTHORITY_DISCOVERY';reason='CANDIDATE_FRONTIER_AVAILABLE';url=authorityFrontier.candidates[0].url;}
 else if(!hasProviderRoutingAuthority(t)&&authorityFrontier.budgetBlocked.length){route='STOP';reason=authorityFrontier.budgetBlocked[0].capability.reason;}
 else if(!hasProviderRoutingAuthority(t)){route=discoveryQuery?'AUTHORITY_DISCOVERY':'STOP';reason=discoveryQuery?'AUTHORITY_UNRESOLVED':'DISCOVERY_EXHAUSTED';}
 else if(reuse&&!pendingMarketProof(t).length){route='REUSE_RETAINED';reason='HASH_BOUND_PROVIDER_SUCCESS_REUSE';url=reuse.url;}
 else if(candidates.length){route=t.capabilities?.direct===false&&t.capabilities?.decodo===true?'DECODO':'DIRECT';url=candidates[0].url;reason=route==='DECODO'?'DIRECT_PROHIBITED_DECODO_PERMITTED':candidates[0].reason;}
 else if(continuationFrontier.candidates.length){route='AUTHORITY_DISCOVERY';reason='SOURCE_BOUND_CONTINUATION_AVAILABLE';url=continuationFrontier.candidates[0].url;}
 else if(countryIntents.length){selectedCountryIntent=countryIntents[0];route='DECODO';url=selectedCountryIntent.row.url;reason='TARGET_MARKET_OBSERVATION_REQUIRED';}
 else if(priceNeedsStop(t)&&!pendingMarketProof(t).length){route='STOP';reason=k.blockedOrigins?.length&&evaluated.filter(x=>x.url).length&&evaluated.filter(x=>x.url).every(x=>k.blockedOrigins.includes(new URL(x.url).origin))?'PROVIDER_ACCESS_POLICY_STOP':priceNeedsStop(t);}
 else {
 const failed=attempts.filter(a=>completed(a)&&a.permittedEscalation===true&&valid.some(x=>x.url===norm(a.url))&&!attempts.some(b=>b.route==='DECODO'&&b.completed&&norm(b.url)===norm(a.url))&&!attempts.some(b=>completed(b)&&b.outcome==='OK'&&norm(b.url)===norm(a.url))).at(-1);
 if(failed){route='CONDITIONAL_DECODO';url=norm(failed.url);reason='EXACT_PERMITTED_FAILED_DESTINATION';}
 else if(!researchablePriceNeeds(t).length&&valid.length&&valid.every(x=>seen.has(x.url))&&(k.unresolvedFields??[]).length>0&&k.unresolvedFields.every(x=>/STRUCTUR|OWNERSHIP|CONFLICT|PRODUCT_UNRESOLVED|PLAN_UNRESOLVED/.test(x))){route='STRUCTURED_REINTERPRETATION';reason='RETAINED_STRUCTURE_REQUIRES_REVIEW';}
 else if(!discoveryQuery){route='STOP';reason=!catalogObjective(t)&&(t.pricingFrontierLimited||(t.reads??[]).some(r=>r.navigation?.omittedDestinations>0))?'PRICING_NAVIGATION_BOUND_REACHED':'DISCOVERY_EXHAUSTED';}
 else if(k.blockedOrigins?.length&&evaluated.some(x=>x.url)&&evaluated.filter(x=>x.url).every(x=>k.blockedOrigins.includes(new URL(x.url).origin))){route='STOP';reason='PROVIDER_ACCESS_POLICY_STOP';}
 else if(t.capabilities?.tavily===false){route='STOP';reason='CAPABILITY_DISABLED_TAVILY';}
 else if(!discoveryAllowed){route='STOP';reason='KNOWN_DESTINATION_NEEDS_EVIDENCE_NOT_SEARCH';}
 else if(!executableAction(t,{route:'DISCOVERY'},executionContext).executable){route='STOP';reason=executableAction(t,{route:'DISCOVERY'},executionContext).reason;}
 else {route='DISCOVERY';reason='NO_USEFUL_PROVIDER_DESTINATION';}
 }
 return {route,reason,url,objective:!hasProviderRoutingAuthority(t)&&['AUTHORITY_DISCOVERY','STOP'].includes(route)?authorityAcquisitionObjective:providerStageRoutingObjective(t),authorityCandidates:authorityFrontier.candidates??[],sourceBoundCandidates:continuationFrontier.candidates??[],marketProofIdentityKeys:selectedCountryIntent?.intent.marketProofIdentityKeys??pendingMarketProof(t).map(o=>o.key),retainedKey:route==='REUSE_RETAINED'?reuse.key:null,runnable:['DIRECT','DECODO','DISCOVERY','AUTHORITY_DISCOVERY','REUSE_RETAINED'].includes(route),evaluated,candidates,budgetBlocked:[...budgetBlocked,...authorityFrontier.budgetBlocked,...continuationFrontier.budgetBlocked],attemptsConsidered:attempts.length,avoidedRepeatedDestinations:valid.filter(x=>seen.has(x.url)&&!refresh).length,refreshApplied:refresh,relativeCosts:{retained:0,direct:1,discovery:3,conditionalDecodo:5},ordinalOnly:true};
}
