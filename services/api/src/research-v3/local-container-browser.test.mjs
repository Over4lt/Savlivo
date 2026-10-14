import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createLocalContainerBrowserType,createLocalContainerRenderedBrowser,localContainerBrowserConfiguration,localContainerBrowserEndpoint,localPlaywrightVersion} from './local-container-browser.mjs';

test('LOCAL_CONTAINER has one fixed loopback endpoint and forbids endpoint overrides',()=>{
 assert.deepEqual(localContainerBrowserConfiguration({}),{configured:false,reason:'LOCAL_CONTAINER_BROWSER_NOT_CONFIGURED'});
 assert.deepEqual(localContainerBrowserConfiguration({SAVLIVO_BROWSER_RUNTIME:'LOCAL_CONTAINER'}),{configured:true,reason:'LOCAL_CONTAINER_PLAYWRIGHT_CONFIGURED',endpoint:'ws://127.0.0.1:3001/'});
 assert.equal(localContainerBrowserEndpoint,'ws://127.0.0.1:3001/');
 for(const endpoint of ['ws://127.0.0.1:3002/','ws://localhost:3001/','ws://savlivo-browser:3000/','wss://browser.example.com/'])assert.equal(localContainerBrowserConfiguration({SAVLIVO_BROWSER_RUNTIME:'LOCAL_CONTAINER',SAVLIVO_BROWSER_WS_ENDPOINT:endpoint}).reason,'BROWSER_ENDPOINT_OVERRIDE_FORBIDDEN');
 assert.equal(localContainerBrowserConfiguration({SAVLIVO_BROWSER_RUNTIME:'REMOTE'}).reason,'BROWSER_RUNTIME_MODE_INVALID');
 assert.equal(localPlaywrightVersion,'1.58.2');
});

test('API client and internal server pin exactly the same Playwright generation and image',()=>{
 const client=JSON.parse(fs.readFileSync(new URL('../../../../infrastructure/playwright-client/package.json',import.meta.url))),server=JSON.parse(fs.readFileSync(new URL('../../../../infrastructure/browser-runtime/package.json',import.meta.url))),docker=fs.readFileSync(new URL('../../../../Dockerfile',import.meta.url),'utf8');
 assert.equal(client.dependencies['playwright-core'],localPlaywrightVersion);assert.equal(server.dependencies.playwright,localPlaywrightVersion);assert.match(docker,/mcr\.microsoft\.com\/playwright@sha256:68f1c3dca663d0e8331e8af4681b0b315eca7de1bd7fa934aac0accbeb9f8323/);
});

test('local-container Firefox facade uses BrowserType.connect at only the fixed endpoint',async()=>{
 const calls=[],browser={async close(){calls.push('close');}},browserType={async connect(endpoint,options){calls.push({endpoint,options});return browser;}},firefox=createLocalContainerBrowserType(browserType,{timeoutMs:12000}),connected=await firefox.launch({headless:true});
 assert.equal(connected,browser);assert.equal(calls[0].endpoint,'ws://127.0.0.1:3001/');assert.equal(calls[0].options.timeout,12000);assert.deepEqual(JSON.parse(calls[0].options.headers['x-playwright-launch-options']),{headless:true});await connected.close();assert.deepEqual(calls.at(-1),'close');
});

test('rendered capability validates LOCAL_CONTAINER before any connection and remains lazy',async()=>{
 let connects=0;await assert.rejects(createLocalContainerRenderedBrowser({env:{SAVLIVO_BROWSER_RUNTIME:'REMOTE'},browserType:{connect:async()=>{connects++;}}}),/BROWSER_RUNTIME_MODE_INVALID/);assert.equal(connects,0);
 const capability=await createLocalContainerRenderedBrowser({env:{SAVLIVO_BROWSER_RUNTIME:'LOCAL_CONTAINER'},browserType:{connect:async()=>{connects++;return {close:async()=>{}};}}});assert.equal(typeof capability,'function');await capability.close();assert.equal(connects,0,'connection stays lazy until rendered work is scheduled');
});

test('production adapter loads the isolated exact client without opening a connection',async()=>{const capability=await createLocalContainerRenderedBrowser({env:{SAVLIVO_BROWSER_RUNTIME:'LOCAL_CONTAINER'}});assert.equal(typeof capability,'function');await capability.close();});
