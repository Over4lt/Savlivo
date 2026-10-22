import test from 'node:test';
import assert from 'node:assert/strict';
import {runAdminSuggestedOnlyResearch,runAdminV4FirstResearch} from './admin-live-pipeline.mjs';
import {normalizeGoogleAiResponse} from './monthly-recurring.mjs';
import {reviewedProviderNamespacesFor} from '../research-v3/reviewed-provider-namespaces.mjs';

const target={id:'price-research:prime-video:NO',service:'prime-video',serviceName:'Prime Video',market:'NO'};
const altibox='https://www.altibox.no/underholdning/prime-video/';
const plan=(planName,amount,overrides={})=>({planName,amount,currency:'NOK',ordinaryRecurringPrice:amount,paymentCadence:'MONTHLY',commitment:null,annualOnly:false,freeTier:false,billingBasis:'per month',sourceUrl:altibox,sourceEvidence:`${planName} ${amount} kr per month`,marketEvidence:'Available to customers in Norway',summary:'Standalone subscription',...overrides});
const acquisition=(plans,overrides={})=>({status:'GOOGLE_AI_SUCCESS',aiResult:{provider:'Prime Video',market:'NO',plans,sources:[{title:'Altibox Prime Video',url:altibox}],warnings:[],timestamp:'2026-10-21T12:00:00.000Z',requestCount:1},audit:{timestamp:'2026-10-21T12:00:00.000Z',request:{requestCount:1},groundingCitations:[{title:'Altibox Prime Video',url:altibox}]},...overrides});

test('Prime Video NO stores standalone monthly Suggested with source warnings; no V3 or Verified writer runs',async()=>{
 const stored=[],requested=[],verified=[{serviceSlug:'prime-video',planName:'Existing',monthlyPriceMinor:12900,currency:'NOK',source:'v3-truth',sourceUrl:'https://www.primevideo.com/',updatedAt:'2026-10-20T12:00:00.000Z'}];
 const result=await runAdminSuggestedOnlyResearch({targets:[target],apiKey:'offline',acquireGoogle:async options=>{requested.push(options);return acquisition([
  plan('Prime Video',89),plan('Prime Video annual',69,{annualOnly:true,billingBasis:'annual equivalent'}),
  plan('Prime Video Channels add-on',39),plan('Prime Video + partner bundle',119),plan('Amazon Prime membership',89),
  plan('Prime Video Standard',99,{sourceUrl:'https://uncited.example/pricing'})
 ]);},persistSuggested:async rows=>stored.push(...rows),loadVerified:async()=>verified});
 const row=result.targets[0];assert.equal(result.researchMode,'suggested_only');assert.equal(requested.length,1);assert.equal(requested[0].maxRequests,1);
 assert.equal(stored.length,2);assert.equal(stored[0].planName,'Prime Video');assert.equal(stored[0].suggested.monthlyPriceMinor,8900);
 assert.equal(stored[0].suggested.sourceUrl,altibox);assert.equal(stored[0].suggested.provenance,'GOOGLE_AI_V4');
 assert(stored[0].suggested.warnings.includes('FIRST_PARTY_NOT_CONFIRMED'));
 assert.equal(stored[1].suggested.sourceUrl,'https://uncited.example/pricing');
 assert(stored[1].suggested.warnings.includes('FIRST_PARTY_NOT_CONFIRMED'));
 assert.equal(row.persisted.verified,0);assert.equal(row.persisted.suggestedPlans,2);assert.equal(row.combined.resultClass,'SUGGESTED');
 assert.equal(row.googleAttempts[0].candidateCount,6);assert.equal(row.googleAttempts[0].groundingCount,1);
 assert.equal(row.googleAttempts[0].rejected.NON_STANDALONE,3);
 assert.deepEqual(row.verificationEvidence,[]);assert.equal(row.verificationRetry,null);assert.equal(result.downstreamResult,null);
 assert.deepEqual(row.capabilityUsage,{googleAiRequests:1,strictGeminiRequests:1,simplifiedRecoveryRequests:0,directAttempts:0,tavilyAttempts:0,decodoAttempts:0,browserAttempts:0});
 assert.equal(verified[0].monthlyPriceMinor,12900);
});

