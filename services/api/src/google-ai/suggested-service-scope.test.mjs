import test from 'node:test';
import assert from 'node:assert/strict';
import {runAdminSuggestedOnlyResearch,runAdminV4FirstResearch} from './admin-live-pipeline.mjs';
import {normalizeGoogleAiResponse} from './monthly-recurring.mjs';

const currencies={US:'USD',NO:'NOK',DK:'DKK',SE:'SEK',DE:'EUR',ES:'EUR'};
const candidate=(planName,amount,market,overrides={})=>({planName,amount,ordinaryRecurringPrice:amount,currency:currencies[market],paymentCadence:'MONTHLY',billingBasis:'per month',annualOnly:false,freeTier:false,commitment:null,sourceUrl:'https://www.amazon.com/prime',sourceEvidence:`${planName} monthly subscription`,marketEvidence:`Available in ${market}`,summary:'Standalone membership',...overrides});
const answer=(market,plans)=>({status:'GOOGLE_AI_SUCCESS',aiResult:{provider:'Amazon Prime',market,plans,sources:[],warnings:[],timestamp:'2026-10-22T00:00:00.000Z',requestCount:1},audit:{timestamp:'2026-10-22T00:00:00.000Z',request:{requestCount:1,status:'SUCCESS'},groundingCitations:[]}});
const target=market=>({id:`price-research:amazon-prime:${market}`,service:'amazon-prime',serviceName:'Amazon Prime',market});

test('a structurally valid Google answer may contain a sibling price, but the shared projection does not persist it',async()=>{
 const rawPlans=[candidate('Amazon Prime Monthly',14.99,'US'),candidate('Prime Video Standalone Monthly',8.99,'US')].map(row=>({planName:row.planName,amount:row.amount,currency:row.currency,paymentCadence:row.paymentCadence,commitment:row.commitment,ordinaryRecurringPrice:row.ordinaryRecurringPrice,introPrice:null,introDuration:null,sourceUrl:row.sourceUrl,sourceEvidence:row.sourceEvidence,marketEvidence:row.marketEvidence,billingBasis:row.billingBasis,annualOnly:false,freeTier:false,summary:row.summary,warnings:[]}));
 const response={candidates:[{content:{parts:[{text:JSON.stringify({provider:'Amazon Prime',market:'US',plans:rawPlans,sources:[],warnings:[]})}]},finishReason:'STOP'}]};
 const normalized=normalizeGoogleAiResponse(response,{providerName:'Amazon Prime',targetMarket:'US',query:'offline fixture',model:'gemini-test',requestCount:1,startedAt:'2026-10-22T00:00:00.000Z',finishedAt:'2026-10-22T00:00:00.000Z'});
 assert.equal(normalized.aiResult.provider,'Amazon Prime');assert.equal(normalized.aiResult.plans.length,2);
 const stored=[];await runAdminSuggestedOnlyResearch({targets:[target('US')],maxGoogleRequests:1,acquireGoogle:async()=>normalized,persistSuggested:async rows=>stored.push(...rows),loadVerified:async()=>[]});
 assert.deepEqual(stored.map(row=>row.planName),['Amazon Prime Monthly']);
});

for(const market of Object.keys(currencies))test(`Amazon Prime ${market}: both modes reject sibling Prime Video and retain distinct membership tiers`,async()=>{
 const selected=target(market),plans=[candidate('Amazon Prime Monthly',14.99,market),candidate('Prime Student Monthly',7.49,market,{summary:'Student discount membership'}),candidate('Prime Video Standalone Monthly',8.99,market,{sourceUrl:'https://www.primevideo.com/'})],input=answer(market,plans);
 const standardRows=[],suggestedRows=[];
 const standard=await runAdminV4FirstResearch({targets:[selected],acquireGoogle:async()=>input,persistSuggested:async rows=>standardRows.push(...rows),persistVerified:async()=>assert.fail('unexpected Verified write'),loadSuggested:async()=>[],loadVerified:async()=>[],runDownstream:async()=>({v3Results:{[selected.id]:{suggested:[],verified:[],contradictions:[],operationalFailures:[]}}})});
 const light=await runAdminSuggestedOnlyResearch({targets:[selected],maxGoogleRequests:1,acquireGoogle:async()=>input,persistSuggested:async rows=>suggestedRows.push(...rows),loadVerified:async()=>[]});
 assert.deepEqual(standardRows.slice(0,2),suggestedRows);
 assert.deepEqual(suggestedRows.map(row=>row.planName),['Amazon Prime Monthly','Prime Student Monthly']);
 assert(suggestedRows.every(row=>row.serviceSlug==='amazon-prime'&&row.countryCode===market&&row.suggested.currency===currencies[market]));
 assert.notEqual(suggestedRows[0].planIdentity,suggestedRows[1].planIdentity);
 assert(suggestedRows[1].suggested.warnings.includes('ELIGIBILITY_RESTRICTED'));
 assert(!suggestedRows[0].suggested.warnings.includes('ELIGIBILITY_RESTRICTED'));
 assert.equal(light.targets[0].googleAttempts[0].rejected.SIBLING_SERVICE,1);
 assert.equal(light.targets[0].persisted.verified,0);
 assert.equal(standard.targets[0].earlySuggestedPersisted,2);
});

test('ambiguous discounted membership and Prime Video add-ons cannot become standard Amazon Prime prices',async()=>{
 const selected=target('US'),stored=[];
 const input=answer('US',[
  candidate('Amazon Prime',6.99,'US',{summary:'Student discount membership'}),
  candidate('Amazon Prime',7.49,'US',{sourceEvidence:'Prime Student membership $7.49 per month'}),
  candidate('Prime Video Ad Free',2.99,'US'),
  candidate('Prime Video Channels',4.99,'US'),
  candidate('Amazon Prime + Prime Video partner bundle',19.99,'US'),
  candidate('Amazon Prime Monthly',8.99,'US',{sourceUrl:'https://www.primevideo.com/'}),
  candidate('Amazon Prime',14.99,'US',{summary:'Standalone membership including Prime Video benefits'})
 ]);
 const result=await runAdminSuggestedOnlyResearch({targets:[selected],maxGoogleRequests:1,acquireGoogle:async()=>input,persistSuggested:async rows=>stored.push(...rows),loadVerified:async()=>[]});
 assert.deepEqual(stored.map(row=>row.suggested.monthlyPriceMinor),[1499]);
 assert.equal(result.targets[0].googleAttempts[0].rejected.CONDITIONAL_IDENTITY_UNCLEAR,2);
 assert.equal(result.targets[0].googleAttempts[0].rejected.SIBLING_SERVICE,4);
 assert.equal(result.targets[0].persisted.verified,0);
});

test('a sibling-only Amazon Prime answer cannot persist and retains the two-request Suggested Only ceiling',async()=>{
 const selected=target('DK');let calls=0,writes=0;
 const result=await runAdminSuggestedOnlyResearch({targets:[selected],acquireGoogle:async()=>{calls++;return answer('DK',[candidate('Prime Video',69,'DK')]);},persistSuggested:async()=>{writes++;},loadVerified:async()=>[]});
 assert.equal(calls,2);assert.equal(writes,0);assert.equal(result.targets[0].persisted.suggestedPlans,0);
 assert.equal(result.targets[0].capabilityUsage.googleAiRequests,2);
 assert.equal(result.targets[0].capabilityUsage.directAttempts,0);
 assert.equal(result.targets[0].capabilityUsage.decodoAttempts,0);
});
