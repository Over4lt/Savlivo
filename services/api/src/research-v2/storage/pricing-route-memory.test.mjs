import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {loadPricingRouteMemory,publishPricingRouteMemory,publishPricingMethodOutcomes,isPublicPricingRouteUrl} from './pricing-route-memory.mjs';
import {createProviderPricingRouteMemory,learnProviderPricingRoutesFromTarget,providerPricingRoutesForTarget,providerPricingStrategiesForTarget,recordProviderPricingRouteFailure} from '../live/hybrid-provider-resource-memory.mjs';
import {derivedCountrySourceCandidates} from '../live/derived-country-sources.mjs';
import {planResearch} from '../live/research-planner.mjs';
import {runAdaptiveCampaign} from '../inventory/adaptive-campaign.mjs';

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

test('a proven Decodo method is loaded after restart as a bounded acquisition hint',async t=>{
 const root=fixture(t),proof=provenRoute(root),sourceHash=proof.learned[0].sources[0].sha256;publish(root,proof.learned);
 const file=path.join(root,'adaptive-state.json');fs.writeFileSync(file,JSON.stringify({targets:{'price-research:max:AU':{service:'max',market:'AU',providerInterpretations:[{url,v3Observation:{sha256:sourceHash,context:{transport:'DECODO'}},v3Truth:{established:true}}]}},services:{max:{used:{acquisitions:1}}}}));
 assert.equal(publishPricingMethodOutcomes(root,{jobId:'11111111-1111-4111-8111-111111111111',checkpoint:'priority-research-links',service:'max',market:'AU',recordedAt:observed,checkpointFile:file,confirmedSuccessUrls:[url],confirmedSuccessMethods:{[url]:'APPROVED_PROXY'}}).published,1);
 const state=loadPricingRouteMemory(root,{services:['max']}),nz={service:'max',serviceName:'Max',market:'NZ',derivedCountryCandidates:derivedCountrySourceCandidates({service:'max',market:'NZ'})},strategies=providerPricingStrategiesForTarget(state,nz);
 assert.equal(strategies[0].method,'DECODO');assert.equal(strategies[0].url,'https://www.hbomax.com/nz/en');assert.equal(strategies[0].sourceMarket,'AU');assert.equal(strategies[0].meaning,'ROUTING_ONLY_REQUIRES_FRESH_ACQUISITION');assert(!JSON.stringify(strategies).includes('11.99'));
 const next={...nz,id:'price-research:max:NZ',operationsObjective:'PRICE_RESEARCH',researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},capabilities:{direct:true,tavily:true,decodo:true,browser:false},researchLinks:[],researchLinkOutcomes:[],learnedPricingStrategies:strategies,learnedStrategyTrace:{loaded:1,relevant:1,attempted:[],rejected:[],fallbackReason:null,verifiedStrategyId:null},urls:strategies.map(row=>row.url),leads:strategies.map(row=>({url:row.url,learnedProviderPricingRoute:true,routingRole:'PRICING'})),reads:[],queries:[],decisions:[],verified:[],blockedOrigins:[],gaps:['plan','amount','currency','cadence','priceRole','ownership','market']};
 assert.equal(planResearch(next).route,'DECODO');assert.equal(planResearch(next).url,strategies[0].url);
 const planned=await runAdaptiveCampaign({directory:path.join(root,'job-b'),manifest:{targets:[next],conditionalFollowupTargets:[]},providerPricingRouteMemory:state,stopBeforeNetwork:true,maxActions:1,createAdapters:()=>{throw Error('NO_NETWORK_EXPECTED');}});
 assert.equal(planned.services.max.pending?.plan?.route,'DECODO');assert.equal(planned.services.max.pending?.plan?.url,strategies[0].url);assert.equal(planned.targets[next.id].learnedStrategyTrace.relevant,1);
 assert.deepEqual(providerPricingStrategiesForTarget(state,{...nz,service:'netflix',serviceName:'Netflix'}),[]);
 assert.equal(publishPricingMethodOutcomes(root,{jobId:'11111111-1111-4111-8111-111111111111',checkpoint:'priority-research-links',service:'max',market:'AU',recordedAt:observed,checkpointFile:file,confirmedSuccessUrls:[url],confirmedSuccessMethods:{[url]:'APPROVED_PROXY'}}).published,0);
});

