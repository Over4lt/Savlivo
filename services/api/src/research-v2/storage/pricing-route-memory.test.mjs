import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {loadPricingRouteMemory,publishPricingRouteMemory} from './pricing-route-memory.mjs';
import {createProviderPricingRouteMemory,learnProviderPricingRoutesFromTarget,providerPricingRoutesForTarget,recordProviderPricingRouteFailure} from '../live/hybrid-provider-resource-memory.mjs';
import {derivedCountrySourceCandidates} from '../live/derived-country-sources.mjs';

const observed='2026-10-19T10:00:00.000Z',url='https://www.hbomax.com/au/en',sourceText='retained provider monthly pricing';
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'pricing-route-memory-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
function provenRoute(root,memory=createProviderPricingRouteMemory()){
 const directory=path.join(root,'old-job','priority-research-links','targets','price-research:max:AU','open-web-discovery'),sha256=createHash('sha256').update(sourceText).digest('hex'),acquisition=path.join(directory,'acquisitions','retained-AU');
 fs.mkdirSync(path.join(acquisition,'raw'),{recursive:true});fs.writeFileSync(path.join(acquisition,'raw',sha256+'.body'),sourceText);
 const reference={observation:'country-v3-au',sha256},target={service:'max',serviceName:'Max',market:'AU',derivedCountryCandidates:derivedCountrySourceCandidates({service:'max',market:'AU'}),reads:[],decisions:[{url,eligible:true,route:'DECODO',acquisitionReserved:true}],acquisitionOutcomes:[{url,runDirectory:acquisition,sourceHash:sha256,sourceClassification:{status:'PROVIDER_SOURCE',finalUrl:url,sourceHash:sha256},countryV3Evaluation:{status:'EVALUATED',sourceHash:sha256,receiptStatus:'HASH_VERIFIED',geoClass:'G1'}}],providerInterpretations:[{url,v3Observation:{id:reference.observation,kind:'PROVIDER',url,sha256,context:{transport:'DECODO',networkGeography:'AU'}},v3Truth:{established:true,prices:{AU:{established:true,propositions:{PRICE_AMOUNT:{state:'ESTABLISHED',evidence:[{value:11.99,reference}]},CURRENCY:{state:'ESTABLISHED',evidence:[{value:'AUD',reference}]},MONTHLY_CADENCE:{state:'ESTABLISHED',evidence:[{value:true,reference}]}}}}}}]};
 const learned=learnProviderPricingRoutesFromTarget({memory,target,directory,now:observed});assert.equal(learned.length,1);return {learned,memory};
}
const publish=(root,rows,fields={})=>publishPricingRouteMemory(root,rows,{jobId:'11111111-1111-4111-8111-111111111111',checkpoint:'priority-research-links',market:'AU',recordedAt:observed,acquiredAt:observed,...fields});

test('source-validated routing hint survives disposable-file cleanup and process reconstruction',t=>{
 const root=fixture(t),proof=provenRoute(root);assert.equal(publish(root,proof.learned).published,1);
 const disposable=path.join(root,'old-job','working.tmp');fs.writeFileSync(disposable,'temporary');fs.unlinkSync(disposable);
 const restored=loadPricingRouteMemory(root),routes=providerPricingRoutesForTarget(restored,{service:'max',serviceName:'Max',market:'NZ',derivedCountryCandidates:derivedCountrySourceCandidates({service:'max',market:'NZ'})});
 assert.deepEqual(routes.map(row=>row.url),['https://www.hbomax.com/nz/en']);assert.equal(providerPricingRoutesForTarget(restored,{service:'netflix',serviceName:'Netflix',market:'NZ'}).length,0);
 const bytes=fs.readFileSync(path.join(root,'provider-pricing-routes-v1.json'),'utf8');assert(!bytes.includes('11.99'));assert(!bytes.includes('AUD'));assert(!bytes.includes(sourceText));assert.equal(JSON.parse(bytes).entries[0].origins[0].acquiredAt,observed);
});

test('repeated publication is idempotent and an evidenced failed route can lose priority',t=>{
 const root=fixture(t),proof=provenRoute(root);publish(root,proof.learned);publish(root,proof.learned);
 const state=JSON.parse(fs.readFileSync(path.join(root,'provider-pricing-routes-v1.json')));assert.equal(state.entries.length,1);assert.equal(state.entries[0].origins.length,1);
 for(let i=0;i<3;i++)recordProviderPricingRouteFailure(proof.memory,{service:'max',serviceName:'Max'},url);
 const repeated=provenRoute(root,proof.memory);publish(root,repeated.learned);
 const restored=loadPricingRouteMemory(root);assert.equal(providerPricingRoutesForTarget(restored,{service:'max',serviceName:'Max',market:'NZ',derivedCountryCandidates:derivedCountrySourceCandidates({service:'max',market:'NZ'})}).length,0);
});

test('unvalidated rows, tampered index, wrong markets and publication locks fail closed',t=>{
 const root=fixture(t),proof=provenRoute(root),forged={...proof.learned[0]};assert.throws(()=>publish(root,[forged]),/PRICING_ROUTE_PROOF_REQUIRED/);
 assert.throws(()=>publish(root,proof.learned,{market:'BAD'}),/PRICING_ROUTE_MEMORY_INVALID/);
 assert.throws(()=>publish(root,proof.learned,{acquiredAt:'2026-10-20T10:00:00.000Z'}),/PRICING_ROUTE_MEMORY_INVALID/);publish(root,proof.learned);
 const file=path.join(root,'provider-pricing-routes-v1.json');fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('Max','Other'));assert.throws(()=>loadPricingRouteMemory(root),/PRICING_ROUTE_MEMORY_INVALID/);
 fs.rmSync(file);fs.writeFileSync(path.join(root,'provider-pricing-routes-v1.lock'),'busy');assert.throws(()=>publish(root,proof.learned),/EEXIST/);
});
