import test from 'node:test';
import assert from 'node:assert/strict';
import {googleAiDefaults,researchMonthlyRecurringWithGoogleAi} from './monthly-recurring.mjs';
import {verifyCandidates,buildSuggested} from './v4-normalization.mjs';

const secret='test-secret-that-must-not-be-returned';
const basePlan={planName:'Individual',amount:10.99,currency:'EUR',paymentCadence:'MONTHLY_RECURRING',commitment:'NONE',ordinaryRecurringPrice:10.99,introPrice:null,introDuration:null,sourceUrl:'https://example.test/de/pricing',sourceEvidence:'Individual EUR 10.99 monthly',marketEvidence:'Germany',billingBasis:'charged monthly',annualOnly:false,freeTier:false,summary:'Monthly subscription',warnings:[]};
const payload=(plans=[basePlan],overrides={})=>({provider:'Example',market:'DE',plans,sources:[{title:'Pricing',url:'https://example.test/de/pricing'}],warnings:[],...overrides});
const generated=(value,overrides={})=>({responseId:'response-test',candidates:[{content:{parts:[{text:typeof value==='string'?value:JSON.stringify(value)}]},finishReason:'STOP',groundingMetadata:{groundingChunks:[{web:{title:'Grounded source',uri:'https://example.test/de/pricing'}}]}}],usageMetadata:{promptTokenCount:10,candidatesTokenCount:20,thoughtsTokenCount:5,totalTokenCount:35},...overrides});
const response=value=>new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
const run=async(value,seen=[])=>researchMonthlyRecurringWithGoogleAi({providerName:'Example',targetMarket:'DE',apiKey:secret,fetchImpl:async(url,init)=>{seen.push({url,init});return response(typeof value==='function'?value(seen.length):value);},clock:(()=>{let n=0;return()=>`2026-10-13T00:00:0${n++}.000Z`;})()});

test('clean JSON preserves multiple plans, citations, intro and ordinary prices',async()=>{
 assert.equal(googleAiDefaults.timeoutMs,120_000);
 const annual={...basePlan,planName:'Annual',amount:6.25,ordinaryRecurringPrice:6.25,paymentCadence:'ANNUAL',commitment:'ANNUAL',billingBasis:'annual equivalent',annualOnly:true};
 const intro={...basePlan,planName:'Plus',amount:12.99,ordinaryRecurringPrice:12.99,introPrice:1.99,introDuration:'one month'};
 const seen=[],result=await run(generated(payload([basePlan,intro,annual])),seen);
 assert.equal(result.status,'GOOGLE_AI_SUCCESS');assert.equal(result.aiResult.plans.length,3);assert.equal(result.aiResult.plans[1].introPrice,1.99);assert.equal(result.audit.citations.length,1);assert.equal(result.audit.request.usage.totalTokens,35);
 const verified=verifyCandidates({providerName:'Example',targetMarket:'DE',aiResult:result.aiResult,sources:[]}),normalized=buildSuggested({providerName:'Example',targetMarket:'DE',aiResult:result.aiResult,verificationResults:verified});
 assert.deepEqual(normalized.suggested.map(row=>row.plan),['Individual','Plus']);assert.equal(normalized.diagnostics[0].reason,'NOT_MONTHLY_RECURRING');
 assert.equal(seen.length,1);assert.match(seen[0].url,/gemini-3\.5-flash-lite:generateContent$/);assert.equal(result.audit.model,'gemini-3.5-flash-lite');assert.equal(seen[0].init.headers['x-goog-api-key'],secret);assert.equal(JSON.stringify(result).includes(secret),false);
 const body=JSON.parse(seen[0].init.body);assert.deepEqual(body.tools,[{googleSearch:{}}]);assert.equal(body.generationConfig.maxOutputTokens,8192);assert.equal('responseFormat' in body.generationConfig,false);assert.equal('responseSchema' in body.generationConfig,false);
 const prompt=body.contents[0].parts[0].text;assert.doesNotMatch(prompt,/For Suggested Only/);assert.match(prompt,/provider must be the exact researched service name "Example"/);
});