test('Max NO, SE and DK inherit only acquisition priority from a proved route, never old price or G1 evidence',t=>{
 const root=fixture(t),proof=provenRoute(root);publish(root,proof.learned);
 const restored=loadPricingRouteMemory(root,{services:['max']});
 for(const market of ['NO','SE','DK']){
  const candidates=derivedCountrySourceCandidates({service:'max',market});
  const routes=providerPricingRoutesForTarget(restored,{service:'max',serviceName:'Max',market,derivedCountryCandidates:candidates});
  assert(routes.length>0,market);
  assert(candidates.some(candidate=>candidate.url===routes[0].url),market);
  assert(routes.every(row=>!('sources' in row)&&!('extractionRecipe' in row)),market+' must reacquire and reverify');
  assert.equal(JSON.stringify(routes).includes('11.99'),false);
  assert.equal(JSON.stringify(routes).includes('AUD'),false);
 }
});

test('repeated publication is idempotent and an evidenced failed route can lose priority',t=>{
 const root=fixture(t),proof=provenRoute(root);publish(root,proof.learned);publish(root,proof.learned);
 const state=JSON.parse(fs.readFileSync(path.join(root,'provider-pricing-routes-v1.json')));assert.equal(state.entries.length,1);assert.equal(state.entries[0].origins.length,1);
 for(let i=0;i<3;i++)recordProviderPricingRouteFailure(proof.memory,{service:'max',serviceName:'Max'},url);
 const repeated=provenRoute(root,proof.memory);publish(root,repeated.learned);
 const restored=loadPricingRouteMemory(root);assert.deepEqual(providerPricingRoutesForTarget(restored,{service:'max',serviceName:'Max',market:'NZ',derivedCountryCandidates:derivedCountrySourceCandidates({service:'max',market:'NZ'})}).map(row=>row.url),['https://www.hbomax.com/nz/en']);
});

test('unvalidated rows, tampered index, wrong markets and publication locks fail closed',t=>{
 const root=fixture(t),proof=provenRoute(root),forged={...proof.learned[0]};assert.throws(()=>publish(root,[forged]),/PRICING_ROUTE_PROOF_REQUIRED/);
 const altered=provenRoute(root);altered.learned[0].url='https://www.hbomax.com/au/other';assert.throws(()=>publish(root,altered.learned),/PRICING_ROUTE_PROOF_REQUIRED/);
 assert.throws(()=>publish(root,proof.learned,{market:'BAD'}),/PRICING_ROUTE_MEMORY_INVALID/);
 assert.throws(()=>publish(root,proof.learned,{acquiredAt:'2026-10-20T10:00:00.000Z'}),/PRICING_ROUTE_MEMORY_INVALID/);publish(root,proof.learned);
 const file=path.join(root,'provider-pricing-routes-v1.json');fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('Max','Other'));assert.throws(()=>loadPricingRouteMemory(root),/PRICING_ROUTE_MEMORY_INVALID/);
 fs.rmSync(file);fs.writeFileSync(path.join(root,'provider-pricing-routes-v1.lock'),'busy');assert.throws(()=>publish(root,proof.learned),/EEXIST/);
});