test('wrong-market, annual-only and Amazon Prime membership leads stop with NO_RESULT without escalation',async()=>{
 let persisted=0;const result=await runAdminSuggestedOnlyResearch({targets:[target],acquireGoogle:async()=>acquisition([
  plan('Prime Video',89,{marketEvidence:'US only'}),plan('Prime Video annual',69,{annualOnly:true}),
  plan('Amazon Prime membership',89,{sourceUrl:'https://uncited.example/prime'})
 ]),persistSuggested:async()=>{persisted++;},loadVerified:async()=>[]});
 assert.equal(persisted,0);assert.equal(result.targets[0].combined.resultClass,'NO_RESULT');assert.equal(result.targets[0].persisted.verified,0);
 assert.equal(result.targets[0].capabilityUsage.decodoAttempts,0);assert.equal(result.targets[0].capabilityUsage.browserAttempts,0);
});

test('Suggested Only rejects a researcher that exceeds one request in a single acquisition',async()=>{
 await assert.rejects(runAdminSuggestedOnlyResearch({targets:[target],acquireGoogle:async()=>acquisition([plan('Prime Video',89)],{audit:{request:{requestCount:2},groundingCitations:[{url:altibox}]}}),persistSuggested:async()=>{throw Error('MUST_NOT_WRITE');},loadVerified:async()=>[]}),/SUGGESTED_ONLY_BUDGET_VIOLATION/);
});

test('standard and Suggested Only use the same V4 Suggested projection for a grounded distributor price',async()=>{
 const candidate=plan('Prime Video',89,{commitment:'one-year commitment paid monthly',sourceEvidence:null,marketEvidence:null});
 const standardRows=[],suggestedRows=[];
 const standard=await runAdminV4FirstResearch({targets:[target],acquireGoogle:async()=>acquisition([candidate]),
  persistSuggested:async rows=>standardRows.push(...rows),persistVerified:async()=>assert.fail('no V3 verified rows'),
  loadSuggested:async()=>[],loadVerified:async()=>[],runDownstream:async()=>({v3Results:{[target.id]:{suggested:[],verified:[],contradictions:[],operationalFailures:[]}}})});
 const light=await runAdminSuggestedOnlyResearch({targets:[target],acquireGoogle:async()=>acquisition([candidate]),
  persistSuggested:async rows=>suggestedRows.push(...rows),loadVerified:async()=>[]});
 assert.equal(standardRows.length,2,'standard persists its early and final Suggested projections');assert.equal(suggestedRows.length,1);
 assert.deepEqual(suggestedRows[0],standardRows[0]);
 assert.equal(light.targets[0].combined.resultClass,'SUGGESTED');
 assert.equal(standard.targets[0].earlySuggestedPersisted,1);
 assert.equal(light.targets[0].googleRequests,1);
 assert.equal(light.targets[0].persisted.verified,0);
});

test('both modes exclude Prime membership, Channels, Ad Free and bundles from base Prime Video Suggested',async()=>{
 const answer=acquisition([
  plan('Prime Video',79),plan('Amazon Prime membership',89),plan('Prime Student Monthly',49),plan('Prime Video Channels',29),
  plan('Prime Video Ad Free',29),plan('Prime Video + partner bundle',119)
 ]);
 const standardRows=[],suggestedRows=[];
 await runAdminV4FirstResearch({targets:[target],acquireGoogle:async()=>answer,
  persistSuggested:async rows=>standardRows.push(...rows),persistVerified:async()=>assert.fail('no verified write'),
  loadSuggested:async()=>[],loadVerified:async()=>[],runDownstream:async()=>({v3Results:{[target.id]:{suggested:[],verified:[],contradictions:[],operationalFailures:[]}}})});
 const light=await runAdminSuggestedOnlyResearch({targets:[target],acquireGoogle:async()=>answer,
  persistSuggested:async rows=>suggestedRows.push(...rows),loadVerified:async()=>[]});
 assert.equal(standardRows[0].planName,'Prime Video');
 assert.equal(suggestedRows.length,1);
 assert.deepEqual(suggestedRows[0],standardRows[0]);
 assert.equal(light.targets[0].googleAttempts[0].rejected.NON_STANDALONE,5);
});

test('a no-price first result gets one targeted Google follow-up within the two-request budget',async()=>{
 const calls=[],stored=[];
 const result=await runAdminSuggestedOnlyResearch({targets:[target],acquireGoogle:async options=>{
  calls.push(options);return calls.length===1?acquisition([],{status:'GOOGLE_AI_NO_PRICE'}):acquisition([plan('Prime Video',89)]);
 },persistSuggested:async rows=>stored.push(...rows),loadVerified:async()=>[]});
 assert.equal(calls.length,2);assert.deepEqual(calls.map(row=>row.maxRequests),[1,1]);
 assert.deepEqual(calls.map(row=>row.suggestedOnlyFollowup),[false,true]);
 assert(calls.every(row=>row.providerNamespace===null),'distributors are not excluded by an official-domain query filter');
 assert.equal(stored.length,1);assert.equal(result.targets[0].googleRequests,2);
 assert.deepEqual(result.targets[0].googleAttempts.map(row=>row.qualifyingSuggested),[0,1]);
 assert.equal(result.targets[0].capabilityUsage.googleAiRequests,2);
 assert.equal(result.targets[0].persisted.verified,0);
});

