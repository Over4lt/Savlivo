import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeProductPlans} from '../product-pricing.ts';
import {runAdminV4FirstResearch,v3ResultFromTarget} from './admin-live-pipeline.mjs';
import {digest} from '../research-v3/model.mjs';
import {reviewedProviderNamespacesFor} from '../research-v3/reviewed-provider-namespaces.mjs';
import {buildGoogleAiQuery} from './v4-query.mjs';
import {catalogPlanIdentity} from '../../../../packages/contracts/src/product-pricing.ts';

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

test('priority Research link runs before Gemini and a V3 Verified result avoids broad discovery',async()=>{
 const events=[],store=stores(),result=await runAdminV4FirstResearch({targets:[target],...store,beforeGoogle:async()=>{events.push('LINK_DECODO');return {satisfiedTargetIds:[target.id],downstream:{result:{targets:{[target.id]:{researchLinks:[{id:'link'}],researchLinkOutcomes:[{id:'link',result:'VERIFIED'}]}}},v3Results:{[target.id]:{suggested:[],verified:[verified()],contradictions:[],operationalFailures:[]}}}};},acquireGoogle:async()=>{events.push('GEMINI');throw Error('UNEXPECTED_GEMINI');},runDownstream:async()=>{events.push('BROAD_DISCOVERY');throw Error('UNEXPECTED_DISCOVERY');}});
 assert.deepEqual(events,['LINK_DECODO']);assert.equal(result.targets[0].googleRequests,0);assert.equal(result.targets[0].googleStatus,'RESEARCH_LINK_VERIFIED');assert.equal(result.targets[0].combined.resultClass,'VERIFIED');assert.equal(store.state().verifiedRows.length,1);
});

test('unresolved priority Research link falls through to Gemini and ordinary downstream research',async()=>{
 const events=[],result=await runAdminV4FirstResearch({targets:[target],...stores(),beforeGoogle:async()=>{events.push('LINK_DECODO');return {satisfiedTargetIds:[]};},acquireGoogle:async()=>{events.push('GEMINI');return acquisition('GOOGLE_AI_NO_PRICE',[]);},runDownstream:async()=>{events.push('BROAD_DISCOVERY');return {result:{},v3Results:{[target.id]:{suggested:[],verified:[],contradictions:[],operationalFailures:[]}}};}});
 assert.deepEqual(events,['LINK_DECODO','GEMINI','BROAD_DISCOVERY']);assert.equal(result.targets[0].combined.resultClass,'NO_RESULT');
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

test('three persisted catalog plans and three fresh V3 plans remain three across repeated runs and price changes',async()=>{
 assert.notEqual(catalogPlanIdentity({serviceSlug:'example',planSlug:'gold-monthly',billingProviderSlug:'direct',countryCode:'DE',currency:'EUR'}),catalogPlanIdentity({serviceSlug:'example',planSlug:'gold-annual',billingProviderSlug:'direct',countryCode:'DE',currency:'EUR'}));
 const names=['gold_monthly_032022','platinum_monthly_032022','diamond_monthly_032022'],rows=new Map(names.map((name,index)=>{const planSlug=name.replaceAll('_','-'),item={serviceSlug:'example',planSlug,planName:name,billingProviderSlug:'direct',countryCode:'DE',currency:'EUR',monthlyPriceMinor:[799,1299,1999][index],planIdentity:`catalog:example:de:${planSlug}:direct:eur`,sourceUrl:'https://example.test/plans',updatedAt:'2026-10-13T00:00:00.000Z'};return [planSlug,item];}));
 const store={persistSuggested:async()=>({}),loadSuggested:async()=>[],loadVerified:async()=>[...rows.values()].map(row=>structuredClone(row)),persistVerified:async items=>{for(const item of items)rows.set(item.planSlug,{...item});return {persisted:items.length};}};
 for(let run=1;run<=3;run++){
  const v3={suggested:[],verified:names.map((name,index)=>({...verified([7.99,12.99,19.99][index]+(run===2&&index===0?1:0)),plan:name,planIdentity:`fresh-observation:${run}:${index}`})),contradictions:[],operationalFailures:[]};
  const result=await runAdminV4FirstResearch({targets:[target],...store,acquireGoogle:async()=>acquisition('GOOGLE_AI_ACCESS_FAILURE'),runDownstream:async()=>({result:{},v3Results:{[target.id]:v3}})}),current=result.targets[0];
  assert.deepEqual(current.planCounts,{suggestedPlans:0,verifiedPlans:3});assert.equal(current.combined.plans.length,3);assert.equal(rows.size,3);
  assert.deepEqual(current.combined.plans.map(row=>row.planIdentity).sort(),[...rows.values()].map(row=>row.planIdentity).sort());
 }
});

test('three valid Gemini plans survive unresolved V3 as Suggested',async()=>{
 const plans=['Gold','Platinum','Diamond'].map((name,index)=>({...plan,planName:name,amount:[7.99,12.99,19.99][index],ordinaryRecurringPrice:[7.99,12.99,19.99][index]}));
 const {row,earlySnapshot}=await execute({google:acquisition('GOOGLE_AI_SUCCESS',plans),v3:{suggested:[],verified:[],contradictions:[],operationalFailures:[{kind:'UNRESOLVED'}]}});
 assert.equal(earlySnapshot.suggested.length,3);assert.equal(row.earlySuggestedPersisted,3);assert.deepEqual(row.planCounts,{suggestedPlans:3,verifiedPlans:0});assert.equal(row.combined.suggested.filter(item=>item.provenance==='GOOGLE_AI_V4').length,3);
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
 assert.deepEqual(result.verified.map(row=>[row.plan,row.planIdentity]),[['Core','catalog:wahoo-app:de:core:direct:eur'],['Pro','catalog:wahoo-app:de:pro:direct:eur']]);assert(result.verified.every(row=>row.verificationEvidence?.verification==='authoritative-provider'&&row.verificationEvidence.verifiedAt===row.verifiedAt));
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
