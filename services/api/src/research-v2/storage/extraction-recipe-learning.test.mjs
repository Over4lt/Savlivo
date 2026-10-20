import '../offline-replay/offline-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {digest} from '../../research-v3/model.mjs';
import {evaluateProviderSourceTruth} from '../live/provider-source-v3.mjs';
import {derivedCountrySourceCandidates} from '../live/derived-country-sources.mjs';
import {createProviderPricingRouteMemory,learnProviderPricingRoutesFromTarget} from '../live/hybrid-provider-resource-memory.mjs';
import {loadPricingRouteMemory,publishPricingRouteMemory} from './pricing-route-memory.mjs';
import {OpenWebResearch} from '../live/open-web-discovery.mjs';
import {interpretSubscriptionPage} from '../../research-v3/subscription-page.mjs';

const url='https://www.hbomax.com/nz/en',market='NZ';
const card=(name,amount,id)=>({periodicityText:'Monthly',productName:{plainText:name},price:{currencyCode:'NZD',amount:{plainText:amount},period:{plainText:'month'}},pricePlan:{id},ctas:[{text:'Select Plan',code:'continue.account-creation.pre-purchase'}]});
function body(amount='15.99',collection='idref23'){
 const items={Monthly:[{collectionTitle:'Monthly',content:{planCard:card('Standard',amount,'38354')}},{collectionTitle:'Monthly',content:{planCard:card('Premium','20.99','38362')}}]};
 return `<html lang="en-NZ"><head><title>HBO Max | Stream movies</title><meta property="og:title" content="HBO Max | Stream movies"></head><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({props:{pageProps:{mappedData:{[collection]:{items}}}}})}</script></body></html>`;
}
function target(extra={}){return {id:'price-research:max:NZ',service:'max',serviceName:'Max',market,operationsObjective:'PRICE_RESEARCH',researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},capabilities:{direct:true,tavily:false,decodo:true,browser:false,groq:false},derivedCountryCandidates:derivedCountrySourceCandidates({service:'max',market}),urls:[],leads:[],authorities:[],reads:[],queries:[],decisions:[],blockedOrigins:[],verified:[],...extra};}
function evaluateSource(current,source,observationId){const hash=digest(source);return evaluateProviderSourceTruth({target:current,retained:{url,requestedUrl:url,truncated:false,contentType:'text/html',accessDecisions:[{decision:'ALLOWED'}],httpStatus:200,bodyHash:hash,sourceIntegrity:{sha256:hash},rawSource:{text:source}},acquisition:{route:'DECODO',countryReceipt:{contractVersion:1,kind:'V3_VERIFIED_COUNTRY_RECEIPT',transport:'DECODO',verification:'BRACKET_VERIFIED',requestedCountry:market,verifiedCountry:market}},observationId});}

