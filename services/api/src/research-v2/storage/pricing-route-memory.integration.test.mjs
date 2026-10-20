import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {openMarketRunStore} from '../../research-v1/market-run-store.mjs';
import {executePriceResearchBatch,recoverCompletedPricingRoutes} from '../../v2-operations/price-research-batch.mjs';
import {createProviderPricingRouteMemory,providerPricingRoutesForTarget} from '../live/hybrid-provider-resource-memory.mjs';
import {loadSinglePriceRouteProof} from '../../v2-operations/single-price-route-proof.mjs';
import {readObservation} from './evidence.mjs';
import {loadPricingRouteMemory} from './pricing-route-memory.mjs';
import {closure} from './references.mjs';

const fixtures=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../research-v3/fixtures/max');
const archived=JSON.parse(fs.readFileSync(path.join(fixtures,'us-production-g1-receipt.json'),'utf8'));
const body=gunzipSync(fs.readFileSync(path.join(fixtures,'us-production-help-pricing.html.gz'))).toString('utf8');
const hash='664386f1d597a5bfc9b830e5d407362a3614067af5eff85b2e096d40f1ee7c79',sourceUrl=archived.attempt.page.url;
const routeEvidence='b'.repeat(64);
const target=market=>({id:`price-research:max:${market}`,serviceId:'max',serviceName:'Max',targetMarket:market,marketApplicabilityEstablished:false});
const candidate=market=>({service:'max',market,url:sourceUrl.replace('/us/','/'+market.toLowerCase()+'/'),providerRouteEvidenceSha256:routeEvidence});
function job(targets){const id=randomUUID();return {id,config:{objective:'PRICE_RESEARCH',targetKind:'CANONICAL_SELECTION',services:['max'],markets:targets.map(t=>t.targetMarket),targetingRevision:'a'.repeat(64),batchTargets:targets,logicalTargetCount:targets.length,perTargetRequestCeiling:96,batchRequestCeiling:targets.length*96,capabilities:{direct:true,decodo:true}}};}
function retainedG1(child,id,acquiredAt=archived.attempt.page.sourceIntegrity.checkedAt){
 const campaign=path.join(child,'priority-research-links'),native=path.join(campaign,'targets',id,'open-web-discovery'),run=path.join(native,'acquisitions','retained-US');
 fs.mkdirSync(path.join(run,'raw'),{recursive:true});fs.mkdirSync(path.join(run,'interpretation-0001'),{recursive:true});fs.writeFileSync(path.join(run,'raw',hash+'.body'),body);
 const store=openMarketRunStore(path.join(run,'journal')),page=structuredClone(archived.attempt.page),attempt={...structuredClone(archived.attempt),page:{...page,checkedAt:acquiredAt,sourceIntegrity:{...page.sourceIntegrity,checkedAt:acquiredAt},rawSource:{text:body}}},record=store.append('V2_ACQUISITION_RESULT',{target:{id},result:{attempts:[attempt]}});store.close();
 const sourceCheck=structuredClone(archived.sourceCheck);sourceCheck.receipt.geo.sourceReference={...sourceCheck.receipt.geo.sourceReference,sequence:record.sequence,hash:record.hash,path:'journal/record-00000001.json',pointer:'/result/attempts/0/page',trustRoot:{kind:'LIVE_CAMPAIGN_ROOT_V1',id:path.basename(run)}};
 fs.writeFileSync(path.join(run,'interpretation-0001','targeted-verification.json'),JSON.stringify({sourceChecks:[sourceCheck]}));
 const reference={observation:'source-bound-max-us',sha256:hash},state={targets:{[id]:{id,service:'max',serviceName:'Max',market:'US',derivedCountryCandidates:[candidate('US')],reads:[],decisions:[{url:sourceUrl,eligible:true,route:'DECODO',acquisitionReserved:true}],acquisitionOutcomes:[{url:sourceUrl,runDirectory:run,sourceHash:hash,sourceClassification:{status:'PROVIDER_SOURCE',finalUrl:sourceUrl,sourceHash:hash},countryV3Evaluation:{status:'EVALUATED',sourceHash:hash,receiptStatus:'HASH_VERIFIED',geoClass:'G1'}}],providerInterpretations:[{url:sourceUrl,v3Observation:{id:reference.observation,kind:'PROVIDER',url:sourceUrl,sha256:hash,context:{transport:'DECODO',networkGeography:'US'}},v3Truth:{established:true,prices:{US:{established:true,propositions:{PRICE_AMOUNT:{state:'ESTABLISHED',evidence:[{value:10.99,reference}]},CURRENCY:{state:'ESTABLISHED',evidence:[{value:'USD',reference}]},MONTHLY_CADENCE:{state:'ESTABLISHED',evidence:[{value:true,reference}]}}}}}}]}}};
 fs.writeFileSync(path.join(campaign,'adaptive-state.json'),JSON.stringify(state));
}

