import '../offline-replay/offline-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createHash} from 'node:crypto';
import {assertOffline} from '../offline-replay/offline-guard.mjs';
import {reviewV2CandidateAuthority} from '../../research-v3/v2-candidate-authority-adapter.mjs';
import {adaptV2CurrentSource} from '../../research-v3/v2-current-source-adapter.mjs';
import {authorityBinding} from '../../research-v3/discovery-authority.mjs';
import {digest} from '../../research-v3/model.mjs';
import {evaluate} from '../../research-v3/truth.mjs';
import {refreshCatalog} from '../../research-v3/subscription-catalog.mjs';
import {providerRoutingAuthority,installRunScopedV3ProviderAuthority} from './provider-routing-authority.mjs';
import {createResearchMemory,usableResearchMemory} from './research-memory.mjs';
import {runOpenWebResearch} from './open-web-discovery.mjs';
import {defaultHybridProviderResourceMemoryRoot,hybridProviderResourceMemoryContract,loadHybridProviderResources,recordHybridProviderResourceFailure,rememberHybridProviderResource} from './hybrid-provider-resource-memory.mjs';

const service='aurora-club',serviceName='Aurora Club',market='US',host='aurora.example',candidateUrl=`https://${host}/membership`,providerUrl=`https://${host}/pricing`;
const candidateBody=`<html><main><h1>${serviceName} membership</h1><p>We operate ${serviceName} membership and provide our own classes.</p><a href="/pricing">Pricing</a></main><footer>© ${serviceName} 2026. All rights reserved.</footer></html>`;
const target=(extra={})=>({id:'aurora-us',service,serviceName,market,researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},urls:[],authorities:[],gaps:['amount'],reads:[],queries:[],decisions:[],blockedOrigins:[],capabilities:{direct:true,tavily:true,decodo:false,browser:false,groq:false},...extra});
const objective=(markets=[market],providerHosts=[host])=>({kind:'PRICE',serviceId:service,serviceName,providerHosts,markets,seeds:[providerUrl]});
const body=(amount=12,offerExtra={},extra={})=>JSON.stringify({serviceId:service,offers:amount===null?[]:[{id:'monthly',amount,currency:'USD',cadence:'MONTHLY',billingCadence:'MONTHLY',consumer:true,relationship:'SUBSCRIPTION',role:'ORDINARY',market,...offerExtra}],...extra});
function candidateReview(){const sha256=digest(candidateBody);return reviewV2CandidateAuthority({contractVersion:1,observationId:'candidate-proof',target:{service,serviceName},page:{url:candidateUrl,requestedUrl:candidateUrl,outcome:'OK',httpStatus:200,contentType:'text/html',truncated:false,bodyHash:sha256,sourceIntegrity:{sha256},rawSource:{text:candidateBody},accessDecisions:[{decision:'ALLOWED'}]}});}
function providerObservation(currentBody,{url=providerUrl,acquisition={route:'DIRECT'},markets=[market],providerHosts=[host],id='provider-current'}={}){const sha256=digest(currentBody),o=objective(markets,providerHosts);return adaptV2CurrentSource({contractVersion:1,observationId:id,target:{service,serviceName,market},page:{url,requestedUrl:url,outcome:'OK',httpStatus:200,contentType:'application/json',bodyHash:sha256,sourceIntegrity:{sha256},rawSource:{text:currentBody},accessDecisions:[{decision:'ALLOWED'}]},providerAuthority:{status:'AUTHORITATIVE_PROVIDER',binding:authorityBinding(o,url)},acquisition},o);}
function result(observation,markets=[market]){const k={objective:objective(markets),observations:[observation],attempts:[],policyBlocks:[],stop:null},truth=evaluate(k),catalog=structuredClone(refreshCatalog(k,truth));return {k,truth,catalog};}
function fixture(t){const base=fs.mkdtempSync(path.join(os.tmpdir(),'phase3-hybrid-memory-'));t.after(()=>fs.rmSync(base,{recursive:true,force:true}));return {base,root:path.join(base,'research-engine-v1'),run1:path.join(base,'run-1'),run2:path.join(base,'run-2')};}
function seed(t,{amount=12,acquisition={route:'DIRECT'},acquiredAt='2026-10-01T00:00:00.000Z'}={}){const f=fixture(t),review=candidateReview(),observation=providerObservation(body(amount),{acquisition}),r=result(observation),record=rememberHybridProviderResource({root:f.root,target:target(),authorityReview:review,providerObservation:observation,truth:r.truth,catalog:r.catalog,acquisition,acquiredAt});return {...f,review,observation,truth:r.truth,catalog:r.catalog,record};}
const readBody=(directory,page)=>fs.readFileSync(path.join(directory,page.bodyFile),'utf8');

