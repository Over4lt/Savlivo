import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {planResearch} from './research-planner.mjs';
import {executableAction,executionBounds} from './execution-capabilities.mjs';
import {runAdaptiveCampaign,initializeAdaptiveState,assessAdaptiveService} from '../inventory/adaptive-campaign.mjs';
import {createTavilyDiscovery} from './tavily-discovery.mjs';
import {runOpenWebResearch} from './open-web-discovery.mjs';
import {runLive} from './runner.mjs';
import {decodoFixture,target as fixtureUrl,at} from '../../../../../docs/catalog/global-47/research-v1/decodo-test-fixtures.mjs';
import {iterateMarketRunRecords} from '../../research-v1/market-run-store.mjs';
const url='https://provider.example/membership-terms';
const target=(market='NO',u=url)=>({id:'fixture-price-'+market,service:'fixture',serviceName:'Fixture',market,researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},urls:[u],leads:[{url:u,title:'Membership terms',rank:0}],authorities:[{provider:'Fixture',hostname:new URL(u).hostname,sourceType:'OFFICIAL_PROVIDER',checkedAt:at,sourceUrl:u}],capabilities:{direct:true,tavily:false,decodo:true,browser:false,groq:false},marketProof:{version:1,objectives:[{key:'basic',status:'MARKET_NOT_VERIFIED',identity:{plan:'Basic'}}]},reads:[{requestedUrl:u,url:u,outcome:'OK',accessDecisions:[{decision:'ALLOWED'}]}]});
const dir=t=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'semantic-geo-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));return d;};
const fail=async()=>assert.fail('unexpected transport');
test('successful permitted Direct plus pending market proof admits distinct geo action',()=>{const t=target();assert.equal(planResearch(t).reason,'TARGET_MARKET_OBSERVATION_REQUIRED');assert.equal(planResearch(t).route,'DECODO');assert(assessAdaptiveService(initializeAdaptiveState({targets:[t],conditionalFollowupTargets:[]}),'fixture').next);});
for(const [name,change] of [['no need',t=>delete t.marketProof],['established',t=>t.marketProof.objectives[0].status='MARKET_VERIFIED'],['disabled',t=>t.capabilities.decodo=false],['authority',t=>t.authorities=[]],['robots',t=>t.reads[0].accessDecisions=[{decision:'DENIED'}]],['unproven access',t=>delete t.reads[0].accessDecisions],['duplicate',t=>t.acquisitionOutcomes=[{url}]],['reserved',t=>t.decisions=[{url,acquisitionReserved:true}]]])test('no semantic geo action: '+name,()=>{const t=target();change(t);assert.notEqual(planResearch(t).route,'DECODO');});
test('fresh Direct retains preference and geo budget remains bounded',()=>{const t=target();t.urls.push('https://provider.example/membership');assert.equal(planResearch(t).route,'DIRECT');assert.equal(executableAction(target(),{route:'DECODO',url},{bounds:{...executionBounds,perServiceAcquisitions:0}}).reason,'DECODO_BUDGET_EXHAUSTED');});
test('same URL has independent country identities, completed geo resumes without repetition',async t=>{
 const targets=[target('NO'),target('SE')],manifest={targets,conditionalFollowupTargets:[]},directory=dir(t),calls=[];
 const a=assessAdaptiveService(initializeAdaptiveState(manifest),'fixture');assert.notEqual(a.rows[0].actionIdentity,a.rows[1].actionIdentity);
 const args={directory,manifest,createAdapters:async()=>({read:fail,search:fail,classify:async()=>({eligible:true}),acquire:async({target})=>{calls.push(target.market);return {verified:[],classification:'MARKET_UNRESOLVED'};}})};
 await assert.rejects(runAdaptiveCampaign({...args,onTransition:event=>{if(event==='NATIVE_RESULT_PERSISTED')throw Error('INTERRUPT');}}),/INTERRUPT/);
 const state=await runAdaptiveCampaign(args);assert.deepEqual(calls,['NO','SE']);assert.equal(state.services.fixture.used.acquisitions,2);assert(Object.values(state.targets).every(t=>t.verified.length===0));await runAdaptiveCampaign(args);assert.equal(calls.length,2);
});
test('real geo stack receives NO, checks country and runs ordinary verifier with synthetic wire only',async t=>{
 const directory=dir(t),x=target('NO',fixtureUrl),f=decodoFixture({env:{SAVLIVO_DECODO_ROUTING_MODE:'COMMON_GATEWAY'},countries:['NO','NO'],body:'<html><body>Provider membership information without a price.</body></html>'});
 const adapters=(await createTavilyDiscovery({inventory:[x],searchEnabled:false})).bind({dir:directory,runtime:{},bundle:f.bundle,runLive:args=>{assert.equal(args.inventory[0].market,'NO');return runLive({...args,clock:()=>at,dependencies:{...args.dependencies,authorization:()=>({currency:'USD',task:'10',market:'10',run:'10'}),resolveHost:async()=>[{address:'93.184.216.34',family:4}]}});}});
 const state=await runAdaptiveCampaign({directory:directory+'/campaign',manifest:{targets:[x],conditionalFollowupTargets:[]},createAdapters:async()=>({...adapters,read:fail,search:fail}),maxActions:1});const resultTarget=state.targets[x.id];assert.equal(state.services.fixture.used.acquisitions,1);assert.equal(resultTarget.verified.length,0);
 const child=resultTarget.acquisitionOutcomes[0].runDirectory,records=[...iterateMarketRunRecords(child+'/journal')],r=records.find(r=>r.type==='V2_ACQUISITION_RESULT').payload.result;
 assert.equal(r.targetCountry,'NO');assert.equal(r.attempts[0].transportVerification.before.country,'NO');assert.equal(r.attempts[0].transportVerification.after.country,'NO');assert(fs.existsSync(child+'/interpretation-0001/targeted-verification.json'));
});

test('same country sibling cannot duplicate a completed geo acquisition',async t=>{
 const first=target(),second={...target(),id:'other-NO'},directory=dir(t);let calls=0;
 const state=await runAdaptiveCampaign({directory,manifest:{targets:[first,second],conditionalFollowupTargets:[]},createAdapters:async()=>({read:fail,search:fail,classify:async()=>({eligible:true}),acquire:async()=>{calls++;return {verified:[],classification:'MARKET_UNRESOLVED'};}})});
 assert.equal(calls,1);assert.equal(state.services.fixture.used.acquisitions,1);
});