test('completed G1 source publishes durable routing only; next job uses it after restart',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'durable-route-batch-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const runs=path.join(root,'.savlivo','v2-operations','runs'),memoryRoot=path.join(root,'.savlivo','research-v2','storage'),first=job([target('US')]),firstDir=path.join(runs,first.id);
 fs.mkdirSync(firstDir,{recursive:true});fs.writeFileSync(path.join(firstDir,'operation.json'),JSON.stringify(first));
 const done=await executePriceResearchBatch({job:first,directory:firstDir,memoryRoot,executeTarget:async({directory})=>{retainedG1(directory,first.config.batchTargets[0].id);return {verified:3};}});
 assert.equal(done.status,'COMPLETE');const index=JSON.parse(fs.readFileSync(path.join(memoryRoot,'provider-pricing-routes-v1.json'))),origin=index.entries[0].origins[0];
 assert.equal(origin.acquiredAt,archived.attempt.page.sourceIntegrity.checkedAt);assert.equal(readObservation(memoryRoot,origin.evidenceObservationId).blob.sha256,hash);
 const graph=closure(root,[{path:'.savlivo/research-v2/storage/provider-pricing-routes-v1.json',format:'JSON',classification:'PERMANENT_HISTORY'}]);
 assert(graph.complete,graph.errors.join(','));assert(graph.entries.some(entry=>entry.path.endsWith('/observations/'+origin.evidenceObservationId+'.json')));assert(graph.entries.some(entry=>entry.path.endsWith('/blobs/sha256/'+hash.slice(0,2)+'/'+hash)));
 fs.writeFileSync(path.join(firstDir,'working.tmp'),'disposable');fs.unlinkSync(path.join(firstDir,'working.tmp'));
 const second=job([target('NZ')]),secondDir=path.join(runs,second.id);const next=await executePriceResearchBatch({job:second,directory:secondDir,memoryRoot,executeTarget:async({providerPricingRouteMemory})=>{
  const routes=providerPricingRoutesForTarget(providerPricingRouteMemory,{service:'max',serviceName:'Max',market:'NZ',derivedCountryCandidates:[candidate('NZ')]});
  assert.deepEqual(routes.map(row=>row.url),[candidate('NZ').url]);assert.equal(JSON.stringify(routes).includes('10.99'),false);return {verified:0};
 }});assert.equal(next.status,'COMPLETE');
});

test('interrupted durable publication leaves completed target evidence intact for retry',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'durable-route-locked-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const runs=path.join(root,'.savlivo','v2-operations','runs'),memoryRoot=path.join(root,'.savlivo','research-v2','storage'),first=job([target('US')]),firstDir=path.join(runs,first.id);
 fs.mkdirSync(firstDir,{recursive:true});fs.mkdirSync(memoryRoot,{recursive:true});fs.writeFileSync(path.join(firstDir,'operation.json'),JSON.stringify(first));
 const lock=path.join(memoryRoot,'provider-pricing-routes-v1.lock');fs.writeFileSync(lock,'held');
 await assert.rejects(executePriceResearchBatch({job:first,directory:firstDir,memoryRoot,executeTarget:async({directory})=>{retainedG1(directory,first.config.batchTargets[0].id);return {verified:3};}}),/EEXIST/);
 assert.equal(fs.existsSync(path.join(firstDir,'price-research-targets','01-max-US','priority-research-links','adaptive-state.json')),true);
 assert.equal(fs.existsSync(path.join(memoryRoot,'provider-pricing-routes-v1.json')),false);
 fs.unlinkSync(lock);
 const resumed=await executePriceResearchBatch({job:first,directory:firstDir,memoryRoot,executeTarget:async()=>{throw Error('MUST_NOT_REACQUIRE');}});
 assert.equal(resumed.status,'COMPLETE');const file=path.join(memoryRoot,'provider-pricing-routes-v1.json'),before=fs.readFileSync(file);
 assert.equal(JSON.parse(before).entries.length,1);
 await executePriceResearchBatch({job:first,directory:firstDir,memoryRoot,executeTarget:async()=>{throw Error('MUST_NOT_REACQUIRE');}});
 assert.deepEqual(fs.readFileSync(file),before);
});

