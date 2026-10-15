import test from 'node:test';
import assert from 'node:assert/strict';
import {createV4SuggestedSnapshot} from './research-handoff.mjs';
import {canonicalPlanEvidenceCounts,mergeResearch,planIdentity} from './monotonic-merge.mjs';

const provider='Example',market='FR',identity=planIdentity(provider,market,'Gold');
const suggested=(amount,extra={})=>({plan:'Gold',planIdentity:identity,suggestedAmount:amount,suggestedCurrency:'EUR',suggestedPaymentCadence:'MONTHLY_RECURRING',suggestedSourceUrl:'https://example.test/fr/pricing',sourceReferences:['https://example.test/fr/terms'],warnings:['BILLING_ROUTE_UNRESOLVED'],...extra});
const snapshot=(...rows)=>createV4SuggestedSnapshot({provider,market,suggested:rows});
const verified=(amount,extra={})=>({provider,market,plan:'Gold',planIdentity:identity,amount,currency:'EUR',paymentCadence:'MONTHLY_RECURRING',sourceUrl:'https://example.test/fr/pricing',verifiedAt:'2026-10-15T00:00:00.000Z',provenance:'V3_VERIFIED',...extra});
const merge=(state,options={})=>mergeResearch({snapshot:state,v3Result:{suggested:[],verified:[],contradictions:[],operationalFailures:[],...(options.v3Result??{})},existingVerified:options.existingVerified??[]});

test('Suggested 6.99 and authoritative Verified 7.00 retains mismatch without truth conflict',()=>{
 const state=snapshot(suggested(6.99)),result=merge(state,{v3Result:{verified:[verified(7)]}}),plan=result.plans[0];
 assert.equal(result.resultClass,'VERIFIED');assert.equal(plan.activeTruthAuthority,'VERIFIED');assert.equal(plan.activePrice.amount,7);assert.equal(plan.suggestedMismatch,true);assert.deepEqual(plan.suggestedVsVerifiedDifference,{suggested:[{amount:6.99,currency:'EUR'}],verified:[{amount:7,currency:'EUR'}],suggestedVariants:1,verifiedVariants:1,truncated:false});assert.equal(plan.authoritativeConflict,false);assert.equal(plan.conflict,false);
 assert.equal(result.suggested.length,1);assert.equal(plan.suggested.length,1);assert.deepEqual(plan.suggested[0].warnings,['BILLING_ROUTE_UNRESOLVED']);assert.deepEqual(plan.suggested[0].sourceReferences,['https://example.test/fr/terms']);assert.equal(plan.suggested[0].amount,6.99);
});

test('identical Suggested and Verified resolves to Verified without false conflict',()=>{
 const result=merge(snapshot(suggested(7)),{v3Result:{verified:[verified(7)]}}),plan=result.plans[0];
 assert.equal(result.resultClass,'VERIFIED');assert.equal(plan.activePrice.amount,7);assert.equal(plan.suggestedMismatch,false);assert.equal(plan.suggestedVsVerifiedDifference,null);assert.equal(plan.authoritativeConflict,false);
});

test('Suggested route ambiguity remains diagnostic beside authoritative Verified',()=>{
 const state=snapshot(suggested(7,{billingRoute:'DIRECT'})),result=merge(state,{v3Result:{suggested:[{provider,market,plan:'Gold',planIdentity:identity,amount:7,currency:'EUR',paymentCadence:'MONTHLY_RECURRING',billingRoute:'APP_STORE',sourceUrl:'https://example.test/fr/pricing',acquiredAt:'2026-10-15T00:01:00.000Z',provenance:'V3_SOURCE_RESEARCH',researchEvidence:{acquired:true,sourceBound:true,observationId:'observation-route',amountBasis:'EXPLICIT',cadence:'MONTHLY_RECURRING',priceRole:'ORDINARY_RECURRING',sourceOwnership:'FIRST_PARTY',providerAlignment:'EXACT',planAlignment:'EXACT',marketAlignment:'EXACT',billingRouteAlignment:'EXACT'}}],verified:[verified(7)]}}),plan=result.plans[0];
 assert.equal(result.resultClass,'VERIFIED');assert.equal(plan.activeTruthAuthority,'VERIFIED');assert.equal(plan.activePrice.amount,7);assert.equal(plan.authoritativeConflict,false);assert.equal(plan.selectionAmbiguities.some(row=>row.type==='ROUTE_CONFLICT'),true);
});

test('multiple Suggested variants remain retained while one Verified stays active',()=>{
 const state=snapshot(suggested(6.99),suggested(7),suggested(7.49)),result=merge(state,{v3Result:{verified:[verified(7)]}}),plan=result.plans[0];
 assert.equal(result.resultClass,'VERIFIED');assert.equal(plan.activePrice.amount,7);assert.equal(plan.suggested.length,3);assert.equal(plan.suggestedHistory.length,2);assert.equal(new Set(plan.suggested.map(row=>row.suggestedId)).size,3);assert.equal(plan.suggestedMismatch,true);
});

test('Suggested only remains Suggested',()=>{
 const result=merge(snapshot(suggested(6.99))),plan=result.plans[0];
 assert.equal(result.resultClass,'SUGGESTED');assert.equal(plan.activeTruthAuthority,'SUGGESTED');assert.equal(plan.activePrice.amount,6.99);assert.equal(plan.authoritativeConflict,false);
});

