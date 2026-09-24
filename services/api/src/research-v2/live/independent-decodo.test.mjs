import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {planResearch} from './research-planner.mjs';
import {executableAction,executionBounds} from './execution-capabilities.mjs';
import {runOpenWebResearch} from './open-web-discovery.mjs';
import {runAdaptiveCampaign} from '../inventory/adaptive-campaign.mjs';
import {createTavilyDiscovery} from './tavily-discovery.mjs';
import {recoverInterrupted} from '../inventory/expansion-campaign.mjs';
const url='https://provider.example/plans';
const target=(c={})=>({id:'provider-price-DE',service:'provider',serviceName:'Provider',market:'DE',researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},urls:[url],authorities:[{hostname:'provider.example',provider:'Provider',sourceType:'OFFICIAL_PROVIDER',sourceUrl:url,checkedAt:'2026-01-01T00:00:00.000Z'}],capabilities:{direct:false,tavily:false,decodo:true,browser:false,groq:false,...c}});
const dir=t=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'independent-decodo-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));return d;};
const admitted={eligible:true,url,authority:{validated:true,hostname:'provider.example'}};
const fail=()=>{throw Error('FORBIDDEN_TRANSPORT');};
const run=(t,x={},extras={})=>runOpenWebResearch({directory:dir(t),targets:[target(x)],search:fail,read:fail,classify:async()=>admitted,acquire:async()=>({classification:'COMMERCIAL_FIELDS_INSUFFICIENT',verified:[]}),...extras});
test('known destination with Direct and Tavily OFF reserves Decodo only, once',async t=>{
 let calls=0;const state=await run(t,{}, {acquire:async a=>{calls++;assert.equal(a.route,'DECODO');assert.equal(a.reason,'DIRECT_PROHIBITED_DECODO_PERMITTED');assert.equal(a.direct,undefined);assert.equal(a.page,undefined);return {classification:'COMMERCIAL_FIELDS_INSUFFICIENT',verified:[]};}});
 assert.equal(calls,1);assert.deepEqual(state.usage,{searches:0,reads:0,acquisitions:1});assert.equal(state.targets[0].reads.length,0);assert.equal(state.targets[0].acquisitionOutcomes[0].channel,'INDEPENDENT_DECODO');assert.equal(state.targets[0].decisions[0].routingReason,'DIRECT_PROHIBITED_DECODO_PERMITTED');
});
test('Tavily discovery leads pass admission before Decodo; snippets are never evidence',async t=>{
 let acquired=0,classified=0;const x=target({tavily:true});x.urls=[];
 const state=await run(t,{}, {targets:[x],search:async()=>({results:[{url,title:'Provider subscription plans',content:'EUR 1 monthly verified'}]}),classify:async a=>{classified++;assert.equal(a.page.body,undefined);return admitted;},acquire:async()=>{acquired++;return {classification:'CONTENT_NOT_COMMERCIAL',verified:[]};}});
 assert.equal(acquired,1);assert.equal(classified,1);assert.equal(state.usage.reads,0);assert.equal(state.targets[0].verified.length,0);assert(state.targets[0].leads[0].snippetExcludedFromEvidence);
});
test('both acquisition permissions OFF permit discovery but no provider calls',async t=>{
 const state=await run(t,{decodo:false,tavily:true},{search:async()=>({results:[]}),acquire:fail});assert.equal(state.usage.acquisitions,0);assert.equal(state.usage.reads,0);assert.equal(state.targets[0].verified.length,0);
});
test('Direct ON prefers Direct and does not force Decodo',async t=>{
 let reads=0;const state=await run(t,{direct:true},{read:async()=>{reads++;return {url,outcome:'OK',body:'Provider plans'};},acquire:fail});assert.equal(reads,1);assert.equal(state.usage.acquisitions,0);
});
test('Decodo OFF blocks paid transport with Direct ON',async t=>{
 const state=await run(t,{direct:true,decodo:false},{read:async()=>({url,outcome:'OK',body:'Provider plans'}),acquire:undefined});assert.equal(state.usage.acquisitions,0);
});
test('destination rejection never reserves or invokes Decodo',async t=>{
 const state=await run(t,{}, {classify:async()=>({eligible:false,reason:'OWNERSHIP_UNPROVEN'}),acquire:fail});assert.equal(state.usage.acquisitions,0);assert.equal(state.targets[0].done,'OWNERSHIP_UNPROVEN');
});
for(const [name,update,reason]of [
 ['OFF',{capabilities:{direct:false,decodo:false}},'INDEPENDENT_DECODO_PERMISSION_REQUIRED'],
 ['Direct ON',{capabilities:{direct:true,decodo:true}},'INDEPENDENT_DECODO_PERMISSION_REQUIRED'],
 ['marketless',{market:null},'DECODO_ADMITTED_MARKET_REQUIRED'],
 ['authority',{authorities:[]},'AUTHORITY_UNRESOLVED'],
 ['blocked',{blockedOrigins:['https://provider.example']},'PROVIDER_ACCESS_POLICY_STOP'],
 ['duplicate',{acquisitionOutcomes:[{url}]},'EQUIVALENT_RESOURCE_ALREADY_ATTEMPTED'],
 ['reserved',{decisions:[{url,acquisitionReserved:true}]},'EQUIVALENT_RESOURCE_ALREADY_ATTEMPTED']
])test('independent gate rejects '+name,()=>assert.equal(executableAction({...target(),...update},{route:'DECODO',url}).reason,reason));
test('acquisition ceiling blocks paid route without claiming Direct budget',()=>assert.equal(executableAction(target(),{route:'DECODO',url},{bounds:{...executionBounds,perServiceAcquisitions:0}}).reason,'DECODO_BUDGET_EXHAUSTED'));
test('planner ignores unknown/unreviewed and foreign-locale destinations',()=>{for(const u of ['https://other.example/plans','https://provider.example/en-US/plans'])assert.notEqual(planResearch({...target(),urls:[u]}).route,'DECODO');});
test('already sufficient retained state does not acquire',async t=>{const x=target();x.retainedPriceReview={sourceBound:true,confidence:'HIGH',amount:'12.99',currency:'EUR',market:'DE',sourceHash:'a'.repeat(64)};const s=await run(t,{}, {targets:[x],acquire:fail});assert.equal(s.usage.acquisitions,0);assert.equal(s.targets[0].done,'SOURCE_BOUND_PRICE_ALREADY_AVAILABLE');});
test('adaptive campaign dispatches Decodo, preserves consumed count on re-entry',async t=>{
 let calls=0;const directory=dir(t),manifest={targets:[target()],conditionalFollowupTargets:[]},options={directory,manifest,createAdapters:async()=>({read:fail,search:fail,classify:async()=>admitted,acquire:async()=>{calls++;return {classification:'COMMERCIAL_FIELDS_INSUFFICIENT',verified:[]};}})};
 const first=await runAdaptiveCampaign(options);assert.equal(calls,1);assert.equal(first.services.provider.used.acquisitions,1);await runAdaptiveCampaign(options);assert.equal(calls,1);
});
test('interrupted reserved Decodo action remains reconciliation-only',async t=>{
 const directory=dir(t);await assert.rejects(runOpenWebResearch({directory,targets:[target()],read:fail,search:fail,classify:async()=>admitted,acquire:async()=>{throw Error('INTERRUPTED');}}),/INTERRUPTED/);
 const state=JSON.parse(fs.readFileSync(directory+'/state.json'));assert.equal(state.usage.acquisitions,1);assert.equal(state.pending.dispatched,true);assert.equal(recoverInterrupted(directory)[0],target().id);
 await runOpenWebResearch({directory,targets:[target()],read:fail,search:fail,acquire:fail});assert.equal(JSON.parse(fs.readFileSync(directory+'/state.json')).usage.acquisitions,1);
});
test('actual Decodo binding admits independent reason into existing zero-retry child stack',async t=>{
 const marker=Error('CHILD_OBSERVED'),directory=dir(t);let children=0;
 const adapter=(await createTavilyDiscovery({inventory:[target()],searchEnabled:false})).bind({dir:directory,runtime:{},bundle:{transport:{},verifier:{url:'https://exit.example/check'}},runLive:async args=>{children++;assert.equal(args.maxRetries,0);assert.equal(args.onlineDiscovery,false);assert.equal(args.coverageFallback,false);assert.equal(args.inventory[0].onlineDiscoveryProof.url,url);assert.deepEqual(args.inventory[0].urls,[url]);throw marker;}});
 await assert.rejects(adapter.acquire({target:target(),candidate:{url,authority:admitted},route:'DECODO',reason:'DIRECT_PROHIBITED_DECODO_PERMITTED'}),e=>e===marker);assert.equal(children,1);
 const journal=fs.readFileSync(directory+'/open-web-discovery/acquisition-budget/discovery-journal.jsonl','utf8');assert(journal.includes('INDEPENDENT_DECODO_ADMITTED'));assert(!journal.includes('GEO_ESCALATION_ELIGIBLE'));
 await assert.rejects(adapter.acquire({target:target(),candidate:{url,authority:admitted}}),/DISCOVERY_ACQUISITION_FAILURE_PROOF_REQUIRED/);
});
for(const [scenario,options,ceiling]of [['success',{},'10'],['robots',{robotsDeny:true},'10'],['access',{status:403},'10'],['geo mismatch',{countries:['US']},'10'],['cost ceiling',{},'0.01']])test('independent real Decodo stack: '+scenario,async t=>{
 const {decodoFixture,target:fixtureUrl,at}=await import('../../../../../docs/catalog/global-47/research-v1/decodo-test-fixtures.mjs');
 const {runLive}=await import('./runner.mjs');
 const directory=fs.mkdtempSync(path.join(process.cwd(),'.independent-decodo-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const f=decodoFixture({body:'<article><h2>Basic</h2><p>ZAR 99/month</p></article>',...options}),x={...target(),market:'ZA',urls:[fixtureUrl],authorities:[{hostname:new URL(fixtureUrl).hostname,provider:'Provider',sourceType:'OFFICIAL_PROVIDER',sourceUrl:fixtureUrl,checkedAt:at}]};
 const adapters=(await createTavilyDiscovery({inventory:[x],searchEnabled:false})).bind({dir:directory,runtime:{},bundle:f.bundle,runLive:args=>runLive({...args,clock:()=>at,dependencies:{...args.dependencies,authorization:()=>({currency:'USD',task:ceiling,market:ceiling,run:ceiling}),resolveHost:async()=>[{address:'93.184.216.34',family:4}]}})});
 const state=await runOpenWebResearch({...adapters,directory:directory+'/controller',targets:[x],read:fail,search:fail,maxActions:1});
 assert.equal(state.usage.reads,0);assert.equal(state.usage.acquisitions,1);assert.equal(state.targets[0].acquisitionOutcomes[0].channel,'INDEPENDENT_DECODO');if(scenario==='cost ceiling')assert.equal(f.events.length,0);else assert(f.events.length>0);
 const {iterateMarketRunRecords}=await import('../../research-v1/market-run-store.mjs');
 const child=state.targets[0].acquisitionOutcomes[0].runDirectory,records=[...iterateMarketRunRecords(child+'/journal')];
 if(scenario!=='success'){assert.equal(state.targets[0].verified.length,0);assert.equal(state.targets[0].retainedPriceReview,undefined);return;}
 assert(records.some(r=>r.type==='RESPONSE_CAPTURED'&&r.payload.url.endsWith('/robots.txt')));
 assert(records.some(r=>r.type==='RESPONSE_CAPTURED'&&r.payload.url===fixtureUrl));
 const result=records.find(r=>r.type==='V2_ACQUISITION_RESULT').payload.result;assert.equal(result.gap,null);assert(result.experimentalAcquisition);assert.equal(result.attempts[0].transportVerification.level,'BRACKET_VERIFIED');
 assert(fs.existsSync(child+'/interpretation-0001/targeted-verification.json'));
 assert(records.some(r=>r.type==='BUDGET_RESULT'));
});
test('qualifying Direct failure still dispatches fallback, not independent acquisition',async t=>{
 let paid=0;const state=await run(t,{direct:true},{read:async()=>({url,outcome:'UNRESOLVED',failure:{code:'TIMEOUT'},accessDecisions:[{decision:'ALLOWED'}]}),consumeProvider:async()=>({verified:[],needsGeo:true,blockers:['TIMEOUT']}),acquire:async a=>{paid++;assert.equal(a.route,undefined);assert.equal(a.direct.acquisitionEscalation.eligible,true);assert.equal(a.direct.acquisitionEscalation.primaryFailureReason,'DIRECT_ACCESS_FAILED');return {classification:'ACQUISITION_FAILED',verified:[]};}});
 assert.equal(paid,1);assert.equal(state.usage.reads,1);assert.equal(state.usage.acquisitions,1);
});
test('Direct failure never calls an injected paid adapter when Decodo permission is OFF',async t=>{
 const state=await run(t,{direct:true,decodo:false},{read:async()=>({url,outcome:'UNRESOLVED',failure:{code:'TIMEOUT'},accessDecisions:[{decision:'ALLOWED'}]}),consumeProvider:async()=>({verified:[],needsGeo:true,blockers:['TIMEOUT']}),acquire:fail});assert.equal(state.usage.acquisitions,0);
});
