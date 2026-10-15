import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Operations} from './control.mjs';
import {priceResearchPlan} from './price-research.mjs';

const caps={direct:false,tavily:false,decodo:false,browser:false,groq:false};
const fixture=t=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'price-research-operations-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return new Operations({repo:root,root:path.join(root,'.savlivo/v2-operations'),lifecycleInput:null,read:true,control:true,scheduling:false,timezone:'Europe/Oslo',env:{},runtimeReadiness:{readGemini:async()=>null}});};

test('provider seed Preflight retains seed status and cannot manufacture a service identity',async t=>{
 const ops=fixture(t),pre=await ops.preflight({objective:'PRICE_RESEARCH',targetKind:'PROVIDER_OR_BRAND_SEED',seedName:'Unlisted Brand',market:'DE',capabilities:caps},'admin');assert.equal(pre.runner,'PRICE_RESEARCH V4-first identity bridge');assert.equal(pre.servicesConsidered,1);const stored=ops.db().preflights[0];assert.equal(stored.config.seedName,'Unlisted Brand');assert.equal(Object.hasOwn(stored.config,'serviceId'),false);
 const job=await ops.start(pre.token,'admin',true);assert.equal(job.config.objective,'PRICE_RESEARCH');assert.equal(job.config.targetKind,'PROVIDER_OR_BRAND_SEED');assert.equal(job.status,'QUEUED');
});

test('known canonical baseline, product and frozen identities are admitted to PRICE_RESEARCH; free text and malformed market are rejected',async t=>{
 const ops=fixture(t);for(const serviceId of ['strava','1password','chess-com']){const pre=await ops.preflight({objective:'PRICE_RESEARCH',targetKind:'KNOWN_SERVICE',serviceId,market:'DE',capabilities:caps},'admin');assert.equal(pre.servicesConsidered,1);assert.equal(ops.db().preflights.at(-1).config.serviceId,serviceId);}
 await assert.rejects(ops.preflight({objective:'PRICE_RESEARCH',targetKind:'KNOWN_SERVICE',serviceId:'Strava subscription',market:'DE',capabilities:caps},'admin'));
 await assert.rejects(ops.preflight({objective:'PRICE_RESEARCH',targetKind:'PROVIDER_OR_BRAND_SEED',seedName:'Brand',market:'Germany',capabilities:caps},'admin'),/INVALID_PRICE_RESEARCH_MARKET/);
});

