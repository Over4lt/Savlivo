import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeProductPlans} from '../product-pricing.ts';
import {runAdminV4FirstResearch,v3ResultFromTarget,reconcileV3PlanIdentities} from './admin-live-pipeline.mjs';
import {digest} from '../research-v3/model.mjs';
import {reviewedProviderNamespacesFor} from '../research-v3/reviewed-provider-namespaces.mjs';
import {buildGoogleAiQuery} from './v4-query.mjs';
import {catalogPlanIdentity} from '../../../../packages/contracts/src/product-pricing.ts';
import {createV4SuggestedSnapshot} from './research-handoff.mjs';
import {canonicalPlanEvidenceCounts,mergeResearch} from './monotonic-merge.mjs';

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

const chessTarget={id:'chess-no',service:'chess-com',serviceName:'Chess.com',market:'NO'};
const chessIds=['gold_monthly_032022','platinum_monthly_032022','diamond_monthly_032022'];
const chessNames=['Gold Membership (Monthly)','Platinum Membership (Monthly)','Diamond Membership (Monthly)'];
const chessVerified=chessIds.map((id,index)=>({plan:id,amount:[79.99,129.99,199.99][index],currency:'NOK',paymentCadence:'MONTHLY_RECURRING',sourceUrl:'https://www.chess.com/membership',verifiedAt:'2026-10-16T10:15:00Z',verificationEvidence:{exactOfferId:id}}));
const chessSuggested=(id,index,{currency='NOK',amount=[79.99,129.99,199.99][index],hash='country',marketAlignment='EXACT',name=chessNames[index]}={})=>({provider:'Chess.com',market:'NO',plan:name,amount,currency,paymentCadence:'MONTHLY_RECURRING',sourceUrl:'https://www.chess.com/membership',sourceHash:hash,provenance:'V3_SOURCE_RESEARCH',researchEvidence:{acquired:true,sourceBound:true,observationId:hash,exactOfferId:id,amountBasis:'EXPLICIT',cadence:'MONTHLY_RECURRING',priceRole:'ORDINARY_RECURRING',sourceOwnership:'FIRST_PARTY',providerAlignment:'EXACT',planAlignment:'EXACT',marketAlignment,billingRouteAlignment:'UNRESOLVED'}});

test('Chess NO exact source offers reconcile six observations to three Suggested and three Verified plans across repeated runs',async()=>{
 const persisted=chessVerified.map(row=>({serviceSlug:'chess-com',planSlug:row.plan.replaceAll('_','-'),planName:row.plan,billingProviderSlug:'direct',countryCode:'NO',currency:'NOK',monthlyPriceMinor:Math.round(row.amount*100),planIdentity:catalogPlanIdentity({serviceSlug:'chess-com',planSlug:row.plan.replaceAll('_','-'),billingProviderSlug:'direct',countryCode:'NO',currency:'NOK'}),sourceUrl:row.sourceUrl,updatedAt:row.verifiedAt}));
 const stored=new Map(),store={persistSuggested:async plans=>{for(const plan of plans)for(const row of [...plan.suggestedHistory,...(plan.suggested?[plan.suggested]:[])])stored.set(row.suggestedId,{planIdentity:plan.planIdentity,row});},loadSuggested:async()=>[],loadVerified:async()=>structuredClone(persisted),persistVerified:async()=>({})};
 for(let run=0;run<3;run++){
  const suggested=chessIds.flatMap((id,index)=>[chessSuggested(id,index,{currency:'EUR',amount:[6.99,11,17.99][index],hash:'direct-'+run,marketAlignment:'UNRESOLVED'}),chessSuggested(id,index,{hash:'country-'+run})]);
  const result=await runAdminV4FirstResearch({targets:[chessTarget],...store,acquireGoogle:async()=>({status:'GOOGLE_AI_ACCESS_FAILURE',aiResult:null,audit:{timestamp:'2026-10-16T10:15:00Z',request:{requestCount:1,status:'HTTP_402'}}}),runDownstream:async()=>({result:{targets:{}},v3Results:{[chessTarget.id]:{suggested,verified:chessVerified,contradictions:[],operationalFailures:[]}}})});
  const row=result.targets[0];assert.deepEqual(row.planCounts,{suggestedPlans:3,verifiedPlans:3});assert.equal(row.combined.plans.length,3);assert.equal(row.combined.suggested.length,6);assert(row.combined.plans.every(plan=>plan.suggested.length===2&&plan.verified.length>=1&&plan.suggested.some(item=>item.currency==='EUR')&&plan.suggested.some(item=>item.currency==='NOK')));assert.deepEqual(new Set(row.combined.plans.map(plan=>plan.planIdentity)),new Set(persisted.map(plan=>plan.planIdentity)));
 }
 assert.equal([...stored.values()].filter(item=>item.row.currency==='NOK').length,3);
});

