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
  plan('Prime Video',79),plan('Amazon Prime membership',89),plan('Prime Video Channels',29),
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
 assert.equal(light.targets[0].googleAttempts[0].rejected.NON_STANDALONE,4);
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