test('route-shaped target without its original G1 receipt is never published as durable success',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'durable-route-no-g1-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const runs=path.join(root,'.savlivo','v2-operations','runs'),memoryRoot=path.join(root,'.savlivo','research-v2','storage'),first=job([target('US')]),firstDir=path.join(runs,first.id);
 fs.mkdirSync(firstDir,{recursive:true});fs.writeFileSync(path.join(firstDir,'operation.json'),JSON.stringify(first));
 const done=await executePriceResearchBatch({job:first,directory:firstDir,memoryRoot,executeTarget:async({directory})=>{
  retainedG1(directory,first.config.batchTargets[0].id);
  fs.unlinkSync(path.join(directory,'priority-research-links','targets','price-research:max:US','open-web-discovery','acquisitions','retained-US','interpretation-0001','targeted-verification.json'));
  return {verified:0};
 }});
 assert.equal(done.status,'COMPLETE');assert.equal(fs.existsSync(path.join(memoryRoot,'provider-pricing-routes-v1.json')),false);
 const second=job([target('NZ')]);
 await executePriceResearchBatch({job:second,directory:path.join(runs,second.id),memoryRoot,executeTarget:async({providerPricingRouteMemory})=>{
  assert.deepEqual(providerPricingRoutesForTarget(providerPricingRouteMemory,{service:'max',serviceName:'Max',market:'NZ',derivedCountryCandidates:[candidate('NZ')]}),[]);
  return {verified:0};
 }});
});

test('completed single known-service source publishes only with its own bound G1 receipt',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'durable-route-single-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const runs=path.join(root,'.savlivo','v2-operations','runs'),memoryRoot=path.join(root,'.savlivo','research-v2','storage'),id=randomUUID(),directory=path.join(runs,id),selected=target('US');
 fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,'operation.json'),JSON.stringify({id,config:{objective:'PRICE_RESEARCH',targetKind:'KNOWN_SERVICE',serviceId:'max',market:'US'}}));retainedG1(directory,selected.id);
 const proof=loadSinglePriceRouteProof({jobRoot:directory,jobId:id,service:'max',market:'US',sourceHash:hash});assert.equal(proof.sourceUrl,sourceUrl);assert.equal(proof.method,'APPROVED_PROXY');
 recoverCompletedPricingRoutes(createProviderPricingRouteMemory(),directory,selected,{memoryRoot,jobId:id,recordedAt:new Date().toISOString(),knownService:true});
 const index=JSON.parse(fs.readFileSync(path.join(memoryRoot,'provider-pricing-routes-v1.json')));
 assert.equal(index.entries.length,1);assert.equal(index.methodOutcomes.length,1);assert.equal(index.methodOutcomes[0].result,'SUCCESS');assert.equal(index.methodOutcomes[0].method,'DECODO');
 assert.throws(()=>loadSinglePriceRouteProof({jobRoot:directory,jobId:id,service:'max',market:'DE',sourceHash:hash}),/PRICING_ROUTE_PROOF_JOB/);
 const retained=path.join(directory,'priority-research-links','targets',selected.id,'open-web-discovery','acquisitions','retained-US','raw',hash+'.body');fs.appendFileSync(retained,' ');
 assert.throws(()=>loadSinglePriceRouteProof({jobRoot:directory,jobId:id,service:'max',market:'US',sourceHash:hash}),/PRICING_ROUTE_PROOF_HASH/);fs.writeFileSync(retained,body);
 const verification=path.join(directory,'priority-research-links','targets',selected.id,'open-web-discovery','acquisitions','retained-US','interpretation-0001','targeted-verification.json');fs.unlinkSync(verification);
 assert.throws(()=>loadSinglePriceRouteProof({jobRoot:directory,jobId:id,service:'max',market:'US',sourceHash:hash}));
});

