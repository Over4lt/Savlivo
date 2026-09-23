import {priceNeedsStop,priceNeedRelevance,researchablePriceNeeds} from '../intelligence/price-evidence-needs.mjs';
import {managementInformation} from '../intelligence/management-targeting.mjs';
import {catalogObjective,capabilityDestination} from '../intelligence/login-manage.mjs';
import {retainedSuccesses} from './retained-success.mjs';
import {executableAction,exhaustedExecutionBudget} from './execution-capabilities.mjs';
// Ordinal information value, not a probability or provider fact. No transport.
import {normalizeFrontierUrl,semanticReasons} from './source-frontier.mjs';
const norm=u=>normalizeFrontierUrl(u).url;
export function destinationInformation(t,url,{diagnosis=null,unresolvedFields=[],attempts=[]}={}){
 const normalized=norm(url);if(!normalized)return {url:null,eligible:false,reason:'UNSAFE_URL'};const u=new URL(normalized),authority=t.authorities?.some(a=>a.hostname===u.hostname&&a.provider===t.serviceName&&a.checkedAt&&['OFFICIAL_PROVIDER','OFFICIAL_SUPPORT'].includes(a.sourceType));
 if(!authority)return {url:normalized,eligible:false,reason:'AUTHORITY_UNRESOLVED'};
 const regional=u.pathname.match(/^\/[a-z]{2,3}-([a-z]{2})(?:\/|$)/i)?.[1]?.toUpperCase();if(regional&&regional!==t.market)return {url:normalized,eligible:false,reason:'FOREIGN_LOCALE_DESTINATION'};
 const lead=(t.leads??[]).find(l=>norm(l.url)===normalized);const sem=semanticReasons(normalized,lead?.label??lead?.title??'');let p;try{p=decodeURIComponent(u.pathname).toLowerCase();}catch{return {url:normalized,eligible:false,reason:'MALFORMED_PATH'};}
 if(catalogObjective(t)){const c=managementInformation(t,normalized,lead?.label??lead?.title??'',{history:attempts});return {url:normalized,...c,discoveryRank:lead?.rank??0,traversalOrder:0};}
 if(sem.reject||/\/(?:login|signin|account|manage|logout|unsubscribe)(?:\/|$)/.test(p)||/privacy|cookie|career|investor|press|blog/.test(p))return {url:normalized,eligible:false,reason:'IRRELEVANT_OR_ACCOUNT_DESTINATION'};
 const missing=[diagnosis,...unresolvedFields].join(' '),terms=/COMMITMENT|TERM|RENEWAL|CANCEL/.test(missing),support=/support|help|faq|terms|legal|billing/.test(u.hostname+' '+p);
 const ranked=Number.isFinite(lead?.navigationPriority);let gain=ranked?Math.max(0,6-lead.navigationPriority/10):sem.priority<=10?5:p==='/'?2:3,reason='COMMERCIAL_DESTINATION';if(support){gain=terms?8:ranked?gain:/pricing|price|plans|membership|subscription|abonnement|tarif/.test(p)?4:1;reason=terms?'RESOLVE_TERM_OR_RENEWAL_FIELD':'SUBSCRIPTION_SUPPORT';}
 if(/cancel|downgrade|delete/.test(p)&&!terms){gain=0;reason='LOW_VALUE_FOR_PRICE_DISCOVERY';}
 if(!ranked&&(t.knownCommercialUrls??[]).some(x=>norm(x)===normalized))gain+=1;
 const need=priceNeedRelevance(t,normalized,lead?.label??lead?.title??'');if(need&&gain>0){gain+=need.bonus;reason=need.reason;}
 return {url:normalized,eligible:gain>0,informationGain:gain,relativeCost:1,value:gain,reason,discoveryRank:lead?.rank??0,traversalOrder:lead?(t.leads??[]).indexOf(lead):(t.urls??[]).indexOf(url),marketApplicabilityEstablished:false};
}
export function actionableDestinations(t,{knowledge,urls=t.urls??[],executionContext}={}){
 const k=knowledge??{attempts:[],blockedOrigins:[],unresolvedFields:[]},attempts=k.attempts??[],evaluated=[...new Set(urls)].map(url=>{const x=destinationInformation(t,url,k);return {...x,capability:x.url?executableAction(t,{route:'DIRECT',url:x.url},executionContext):{executable:false,reason:'UNSAFE_URL'}};});
 const valid=evaluated.filter(x=>x.eligible&&!k.blockedOrigins?.includes(new URL(x.url).origin));
 const completed=a=>a.completed&&a.route==='DIRECT',seen=new Set(attempts.filter(completed).flatMap(a=>[a.url,a.finalUrl].map(norm).filter(Boolean)));
 // A refresh is explicit metadata, not an implicit time-based retry or provider fact.
 const refresh=t.refreshReview?.approved===true&&typeof t.refreshReview.reason==='string'&&!!t.refreshReview.reference;
 const successes=t.adaptiveExecution&&!catalogObjective(t)?retainedSuccesses(t):[],reuse=successes.filter(r=>r.intact&&!r.reviewed&&!r.stale).sort((a,b)=>Number(!!b.sufficient)-Number(!!a.sufficient)||a.url.localeCompare(b.url))[0],reacquire=new Set(successes.filter(r=>r.intact&&(r.reviewed||r.stale)&&!r.sufficient).map(r=>r.url));
 const candidates=valid.map(x=>reacquire.has(x.url)?{...x,value:x.value+1,reason:'PREVIOUS_PROVIDER_SUCCESS_INSUFFICIENT_REACQUIRE_ONCE'}:x).filter(x=>x.capability.executable&&(refresh||!seen.has(x.url)||reacquire.has(x.url)&&x.informationGain>=4)).sort((a,b)=>b.value-a.value||a.discoveryRank-b.discoveryRank||a.traversalOrder-b.traversalOrder||a.url.localeCompare(b.url));
 const budgetBlocked=valid.filter(x=>exhaustedExecutionBudget(x.capability)&&(refresh||!seen.has(x.url)||reacquire.has(x.url)&&x.informationGain>=4));
 return {k,attempts,evaluated,valid,completed,seen,refresh,reuse,candidates,budgetBlocked};
}
export function chooseInformationAction(t,{knowledge,retained=null,configurationDemonstrated=false,renderingDemonstrated=false,urls=t.urls??[],discoveryAllowed=true,executionContext}={}){
 const {k,attempts,evaluated,valid,completed,seen,refresh,reuse,candidates,budgetBlocked}=actionableDestinations(t,{knowledge,urls,executionContext});
 let route,reason,url=null;
 if(!catalogObjective(t)&&retained?.sourceBound&&['HIGH','MEDIUM'].includes(retained.confidence)&&(retained.market===t.market||retained.objective==='SERVICE_COVERAGE')){route='RETAINED_SUFFICIENT';reason='SOURCE_BOUND_PRICE_ALREADY_AVAILABLE';}
 else if(k.memoryRejected){route='STOP';reason='RESEARCH_MEMORY_RECONCILIATION_REQUIRED';}
 else if(t.researchObjective==='CATALOG_ONLY'&&t.loginManageEstablished===true){route='STOP';reason='CATALOG_OBJECTIVE_ALREADY_SATISFIED';}
 else if(configurationDemonstrated){route='PARK_CONFIGURATOR';reason='CONFIGURATOR_REQUIRED';}
 else if(renderingDemonstrated){route='PARK_RENDERING';reason='RENDERING_REQUIRED';}
 else if(!t.authorities?.some(a=>a.provider===t.serviceName&&a.checkedAt&&['OFFICIAL_PROVIDER','OFFICIAL_SUPPORT'].includes(a.sourceType))){route='AUTHORITY_DISCOVERY';reason='AUTHORITY_UNRESOLVED';}
 else if(reuse){route='REUSE_RETAINED';reason='HASH_BOUND_PROVIDER_SUCCESS_REUSE';url=reuse.url;}
 else if(priceNeedsStop(t)){route='STOP';reason=k.blockedOrigins?.length&&evaluated.filter(x=>x.url).length&&evaluated.filter(x=>x.url).every(x=>k.blockedOrigins.includes(new URL(x.url).origin))?'PROVIDER_ACCESS_POLICY_STOP':attempts.filter(a=>a.route==='DISCOVERY'&&a.completed).length>=2?'DISCOVERY_EXHAUSTED':priceNeedsStop(t);}
 else if(candidates.length){route='DIRECT';url=candidates[0].url;reason=candidates[0].reason;}
 else {
 const failed=attempts.filter(a=>completed(a)&&a.permittedEscalation===true&&valid.some(x=>x.url===norm(a.url))&&!attempts.some(b=>b.route==='DECODO'&&b.completed&&norm(b.url)===norm(a.url))&&!attempts.some(b=>completed(b)&&b.outcome==='OK'&&norm(b.url)===norm(a.url))).at(-1);
 if(failed){route='CONDITIONAL_DECODO';url=norm(failed.url);reason='EXACT_PERMITTED_FAILED_DESTINATION';}
 else if(!researchablePriceNeeds(t).length&&valid.length&&valid.every(x=>seen.has(x.url))&&(k.unresolvedFields??[]).length>0&&k.unresolvedFields.every(x=>/STRUCTUR|OWNERSHIP|CONFLICT|PRODUCT_UNRESOLVED|PLAN_UNRESOLVED/.test(x))){route='STRUCTURED_REINTERPRETATION';reason='RETAINED_STRUCTURE_REQUIRES_REVIEW';}
 else if(attempts.filter(a=>a.route==='DISCOVERY'&&a.completed).length>=2){route='STOP';reason='DISCOVERY_EXHAUSTED';}
 else if(k.blockedOrigins?.length&&evaluated.some(x=>x.url)&&evaluated.filter(x=>x.url).every(x=>k.blockedOrigins.includes(new URL(x.url).origin))){route='STOP';reason='PROVIDER_ACCESS_POLICY_STOP';}
 else if(t.capabilities?.tavily===false){route='STOP';reason='CAPABILITY_DISABLED_TAVILY';}
 else if(!discoveryAllowed){route='STOP';reason='KNOWN_DESTINATION_NEEDS_EVIDENCE_NOT_SEARCH';}
 else if(!executableAction(t,{route:'DISCOVERY'},executionContext).executable){route='STOP';reason=executableAction(t,{route:'DISCOVERY'},executionContext).reason;}
 else {route='DISCOVERY';reason='NO_USEFUL_PROVIDER_DESTINATION';}
 }
 return {route,reason,url,retainedKey:route==='REUSE_RETAINED'?reuse.key:null,runnable:['DIRECT','DISCOVERY','REUSE_RETAINED'].includes(route),evaluated,candidates,budgetBlocked,attemptsConsidered:attempts.length,avoidedRepeatedDestinations:valid.filter(x=>seen.has(x.url)&&!refresh).length,refreshApplied:refresh,relativeCosts:{retained:0,direct:1,discovery:3,conditionalDecodo:5},ordinalOnly:true};
}