test('documented failed route and known request counts survive restart without blocking fallback',t=>{
 const root=fixture(t),proof=provenRoute(root);publish(root,proof.learned);
 const en='https://www.hbomax.com/es/en',es='https://www.hbomax.com/es/es',file=path.join(root,'adaptive-state.json');
 fs.writeFileSync(file,JSON.stringify({targets:{'price-research:max:ES':{service:'max',market:'ES',leads:[{url:en,learnedProviderPricingRoute:true}],reads:[{requestedUrl:en,outcome:'OK',bodyHash:'a'.repeat(64)}],providerInterpretations:[]}},services:{max:{used:{reads:1,searches:0,acquisitions:1,retainedReviews:0,bytes:2048}}}}));
 const fields={jobId:'22222222-2222-4222-8222-222222222222',checkpoint:'known-service',service:'max',market:'ES',recordedAt:new Date(Date.now()-1000).toISOString(),checkpointFile:file,result:{targets:[{target:{service:'max',market:'ES'},googleRequests:0,strictGeminiRequests:0}]}};
 assert.equal(publishPricingMethodOutcomes(root,fields).published,1);assert.equal(publishPricingMethodOutcomes(root,fields).published,0);
 const stored=JSON.parse(fs.readFileSync(path.join(root,'provider-pricing-routes-v1.json')));assert.equal(stored.methodOutcomes.length,1);
 assert.deepEqual(stored.methodOutcomes[0].usage,{reads:1,searches:0,acquisitions:1,retainedReviews:0,bytes:2048,googleRequests:0,strictGeminiRequests:0,billedCost:null});
 assert.equal(stored.methodOutcomes[0].result,'NO_DURABLE_SUCCESS_PROOF');assert(!JSON.stringify(stored).includes('11.99'));assert(!JSON.stringify(stored).includes(sourceText));
 const restored=loadPricingRouteMemory(root),target={service:'max',serviceName:'Max',market:'ES',derivedCountryCandidates:derivedCountrySourceCandidates({service:'max',market:'ES'})};
 assert.deepEqual(providerPricingRoutesForTarget(restored,target).map(row=>row.url),[es,en]);
 assert.deepEqual(restored.methodOutcomes.map(row=>[row.market,row.url]),[['ES',en]]);
 assert.deepEqual(providerPricingRoutesForTarget(restored,{...target,service:'netflix',serviceName:'Netflix'}),[]);
 assert.deepEqual(providerPricingRoutesForTarget(restored,{...target,market:'PL',derivedCountryCandidates:derivedCountrySourceCandidates({service:'max',market:'PL'})}).map(row=>row.url),['https://www.hbomax.com/pl/pl']);
 const healed=createProviderPricingRouteMemory();healed.routes=restored.routes;healed.byService=restored.byService;healed.methodOutcomes=[...restored.methodOutcomes,{...restored.methodOutcomes[0],id:'b'.repeat(64),result:'SUCCESS',at:new Date().toISOString()}];
 assert.deepEqual(providerPricingRoutesForTarget(healed,target).map(row=>row.url),[en,es]);
 fs.writeFileSync(path.join(root,'provider-pricing-routes-v1.json.pending-incomplete'),'half-written');
 assert.deepEqual(providerPricingRoutesForTarget(loadPricingRouteMemory(root),target).map(row=>row.url),[es,en]);
});

test('a V3-looking checkpoint alone cannot publish durable route success without the matching G1 origin',t=>{
 const root=fixture(t),file=path.join(root,'adaptive-state.json'),sourceHash='a'.repeat(64),sourceUrl='https://www.hbomax.com/us/en';
 fs.writeFileSync(file,JSON.stringify({targets:{'price-research:max:US':{service:'max',market:'US',providerInterpretations:[{url:sourceUrl,v3Observation:{sha256:sourceHash,context:{transport:'DECODO'}},v3Truth:{established:true}}]}}}));
 const result=publishPricingMethodOutcomes(root,{jobId:'33333333-3333-4333-8333-333333333333',checkpoint:'known-service',service:'max',market:'US',recordedAt:new Date().toISOString(),checkpointFile:file,confirmedSuccessUrls:[sourceUrl]});
 assert.equal(result.published,0);assert.equal(fs.existsSync(path.join(root,'provider-pricing-routes-v1.json')),false);
});

test('durable routing rejects URLs with possible personal or secret query data',()=>{
 assert.equal(isPublicPricingRouteUrl('https://help.hbomax.com/us/Answer/Detail/000002547?pubDate=20260926'),true);
 assert.equal(isPublicPricingRouteUrl('https://help.example.com/pricing?email=person@example.com'),false);
 assert.equal(isPublicPricingRouteUrl('https://help.example.com/pricing?token=secret'),false);
 assert.equal(isPublicPricingRouteUrl('https://help.example.com/pricing/abcdefabcdefabcdefabcdefabcdefab'),false);
});

test('a documented failed Decodo acquisition is remembered only for its service and market',t=>{
 const root=fixture(t),file=path.join(root,'adaptive-state.json'),failed='https://www.hbomax.com/es/es';
 fs.writeFileSync(file,JSON.stringify({targets:{'price-research:max:ES':{service:'max',market:'ES',derivedCountryCandidates:[{service:'max',market:'ES',url:failed,providerRouteEvidenceSha256:'b'.repeat(64)}],acquisitionOutcomes:[{url:failed,transport:'DECODO',classification:'MARKET_MISMATCH',sourceHash:'c'.repeat(64)}]}}}));
 assert.equal(publishPricingMethodOutcomes(root,{jobId:'44444444-4444-4444-8444-444444444444',checkpoint:'priority-research-links',service:'max',market:'ES',recordedAt:new Date().toISOString(),checkpointFile:file}).published,1);
 const memory=loadPricingRouteMemory(root);assert.deepEqual(memory.methodOutcomes.map(row=>[row.service,row.market,row.method,row.result]),[['max','ES','DECODO','MARKET_MISMATCH']]);
 assert.equal(loadPricingRouteMemory(root,{services:['netflix']}).methodOutcomes.length,0);
});