test('Suggested Only does not impose an official-host query filter even for a reviewed provider namespace',async()=>{
 const hulu={id:'price-research:hulu:NO',service:'hulu',serviceName:'Hulu',market:'NO',
  reviewedProviderNamespaces:reviewedProviderNamespacesFor('hulu','Hulu')};
 const calls=[];
 await runAdminSuggestedOnlyResearch({targets:[hulu],maxGoogleRequests:1,
  acquireGoogle:async options=>{calls.push(options);return acquisition([],{status:'GOOGLE_AI_NO_PRICE'});},
  persistSuggested:async()=>assert.fail('no candidate'),loadVerified:async()=>[]});
 assert.equal(calls.length,1);
 assert.equal(calls[0].providerNamespace,null);
});

test('Prime Video DK can use a grounded Danish distributor after an empty first result',async()=>{
 const dkTarget={...target,id:'price-research:prime-video:DK',market:'DK'};
 const distributor='https://www.yousee.dk/underholdning/prime-video/';
 const dkPlan={...plan('Prime Video',69),currency:'DKK',sourceUrl:distributor,
  sourceEvidence:'Prime Video 69 kr. per måned',marketEvidence:'Tilgængelig for kunder i Danmark',billingBasis:'paid monthly'};
 let calls=0;const stored=[];
 const result=await runAdminSuggestedOnlyResearch({targets:[dkTarget],acquireGoogle:async()=>{
  calls++;const row=acquisition(calls===1?[]:[dkPlan],{status:calls===1?'GOOGLE_AI_NO_PRICE':'GOOGLE_AI_SUCCESS'});
  return {...row,aiResult:{...row.aiResult,market:'DK',sources:[{title:'Danish distributor',url:distributor}]},
   audit:{...row.audit,groundingCitations:[{url:distributor}]}};
 },persistSuggested:async rows=>stored.push(...rows),loadVerified:async()=>[]});
 assert.equal(calls,2);assert.equal(result.targets[0].googleRequests,2);
 assert.equal(stored.length,1);assert.equal(stored[0].suggested.monthlyPriceMinor,6900);
 assert.equal(stored[0].suggested.currency,'DKK');assert.equal(stored[0].suggested.sourceUrl,distributor);
 assert.equal(result.targets[0].persisted.verified,0);
});

test('a wrong-market or annual first answer may be followed by one valid grounded answer',async()=>{
 let calls=0;const stored=[];
 const result=await runAdminSuggestedOnlyResearch({targets:[target],acquireGoogle:async()=>{
  calls++;return acquisition(calls===1?[
   plan('Prime Video',89,{marketEvidence:'US only'}),
   plan('Prime Video annual',69,{annualOnly:true,billingBasis:'billed annually'})
  ]:[plan('Prime Video',79)]);
 },persistSuggested:async rows=>stored.push(...rows),loadVerified:async()=>[]});
 assert.equal(calls,2);assert.equal(stored.length,1);
 assert.equal(stored[0].suggested.monthlyPriceMinor,7900);
 assert.equal(result.targets[0].persisted.suggestedPlans,1);
});

test('empty responses stop after two Google calls and hard access failures do not retry',async()=>{
 let calls=0,writes=0;
 const empty=await runAdminSuggestedOnlyResearch({targets:[target],acquireGoogle:async()=>{calls++;return acquisition([],{status:'GOOGLE_AI_NO_PRICE'});},persistSuggested:async()=>{writes++;},loadVerified:async()=>[]});
 assert.equal(calls,2);assert.equal(writes,0);assert.equal(empty.targets[0].combined.resultClass,'NO_RESULT');
 assert.equal(empty.targets[0].googleRequests,2);
 calls=0;
 await runAdminSuggestedOnlyResearch({targets:[target],acquireGoogle:async()=>{calls++;return acquisition([],{status:'GOOGLE_AI_ACCESS_FAILURE',audit:{request:{requestCount:1,status:'HTTP_402'},groundingCitations:[]}});},persistSuggested:async()=>{writes++;},loadVerified:async()=>[]});
 assert.equal(calls,1);assert.equal(writes,0);
});

