import fs from 'node:fs';
import path from 'node:path';
import {countryCurrencies} from '../../../../packages/contracts/src/markets.ts';
import {catalogPlanIdentity,productPriceStatus} from '../../../../packages/contracts/src/product-pricing.ts';
import {projectCombinedResearchProductPlans,mergeProductPlans} from '../product-pricing.ts';
import {persistSuggestedProductPlans,loadSuggestedProductPlans} from '../suggested-pricing-store.ts';
import {persistVerifiedLivePrices,loadPersistedVerifiedPrices} from '../pricing-store.ts';
import {projectV3VerificationEvidence} from '../research-v2/inventory/v3-result-projection.mjs';
import {verifyCandidates,buildSuggested} from './v4-normalization.mjs';
import {createV4SuggestedSnapshot,createV3Handoff} from './research-handoff.mjs';
import {canonicalPlanEvidenceCounts,mergeResearch,normalizeSuggestedResearchRow} from './monotonic-merge.mjs';
import {researchMonthlyRecurringWithRecovery} from './monthly-recurring.mjs';
import {reviewedProviderNamespacesFor,reviewedNamespaceMatches} from '../research-v3/reviewed-provider-namespaces.mjs';

export const adminGooglePipelineLimits=Object.freeze({targets:32});
const slug=value=>String(value??'').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,120)||'plan';
const pricePlanIdentity=(target,plan,currency)=>catalogPlanIdentity({serviceSlug:target.service??slug(target.serviceName),planSlug:slug(plan),billingProviderSlug:'direct',countryCode:target.market,currency});
const targetKey=target=>target.id??`${target.service}:${target.market}`;
const safeTarget=target=>{
  if(!target||typeof target.service!=='string'||!/^[a-z0-9-]+$/.test(target.service)||typeof target.serviceName!=='string'||!target.serviceName.trim()||!/^[A-Z]{2}$/.test(target.market??''))throw Error('ADMIN_V4_TARGET_INVALID');
  const reviewed=reviewedProviderNamespacesFor(target.service,target.serviceName.trim()).find(row=>(target.reviewedProviderNamespaces??[]).some(candidate=>JSON.stringify(candidate)===JSON.stringify(row)));
  return {id:targetKey(target),service:target.service,serviceName:target.serviceName.trim(),market:target.market,providerNamespace:reviewed?.registrableDomain??null};
};
const writeJson=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});const pending=file+'.pending';fs.writeFileSync(pending,JSON.stringify(value,null,2)+'\n',{mode:0o600});fs.renameSync(pending,file);};

function v4State(target,acquisition){
  const aiResult=acquisition.recovery?.aiResult??acquisition.aiResult??{provider:target.serviceName,market:target.market,plans:[],sources:[],warnings:[],timestamp:acquisition.audit.timestamp,requestCount:acquisition.audit.request.requestCount};
  const results=verifyCandidates({providerName:target.serviceName,targetMarket:target.market,aiResult,sources:[]});
  const normalized=buildSuggested({providerName:target.serviceName,targetMarket:target.market,aiResult,verificationResults:results});
  const snapshot=createV4SuggestedSnapshot({provider:target.serviceName,market:target.market,suggested:normalized.suggested.map(row=>({...row,planIdentity:pricePlanIdentity(target,row.plan,row.currency??row.suggestedCurrency)}))});
  const origins=new Map(snapshot.suggested.map(row=>[[row.plan,Number(row.amount),row.currency].join('\u0000'),row.suggestedId]));
  const researchCandidates=results.map(row=>({...row,suggestedId:origins.get([row.plan,Number(row.amount),row.currency].join('\u0000'))})).filter(row=>row.suggestedId);
  const providerDiscoveryUrls=target.providerNamespace?(aiResult.sources??[]).map(row=>row.url).filter(url=>reviewedNamespaceMatches(target.providerNamespace,url)):[];
  const recoveryUrls=(acquisition.recovery?.aiResult?.sources??[]).map(row=>row.url);
  const handoff=createV3Handoff(snapshot,{researchCandidates,providerDiscoveryUrls,discoveryUrls:recoveryUrls,unresolvedGaps:acquisition.status==='GOOGLE_AI_SUCCESS'||acquisition.recovery?.outcome==='RECOVERY_CANDIDATES'?['verification']:['google-acquisition-or-price']});
  return {aiResult,results,normalizationDiagnostics:normalized.diagnostics,snapshot,handoff};
}

