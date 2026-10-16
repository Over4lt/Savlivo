import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const compact=value=>String(value??'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,' ').trim();
function identity(provider,market,plan){let name=compact(plan).replace(/\bmonthly\b/g,'').replace(/\bmonth\b/g,'').trim();const owner=compact(provider);if(name.startsWith(owner+' '))name=name.slice(owner.length+1);return [owner,market.toLowerCase(),name].join(':');}
function normalize(row,provider,market,kind,defaultProvenance){const value={...structuredClone(row),provider:row.provider??provider,market:row.market??market,plan:String(row.plan),amount:Number(row.amount??row.suggestedAmount),currency:String(row.currency??row.suggestedCurrency),provenance:row.provenance??defaultProvenance};value.planIdentity=row.planIdentity??identity(value.provider,value.market,value.plan);value[kind+'Id']=row[kind+'Id']??kind+':'+hash([value.planIdentity,value.amount,value.currency,value.provenance,row.sourceUrl??null]);return value;}
export function normalizeSuggestedResearchRow(row,provider,market){return normalize(row,provider,market,'suggested',sourceBasis({...row,amount:Number(row.amount??row.suggestedAmount),currency:row.currency??row.suggestedCurrency})?'V3_SOURCE_RESEARCH':'V3_RESEARCH');}
const priceKey=row=>row.currency+':'+row.amount;
const monthly=value=>['monthly','monthly_recurring'].includes(String(value??'').toLowerCase());
const exact=value=>String(value??'').toUpperCase()==='EXACT';
const sourceOwnership=new Set(['FIRST_PARTY','ACCEPTED_SOURCE_BOUND']);
const route=row=>compact(row.billingRoute||'UNKNOWN');
const observedAt=row=>{const value=row.acquiredAt??row.researchedAt??row.researchEvidence?.acquiredAt,time=Date.parse(value??'');return Number.isFinite(time)?time:null;};
export const routeCompatibility=Object.freeze({exact:'ROUTE_EXACT',compatibleUnresolved:'ROUTE_COMPATIBLE_UNRESOLVED',conflict:'ROUTE_CONFLICT'});
const contradiction=value=>['CONFLICT','MISMATCH','DISTINCT'].includes(String(value??'').toUpperCase());
const priceFacts=(rows,limit=8)=>{const values=[...new Map(rows.map(row=>[priceKey(row),{amount:row.amount,currency:row.currency}])).values()];return {values:values.slice(0,limit),total:values.length,truncated:values.length>limit};};

function routeClaims(row){
  const evidence=row?.researchEvidence??{},detail=evidence.billingRouteEvidence??{},values=[row?.billingRoute,evidence.billingRoute,detail.route,...(Array.isArray(evidence.billingRouteSignals)?evidence.billingRouteSignals:[]),...(Array.isArray(detail.routes)?detail.routes:[])];
  return new Set(values.map(value=>compact(value)).filter(value=>value&&value!=='unknown'));
}
const positiveRouteConflict=row=>routeClaims(row).size>1||['CONFLICT','MISMATCH','DISTINCT'].includes(String(row?.researchEvidence?.billingRouteAlignment??'').toUpperCase());
export function classifyRouteCompatibility(candidate,baselines=[]){
  const candidateRoutes=routeClaims(candidate),baselineRoutes=new Set(baselines.flatMap(row=>[...routeClaims(row)]));
  if(positiveRouteConflict(candidate)||baselines.some(positiveRouteConflict)||baselineRoutes.size>1)return {kind:routeCompatibility.conflict,candidateRoutes:[...candidateRoutes],baselineRoutes:[...baselineRoutes]};
  const candidateRoute=[...candidateRoutes][0]??null,baselineRoute=[...baselineRoutes][0]??null;
  if(!baselines.length)return {kind:candidateRoute?routeCompatibility.exact:routeCompatibility.compatibleUnresolved,candidateRoutes:[...candidateRoutes],baselineRoutes:[]};
  if(candidateRoute&&baselineRoute)return {kind:candidateRoute===baselineRoute?routeCompatibility.exact:routeCompatibility.conflict,candidateRoutes:[candidateRoute],baselineRoutes:[baselineRoute]};
  if(candidateRoute&&!baselineRoute)return {kind:routeCompatibility.conflict,candidateRoutes:[candidateRoute],baselineRoutes:[]};
  return {kind:routeCompatibility.compatibleUnresolved,candidateRoutes:[],baselineRoutes:[...baselineRoutes]};
}

function sourceBasis(row){const evidence=row.researchEvidence??{};return evidence.acquired===true&&evidence.sourceBound===true&&!!evidence.observationId&&!!row.sourceUrl&&Number.isFinite(row.amount)&&!!row.currency&&evidence.amountBasis==='EXPLICIT'&&monthly(row.paymentCadence)&&evidence.cadence==='MONTHLY_RECURRING'&&evidence.priceRole==='ORDINARY_RECURRING'&&sourceOwnership.has(evidence.sourceOwnership);}
function alignedIdentity(row){const evidence=row.researchEvidence??{};return sourceBasis(row)&&exact(evidence.providerAlignment)&&exact(evidence.planAlignment)&&exact(evidence.marketAlignment)&&!positiveRouteConflict(row)&&!(row.lineageConflicts?.length);}
function exactIdentity(row){const evidence=row.researchEvidence??{};return alignedIdentity(row)&&exact(evidence.billingRouteAlignment)&&route(row)!=='unknown';}
export function activeSuggestedEligibility(row){return {eligible:row.provenance==='GOOGLE_AI_V4'||alignedIdentity(row),quality:row.provenance==='GOOGLE_AI_V4'?1:alignedIdentity(row)?(row.researchEvidence.sourceOwnership==='FIRST_PARTY'?3:2):0,reason:row.provenance==='GOOGLE_AI_V4'?'V4_COVERAGE_FALLBACK':row.lineageConflicts?.length?'LINEAGE_CONTRADICTION':exactIdentity(row)?'SOURCE_BOUND_EXACT_IDENTITY':alignedIdentity(row)?'SOURCE_BOUND_COMPATIBLE_UNRESOLVED_ROUTE':sourceBasis(row)?(positiveRouteConflict(row)?'ROUTE_CONFLICT':'IDENTITY_AMBIGUITY'):'INSUFFICIENT_SOURCE_BOUND_EVIDENCE'};}
function chooseActive(rows){
  const v4=rows.filter(row=>row.provenance==='GOOGLE_AI_V4'),ambiguities=[],rejected=new Map(),routeDecisions=new Map();
  for(const row of rows.filter(row=>row.lineageConflicts?.length)){ambiguities.push({suggestedId:row.suggestedId,type:'LINEAGE_CONTRADICTION',originSuggestedId:row.originSuggestedId,fields:[...row.lineageConflicts]});rejected.set(row.suggestedId,'LINEAGE_CONTRADICTION');}
  for(const row of rows.filter(row=>sourceBasis(row)&&!alignedIdentity(row))){const fields=['providerAlignment','planAlignment','marketAlignment'].filter(field=>!exact(row.researchEvidence?.[field]));if(fields.length)ambiguities.push({suggestedId:row.suggestedId,type:'IDENTITY_AMBIGUITY',fields});else if(positiveRouteConflict(row))ambiguities.push({suggestedId:row.suggestedId,type:'ROUTE_CONFLICT',candidateRoutes:[...routeClaims(row)],baselineRoutes:[]});}
  const eligible=rows.filter(row=>{const decision=activeSuggestedEligibility(row);if(!decision.eligible)return false;if(row.provenance==='GOOGLE_AI_V4')return true;const compatibility=classifyRouteCompatibility(row,v4);routeDecisions.set(row.suggestedId,compatibility);if(compatibility.kind!==routeCompatibility.conflict)return true;const detail={suggestedId:row.suggestedId,type:'ROUTE_CONFLICT',candidateRoutes:compatibility.candidateRoutes,baselineRoutes:compatibility.baselineRoutes};ambiguities.push(detail);rejected.set(row.suggestedId,'ROUTE_CONFLICT');return false;});
  let active=null;
  for(const row of eligible){if(!active){active=row;continue;}const candidate=activeSuggestedEligibility(row),current=activeSuggestedEligibility(active);if(candidate.quality>current.quality){active=row;continue;}const newer=observedAt(row),older=observedAt(active);if(candidate.quality===current.quality&&newer!==null&&older!==null&&newer>older)active=row;}
  const activeRoute=active?.provenance==='GOOGLE_AI_V4'?null:routeDecisions.get(active?.suggestedId)??classifyRouteCompatibility(active,[]);
  const activeSuggested=active?{...structuredClone(active),selection:{identity:{provider:active.provider,market:active.market,planIdentity:active.planIdentity,billingRoute:active.billingRoute??null},reason:activeSuggestedEligibility(active).reason,evidenceQuality:activeSuggestedEligibility(active).quality,routeCompatibility:activeRoute?.kind??null,selectedAt:observedAt(active)}}:null;
  const suggestedHistory=rows.filter(row=>row.suggestedId!==active?.suggestedId).map(row=>{const decision=activeSuggestedEligibility(row),status=active&&decision.eligible&&!rejected.has(row.suggestedId)?'SUPERSEDED':'NOT_SELECTED';let reason=rejected.get(row.suggestedId)??decision.reason;if(status==='SUPERSEDED')reason=decision.quality===activeSuggestedEligibility(active).quality?'NEWER_EQUIVALENT_EVIDENCE':'STRONGER_SOURCE_BOUND_EVIDENCE';return {...structuredClone(row),selectionStatus:status,selectionReason:reason,...(status==='SUPERSEDED'?{supersededBy:active.suggestedId}:{})};});
  return {activeSuggested,suggestedHistory,selectionAmbiguities:ambiguities};
}

function lineageOrigin(row,origins){
  const lineage=row.researchEvidence?.lineage,origin=origins.get(row.originSuggestedId);
  return origin&&lineage?.kind==='V4_SUGGESTED_ORIGIN'&&lineage.originSuggestedId===row.originSuggestedId&&lineage.truthAuthority==='NONE'?origin:null;
}
function lineageContradictions(row,origin){
  const evidence=row.researchEvidence??{},fields=[];
  if(String(row.market??'').toUpperCase()!==String(origin.market??'').toUpperCase())fields.push('market');
  for(const field of ['providerAlignment','planAlignment','marketAlignment'])if(contradiction(evidence[field]))fields.push(field);
  if(!monthly(row.paymentCadence)||evidence.cadence!=='MONTHLY_RECURRING'||evidence.priceRole!=='ORDINARY_RECURRING')fields.push('cadence');
  return [...new Set(fields)];
}

export function mergeResearch({snapshot,v3Result={},existingVerified=[]}){
  if(snapshot?.kind!=='V4SuggestedSnapshot')throw Error('V4_SNAPSHOT_REQUIRED');
  const before=structuredClone(snapshot);
  const v4Suggested=snapshot.suggested.map(row=>normalize(row,snapshot.provider,snapshot.market,'suggested','GOOGLE_AI_V4')),origins=new Map(v4Suggested.map(row=>[row.suggestedId,row]));
  const v3Suggested=(v3Result.suggested??[]).map(row=>{const normalized=normalizeSuggestedResearchRow(row,snapshot.provider,snapshot.market),origin=lineageOrigin(normalized,origins);if(!origin)return normalized;const lineageConflicts=lineageContradictions(normalized,origin);return {...normalized,planIdentity:lineageConflicts.length?(normalized.planIdentity===origin.planIdentity?'lineage-conflict:'+normalized.suggestedId:normalized.planIdentity):origin.planIdentity,lineageConflicts};});
  const suggested=[...v4Suggested,...v3Suggested];
  const verified=[...existingVerified.map(row=>normalize(row,snapshot.provider,snapshot.market,'verified','EXISTING_VERIFIED')),...(v3Result.verified??[]).map(row=>normalize(row,snapshot.provider,snapshot.market,'verified','V3_VERIFIED'))];
  const contradictions=structuredClone(v3Result.contradictions??[]);
  const plans=[...new Set([...suggested,...verified].map(row=>row.planIdentity))].map(planIdentity=>{
    const s=suggested.filter(row=>row.planIdentity===planIdentity),v=verified.filter(row=>row.planIdentity===planIdentity),selection=chooseActive(s),linkedContradictions=contradictions.filter(row=>row.planIdentity===planIdentity||s.some(x=>x.suggestedId===row.suggestedId)),suggestedKeys=new Set(s.map(priceKey)),verifiedKeys=new Set(v.map(priceKey)),suggestedPrices=priceFacts(s),verifiedPrices=priceFacts(v),suggestedMismatch=s.length>0&&v.length>0&&(suggestedKeys.size!==verifiedKeys.size||[...suggestedKeys].some(value=>!verifiedKeys.has(value))),authoritativeConflict=verifiedPrices.total>1||linkedContradictions.length>0,activePrice=authoritativeConflict?null:v[0]??selection.activeSuggested;
    return {planIdentity,suggested:s,verified:v,...selection,activePrice:activePrice?structuredClone(activePrice):null,activeTruthAuthority:authoritativeConflict?'CONFLICT':v.length?'VERIFIED':selection.activeSuggested?'SUGGESTED':'NONE',suggestedMismatch,suggestedVsVerifiedDifference:suggestedMismatch?{suggested:suggestedPrices.values,verified:verifiedPrices.values,suggestedVariants:suggestedPrices.total,verifiedVariants:verifiedPrices.total,truncated:suggestedPrices.truncated||verifiedPrices.truncated}:null,authoritativeConflict,conflict:authoritativeConflict,contradictions:linkedContradictions};
  });
  const result={schemaVersion:2,kind:'CombinedResearchResult',provider:snapshot.provider,market:snapshot.market,resultClass:plans.some(plan=>plan.authoritativeConflict)||contradictions.length?'CONFLICT':verified.length?'VERIFIED':suggested.length?'SUGGESTED':'NO_RESULT',suggested,verified,plans,contradictions,suggestedMismatch:plans.some(plan=>plan.suggestedMismatch),operationalFailures:structuredClone(v3Result.operationalFailures??[])};
  assert.deepEqual(snapshot,before,'V4 Suggested snapshot mutated');
  assert(snapshot.suggested.every(original=>suggested.some(row=>row.suggestedId===original.suggestedId&&row.provenance==='GOOGLE_AI_V4')),'V4 Suggested coverage regressed');
  for(const original of snapshot.suggested){const retained=suggested.find(row=>row.suggestedId===original.suggestedId);for(const [key,value] of Object.entries(original))assert.deepEqual(retained[key],value,'V4 Suggested field changed: '+key);}
  const existingIds=existingVerified.map(row=>normalize(row,snapshot.provider,snapshot.market,'verified','EXISTING_VERIFIED').verifiedId);
  assert(existingIds.every(id=>verified.some(row=>row.verifiedId===id)),'existing Verified coverage regressed');
  return result;
}

export function canonicalPlanEvidenceCounts(combined){
  if(combined?.kind!=='CombinedResearchResult'||!Array.isArray(combined.plans))return null;
  const plans=new Map();
  for(const plan of combined.plans){
    const planIdentity=typeof plan?.planIdentity==='string'&&plan.planIdentity.trim()?plan.planIdentity:null;
    if(!planIdentity)continue;
    const current=plans.get(planIdentity)??{suggested:false,verified:false};
    current.suggested=current.suggested||Array.isArray(plan.suggested)&&plan.suggested.length>0||!!plan.activeSuggested||Array.isArray(plan.suggestedHistory)&&plan.suggestedHistory.length>0;
    current.verified=current.verified||Array.isArray(plan.verified)&&plan.verified.length>0;
    plans.set(planIdentity,current);
  }
  return {
    suggestedPlans:[...plans.values()].filter(plan=>plan.suggested).length,
    verifiedPlans:[...plans.values()].filter(plan=>plan.verified).length
  };
}

export const planIdentity=(provider,market,plan)=>identity(provider,market,plan);