test('grounding URL differences remain diagnostics while ungrounded source warnings survive',async()=>{
 const stored=[];
 const result=await runAdminSuggestedOnlyResearch({targets:[target],maxGoogleRequests:1,acquireGoogle:async()=>acquisition([
  plan('Prime Video',89,{sourceUrl:altibox+'#plans'}),
  plan('Prime Video Standard',99,{sourceUrl:'https://other.example/prices'})
 ]),persistSuggested:async rows=>stored.push(...rows),loadVerified:async()=>[]});
 assert.equal(stored.length,2);assert.equal(stored[0].suggested.sourceUrl,altibox+'#plans');
 assert.equal(stored[1].suggested.sourceUrl,'https://other.example/prices');
 assert(stored[1].suggested.warnings.includes('FIRST_PARTY_NOT_CONFIRMED'));
 assert.equal(result.targets[0].googleAttempts[0].urlMatched,1);
 assert.equal(result.targets[0].googleRequests,1);
});

test('standard and Suggested Only produce identical V4 Suggested from the same ungrounded Google response',async()=>{
 const full={provider:'Prime Video',market:'NO',plans:[
  plan('Prime Video',89),plan('Prime Video annual',69,{annualOnly:true,billingBasis:'annual equivalent'}),
  plan('Prime Video',99,{marketEvidence:'US only'}),plan('Amazon Prime membership',89),
  plan('Prime Video Ad Free',29)
 ].map(row=>({...row,introPrice:null,introDuration:null,warnings:[]})),sources:[{title:'Altibox Prime Video',url:altibox}],warnings:[]};
 const normalized=normalizeGoogleAiResponse({candidates:[{content:{parts:[{text:JSON.stringify(full)}]},finishReason:'STOP'}]},
  {providerName:'Prime Video',targetMarket:'NO',query:'offline',model:'gemini-offline',requestCount:1,startedAt:'2026-10-21T12:00:00.000Z',finishedAt:'2026-10-21T12:00:01.000Z'});
 assert.equal(normalized.audit.citations.length,1);assert.deepEqual(normalized.audit.groundingCitations,[]);
 const standardRows=[],suggestedRows=[];
 const standard=await runAdminV4FirstResearch({targets:[target],acquireGoogle:async()=>normalized,
  persistSuggested:async rows=>standardRows.push(...rows),persistVerified:async()=>assert.fail('no V3 verified rows'),
  loadSuggested:async()=>[],loadVerified:async()=>[],runDownstream:async()=>({v3Results:{[target.id]:{suggested:[],verified:[],contradictions:[],operationalFailures:[]}}})});
 const light=await runAdminSuggestedOnlyResearch({targets:[target],acquireGoogle:async()=>normalized,
  persistSuggested:async rows=>suggestedRows.push(...rows),loadVerified:async()=>[]});
 assert.equal(standard.targets[0].earlySuggestedPersisted,1);
 assert.equal(suggestedRows.length,1);
 assert.deepEqual(suggestedRows[0],standardRows[0]);
 assert.equal(suggestedRows[0].planName,'Prime Video');
 assert(suggestedRows[0].suggested.warnings.includes('FIRST_PARTY_NOT_CONFIRMED'));
 assert.equal(light.targets[0].combined.resultClass,'SUGGESTED');
 assert.equal(light.targets[0].googleAttempts[0].groundingCount,0);
 assert.equal(light.targets[0].googleAttempts[0].qualifyingSuggested,1);
 assert.equal(light.targets[0].persisted.verified,0);
});