test('exact V4 lineage with different display strings inherits one canonical Verified identity',()=>{
 const snapshot=createV4SuggestedSnapshot({provider:'Chess.com',market:'NO',suggested:[{plan:'Gold',amount:79.99,currency:'NOK',provenance:'GOOGLE_AI_V4',planIdentity:'catalog:chess-com:no:gold:direct:nok'}]});
 const original=snapshot.suggested[0],v3=chessSuggested(chessIds[0],0,{name:'Gold Membership (Monthly)'});v3.originSuggestedId=original.suggestedId;v3.researchEvidence.lineage={kind:'V4_SUGGESTED_ORIGIN',originSuggestedId:original.suggestedId,truthAuthority:'NONE'};
 const stored=[{serviceSlug:'chess-com',planSlug:'gold-monthly-032022',billingProviderSlug:'direct',countryCode:'NO',currency:'NOK',planIdentity:'catalog:chess-com:no:gold-monthly-032022:direct:nok'}];
 const resolved=reconcileV3PlanIdentities(chessTarget,snapshot,{suggested:[v3],verified:[chessVerified[0]]},stored),merged=mergeResearch({...resolved});assert.deepEqual(canonicalPlanEvidenceCounts(merged),{suggestedPlans:1,verifiedPlans:1});assert.equal(merged.plans.length,1);assert.equal(merged.plans[0].suggested.length,2);assert.equal(merged.plans[0].planIdentity,stored[0].planIdentity);
 const changed=chessSuggested(chessIds[0],0,{hash:'new-source',amount:89.99});changed.originSuggestedId=original.suggestedId;changed.researchEvidence.lineage={kind:'V4_SUGGESTED_ORIGIN',originSuggestedId:original.suggestedId,truthAuthority:'NONE'};const next=reconcileV3PlanIdentities(chessTarget,snapshot,{suggested:[changed],verified:[{...chessVerified[0],amount:89.99}]},stored);assert.deepEqual(canonicalPlanEvidenceCounts(mergeResearch(next)),{suggestedPlans:1,verifiedPlans:1});
});

test('three V4, three source-bound V3 and three Verified offers stay three logical plans',()=>{
 const snapshot=createV4SuggestedSnapshot({provider:'Chess.com',market:'NO',suggested:chessIds.map((id,index)=>({plan:['Gold','Platinum','Diamond'][index],amount:chessVerified[index].amount,currency:'NOK',paymentCadence:'MONTHLY_RECURRING',provenance:'GOOGLE_AI_V4',planIdentity:priceIdentityForChess(id)}))});
 for(let run=0;run<3;run++){
  const suggested=chessIds.map((id,index)=>{const row=chessSuggested(id,index,{hash:'observation-'+run,amount:chessVerified[index].amount+(run===1&&index===0?1:0)}),origin=snapshot.suggested[index];row.originSuggestedId=origin.suggestedId;row.researchEvidence.lineage={kind:'V4_SUGGESTED_ORIGIN',originSuggestedId:origin.suggestedId,truthAuthority:'NONE'};return row;});
  const verifiedRows=chessVerified.map((row,index)=>({...row,amount:row.amount+(run===1&&index===0?1:0)}));
  const resolved=reconcileV3PlanIdentities(chessTarget,snapshot,{suggested,verified:verifiedRows}),combined=mergeResearch(resolved);
  assert.deepEqual(canonicalPlanEvidenceCounts(combined),{suggestedPlans:3,verifiedPlans:3});assert.equal(combined.plans.length,3);assert(combined.plans.every(plan=>plan.suggested.length===2&&plan.verified.length===1));
 }
});
const priceIdentityForChess=id=>catalogPlanIdentity({serviceSlug:'chess-com',planSlug:id.replaceAll('_','-'),billingProviderSlug:'direct',countryCode:'NO',currency:'NOK'});

test('exact offer identity keeps equal-price distinct plans separate and rejects contradictory lineage',()=>{
 const snapshot=createV4SuggestedSnapshot({provider:'Chess.com',market:'NO',suggested:[{plan:'Gold',amount:79.99,currency:'NOK',provenance:'GOOGLE_AI_V4',planIdentity:'catalog:chess-com:no:gold:direct:nok'}]});
 const samePrice=chessIds.slice(0,2).map((id,index)=>chessSuggested(id,index,{amount:79.99})),verifiedRows=chessVerified.slice(0,2).map(row=>({...row,amount:79.99})),resolved=reconcileV3PlanIdentities(chessTarget,createV4SuggestedSnapshot({provider:'Chess.com',market:'NO',suggested:[]}),{suggested:samePrice,verified:verifiedRows});assert.deepEqual(canonicalPlanEvidenceCounts(mergeResearch(resolved)),{suggestedPlans:2,verifiedPlans:2});
 const contradiction=chessSuggested(chessIds[0],0);contradiction.originSuggestedId=snapshot.suggested[0].suggestedId;contradiction.researchEvidence.lineage={kind:'V4_SUGGESTED_ORIGIN',originSuggestedId:contradiction.originSuggestedId,truthAuthority:'NONE'};contradiction.researchEvidence.planAlignment='MISMATCH';const conflicting=reconcileV3PlanIdentities(chessTarget,snapshot,{suggested:[contradiction],verified:[chessVerified[0]]});assert.equal(conflicting.snapshot.suggested[0].planIdentity,snapshot.suggested[0].planIdentity);assert.equal(mergeResearch(conflicting).plans.length,3);
});
