import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Operations} from './control.mjs';

const caps={direct:false,tavily:false,decodo:false,browser:false,groq:false};
const fixture=t=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'price-research-operations-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return new Operations({repo:root,root:path.join(root,'.savlivo/v2-operations'),lifecycleInput:null,read:true,control:true,scheduling:false,timezone:'Europe/Oslo'});};

test('provider seed Preflight retains seed status and cannot manufacture a service identity',async t=>{
 const ops=fixture(t),pre=await ops.preflight({objective:'PRICE_RESEARCH',targetKind:'PROVIDER_OR_BRAND_SEED',seedName:'Unlisted Brand',market:'DE',capabilities:caps},'admin');assert.equal(pre.runner,'PRICE_RESEARCH V4-first identity bridge');assert.equal(pre.servicesConsidered,1);const stored=ops.db().preflights[0];assert.equal(stored.config.seedName,'Unlisted Brand');assert.equal(Object.hasOwn(stored.config,'serviceId'),false);
 const job=await ops.start(pre.token,'admin',true);assert.equal(job.config.objective,'PRICE_RESEARCH');assert.equal(job.config.targetKind,'PROVIDER_OR_BRAND_SEED');assert.equal(job.status,'QUEUED');
});

test('known product outside mature 188 is admitted to PRICE_RESEARCH; free text and malformed market are rejected',async t=>{
 const ops=fixture(t),pre=await ops.preflight({objective:'PRICE_RESEARCH',targetKind:'KNOWN_SERVICE',serviceId:'strava',market:'DE',capabilities:caps},'admin');assert.equal(pre.servicesConsidered,1);assert.equal(ops.db().preflights[0].config.serviceId,'strava');
 await assert.rejects(ops.preflight({objective:'PRICE_RESEARCH',targetKind:'KNOWN_SERVICE',serviceId:'Strava subscription',market:'DE',capabilities:caps},'admin'));
 await assert.rejects(ops.preflight({objective:'PRICE_RESEARCH',targetKind:'PROVIDER_OR_BRAND_SEED',seedName:'Brand',market:'Germany',capabilities:caps},'admin'),/INVALID_PRICE_RESEARCH_MARKET/);
});