test('a documented complete ad-free Prime Video subscription is distinct from an ad-free add-on in both modes',async()=>{
 const complete=plan('Prime Video Ad Free',119,{sourceEvidence:'Prime Video Ad Free subscription includes streaming films and series for 119 NOK per month'});
 const addon=plan('Prime Video Ad Free add-on',29,{sourceEvidence:'Ad-free add-on costs 29 NOK per month'});
 const unsupported=plan('Prime Video Without Ads',119,{sourceEvidence:null});
 const unlocated=plan('Prime Video Without Ads',119,{sourceUrl:null,sourceEvidence:'Prime Video Without Ads full subscription plan costs 119 NOK per month'});
 const response=acquisition([plan('Prime Video With Ads',79),complete,addon,unsupported,unlocated]);
 const standardRows=[],suggestedRows=[];
 await runAdminV4FirstResearch({targets:[target],acquireGoogle:async()=>response,
  persistSuggested:async rows=>standardRows.push(...rows),persistVerified:async()=>assert.fail('no verified write'),
  loadSuggested:async()=>[],loadVerified:async()=>[],runDownstream:async()=>({v3Results:{[target.id]:{suggested:[],verified:[],contradictions:[],operationalFailures:[]}}})});
 const light=await runAdminSuggestedOnlyResearch({targets:[target],acquireGoogle:async()=>response,
  persistSuggested:async rows=>suggestedRows.push(...rows),loadVerified:async()=>[]});
 assert.deepEqual(suggestedRows.map(row=>row.planName),['Prime Video With Ads','Prime Video Ad Free']);
 assert.deepEqual(suggestedRows,standardRows.slice(0,2));
 assert.equal(suggestedRows[1].suggested.monthlyPriceMinor,11900);
 assert.equal(suggestedRows[1].suggested.offerScope,'COMPLETE_SUBSCRIPTION');
 assert.equal(light.targets[0].googleRequests,1);
 assert.equal(light.targets[0].persisted.verified,0);
});

test('base and add-on prices alone never fabricate a combined ad-free subscription price',async()=>{
 const stored=[];
 await runAdminSuggestedOnlyResearch({targets:[target],maxGoogleRequests:1,acquireGoogle:async()=>acquisition([
  plan('Prime Video',79),plan('Prime Video Ad Free',29,{sourceEvidence:'Ad-free add-on 29 NOK per month; base subscription sold separately'})
 ]),persistSuggested:async rows=>stored.push(...rows),loadVerified:async()=>[]});
 assert.deepEqual(stored.map(row=>[row.planName,row.suggested.monthlyPriceMinor]),[['Prime Video',7900]]);
});

test('Standard spends one bounded follow-up on a documented compatibility gap and retains V3 isolation',async()=>{
 const first=acquisition([
  plan('Prime Video',79,{sourceEvidence:'Amazon Prime Video base subscription 79 NOK per month',billingProvider:'Amazon'}),
  plan('Prime Video Ad Free add-on',29,{sourceEvidence:'Amazon ad-free add-on costs 29 NOK per month',billingProvider:'Amazon'})
 ]);
 const second=acquisition([plan('Prime Video Without Ads',119,{
  sourceEvidence:'Prime Video Without Ads subscription includes streaming films and series for 119 NOK per month.'
 })]);
 const calls=[],stored=[];
 const result=await runAdminV4FirstResearch({targets:[target],acquireGoogle:async()=>first,
  acquireFollowup:async options=>{calls.push(options);return second;},
  persistSuggested:async rows=>stored.push(...rows),persistVerified:async()=>assert.fail('no V3 Verified evidence'),
  loadSuggested:async()=>[],loadVerified:async()=>[],runDownstream:async()=>({v3Results:{[target.id]:{suggested:[],verified:[],contradictions:[],operationalFailures:[]}}})});
 assert.equal(calls.length,1);
 assert.equal(calls[0].maxRequests,1);
 assert.equal(calls[0].offerFollowupCode,'COMPATIBILITY_UNPROVEN');
 assert.equal(result.targets[0].googleRequests,2);
 assert.equal(result.targets[0].strictGeminiRequests,2);
 assert(result.targets[0].offerFindings.codes.includes('COMPLETE_PLAN_FOUND'));
 assert.deepEqual(stored.map(row=>row.planName).slice(0,2),['Prime Video','Prime Video Without Ads']);
});

test('Google access failure does not claim that no ad-free offer exists',async()=>{
 const failed={status:'GOOGLE_AI_ACCESS_FAILURE',aiResult:null,
  audit:{timestamp:'2026-10-21T12:00:00.000Z',request:{requestCount:1,status:'HTTP_402'}}};
 const result=await runAdminV4FirstResearch({targets:[target],acquireGoogle:async()=>failed,
  acquireFollowup:async()=>assert.fail('access failures do not spend another request'),
  persistSuggested:async()=>assert.fail('no Suggested plan'),persistVerified:async()=>assert.fail('no Verified plan'),
  loadSuggested:async()=>[],loadVerified:async()=>[],runDownstream:async()=>({v3Results:{[target.id]:{suggested:[],verified:[],contradictions:[],operationalFailures:[]}}})});
 assert.deepEqual(result.targets[0].offerFindings.codes,[]);
});