test('contract and default namespace are versioned and isolated',()=>{
 assert.equal(Object.isFrozen(hybridProviderResourceMemoryContract),true);assert.equal(defaultHybridProviderResourceMemoryRoot('/home/test'),'/home/test/.savlivo/research-engine-v1');
 assert.equal(hybridProviderResourceMemoryContract.meaning,'ROUTING_ONLY_REQUIRES_FRESH_ACQUISITION');
});

test('two runs remember routing, reacquire first, and derive changed current Truth',async t=>{
 const f=fixture(t),calls=[];
 const first=await runOpenWebResearch({directory:f.run1,targets:[target()],maxActions:3,search:async()=>{calls.push('RUN1_SEARCH');return {results:[{url:candidateUrl,title:`${serviceName} official membership`}]};},read:async({url})=>{if(url===candidateUrl){calls.push('RUN1_CANDIDATE');return {url,outcome:'OK',httpStatus:200,contentType:'text/html',body:candidateBody,sourceIntegrity:{sha256:digest(candidateBody)},accessDecisions:[{decision:'ALLOWED'}]};}calls.push('RUN1_PROVIDER');const current=body(12);return {url,outcome:'OK',httpStatus:200,contentType:'application/json',body:current,sourceIntegrity:{sha256:digest(current)},accessDecisions:[{decision:'ALLOWED'}]};}});
 assert.deepEqual(calls,['RUN1_SEARCH','RUN1_CANDIDATE','RUN1_PROVIDER']);const firstPage=first.targets[0].reads.at(-1),firstObservation=providerObservation(readBody(f.run1,firstPage)),firstResult=result(firstObservation);assert.equal(firstResult.truth.prices.US.propositions.PRICE_AMOUNT.value,12);
 const record=rememberHybridProviderResource({root:f.root,target:target(),authorityReview:candidateReview(),providerObservation:firstObservation,truth:firstResult.truth,catalog:firstResult.catalog,acquisition:{route:'DIRECT'},acquiredAt:'2026-10-01T00:00:00.000Z'});assert.equal(record.resource.role,'PRICING');
 const noCurrent=evaluate({objective:objective(),observations:[],attempts:[],policyBlocks:[],stop:null,previousTruth:firstResult.truth});assert.equal(noCurrent.established,false);
 const secondCalls=[],secondBody=body(15),second=await runOpenWebResearch({directory:f.run2,targets:[target()],providerResourceMemoryRoot:f.root,memoryNow:'2026-10-02T00:00:00.000Z',maxActions:1,search:async()=>{secondCalls.push('DISCOVERY');return {results:[]};},read:async({url})=>{secondCalls.push('FRESH:'+url);return {url,outcome:'OK',httpStatus:200,contentType:'application/json',body:secondBody,sourceIntegrity:{sha256:digest(secondBody)},accessDecisions:[{decision:'ALLOWED'}]};}});
 assert.deepEqual(secondCalls,['FRESH:'+providerUrl]);const secondPage=second.targets[0].reads[0];assert.equal(secondPage.researchRole,'PROVIDER_SOURCE');const secondObservation=providerObservation(readBody(f.run2,secondPage),{id:'provider-refresh'}),secondResult=result(secondObservation);assert.equal(secondResult.truth.prices.US.propositions.PRICE_AMOUNT.value,15);assert.notEqual(secondResult.truth.prices.US.propositions.PRICE_AMOUNT.value,firstResult.truth.prices.US.propositions.PRICE_AMOUNT.value);
 const updated=rememberHybridProviderResource({root:f.root,target:target(),authorityReview:candidateReview(),providerObservation:secondObservation,truth:secondResult.truth,catalog:secondResult.catalog,acquisition:{route:'DIRECT'},acquiredAt:'2026-10-02T00:00:00.000Z'});assert.equal(updated.resource.lastUsefulAt,'2026-10-02T00:00:00.000Z');assert.equal(updated.resource.failures,0);
});

