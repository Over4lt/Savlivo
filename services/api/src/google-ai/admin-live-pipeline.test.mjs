import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeProductPlans} from '../product-pricing.ts';
import {runAdminV4FirstResearch,v3ResultFromTarget} from './admin-live-pipeline.mjs';
import {digest} from '../research-v3/model.mjs';
import {reviewedProviderNamespacesFor} from '../research-v3/reviewed-provider-namespaces.mjs';
import {buildGoogleAiQuery} from './v4-query.mjs';

const target={id:'example-price-DE',service:'example',serviceName:'Example',market:'DE'};
const plan={planName:'Individual',amount:10.99,currency:'EUR',paymentCadence:'MONTHLY_RECURRING',commitment:'NONE',ordinaryRecurringPrice:10.99,introPrice:null,introDuration:null,sourceUrl:'https://example.test/de/pricing',sourceEvidence:'Individual EUR 10.99 monthly',marketEvidence:'Germany',billingBasis:'charged monthly',annualOnly:false,freeTier:false,summary:'Monthly subscription',warnings:[],market:'DE',sourceReferences:['https://example.test/de/pricing']};
const acquisition=(status='GOOGLE_AI_SUCCESS',plans=[plan])=>({status,aiResult:status==='GOOGLE_AI_ACCESS_FAILURE'?null:{provider:'Example',market:'DE',plans,sources:[{title:'Pricing',url:plan.sourceUrl}],warnings:[],timestamp:'2026-10-13T00:00:00.000Z',requestCount:1},audit:{schemaVersion:1,query:'bounded query',researchProvider:'GOOGLE_GEMINI_API_SEARCH_GROUNDED',model:'gemini-test',timestamp:'2026-10-13T00:00:00.000Z',normalizedAnswer:null,citations:[],request:{requestCount:status==='GOOGLE_AI_ACCESS_FAILURE'?0:1,status}}});
const v3Suggested=(amount=11.99)=>({provider:'Example',market:'DE',plan:'Individual',amount,currency:'EUR',paymentCadence:'MONTHLY_RECURRING',billingRoute:null,sourceUrl:'https://example.test/de/pricing',acquiredAt:'2026-10-13T00:01:00.000Z',provenance:'V3_SOURCE_RESEARCH',researchEvidence:{acquired:true,sourceBound:true,observationId:'observation-1',amountBasis:'EXPLICIT',cadence:'MONTHLY_RECURRING',priceRole:'ORDINARY_RECURRING',sourceOwnership:'FIRST_PARTY',providerAlignment:'EXACT',planAlignment:'EXACT',marketAlignment:'EXACT',billingRouteAlignment:'UNRESOLVED'}});
const verified=(amount=10.99)=>({provider:'Example',market:'DE',plan:'Individual',amount,currency:'EUR',paymentCadence:'MONTHLY_RECURRING',sourceUrl:'https://example.test/de/pricing',verifiedAt:'2026-10-13T00:02:00.000Z',provenance:'V3_VERIFIED'});

function stores(){
 let suggested=[],verifiedRows=[];
 return {
  persistSuggested:async plans=>{suggested=mergeProductPlans(suggested,plans.map(row=>({...structuredClone(row),verified:[]})));return {persisted:plans.length};},
  loadSuggested:async()=>structuredClone(suggested),
  persistVerified:async rows=>{verifiedRows.push(...structuredClone(rows));return {persisted:rows.length};},
  loadVerified:async()=>structuredClone(verifiedRows),
  state:()=>({suggested,verifiedRows})
 };
}

async function execute({google=acquisition(),v3={suggested:[],verified:[],contradictions:[],operationalFailures:[]}}={}){
 const store=stores();let earlySnapshot=null;
 const result=await runAdminV4FirstResearch({targets:[target],artifactDirectory:null,apiKey:'test',acquireGoogle:async()=>google,...store,runDownstream:async({handoffs})=>{earlySnapshot=store.state();assert.equal(handoffs[target.id].kind,'V4_TO_V3_RESEARCH_HANDOFF');assert(handoffs[target.id].researchLeads.candidatePlans.every(row=>row.truthAuthority==='NONE'));return {result:{executionComplete:true},v3Results:{[target.id]:v3}};}});
 return {result,row:result.targets[0],earlySnapshot,final:store.state()};
}

test('A: V4 Suggested persists before downstream and remains active',async()=>{
 const {row,earlySnapshot,final}=await execute();assert.equal(earlySnapshot.suggested.length,1);assert.equal(row.combined.resultClass,'SUGGESTED');assert.deepEqual(row.analyticsStates.map(x=>x.status),['SUGGESTED_ONLY']);assert.equal(final.verifiedRows.length,0);
});

test('B: downstream unresolved cannot remove the already persisted V4 Suggested',async()=>{
 const {row,earlySnapshot,final}=await execute({v3:{suggested:[],verified:[],contradictions:[],operationalFailures:[{kind:'UNRESOLVED'}]}});assert.equal(earlySnapshot.suggested[0].suggested?.monthlyPriceMinor,1099);assert.equal(final.suggested[0].suggested?.monthlyPriceMinor,1099);assert.equal(row.combined.operationalFailures.length,1);
});