test('provider means the researched service, while a parent-company label remains invalid',async()=>{
 const seen=[];
 const result=await researchMonthlyRecurringWithGoogleAi({providerName:'YouTube Premium',targetMarket:'SE',apiKey:secret,maxRequests:1,
  fetchImpl:async(_url,init)=>{seen.push(JSON.parse(init.body));return response(generated(payload([basePlan],{provider:'Google / YouTube',market:'SE'})));}});
 assert.match(seen[0].contents[0].parts[0].text,/provider must be the exact researched service name "YouTube Premium"/);
 assert.equal(result.status,'GOOGLE_AI_MALFORMED_RESPONSE');
 assert.deepEqual(result.audit.request.normalizationFailures,['PROVIDER_INVALID']);
 assert.equal(result.audit.request.requestCount,1);
 const corrected=await researchMonthlyRecurringWithGoogleAi({providerName:'YouTube Premium',targetMarket:'SE',apiKey:secret,maxRequests:1,
  fetchImpl:async()=>response(generated(payload([basePlan],{provider:'YouTube Premium',market:'SE'})))});
 assert.equal(corrected.status,'GOOGLE_AI_SUCCESS');
 assert.equal(corrected.audit.request.requestCount,1);
});

test('json markdown fence is the only wrapper removed before parsing',async()=>{
 const result=await run(generated(`\`\`\`json\n${JSON.stringify(payload())}\n\`\`\``));assert.equal(result.status,'GOOGLE_AI_SUCCESS');assert.equal(result.audit.request.requestCount,1);
});

test('malformed JSON uses exactly one refinement with objective and validation error',async()=>{
 const seen=[],result=await run(count=>count===1?generated('not-json'):generated(payload()),seen);assert.equal(result.status,'GOOGLE_AI_SUCCESS');assert.equal(seen.length,2);assert.equal(result.audit.request.requestCount,2);
 const refinement=JSON.parse(seen[1].init.body).contents[0].parts[0].text;assert.match(refinement,/OUTPUT_JSON_INVALID/);assert.match(refinement,/Return valid JSON only/);assert.doesNotMatch(refinement,/not-json/);
});

test('structurally invalid JSON uses one refinement and does not silently repair',async()=>{
 const invalid=payload([{...basePlan,ordinaryRecurringPrice:'10.99'}]),seen=[];
 const result=await run(count=>count===1?generated(invalid):generated(payload()),seen);assert.equal(result.status,'GOOGLE_AI_SUCCESS');assert.equal(seen.length,2);assert.match(JSON.parse(seen[1].init.body).contents[0].parts[0].text,/ORDINARYRECURRINGPRICE_INVALID/);
});

test('failed refinement returns malformed response and retains metadata citations',async()=>{
 const seen=[],result=await run(generated('not-json'),seen);assert.equal(result.status,'GOOGLE_AI_MALFORMED_RESPONSE');assert.equal(seen.length,2);assert.equal(result.audit.request.requestCount,2);assert.equal(result.audit.citations[0].url,'https://example.test/de/pricing');assert.equal(JSON.stringify(result).includes(secret),false);
});

test('annual equivalent is excluded from Suggested while intro stays separate',async()=>{
 const annual={...basePlan,planName:'Annual',paymentCadence:'ANNUAL',billingBasis:'billed annually; displayed per month',annualOnly:true};
 const intro={...basePlan,planName:'Plus',amount:12.99,ordinaryRecurringPrice:12.99,introPrice:1.99,introDuration:'one month'};
 const result=await run(generated(payload([annual,intro]))),verified=verifyCandidates({providerName:'Example',targetMarket:'DE',aiResult:result.aiResult,sources:[]}),normalized=buildSuggested({providerName:'Example',targetMarket:'DE',aiResult:result.aiResult,verificationResults:verified});
 assert.deepEqual(normalized.suggested.map(row=>row.plan),['Plus']);assert.equal(normalized.suggested[0].introPrice,1.99);assert.equal(normalized.diagnostics[0].reason,'NOT_MONTHLY_RECURRING');
});

