import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {planResearch} from './research-planner.mjs';
import {equivalentCountryAcquisitionAttempted,executableAction} from './execution-capabilities.mjs';
import {priceResearchAcquisitionCandidate} from './price-research-candidate.mjs';
import {runOpenWebResearch} from './open-web-discovery.mjs';
import {interactiveNavigationDestination,interactiveRouteRequiresBrowser} from './interactive-research-route.mjs';

const specific={id:'11111111-1111-4111-8111-111111111111',url:'https://streamco.example/no-pricing',kind:'DIRECT_SOURCE',marketScope:'MARKET_SPECIFIC',marketCode:'NO',enabled:true,truthAuthority:'NONE'};
const global={id:'22222222-2222-4222-8222-222222222222',url:'https://streamco.example/pricing',kind:'INTERACTIVE_ROUTE',marketScope:'GLOBAL',marketCode:null,enabled:true,truthAuthority:'NONE'};
const target=(market='NO',extras={})=>({id:'streamco-'+market,service:'streamco',serviceName:'StreamCo',market,operationsObjective:'PRICE_RESEARCH',researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},capabilities:{direct:true,tavily:true,decodo:true,browser:false,groq:false},authorities:[],urls:[],leads:[],knownCommercialUrls:[],reads:[],queries:[],decisions:[],verified:[],blockedOrigins:[],researchLinks:[specific,global],researchLinkOutcomes:[],persistedVerifiedCount:0,gaps:['plan','amount','currency','cadence','priceRole','ownership','market'],...extras});
const temporary=t=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'research-links-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;};
const never=()=>{throw Error('BROAD_DISCOVERY_SHOULD_NOT_RUN');};

test('Research links rank specific before global and Decodo before Direct or discovery',()=>{
 const no=target(),se=target('SE');assert.equal(planResearch(no).url,specific.url);assert.equal(planResearch(no).route,'DECODO');assert.equal(planResearch(se).url,global.url);assert.equal(planResearch(se).route,'DECODO');
 assert.equal(executableAction(no,planResearch(no)).executable,true);assert.equal(priceResearchAcquisitionCandidate(no,specific.url).truthAuthority,'NONE');
 assert.equal(priceResearchAcquisitionCandidate(se,specific.url),null);
});

test('learned Decodo methods precede discovery and fall through to the next proven method',async t=>{
 const first='https://streamco.example/no/plans',second='https://streamco.example/no/pricing',trace={loaded:2,relevant:2,attempted:[],rejected:[],fallbackReason:null,verifiedStrategyId:null};
 const x=target('NO',{researchLinks:[],urls:[first,second],leads:[first,second].map(url=>({url,learnedProviderPricingRoute:true,routingRole:'PRICING'})),learnedPricingStrategies:[{id:'first',market:'NO',url:first,method:'DECODO'},{id:'second',market:'NO',url:second,method:'DECODO'}],learnedStrategyTrace:trace});
 assert.equal(planResearch(x).route,'DECODO');assert.equal(planResearch(x).url,first);
 const calls=[],adapters={directory:temporary(t),targets:[x],search:never,read:never,acquire:async({candidate,target:current})=>{calls.push([candidate.url,current.market]);return {classification:'CONTENT_NOT_COMMERCIAL',sourceClassification:{status:'PROVIDER_SOURCE'},verified:[],acquisitionBytes:0};}};
 const one=await runOpenWebResearch({...adapters,maxActions:1});assert.deepEqual(calls,[[first,'NO']]);assert.equal(one.targets[0].learnedStrategyTrace.attempted[0].id,'first');
 const two=await runOpenWebResearch({...adapters,maxActions:1});assert.deepEqual(calls,[[first,'NO'],[second,'NO']]);assert.equal(two.targets[0].learnedStrategyTrace.attempted[1].id,'second');
 assert.equal(two.targets[0].learnedStrategyTrace.verifiedStrategyId,null);assert.equal(planResearch(two.targets[0]).route!=='DECODO'||planResearch(two.targets[0]).url!==first,true);
});