test('Standard records a failed second Google request while preserving the first Suggested plan',async()=>{
 const first=acquisition([
  plan('Prime Video',79,{sourceEvidence:'Amazon Prime Video base subscription 79 NOK per month',billingProvider:'Amazon'}),
  plan('Prime Video Ad Free add-on',29,{sourceEvidence:'Amazon ad-free add-on costs 29 NOK per month',billingProvider:'Amazon'})
 ]);
 const failed={status:'GOOGLE_AI_ACCESS_FAILURE',aiResult:null,audit:{request:{requestCount:1,status:'HTTP_429'}}};
 const stored=[];
 const result=await runAdminV4FirstResearch({targets:[target],acquireGoogle:async()=>first,acquireFollowup:async()=>failed,
  persistSuggested:async rows=>stored.push(...rows),persistVerified:async()=>assert.fail('no Verified write'),
  loadSuggested:async()=>[],loadVerified:async()=>[],runDownstream:async()=>({v3Results:{[target.id]:{suggested:[],verified:[],contradictions:[],operationalFailures:[]}}})});
 assert.equal(result.targets[0].googleRequests,2);
 assert.equal(result.targets[0].strictGeminiRequests,2);
 assert.equal(stored[0].planName,'Prime Video');
 assert(result.targets[0].offerFindings.codes.includes('COMPATIBILITY_UNPROVEN'));
});

test('Suggested Only can combine separate grounded answers but never reuses a prior market receipt',async()=>{
 const b=plan('Prime Video',79,{sourceUrl:'https://www.primevideo.com/no',billingProvider:'Amazon',
  sourceEvidence:'Amazon Prime Video costs 79 NOK per month. An ad-free upgrade is available.'});
 const a=plan('Prime Video Ad Free add-on',29,{sourceUrl:'https://www.primevideo.com/help/ad-free',
  billingProvider:'Amazon',compatibleBasePlan:'Prime Video',
  combinationEvidence:'Amazon bills Prime Video 79 NOK and ad-free 29 NOK together on the same bill for Norway.',
  sourceEvidence:'Amazon ad-free add-on costs 29 NOK per month. Amazon bills Prime Video 79 NOK and ad-free 29 NOK together on the same bill for Norway.'});
 const first=acquisition([b]),second=acquisition([a]);
 first.audit.groundingCitations=[{url:b.sourceUrl}];second.audit.groundingCitations=[{url:a.sourceUrl}];
 const calls=[],stored=[];
 const result=await runAdminSuggestedOnlyResearch({targets:[target],acquireGoogle:async options=>{calls.push(options);return calls.length===1?first:second;},
  persistSuggested:async rows=>stored.push(...rows),loadVerified:async()=>[]});
 assert.equal(calls.length,2);
 assert.equal(calls[1].offerFollowupCode,'BASE_FOUND_ADDON_MISSING');
 assert.deepEqual(stored.map(row=>[row.planName,row.suggested.monthlyPriceMinor]),[
  ['Prime Video',7900],['Prime Video Without Ads (Calculated Total)',10800]]);
 assert.equal(result.targets[0].offerFindings.calculatedCount,1);
 assert.equal(result.targets[0].persisted.verified,0);
 assert.deepEqual(result.targets[0].verificationEvidence,[]);
});

test('both modes persist the same source-linked calculated total without any Verified write',async()=>{
 const base=plan('Prime Video With Ads',79,{sourceUrl:'https://www.primevideo.com/no',sourceEvidence:'Amazon bills Prime Video With Ads for 79 NOK per month',billingProvider:'Amazon'});
 const addon=plan('Prime Video Ad Free add-on',29,{sourceUrl:'https://www.primevideo.com/help/ad-free',
  sourceEvidence:'Amazon ad-free add-on costs 29 NOK per month. Amazon bills Prime Video With Ads 79 NOK and ad-free 29 NOK together on the same bill for Norway.',
  billingProvider:'Amazon',compatibleBasePlan:'Prime Video With Ads',
  combinationEvidence:'Amazon bills Prime Video With Ads 79 NOK and ad-free 29 NOK together on the same bill for Norway.'});
 const response=acquisition([base,addon]),standardRows=[],suggestedRows=[];
 response.audit.groundingCitations=[{url:base.sourceUrl},{url:addon.sourceUrl}];
 await runAdminV4FirstResearch({targets:[target],acquireGoogle:async()=>response,
  persistSuggested:async rows=>standardRows.push(...rows),persistVerified:async()=>assert.fail('calculation is not Verified'),
  loadSuggested:async()=>[],loadVerified:async()=>[],runDownstream:async()=>({v3Results:{[target.id]:{suggested:[],verified:[],contradictions:[],operationalFailures:[]}}})});
 const light=await runAdminSuggestedOnlyResearch({targets:[target],maxGoogleRequests:1,acquireGoogle:async()=>response,
  persistSuggested:async rows=>suggestedRows.push(...rows),loadVerified:async()=>[]});
 assert.deepEqual(suggestedRows,standardRows.slice(0,2));
 assert.deepEqual(suggestedRows.map(row=>[row.planName,row.suggested.monthlyPriceMinor]),
  [['Prime Video With Ads',7900],['Prime Video Without Ads (Calculated Total)',10800]]);
 assert.notEqual(suggestedRows[0].planIdentity,suggestedRows[1].planIdentity);
 assert.equal(suggestedRows[1].suggested.calculation.method,'MONTHLY_BASE_PLUS_AD_FREE_ADD_ON');
 assert.equal(suggestedRows[1].suggested.offerScope,'CALCULATED_TOTAL');
 assert(suggestedRows[1].suggested.warnings.includes('CALCULATED_TOTAL_UNVERIFIED'));
 assert.equal(light.targets[0].persisted.verified,0);
});

