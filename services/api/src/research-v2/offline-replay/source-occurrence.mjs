import './offline-guard.mjs';
import {isDeepStrictEqual} from 'node:util';
import {digest} from '../../research-v1/market-run-store.mjs';
import {priceScopeKey} from '../../research-v1/price-scope.mjs';

export const sourceMappingVersion='RESEARCH_V2_SOURCE_OCCURRENCE_V1';
// Frozen identity-only projection of verify-service-orchestrator evaluate/read.
// Do not import or execute that controller's research/semantic capability graph.
export const retainedPageKey=p=>JSON.stringify([p.url,p.locale,...(p.priceAcquisition?[priceScopeKey(p.priceAcquisition.scope)]:[]),...(p.acquisitionPolicy?[p.acquisitionPolicy]:[])]);
export function retainedReadSelection(pages,request){
 const unique=new Map();pages.forEach((page,index)=>unique.set(retainedPageKey(page),{page,index}));
 const entries=[...unique.values()];
 const plan=entries.map(({page:p})=>({stage:p.priceAcquisition?.stage??'OFFICIAL_PAGES',url:p.url,locale:p.locale,...(p.priceAcquisition?{priceScope:p.priceAcquisition.scope}:{})}));
 const selected=[...entries].reverse().find(({page:p})=>p.url===request.url&&p.locale===request.locale&&(!request.priceScope||p.priceAcquisition&&priceScopeKey(p.priceAcquisition.scope)===priceScopeKey(request.priceScope)));
 return {plan,selected};
}

// Only ambiguous null observations are callers. An executor observation is
// emitted by one read, not by a set of textually similar candidate pages.
export function resolveSourceOccurrence(controller,observation,record,candidates){
 const result={version:sourceMappingVersion,classification:'C',sourceResolved:false,
  originalCandidates:candidates.map(p=>({sourceKey:p.key,occurrenceId:p.occurrence.id,status:p.status})),
  evidence:{recordHash:record.hash,taskId:controller.task.id,observationAttemptId:observation.attemptId??null},
  selectedOccurrenceIds:[],reason:null};
 const unresolved=reason=>({...result,reason});
 if(controller.version!=='VERIFY_SERVICE_ORCHESTRATOR_V1'||observation.observation?.value!==null)return unresolved('UNSUPPORTED_HISTORICAL_IDENTITY_CONTRACT');
 const attempts=(controller.latest.attempts??[]).map((a,index)=>({a,index})).filter(({a})=>a.id===observation.attemptId);
 if(attempts.length!==1)return unresolved('MISSING_OR_NONUNIQUE_EXECUTOR_LOCAL_ATTEMPT');
 const {a,index:attemptIndex}=attempts[0];
 if(a.provider!=='controller-retained-replay'||a.method!=='read'||a.outcome!=='OK'||!a.request||!a.source)return unresolved('UNSUPPORTED_OR_INCOMPLETE_HISTORICAL_READ');
 if(controller.latest.researchId!==controller.task.id||a.targetCountry!==controller.task.countryCode)return unresolved('EXECUTION_TASK_IDENTITY_MISMATCH');
 const {plan,selected}=retainedReadSelection(controller.pages,a.request);
 // A stale latest result or different page snapshot must not be resolved by
 // simply taking the last same-URL page from today's retained candidates.
 if(!isDeepStrictEqual(plan,controller.latest.plan))return unresolved('RECORDED_PLAN_DOES_NOT_MATCH_PAGE_SNAPSHOT');
 if(!selected)return unresolved('RECORDED_READ_HAS_NO_SELECTED_PAGE');
 const p=selected.page;
 if(p.targetCountry!==controller.task.countryCode||p.url!==observation.sourceUrl||p.checkedAt!==observation.checkedAt||p.locale!==observation.locale||p.sourceType!==observation.sourceType||!isDeepStrictEqual(p.redirects,observation.redirects)||(p.exitCountry??null)!==observation.exitCountry)return unresolved('OBSERVATION_READ_IDENTITY_MISMATCH');
 // Output metadata corroborates the identity selection; never inspect quotes,
 // extraction text, products, prices, body availability or semantic similarity.
 for(const k of ['url','sourceType','checkedAt','redirects','exitCountry','authority','declaredLanguage','accessDecisions','priceAcquisition']){
  if(a.source[k]!==undefined&&!isDeepStrictEqual(a.source[k],k==='exitCountry'?p[k]??null:p[k]))return unresolved('RECORDED_READ_SOURCE_METADATA_MISMATCH');
 }
 const pointer='/result/pages/'+selected.index,occurrenceId=digest([record.hash,pointer]);
 const match=candidates.find(c=>c.occurrence.id===occurrenceId);
 if(!match)return unresolved('SELECTED_HISTORICAL_OCCURRENCE_NOT_INDEXED');
 return {...result,classification:'D',sourceResolved:true,reason:'URL_TIME_JOIN_LOST_RECORDED_REPLAY_SELECTION',selectedOccurrenceIds:[occurrenceId],
  evidence:{...result.evidence,rule:'VERIFY_SERVICE_ORCHESTRATOR_V1/evaluate/read',attemptPointer:'/result/latest/attempts/'+attemptIndex,
   planPointer:'/result/latest/plan',planSha256:digest(plan),orderedPagesPointer:'/result/pages',pageKey:retainedPageKey(p),selectedPagePointer:pointer,
   sourceKey:match.key,bodySha256:p.sourceIntegrity?.sha256??null,priceAcquisitionId:p.priceAcquisition?.id??null}};
}