test('a different source already Verified in the target cannot mark a failed learned method successful',async t=>{
 const url='https://streamco.example/no/learned',hash='a'.repeat(64),observation={id:'independent-source',url:'https://streamco.example/no/other',sha256:hash,context:{transport:'DECODO'}},reference={observation:observation.id,sha256:hash};
 const values={SERVICE_IDENTITY:'streamco',PRICE_AMOUNT:129,CURRENCY:'NOK',MONTHLY_CADENCE:true,MONTHLY_SUBSCRIPTION:true,CONSUMER_SUBSCRIPTION:true,TARGET_MARKET:'NO'};
 const propositions=Object.fromEntries(Object.entries(values).map(([key,value])=>[key,{state:'ESTABLISHED',value,evidence:[{reference}]}]));
 const priorTruth={eligibility:{NO:{result:'ELIGIBLE'}},offers:[{id:'existing-plan',market:'NO',propositions}]};
 const x=target('NO',{researchLinks:[],urls:[url],leads:[{url,learnedProviderPricingRoute:true,routingRole:'PRICING'}],learnedPricingStrategies:[{id:'learned',market:'NO',url,method:'DECODO'}],learnedStrategyTrace:{loaded:1,relevant:1,attempted:[],rejected:[],fallbackReason:null,verifiedStrategyId:null}});
 const result=await runOpenWebResearch({directory:temporary(t),targets:[x],maxActions:1,search:never,read:never,acquire:async({target:current})=>{current.v3Observation=observation;current.v3Truth=priorTruth;return {classification:'CONTENT_NOT_COMMERCIAL',verified:[],acquisitionBytes:0};}});
 assert.equal(result.targets[0].learnedStrategyTrace.attempted[0].result,'CONTENT_NOT_COMMERCIAL');
 assert.equal(result.targets[0].learnedStrategyTrace.verifiedStrategyId,null);
});

test('learned method selection respects capability, proof identity and acquisition budget',()=>{
 const url='https://streamco.example/no/pricing',strategy={id:'documented',market:'NO',url,method:'DECODO'};
 const x=target('NO',{researchLinks:[],urls:[url],leads:[{url,learnedProviderPricingRoute:true,routingRole:'PRICING'}],learnedPricingStrategies:[strategy],learnedStrategyTrace:{loaded:1,relevant:1,attempted:[],rejected:[],fallbackReason:null,verifiedStrategyId:null}});
 assert.equal(planResearch(x).learnedStrategyId,'documented');
 assert.equal(executableAction(x,{route:'DECODO',url,reason:'PRICE_RESEARCH_VERIFICATION_REQUIRED',learnedStrategyId:'forged'}).executable,true,'the first standard verification request remains independently available');
 const prior={url:'https://streamco.example/no/other',route:'DECODO',acquisitionReserved:true};
 assert.equal(executableAction({...x,decisions:[prior]},{route:'DECODO',url,reason:'PRICE_RESEARCH_VERIFICATION_REQUIRED',learnedStrategyId:'forged'}).reason,'EQUIVALENT_RESOURCE_ALREADY_ATTEMPTED');
 assert.equal(executableAction({...x,decisions:[prior]},{route:'DECODO',url,reason:'PRICE_RESEARCH_VERIFICATION_REQUIRED',learnedStrategyId:'documented'}).executable,true);
 assert.equal(executableAction({...x,decisions:[prior]},{route:'DECODO',url,reason:'PRICE_RESEARCH_VERIFICATION_REQUIRED',learnedStrategyId:'documented'},{bounds:{bytes:1,bytesPerPage:1,acquisitions:1,perServiceAcquisitions:1},usage:{bytes:0,acquisitions:1}}).reason,'DECODO_BUDGET_EXHAUSTED');
 const disabled=target('NO',{researchLinks:[],urls:[url],leads:x.leads,learnedPricingStrategies:[strategy],learnedStrategyTrace:{loaded:1,relevant:1,attempted:[],rejected:[],fallbackReason:null,verifiedStrategyId:null},capabilities:{direct:true,tavily:false,decodo:false,browser:false}});
 assert.notEqual(planResearch(disabled).route,'DECODO');assert.equal(disabled.learnedStrategyTrace.rejected[0].reason,'INDEPENDENT_DECODO_PERMISSION_REQUIRED');
});

