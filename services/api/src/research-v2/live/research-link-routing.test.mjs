import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {planResearch} from './research-planner.mjs';
import {executableAction} from './execution-capabilities.mjs';
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

test('post-acquisition interpretation failure preserves provider source and its blocker',async t=>{
 const x=target('NO',{researchLinks:[specific]}),state=await runOpenWebResearch({directory:temporary(t),targets:[x],maxActions:1,search:never,read:never,acquire:async()=>({classification:'INTERPRETATION_FAILED',sourceClassification:{status:'PROVIDER_SOURCE',reason:'SAME_PROVIDER_REGISTRABLE_DOMAIN'},countryV3Evaluation:{status:'UNRESOLVED',reason:'V2_INTERPRETATION_FAILED'},blockers:['V2_INTERPRETATION_FAILED'],verified:[]})});
 const current=state.targets[0];assert.equal(current.researchLinkOutcomes[0].result,'INTERPRETATION_FAILED');assert.equal(current.researchLinkOutcomes[0].sourceClassification,'PROVIDER_SOURCE');assert.equal(current.researchLinkOutcomes[0].sourceReason,'SAME_PROVIDER_REGISTRABLE_DOMAIN');assert.equal(current.researchLinkOutcomes[0].reason,'V2_INTERPRETATION_FAILED');assert.equal(current.acquisitionOutcomes[0].countryV3Evaluation.reason,'V2_INTERPRETATION_FAILED');
});

test('GLOBAL route acquires NO and SE separately and never shares target market observation',async t=>{
 const seen=[];for(const market of ['NO','SE'])await runOpenWebResearch({directory:path.join(temporary(t),market),targets:[target(market,{researchLinks:[global]})],maxActions:1,search:never,read:never,acquire:async({target:current})=>{seen.push(current.market);return {classification:'CONTENT_NOT_COMMERCIAL',sourceClassification:{status:'UNKNOWN_SOURCE'},verified:[]};}});
 assert.deepEqual(seen,['NO','SE']);
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
