import {pendingMarketProof,marketProofContradicted} from '../live/market-proof-continuation.mjs';
import {currentRetainedPriceReview} from '../live/retained-pricing.mjs';
import {readPriceEvidenceNeeds} from '../intelligence/price-evidence-needs.mjs';
import {usableResearchMemory} from '../live/research-memory.mjs';
import {managementInformation,missingCatalogFields} from '../intelligence/management-targeting.mjs';
import {mergeTargetCapabilities} from '../intelligence/login-manage.mjs';
// Resumable action-at-a-time orchestration of the existing provider controller.
// No provider-specific paths, transport, price interpretation, or admission here.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {atomic,recoverInterrupted} from './expansion-campaign.mjs';
import {runOpenWebResearch,destinationDiscoveryNeeded,rankPlannerLeads} from '../live/open-web-discovery.mjs';
import {planResearch} from '../live/research-planner.mjs';
import {executableAction,executionBounds,resourceKey,exhaustedExecutionBudget} from '../live/execution-capabilities.mjs';
import {navigationRank} from '../live/provider-navigation.mjs';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export const adaptiveBounds=Object.freeze({reads:4,searches:2,acquisitions:2,retainedReviews:32,turns:512});
const counts=t=>({reads:t.reads?.length??0,searches:t.queries?.length??0,acquisitions:t.decisions?.filter(d=>d.acquisitionReserved).length??0,retainedReviews:t.retainedReviews?.length??0});
const initialTarget=t=>({...t,adaptiveExecution:true,researchObjective:t.researchObjective??'SERVICE_COVERAGE',gaps:t.gaps??['plan','amount','currency','cadence','priceRole','ownership','market'],reads:t.reads??[],queries:t.queries??[],decisions:t.decisions??[],verified:t.verified??[],blockedOrigins:t.blockedOrigins??[],leads:t.leads?.length?t.leads:(t.urls??[]).map(url=>({url,title:t.serviceName+' official provider',rank:0,navigationPriority:navigationRank(t,{url})}))});
export function initializeAdaptiveState(manifest,{retainedStates=[],limits={}}={}){
 const bounds={...adaptiveBounds,...limits};for(const [k,v]of Object.entries(bounds))if(!(k in adaptiveBounds)||!Number.isInteger(v)||v<0||v>adaptiveBounds[k])throw Error('INVALID_ADAPTIVE_BOUND');
 const all=[...manifest.targets,...manifest.conditionalFollowupTargets],ids=all.map(t=>t.id);if(new Set(ids).size!==ids.length)throw Error('DUPLICATE_ADAPTIVE_TARGET');const services=[...new Set(manifest.targets.map(t=>t.service))];if(all.some(t=>!services.includes(t.service)))throw Error('CONDITIONAL_SERVICE_WITHOUT_INITIAL');
 const targets=Object.fromEntries(all.map(t=>{const previous=retainedStates.find(r=>r.id===t.id);return [t.id,initialTarget(structuredClone({...t,...previous,historicalSchedulerTerminal:previous?.done??null,done:undefined}))];}));
 return {version:1,fingerprint:hash({manifest,limits,retainedStates}),bounds,serviceOrder:services,cursor:0,turn:0,targets,initialIds:manifest.targets.map(t=>t.id),conditionalIds:manifest.conditionalFollowupTargets.map(t=>t.id),services:Object.fromEntries(services.map(service=>[service,{used:Object.values(targets).filter(t=>t.service===service).reduce((a,t)=>{for(const [k,v]of Object.entries(counts(t)))a[k]+=v;return a;},{reads:0,searches:0,acquisitions:0,retainedReviews:0}),stop:null,pending:null}])),decisions:{},decisionHistory:[],pending:null,complete:false};
}
export function targetExecutionContext(state,t){
 const service=state.services[t.service],own=counts(t),b=state.bounds,ts=Object.values(state.targets).filter(x=>x.service===t.service),seen=new Set(ts.flatMap(x=>[...(x.reads??[]).map(r=>resourceKey(r.requestedUrl)),...usableResearchMemory(x).attempts.filter(a=>a.route==='DIRECT'&&a.url).map(a=>resourceKey(a.url))]));
 const positiveManagement=ts.some(x=>missingCatalogFields(x).join('|')==='WEB_MANAGEMENT'&&(x.leads??[]).some(l=>!seen.has(resourceKey(l.url))&&managementInformation(x,l.url,l.label??l.title??'').strongManagement));
 // Reallocate one UNUSED discovery slot (ordinal cost 3) to one management read (cost 1).
 // No request is refunded; actual reads/searches remain persisted and the hard four-read cap stays.
 const borrow=t.researchObjective==='CATALOG_ONLY'&&service.used.reads>=b.reads&&b.reads<adaptiveBounds.reads&&b.searches>service.used.searches&&(service.used.reads>b.reads||positiveManagement)?1:0;
 return {bounds:{...executionBounds,managementReserveOnly:borrow,perServiceReads:Math.max(0,b.reads+borrow-(service.used.reads-own.reads)),perServiceSearches:Math.max(0,b.searches-borrow-(service.used.searches-own.searches)),perServiceAcquisitions:Math.max(0,b.acquisitions-(service.used.acquisitions-own.acquisitions))},usage:{reads:own.reads,searches:own.searches,acquisitions:own.acquisitions},catalogBudgetAllocation:borrow?{reason:'UNUSED_DISCOVERY_TO_MISSING_MANAGEMENT',surrenderedSearches:1,managementReads:1,originalReads:b.reads,originalSearches:b.searches,actualServiceUsage:service.used}:null};
}