test('grounding citations are normalized independently from model JSON sources',async()=>{
 const value=payload([basePlan],{sources:[]}),result=await run(generated(value));assert.equal(result.aiResult.sources.length,1);assert.equal(result.aiResult.sources[0].url,'https://example.test/de/pricing');assert.deepEqual(result.aiResult.plans[0].sourceReferences,['https://example.test/de/pricing']);
});

test('legitimate empty plan result is no price, not malformed',async()=>{
 const result=await run(generated(payload([])));assert.equal(result.status,'GOOGLE_AI_NO_PRICE');assert.equal(result.audit.request.requestCount,1);
});

test('Suggested Only follow-up is a distinct grounded monthly search that does not restrict distributors to official hosts',async()=>{
 const seen=[];
 const result=await researchMonthlyRecurringWithGoogleAi({providerName:'Example',targetMarket:'DE',apiKey:secret,
  providerNamespace:null,suggestedOnlyMode:true,suggestedOnlyFollowup:true,suggestedOnlyCoverageGaps:['Ad Free'],maxRequests:1,
  fetchImpl:async(_url,init)=>{seen.push(JSON.parse(init.body));return response(generated(payload([])));}});
 assert.equal(result.audit.request.requestCount,1);assert.equal(seen.length,1);
 const prompt=seen[0].contents[0].parts[0].text;
 assert.match(prompt,/documented country-local distributors/);
 assert.match(prompt,/previously documented but unpriced variants: Ad Free/);
 for(const term of ['Basic','Standard','Premium','Individual','Family','ad-supported','ad-free','annual-upfront'])assert(prompt.includes(term),term);
 assert.doesNotMatch(prompt,/In sources, return only HTTPS URLs on/);
 assert.deepEqual(seen[0].tools,[{googleSearch:{}}]);
});

test('transport and HTTP failures are sanitized access failures without retrying',async()=>{
 const thrown=await researchMonthlyRecurringWithGoogleAi({providerName:'Example',targetMarket:'DE',apiKey:secret,fetchImpl:async()=>{throw Error(secret);}});assert.equal(thrown.status,'GOOGLE_AI_ACCESS_FAILURE');assert.equal(thrown.audit.request.requestCount,1);assert.equal(JSON.stringify(thrown).includes(secret),false);
 const denied=await researchMonthlyRecurringWithGoogleAi({providerName:'Example',targetMarket:'DE',apiKey:secret,fetchImpl:async()=>new Response('{}',{status:403})});assert.equal(denied.status,'GOOGLE_AI_ACCESS_FAILURE');assert.equal(denied.audit.request.status,'HTTP_403');
});

test('timeout and rate limit retain bounded failure accounting without exposing response text',async()=>{
 const timedOut=await researchMonthlyRecurringWithGoogleAi({providerName:'Example',targetMarket:'DE',apiKey:secret,maxRequests:1,
  fetchImpl:async()=>{throw new DOMException('private timeout detail','TimeoutError');}});
 assert.equal(timedOut.status,'GOOGLE_AI_ACCESS_FAILURE');assert.equal(timedOut.audit.request.status,'TRANSPORT_FAILURE');assert.equal(timedOut.audit.request.requestCount,1);
 const limited=await researchMonthlyRecurringWithGoogleAi({providerName:'Example',targetMarket:'DE',apiKey:secret,maxRequests:1,
  fetchImpl:async()=>new Response('private body',{status:429})});
 assert.equal(limited.audit.request.status,'HTTP_429');assert.equal(limited.audit.request.requestCount,1);
 assert.equal(JSON.stringify([timedOut,limited]).includes('private'),false);
});

test('missing credential is explicit and performs no transport',async()=>{
 let calls=0;const result=await researchMonthlyRecurringWithGoogleAi({providerName:'Example',targetMarket:'DE',apiKey:null,fetchImpl:async()=>{calls++;}});assert.equal(result.status,'GOOGLE_AI_ACCESS_FAILURE');assert.equal(result.audit.request.status,'CREDENTIAL_UNAVAILABLE');assert.equal(calls,0);
});