function verifiedFromTarget(target){
  return projectV3VerificationEvidence(target).map(evidence=>{const {offerIdentityName,...verificationEvidence}=evidence,verifiedAt=evidence.verifiedAt??new Date().toISOString();return {
    plan:evidence.plan,planIdentity:pricePlanIdentity({...target,market:evidence.truthMarket},evidence.plan,evidence.currency),
    amount:evidence.amount,currency:evidence.currency,
    paymentCadence:'MONTHLY_RECURRING',sourceUrl:evidence.sourceUrl,
    verifiedAt,provenance:'V3_VERIFIED',verificationEvidence:{...verificationEvidence,verifiedAt}
  };});
}

export function v3ResultFromTarget(target){
  if(!target)return {suggested:[],verified:[],contradictions:[],sourceAcquisitions:[],operationalFailures:[{kind:'V3_RESULT_UNAVAILABLE'}]};
  return {suggested:structuredClone(target.v3SuggestedCandidates??[]),verified:verifiedFromTarget(target),contradictions:structuredClone(target.v3Truth?.contradictions??[]),sourceAcquisitions:(target.researchCandidateLineage??[]).filter(row=>row.sourceAcquisition).map(row=>({suggestedId:row.originSuggestedId,sourceUrl:row.sourceUrl,truthAuthority:'NONE',...structuredClone(row.sourceAcquisition),currentSourceWarning:row.currentSourceWarning??null})),operationalFailures:[]};
}

export function readLifecycleV3Results(output,targets){
  const file=path.join(output,'pricing','adaptive-state.json');
  if(!fs.existsSync(file))return Object.fromEntries(targets.map(target=>[target.id,v3ResultFromTarget(null)]));
  const state=JSON.parse(fs.readFileSync(file,'utf8'));
  return Object.fromEntries(targets.map(target=>[target.id,v3ResultFromTarget(state.targets?.[target.id])]));
}

function verifiedAdapters(target,rows){
  return rows.filter(row=>row.sourceUrl&&Number(row.amount)>0&&/^[A-Z]{3}$/.test(row.currency??'')).map(row=>({
    planIdentity:row.planIdentity,
    serviceSlug:target.service,planSlug:slug(row.plan),planName:String(row.plan),billingProviderSlug:'direct',countryCode:target.market,
    currency:row.currency,monthlyPriceMinor:Math.round(Number(row.amount)*100),updatedAt:row.verifiedAt??new Date().toISOString(),
    source:'v3-truth',sourceUrl:row.sourceUrl,confidence:'official-provider-adapter',priceType:'exact',verification:'authoritative-provider',sourceCount:1,verifiedByAgreement:false
  }));
}

function existingVerifiedRows(items,target){
  return items.map(item=>({plan:item.planName,planIdentity:item.planIdentity??pricePlanIdentity(target,item.planName,item.currency),amount:item.monthlyPriceMinor/100,currency:item.currency,paymentCadence:'MONTHLY_RECURRING',sourceUrl:item.sourceUrl,verifiedAt:item.updatedAt,provenance:'EXISTING_VERIFIED'}));
}

function alignVerifiedWithPersisted(target,rows,persisted){
  const byKey=new Map(persisted.filter(item=>item.serviceSlug===target.service&&item.billingProviderSlug==='direct'&&item.countryCode===target.market&&item.planIdentity).map(item=>[[item.planSlug,item.currency].join('\u0000'),item.planIdentity]));
  return rows.map(row=>({...row,planIdentity:byKey.get([slug(row.plan),row.currency].join('\u0000'))??pricePlanIdentity(target,row.plan,row.currency)}));
}

const contradictory=value=>['CONFLICT','MISMATCH','DISTINCT'].includes(String(value??'').toUpperCase());
function validOrigin(row,origins,target){
 const lineage=row.researchEvidence?.lineage,origin=origins.get(row.originSuggestedId);
 if(!origin||lineage?.kind!=='V4_SUGGESTED_ORIGIN'||lineage.originSuggestedId!==row.originSuggestedId||lineage.truthAuthority!=='NONE'||row.market!==target.market||row.paymentCadence!=='MONTHLY_RECURRING'||row.researchEvidence?.cadence!=='MONTHLY_RECURRING'||row.researchEvidence?.priceRole!=='ORDINARY_RECURRING')return null;
 if(['providerAlignment','planAlignment','marketAlignment','billingRouteAlignment'].some(field=>contradictory(row.researchEvidence?.[field])))return null;
 return origin;
}