const lifecycleInput='docs/catalog/global-47/research-v2/v15-mature-handoff-20260921/lifecycle-input.json';
function batchFixture(t,databaseIdentities=[]){const root=fs.mkdtempSync(path.join(os.tmpdir(),'price-research-batch-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return new Operations({repo:process.cwd(),root,lifecycleInput,read:true,control:true,scheduling:false,timezone:'Europe/Oslo',databaseIdentities,env:{},runtimeReadiness:{readGemini:async()=>null}});}
const dbIdentity=id=>({research_service_id:id,canonical_slug:id.replace(/^research-/,''),canonical_name:id,normalized_name:id,identity_type:'Service',status:'RESEARCHABLE',aliases:[],provider_host:'provider.example',provider_binding_digest:'a'.repeat(64),provider_observation:'observation',source_url:'https://provider.example',source_body_sha256:'b'.repeat(64),relationship:'PROVIDER_PRESENTS_SERVICE',extraction_mechanism:'STRUCTURED_DATA',admission_version:1,created_at:'2026-10-14T00:00:00.000Z',updated_at:'2026-10-14T00:00:00.000Z'});

test('canonical selection Preflight freezes the exact complete scope and Start queues only that scope',async t=>{
 const ops=batchFixture(t),targeting=await ops.priceResearchTargeting({services:['chess-com','1password'],markets:['DE','NO']}),input={objective:'PRICE_RESEARCH',targetKind:'CANONICAL_SELECTION',services:['chess-com','1password'],markets:['DE','NO'],targetingRevision:targeting.revision,capabilities:caps};
 const pre=await ops.preflight(input,'admin');assert.equal(pre.logicalTargetCount,4);assert.equal(pre.batchTargetCount,4);assert.equal(pre.perTargetRequestCeiling,96);assert.equal(pre.totalSafetyCeiling,384);assert.equal(pre.continuationCursor,null);
 const stored=ops.db().preflights[0].config;assert.deepEqual(stored.batchTargets.map(row=>[row.serviceId,row.targetMarket]),[['1password','DE'],['1password','NO'],['chess-com','DE'],['chess-com','NO']]);assert(stored.batchTargets.every(row=>row.marketApplicabilityEstablished===false));
 const job=await ops.start(pre.token,'admin',true);assert.equal(job.status,'QUEUED');assert.deepEqual(job.config,stored);assert.equal((await ops.start(pre.token,'admin',true)).id,job.id);assert.equal(ops.db().jobs.length,1);const manifest=JSON.parse(fs.readFileSync(path.join(ops.config.root,'runs',job.id,'manifest.json')));assert.equal(manifest.targets.length,4);assert.equal(manifest.limits.perTargetRequests,96);assert.equal(manifest.limits.totalRequests,384);assert(manifest.targets.every(row=>row.marketApplicabilityEstablished===false));
});

test('42 explicit markets and all 46 markets are admitted completely with no target-count continuation',async t=>{
 const ops=batchFixture(t),universe=await ops.priceResearchTargeting({}),markets=universe.markets.map(row=>row.id),fortyTwo=markets.slice(0,42);
 for(const selectedMarkets of [fortyTwo,[]]){
  const targeting=await ops.priceResearchTargeting({services:['chess-com'],markets:selectedMarkets}),input={objective:'PRICE_RESEARCH',targetKind:'CANONICAL_SELECTION',services:['chess-com'],markets:selectedMarkets,targetingRevision:targeting.revision,capabilities:caps},plan=await priceResearchPlan(input,ops.config),expected=selectedMarkets.length||46;
  assert.equal(plan.logicalTargetCount,expected);assert.equal(plan.batchTargetCount,expected);assert.equal(plan.config.batchTargets.length,expected);assert.equal(plan.totalSafetyCeiling,expected*96);assert.equal(plan.continuationCursor,null);assert.equal(Object.hasOwn(plan.config,'cursor'),false);assert.equal(Object.hasOwn(plan.config,'continuationCursor'),false);
 }
 const targeting=await ops.priceResearchTargeting({services:['chess-com'],markets:fortyTwo});await assert.rejects(priceResearchPlan({objective:'PRICE_RESEARCH',targetKind:'CANONICAL_SELECTION',services:['chess-com'],markets:fortyTwo,targetingRevision:targeting.revision,cursor:'10.'+'0'.repeat(64),capabilities:caps},ops.config),/INVALID_PRICE_RESEARCH_CONFIG/);await assert.rejects(priceResearchPlan({objective:'PRICE_RESEARCH',targetKind:'CANONICAL_SELECTION',services:[],markets:[],targetingRevision:targeting.revision,capabilities:caps},ops.config),/PRICE_RESEARCH_SELECTION_REQUIRED/);
});

test('full current canonical universe survives Preflight and Start as one 21,298-target job',async t=>{
 const ops=batchFixture(t),universe=await ops.priceResearchTargeting({}),serviceIds=universe.services.filter(row=>row.selectable).map(row=>row.serviceId),targeting=await ops.priceResearchTargeting({services:serviceIds,markets:[]}),input={objective:'PRICE_RESEARCH',targetKind:'CANONICAL_SELECTION',services:serviceIds,markets:[],targetingRevision:targeting.revision,capabilities:caps};
 const pre=await ops.preflight(input,'admin');assert.equal(pre.logicalTargetCount,21298);assert.equal(pre.batchTargetCount,21298);assert.equal(pre.totalSafetyCeiling,21298*96);assert.equal(pre.continuationCursor,null);assert.equal(ops.db().preflights[0].config.batchTargets.length,21298);
 const job=await ops.start(pre.token,'admin',true);assert.equal(job.config.batchTargets.length,21298);assert.equal(job.config.logicalTargetCount,21298);assert.equal(ops.db().jobs.length,1);const manifest=JSON.parse(fs.readFileSync(path.join(ops.config.root,'runs',job.id,'manifest.json')));assert.equal(manifest.targets.length,21298);assert.equal(manifest.limits.totalRequests,21298*96);
});

test('Start rejects changed canonical projection and worker preparation rejects a changed frozen batch',async t=>{
 const identities=[],ops=batchFixture(t,identities),targeting=await ops.priceResearchTargeting({services:['chess-com'],markets:['DE']}),pre=await ops.preflight({objective:'PRICE_RESEARCH',targetKind:'CANONICAL_SELECTION',services:['chess-com'],markets:['DE'],targetingRevision:targeting.revision,capabilities:caps},'admin');
 identities.push(dbIdentity('research-new-service'));await assert.rejects(ops.start(pre.token,'admin',true),error=>error.message==='TARGETING_STALE'&&error.status===409);assert.equal(ops.db().jobs.length,0);identities.length=0;
 const valid=await ops.start(pre.token,'admin',true),file=path.join(ops.config.root,'runs',valid.id,'manifest.json'),manifest=JSON.parse(fs.readFileSync(file));manifest.targets[0].market='NO';fs.writeFileSync(file,JSON.stringify(manifest));assert.throws(()=>ops.prepareQueued(ops.db(),valid),/PRICE_RESEARCH_BATCH_BINDING_CHANGED/);
});

test('PRICE_RESEARCH Preflight exposes blocking capability readiness and non-blocking Gemini readiness',async t=>{
 const ops=fixture(t);ops.config.env={TAVILY_API_KEY:'fixture-private'};const pre=await ops.preflight({objective:'PRICE_RESEARCH',targetKind:'KNOWN_SERVICE',serviceId:'chess-com',market:'ES',capabilities:{...caps,tavily:true}},'admin');assert.equal(pre.liveReady,true);assert.equal(pre.capabilityCheck.availability.tavily.reason,'CONFIGURED');assert.equal(pre.capabilityCheck.auxiliary.googleAi.reason,'GEMINI_CREDENTIAL_UNAVAILABLE');assert.equal(pre.capabilityCheck.auxiliary.googleAi.blocking,false);assert.equal(JSON.stringify(pre).includes('fixture-private'),false);
});