test('C: stronger source-bound V3 Suggested supersedes V4 monotonically',async()=>{
 const {row,final}=await execute({v3:{suggested:[v3Suggested()],verified:[],contradictions:[],operationalFailures:[]}});assert.equal(row.combined.plans[0].activeSuggested.amount,11.99);assert.equal(row.combined.plans[0].activeSuggested.provenance,'V3_SOURCE_RESEARCH');assert.equal(row.combined.plans[0].suggestedHistory.some(x=>x.provenance==='GOOGLE_AI_V4'),true);assert.equal(row.combined.suggested.length,2);assert.deepEqual(row.planCounts,{suggestedPlans:1,verifiedPlans:0});assert.equal(final.suggested[0].suggested.monthlyPriceMinor,1199);assert.equal(final.suggested[0].suggestedHistory.some(x=>x.monthlyPriceMinor===1099),true);
});

test('D: matching Verified stays separate and Analytics reports match',async()=>{
 const {row,final}=await execute({v3:{suggested:[],verified:[verified()],contradictions:[],operationalFailures:[]}});assert.equal(final.verifiedRows.length,1);assert.equal(final.suggested[0].verified.length,0);assert.equal(row.combined.resultClass,'VERIFIED');assert.equal(row.combined.plans[0].activePrice.amount,10.99);assert.deepEqual(row.planCounts,{suggestedPlans:1,verifiedPlans:1});assert.deepEqual(row.analyticsStates.map(x=>x.status),['SUGGESTED_AND_VERIFIED_MATCH']);
});

test('result counts one V4 and one V3 Suggested representation as one Verified logical plan',async()=>{
 const {row}=await execute({v3:{suggested:[v3Suggested(10.99)],verified:[verified()],contradictions:[],operationalFailures:[]}});
 assert.equal(row.combined.suggested.length,2);assert.equal(row.combined.verified.length,1);assert.equal(row.combined.plans.length,1);assert.deepEqual(row.planCounts,{suggestedPlans:1,verifiedPlans:1});assert.deepEqual(row.persisted,{suggestedPlans:1,verified:1});assert.equal(row.combined.resultClass,'VERIFIED');
});

test('E: differing Suggested remains diagnostic while Verified is authoritative',async()=>{
 const {row}=await execute({v3:{suggested:[],verified:[verified(12.99)],contradictions:[],operationalFailures:[]}});assert.deepEqual(row.analyticsStates.map(x=>x.status),['VERIFIED_ONLY']);assert.equal(row.combined.resultClass,'VERIFIED');assert.equal(row.combined.plans[0].activePrice.amount,12.99);assert.equal(row.combined.plans[0].suggestedMismatch,true);assert.equal(row.combined.plans[0].suggested[0].amount,10.99);
});

test('F: Google no-price result can be superseded by source-bound V3 Suggested',async()=>{
 const annual={...plan,paymentCadence:'ANNUAL',billingBasis:'billed annually',annualOnly:true};const {row}=await execute({google:acquisition('GOOGLE_AI_NO_PRICE',[annual]),v3:{suggested:[v3Suggested()],verified:[],contradictions:[],operationalFailures:[]}});assert.equal(row.googleStatus,'GOOGLE_AI_NO_PRICE');assert.equal(row.combined.suggested.length,1);assert.deepEqual(row.analyticsStates.map(x=>x.status),['SUGGESTED_ONLY']);
});

test('G: Google access failure still permits V3 Suggested and Verified fallback',async()=>{
 const {row}=await execute({google:acquisition('GOOGLE_AI_ACCESS_FAILURE'),v3:{suggested:[v3Suggested()],verified:[verified(11.99)],contradictions:[],operationalFailures:[]}});assert.equal(row.googleStatus,'GOOGLE_AI_ACCESS_FAILURE');assert.deepEqual(row.analyticsStates.map(x=>x.status),['SUGGESTED_AND_VERIFIED_MATCH']);
});

test('H: total unresolved remains explicit NO_RESULT without manufacturing a price',async()=>{
 const {row,final}=await execute({google:acquisition('GOOGLE_AI_ACCESS_FAILURE'),v3:{suggested:[],verified:[],contradictions:[],operationalFailures:[{kind:'UNRESOLVED'}]}});assert.equal(row.combined.resultClass,'NO_RESULT');assert.deepEqual(row.analyticsStates,[]);assert.equal(final.suggested.length,0);assert.equal(final.verifiedRows.length,0);
});

test('I: acquisition budget stop preserves useful V3 Suggested through publication',async()=>{
 const {row,final}=await execute({google:acquisition('GOOGLE_AI_ACCESS_FAILURE'),v3:{suggested:[v3Suggested()],verified:[],contradictions:[],operationalFailures:[{kind:'BUDGET_STOP',hardStop:false}]}});assert.equal(row.combined.resultClass,'SUGGESTED');assert.equal(row.combined.operationalFailures[0].kind,'BUDGET_STOP');assert.equal(final.suggested[0].suggested.monthlyPriceMinor,1199);
});