// Resolve exact source-offer and V4 lineage links once, before merge or persistence.
// The original Suggested IDs survive rekeying so an earlier persisted row moves
// to the canonical plan rather than creating a second observation.
export function reconcileV3PlanIdentities(target,snapshot,v3Result,persistedVerified=[]){
 const verified=alignVerifiedWithPersisted(target,v3Result.verified??[],persistedVerified);
 const originals=(v3Result.suggested??[]).map(row=>normalizeSuggestedResearchRow({...row,planIdentity:row.planIdentity??pricePlanIdentity(target,row.plan,row.currency)},snapshot.provider,snapshot.market));
 const origins=new Map(snapshot.suggested.map(row=>[row.suggestedId,row]));
 const byOffer=new Map();
 for(const row of verified){const id=row.verificationEvidence?.exactOfferId;if(typeof id!=='string'||!id)continue;const identities=byOffer.get(id)??new Set();identities.add(row.planIdentity);byOffer.set(id,identities);}
 const v4Rekeys=new Map(),ambiguousV4=new Set();
 const suggested=originals.map(row=>{
  const evidence=row.researchEvidence??{},id=evidence.exactOfferId,origin=validOrigin(row,origins,target),verifiedIdentities=typeof id==='string'?byOffer.get(id):null;
  if(['providerAlignment','planAlignment','marketAlignment','billingRouteAlignment'].some(field=>contradictory(evidence[field]))||row.paymentCadence!=='MONTHLY_RECURRING')return row;
  if(verifiedIdentities?.size>1)return row;
  const canonicalVerified=verifiedIdentities?.size===1?[...verifiedIdentities][0]:null;
  const identity=canonicalVerified??origin?.planIdentity??(typeof id==='string'&&id?pricePlanIdentity(target,id,countryCurrencies[target.market]??row.currency):row.planIdentity);
  if(origin&&canonicalVerified){const prior=v4Rekeys.get(origin.suggestedId);if(prior&&prior!==canonicalVerified)ambiguousV4.add(origin.suggestedId);else v4Rekeys.set(origin.suggestedId,canonicalVerified);}
  return {...row,planIdentity:identity};
 });
 for(const id of ambiguousV4)v4Rekeys.delete(id);
 return {snapshot:{...snapshot,suggested:snapshot.suggested.map(row=>v4Rekeys.has(row.suggestedId)?{...row,planIdentity:v4Rekeys.get(row.suggestedId)}:row)},v3Result:{...v3Result,suggested,verified}};
}

