import {retainedPricingSummary} from '../intelligence/recurring-price-eligibility.mjs';
import {currentRetainedPriceReview} from './retained-pricing.mjs';
import {mergePriceEvidenceNeeds} from '../intelligence/price-evidence-needs.mjs';
import {actionableDestinations} from './information-routing.mjs';
import {researchKnowledge} from './research-memory.mjs';
import {missingCatalogFields} from '../intelligence/management-targeting.mjs';
import {inspectLoginManage,mergeTargetCapabilities} from '../intelligence/login-manage.mjs';
import {consumeRetainedSuccess} from './retained-success.mjs';
import {executableAction,resourceKey,destinationReadAllowed} from './execution-capabilities.mjs';
export {destinationReadAllowed} from './execution-capabilities.mjs';
import {planResearch,contextualQuery,diagnoseResearch} from './research-planner.mjs';
// Small host-bridge research loop. Search/page text is never verification evidence.
import fs from 'node:fs';
import {providerAccessGap,acquisitionEscalation} from './provider-access-gap.mjs';
import {sha,commercialFields} from './online-discovery.mjs';
import {normalizePublicUrl} from '../../research-v1/public-network.mjs';
import {sourceLinks} from './source-frontier-links.mjs';
import {providerNavigation,navigationRank,navigationKey} from './provider-navigation.mjs';
export const openWebBounds=Object.freeze({managementReserveOnly:0,services:78,searches:50,reads:80,acquisitions:30,perServiceSearches:5,perServiceReads:8,perServiceAcquisitions:3,leadsPerService:40,linksPerPage:80,bytesPerPage:2097152});
export function retainedPriceReview(directory,target){
 if(!directory||!fs.existsSync(directory))return null;
 const output=fs.readdirSync(directory).filter(n=>/^interpretation-\d+$/.test(n)).sort().at(-1);
 const artifact=output&&directory+'/'+output+'/provider-price-intelligence.json';if(!artifact||!fs.existsSync(artifact))return null;
 return retainedPricingSummary(target,JSON.parse(fs.readFileSync(artifact)).observations??[],{artifact});
}
const cacheKey=(target,url)=>target.service+'|'+url;
const safe=u=>{try{return normalizePublicUrl(u).href;}catch{return null;}};
const relevant=(t,l)=>{const terms=(t.serviceName.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)??[]);const text=(l.title+' '+l.url).toLowerCase();return terms.some(w=>text.includes(w));};
const score=l=>{const text=l.title+' '+l.url;return (/\/(?:buy|pricing|plans|subscriptions|subscribe)\/?(?:\?|$)/i.test(l.url)?-5:0)+(/support|kundeservice|help\./i.test(l.url)?-2:0)+(/articles|faq/i.test(l.url)?-1:0)+(/price|pricing|plans|pris|abonnement|subscription|premium|buy|purchase|membership|billing|renew|이용권|결제|planes|precio/i.test(text)?-2:0)+(/gift|coaching|history|privacy|terms|cancellation|categories|sections/i.test(l.url)?4:0);};
// Scheduling relevance is not authority admission. Exact reviewed hosts only;
// the normal redirect/authority validator still controls evidence consumption.
export const reviewedDestination=(t,url)=>t.authorities?.some(a=>a.hostname===new URL(url).hostname)??false;
export function destinationPriority(t,lead){return navigationRank(t,lead);}
export function rankPlannerLeads(t){if(t.smartResearch?.version===2)for(const l of t.leads)l.navigationPriority=(destinationPriority(t,l)*100+score(l)-(new RegExp('(?:[/_-])'+t.market+'(?:[/_.-]|$)','i').test(new URL(l.url).pathname)?3:0)-(t.authorities?.some(d=>d.hostname===new URL(l.url).hostname)?3:0))/100;return t;}
export function usefulProviderDestination(t,lead){
 if(!reviewedDestination(t,lead.url))return false;
 const p=new URL(lead.url).pathname;
 return (t.knownCommercialUrls??[]).includes(lead.url)||destinationPriority(t,lead)<=15||/(?:^|[\/_-])(?:products?|services?|offers?|packages?)(?:[\/_-]|$)/i.test(p)&&destinationPriority(t,lead)<40;
}
export function destinationDiscoveryNeeded(t,bounds,usage){
 // Discovery locates a destination; it does not fill interpretation/verification fields.
 if(t.authorities?.length&&(t.reads.length>=bounds.perServiceReads||usage.reads>=bounds.reads))return false;
 const available=l=>!t.blockedOrigins.includes(new URL(l.url).origin);
 if(t.smartResearch?.version===2){
  if(t.researchObjective==='CATALOG_ONLY'?!missingCatalogFields(t).length:!(t.gaps?.length))return false;
  const destinations=actionableDestinations(t,{knowledge:researchKnowledge(t),urls:t.leads.map(l=>l.url),executionContext:{bounds,usage}});
  if(destinations.candidates.length||destinations.reuse)return false;
 }else if(t.leads.some(l=>available(l)&&usefulProviderDestination(t,l)))return false;
 if((t.providerInterpretations??[]).some(o=>o.needsGeo&&!t.blockedOrigins.includes(new URL(o.url).origin)))return false;
 if(t.authorities?.length&&t.authorities.every(a=>t.blockedOrigins.includes('https://'+a.hostname)))return false;
 return true;
}
// Identity metadata is complete even when the acquisition campaign is bounded.
export const catalogIdentityMetadata=(catalog,previous=[])=>[...new Map([...previous,...catalog].map(t=>[t.service,{service:t.service,serviceName:t.serviceName}])).values()];
export class OpenWebResearch {
 constructor(directory,targets,bounds=openWebBounds,catalog=targets){this.directory=directory;this.bounds={...openWebBounds,...bounds};for(const [k,v]of Object.entries(this.bounds))if(!(k in openWebBounds)||!Number.isSafeInteger(v)||v<0||v>(k==='managementReserveOnly'?1:openWebBounds[k]))throw Error('INVALID_DISCOVERY_BOUND:'+k);fs.mkdirSync(directory,{recursive:true});this.file=directory+'/state.json';this.state=fs.existsSync(this.file)?JSON.parse(fs.readFileSync(this.file)): {version:1,catalog:catalogIdentityMetadata(catalog),targets:targets.map(t=>({...t,gaps:t.gaps??commercialFields,queries:[],reads:[],leads:[],decisions:[],blockedOrigins:t.blockedOrigins??[],verified:[]})),usage:{searches:0,reads:0,acquisitions:0},cache:{},pending:null};this.state.catalog=catalogIdentityMetadata(catalog,this.state.catalog??[]);if(!fs.existsSync(this.file))for(const t of this.state.targets)for(const url of t.urls??[])if(t.authorities?.some(a=>a.hostname===new URL(url).hostname))this.add(t,{url,title:t.serviceName+' official provider',rank:0,from:{method:'REVIEWED_PROVIDER_DESTINATION'}});if(targets.length>this.bounds.services)throw Error('SERVICE_BOUND');this.save();}
 save(){fs.writeFileSync(this.file+'.pending',JSON.stringify(this.state,null,2)+'\n');fs.renameSync(this.file+'.pending',this.file);}
 event(type,data){const fd=fs.openSync(this.directory+'/journal.jsonl','a');try{fs.writeSync(fd,JSON.stringify({type,timestamp:new Date().toISOString(),...data})+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
 target(id){return this.state.targets.find(t=>t.id===id);}
 add(t,lead){const url=safe(lead.url);const scope=url?new URL(url).pathname.match(/(?:\/countries\/|^\/)([a-z]{2})(?:\/app\/|\/$)/i):null;const localeScope=url?new URL(url).pathname.match(/^\/[a-z]{2}-([a-z]{2})\//i):null;if(scope&&scope[1].toUpperCase()!==t.market||localeScope&&localeScope[1].toUpperCase()!==t.market)return;if(!url||t.leads.some(l=>l.url===url)||t.leads.length>=this.bounds.leadsPerService)return; t.leads.push({...lead,url,evidenceStatus:'DISCOVERY_LEAD_ONLY',authoritative:false});}
 next(){if(this.state.pending)return this.state.pending;const s=this.state;
 // Reviewed destinations precede discovery. Response caches are service-scoped; direct responses carry no geo proof.
 // Stable ties retain the persisted service-frontier order, including after resume.
 for(const t of [...s.targets].sort((a,b)=>a.queries.length-b.queries.length||a.reads.length-b.reads.length)){if(!t.gaps.length||t.verified.length||t.done)continue;const b=[1,2].includes(t.smartResearch?.version)?{...this.bounds,perServiceReads:Math.min(4,this.bounds.perServiceReads),perServiceSearches:Math.min(2,this.bounds.perServiceSearches)}:this.bounds;
 rankPlannerLeads(t);
 if([1,2].includes(t.smartResearch?.version)){const plan=planResearch(t,{executionContext:{bounds:b,usage:s.usage},discoveryAllowed:destinationDiscoveryNeeded(t,b,s.usage),retained:t.retainedPriceReview,diagnosis:t.researchDiagnosis,history:[...t.reads.map(r=>({route:'DIRECT',url:r.requestedUrl,completed:true,failure:r.failure?.code})),...t.queries.map(q=>({route:'DISCOVERY',completed:true}))],unreadUrls:(t.smartResearch?.version===2?t.leads:t.leads.filter(l=>!t.reads.some(r=>resourceKey(r.requestedUrl)===resourceKey(l.url)))).map(l=>l.url),configurationDemonstrated:t.demonstratedConfigurator===true,renderingDemonstrated:t.demonstratedRendering===true});t.researchPlan=plan;if(['RETAINED_SUFFICIENT','PARK_CONFIGURATOR','PARK_RENDERING','STOP','STRUCTURED_REINTERPRETATION',...(t.smartResearch?.version===2?['CONDITIONAL_DECODO']:[])].includes(plan.route)){t.done=plan.reason;this.event('RESEARCH_PLANNER_STOP',{target:t.id,plan});continue;}}
 const priority=l=>destinationPriority(t,l)*100+score(l)-(new RegExp('(?:[/_-])'+t.market+'(?:[/_.-]|$)','i').test(new URL(l.url).pathname)?3:0)-(t.authorities?.some(d=>d.hostname===new URL(l.url).hostname)?3:0);
 const lead=t.leads.filter(l=>(t.smartResearch?.version!==2||t.researchPlan?.route==='DIRECT'&&navigationKey(l.url)===t.researchPlan.url)&&executableAction(t,{route:'DIRECT',url:l.url},{bounds:b,usage:s.usage}).executable&&!t.reads.some(r=>(resourceKey(r.requestedUrl)===resourceKey(l.url)||resourceKey(r.url??r.requestedUrl)===resourceKey(l.url)))&&!t.blockedOrigins.includes(new URL(l.url).origin)&&!t.reads.some(r=>r.outcome==='ACCESS_CONTROL_STOP'&&new URL(r.requestedUrl).pathname===new URL(l.url).pathname)).sort((a,b)=>priority(a)-priority(b)||a.rank-b.rank)[0];
 let action;
 if(t.researchPlan?.route==='REUSE_RETAINED')action={type:'REUSE',target:t.id,url:t.researchPlan.url,retainedKey:t.researchPlan.retainedKey};
 else if(lead&&t.reads.length<b.perServiceReads&&s.usage.reads<b.reads)action={type:'READ',target:t.id,url:lead.url,lead};
 else if((t.smartResearch?.version===2?t.researchPlan?.discoveryRequired:destinationDiscoveryNeeded(t,b,s.usage))&&!t.lastSearchFailure&&t.queries.length<b.perServiceSearches&&s.usage.searches<b.searches){const clue=t.leads.filter(l=>relevant(t,l)).sort((a,b)=>priority(a)-priority(b)||a.rank-b.rank).map(l=>new URL(l.url).hostname.replace(/^www\./,'')).find(h=>!t.queries.some(q=>q.query.includes(h)));const query=t.smartResearch?.version===2?t.researchPlan.query:t.smartResearch?.version===1?contextualQuery(t,t.queries.length):t.queries.length===0?`${t.serviceName} ${t.countryName??t.market} subscription pricing`:clue?`${t.serviceName} ${t.countryName??t.market} ${clue} ${t.gaps.includes('currency')?'currency price':'subscription monthly'}`:`${t.serviceName} ${t.countryName??t.market} official subscription billing ${t.gaps.join(' ')}`;if(t.queries.some(q=>q.query===query)){t.done='NO_NEW_CONCRETE_QUERY';continue;}action={type:'SEARCH',target:t.id,query,question:t.gaps};}
 else {t.done=t.lastSearchFailure??(!destinationDiscoveryNeeded(t,b,s.usage)?'KNOWN_DESTINATION_OR_ACQUISITION_BOUND':'BOUNDS_EXHAUSTED');t.comprehensive=false;t.remainingDiscoveryLeads=t.leads.filter(l=>!reviewedDestination(t,l.url)).map(l=>l.url);t.remainingAuthorizedLeads=t.leads.filter(l=>(!t.authorities?.length||reviewedDestination(t,l.url))&&!t.reads.some(r=>r.requestedUrl===l.url)&&!t.blockedOrigins.includes(new URL(l.url).origin)).map(l=>l.url);t.completionMeaning='SCHEDULER_TERMINAL_NOT_COMPREHENSIVE_RESEARCH';if([1,2].includes(t.smartResearch?.version))t.researchDiagnosis=diagnoseResearch({authority:!!t.authorities?.length,target:!!t.urls?.length,discoveryExhausted:t.queries.length>=b.perServiceSearches,navigationExhausted:true,failure:t.lastSearchFailure??null});continue;}
 action.id=sha(JSON.stringify(action));s.pending=action;if(action.type==='SEARCH')s.usage.searches++;else if(action.type==='READ'&&!s.cache[cacheKey(t,action.url)])s.usage.reads++;this.event('ACTION_RESERVED',action);this.save();return action;
 }this.save();return {type:'COMPLETE'};}
 accept(id,response){const a=this.state.pending;if(!a||a.id!==id)throw Error('ACTION_ID_MISMATCH');const t=this.target(a.target);
 if(a.type==='SEARCH'){const results=(response.results??[]).slice(0,12);t.queries.push({query:a.query,question:a.question,id:a.id,transport:response.transport,failure:response.failure??null,results:results.length});if(response.failure)t.lastSearchFailure=response.failure.code;for(const [rank,l]of results.entries())if(relevant(t,l))this.add(t,{url:l.url,title:String(l.title??'').slice(0,300),rank,from:{queryId:a.id},snippetExcludedFromEvidence:true});}
 else {const body=response.rawSource?.text??response.raw?.body??response.raw?.text??response.raw??response.body;const r={...response,requestedUrl:a.url};if(typeof body==='string'&&Buffer.byteLength(body)<=this.bounds.bytesPerPage){r.bodyHash=sha(body);fs.mkdirSync(this.directory+'/bodies',{recursive:true});r.bodyFile='bodies/'+r.bodyHash+'.txt';fs.writeFileSync(this.directory+'/'+r.bodyFile,body);delete r.body;delete r.raw;delete r.rawSource;const nav=response.outcome&&response.outcome!=='OK'?{links:[]}:providerNavigation(t,body,r.url??a.url,{maxBytes:this.bounds.bytesPerPage,depth:a.lead?.navigationDepth??0});r.navigation={considered:nav.considered??0,stops:nav.stops??[],selected:nav.links.map(l=>l.url),...(nav.priceEntryCandidates?{priceEntryCandidates:nav.priceEntryCandidates}:{}),...(nav.loginEntryCandidates?{loginEntryCandidates:nav.loginEntryCandidates}:{})};for(const l of nav.links)this.add(t,{url:l.url,title:l.label,...(l.priceEntryIntent?{priceEntryIntent:true,score:l.score}:{}),...(l.accessibleName?{accessibleName:l.accessibleName,context:l.context}:{}),rank:0,navigationDepth:l.depth,locale:l.locale,from:{url:r.url??a.url,bodyHash:r.bodyHash,locator:l.reference,mechanism:l.mechanism},navigationOnly:true});// Preserve legacy discovery-only traversal when no reviewed authority is configured.
if(!t.authorities?.length&&(!response.outcome||response.outcome==='OK'))for(const l of sourceLinks(body,{maxBytes:this.bounds.bytesPerPage,maxLinks:this.bounds.linksPerPage}).links){if(l.mechanism==='PROVIDER_CANONICAL_OR_LOCALE')continue;let u;try{u=new URL(l.url,a.url).href;}catch{continue;}if(/pricing|plans|subscribe|subscription|abonnement|activation|watchon|purchase|billing|partner|precio|planes|이용권|결제/i.test(l.label+' '+u)&&relevant(t,{title:l.label,url:u})||new URL(u).origin!==new URL(a.url).origin&&relevant(t,{title:l.label,url:u}))this.add(t,{url:u,title:l.label,rank:0,from:{url:a.url,bodyHash:r.bodyHash,locator:l.reference}});}
r.catalogServiceLeads=(this.state.catalog??this.state.targets).filter(x=>x.service!==t.service&&body.toLowerCase().includes(x.serviceName.toLowerCase())).map(x=>({service:x.service,requestedMarket:t.market,marketEstablished:false,url:a.url,bodyHash:r.bodyHash,evidenceStatus:'DISCOVERY_LEAD_ONLY'}));}
 if(['BLOCKED','ACCESS_CONTROL_STOP'].includes(response.outcome)||response.failure?.code==='ROBOTS_ACCESS_STOP')t.blockedOrigins.push(new URL(a.url).origin);t.reads.push(r);this.state.cache[cacheKey(t,a.url)]=r;if(safe(r.url))this.state.cache[cacheKey(t,r.url)]=r;}
 this.event('ACTION_RESULT',{action:a,response:a.type==='READ'?t.reads.at(-1):response});this.state.pending=null;this.save();}
 recordAuthority(target,url,decision){const t=this.target(target);t.decisions.push({url,...decision});this.event('AUTHORITY_REVIEW',{target,url,decision});this.save();}
}
// Existing runner can supply an approved search bridge. No Bing RSS fallback.
export async function runOpenWebResearch({directory,targets,search,read,classify,acquire,consumeProvider,bounds,catalog,maxActions=Infinity,onSourceObservation}){
 if(!(maxActions===Infinity||Number.isInteger(maxActions)&&maxActions>0))throw Error('INVALID_ACTION_STEP_BOUND');
 if(typeof search!=='function'||typeof read!=='function')throw Error('OPEN_WEB_TRANSPORT_REQUIRED');const session=new OpenWebResearch(directory,targets,bounds,catalog);
 let executed=0;for(let a=session.next();a.type!=='COMPLETE';a=session.next()){
 if(a.dispatched)throw Error('INTERRUPTED_ACTION_REQUIRES_RECONCILIATION');session.state.pending.dispatched=true;session.save();session.event('ACTION_DISPATCHED',{id:a.id});
 const t=session.target(a.target),cached=a.type==='READ'?session.state.cache[cacheKey(t,a.url)]:null;
 if(a.type==='REUSE'){const reused=consumeRetainedSuccess(t,a.retainedKey);t.retainedReviews??=[];t.retainedReviews.push(reused);if(reused.retainedPriceReview)t.retainedPriceReview=reused.retainedPriceReview;t.providerInterpretations??=[];t.providerInterpretations.push({url:reused.url,blockers:reused.blockers,classification:'RETAINED_INTERPRETATION_REUSED'});session.state.pending=null;session.event('RETAINED_RESULT',{target:t.id,reused});session.save();if(++executed>=maxActions)return session.state;continue;}

 const result=cached??await (a.type==='SEARCH'?search({...a,target:t}):read({...a,target:t}));session.accept(a.id,result);
 if(a.type==='READ'&&classify){const page=t.reads.at(-1),authority=(page.outcome==='OK'||providerAccessGap(page))?await classify({target:t,page,directory}):{eligible:false,reason:page.failure?.code??'PAGE_NOT_ACQUIRED'};session.recordAuthority(t.id,a.url,authority);
 let direct=null;
 if(authority.eligible===true&&t.researchObjective==='CATALOG_ONLY'&&page.outcome==='OK'&&page.bodyFile){const body=fs.readFileSync(directory+'/'+page.bodyFile,'utf8');const proof=inspectLoginManage({body,sourceHash:page.bodyHash,url:page.url??a.url,service:t.service,provider:t.serviceName,market:t.market,authorityEstablished:true,reference:{path:directory+'/'+page.bodyFile,hash:page.bodyHash}});mergeTargetCapabilities(t,proof);t.researchDiagnosis=t.loginManageEstablished?'LOGIN_MANAGE_ESTABLISHED':t.gaps.join('_AND_')+'_UNRESOLVED';session.event('CATALOG_CAPABILITY_INTERPRETATION',{target:t.id,proof,status:t.catalogEligibility.status});session.save();onSourceObservation?.({target:t,url:a.url,page,proof,directory});}
 if(authority.eligible===true&&consumeProvider&&t.researchObjective!=='CATALOG_ONLY'){t.decisions.at(-1).directInterpretationReserved=true;session.save();direct=await consumeProvider({target:t,candidate:{url:a.url,authority},page,directory});session.event('PROVIDER_INTERPRETATION',{target:t.id,url:a.url,outcome:direct});t.verified.push(...(direct.verified??[]));if(direct.quarantinedVerified)t.quarantinedVerified=[...new Map([...(t.quarantinedVerified??[]),...direct.quarantinedVerified].map(q=>[JSON.stringify(q),q])).values()];mergePriceEvidenceNeeds(t,direct.priceEvidenceNeeds);t.providerInterpretations??=[];t.providerInterpretations.push({url:a.url,classification:direct.classification,blockers:direct.blockers??[],needsGeo:direct.needsGeo??false,runDirectory:direct.runDirectory??null});if([1,2].includes(t.smartResearch?.version)){t.researchDiagnosis=diagnoseResearch({authority:true,target:true,priceCount:direct.monetary??0,blockers:direct.blockers??[],failure:page.failure?.code??null,configurator:direct.configuratorRequired===true,rendering:direct.renderingRequired===true});t.demonstratedConfigurator=direct.configuratorRequired===true;t.demonstratedRendering=direct.renderingRequired===true;
 const retained=retainedPriceReview(direct.runDirectory,t);if(retained)t.retainedPriceReview=retained;
 }session.save();}
 const escalation=acquisitionEscalation({page,targetMarket:t.market});t.decisions.at(-1).acquisitionEscalation=escalation;session.event('ACQUISITION_ESCALATION_REVIEW',{target:t.id,url:a.url,decision:escalation});session.save();if(direct&&escalation.eligible)direct.acquisitionEscalation=escalation;
 if(authority.eligible===true&&escalation.eligible&&(!consumeProvider||direct?.needsGeo)&&!(t.smartResearch?.version===2&&currentRetainedPriceReview(t)?.sourceBound)&&acquire&&session.state.usage.acquisitions<session.bounds.acquisitions&&t.decisions.filter(d=>d.acquisitionReserved).length<session.bounds.perServiceAcquisitions){session.state.usage.acquisitions++;t.decisions.at(-1).acquisitionReserved=true;session.save();const outcome=await acquire({target:t,candidate:{url:a.url,authority},page,directory,direct});session.event('AUTHORITATIVE_RESULT',{target:t.id,url:a.url,outcome});t.verified.push(...(outcome.verified??[]));if(outcome.quarantinedVerified)t.quarantinedVerified=[...new Map([...(t.quarantinedVerified??[]),...outcome.quarantinedVerified].map(q=>[JSON.stringify(q),q])).values()];mergePriceEvidenceNeeds(t,outcome.priceEvidenceNeeds);if(outcome.gaps)t.gaps=outcome.gaps;if(outcome.hardStop&&!t.blockedOrigins.includes(new URL(a.url).origin))t.blockedOrigins.push(new URL(a.url).origin);t.acquisitionOutcomes??=[];t.acquisitionOutcomes.push({url:a.url,classification:outcome.classification,channel:outcome.channel??'GEO_PROVIDER',blockers:outcome.blockers??[],followUp:outcome.followUp??null});session.save();}}
 if(++executed>=maxActions)return session.state;
 }return session.state;
}
