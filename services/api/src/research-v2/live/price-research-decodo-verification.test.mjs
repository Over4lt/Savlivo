import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {planResearch} from './research-planner.mjs';
import {priceResearchDecodoVerification} from './information-routing.mjs';
import {executableAction} from './execution-capabilities.mjs';
import {runOpenWebResearch} from './open-web-discovery.mjs';
import {createTavilyDiscovery} from './tavily-discovery.mjs';
import {initializeAdaptiveState,assessAdaptiveService,runAdaptiveCampaign} from '../inventory/adaptive-campaign.mjs';

const url='https://provider.example/pricing';
const authority={hostname:'provider.example',provider:'Provider',sourceType:'OFFICIAL_PROVIDER',sourceUrl:url,checkedAt:'2026-10-01T00:00:00.000Z'};
const target=(market='DE',extra={})=>({id:`provider-${market}`,service:'provider',serviceName:'Provider',market,operationsObjective:'PRICE_RESEARCH',researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},urls:[url],leads:[{url,title:'Provider pricing',rank:0}],knownCommercialUrls:[url],authorities:[authority],gaps:['amount'],reads:[],queries:[],decisions:[],verified:[],blockedOrigins:[],capabilities:{direct:true,tavily:false,decodo:true,browser:false,groq:false},...extra});
const temp=t=>{const directory=fs.mkdtempSync(path.join(os.tmpdir(),'price-decodo-verification-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));return directory;};
const fail=()=>{throw Error('UNEXPECTED_TRANSPORT');};
const admitted={eligible:true,url,authority:{validated:true,hostname:'provider.example'}};
const page=()=>({url,outcome:'OK',accessDecisions:[{decision:'ALLOWED'}],rawSource:{text:'<h1>Provider pricing</h1><p>EUR 12 monthly</p>'}});
const direct=()=>({classification:'VERIFIED',verified:[{id:'direct-price',amount:12}],monetary:1,blockers:[]});
const run=(t,x=target(),acquire=async()=>({classification:'COMMERCIAL_FIELDS_INSUFFICIENT',verified:[]}))=>runOpenWebResearch({directory:temp(t),targets:[x],search:fail,read:async()=>page(),classify:async()=>admitted,consumeProvider:async()=>direct(),acquire,maxActions:3});

test('A/B/C/M: Direct verified is retained and a single bounded Decodo attempt still runs',async t=>{
 const calls=[];const state=await run(t,target(),async args=>{calls.push(args);return {classification:'VERIFIED',verified:[{id:'decodo-price',amount:12}]};});
 const result=state.targets[0];assert.equal(calls.length,1);assert.equal(calls[0].reason,'PRICE_RESEARCH_VERIFICATION_REQUIRED');
 assert.deepEqual(result.verified.map(row=>row.id),['direct-price','decodo-price']);assert.equal(result.decodoVerification.status,'ATTEMPTED');
 assert.equal(result.decisions.filter(row=>row.route==='DECODO'&&row.acquisitionReserved).length,1);assert.equal(state.usage.acquisitions,1);
 assert.equal(planResearch(result).route==='DECODO',false);
});

test('E: Decodo transport failure stays target-local and does not remove Direct verified',async t=>{
 const state=await run(t,target(),async()=>{throw Error('DECODO_TIMEOUT');}),result=state.targets[0];
 assert.deepEqual(result.verified.map(row=>row.id),['direct-price']);assert.equal(result.acquisitionOutcomes[0].classification,'ACQUISITION_FAILED');
 assert.equal(result.acquisitionOutcomes[0].blockers[0],'DECODO_TIMEOUT');assert.equal(result.decodoVerification.status,'ATTEMPTED');
});

test('F: disabled Decodo records an unavailable diagnostic without suppressing Direct verified',async t=>{
 const state=await run(t,target('DE',{capabilities:{direct:true,tavily:false,decodo:false,browser:false,groq:false}}),fail);
 assert.deepEqual(state.targets[0].verified.map(row=>row.id),['direct-price']);assert.equal(state.targets[0].decodoVerification.status,'UNAVAILABLE');
 assert.equal(state.targets[0].decodoVerification.reason,'INDEPENDENT_DECODO_PERMISSION_REQUIRED');assert.equal(state.usage.acquisitions,0);
});

test('G/H: only provider-authorized URLs are eligible for required verification',()=>{
 const other='https://third-party.example/pricing',x=target('DE',{urls:[other],leads:[{url:other,title:'Provider pricing'}],knownCommercialUrls:[],authorities:[authority]});
 assert.equal(priceResearchDecodoVerification(x).status,'UNAVAILABLE');assert.equal(planResearch(x).route==='DECODO',false);
 assert.equal(executableAction(x,{route:'DECODO',url:other,reason:'PRICE_RESEARCH_VERIFICATION_REQUIRED'}).reason,'AUTHORITY_UNRESOLVED');
});

test('policy stop and budget exhaustion report why the required acquisition was skipped',()=>{
 const blocked=target('DE',{blockedOrigins:['https://provider.example']});assert.deepEqual(priceResearchDecodoVerification(blocked),{status:'UNAVAILABLE',reason:'PROVIDER_ACCESS_POLICY_STOP'});
 const pathDenied=target('DE',{reads:[{requestedUrl:url,outcome:'ACCESS_CONTROL_STOP'}]});assert.equal(priceResearchDecodoVerification(pathDenied).reason,'ACCESS_CONTROL_PATH_STOP');
 const exhausted=priceResearchDecodoVerification(target(),{executionContext:{bounds:{bytes:1024,bytesPerPage:1024,acquisitions:0,perServiceAcquisitions:0},usage:{bytes:0,acquisitions:0}}});
 assert.equal(exhausted.status,'UNAVAILABLE');assert.equal(exhausted.reason,'DECODO_BUDGET_EXHAUSTED');
});

test('I: required acquisition enters the existing bounded V3 child, without Direct failure proof',async t=>{
 const directory=temp(t),marker=Error('CHILD_REACHED'),x=target();let called=0;
 const adapter=(await createTavilyDiscovery({inventory:[x],searchEnabled:false})).bind({dir:directory,runtime:{},bundle:{transport:{},verifier:{url:'https://exit.example/check'}},runLive:async args=>{called++;assert.equal(args.maxRetries,0);assert.equal(args.inventory[0].onlineDiscoveryProof.url,url);throw marker;}});
 await assert.rejects(adapter.acquire({target:x,candidate:{url,authority:admitted},route:'DECODO',reason:'PRICE_RESEARCH_VERIFICATION_REQUIRED'}),error=>error===marker);
 assert.equal(called,1);const journal=fs.readFileSync(path.join(directory,'open-web-discovery','acquisition-budget','discovery-journal.jsonl'),'utf8');assert.match(journal,/PRICE_RESEARCH_DECODO_ADMITTED/);
});

test('N: sufficient Direct price cannot stop adaptive planning before the required attempt',()=>{
 const x=target('DE',{verified:[{id:'direct-price'}],retainedPriceReview:{sourceBound:true,confidence:'HIGH',market:'DE',amount:12,currency:'EUR',sourceHash:'a'.repeat(64)}});
 const state=initializeAdaptiveState({targets:[x],conditionalFollowupTargets:[]});const assessment=assessAdaptiveService(state,'provider');
 assert.equal(assessment.next?.plan.route,'DECODO');assert.equal(assessment.next?.plan.reason,'PRICE_RESEARCH_VERIFICATION_REQUIRED');
 assert.notEqual(assessment.stop?.reason,'NO_EXECUTABLE_PROGRESS_RECONCILE');
});

test('classifier rejection is a persisted unavailable diagnostic, not a Decodo attempt',async t=>{
 const x=target(),state=await runAdaptiveCampaign({directory:temp(t),manifest:{targets:[x],conditionalFollowupTargets:[]},createAdapters:async()=>({read:async()=>page(),search:fail,classify:async({page:source})=>source.outcome==='OK'?admitted:{eligible:false,reason:'OWNERSHIP_UNPROVEN'},consumeProvider:async()=>direct(),acquire:fail})});
 assert.deepEqual(state.targets[x.id].verified.map(row=>row.id),['direct-price']);
 assert.deepEqual(state.targets[x.id].decodoVerification,{status:'UNAVAILABLE',url,reason:'PROVIDER_AUTHORITY_REJECTED'});
 assert.equal(state.services.provider.used.acquisitions,0);assert.notEqual(state.services.provider.stop?.reason,'NO_EXECUTABLE_PROGRESS_RECONCILE');
});

test('L: failed Decodo acquisition does not prevent a sibling target from running',async t=>{
 const calls=[];const manifest={targets:[target('DE'),target('FR')],conditionalFollowupTargets:[]};
 const state=await runAdaptiveCampaign({directory:temp(t),manifest,createAdapters:async()=>({read:async()=>page(),search:fail,classify:async()=>admitted,consumeProvider:async()=>direct(),acquire:async({target:current})=>{calls.push(current.market);if(current.market==='DE')throw Error('DECODO_TIMEOUT');return {classification:'VERIFIED',verified:[{id:'fr-decodo'}]};}})});
 assert.deepEqual(calls.sort(),['DE','FR'],JSON.stringify({decisions:state.decisions,services:state.services,fr:state.targets['provider-FR'].decodoVerification}));assert.equal(state.targets['provider-DE'].decodoVerification.status,'ATTEMPTED');
 assert.deepEqual(state.targets['provider-DE'].verified.map(row=>row.id),['direct-price']);assert(state.targets['provider-FR'].verified.some(row=>row.id==='fr-decodo'));
 assert.equal(state.services.provider.used.acquisitions,2);
});