test('genuine authoritative contradictions still produce Conflict',()=>{
 const verifiedConflict=merge(snapshot(suggested(6.99)),{v3Result:{verified:[verified(7),verified(8)]}});assert.equal(verifiedConflict.resultClass,'CONFLICT');assert.equal(verifiedConflict.plans[0].authoritativeConflict,true);assert.equal(verifiedConflict.plans[0].activePrice,null);
 const explicit=merge(snapshot(suggested(6.99)),{v3Result:{verified:[verified(7)],contradictions:[{kind:'V3_TRUTH_CONTRADICTION',planIdentity:identity}]}});assert.equal(explicit.resultClass,'CONFLICT');assert.equal(explicit.plans[0].authoritativeConflict,true);
});

test('existing persisted Verified trumps a new Suggested',()=>{
 const result=merge(snapshot(suggested(6.99)),{existingVerified:[verified(7,{provenance:'EXISTING_VERIFIED'})]}),plan=result.plans[0];
 assert.equal(result.resultClass,'VERIFIED');assert.equal(plan.activeTruthAuthority,'VERIFIED');assert.equal(plan.activePrice.amount,7);assert.equal(plan.suggestedMismatch,true);assert.equal(plan.verified[0].provenance,'EXISTING_VERIFIED');
});

test('adding Suggested evidence cannot downgrade an existing Verified result',()=>{
 const withoutSuggested=merge(snapshot(),{existingVerified:[verified(7,{provenance:'EXISTING_VERIFIED'})]}),withSuggested=merge(snapshot(suggested(6.99),suggested(7.49)),{existingVerified:[verified(7,{provenance:'EXISTING_VERIFIED'})]});
 assert.equal(withoutSuggested.resultClass,'VERIFIED');assert.equal(withSuggested.resultClass,'VERIFIED');assert.equal(withSuggested.plans[0].activePrice.amount,7);assert.equal(withSuggested.plans[0].authoritativeConflict,false);
});

test('canonical plan counts deduplicate V4 and V3 Suggested evidence per logical plan',()=>{
 const combined={kind:'CombinedResearchResult',plans:[
  {planIdentity:'example:at:gold',suggested:[{provenance:'GOOGLE_AI_V4'},{provenance:'V3_SOURCE_RESEARCH'}],verified:[]},
  {planIdentity:'example:at:platinum',suggested:[{provenance:'GOOGLE_AI_V4'},{provenance:'V3_SOURCE_RESEARCH'}],verified:[]},
  {planIdentity:'example:at:diamond',suggested:[{provenance:'GOOGLE_AI_V4'},{provenance:'V3_SOURCE_RESEARCH'}],verified:[]}
 ]},before=structuredClone(combined);
 assert.deepEqual(canonicalPlanEvidenceCounts({kind:'CombinedResearchResult',plans:[combined.plans[0]]}),{suggestedPlans:1,verifiedPlans:0});
 assert.deepEqual(canonicalPlanEvidenceCounts(combined),{suggestedPlans:3,verifiedPlans:0});
 assert.deepEqual(combined,before);
});

test('canonical plan counts allow one logical plan in both Suggested and Verified',()=>{
 const plans=['gold','platinum','diamond'].map(name=>({planIdentity:`example:at:${name}`,suggested:[{provenance:'GOOGLE_AI_V4'},{provenance:'V3_SOURCE_RESEARCH'}],verified:[{provenance:'V3_VERIFIED'}]}));
 assert.deepEqual(canonicalPlanEvidenceCounts({kind:'CombinedResearchResult',plans}),{suggestedPlans:3,verifiedPlans:3});
});

test('historical Suggested variants do not inflate canonical current plan counts',()=>{
 const combined={kind:'CombinedResearchResult',plans:[
  {planIdentity:'example:at:gold',activeSuggested:{provenance:'V3_SOURCE_RESEARCH'},suggestedHistory:[{provenance:'GOOGLE_AI_V4'},{provenance:'V3_SOURCE_RESEARCH'}],suggested:[{},{},{}],verified:[]},
  {planIdentity:'example:at:platinum',activeSuggested:{},suggestedHistory:[],suggested:[{}],verified:[]},
  {planIdentity:'example:at:diamond',activeSuggested:{},suggestedHistory:[],suggested:[{}],verified:[]},
  {planIdentity:'example:at:gold',activeSuggested:null,suggestedHistory:[{}],suggested:[{}],verified:[]}
 ]};
 assert.deepEqual(canonicalPlanEvidenceCounts(combined),{suggestedPlans:3,verifiedPlans:0});
});

test('Suggested-only and Verified-only logical plans remain independent',()=>{
 assert.deepEqual(canonicalPlanEvidenceCounts({kind:'CombinedResearchResult',plans:[
  {planIdentity:'example:at:suggested',suggested:[{}],verified:[]},
  {planIdentity:'example:at:verified',suggested:[],verified:[{}]}
 ]}),{suggestedPlans:1,verifiedPlans:1});
 assert.equal(canonicalPlanEvidenceCounts({kind:'OTHER',plans:[]}),null);
});