test('two independent jobs persist and reuse a real hydration decision with fresh source and V3 Truth',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'extraction-recipe-learning-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const first=body(),hash=digest(first),run=path.join(root,'job-a','open-web-discovery'),acquisition=path.join(run,'acquisitions','retained-NZ');fs.mkdirSync(path.join(acquisition,'raw'),{recursive:true});fs.writeFileSync(path.join(acquisition,'raw',hash+'.body'),first);
 const a=target({decisions:[{url,eligible:true,acquisitionReserved:true,route:'DECODO'}],acquisitionOutcomes:[{url,runDirectory:acquisition,sourceHash:hash,sourceClassification:{status:'PROVIDER_SOURCE',finalUrl:url,sourceHash:hash},countryV3Evaluation:{status:'EVALUATED',sourceHash:hash,receiptStatus:'HASH_VERIFIED',geoClass:'G1'}}]});
 const established=evaluateSource(a,first,'country-v3-synthetic-nz');assert.equal(established.v3Truth.established,true);
 assert.deepEqual(established.v3Truth.offers.map(row=>row.propositions.PRICE_AMOUNT.value),[15.99,20.99]);
 a.providerInterpretations=[{url,...established}];const memory=createProviderPricingRouteMemory(),learned=learnProviderPricingRoutesFromTarget({memory,target:a,directory:run});
 assert.equal(learned.length,1);assert.equal(learned[0].sources[0].extractionRecipe.rule,'NEXT_DATA_MAPPED_MONTHLY_PLAN_CARD');
 const knownService=structuredClone(a);knownService.derivedCountryCandidates=[];knownService.decisions=[{url,eligible:true,route:'DIRECT',authority:{hostname:'www.hbomax.com',service:'max',validated:true}}];
 const knownLearning=learnProviderPricingRoutesFromTarget({memory:createProviderPricingRouteMemory(),target:knownService,directory:run});
 assert.equal(knownLearning[0].sources[0].extractionRecipe.rule,'NEXT_DATA_MAPPED_MONTHLY_PLAN_CARD','a known-service Decodo continuation must re-read its exact G1 body before publishing the recipe');
 publishPricingRouteMemory(root,learned,{jobId:'11111111-1111-4111-8111-111111111111',checkpoint:'priority-research-links',market,recordedAt:'2026-10-20T10:00:00.000Z',acquiredAt:'2026-10-20T09:59:00.000Z'});
 const index=fs.readFileSync(path.join(root,'provider-pricing-routes-v1.json'),'utf8');assert(!index.includes('15.99')&&!index.includes('20.99')&&!index.includes('38354'));
 const restored=loadPricingRouteMemory(root),b=target();
 assert.equal(restored.genericExtractionHints[0].rule,'NEXT_DATA_MAPPED_MONTHLY_PLAN_CARD');
 const genericTrace={},generic=interpretSubscriptionPage({body:body('16.99'),url,providerName:'Another Service',marketCurrencyHint:'NZD',extractionHint:restored.genericExtractionHints[0].recipe,extractionTrace:genericTrace});
 assert.equal(genericTrace.hintOutcome,'APPLIED');assert.equal(generic.offerings.length,2,'a generic parser hint still reads only the new body');
 const independent=new OpenWebResearch(path.join(root,'job-b'),[b],undefined,undefined,{providerPricingRouteMemory:restored});
 const next=independent.state.targets[0];assert.equal(next.learnedExtractionHints.length,1);assert.equal(next.learnedExtractionHints[0].url,url);
 const changedPrice=body('16.99'),fresh=evaluateSource(next,changedPrice,'country-v3-synthetic-nz-fresh');
 assert.equal(fresh.v3Observation.extractionTrace.hintOutcome,'APPLIED');
 assert.deepEqual(fresh.v3Truth.offers.map(row=>row.propositions.PRICE_AMOUNT.value),[16.99,20.99]);
 const changedStructure=evaluateSource(next,body('16.99','changedCollection'),'country-v3-synthetic-nz-layout');
 assert.equal(changedStructure.v3Observation.extractionTrace.hintOutcome,'FALLBACK');assert.equal(changedStructure.v3Truth.established,true);
 const foreign=target({id:'price-research:max:AU',market:'AU',derivedCountryCandidates:derivedCountrySourceCandidates({service:'max',market:'AU'})});
 const foreignJob=new OpenWebResearch(path.join(root,'job-foreign'),[foreign],undefined,undefined,{providerPricingRouteMemory:restored});
 assert.equal(foreignJob.state.targets[0].learnedExtractionHints?.length??0,1,'a compatible country route may carry a parser hint to the next market');
 assert.equal(foreignJob.state.targets[0].learnedExtractionHints[0].market,'AU');
 assert.equal(JSON.stringify(foreignJob.state.targets[0].learnedExtractionHints).includes('15.99'),false,'the hint carries no previous price');
 assert.equal(JSON.stringify(foreignJob.state.targets[0].learnedExtractionHints).includes('G1'),false,'the hint carries no previous market receipt');
 const tampered=structuredClone(a);tampered.providerInterpretations[0].v3Observation.extractionTrace.recipe.collectionKey='invented';
 const rejected=learnProviderPricingRoutesFromTarget({memory:createProviderPricingRouteMemory(),target:tampered,directory:run});
 assert.equal(rejected.length,1);assert.equal(rejected[0].sources[0].extractionRecipe,undefined,'checkpoint metadata must agree with a replay of the retained body');
 fs.writeFileSync(path.join(root,'provider-pricing-routes-v1.json.pending-interrupted'),'half-written');
 assert.equal(loadPricingRouteMemory(root).routes.size,1,'interrupted publication cannot replace the last valid index');
});