test('a remembered Browser strategy cannot render without a current selector link',()=>{
 const url='https://streamco.example/pricing?redirect=true',x=target('NO',{researchLinks:[],learnedPricingStrategies:[{id:'browser',market:'NO',url,method:'BROWSER'}],learnedStrategyTrace:{loaded:1,relevant:1,attempted:[],rejected:[],fallbackReason:null,verifiedStrategyId:null}});
 assert.notEqual(planResearch(x).route,'PARK_RENDERING');assert.equal(x.learnedStrategyTrace.rejected[0].reason,'CURRENT_SELECTOR_RESEARCH_LINK_REQUIRED');
 const configured=target('NO',{researchLinks:[{...global,url}],capabilities:{direct:true,tavily:false,decodo:true,browser:true},learnedPricingStrategies:x.learnedPricingStrategies,learnedStrategyTrace:{loaded:1,relevant:1,attempted:[],rejected:[],fallbackReason:null,verifiedStrategyId:null}});
 assert.equal(planResearch(configured).route,'DIRECT');assert.equal(planResearch(configured).reason,'PROVIDER_MARKET_SELECTOR_PROBE');
});

test('Decodo disabled records diagnostic and falls through to ordinary discovery without Direct-first link',()=>{
 const x=target('NO',{capabilities:{direct:true,tavily:true,decodo:false,browser:false,groq:false}}),plan=planResearch(x);
 assert.equal(x.researchLinkOutcomes.length,2);assert(x.researchLinkOutcomes.every(row=>row.result==='DECODO_UNAVAILABLE'&&row.decodoAttempted===false));assert.notEqual(plan.route,'DECODO');assert.notEqual(plan.url,specific.url);
});

test('one target acquires a link once, preserves diagnostics and resumes without duplicate Decodo',async t=>{
 const directory=temporary(t),x=target(),calls=[],adapters={directory,targets:[x],maxActions:1,search:never,read:never,acquire:async({route,reason,candidate,target:current})=>{calls.push([route,reason,candidate.url,current.market,candidate.authority.truthAuthority]);return {classification:'CONTENT_NOT_COMMERCIAL',sourceClassification:{status:'PROVIDER_SOURCE'},verified:[],acquisitionBytes:0};}};
 const first=await runOpenWebResearch(adapters);assert.deepEqual(calls,[['DECODO','PRICE_RESEARCH_VERIFICATION_REQUIRED',specific.url,'NO','NONE']]);assert.equal(first.targets[0].researchLinkOutcomes[0].result,'PROVIDER_SOURCE_NO_VERIFIED');
 const resumed=await runOpenWebResearch({...adapters,maxActions:1});assert.equal(calls.length,2);assert.equal(calls[1][2],global.url);assert.equal(resumed.targets[0].researchLinkOutcomes.length,2);
 await runOpenWebResearch({...adapters,maxActions:1,search:async()=>({results:[]})});assert.equal(calls.length,2);
});

test('genuine Decodo exception retains a bounded blocker and permits ordinary fallback',async t=>{
 const x=target('NO',{researchLinks:[specific]}),state=await runOpenWebResearch({directory:temporary(t),targets:[x],maxActions:1,search:never,read:never,acquire:async()=>{throw Object.assign(Error('untrusted detail'),{code:'DECODO_TIMEOUT'});}});
 const current=state.targets[0];assert.equal(current.researchLinkOutcomes[0].result,'ACQUISITION_FAILED');assert.equal(current.researchLinkOutcomes[0].reason,'DECODO_TIMEOUT');assert.equal(current.acquisitionOutcomes[0].classification,'ACQUISITION_FAILED');assert.deepEqual(current.acquisitionOutcomes[0].blockers,['DECODO_TIMEOUT']);assert.notEqual(planResearch(current)?.reason,'PRICE_RESEARCH_VERIFICATION_REQUIRED');
});