test('historical route recovery keeps acquisition time and leaves an identical index untouched after restart',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'durable-route-idempotent-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const memoryRoot=path.join(root,'memory'),id=randomUUID(),directory=path.join(root,'runs',id),selected=target('US');
 const acquiredAt='2026-10-19T03:13:44.641Z',recordedAt='2026-10-19T03:20:00.000Z';
 fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,'operation.json'),JSON.stringify({id,config:{objective:'PRICE_RESEARCH',targetKind:'KNOWN_SERVICE',serviceId:'max',market:'US'}}));retainedG1(directory,selected.id,acquiredAt);
 recoverCompletedPricingRoutes(createProviderPricingRouteMemory(),directory,selected,{memoryRoot,jobId:id,recordedAt,knownService:true});
 const file=path.join(memoryRoot,'provider-pricing-routes-v1.json'),before=fs.readFileSync(file),stat=fs.statSync(file),index=JSON.parse(before);
 assert.equal(index.entries.length,1);assert.equal(index.entries[0].route.lastSuccessAt,acquiredAt);assert.equal(index.entries[0].origins[0].acquiredAt,acquiredAt);
 assert.equal(index.methodOutcomes.length,1);assert.equal(index.methodOutcomes[0].result,'SUCCESS');
 const restarted=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',`import {loadPricingRouteMemory} from ${JSON.stringify(new URL('./pricing-route-memory.mjs',import.meta.url).href)};const m=loadPricingRouteMemory(process.argv[1],{services:['max']});console.log(JSON.stringify({routes:m.routes.size,methods:m.methodOutcomes.length}));`,memoryRoot],{encoding:'utf8',timeout:30000});
 assert.equal(restarted.status,0,restarted.stderr);assert.deepEqual(JSON.parse(restarted.stdout),{routes:1,methods:1});
 recoverCompletedPricingRoutes(loadPricingRouteMemory(memoryRoot,{services:['max']}),directory,selected,{memoryRoot,jobId:id,recordedAt,knownService:true});
 assert.deepEqual(fs.readFileSync(file),before);assert.equal(fs.statSync(file).ino,stat.ino);assert.equal(fs.statSync(file).mtimeMs,stat.mtimeMs);
 const after=JSON.parse(fs.readFileSync(file));assert.equal(after.contentHash,index.contentHash);assert.equal(after.entries[0].origins.length,1);assert.equal(after.methodOutcomes.length,1);
});

test('older recovery cannot replace newer proven learning and invalid times fail closed',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'durable-route-order-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const memoryRoot=path.join(root,'memory'),selected=target('US');
 const recover=(acquiredAt,recordedAt)=>{const id=randomUUID(),directory=path.join(root,'runs',id);fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,'operation.json'),JSON.stringify({id,config:{objective:'PRICE_RESEARCH',targetKind:'KNOWN_SERVICE',serviceId:'max',market:'US'}}));retainedG1(directory,selected.id,acquiredAt);recoverCompletedPricingRoutes(loadPricingRouteMemory(memoryRoot,{services:['max']}),directory,selected,{memoryRoot,jobId:id,recordedAt,knownService:true});};
 recover('2026-10-19T05:00:00.000Z','2026-10-19T05:05:00.000Z');
 recover('2026-10-19T04:00:00.000Z','2026-10-19T04:05:00.000Z');
 const file=path.join(memoryRoot,'provider-pricing-routes-v1.json'),index=JSON.parse(fs.readFileSync(file));
 assert.equal(index.entries[0].route.lastSuccessAt,'2026-10-19T05:00:00.000Z');assert.equal(index.entries[0].origins.length,2);assert.equal(index.methodOutcomes.length,2);
 const before=fs.readFileSync(file);
 recover('invalid-time','2026-10-19T06:00:00.000Z');
 recover('2026-10-19T03:00:00.000Z',null);
 assert.deepEqual(fs.readFileSync(file),before);
});