test('compact record contains routing metadata and proof reference but no old Truth or provider body',t=>{
 const f=seed(t),raw=fs.readFileSync(path.join(f.root,'provider-resources.json'),'utf8'),state=JSON.parse(raw),row=state.resources[0];
 assert.equal(row.resource.url,providerUrl);assert.equal(row.host,host);assert.equal(row.market,market);assert.equal(row.authority.proof.observation.body,undefined);assert.match(row.authority.proof.bodyReference.path,/^proofs\/[a-f0-9]{64}\.txt$/);
 for(const forbidden of ['price','currency','billingCadence','eligibility','catalog','truth','established','offering'])assert.equal(new RegExp('"'+forbidden+'"','i').test(raw),false,forbidden);
 assert.equal(raw.includes(body(12)),false);
});

test('third-party, candidate, and authority-only material cannot enter provider-resource memory',t=>{
 const f=fixture(t),review=candidateReview(),candidate=review.candidateObservation,candidateResult=result(candidate);
 assert.throws(()=>rememberHybridProviderResource({root:f.root,target:target(),authorityReview:review,providerObservation:candidate,truth:candidateResult.truth,catalog:candidateResult.catalog,acquisition:{route:'DIRECT'},acquiredAt:'2026-10-01T00:00:00.000Z'}),/CURRENT_PROVIDER_OBSERVATION_REQUIRED/);
 const third={...providerObservation(body(12)),url:'https://third.example/pricing'};assert.throws(()=>rememberHybridProviderResource({root:f.root,target:target(),authorityReview:review,providerObservation:third,truth:result(providerObservation(body(12))).truth,acquisition:{route:'DIRECT'},acquiredAt:'2026-10-01T00:00:00.000Z'}),/CURRENT_PROVIDER_OBSERVATION_REQUIRED/);
 const empty=providerObservation(body(null));assert.throws(()=>rememberHybridProviderResource({root:f.root,target:target(),authorityReview:review,providerObservation:empty,truth:result(empty).truth,catalog:result(empty).catalog,acquisition:{route:'DIRECT'},acquiredAt:'2026-10-01T00:00:00.000Z'}),/CURRENT_PROVIDER_RESOURCE_NOT_USEFUL/);
});

test('removed current price becomes unresolved and cannot carry forward old price',async t=>{
 const f=seed(t),current=body(null),calls=[],state=await runOpenWebResearch({directory:f.run2,targets:[target()],providerResourceMemoryRoot:f.root,memoryNow:'2026-10-02T00:00:00.000Z',maxActions:1,search:async()=>{calls.push('SEARCH');return {results:[]};},read:async({url})=>{calls.push('READ');return {url,outcome:'OK',httpStatus:200,contentType:'application/json',body:current,sourceIntegrity:{sha256:digest(current)},accessDecisions:[{decision:'ALLOWED'}]};}});
 assert.deepEqual(calls,['READ']);const observation=providerObservation(readBody(f.run2,state.targets[0].reads[0]),{id:'removed-price'}),r=result(observation);assert.equal(r.truth.established,false);assert.equal(r.truth.prices.US.propositions.PRICE_AMOUNT.state,'UNRESOLVED');assert.equal(JSON.stringify(r.truth).includes('12'),false);
});

