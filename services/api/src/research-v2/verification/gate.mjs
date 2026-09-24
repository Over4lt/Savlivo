// Explicit evidence decision; never a production write or an L3/L4 alias.
import '../offline-replay/offline-guard.mjs';
import {offerEligibilityVersion} from '../offline-recovery/price-context-guards.mjs';
import {extract,grade,hash,normalizeText} from '../offline-recovery/extract.mjs';
import {attribute} from '../offline-recovery/attribution.mjs';
import {inspectProviderMarket,providerEvidenceFor} from '../offline-recovery/provider-market.mjs';
import {prepareCommercialSource,classifyCommercial} from '../offline-recovery/commercial.mjs';
import {boundedOwnership} from '../offline-recovery/component-ownership.mjs';
import {scopeOfferRole,repairOfferConflicts,regradeScoped} from '../offline-recovery/offer-roles.mjs';
import {introductoryRelationship,compatibleAlternative} from './price-role-compatibility.mjs';
import {resolveContextualCurrency} from '../offline-recovery/contextual-currency.mjs';
import {consumeClosedRenewal,subscriptionReceipt} from '../offline-recovery/closed-renewal.mjs';
import {subscriptionFaqCandidates} from '../offline-recovery/subscription-faq.mjs';
import {consumeColumnPlanTable} from '../offline-recovery/column-plan-table.mjs';
import {consumeNamedOfferDetails} from '../offline-recovery/named-offer-details.mjs';
export const gateVersion='V2_FIELD_VERIFICATION_V5';
const norm=x=>normalizeText(x??'').normalize('NFKC').toLowerCase();
const unique=a=>[...new Set(a)].sort();
// Reuse the established deterministic semantic engine. No copied provider parsing
// rules and no reliance on stored strong flags, grades or forensic verdicts.
export function deriveEvidence(body,context){
 if(hash(body)!==context.bodyHash)throw Error('PROVENANCE_INTEGRITY_FAILURE');
 const source=prepareCommercialSource(body,context.bodyHash),raw=extract(body);
 const provider=inspectProviderMarket(body,{bodyHash:context.bodyHash,sourceOccurrences:context.sourceOccurrences??[]});
 const ctx={...context,providerPolicy:true,geoPolicy:true,malformed:raw.diagnostics.malformedHtml};
 const visible=new Set(raw.candidates.filter(c=>c.sourceType==='HTML'&&c.currency).map(c=>c.currency));
 const rows=raw.candidates.map((r,i)=>{
  const attributed=attribute(r,{...ctx,providerEvidence:providerEvidenceFor(r,provider)});
  const c={...grade(attributed,{...ctx,marketBound:attributed.attribution.marketApplicabilityEstablished}),candidateId:'derived:'+i,factId:'derived:'+i,bodyHash:ctx.bodyHash,service:ctx.service,market:ctx.market,authorityEstablished:!!ctx.authority,currencyAmbiguous:!r.currency,sourceMappingAmbiguous:false,discoveryOccurrences:[{structuredPath:r.structuredPath}]};
  if(c.offerPresentation){
   const sources=(context.sourceOccurrences??[]).filter(o=>{try{const u=new URL(o.url),action=c.offerPresentation.purchase.action;return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&(!c.materialization?.documentURL||new URL(c.materialization.documentURL).href===u.href)&&(!action||new URL(action,u).origin===u.origin&&!new URL(action,u).username&&!new URL(action,u).password);}catch{return false;}});
   const established=c.offerPresentation.bodyHash===ctx.bodyHash&&sources.length===1;
   c.offerPresentation={...c.offerPresentation,status:established?'ESTABLISHED':'UNRESOLVED',sourceUrl:sources[0]?.url??null,occurrenceId:sources[0]?.id??null,acquiredAt:sources[0]?.acquiredAt??sources[0]?.checkedAt??null,marketEvidence:attributed.attribution,observedOnly:true};
   if(r.structuredPlanBinding?.inertInitializer&&!established)c.blockingReasons.push('OFFER_PRESENTATION_SOURCE_BINDING_UNRESOLVED');
  }
  if(r.sourceType==='JSON'&&visible.size&&(visible.size>1||!visible.has(r.currency)))c.blockingReasons.push('STRUCTURED_VISIBLE_CURRENCY_CONTEXT_CONFLICT');
  if(raw.candidates.some(x=>x.amountNormalized===r.amountNormalized&&x.currency===r.currency&&x.normalizedEvidenceSnippet===r.normalizedEvidenceSnippet&&x.product!==r.product)){c.ownershipAmbiguous=true;c.blockingReasons.push('REPEATED_TEXT_DIFFERENT_OWNERS');}
  const peers=raw.candidates.filter(x=>x.product&&x.product===r.product&&x.currency===r.currency&&x.billingPeriod===r.billingPeriod&&x.promotionOrTrial===r.promotionOrTrial&&JSON.stringify(x.qualifier)===JSON.stringify(r.qualifier)&&x.amountNormalized!==r.amountNormalized);if(peers.length)c.blockingReasons.push('MULTIPLE_CONFLICTING_FACTS');c.verificationConflictPeerLocators=peers.map(x=>({path:x.structuredPath,amount:x.amountNormalized,currency:x.currency}));
  boundedOwnership(c,source);
  // Some existing non-monthly/card paths establish ownership in this stage.
  // Re-evaluate only market attribution after that independent ownership proof.
  if(ctx.marketProofResources?.length&&c.product&&!c.ownershipAmbiguous){
   const next=attribute(c,{...ctx,providerEvidence:providerEvidenceFor(c,provider)});
   if(next.attribution.marketProof){const prior=c.blockingReasons.filter(r=>!['MARKET_ATTRIBUTION_UNRESOLVED','MARKET_APPLICABILITY_UNRESOLVED','MARKET_SCOPE_UNRESOLVED','PAGE_GLOBAL_ONLY_APPLICABILITY','SHARED_SOURCE_MARKET_UNRESOLVED'].includes(r));Object.assign(c,grade(next,{...ctx,marketBound:next.attribution.marketApplicabilityEstablished}));c.blockingReasons=unique([...prior,...c.blockingReasons]);}
  }
  const old=structuredClone(c);scopeOfferRole(c,source);return {c,old};
 });
 repairOfferConflicts(rows.map(r=>r.c));for(const r of rows){regradeScoped(r.c,r.old);r.c.commercial=classifyCommercial(r.c,source);}
 for(const {c}of rows)c.verificationPriceRole=introductoryRelationship(c,source,rows.map(r=>r.c));
 for(const {c}of rows)consumeNamedOfferDetails(c,source);
 for(const {c}of rows)consumeColumnPlanTable(c,source);
 for(const {c}of rows)consumeClosedRenewal(c,source,context);
 for(const c of subscriptionFaqCandidates(rows.map(r=>r.c),source,context))rows.push({c});
 for(const {c}of rows)if(resolveContextualCurrency(c,source,context))c.commercial=classifyCommercial(c,source);
 for(const {c}of rows)c.verificationConflictPeers=c.verificationConflictPeerLocators.map(p=>{const d=rows.find(r=>r.c.structuredPath===p.path&&r.c.amountNormalized===p.amount&&r.c.currency===p.currency)?.c;return {...p,bodyHash:ctx.bodyHash,commercialType:d?.commercial.type??'UNRESOLVED',evidence:d?.commercial.evidence??[],priceRole:d?.verificationPriceRole??d?.offerRole??null};});
 return {eligibilityVersion:offerEligibilityVersion,rows:rows.map(r=>r.c).filter((c,i,all)=>!c.namedOfferDetails||all.findIndex(x=>x.namedOfferDetails&&x.structuredPath===c.structuredPath&&x.amountNormalized===c.amountNormalized&&x.currencyRaw===c.currencyRaw)===i),bodyHash:ctx.bodyHash};
}
const codes={service:'SERVICE_NOT_PROVIDER_BOUND',market:'MARKET_NOT_INDEPENDENTLY_VERIFIED',plan:'PLAN_IDENTITY_NOT_ESTABLISHED',amount:'AMOUNT_NOT_PROVIDER_BOUND',currency:'CURRENCY_AMBIGUOUS',monthlyCadence:'MONTHLY_CADENCE_INSUFFICIENT',ordinaryPriceRole:'ORDINARY_PRICE_ROLE_INSUFFICIENT',ownership:'PLAN_OWNERSHIP_INSUFFICIENT',provenance:'PROVENANCE_INTEGRITY_FAILURE',conflicts:'UNRESOLVED_CRITICAL_CONFLICT'};
export const criticalFields=Object.keys(codes);
// Projection of the existing mandatory fields, not another eligibility engine.
function proofSummary(fields){
 const groups={AUTHORITY:['service'],PROVENANCE:['provenance'],IDENTITY:['plan','ownership'],VALUE_AND_CADENCE:['amount','currency','monthlyCadence'],COMMERCIAL_MEANING:['ordinaryPriceRole'],MARKET_SCOPE:['market'],CONSISTENCY:['conflicts']};
 return Object.fromEntries(Object.entries(groups).map(([name,keys])=>[name,keys.every(k=>['VERIFIED','CLEAR'].includes(fields[k]?.status))?'ESTABLISHED':'UNRESOLVED']));
}
function marketDependencies(fields){return [...new Map((fields.market?.evidence??[]).flatMap(x=>x.evidence?.marketProof?.evidence??[]).map(x=>[x.bodyHash,{sourceHash:x.bodyHash,capturedAt:x.capturedAt,record:x.record}])).values()];}
function fieldsFor(claim,d,acquisition){
 const samePlan=!!d?.product&&norm(d.product)===norm(claim.product)&&(!claim.commercial?.providerPlanId||claim.commercial.providerPlanId===d.commercial?.providerPlanId);
 const owner=d?.productOwnerEvidence,commercial=d?.commercial,a=d?.attribution;
 const rawReasons=d?.blockingReasons??[];
 // Missing facts are handled by their own mandatory fields, not contradictions.
 // Mismatch/conflict and origin/hash failures remain independently blocking.
 const conflictReasons=rawReasons.filter(r=>! /^(?:MARKET_ATTRIBUTION_UNRESOLVED|MARKET_APPLICABILITY_UNRESOLVED|MARKET_SCOPE_UNRESOLVED|SHARED_SOURCE_MARKET_UNRESOLVED|PAGE_GLOBAL_ONLY_APPLICABILITY|PRODUCT_UNRESOLVED|STRUCTURAL_OWNERSHIP_WEAK|CURRENCY_UNRESOLVED|VALUE_NORMALIZATION_UNRESOLVED|SOURCE_AUTHORITY_UNRESOLVED)$/.test(r));
 const integrity=acquisition?.intact===true&&acquisition.bodyHash===claim.bodyHash;
 const evidence={service:acquisition?.serviceEvidence,market:a,plan:{product:d?.product,owner,component:d?.componentOwnership,subscription:d?.planIdentityResolution},amount:{raw:d?.amountRaw,value:d?.amountNormalized,path:d?.structuredPath},currency:{raw:d?.currencyRaw,value:d?.currency,path:d?.structuredPath,...(d?.currencyResolution?{resolution:d.currencyResolution}:{})},monthlyCadence:commercial?.evidence,ordinaryPriceRole:{role:d?.verificationPriceRole??d?.offerRole??{role:commercial?.ordinaryMonthly?'REGULAR_BASE':'UNKNOWN',basis:'ORDINARY_MONTHLY_PRESENTATION_WITHOUT_EXCLUSION'},commercialEvidence:commercial?.evidence,conditions:commercial?.priceConditions},ownership:{owner,component:d?.componentOwnership,pricePath:d?.structuredPath,role:d?.offerRole},provenance:acquisition,conflicts:{reasons:rawReasons,commercialReasons:commercial?.reasons??[],marketConflicts:a?.conflictingMarketEvidence??[],competingMonetaryEvidence:d?.verificationConflictPeers??[]}};
 const identitySafe=!(commercial?.reasons??[]).some(r=>['QUALIFIER_NOT_PRODUCT_IDENTITY','HEADING_PRODUCT_BINDING_UNRESOLVED'].includes(r));
 const phaseSafe=!(commercial?.reasons??[]).some(r=>['ZERO_COMMERCIAL_PHASE_UNRESOLVED','NON_POSITIVE_RECURRING_PROVIDER_PRICE'].includes(r));
 const conditions={
  service:integrity&&acquisition.serviceEstablished===true&&acquisition.service===claim.service,
  market:!!a?.marketApplicabilityEstablished&&['PROVIDER_DECLARED','GEO_OBSERVED','PROVIDER_AND_GEO'].includes(a.marketEvidenceType)&&a.requestedMarket===claim.market,
  plan:identitySafe&&samePlan&&!!owner?.path&&!!owner.raw&&!d?.ownershipAmbiguous&&!rawReasons.includes('CTA_OR_TRIAL_HEADING_NOT_PLAN')&&!(commercial?.reasons??[]).includes('CTA_OR_TRIAL_HEADING_NOT_PLAN'),
  amount:!!d&&d.amountNormalized!==null&&d.amountNormalized===claim.amountNormalized&&!d.nonPriceNumericRisk,
  currency:!!d?.currency&&!d.currencyAmbiguous&&d.currency===claim.currency&&!rawReasons.some(r=>/CURRENCY.*CONFLICT|CURRENCY.*AMBIGUOUS/.test(r)),
  monthlyCadence:commercial?.type==='RECURRING_MONTHLY'&&!commercial.nonRenewing&&!commercial.prepaid&&!commercial.oneTimePayment&&!commercial.monthlyEquivalentDisplay,
  ordinaryPriceRole:phaseSafe&&commercial?.ordinaryMonthly===true&&!commercial.monthlyBlockers.includes('NOT_PRINCIPAL_MONTHLY_CHARGE')&&(!d.offerRole||['REGULAR_BASE','POST_INTRO_REGULAR','UNKNOWN'].includes(d.offerRole.role)),
  ownership:identitySafe&&samePlan&&!!owner?.path&&!d?.ownershipAmbiguous&&!d?.crossCardRisk&&a?.productOwnershipEstablished===true,
  provenance:integrity&&!!d&&acquisition.bindingEstablished===true,
  conflicts:!!d&&conflictReasons.length===0&&(commercial?.reasons.length??1)===0&&(d.qualifierPreservation?.unresolved.length??0)===0&&!d.qualifierAmbiguous&&!d.billingPeriodAmbiguous
 };
 return Object.fromEntries(criticalFields.map(field=>[field,{status:conditions[field]?(field==='conflicts'?'CLEAR':'VERIFIED'):'BLOCKED',blocker:conditions[field]?null:codes[field],evidence:evidence[field]??null}]));
}
// Every raw occurrence of one deduplicated candidate must support its claim. A
// receipt is bound to the exact source hash and current structural locator.
export function verifyCandidate(claim,derived,acquisition){
 if(derived?.eligibilityVersion!==offerEligibilityVersion)throw Error('INCOMPATIBLE_DERIVED_EVIDENCE');
 acquisition=subscriptionReceipt(claim,derived,acquisition);
 const paths=claim.discoveryOccurrences?.length?claim.discoveryOccurrences.map(o=>o.structuredPath):[claim.structuredPath];
 const occurrences=paths.map(path=>{const matches=(derived?.rows??[]).filter(d=>d.sourceType===claim.sourceType&&d.structuredPath===path&&d.amountNormalized===claim.amountNormalized&&d.currencyRaw===claim.currencyRaw);const d=matches.length===1?matches[0]:null;return {path,offerPresentation:d?.offerPresentation??null,billingInterval:d?.commercial.billingInterval??null,cadenceFamily:d?.commercial.cadenceFamily??null,derivedProduct:d?.product??null,derivedCommercialType:d?.commercial.type??null,fields:fieldsFor(claim,d,acquisition)};});
 const fields=Object.fromEntries(criticalFields.map(f=>{const failed=occurrences.some(o=>o.fields[f].status==='BLOCKED');return [f,{status:failed?'BLOCKED':f==='conflicts'?'CLEAR':'VERIFIED',blocker:failed?codes[f]:null,evidence:occurrences.map(o=>({path:o.path,...o.fields[f]}))}];}));
 if(new Set(occurrences.map(o=>o.billingInterval?.normalized??null)).size>1){fields.monthlyCadence.status='BLOCKED';fields.monthlyCadence.blocker=codes.monthlyCadence;}
 const blockers=unique(Object.values(fields).map(f=>f.blocker).filter(Boolean));
 return {version:gateVersion,marketProofDependencies:marketDependencies(fields),billingInterval:occurrences[0]?.billingInterval??null,billingIntervalEvidence:occurrences.map(o=>o.billingInterval).filter(Boolean),cadenceFamily:occurrences[0]?.cadenceFamily??null,candidateId:claim.candidateId,factId:claim.factId,sourceHash:claim.bodyHash,sourceUrl:claim.sourceUrl,service:claim.service,market:claim.market,plan:claim.product,providerPlanId:claim.commercial?.providerPlanId??null,amount:claim.amountNormalized,currency:claim.currency,evidenceLevel:claim.verificationLevel,proof:proofSummary(fields),fields,occurrences,blockers,status:blockers.length?'V2_VERIFICATION_BLOCKED':'V2_VERIFIED',offerPresentation:occurrences.map(o=>({path:o.path,proof:o.offerPresentation})),productionPromotion:false};
}
export function verifyIdentity(plan,candidateDecisions,{canonicalConflict=false}={}){
 const supports=plan.candidateIds.map(id=>candidateDecisions.get(id)).filter(Boolean),good=supports.filter(c=>c.version===gateVersion&&c.status==='V2_VERIFIED');
 // Missing evidence in a weak duplicate is not contradictory evidence. Positive
 // conflict findings in any linked representation are independently blocking.
 const contradictions=supports.flatMap(c=>c.fields.conflicts.evidence.flatMap(e=>{const peers=e.evidence?.competingMonetaryEvidence??[];return [...(e.evidence?.reasons??[]),...(e.evidence?.commercialReasons??[])].filter(r=>/CONFLICT|MISMATCH|DIFFERENT_OWNERS/.test(r)&&!(r==='MULTIPLE_CONFLICTING_FACTS'&&peers.length&&peers.every(p=>compatibleAlternative(p,plan))));}));
 const bindingMismatch=good.some(c=>(plan.billingInterval&&c.billingInterval?.normalized!==plan.billingInterval.normalized)||c.service!==plan.service||c.market!==plan.market||c.amount!==plan.amounts[0]?.[0]||c.currency!==plan.amounts[0]?.[1]||(plan.providerPlanId?c.providerPlanId!==plan.providerPlanId:norm(c.plan)!==norm(plan.plan)));
 const incompatible=supports.some(c=>c.version!==gateVersion);
 const conflict=canonicalConflict||bindingMismatch||plan.amounts.length!==1||contradictions.length>0;
 const blockers=unique([...(incompatible?['INCOMPATIBLE_VERIFICATION_VERSION']:[]),...(good.length?[]:supports.flatMap(s=>s.blockers)),...(!supports.length?['PROVENANCE_INTEGRITY_FAILURE']:[]),...(conflict?['UNRESOLVED_CRITICAL_CONFLICT']:[])]);
 const witness=good[0]??supports.slice().sort((a,b)=>a.blockers.length-b.blockers.length||a.candidateId.localeCompare(b.candidateId))[0];
 const fields=Object.fromEntries(criticalFields.map(f=>[f,conflict&&f==='conflicts'?{status:'BLOCKED',blocker:codes.conflicts,evidence:contradictions}:witness?.fields[f]??{status:'BLOCKED',blocker:codes[f],evidence:supports.map(s=>s.fields[f])}]));
 return {version:gateVersion,marketProofDependencies:good.flatMap(c=>c.marketProofDependencies??[]),billingInterval:witness?.billingInterval??null,billingIntervalEvidence:good.flatMap(c=>c.billingIntervalEvidence??[]),cadenceFamily:witness?.cadenceFamily??null,monthlyPlanId:plan.monthlyPlanId,canonicalKey:[plan.market,plan.service,plan.providerPlanId?{providerProductId:plan.providerPlanId}:{plan:plan.plan},...(plan.billingInterval&&plan.billingInterval.unit!=='MONTH'?[{billingInterval:plan.billingInterval.normalized}]:[])],market:plan.market,service:plan.service,plan:plan.plan,providerPlanId:plan.providerPlanId,amount:plan.amounts[0]?.[0]??null,currency:plan.amounts[0]?.[1]??null,commercialType:'RECURRING_MONTHLY',evidenceLevels:plan.evidenceLevels,candidateIds:plan.candidateIds,factIds:plan.factIds,sourceHashes:unique(supports.flatMap(s=>[s.sourceHash,...(s.marketProofDependencies??[]).map(d=>d.sourceHash)])),verifiedWitnessCandidateIds:good.map(s=>s.candidateId),proof:proofSummary(fields),fields,blockers,status:blockers.length?'V2_VERIFICATION_BLOCKED':'V2_VERIFIED',productionPromotion:false};
}
