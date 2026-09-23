import {managementInformation} from '../intelligence/management-targeting.mjs';
// One executable action space for planning and dispatch. No transport or evidence grants.
import {navigationKey,navigationRank} from './provider-navigation.mjs';
export const executionBounds=Object.freeze({managementReserveOnly:0,perServiceReads:4,perServiceSearches:2,perServiceAcquisitions:2,reads:80,searches:40,acquisitions:30});
export function resourceKey(url){const u=new URL(url),m=u.pathname.match(/^\/hc\/[^/]+\/(articles|sections)\/(\d+)/),app=u.pathname.match(/^\/([a-z]{2})\/app\/[^/]+\/(id\d+)/);return m?u.origin+'/'+m[1]+'/'+m[2]:app?u.origin+'/'+app[1]+'/'+app[2]:navigationKey(u.href);}
export function destinationReadAllowed(t,lead,bounds=executionBounds){const reviewed=t.authorities?.some(a=>a.hostname===new URL(lead.url).hostname),count=(t.reads??[]).filter(r=>new URL(r.requestedUrl).origin===new URL(lead.url).origin).length;return (!t.authorities?.length||reviewed)&&count<(reviewed&&navigationRank(t,lead)<=15?bounds.perServiceReads:2);}
export function executableAction(t,action,{bounds=executionBounds,usage={reads:0,searches:0,acquisitions:0},available={direct:true,discovery:true,decodo:true}}={}){
 if(t.capabilities)available={direct:available.direct!==false&&t.capabilities.direct,discovery:available.discovery!==false&&t.capabilities.tavily,decodo:available.decodo!==false&&t.capabilities.decodo};
 const no=reason=>({executable:false,reason}),yes=()=>({executable:true,reason:'CAPABILITY_AND_BUDGET_ALLOWED'}),route=action.route;
 if(route==='REUSE_RETAINED')return yes();
 if(route==='DIRECT'){
 if(bounds.managementReserveOnly===1){const lead=(t.leads??[]).find(l=>l.url===action.url),m=managementInformation(t,action.url,lead?.label??lead?.title??'');if(t.researchObjective!=='CATALOG_ONLY'||!m.strongManagement||m.missing.join('|')!=='WEB_MANAGEMENT')return no('MANAGEMENT_RESERVE_DESTINATION_REQUIRED');}
 if(available.direct===false)return no('DIRECT_DISABLED');if((t.reads??[]).length>=bounds.perServiceReads||usage.reads>=bounds.reads)return no('DIRECT_BUDGET_EXHAUSTED');
 let url;try{url=new URL(action.url);}catch{return no('INVALID_URL');}const l=(t.leads??[]).find(l=>navigationKey(l.url)===navigationKey(url.href))??{url:url.href};
 if((l.navigationDepth??0)>Math.min(3,t.smartResearch?.navigationDepth??3))return no('NAVIGATION_DEPTH_EXHAUSTED');
 if((t.blockedOrigins??[]).includes(url.origin))return no('PROVIDER_ACCESS_POLICY_STOP');
 if(!destinationReadAllowed(t,l,bounds))return no('DESTINATION_OR_ORIGIN_LIMIT');
 if((t.reads??[]).some(r=>resourceKey(r.requestedUrl)===resourceKey(url.href)||resourceKey(r.url??r.requestedUrl)===resourceKey(url.href)))return no('EQUIVALENT_RESOURCE_ALREADY_READ');
 if((t.reads??[]).some(r=>r.outcome==='ACCESS_CONTROL_STOP'&&new URL(r.requestedUrl).pathname===url.pathname))return no('ACCESS_CONTROL_PATH_STOP');return yes();
 }
 if(['DISCOVERY','AUTHORITY_DISCOVERY'].includes(route)){if(available.discovery===false)return no('DISCOVERY_DISABLED');if(t.lastSearchFailure)return no('DISCOVERY_FAILURE_REQUIRES_REVIEW');if((t.queries??[]).length>=bounds.perServiceSearches||usage.searches>=bounds.searches)return no('DISCOVERY_BUDGET_EXHAUSTED');if(action.query&&(t.queries??[]).some(q=>q.query===action.query))return no('DUPLICATE_DISCOVERY_QUERY');return yes();}
 if(route==='CONDITIONAL_DECODO'){if(available.decodo===false)return no('DECODO_DISABLED');if(!action.escalation?.eligible)return no('ACQUISITION_FAILURE_PROOF_REQUIRED');if((t.decisions??[]).filter(d=>d.acquisitionReserved).length>=bounds.perServiceAcquisitions||usage.acquisitions>=bounds.acquisitions)return no('DECODO_BUDGET_EXHAUSTED');return yes();}
 return no('NON_RUNNABLE_RESEARCH_STATE');
}

// Exact failure semantics: an ALLOWED result is never evidence of exhaustion.
const exhaustedBudgetReasons=new Set(['DIRECT_BUDGET_EXHAUSTED','DISCOVERY_BUDGET_EXHAUSTED','DECODO_BUDGET_EXHAUSTED']);
export const exhaustedExecutionBudget=result=>result?.executable===false&&exhaustedBudgetReasons.has(result.reason);