test('partial first answer follows up only for a documented unpriced monthly variant and retains both identities',async()=>{
 const first=acquisition([plan('Prime Video With Ads',79),plan('Prime Video Ad Free',null,{
  ordinaryRecurringPrice:null,sourceEvidence:'Prime Video Ad Free full subscription plan is offered monthly, price omitted',marketEvidence:'Available to customers in Norway'
 })]);
 const second=acquisition([plan('Prime Video Ad Free',119,{sourceEvidence:'Prime Video Ad Free full subscription plan costs 119 NOK per month'})]);
 const calls=[],stored=[];
 const result=await runAdminSuggestedOnlyResearch({targets:[target],acquireGoogle:async options=>{calls.push(options);return calls.length===1?first:second;},
  persistSuggested:async rows=>stored.push(...rows),loadVerified:async()=>[]});
 assert.equal(calls.length,2);assert.deepEqual(calls[1].suggestedOnlyCoverageGaps,['Prime Video Ad Free']);
 assert.deepEqual(stored.map(row=>row.planName),['Prime Video With Ads','Prime Video Ad Free']);
 assert.equal(result.targets[0].performance.followupReason,'DOCUMENTED_PRICE_GAP');
 assert.equal(result.targets[0].googleRequests,2);
 assert.equal(result.targets[0].planCounts.suggestedPlans,2);
 assert.equal(result.targets[0].persisted.verified,0);
});

test('a plausible missing tier without source evidence does not spend a second request',async()=>{
 let calls=0;const stored=[];
 const response=acquisition([plan('Prime Video With Ads',79),plan('Prime Video Premium',null,{
  ordinaryRecurringPrice:null,sourceEvidence:null
 })]);
 const result=await runAdminSuggestedOnlyResearch({targets:[target],acquireGoogle:async()=>{calls++;return response;},
  persistSuggested:async rows=>stored.push(...rows),loadVerified:async()=>[]});
 assert.equal(calls,1);assert.deepEqual(stored.map(row=>row.planName),['Prime Video With Ads']);
 assert.equal(result.targets[0].performance.followupReason,null);
});

test('a documented but explicitly wrong-market unpriced tier cannot trigger follow-up',async()=>{
 let calls=0;
 await runAdminSuggestedOnlyResearch({targets:[target],acquireGoogle:async()=>{calls++;return acquisition([
  plan('Prime Video With Ads',79),plan('Prime Video Ad Free',null,{
   ordinaryRecurringPrice:null,sourceEvidence:'Prime Video Ad Free full subscription plan is offered monthly',marketEvidence:'United States only'
  })
 ]);},persistSuggested:async()=>{},loadVerified:async()=>[]});
 assert.equal(calls,1);
});

test('follow-up price conflict cannot replace the first valid plan while an additional tier is retained',async()=>{
 const first=acquisition([plan('Prime Video With Ads',79),plan('Prime Video Ad Free',null,{
  ordinaryRecurringPrice:null,sourceEvidence:'Prime Video Ad Free full subscription plan is offered monthly, price omitted'
 })]);
 const second=acquisition([plan('Prime Video With Ads',99),plan('Prime Video Ad Free',119,{
  sourceEvidence:'Prime Video Ad Free full subscription plan costs 119 NOK per month'
 })]);
 let calls=0;const stored=[];
 const result=await runAdminSuggestedOnlyResearch({targets:[target],acquireGoogle:async()=>++calls===1?first:second,
  persistSuggested:async rows=>stored.push(...rows),loadVerified:async()=>[]});
 assert.equal(calls,2);assert.deepEqual(stored.map(row=>[row.planName,row.suggested.monthlyPriceMinor]),
  [['Prime Video With Ads',7900],['Prime Video Ad Free',11900]]);
 assert.equal(result.targets[0].performance.conflictingVariants,1);
 assert.equal(result.targets[0].performance.qualifyingVariants,2);
});