test('complete-body Decodo failure on an authorized Research Link schedules one same-country Browser acquisition',async t=>{
 const link={...specific},x=target('NO',{researchLinks:[link],authorities:[{hostname:'streamco.example',provider:'StreamCo',sourceType:'OFFICIAL_PROVIDER',checkedAt:'2026-10-01'}],capabilities:{direct:true,tavily:false,decodo:true,browser:true,groq:false}}),directory=temporary(t),calls={acquire:0,render:0};
 const adapters={directory,targets:[x],maxActions:1,search:never,read:never,acquire:async()=>{calls.acquire++;return {classification:'ACQUISITION_FAILED',sourceClassification:{status:'UNKNOWN_SOURCE',sourceHash:null},countryV3Evaluation:{status:'UNRESOLVED',reason:'SOURCE_NOT_RETAINED'},policy:[{attempts:[{failure:'RESPONSE_TOO_LARGE'}]}],browserReacquisitionRequired:true,blockers:['RESPONSE_TOO_LARGE'],verified:[],acquisitionBytes:0};},render:async({target:current,need})=>{calls.render++;assert.equal(need.kind,'DECODO_BROWSER_REACQUISITION');assert.equal(need.transport,'DECODO');assert.equal(need.market,'NO');assert.equal(need.sourceHash,null);assert.equal(need.researchLinkId,link.id);assert.equal(current.acquisitionOutcomes[0].responseTooLarge,true);return {outcome:'ACQUISITION_FAILED',reason:'BROWSER_TRANSPORT_UNAVAILABLE',truthState:'UNRESOLVED'};}};
 const first=await runOpenWebResearch(adapters),pending=first.targets[0];assert.equal(calls.acquire,1);assert.equal(pending.renderingNeed.kind,'DECODO_BROWSER_REACQUISITION');assert.equal(pending.researchLinkOutcomes[0].result,'BROWSER_CONTINUATION_REQUIRED');
 const second=await runOpenWebResearch(adapters);assert.equal(calls.render,1);assert.equal(calls.acquire,1);assert.equal(second.targets[0].researchLinkOutcomes[0].result,'BROWSER_FAILED');assert.equal(second.targets[0].verified.length,0);
});

test('post-acquisition interpretation failure preserves provider source and its blocker',async t=>{
 const x=target('NO',{researchLinks:[specific]}),state=await runOpenWebResearch({directory:temporary(t),targets:[x],maxActions:1,search:never,read:never,acquire:async()=>({classification:'INTERPRETATION_FAILED',sourceClassification:{status:'PROVIDER_SOURCE',reason:'SAME_PROVIDER_REGISTRABLE_DOMAIN'},countryV3Evaluation:{status:'UNRESOLVED',reason:'V2_INTERPRETATION_FAILED'},blockers:['V2_INTERPRETATION_FAILED'],verified:[]})});
 const current=state.targets[0];assert.equal(current.researchLinkOutcomes[0].result,'INTERPRETATION_FAILED');assert.equal(current.researchLinkOutcomes[0].sourceClassification,'PROVIDER_SOURCE');assert.equal(current.researchLinkOutcomes[0].sourceReason,'SAME_PROVIDER_REGISTRABLE_DOMAIN');assert.equal(current.researchLinkOutcomes[0].reason,'V2_INTERPRETATION_FAILED');assert.equal(current.acquisitionOutcomes[0].countryV3Evaluation.reason,'V2_INTERPRETATION_FAILED');
});

test('GLOBAL route acquires NO and SE separately and never shares target market observation',async t=>{
 const seen=[];for(const market of ['NO','SE'])await runOpenWebResearch({directory:path.join(temporary(t),market),targets:[target(market,{researchLinks:[global]})],maxActions:1,search:never,read:never,acquire:async({target:current})=>{seen.push(current.market);return {classification:'CONTENT_NOT_COMMERCIAL',sourceClassification:{status:'UNKNOWN_SOURCE'},verified:[]};}});
 assert.deepEqual(seen,['NO','SE']);
});