export async function runAdminV4FirstResearch({targets,artifactDirectory,apiKey,acquireGoogle=researchMonthlyRecurringWithRecovery,persistSuggested=persistSuggestedProductPlans,persistVerified=persistVerifiedLivePrices,loadSuggested=loadSuggestedProductPlans,loadVerified=loadPersistedVerifiedPrices,runDownstream,beforeGoogle=null}={}){
  if(!Array.isArray(targets)||!targets.length||targets.length>adminGooglePipelineLimits.targets||typeof runDownstream!=='function')throw Error('ADMIN_V4_PIPELINE_INPUT_INVALID');
  const scoped=targets.map(safeTarget),priority=beforeGoogle?await beforeGoogle():null,sessions=[];
  for(const target of scoped){
    let acquisition;
    try{acquisition=priority?.satisfiedTargetIds?.includes(target.id)?{status:'RESEARCH_LINK_VERIFIED',aiResult:{provider:target.serviceName,market:target.market,plans:[],sources:[],warnings:[],requestCount:0},audit:{timestamp:new Date().toISOString(),request:{requestCount:0,status:'SKIPPED_RESEARCH_LINK_VERIFIED'}}}:await acquireGoogle({providerName:target.serviceName,targetMarket:target.market,providerNamespace:target.providerNamespace,apiKey});}
    catch{acquisition={status:'GOOGLE_AI_ACCESS_FAILURE',aiResult:null,audit:{schemaVersion:1,query:null,researchProvider:'GOOGLE_GEMINI_API_SEARCH_GROUNDED',model:null,timestamp:new Date().toISOString(),normalizedAnswer:null,citations:[],request:{requestCount:0,status:'ADAPTER_FAILURE'}}};}
    const state=v4State(target,acquisition),early=mergeResearch({snapshot:state.snapshot}),plans=projectCombinedResearchProductPlans({serviceSlug:target.service,billingProviderSlug:'direct',countryCode:target.market,combined:early});
    if(plans.length)await persistSuggested(plans);
    const session={target,acquisition,state,earlyPersistedPlans:plans.length};sessions.push(session);
    if(artifactDirectory)writeJson(path.join(artifactDirectory,'google-ai-v4',target.id.replace(/[^a-zA-Z0-9_.:-]/g,'_')+'.json'),{schemaVersion:1,target,acquisition:{status:acquisition.status,audit:acquisition.audit,recovery:acquisition.recovery??null},v4:{suggested:state.snapshot.suggested,normalizationDiagnostics:state.normalizationDiagnostics,handoff:state.handoff},persistence:{suggestedPlans:plans.length,stage:'BEFORE_V3'}});
  }
  const handoffs=Object.fromEntries(sessions.map(session=>[session.target.id,session.state.handoff]));
  const downstream=priority?.satisfiedTargetIds?.length===scoped.length?priority.downstream:await runDownstream({handoffs});
  const results=[];
  for(const session of sessions){
    const {target,state,acquisition}=session,v3Result=downstream?.v3Results?.[target.id]??{suggested:[],verified:[],contradictions:[],operationalFailures:[{kind:'V3_RESULT_UNAVAILABLE'}]},currency=countryCurrencies[target.market]??v3Result.suggested?.[0]?.currency??state.snapshot.suggested[0]?.currency??'';
    let persistedVerified=[];if(currency)try{persistedVerified=(await loadVerified(target.market,currency)).filter(row=>row.serviceSlug===target.service);}catch{persistedVerified=[];}
    const existing=existingVerifiedRows(persistedVerified,target),resolved=reconcileV3PlanIdentities(target,state.snapshot,v3Result,persistedVerified),alignedV3Result=resolved.v3Result;
    const combined=mergeResearch({snapshot:resolved.snapshot,v3Result:alignedV3Result,existingVerified:existing}),productPlans=projectCombinedResearchProductPlans({serviceSlug:target.service,billingProviderSlug:'direct',countryCode:target.market,combined});
    if(productPlans.some(plan=>plan.suggested||plan.suggestedHistory.length))await persistSuggested(productPlans);
    const acceptedVerified=verifiedAdapters(target,alignedV3Result.verified);if(acceptedVerified.length)await persistVerified(acceptedVerified);
    let observedPlans=productPlans;if(currency)try{const storedVerified=(await loadVerified(target.market,currency)).filter(row=>row.serviceSlug===target.service);observedPlans=mergeProductPlans(await loadSuggested(target.market,currency),projectCombinedResearchProductPlans({serviceSlug:target.service,billingProviderSlug:'direct',countryCode:target.market,combined:mergeResearch({snapshot:createV4SuggestedSnapshot({provider:target.serviceName,market:target.market,suggested:[]}),existingVerified:existingVerifiedRows(storedVerified,target)})}));}catch{/* Persistence result remains explicit below. */}
    const planCounts=canonicalPlanEvidenceCounts(combined);
    const result={target,googleStatus:acquisition.status,googleRequests:(acquisition.audit.request.requestCount??0)+(acquisition.recovery?.requestCount??0),strictGeminiRequests:acquisition.audit.request.requestCount??0,simplifiedRecoveryRequests:acquisition.recovery?.requestCount??0,recoveryReason:acquisition.recovery?.reason??null,recoveryOutcome:acquisition.recovery?.outcome??null,earlySuggestedPersisted:session.earlyPersistedPlans,combined,planCounts,sourceAcquisitions:structuredClone(v3Result.sourceAcquisitions??[]),researchLinkAvailable:(downstream?.result?.targets?.[target.id]?.researchLinks??[]).length>0,researchLinks:structuredClone(downstream?.result?.targets?.[target.id]?.researchLinkOutcomes??[]),verificationEvidence:(v3Result.verified??[]).map(row=>row.verificationEvidence).filter(Boolean),verificationRetry:downstream?.verificationRetry?.targets?.[target.id]??null,persisted:{suggestedPlans:productPlans.filter(plan=>plan.suggested||plan.suggestedHistory.length).length,verified:acceptedVerified.length},analyticsStates:observedPlans.filter(plan=>plan.serviceSlug===target.service).map(plan=>({planIdentity:plan.planIdentity,status:productPriceStatus(plan)}))};
    results.push(result);if(artifactDirectory)writeJson(path.join(artifactDirectory,'google-ai-v4',target.id.replace(/[^a-zA-Z0-9_.:-]/g,'_')+'-final.json'),result);
  }
  return {schemaVersion:1,kind:'ADMIN_V4_FIRST_RESEARCH_RESULT',downstreamResult:downstream?.result??downstream,targets:results};
}
