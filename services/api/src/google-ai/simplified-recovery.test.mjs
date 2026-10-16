import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSimplifiedRecovery,simplifiedRecoveryEligibility,simplifiedRecoveryPrompt} from './simplified-recovery.mjs';
import {researchMonthlyRecurringWithRecovery} from './monthly-recurring.mjs';
import {runAdminV4FirstResearch} from './admin-live-pipeline.mjs';
import {verifyCandidates,buildSuggested} from './v4-normalization.mjs';
import {productPriceRows} from '../../../../packages/contracts/src/product-pricing.ts';
import {providerRoutingAuthority} from '../research-v2/live/provider-routing-authority.mjs';

const provider='Example',market='DE',official='https://provider.example/pricing',outside='https://publisher.example/article';
const strictPlan={planName:'Core',amount:9.99,currency:'EUR',paymentCadence:'MONTHLY_RECURRING',commitment:null,ordinaryRecurringPrice:9.99,introPrice:null,introDuration:null,sourceUrl:official,sourceEvidence:null,marketEvidence:null,billingBasis:'charged monthly',annualOnly:false,freeTier:false,summary:null,warnings:[]};
const strict=(plans=[strictPlan])=>({provider,market,plans,sources:[],warnings:[]});
const recovery=(plans=[],sources=[])=>({plans,sources});
const row=(context,extra={})=>({planName:'Core',amount:9.99,currency:'EUR',billingCadence:'monthly',supportingContext:context,sourceUrl:official,...extra});
const generated=value=>({candidates:[{content:{parts:[{text:typeof value==='string'?value:JSON.stringify(value)}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:12,candidatesTokenCount:24,totalTokenCount:36}});
const response=value=>new Response(JSON.stringify(generated(value)),{status:200,headers:{'content-type':'application/json'}});
const options=fetchImpl=>({providerName:provider,targetMarket:market,apiKey:'fixture-secret',fetchImpl,clock:(()=>{let n=0;return()=>new Date(Date.UTC(2026,0,1,0,0,n++)).toISOString();})()});

for(const [label,plans,status] of [['usable strict plans',[strictPlan],'GOOGLE_AI_SUCCESS'],['valid empty strict result',[],'GOOGLE_AI_NO_PRICE']])test(`${label} never invokes simplified recovery`,async()=>{
 let calls=0;const result=await researchMonthlyRecurringWithRecovery(options(async()=>{calls++;return response(strict(plans));}));
 assert.equal(result.status,status);assert.equal(calls,1);assert.equal(result.recovery.requestCount,0);assert.equal(result.recovery.outcome,'NOT_ELIGIBLE');
});

test('malformed strict output makes two strict requests and exactly one simplified recovery request',async()=>{
 const bodies=[];const result=await researchMonthlyRecurringWithRecovery(options(async(_url,init)=>{bodies.push(JSON.parse(init.body));return bodies.length<3?response('not-json'):response(recovery([row('EUR 9.99 monthly')]));}));
 assert.equal(result.status,'GOOGLE_AI_MALFORMED_RESPONSE');assert.equal(result.audit.request.requestCount,2);assert.deepEqual(result.audit.request.normalizationFailures,['OUTPUT_JSON_INVALID']);
 assert.equal(result.recovery.reason,'STRICT_NORMALIZATION_FAILED');assert.equal(result.recovery.outcome,'RECOVERY_CANDIDATES');assert.equal(result.recovery.requestCount,1);assert.equal(bodies.length,3);
 assert.match(bodies[2].contents[0].parts[0].text,/actually charged each month/);assert.doesNotMatch(bodies[2].contents[0].parts[0].text,/exactly these top-level fields/);
 assert.equal(result.recovery.aiResult.plans[0].paymentCadence,'MONTHLY_RECURRING');assert.equal(JSON.stringify(result).includes('fixture-secret'),false);
});

test('transport failure permits one recovery; credential and policy failures do not',async()=>{
 let calls=0;const result=await researchMonthlyRecurringWithRecovery(options(async()=>{calls++;if(calls===1)throw Error('private transport detail');return response(recovery([row('EUR 9.99 billed monthly')]));}));
 assert.equal(result.status,'GOOGLE_AI_ACCESS_FAILURE');assert.equal(result.audit.request.status,'TRANSPORT_FAILURE');assert.equal(result.recovery.requestCount,1);assert.equal(calls,2);
 let denied=0;const policy=await researchMonthlyRecurringWithRecovery(options(async()=>{denied++;return new Response('{}',{status:403});}));assert.equal(policy.recovery.requestCount,0);assert.equal(denied,1);
 const missing=await researchMonthlyRecurringWithRecovery({...options(async()=>assert.fail('no transport')),apiKey:null});assert.equal(missing.recovery.requestCount,0);
 assert.deepEqual(simplifiedRecoveryEligibility({status:'GOOGLE_AI_MALFORMED_RESPONSE',aiResult:null,audit:{request:{requestCount:2,status:'NORMALIZATION_FAILED'}}},{maxTotalRequests:2}),{eligible:false,reason:'RECOVERY_BUDGET_UNAVAILABLE'});
});

test('one HTTP 503 strict failure recovers only inside the combined request budget',async()=>{
 let calls=0;const result=await researchMonthlyRecurringWithRecovery(options(async()=>{calls++;return calls===1?new Response('{}',{status:503}):response(recovery([row('EUR 9.99 billed monthly')]));}));
 assert.equal(result.recovery.requestCount,1);assert.equal(calls,2);
 let limitedCalls=0;const limited=await researchMonthlyRecurringWithRecovery({...options(async()=>{limitedCalls++;return new Response('{}',{status:503});}),maxTotalRequests:1});assert.equal(limited.recovery.requestCount,0);assert.equal(limitedCalls,1);
});

for(const [label,context,allowed] of [
 ['actual monthly billing','EUR 9.99 monthly',true],
 ['annual equivalent','EUR 119.88/year, equivalent to EUR 9.99/month',false],
 ['monthly display billed annually','EUR 9.99/month billed annually',false],
 ['ambiguous cadence','EUR 9.99 for a subscription',false]
])test(`simplified parser handles ${label}`,()=>{
 const result=parseSimplifiedRecovery(generated(recovery([row(context,{billingCadence:label==='ambiguous cadence'?null:'monthly'})])),{providerName:provider,targetMarket:market,timestamp:'2026-01-01T00:00:00Z'});
 assert.equal(result.aiResult.plans.length,allowed?1:0);
 assert.equal(result.aiResult.sources[0].url,official);
});

test('recovery parser accepts a 12-month commitment paid monthly and rejects unsupported target or price',()=>{
 const accepted=parseSimplifiedRecovery(generated(recovery([row('12-month commitment; EUR 9.99 billed monthly')])),{providerName:provider,targetMarket:market,timestamp:'2026-01-01T00:00:00Z'});assert.equal(accepted.aiResult.plans.length,1);
 const invalid=parseSimplifiedRecovery(generated(recovery([row('EUR 9.99 monthly',{currency:'???'}),row('EUR 9.99 monthly',{market:'FR'})])),{providerName:provider,targetMarket:market,timestamp:'2026-01-01T00:00:00Z'});assert.equal(invalid.aiResult.plans.length,0);
 assert.equal(simplifiedRecoveryPrompt(provider,market).includes('annual totals divided by 12'),true);
});

test('failed recovery makes no retry loop and leaves downstream research runnable',async()=>{
 let calls=0,downstream=0;const store={persistSuggested:async()=>{},loadSuggested:async()=>[],persistVerified:async()=>{},loadVerified:async()=>[]};
 const result=await runAdminV4FirstResearch({targets:[{id:'price-research:example:DE',service:'example',serviceName:provider,market}],apiKey:'fixture-secret',acquireGoogle:args=>researchMonthlyRecurringWithRecovery({...options(async()=>{calls++;return calls<3?response('not-json'):response('also not-json');}),providerName:args.providerName,targetMarket:args.targetMarket}),...store,runDownstream:async({handoffs})=>{downstream++;assert.equal(handoffs['price-research:example:DE'].researchLeads.truthAuthority,'NONE');return {result:{},v3Results:{'price-research:example:DE':{suggested:[],verified:[],contradictions:[],operationalFailures:[]}}};}});
 assert.equal(calls,3);assert.equal(downstream,1);assert.equal(result.targets[0].simplifiedRecoveryRequests,1);assert.equal(result.targets[0].googleRequests,3);assert.equal(result.targets[0].recoveryOutcome,'RECOVERY_OUTPUT_INVALID');
});

test('recovery URLs stay discovery-only, while Verified and the personal price remain separate',async()=>{
 let handoff,stored=[];const existing={planName:'Core',monthlyPriceMinor:1299,currency:'EUR',serviceSlug:'example',sourceUrl:official,updatedAt:'2026-01-01T00:00:00Z'};
 const result=await runAdminV4FirstResearch({targets:[{id:'price-research:example:DE',service:'example',serviceName:provider,market}],apiKey:'fixture-secret',acquireGoogle:args=>researchMonthlyRecurringWithRecovery({...options(async()=>response('not-json')),providerName:args.providerName,targetMarket:args.targetMarket,fetchImpl:(()=>{let n=0;return async()=>{n++;return n<3?response('not-json'):response(recovery([row('EUR 9.99 monthly')],[{url:outside}]));};})()}),persistSuggested:async plans=>{stored=plans;},loadSuggested:async()=>stored,persistVerified:async()=>assert.fail('recovery cannot persist Verified'),loadVerified:async()=>[existing],runDownstream:async({handoffs})=>{handoff=handoffs['price-research:example:DE'];return {result:{},v3Results:{'price-research:example:DE':{suggested:[],verified:[],contradictions:[],operationalFailures:[]}}};}});
 const final=result.targets[0],plan=stored[0];assert.equal(final.earlySuggestedPersisted,1);assert.equal(final.persisted.verified,0);assert.equal(final.combined.plans[0].activeTruthAuthority,'VERIFIED');assert.equal(final.combined.plans[0].activePrice.amount,12.99);assert.equal(handoff.researchLeads.candidatePlans[0].truthAuthority,'NONE');
 assert(handoff.adaptiveTargetPatch.urls.includes(official));assert(handoff.adaptiveTargetPatch.urls.includes(outside));assert(handoff.adaptiveTargetPatch.leads.every(lead=>lead.truthAuthority==='NONE'&&lead.authoritative===false));
 assert.equal(providerRoutingAuthority({service:'example',serviceName:provider,authorities:[]},outside),null);
 const view=productPriceRows({...plan,verified:[{monthlyPriceMinor:1299,currency:'EUR',paymentCadence:'MONTHLY_RECURRING',warnings:[],provenance:'VERIFIED'}]},1599,'EUR');assert.deepEqual(view.rows.map(item=>item.label),['Suggested','Verified','Your price']);assert.equal(view.providerPriceAuthority,'VERIFIED');assert.equal(view.effectivePersonalMonthlyPriceMinor,1599);
});

test('normalization diagnostics remain bounded and contain no model text',async()=>{
 const hostile='private payload '.repeat(20000);const result=await researchMonthlyRecurringWithRecovery({...options(async()=>response(hostile)),maxTotalRequests:2});
 assert.equal(result.recovery.requestCount,0);assert(result.audit.request.normalizationFailures.length<=8);assert(result.audit.request.normalizationFailures.every(value=>value.length<=80&&/^[A-Z0-9_]+$/.test(value)));assert.equal(JSON.stringify(result).includes('private payload'),false);
});

test('source-only simplified response retains URLs without creating a Suggested price',()=>{
 const result=parseSimplifiedRecovery(generated({sources:[{url:official},{url:outside}]}),{providerName:provider,targetMarket:market,timestamp:'2026-01-01T00:00:00Z'});
 assert.equal(result.outcome,'RECOVERY_URLS_ONLY');assert.deepEqual(result.aiResult.plans,[]);assert.deepEqual(result.aiResult.sources.map(item=>item.url),[official,outside]);
});

test('simple decimal string is parsed without calculating an annual equivalent',()=>{
 const monthlyResult=parseSimplifiedRecovery(generated(recovery([row('EUR 9.99 charged monthly',{amount:'9.99'})])),{providerName:provider,targetMarket:market,timestamp:'2026-01-01T00:00:00Z'});
 assert.equal(monthlyResult.aiResult.plans[0].amount,9.99);
 const annualResult=parseSimplifiedRecovery(generated(recovery([row('EUR 119.88 for 12 months, EUR 9.99/month',{amount:'9.99'})])),{providerName:provider,targetMarket:market,timestamp:'2026-01-01T00:00:00Z'});
 assert.deepEqual(annualResult.aiResult.plans,[]);
});

test('source-light monthly candidate remains Suggested while contradictory annual billing is rejected',async()=>{
 const accepted=parseSimplifiedRecovery(generated(recovery([row('EUR 9.99 billed monthly',{sourceUrl:null,actualMonthlyBilling:true})])),{providerName:provider,targetMarket:market,timestamp:'2026-01-01T00:00:00Z'});
 assert.equal(accepted.aiResult.plans.length,1);assert.equal(accepted.aiResult.plans[0].sourceUrl,null);
 const suggestions=buildSuggested({providerName:provider,targetMarket:market,aiResult:accepted.aiResult,verificationResults:verifyCandidates({providerName:provider,targetMarket:market,aiResult:accepted.aiResult,sources:[]})});assert.equal(suggestions.suggested.length,1);
 const rejected=parseSimplifiedRecovery(generated(recovery([row('EUR 9.99/month billed annually',{actualMonthlyBilling:true})])),{providerName:provider,targetMarket:market,timestamp:'2026-01-01T00:00:00Z'});
 assert.deepEqual(rejected.aiResult.plans,[]);
});

test('explicit Gemini policy block performs neither strict refinement nor recovery',async()=>{
 let calls=0;const blocked={promptFeedback:{blockReason:'SAFETY'},candidates:[{finishReason:'SAFETY'}]};
 const result=await researchMonthlyRecurringWithRecovery(options(async()=>{calls++;return new Response(JSON.stringify(blocked),{status:200});}));
 assert.equal(calls,1);assert.equal(result.status,'GOOGLE_AI_ACCESS_FAILURE');assert.equal(result.audit.request.status,'POLICY_BLOCK');assert.deepEqual(result.audit.request.normalizationFailures,['POLICY_BLOCK']);assert.equal(result.recovery.requestCount,0);assert.equal(result.recovery.reason,'STRICT_POLICY_OR_CREDENTIAL_BLOCK');
});