test('Browser market-state changes do not masquerade as Decodo requests, while actual country attempts remain deduped',()=>{
 const selector={...global,url:'https://streamco.example/pricing?redirect=true'},url=selector.url,sourceHash='a'.repeat(64),afterHash='b'.repeat(64);
 const selected=target('NO',{researchLinks:[selector],decisions:[{route:'BROWSER',url,acquisitionReserved:true}],renderingOutcomes:[{url,sourceHash,marketSelection:{kind:'PROVIDER_SELECTED_MARKET',targetMarket:'NO',finalSourceSha256:afterHash}}]});
 assert.equal(equivalentCountryAcquisitionAttempted(selected,url),false);
 assert.equal(equivalentCountryAcquisitionAttempted({...selected,decisions:[...selected.decisions,{route:'DECODO',url,acquisitionReserved:true}]},url),true);
 assert.equal(equivalentCountryAcquisitionAttempted({...selected,researchLinkOutcomes:[{id:selector.id,decodoAttempted:true,result:'BROWSER_FAILED'}]},url),true);
 assert.equal(equivalentCountryAcquisitionAttempted({...selected,researchLinkOutcomes:[{id:selector.id,decodoAttempted:true,result:'BROWSER_FAILED'}],renderingOutcomes:[{url,sourceHash:'c'.repeat(64)}]},url),true);
});

test('an acquired third-party or unknown page cannot inherit provider truth from a configured link',async t=>{
 for(const [source,result] of [['THIRD_PARTY_SOURCE','THIRD_PARTY_SOURCE'],['UNKNOWN_SOURCE','UNKNOWN_SOURCE']]){const state=await runOpenWebResearch({directory:temporary(t),targets:[target('NO',{researchLinks:[specific]})],maxActions:1,search:never,read:never,acquire:async()=>({classification:source,sourceClassification:{status:source},verified:[]})});assert.equal(state.targets[0].researchLinkOutcomes[0].result,result);assert.equal(state.targets[0].verified.length,0);}
});

test('interactive route navigation is derived from source-bound read-only provider anchors',()=>{
 const source='<a href="/plans">Choose plans</a><a href="https://other.example/pricing">Compare prices</a>';
 assert.equal(interactiveNavigationDestination(source,'https://streamco.example/signup'),'https://streamco.example/plans');
 assert.equal(interactiveNavigationDestination('<a href="/logout">Plans</a>','https://streamco.example/signup'),null);
 assert.equal(interactiveRouteRequiresBrowser('<button>Continue to plans</button>','https://streamco.example/signup'),true);
});

test('interactive route hands off to Browser when ready; disabled Browser keeps diagnostic and tries the next link',()=>{
 const used={id:specific.id,kind:specific.kind,scope:specific.marketScope,market:'NO',targetMarket:'NO',decodoAttempted:true,result:'BROWSER_CONTINUATION_REQUIRED'},renderingNeed={kind:'RENDERED_REPRESENTATION',url:specific.url,transport:'DECODO',market:'NO',sourceHash:'a'.repeat(64),runDirectory:'/tmp/retained',navigationUrl:'https://streamco.example/plans'};
 const ready=target('NO',{researchLinkOutcomes:[used],demonstratedRendering:true,renderingNeed,capabilities:{direct:true,tavily:true,decodo:true,browser:true,groq:false}});
 assert.equal(planResearch(ready).route,'PARK_RENDERING');
 const disabled=target('NO',{researchLinkOutcomes:[used],demonstratedRendering:true,renderingNeed,capabilities:{direct:true,tavily:true,decodo:true,browser:false,groq:false}});
 assert.equal(planResearch(disabled).url,global.url);assert.equal(disabled.renderingOutcomes[0].reason,'BROWSER_DISABLED');assert.equal(disabled.researchLinkOutcomes[0].result,'BROWSER_CONTINUATION_REQUIRED');
});
