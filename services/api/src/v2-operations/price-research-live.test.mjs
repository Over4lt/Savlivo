import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openMarketRunStore,digest} from '../research-v1/market-run-store.mjs';
import {createTavilyDiscovery} from '../research-v2/live/tavily-discovery.mjs';
import {createPriceResearchAdapters} from './price-research-live.mjs';

const capabilities=browser=>({direct:true,tavily:true,decodo:false,browser,groq:false});
const target={id:'fixture-de',service:'fixture',serviceName:'Fixture',market:'DE',researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},urls:['https://provider.example/pricing'],authorities:[{hostname:'provider.example',provider:'Fixture',sourceType:'OFFICIAL_PROVIDER'}],gaps:['amount'],reads:[],queries:[],decisions:[],capabilities:capabilities(true)};
const temp=t=>{const directory=fs.mkdtempSync(path.join(os.tmpdir(),'price-live-browser-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));return directory;};

function discoveryFixture(seen){return {bind({dependencies}){seen.dependencies=dependencies;return {search(){},read(){},classify(){},consumeProvider(){},acquire(){},async render(input){seen.render=input;return dependencies.createRenderedBrowser(input);}};}};}

test('KNOWN_SERVICE_CHILD exposes render only when Browser is enabled',async t=>{
 const directory=temp(t),disabledSeen={},disabledFactory=await createPriceResearchAdapters({market:'DE',capabilities:capabilities(false)},{createDiscovery:async()=>discoveryFixture(disabledSeen),createRenderedBrowser:()=>assert.fail('browser=false must never initialize remote browser')}),disabled=await disabledFactory({stage:'KNOWN_SERVICE_CHILD',directory,targets:[target]});assert.equal('render' in disabled,false);assert.equal('createRenderedBrowser' in disabledSeen.dependencies,false);
 const enabledSeen={};let browsers=0;const marker=()=>{},enabledFactory=await createPriceResearchAdapters({market:'DE',capabilities:capabilities(true),env:{SAVLIVO_BROWSER_WS_ENDPOINT:'ws://savlivo-browser:3000/'}},{createDiscovery:async()=>discoveryFixture(enabledSeen),createRenderedBrowser:()=>{browsers++;return marker;}}),enabled=await enabledFactory({stage:'KNOWN_SERVICE_CHILD',directory,targets:[target]});assert.equal(typeof enabled.render,'function');assert.equal(browsers,0,'remote connection is lazy');assert.equal(await enabled.render({target,directory,need:{}}),marker);assert.equal(browsers,1);
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