test('a second-call 429 preserves valid first-call Suggested and records the rate limit',async()=>{
 const first=acquisition([plan('Prime Video With Ads',79),plan('Prime Video Ad Free',null,{
  ordinaryRecurringPrice:null,sourceEvidence:'Prime Video Ad Free full subscription plan is offered monthly, price omitted'
 })]);
 const second=acquisition([],{status:'GOOGLE_AI_ACCESS_FAILURE',aiResult:null,audit:{timestamp:'2026-10-21T12:01:00.000Z',request:{requestCount:1,status:'HTTP_429',runtimeMs:3000}}});
 let calls=0;const stored=[],gateEvents=[];
 const result=await runAdminSuggestedOnlyResearch({targets:[target],acquireGoogle:async()=>++calls===1?first:second,
  persistSuggested:async rows=>stored.push(...rows),loadVerified:async()=>[],googleRequestGate:{before:async()=>gateEvents.push('before'),after:status=>gateEvents.push(status??'success')}});
 assert.equal(calls,2);assert.equal(stored.length,1);assert.equal(stored[0].suggested.monthlyPriceMinor,7900);
 assert.deepEqual(gateEvents,['before','success','before','HTTP_429']);
 assert.equal(result.targets[0].googleAttempts[1].requestStatus,'HTTP_429');
 assert.equal(result.targets[0].googleStatus,'GOOGLE_AI_SUCCESS');
});

test('malformed first answer can use the remaining one-call budget without losing accounting',async()=>{
 let calls=0;const stored=[];
 const malformed={status:'GOOGLE_AI_MALFORMED_RESPONSE',aiResult:null,audit:{timestamp:'2026-10-21T12:00:00.000Z',request:{requestCount:1,status:'MALFORMED_RESPONSE',normalizationFailures:['OUTPUT_JSON_INVALID']}}};
 const result=await runAdminSuggestedOnlyResearch({targets:[target],acquireGoogle:async()=>++calls===1?malformed:acquisition([plan('Prime Video',79)]),
  persistSuggested:async rows=>stored.push(...rows),loadVerified:async()=>[]});
 assert.equal(calls,2);assert.equal(result.targets[0].googleRequests,2);assert.equal(result.targets[0].googleStatus,'GOOGLE_AI_SUCCESS');
 assert.equal(stored.length,1);assert.equal(result.targets[0].googleAttempts[0].responseFailures[0],'OUTPUT_JSON_INVALID');
});

test('explicit wrong-market USD lead is rejected while documented USD pricing for NO is not rejected by currency alone',async()=>{
 const wrong=plan('Prime Video',12,{currency:'USD',ordinaryRecurringPrice:12,marketEvidence:'United States only'});
 const valid=plan('Prime Video',12,{currency:'USD',ordinaryRecurringPrice:12,marketEvidence:'Available to customers in Norway'});
 const rejected=[];await runAdminSuggestedOnlyResearch({targets:[target],maxGoogleRequests:1,acquireGoogle:async()=>acquisition([wrong]),
  persistSuggested:async rows=>rejected.push(...rows),loadVerified:async()=>[]});
 const accepted=[];await runAdminSuggestedOnlyResearch({targets:[target],maxGoogleRequests:1,acquireGoogle:async()=>acquisition([valid]),
  persistSuggested:async rows=>accepted.push(...rows),loadVerified:async()=>[]});
 assert.equal(rejected.length,0);assert.equal(accepted.length,1);assert.equal(accepted[0].suggested.currency,'USD');
});

test('persistence failure fails the target and never invokes a Verified writer',async()=>{
 await assert.rejects(runAdminSuggestedOnlyResearch({targets:[target],acquireGoogle:async()=>acquisition([plan('Prime Video',79)]),
  persistSuggested:async()=>{throw Error('DISPOSABLE_DB_UNAVAILABLE');},loadVerified:async()=>assert.fail('no read after failed write')}),/DISPOSABLE_DB_UNAVAILABLE/);
});