test('failed or insufficient remembered resource falls back to normal discovery',async t=>{
 const f=seed(t),calls=[],failed=await runOpenWebResearch({directory:f.run2,targets:[target()],providerResourceMemoryRoot:f.root,memoryNow:'2026-10-02T00:00:00.000Z',maxActions:2,search:async()=>{calls.push('SEARCH');return {results:[]};},read:async({url})=>{calls.push('READ:'+url);return {url,outcome:'ERROR',httpStatus:503,contentType:'text/html',failure:{code:'UPSTREAM_FAILED'},accessDecisions:[{decision:'ALLOWED'}]};}});assert.deepEqual(calls,['READ:'+providerUrl,'SEARCH']);assert.equal(failed.targets[0].queries.length,1);assert.equal(JSON.parse(fs.readFileSync(path.join(f.root,'provider-resources.json'))).resources[0].resource.failures,1);
 const g=seed(t),other=[],empty=body(null);await runOpenWebResearch({directory:g.run2,targets:[target()],providerResourceMemoryRoot:g.root,memoryNow:'2026-10-02T00:00:00.000Z',maxActions:2,search:async()=>{other.push('SEARCH');return {results:[]};},read:async({url})=>{other.push('READ:'+url);return {url,outcome:'OK',httpStatus:200,contentType:'application/json',body:empty,sourceIntegrity:{sha256:digest(empty)},accessDecisions:[{decision:'ALLOWED'}]};}});assert.deepEqual(other,['READ:'+providerUrl,'SEARCH']);
});

test('moved resource and sibling host cannot broaden remembered exact-host authority',async t=>{
 const f=seed(t),loaded=loadHybridProviderResources({root:f.root,target:target(),now:'2026-10-02T00:00:00.000Z'});assert.equal(loaded.resources.length,1);const current=target();installRunScopedV3ProviderAuthority(current,loaded.resources[0].authorityReview);assert(providerRoutingAuthority(current,providerUrl));assert.equal(providerRoutingAuthority(current,'https://support.aurora.example/pricing'),null);
 const sibling={...providerObservation(body(12)),url:'https://support.aurora.example/pricing'};assert.throws(()=>rememberHybridProviderResource({root:f.root,target:target(),authorityReview:f.review,providerObservation:sibling,truth:f.truth,catalog:f.catalog,acquisition:{route:'DIRECT'},acquiredAt:'2026-10-02T00:00:00.000Z'}),/CURRENT_PROVIDER_OBSERVATION_REQUIRED/);
 assert.throws(()=>providerObservation(body(12),{url:'https://moved.example/pricing'}),/V2_V3_AUTHORITY/);
 const movedBody=body(15),calls=[],state=await runOpenWebResearch({directory:f.run2,targets:[target()],providerResourceMemoryRoot:f.root,memoryNow:'2026-10-02T00:00:00.000Z',maxActions:2,search:async()=>{calls.push('SEARCH');return {results:[]};},read:async()=>{calls.push('READ');return {url:'https://moved.example/pricing',outcome:'OK',httpStatus:200,contentType:'application/json',body:movedBody,sourceIntegrity:{sha256:digest(movedBody)},accessDecisions:[{decision:'ALLOWED'}]};}});assert.deepEqual(calls,['READ','SEARCH']);assert.equal(state.targets[0].reads[0].researchRole,undefined);assert.equal(JSON.parse(fs.readFileSync(path.join(f.root,'provider-resources.json'))).resources[0].resource.lastOutcome,'MOVED');
});

test('service and market scopes do not leak and memory cannot manufacture market evidence',t=>{
 const f=seed(t);assert.equal(loadHybridProviderResources({root:f.root,target:target({service:'other',serviceName:'Other'}),now:'2026-10-02T00:00:00.000Z'}).resources.length,0);assert.equal(loadHybridProviderResources({root:f.root,target:target({market:'CA'}),now:'2026-10-02T00:00:00.000Z'}).resources.length,0);
 const unboundBody=body(12,{market:null}),observation=providerObservation(unboundBody),r=result(observation);assert.deepEqual(observation.context,{transport:'DIRECT',networkGeography:'UNBOUND',representation:'PROVIDER_PAGE'});assert.equal(r.truth.prices.US.propositions.TARGET_MARKET.state,'UNRESOLVED');
});

test('remembered acquisition route cannot replace a fresh verified country receipt',t=>{
 const freshReceipt={contractVersion:1,kind:'V3_VERIFIED_COUNTRY_RECEIPT',transport:'DECODO',verification:'BRACKET_VERIFIED',requestedCountry:'US',verifiedCountry:'US'},f=seed(t,{acquisition:{route:'DECODO',countryReceipt:freshReceipt}}),loaded=loadHybridProviderResources({root:f.root,target:target(),now:'2026-10-02T00:00:00.000Z'}),row=loaded.resources[0].record;
 assert.equal(row.resource.acquisitionRoute,'DECODO');assert.equal(Object.hasOwn(row.resource,'countryReceipt'),false);assert.throws(()=>providerObservation(body(12,{market:null}),{acquisition:{route:'DECODO'}}),/V2_V3_(?:ACQUISITION|COUNTRY_RECEIPT)_INVALID/);
 const current=providerObservation(body(12,{market:null}),{acquisition:{route:'DECODO',countryReceipt:freshReceipt}}),r=result(current);assert.equal(r.truth.prices.US.propositions.TARGET_MARKET.value,'US');
});