function sufficient(state,service){const catalogTargets=Object.values(state.targets).filter(t=>t.service===service&&t.researchObjective==='CATALOG_ONLY');if(catalogTargets.length){const proofs=catalogTargets.flatMap(t=>t.catalogCapabilityProofs??[]);for(const t of catalogTargets){for(const p of proofs)mergeTargetCapabilities(t,p);}return catalogTargets.some(t=>t.loginManageEstablished)?'LOGIN_MANAGE_ESTABLISHED':null;}const ts=Object.values(state.targets).filter(t=>t.service===service),r=ts.find(t=>(!pendingMarketProof(t).length||currentRetainedPriceReview(t)?.market===t.market)&&!marketProofContradicted(t)&&currentRetainedPriceReview(t)?.sourceBound&&['HIGH','MEDIUM'].includes(t.retainedPriceReview.confidence));return r?r.priceStrategy==='USER_PRICE_PREFERRED'?'USER_PRICE_PREFERRED_SUFFICIENT':currentRetainedPriceReview(r).confidence==='HIGH'?'HIGH_SUFFICIENT':'MEDIUM_SUFFICIENT':null;}
function actionKey(service,p){return JSON.stringify([service,p.route,['DIRECT','DECODO'].includes(p.route)?resourceKey(p.url):p.url??p.query,p.retainedKey]);}
export function assessAdaptiveService(state,service){
 const s=state.services[service],ts=Object.values(state.targets).filter(t=>t.service===service),enough=sufficient(state,service),signature=hash(ts.map(t=>[t.id,counts(t),t.retainedPriceReview,t.researchDiagnosis,t.blockedOrigins,t.catalogEligibility,readPriceEvidenceNeeds(t)?.evidenceDigest??null])),rows=[];
 const attempted=new Set(ts.flatMap(t=>[...(t.reads??[]).map(r=>resourceKey(r.requestedUrl)),...(t.decisions??[]).filter(d=>d.acquisitionReserved).map(d=>resourceKey(d.url))]));
 for(const t of ts){rankPlannerLeads(t);const context=targetExecutionContext(state,t),p=planResearch(t,{executionContext:context,unreadUrls:t.leads.map(l=>l.url),discoveryAllowed:destinationDiscoveryNeeded(t,context.bounds,context.usage)}),cap=executableAction(t,p,context);let decision='DEFER',reason=p.reason,value=0;
 if(enough){decision='REJECT';reason=enough;}
 else if(s.reconciliation){reason=s.reconciliation;}
 else if(t.executionBlocked){reason=t.executionBlocked;}
 // Retained review blocks reuse, not independently admitted fresh research.
 else if(t.retainedFailure?.reason==='RETAINED_INTERPRETATION_REVIEW_REQUIRED'&&!(cap.executable&&['DIRECT','DECODO','DISCOVERY',...(t.researchObjective==='CATALOG_ONLY'?['AUTHORITY_DISCOVERY']:[])].includes(p.route))){reason=t.retainedFailure.reason;}
 else if(t.researchObjective!=='CATALOG_ONLY'&&t.priceStrategy==='MANUAL_ONLY'&&t.manualOnlyDecision?.established&&t.manualOnlyDecision.reference){decision='REJECT';reason='MANUAL_ONLY_APPROPRIATE';}
 else if(t.researchObjective==='CATALOG_ONLY'&&t.loginManageEstablished){decision='REJECT';reason='CATALOG_OBJECTIVE_ALREADY_SATISFIED';}
 else if(t.demonstratedConfigurator||t.demonstratedRendering){reason=t.demonstratedConfigurator?'CONFIGURATOR_REQUIRED':'RENDERING_REQUIRED';}
 else if(p.route==='REUSE_RETAINED'&&s.used.retainedReviews<state.bounds.retainedReviews){decision='ACTIVATE';value=100;}
 else if(['DIRECT','DECODO'].includes(p.route)&&attempted.has(resourceKey(p.url))&&!(t.reads??[]).some(r=>resourceKey(r.requestedUrl)===resourceKey(p.url))){decision='REJECT';reason=p.route==='DECODO'?'EQUIVALENT_PROVIDER_REQUEST_ALREADY_ATTEMPTED':'EQUIVALENT_DIRECT_REQUEST_ALREADY_ATTEMPTED';}
 else if(cap.executable&&['DIRECT','DECODO','DISCOVERY',...(t.researchObjective==='CATALOG_ONLY'?['AUTHORITY_DISCOVERY']:[])].includes(p.route)){value=['DIRECT','DECODO'].includes(p.route)?(p.candidates?.[0]?.value??0):1;decision=value>0?'ACTIVATE':'REJECT';reason=value>0?p.reason:'NO_POSITIVE_INFORMATION_VALUE';}
 else if(p.route==='CONDITIONAL_DECODO'){reason='FRESH_ACCESS_REVIEW_REQUIRED';}
 else if(['RESEARCH_MEMORY_RECONCILIATION_REQUIRED','AUTHORITY_UNRESOLVED','CONFIGURATOR_REQUIRED','RENDERING_REQUIRED','PROVIDER_ACCESS_POLICY_STOP','RETAINED_STRUCTURE_REQUIRES_REVIEW'].includes(p.reason)){reason=p.reason;}
 else if(exhaustedExecutionBudget(cap)||exhaustedExecutionBudget({executable:false,reason:p.reason})||p.reason==='KNOWN_DESTINATION_NEEDS_EVIDENCE_NOT_SEARCH'&&p.budgetBlocked?.length>0){reason='BUDGET_EXHAUSTED';}
 else {decision='REJECT';reason=p.reason??'NO_POSITIVE_VALUE_FOLLOWUP';}
 const row={targetId:t.id,service,market:t.market,provider:t.serviceName,originatingState:signature,trigger:t.researchDiagnosis??t.previousFailureReason??'INITIAL_RESEARCH',unresolvedFields:p.knowledge?.unresolvedFields??[],expectedInformationValue:value,expectedCost:p.route==='REUSE_RETAINED'?0:p.route==='DIRECT'?1:['DISCOVERY','AUTHORITY_DISCOVERY'].includes(p.route)?3:5,capability:cap,budgetAllocation:context.catalogBudgetAllocation,historyCount:p.attemptsConsidered??0,decision,reason,plan:{...p,runnable:decision==='ACTIVATE'&&cap.executable},actionIdentity:actionKey(service,p),initial:state.initialIds.includes(t.id)};rows.push(row);
 }
 const positive=rows.filter(r=>r.decision==='ACTIVATE').sort((a,b)=>b.expectedInformationValue-a.expectedInformationValue||Number(b.initial)-Number(a.initial)||(state.targets[a.targetId].priority??0)-(state.targets[b.targetId].priority??0)||a.targetId.localeCompare(b.targetId));const best=positive[0];
 for(const r of positive.slice(1)){r.decision=r.actionIdentity===best.actionIdentity?'SUPERSEDED':'DEFER';r.reason=r.decision==='SUPERSEDED'?'EQUIVALENT_TO_SELECTED_ACTION':'BETTER_ACTION_SELECTED_REASSESS_AFTER_RESULT';r.supersededBy=best.targetId;r.plan.runnable=false;}
 let stop=null;if(!best){const deferred=rows.filter(r=>r.decision==='DEFER'),budget=deferred.some(r=>r.reason==='BUDGET_EXHAUSTED');stop={kind:budget?'BUDGET_LIMITED':deferred.length?'BLOCKED':'RESEARCH_OPTIMAL_STOP',reason:enough??(budget?'BUDGET_EXHAUSTED':deferred[0]?.reason??rows[0]?.reason??'NO_POSITIVE_VALUE_FOLLOWUP'),scope:'KNOWN_REVIEWED_ACTION_SPACE_ONLY',assessedTargets:rows.length,state:signature};}
 return {service,state:signature,rows,next:best??null,stop};
}
function recordAssessment(state,a){for(const row of a.rows){const old=state.decisions[row.targetId];if(!old||hash(old)!==hash(row))state.decisionHistory.push({...row,turn:state.turn});state.decisions[row.targetId]=row;}state.services[a.service].stop=a.stop;}
function nativeFile(directory,id){return path.join(directory,'targets',id,'open-web-discovery','state.json');}
function commitNative(state,directory){const p=state.pending,file=nativeFile(directory,p.targetId);if(!fs.existsSync(file))return false;const native=JSON.parse(fs.readFileSync(file)),t=native.targets[0];if(native.pending?.dispatched)throw Error('ADAPTIVE_INTERRUPTED_ACTION_RECONCILIATION_REQUIRED');const after=counts(t);if(Object.keys(after).every(k=>after[k]===p.before[k]))return false;for(const [k,n]of Object.entries(after))state.services[t.service].used[k]+=n-p.before[k];state.targets[t.id]=t;state.pending=null;state.turn++;return true;}
export async function runAdaptiveCampaign({directory,manifest,retainedStates=[],limits={},createAdapters,stopBeforeNetwork=false,onTransition=()=>{},maxActions=Infinity,isolateFailures=false,evidenceUpdates=[]}){
 if(!(maxActions===Infinity||Number.isInteger(maxActions)&&maxActions>0))throw Error('INVALID_ADAPTIVE_ACTION_LIMIT');let executed=0;
 fs.mkdirSync(directory,{recursive:true});const file=directory+'/adaptive-state.json',lock=directory+'/adaptive.lock';if(fs.existsSync(lock)){const pid=Number(fs.readFileSync(lock));try{process.kill(pid,0);throw Error('ADAPTIVE_ALREADY_RUNNING');}catch(e){if(e.code!=='ESRCH')throw e;}fs.unlinkSync(lock);}fs.writeFileSync(lock,String(process.pid),{flag:'wx'});
 try{const fresh=initializeAdaptiveState(manifest,{retainedStates,limits}),state=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):fresh;if(state.fingerprint!==fresh.fingerprint)throw Error('ADAPTIVE_INPUT_CHANGED');atomic(file,state);
 if(state.pending){const pendingId=state.pending.targetId,native=nativeFile(directory,pendingId);if(fs.existsSync(native)){const interrupted=recoverInterrupted(path.dirname(native));if(interrupted.length)state.services[state.targets[pendingId].service].reconciliation='INTERRUPTED_ACTION_RECONCILIATION_REQUIRED';}if(!commitNative(state,directory)){const f=nativeFile(directory,state.pending.targetId);if(fs.existsSync(f)&&JSON.parse(fs.readFileSync(f)).pending)throw Error('ADAPTIVE_PENDING_ACTION_REQUIRES_RECONCILIATION');state.pending=null;}atomic(file,state);}
 // Cross-phase evidence is produced by the existing source-bound verifier.
 // Inject it without resetting action usage, journals or the manifest fingerprint.
 for(const update of evidenceUpdates){const t=state.targets[update.targetId];if(!t)throw Error('ADAPTIVE_EVIDENCE_TARGET');const key=hash(update);state.evidenceUpdates??=[];if(state.evidenceUpdates.includes(key))continue;
  const before=hash([t.catalogCapabilityProofs,t.leads]);for(const proof of update.proofs??[])mergeTargetCapabilities(t,proof);
  t.leads=[...new Map([...(t.leads??[]),...(update.leads??[])].map(l=>[l.url,l])).values()];state.evidenceUpdates.push(key);
  if(before!==hash([t.catalogCapabilityProofs,t.leads])){state.services[t.service].stop=null;state.services[t.service].pending=null;state.complete=false;}
 }atomic(file,state);
 if(state.complete){if(!stopBeforeNetwork&&state.completionMeaning==='OFFLINE_ASSESSED_WITH_EXPLICIT_LIVE_PENDING_ACTIONS'){for(const s of Object.values(state.services))s.pending=null;state.complete=false;}else return state;}
 const planned=new Set();let idle=0;
 while(executed<maxActions&&state.turn<state.bounds.turns&&idle<state.serviceOrder.length){const service=state.serviceOrder[state.cursor%state.serviceOrder.length];state.cursor=(state.cursor+1)%state.serviceOrder.length;const a=assessAdaptiveService(state,service);recordAssessment(state,a);if(!a.next||planned.has(service)){idle++;atomic(file,state);continue;}idle=0;
 const t=state.targets[a.next.targetId],context=targetExecutionContext(state,t);if(!executableAction(t,a.next.plan,context).executable)throw Error('ADAPTIVE_PLANNER_CONTROLLER_CONFLICT');
 if(stopBeforeNetwork&&a.next.plan.route!=='REUSE_RETAINED'){state.services[service].pending={...a.next,decision:'WOULD_EXECUTE_LIVE'};state.decisions[t.id]={...a.next,decision:'WOULD_EXECUTE_LIVE'};planned.add(service);atomic(file,state);continue;}
 const native=nativeFile(directory,t.id);fs.mkdirSync(path.dirname(native),{recursive:true});const old=fs.existsSync(native)?JSON.parse(fs.readFileSync(native)):null;
 if(old?.pending)throw Error('ADAPTIVE_NATIVE_PENDING_RECONCILIATION_REQUIRED');const own=counts(t);atomic(native,{version:1,catalog:Object.values(state.targets).map(t=>({service:t.service,serviceName:t.serviceName})),targets:[{...t,done:undefined}],usage:{reads:own.reads,searches:own.searches,acquisitions:own.acquisitions},cache:old?.cache??{},pending:null});
 state.pending={targetId:t.id,actionIdentity:a.next.actionIdentity,before:own,state:a.state};atomic(file,state);onTransition('RESERVED',state);
 const adapters=a.next.plan.route==='REUSE_RETAINED'?{read:async()=>{throw Error('REUSE_CANNOT_ACQUIRE');},search:async()=>{throw Error('REUSE_CANNOT_SEARCH');}}:await createAdapters({directory:path.dirname(path.dirname(native)),targets:[t],bounds:context.bounds});
 try{await runOpenWebResearch({...adapters,directory:path.dirname(native),targets:[t],catalog:Object.values(state.targets),bounds:context.bounds,maxActions:1});}
 catch(error){if(!isolateFailures)throw error;const budget=error.message==='HANDOFF_REQUEST_BOUND',reason=budget?'BUDGET_EXHAUSTED':/^(?:ADAPTIVE_|DIRECT_PROVIDER_)/.test(error.message)?error.message:'ADAPTIVE_ACTION_FAILED_REVIEW_REQUIRED';state.services[service].reconciliation=reason;state.services[service].failedAction={targetId:t.id,native,reason,requiresReview:!budget};state.pending=null;state.turn++;planned.add(service);atomic(file,state);onTransition(budget?'SERVICE_BUDGET_STOP':'SERVICE_REVIEW_REQUIRED',state);executed++;continue;}
 onTransition('NATIVE_RESULT_PERSISTED',state);if(!commitNative(state,directory)){state.pending=null;state.targets[t.id].executionBlocked='NO_EXECUTABLE_PROGRESS_RECONCILE';state.services[service].stop={kind:'BLOCKED',reason:'NO_EXECUTABLE_PROGRESS_RECONCILE'};planned.add(service);}atomic(file,state);onTransition('COMMITTED',state);executed++;
 }
 for(const service of state.serviceOrder){const a=assessAdaptiveService(state,service);recordAssessment(state,a);if(state.services[service].pending){state.decisions[state.services[service].pending.targetId].decision='WOULD_EXECUTE_LIVE';}else if(!a.stop&&state.turn>=state.bounds.turns)state.services[service].stop={kind:'BUDGET_LIMITED',reason:'CAMPAIGN_TURN_LIMIT'};}
 state.complete=state.serviceOrder.every(s=>state.services[s].stop||state.services[s].pending);state.completionMeaning=stopBeforeNetwork?'OFFLINE_ASSESSED_WITH_EXPLICIT_LIVE_PENDING_ACTIONS':'ALL_SERVICES_HAVE_EXPLICIT_STOP_OR_BLOCK';atomic(file,state);return state;
 }finally{fs.unlinkSync(lock);}
}
