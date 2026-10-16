import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openMarketRunStore,digest} from '../research-v1/market-run-store.mjs';
import {createTavilyDiscovery} from '../research-v2/live/tavily-discovery.mjs';
import {createPriceResearchAdapters,priceResearchCapabilityPreflight,priceResearchChildEnvironment} from './price-research-live.mjs';
import {researchLinkPriorityTarget} from './price-research.mjs';

const capabilities=browser=>({direct:true,tavily:true,decodo:false,browser,groq:false});
const target={id:'fixture-de',service:'fixture',serviceName:'Fixture',market:'DE',researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},urls:['https://provider.example/pricing'],authorities:[{hostname:'provider.example',provider:'Fixture',sourceType:'OFFICIAL_PROVIDER'}],gaps:['amount'],reads:[],queries:[],decisions:[],capabilities:capabilities(true)};
const temp=t=>{const directory=fs.mkdtempSync(path.join(os.tmpdir(),'price-live-browser-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));return directory;};

function discoveryFixture(seen){return {bind({dependencies}){seen.dependencies=dependencies;return {search(){},read(){},classify(){},consumeProvider(){},acquire(){},async render(input){seen.render=input;return dependencies.createRenderedBrowser(input);}};}};}

test('Research-link priority shares known-service Decodo and classification adapters without changing target permissions',async t=>{
 const directory=temp(t),seen=[],caps={...capabilities(true),decodo:true},env={DECODO_USERNAME:'fixturebase',DECODO_PASSWORD:'private-sentinel',SAVLIVO_BROWSER_RUNTIME:'LOCAL_CONTAINER'},marker=()=>{};
 const factory=await createPriceResearchAdapters({market:'DE',capabilities:caps,env},{createDiscovery:async options=>({bind:context=>{seen.push({options,context});return {search:marker,read:marker,classify:marker,consumeProvider:marker,acquire:marker,render:marker};}}),createRenderedBrowser:()=>marker});
 const priority=researchLinkPriorityTarget({...target,urls:['https://provider.example/pricing'],leads:[{url:'https://provider.example/pricing'}],knownCommercialUrls:['https://provider.example/pricing']},caps);
 assert.equal(priority.capabilities.direct,false);assert.equal(priority.capabilities.tavily,false);assert.equal(priority.capabilities.decodo,true);assert.equal(priority.capabilities.browser,true);assert.deepEqual(priority.urls,[]);assert.deepEqual(priority.leads,[]);assert.deepEqual(priority.knownCommercialUrls,[]);
 const priorityAdapters=await factory({stage:'RESEARCH_LINK_PRIORITY',directory,targets:[priority]});
 const knownAdapters=await factory({stage:'KNOWN_SERVICE_CHILD',directory,targets:[target]});
 assert.deepEqual(Object.keys(priorityAdapters).sort(),Object.keys(knownAdapters).sort());
 for(const name of ['search','read','classify','consumeProvider','acquire','render'])assert.equal(priorityAdapters[name],marker);
 assert.equal(seen.length,2);assert(seen.every(row=>row.context.runtime&&row.context.bundle.provider.ready&&row.context.bundle.verifier.approved));
 assert.equal(seen[0].options.inventory[0].capabilities.direct,false);assert.equal(seen[0].options.inventory[0].capabilities.tavily,false);
 assert.equal(typeof seen[0].context.dependencies.createRenderedBrowser,'function');
});

test('provider seed stays separate and unknown adapter stages fail explicitly',async t=>{
 const directory=temp(t),seen={},factory=await createPriceResearchAdapters({market:'DE',capabilities:capabilities(false)},{createDiscovery:async()=>discoveryFixture(seen)});
 const seed=await factory({stage:'PROVIDER_SEED',directory,targets:[target]});assert.deepEqual(Object.keys(seed).sort(),['read','search']);
 assert.equal('acquire' in seed,false);assert.equal('classify' in seed,false);
 await assert.rejects(factory({stage:'RESEARCH_LINK_PRIORTY',directory,targets:[target]}),/UNKNOWN_ADAPTER_STAGE/);
 assert.equal('dependencies' in seen,false,'invalid stages must fail before discovery adapter binding');
});

test('KNOWN_SERVICE_CHILD exposes render only when Browser is enabled',async t=>{
 const directory=temp(t),disabledSeen={},disabledFactory=await createPriceResearchAdapters({market:'DE',capabilities:capabilities(false)},{createDiscovery:async()=>discoveryFixture(disabledSeen),createRenderedBrowser:()=>assert.fail('browser=false must never initialize local-container browser')}),disabled=await disabledFactory({stage:'KNOWN_SERVICE_CHILD',directory,targets:[target]});assert.equal('render' in disabled,false);assert.equal('createRenderedBrowser' in disabledSeen.dependencies,false);
 const enabledSeen={};let browsers=0;const marker=()=>{},enabledFactory=await createPriceResearchAdapters({market:'DE',capabilities:capabilities(true),env:{SAVLIVO_BROWSER_RUNTIME:'LOCAL_CONTAINER'}},{createDiscovery:async()=>discoveryFixture(enabledSeen),createRenderedBrowser:({env})=>{assert.equal(env.SAVLIVO_BROWSER_RUNTIME,'LOCAL_CONTAINER');browsers++;return marker;}}),enabled=await enabledFactory({stage:'KNOWN_SERVICE_CHILD',directory,targets:[target]});assert.equal(typeof enabled.render,'function');assert.equal(browsers,0,'loopback connection is lazy');assert.equal(await enabled.render({target,directory,need:{}}),marker);assert.equal(browsers,1);
});

test('disabled Tavily is not initialized as a hidden runtime prerequisite',async t=>{
 const directory=temp(t),seen={};let input;const factory=await createPriceResearchAdapters({market:'DE',capabilities:{direct:true,tavily:false,decodo:false,browser:false,groq:false}},{createDiscovery:async options=>{input=options;return discoveryFixture(seen);},createRenderedBrowser:()=>assert.fail('browser is disabled')});await factory({stage:'KNOWN_SERVICE_CHILD',directory,targets:[target]});assert.equal(input.searchEnabled,false);
});

test('existing discovery render hands a retained source-bound parent to the hybrid bridge',async t=>{
 const root=temp(t),runDirectory=path.join(root,'retained'),body='<html><p>Enable JavaScript for prices</p></html>',bodyHash=digest(body);fs.mkdirSync(path.join(runDirectory,'journal'),{recursive:true});fs.writeFileSync(path.join(runDirectory,'page.html'),body);const store=openMarketRunStore(path.join(runDirectory,'journal'));store.append('RESPONSE_CAPTURED',{target:{taskId:target.id},status:200,contentType:'text/html',bodyFile:'page.html',bodyHash,url:target.urls[0]});store.close();
 let received;const discovery=await createTavilyDiscovery({inventory:[target],searchEnabled:false}),live=discovery.bind({dir:root,runtime:null,bundle:null,runLive:null,dependencies:{createRenderedBrowser:async()=>async()=>{},runHybridRenderedAcquisition:async input=>{received=input;return {outcome:'BRIDGE_CALLED'};}}}),result=await live.render({target,directory:root,need:{runDirectory,url:target.urls[0],sourceHash:bodyHash,transport:'DIRECT'}});
 assert.equal(result.outcome,'BRIDGE_CALLED');assert.equal(received.parent.body,body);assert.equal(received.parent.sha256,bodyHash);assert.equal(received.objective.providerHosts[0],'provider.example');assert.equal(received.transport,'DIRECT');assert.equal(typeof received.browser,'function');
});

test('missing retained source-bound parent fails closed before browser creation',async t=>{
 const root=temp(t),runDirectory=path.join(root,'retained');fs.mkdirSync(path.join(runDirectory,'journal'),{recursive:true});const discovery=await createTavilyDiscovery({inventory:[target],searchEnabled:false}),live=discovery.bind({dir:root,runtime:null,bundle:null,runLive:null,dependencies:{createRenderedBrowser:()=>assert.fail('missing parent cannot reach browser')}});
 await assert.rejects(live.render({target,directory:root,need:{runDirectory,url:target.urls[0],sourceHash:'0'.repeat(64),transport:'DIRECT'}}),/RENDERED_PARENT_REQUIRED/);
});

const none={direct:false,tavily:false,decodo:false,browser:false,groq:false};
test('PRICE_RESEARCH Tavily readiness uses environment first with Keychain fallback',async()=>{
 let reads=0;const fromEnv=await priceResearchCapabilityPreflight({...none,tavily:true},{env:{TAVILY_API_KEY:'env-private'},readTavily:async()=>{reads++;return 'local-private';},readGemini:async()=>null});assert.equal(fromEnv.ready,true);assert.equal(fromEnv.availability.tavily.credentialSource,'ENVIRONMENT');assert.equal(reads,0);
 const local=await priceResearchCapabilityPreflight({...none,tavily:true},{env:{},readTavily:async()=>'local-private',readGemini:async()=>null});assert.equal(local.ready,true);assert.equal(local.availability.tavily.credentialSource,'LOCAL_KEYCHAIN');
 const missing=await priceResearchCapabilityPreflight({...none,tavily:true},{env:{},readTavily:async()=>null,readGemini:async()=>null});assert.equal(missing.ready,false);assert.equal(missing.availability.tavily.reason,'TAVILY_CREDENTIAL_UNAVAILABLE');
});

test('PRICE_RESEARCH Decodo readiness validates the complete local runtime contract',async()=>{
 const valid=await priceResearchCapabilityPreflight({...none,decodo:true},{env:{DECODO_USERNAME:'fixturebase',DECODO_PASSWORD:'private-sentinel'},readGemini:async()=>null});assert.equal(valid.ready,true);assert.equal(valid.availability.decodo.reason,'DECODO_LOCAL_RUNTIME_READY');assert.equal(valid.availability.decodo.readiness,'CONDITIONAL');
 for(const env of [{DECODO_USERNAME:'fixturebase',DECODO_PASSWORD:'private-sentinel',SAVLIVO_DECODO_APPROVED:'false'},{DECODO_USERNAME:'fixturebase',DECODO_PASSWORD:'private-sentinel',SAVLIVO_DECODO_RESERVED_COST:'0.05',SAVLIVO_DECODO_ESTIMATED_COST:'0.10'}]){const invalid=await priceResearchCapabilityPreflight({...none,decodo:true},{env,readGemini:async()=>null});assert.equal(invalid.ready,false);assert.equal(invalid.availability.decodo.reason,'DECODO_RUNTIME_CONFIG_NOT_READY');}
 const missing=await priceResearchCapabilityPreflight({...none,decodo:true},{env:{DECODO_USERNAME:'fixturebase'},readDecodo:async()=>null,readGemini:async()=>null});assert.equal(missing.ready,false);assert.equal(missing.availability.decodo.reason,'DECODO_RUNTIME_CONFIG_NOT_READY');
 const market=await priceResearchCapabilityPreflight({...none,decodo:true},{env:{DECODO_USERNAME:'fixturebase',DECODO_PASSWORD:'private-sentinel'},markets:['ZZ'],readGemini:async()=>null});assert.equal(market.ready,false);assert.equal(market.availability.decodo.reason,'DECODO_TARGET_MARKET_UNAVAILABLE');
});

test('PRICE_RESEARCH Browser readiness accepts only the configured local container',async()=>{
 const missing=await priceResearchCapabilityPreflight({...none,browser:true},{env:{NODE_ENV:'development'},readGemini:async()=>null});assert.equal(missing.ready,false);assert.equal(missing.availability.browser.reason,'LOCAL_CONTAINER_BROWSER_NOT_CONFIGURED');
 const configured=await priceResearchCapabilityPreflight({...none,browser:true},{env:{NODE_ENV:'production',SAVLIVO_BROWSER_RUNTIME:'LOCAL_CONTAINER'},readGemini:async()=>null});assert.equal(configured.ready,true);assert.equal(configured.availability.browser.reason,'LOCAL_CONTAINER_PLAYWRIGHT_CONFIGURED');
});

test('Gemini readiness is non-blocking and follows env-first local fallback semantics',async()=>{
 const missing=await priceResearchCapabilityPreflight(none,{env:{},readGemini:async()=>null});assert.equal(missing.ready,true);assert.deepEqual(missing.auxiliary.googleAi,{available:false,reason:'GEMINI_CREDENTIAL_UNAVAILABLE',readiness:'UNAVAILABLE',blocking:false});
 let reads=0;const fromEnv=await priceResearchCapabilityPreflight(none,{env:{GEMINI_API_KEY:'env-private'},readGemini:async()=>{reads++;return 'local-private';}});assert.equal(fromEnv.auxiliary.googleAi.credentialSource,'ENVIRONMENT');assert.equal(reads,0);
 const local=await priceResearchCapabilityPreflight(none,{env:{},readGemini:async()=>'local-private'});assert.equal(local.auxiliary.googleAi.credentialSource,'LOCAL_KEYCHAIN');assert.equal(JSON.stringify(local).includes('local-private'),false);
});

test('PRICE_RESEARCH child environment carries resolved credentials without changing precedence',async()=>{
 let tavilyReads=0;const env=await priceResearchChildEnvironment({TAVILY_API_KEY:'env-tavily',GEMINI_API_KEY:'env-gemini'},{readTavily:async()=>{tavilyReads++;return 'local-tavily';},readGemini:async()=>assert.fail('Gemini environment must win'),readDecodo:async()=>null});assert.equal(env.TAVILY_API_KEY,'env-tavily');assert.equal(env.GEMINI_API_KEY,'env-gemini');assert.equal(tavilyReads,0);
});
