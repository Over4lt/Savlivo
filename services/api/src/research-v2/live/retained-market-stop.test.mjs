import '../offline-replay/offline-guard.mjs';
import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {initializeAdaptiveState,assessAdaptiveService,runAdaptiveCampaign} from '../inventory/adaptive-campaign.mjs';
import {writeLifecycleDisposition} from '../inventory/lifecycle-continuation.mjs';
import {planResearch} from './research-planner.mjs';
const target=(market,status='TARGET_MISMATCH',confidence='HIGH')=>({id:'membership-'+market,service:'membership',serviceName:'Membership',market,researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},capabilities:{direct:true,tavily:true,decodo:false,browser:false,groq:false},urls:['https://provider.example/'+market+'/pricing'],authorities:[{provider:'Membership',hostname:'provider.example',sourceType:'OFFICIAL_PROVIDER',checkedAt:'2026-01-01'}],retainedPriceReview:{sourceBound:true,confidence,amount:'12.99',currency:'EUR',market:status==='ESTABLISHED'?market:null,objective:'SERVICE_COVERAGE',billingInterval:{normalized:'MONTH'},marketApplicability:{status,requestedMarket:market,allowedMarkets:status==='ESTABLISHED'?[market]:[]},exposure:{definitivePrice:true,marketTargeting:status==='ESTABLISHED',monthlyCanonical:status==='ESTABLISHED',requiresQualifiers:status!=='ESTABLISHED'}}});
const manifest=targets=>({targets,conditionalFollowupTargets:[]});
const directory=t=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'retained-market-stop-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));return d;};
function disposition(directory,state){return writeLifecycleDisposition({directory,handoff:{cohort:{manifest:{serviceIds:['membership']}},targets:[{service:'membership'}]},phases:{pricing:state},events:[],bootstrap:[],researchMarkets:{membership:Object.values(state.targets).map(t=>t.market)},executionComplete:state.complete})[0];}
for(const status of ['TARGET_MISMATCH','UNKNOWN'])test('retained '+status+' confidence cannot stop target or service',t=>{
 const x=target('US',status),s=initializeAdaptiveState(manifest([x])),a=assessAdaptiveService(s,'membership');
 assert.notEqual(planResearch(x).route,'RETAINED_SUFFICIENT');assert(a.next);assert.equal(a.stop,null);s.services.membership.stop=a.stop;
 assert.equal(disposition(directory(t),s).pricing[0].status,'UNRESOLVED');
});
for(const confidence of ['HIGH','MEDIUM'])test('one applicable '+confidence+' observation remains sufficient',t=>{
 const x=target('DE','ESTABLISHED',confidence),s=initializeAdaptiveState(manifest([x])),a=assessAdaptiveService(s,'membership');
 assert.equal(planResearch(x).route,'RETAINED_SUFFICIENT');assert.equal(a.stop.reason,confidence+'_SUFFICIENT');s.services.membership.stop=a.stop;
 assert.equal(disposition(directory(t),s).pricing[0].status,'ESTABLISHED');
});
test('five-market production shape cannot inherit one unlocalized HIGH stop',t=>{
 const ts=['US','CA','GB','DE','AU'].map(m=>target(m,m==='DE'?'UNKNOWN':'TARGET_MISMATCH')),s=initializeAdaptiveState(manifest(ts));
 const a=assessAdaptiveService(s,'membership');assert(a.next);assert.equal(a.stop,null);assert(a.rows.every(r=>r.reason!=='HIGH_SUFFICIENT'));
 assert(disposition(directory(t),s).pricing.every(p=>p.status==='UNRESOLVED'));
});
test('valid sibling remains satisfied while another market continues',t=>{
 const s=initializeAdaptiveState(manifest([target('DE','ESTABLISHED'),target('CA')])),a=assessAdaptiveService(s,'membership');
 assert.equal(a.rows.find(r=>r.market==='DE').reason,'HIGH_SUFFICIENT');assert.equal(a.next.market,'CA');assert.equal(a.stop,null);
 assert.deepEqual(disposition(directory(t),s).pricing.map(p=>p.status),['ESTABLISHED','UNRESOLVED']);
});
test('retained input interruption and resume preserve allowance and unresolved final semantics',async t=>{
 const d=directory(t),retained=target('AU','UNKNOWN'),m=manifest([{...retained,retainedPriceReview:undefined}]);let calls=0;
 const args={directory:d,manifest:m,retainedStates:[retained],limits:{reads:1,searches:0},createAdapters:async()=>({read:async({url})=>{calls++;return {url,outcome:'OK',body:'No price proposition here.'};},search:async()=>assert.fail('search budget is zero')})};
 await assert.rejects(runAdaptiveCampaign({...args,onTransition:event=>{if(event==='NATIVE_RESULT_PERSISTED')throw Error('INTERRUPT');}}),/INTERRUPT/);
 const before=JSON.parse(fs.readFileSync(d+'/adaptive-state.json'));const s=await runAdaptiveCampaign(args);
 assert.equal(calls,1);assert.equal(s.services.membership.used.reads,1);assert.equal(s.fingerprint,before.fingerprint);assert.notEqual(s.services.membership.stop.reason,'HIGH_SUFFICIENT');
 assert.equal(disposition(d,s).pricing[0].status,'UNRESOLVED');
});
test('another service with a scoped MEDIUM subscription preserves user-price preference',()=>{
 const x=target('GB','ESTABLISHED','MEDIUM');Object.assign(x,{id:'publication-GB',service:'publication',serviceName:'Publication',priceStrategy:'USER_PRICE_PREFERRED'});x.authorities[0].provider='Publication';x.retainedPriceReview.currency='GBP';
 assert.equal(assessAdaptiveService(initializeAdaptiveState(manifest([x])),'publication').stop.reason,'USER_PRICE_PREFERRED_SUFFICIENT');
 x.retainedPriceReview.marketApplicability.status='UNKNOWN';assert(assessAdaptiveService(initializeAdaptiveState(manifest([x])),'publication').next);
});
test('a satisfied sibling cannot label a service sufficient when another has no permitted action',()=>{
 const pending=target('US');pending.urls=[];pending.capabilities={direct:false,tavily:false,decodo:false,browser:false,groq:false};
 const a=assessAdaptiveService(initializeAdaptiveState(manifest([target('DE','ESTABLISHED'),pending])),'membership');
 assert.equal(a.next,null);assert.equal(a.stop.reason,'CAPABILITY_DISABLED_TAVILY');
});