test('exact established V3 offer identity reaches the Verified adapter unchanged',()=>{
 const observation='wahoo-provider',bodyHash='c'.repeat(64),offerIdentity=name=>({kind:'SPAN',start:10,end:10+name.length,quote:name,sha256:digest(name)}),reference=name=>({observation,sha256:bodyHash,pointer:'/offers/'+name.toLowerCase(),source:{offer:name,offerIdentity:offerIdentity(name)}}),proposition=(name,value)=>({state:'ESTABLISHED',value,evidence:[{value,reference:reference(name)}],contradictions:[]}),offer=(name,amount)=>({id:digest(name),market:'DE',propositions:{SERVICE_IDENTITY:{state:'ESTABLISHED',value:true,evidence:[]},PRICE_AMOUNT:proposition(name,amount),CURRENCY:proposition(name,'EUR'),MONTHLY_CADENCE:{state:'UNRESOLVED',value:null,evidence:[]},MONTHLY_SUBSCRIPTION:proposition(name,true),CONSUMER_SUBSCRIPTION:proposition(name,true),TARGET_MARKET:proposition(name,'DE')}}),offers=[offer('Core',4.99),offer('Pro',17.99)],current={serviceName:'Wahoo App',market:'DE',v3Observation:{id:observation,url:'https://provider.example/pricing',sha256:bodyHash,context:{transport:'DIRECT'}},v3Truth:{offers,eligibility:{DE:{result:'ELIGIBLE'}}}},result=v3ResultFromTarget(current);
 assert.deepEqual(result.verified.map(row=>[row.plan,row.planIdentity]),[['Core','wahoo app:de:core'],['Pro','wahoo app:de:pro']]);assert(result.verified.every(row=>row.verificationEvidence?.verification==='authoritative-provider'&&row.verificationEvidence.verifiedAt===row.verifiedAt));
});


test('reviewed namespace makes Gemini discover official URLs without manufacturing Suggested',async()=>{
 const reviewed=reviewedProviderNamespacesFor('hulu','Hulu')[0],hulu={id:'price-research:hulu:PT',service:'hulu',serviceName:'Hulu',market:'PT',reviewedProviderNamespaces:[reviewed]},official='https://help.hulu.com/s/article/hulu-plans-and-prices',outside='https://publisher.example/hulu-prices';
 const query=buildGoogleAiQuery({providerName:'Hulu',targetMarket:'PT',providerNamespace:'hulu.com'});
 assert.match(query,/official consumer subscription pricing pages/);
 assert.match(query,/legitimate subdomains/);
 let handoff;
 const result=await runAdminV4FirstResearch({targets:[hulu],artifactDirectory:null,apiKey:'test',acquireGoogle:async args=>{
  assert.equal(args.providerNamespace,'hulu.com');
  return {status:'GOOGLE_AI_NO_PRICE',aiResult:{provider:'Hulu',market:'PT',plans:[],sources:[{title:'Official plans',url:official},{title:'Article',url:outside}],warnings:[],timestamp:'2026-10-13T00:00:00.000Z',requestCount:1},audit:{request:{requestCount:1}}};
 },...stores(),runDownstream:async({handoffs})=>{handoff=handoffs[hulu.id];return {result:{},v3Results:{[hulu.id]:{suggested:[],verified:[],contradictions:[],operationalFailures:[]}}};}});
 assert.deepEqual(handoff.researchLeads.candidatePlans,[]);
 assert.deepEqual(handoff.researchLeads.providerDiscoveryUrls,[official]);
 assert.deepEqual(handoff.adaptiveTargetPatch.urls,[official]);
 assert.equal(handoff.adaptiveTargetPatch.leads[0].truthAuthority,'NONE');
 assert.equal(handoff.adaptiveTargetPatch.leads[0].authoritative,false);
 assert.equal(result.targets[0].combined.resultClass,'NO_RESULT');
 assert.deepEqual(result.targets[0].analyticsStates,[]);
});

test('service without reviewed namespace keeps the existing Gemini query and handoff',async()=>{
 assert.doesNotMatch(buildGoogleAiQuery({providerName:'Example',targetMarket:'DE'}),/legitimate subdomains/);
 let seen,handoff;
 await runAdminV4FirstResearch({targets:[target],artifactDirectory:null,apiKey:'test',acquireGoogle:async args=>{seen=args.providerNamespace;return acquisition('GOOGLE_AI_NO_PRICE',[]);},...stores(),runDownstream:async({handoffs})=>{handoff=handoffs[target.id];return {result:{},v3Results:{[target.id]:{suggested:[],verified:[],contradictions:[],operationalFailures:[]}}};}});
 assert.equal(seen,null);
 assert.deepEqual(handoff.researchLeads.providerDiscoveryUrls,[]);
});