test('tampered index, tampered proof, and missing proof fail closed',t=>{
 const a=seed(t),file=path.join(a.root,'provider-resources.json'),state=JSON.parse(fs.readFileSync(file));state.resources[0].authority.binding.host='other.example';fs.writeFileSync(file,JSON.stringify(state));assert.equal(loadHybridProviderResources({root:a.root,target:target(),now:'2026-10-02T00:00:00.000Z'}).rejected,true);
 const b=seed(t),proof=path.join(b.root,b.record.authority.proof.bodyReference.path);fs.writeFileSync(proof,candidateBody+' changed');assert.equal(loadHybridProviderResources({root:b.root,target:target(),now:'2026-10-02T00:00:00.000Z'}).rejected,true);
 const c=seed(t);fs.unlinkSync(path.join(c.root,c.record.authority.proof.bodyReference.path));assert.equal(loadHybridProviderResources({root:c.root,target:target(),now:'2026-10-02T00:00:00.000Z'}).rejected,true);
});

test('resource memory alone establishes neither price nor catalog completeness',t=>{
 const f=seed(t),loaded=loadHybridProviderResources({root:f.root,target:target(),now:'2026-10-02T00:00:00.000Z'});assert.equal(loaded.resources.length,1);const k={objective:objective(),observations:[],attempts:[],policyBlocks:[],stop:null},truth=evaluate(k),catalog=refreshCatalog(k,truth);assert.equal(truth.established,false);assert.equal(truth.prices.US.propositions.PRICE_AMOUNT.state,'UNRESOLVED');assert.equal(catalog.state,'CATALOG_UNRESOLVED');
});

test('failure backoff prevents infinite remembered-resource retries while discovery remains available',async t=>{
 const f=seed(t),failed=recordHybridProviderResourceFailure({root:f.root,target:target(),resourceId:f.record.id,outcome:'ACQUISITION_FAILED',now:'2026-10-02T00:00:00.000Z'});assert.equal(failed.resource.failures,1);assert.equal(failed.resource.nextRetryAt,'2026-10-04T00:00:00.000Z');
 const load=loadHybridProviderResources({root:f.root,target:target(),now:'2026-10-03T00:00:00.000Z'});assert.equal(load.resources.length,0);assert.equal(load.skipped[0].reason,'FAILURE_BACKOFF');const calls=[];await runOpenWebResearch({directory:f.run2,targets:[target()],providerResourceMemoryRoot:f.root,memoryNow:'2026-10-03T00:00:00.000Z',maxActions:1,search:async()=>{calls.push('SEARCH');return {results:[]};},read:async()=>{calls.push('READ');return {outcome:'ERROR'};}});assert.deepEqual(calls,['SEARCH']);
});

test('historical V2 routing memory remains unchanged outside the hybrid path',t=>{
 const f=fixture(t),referenceFile=path.join(process.cwd(),'package.json'),reference={path:referenceFile,hash:createHash('sha256').update(fs.readFileSync(referenceFile)).digest('hex')},old={...target(),authorities:[{hostname:host,provider:serviceName,checkedAt:'2026-01-01',sourceType:'OFFICIAL_PROVIDER'}],reads:[{requestedUrl:providerUrl,url:providerUrl,outcome:'OK'}]},memory=createResearchMemory(old,reference),current={...old,reads:[],researchMemory:memory};const usable=usableResearchMemory(current);assert.equal(usable.rejected,false);assert.equal(usable.attempts[0].url,providerUrl);assert.equal(fs.existsSync(f.root),false);
});

test('all focused Phase 3 tests remain offline',()=>assert.deepEqual(assertOffline(),{externalNetwork:0,provider:0,decodo:0,groq:0,browser:0,subprocess:0}));
