import test from 'node:test';
import assert from 'node:assert/strict';
import {targetMarketAcquisition,unresolvedV3TargetNeed} from './provider-access-gap.mjs';
import {executableAction,executionBounds} from './execution-capabilities.mjs';
import {planResearch} from './research-planner.mjs';
import {acceptV3TruthNeeds,pendingV3MarketProof} from './market-proof-continuation.mjs';

const url='https://provider.example/resource',hash='a'.repeat(64),authority={hostname:'provider.example',provider:'Fixture',sourceType:'OFFICIAL_PROVIDER',sourceUrl:url,checkedAt:'2026-10-11T00:00:00.000Z'};
const observation={id:'direct-provider',kind:'PROVIDER',url,sha256:hash,context:{transport:'DIRECT',networkGeography:'UNBOUND',representation:'PROVIDER_PAGE'}};
const directPage={requestedUrl:url,url,outcome:'OK',bodyHash:hash,accessDecisions:[{decision:'ALLOWED'}]};
function target(extra={}){return {id:'fixture-price-DE',service:'fixture',serviceName:'Fixture',market:'DE',researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},capabilities:{direct:true,tavily:false,decodo:true,browser:false,groq:false},urls:[url],authorities:[authority],reads:[structuredClone(directPage)],queries:[],decisions:[],verified:[],blockedOrigins:[],v3Observation:structuredClone(observation),v3Truth:{prices:{},needs:[{id:'DE:PRICE_AMOUNT',proposition:'PRICE_AMOUNT',market:'DE',offerId:null,state:'UNRESOLVED'}]},...extra};}

test('authorized exact-host Direct grounding plus an unresolved V3 target need admits country observation without commercial facts',()=>{
 const value=target(),admission=targetMarketAcquisition(value,url);assert.equal(unresolvedV3TargetNeed(value),true);assert.deepEqual(admission,{eligible:true,primaryFailureReason:'TARGET_MARKET_OBSERVATION_REQUIRED',routeBenefit:{kind:'TARGET_COUNTRY_OBSERVATION',targetMarket:'DE'},marketProofIdentityKeys:[]});
 const plan=planResearch(value);assert.equal(plan.route,'DECODO');assert.equal(plan.url,url);assert.equal(plan.reason,'TARGET_MARKET_OBSERVATION_REQUIRED');assert.equal(executableAction(value,{route:'DECODO',url}).executable,true);
});

test('country scheduling still fails closed without market, authority, exact successful Direct grounding, unresolved need or capacity',()=>{
 const cases=[
  ['market',value=>{value.market=null;}],
  ['authority',value=>{value.authorities=[];}],
  ['cross-host final',value=>{value.reads[0].url='https://external.example/resource';}],
  ['failed Direct',value=>{value.reads[0].outcome='UNRESOLVED';}],
  ['denied Direct',value=>{value.reads[0].accessDecisions=[{decision:'DENIED'}];}],
  ['hash mismatch',value=>{value.reads[0].bodyHash='b'.repeat(64);}],
  ['non-Direct observation',value=>{value.v3Observation.context.transport='DECODO';}],
  ['no unresolved V3 need',value=>{value.v3Truth.needs=[];}],
  ['contradicted need',value=>{value.v3Truth.needs[0].state='CONTRADICTED';}],
 ];
 for(const [label,mutate]of cases){const value=target();mutate(value);assert.equal(targetMarketAcquisition(value,url),null,label);}
 const bounded=target();assert.equal(executableAction(bounded,{route:'DECODO',url},{bounds:{...executionBounds,perServiceAcquisitions:0},usage:{reads:0,searches:0,acquisitions:0,bytes:0}}).reason,'DECODO_BUDGET_EXHAUSTED');
});

test('country acquisition is not repeated for an equivalent provider resource',()=>{
 const value=target({acquisitionOutcomes:[{url,classification:'NO_MARKET_PROOF'}]});assert(targetMarketAcquisition(value,url));assert.equal(executableAction(value,{route:'DECODO',url}).reason,'EQUIVALENT_RESOURCE_ALREADY_ATTEMPTED');assert.notEqual(planResearch(value).route,'DECODO');
});

test('precise established-offering market objective remains an eligible country join',()=>{
 const value=target(),propositions=Object.fromEntries(['SERVICE_IDENTITY','PRICE_AMOUNT','CURRENCY','MONTHLY_SUBSCRIPTION','CONSUMER_SUBSCRIPTION'].map(key=>[key,{state:'ESTABLISHED',value:key==='PRICE_AMOUNT'?12:key==='CURRENCY'?'EUR':true}]));propositions.TARGET_MARKET={state:'UNRESOLVED',value:null};
 const truth={prices:{DE:{id:'personal',propositions}},needs:[{id:'DE:TARGET_MARKET',proposition:'TARGET_MARKET',market:'DE',offerId:'personal',state:'UNRESOLVED'}]};assert.equal(acceptV3TruthNeeds(value,{v3Truth:truth,v3Observation:observation}),true);assert(pendingV3MarketProof(value,url));assert(targetMarketAcquisition(value,url));
});
