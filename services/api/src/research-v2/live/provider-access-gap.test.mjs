import test from 'node:test';
import assert from 'node:assert/strict';
import {targetMarketAcquisition,unresolvedV3TargetNeed} from './provider-access-gap.mjs';
import {executableAction,executionBounds} from './execution-capabilities.mjs';
import {planResearch} from './research-planner.mjs';
import {acceptV3TruthNeeds,pendingV3MarketProof} from './market-proof-continuation.mjs';
import {digest} from '../../research-v3/model.mjs';

const url='https://provider.example/resource',hash='a'.repeat(64),authority={hostname:'provider.example',provider:'Fixture',sourceType:'OFFICIAL_PROVIDER',sourceUrl:url,checkedAt:'2026-10-11T00:00:00.000Z'};
const observation={id:'direct-provider',kind:'PROVIDER',url,sha256:hash,context:{transport:'DIRECT',networkGeography:'UNBOUND',representation:'PROVIDER_PAGE'}};
const directPage={requestedUrl:url,url,outcome:'OK',bodyHash:hash,accessDecisions:[{decision:'ALLOWED'}]};
function target(extra={}){return {id:'fixture-price-DE',service:'fixture',serviceName:'Fixture',market:'DE',researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},capabilities:{direct:true,tavily:false,decodo:true,browser:false,groq:false},urls:[url],authorities:[authority],reads:[structuredClone(directPage)],queries:[],decisions:[],verified:[],blockedOrigins:[],v3Observation:structuredClone(observation),v3Truth:{prices:{},needs:[{id:'DE:PRICE_AMOUNT',proposition:'PRICE_AMOUNT',market:'DE',offerId:null,state:'UNRESOLVED'}]},...extra};}

test('authorized exact-host Direct grounding plus an unresolved V3 target need admits country observation without commercial facts',()=>{
 const value=target(),admission=targetMarketAcquisition(value,url),need=unresolvedV3TargetNeed(value);assert.equal(need.url,url);assert.equal(need.hash,hash);assert.equal(need.observation.id,'direct-provider');assert.equal(need.need.proposition,'PRICE_AMOUNT');assert.deepEqual(admission,{eligible:true,primaryFailureReason:'TARGET_MARKET_OBSERVATION_REQUIRED',routeBenefit:{kind:'TARGET_COUNTRY_OBSERVATION',targetMarket:'DE'},marketProofIdentityKeys:[]});
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

const genericTruth=(id,proposition='PRICE_AMOUNT')=>({prices:{},needs:[{id:`DE:${id}:${proposition}`,proposition,market:'DE',offerId:null,state:'UNRESOLVED'}]});
const direct=(resourceUrl,resourceHash,id,truth)=>({url:resourceUrl,classification:'DIRECT_FIELDS_INSUFFICIENT',v3Observation:{id,kind:'PROVIDER',url:resourceUrl,sha256:resourceHash,context:{transport:'DIRECT',networkGeography:'UNBOUND',representation:'PROVIDER_PAGE'}},v3Truth:truth});
const page=(resourceUrl,resourceHash)=>({requestedUrl:resourceUrl,url:resourceUrl,outcome:'OK',bodyHash:resourceHash,accessDecisions:[{decision:'ALLOWED'}]});
function preciseTruth(id='personal'){const proposition=(value,state='ESTABLISHED')=>({state,value,evidence:[],contradictions:[]}),propositions={SERVICE_IDENTITY:proposition(true),PRICE_AMOUNT:proposition(12),CURRENCY:proposition('EUR'),MONTHLY_SUBSCRIPTION:proposition(true),CONSUMER_SUBSCRIPTION:proposition(true),TARGET_MARKET:proposition(null,'UNRESOLVED')};return {prices:{DE:{id,propositions}},needs:[{id:`DE:${id}:TARGET_MARKET`,proposition:'TARGET_MARKET',market:'DE',offerId:id,state:'UNRESOLVED'}]};}
function multiResource(){const pricing='https://provider.example/pricing',family='https://provider.example/family',pricingHash='b'.repeat(64),familyHash='c'.repeat(64),value=target({urls:[pricing,family],reads:[page(pricing,pricingHash),page(family,familyHash)]}),pricingRow=direct(pricing,pricingHash,'pricing-direct',preciseTruth()),familyRow=direct(family,familyHash,'family-direct',genericTruth('family'));
 value.providerInterpretations=[pricingRow];acceptV3TruthNeeds(value,pricingRow);value.providerInterpretations.push(familyRow);acceptV3TruthNeeds(value,familyRow);return {value,pricing,family,pricingHash,familyHash};}

test('later family interpretation cannot displace a precise pricing objective',()=>{const {value,pricing,family}=multiResource();assert(pendingV3MarketProof(value,pricing));assert(targetMarketAcquisition(value,pricing));assert.equal(targetMarketAcquisition(value,family),null);assert.equal(planResearch(value).url,pricing);});

test('later article remains separate from the pricing resource objective',()=>{const fixture=multiResource(),article='https://provider.example/article',articleHash='d'.repeat(64),articleRow=direct(article,articleHash,'article-direct',genericTruth('article'));fixture.value.urls=[fixture.pricing,article];fixture.value.reads=[page(fixture.pricing,fixture.pricingHash),page(article,articleHash)];fixture.value.providerInterpretations=[fixture.value.providerInterpretations[0],articleRow];acceptV3TruthNeeds(fixture.value,articleRow);assert(targetMarketAcquisition(fixture.value,fixture.pricing));assert.equal(targetMarketAcquisition(fixture.value,article),null);assert.equal(planResearch(fixture.value).url,fixture.pricing);});

test('separate Services cannot acquire each other source resources',()=>{const aUrl='https://provider.example/service-a',bUrl='https://provider.example/service-b',aHash='e'.repeat(64),bHash='f'.repeat(64),make=(service,ownUrl,ownHash,otherUrl)=>target({id:`${service}-DE`,service,serviceName:service,urls:[ownUrl,otherUrl],authorities:[{...authority,provider:service,sourceUrl:ownUrl}],reads:[page(ownUrl,ownHash),page(otherUrl,service==='service-a'?bHash:aHash)],providerInterpretations:[direct(ownUrl,ownHash,`${service}-direct`,genericTruth(service))],v3Observation:direct(ownUrl,ownHash,`${service}-direct`,genericTruth(service)).v3Observation,v3Truth:genericTruth(service)}),a=make('service-a',aUrl,aHash,bUrl),b=make('service-b',bUrl,bHash,aUrl);assert(targetMarketAcquisition(a,aUrl));assert.equal(targetMarketAcquisition(a,bUrl),null);assert(targetMarketAcquisition(b,bUrl));assert.equal(targetMarketAcquisition(b,aUrl),null);});

test('multiple generic unresolved resources retain ownership and advance without repetition',()=>{const first='https://provider.example/first',second='https://provider.example/second',firstHash='1'.repeat(64),secondHash='2'.repeat(64),firstRow=direct(first,firstHash,'first-direct',genericTruth('first')),secondRow=direct(second,secondHash,'second-direct',genericTruth('second')),value=target({urls:[first,second],reads:[page(first,firstHash),page(second,secondHash)],providerInterpretations:[firstRow,secondRow],v3Observation:secondRow.v3Observation,v3Truth:secondRow.v3Truth});assert.equal(unresolvedV3TargetNeed(value,first).hash,firstHash);assert.equal(unresolvedV3TargetNeed(value,second).hash,secondHash);assert.equal(planResearch(value).url,first);value.acquisitionOutcomes=[{url:first,classification:'MARKET_UNRESOLVED'}];assert.equal(executableAction(value,{route:'DECODO',url:first}).reason,'EQUIVALENT_RESOURCE_ALREADY_ATTEMPTED');assert.equal(planResearch(value).url,second);});

function projectedMarketTarget(){
 const identity={service:'fixture',market:'DE',plan:'Personal',amount:'12',currency:'EUR',interval:'P1M',scope:{},sourceHash:hash,sourceUrl:url,path:'$/main/section[0]'},objective={key:digest(JSON.stringify(identity)),identity,status:'MARKET_NOT_VERIFIED',missingFact:'MARKET_PROOF',established:['AUTHORITY','IDENTITY','COMMERCIAL_MEANING','VALUE_AND_CADENCE','PROVENANCE']},occurrenceAuthority={...authority,status:'CONFIGURED_REVIEWED',sourceUrl:url};
 return target({leads:[{url,title:'Personal subscription',rank:0}],providerSeedCandidateServiceContext:{objectiveResource:{url}},providerInterpretations:[direct(url,hash,'projected-owner',genericTruth('projected'))],marketProof:{version:1,meaning:'PLANNING_ONLY_REOPEN_SOURCES_FOR_VERIFICATION',objectives:[objective],sources:[{sha256:hash,occurrences:[{id:'occurrence',service:'fixture',market:'DE',taskId:'fixture-price-DE',url,authority:occurrenceAuthority}]}],leads:[]}});
}

test('projected Phase 1 market objective keeps its exact Direct owner and schedules country acquisition',()=>{
 const value=projectedMarketTarget(),objective=pendingV3MarketProof(value,url);assert(objective);assert.equal(objective.identity.plan,'Personal');assert.equal(objective.identity.amount,'12');assert.equal(objective.identity.currency,'EUR');
 assert.deepEqual(targetMarketAcquisition(value,url)?.marketProofIdentityKeys,[objective.key]);const plan=planResearch(value);assert.equal(plan.route,'DECODO');assert.equal(plan.url,url);assert.equal(plan.reason,'TARGET_MARKET_OBSERVATION_REQUIRED');
});

test('projected market owner fails closed when any exact source ownership join is changed',()=>{
 const cases=[
  ['source hash',value=>{value.marketProof.sources[0].sha256='b'.repeat(64);}],
  ['occurrence URL',value=>{value.marketProof.sources[0].occurrences[0].url='https://provider.example/other';}],
  ['service',value=>{value.marketProof.sources[0].occurrences[0].service='other';}],
  ['market',value=>{value.marketProof.sources[0].occurrences[0].market='NO';}],
  ['task',value=>{value.marketProof.sources[0].occurrences[0].taskId='other';}],
  ['authority host',value=>{value.marketProof.sources[0].occurrences[0].authority.hostname='other.example';}],
  ['Direct owner',value=>{value.providerInterpretations[0].v3Observation.sha256='c'.repeat(64);value.v3Observation.sha256='c'.repeat(64);}],
  ['read final URL',value=>{value.reads[0].url='https://provider.example/other';}],
 ];
 for(const [label,mutate] of cases){const value=projectedMarketTarget();mutate(value);assert.equal(pendingV3MarketProof(value,url),null,label);assert.equal(targetMarketAcquisition(value,url),null,label);}
});

test('a completed Direct read of the owned market resource does not displace its distinct country action',()=>{
 const value=projectedMarketTarget(),plan=planResearch(value);assert.equal(value.reads[0].url,url);assert.equal(plan.route,'DECODO');assert.match(executableAction(value,{route:'DIRECT',url}).reason,/EQUIVALENT_RESOURCE_ALREADY_(?:READ|ATTEMPTED)/);assert.equal(executableAction(value,{route:'DECODO',url}).executable,true);
});
