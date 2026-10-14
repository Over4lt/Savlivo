import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRemoteChromium,createRemoteRenderedBrowser,remoteBrowserConfiguration,remotePlaywrightVersion} from './remote-browser.mjs';

test('remote endpoint accepts only a private Render host in production',()=>{
 assert.deepEqual(remoteBrowserConfiguration({NODE_ENV:'production'}),{configured:false,reason:'REMOTE_BROWSER_ENDPOINT_NOT_CONFIGURED'});
 assert.deepEqual(remoteBrowserConfiguration({NODE_ENV:'production',SAVLIVO_BROWSER_WS_ENDPOINT:'ws://savlivo-browser:3000/'}),{configured:true,reason:'REMOTE_PLAYWRIGHT_CONFIGURED',endpoint:'ws://savlivo-browser:3000/'});
 for(const endpoint of ['wss://browser.example.com/','ws://browser.example.com:3000/','ws://127.0.0.1:3000/','ws://savlivo-browser:3000/path','ws://user:secret@savlivo-browser:3000/'])assert.equal(remoteBrowserConfiguration({NODE_ENV:'production',SAVLIVO_BROWSER_WS_ENDPOINT:endpoint}).reason,'REMOTE_BROWSER_ENDPOINT_INVALID');
 assert.equal(remotePlaywrightVersion,'1.58.2');
});

test('API client and private server pin exactly the same Playwright generation',()=>{
 const client=JSON.parse(fs.readFileSync(new URL('../../../../infrastructure/playwright-client/package.json',import.meta.url))),server=JSON.parse(fs.readFileSync(new URL('../../../../infrastructure/browser-runtime/package.json',import.meta.url))),docker=fs.readFileSync(new URL('../../../../infrastructure/browser-runtime/Dockerfile',import.meta.url),'utf8');
 assert.equal(client.dependencies['playwright-core'],remotePlaywrightVersion);assert.equal(server.dependencies.playwright,remotePlaywrightVersion);assert.match(docker,/mcr\.microsoft\.com\/playwright@sha256:68f1c3dca663d0e8331e8af4681b0b315eca7de1bd7fa934aac0accbeb9f8323/);
});

test('remote Chromium facade uses normal Playwright connect and disconnects cleanly',async()=>{
 const calls=[],browser={async close(){calls.push('close');}},browserType={async connect(endpoint,options){calls.push({endpoint,options});return browser;}},chromium=createRemoteChromium(browserType,'ws://127.0.0.1:3000/',{timeoutMs:12000}),connected=await chromium.launch({headless:true});
 assert.equal(connected,browser);assert.deepEqual(calls,[{endpoint:'ws://127.0.0.1:3000/',options:{timeout:12000}}]);await connected.close();assert.deepEqual(calls.at(-1),'close');
});

test('rendered capability creation validates configuration before connecting',async()=>{
 let connects=0;await assert.rejects(createRemoteRenderedBrowser({env:{NODE_ENV:'production',SAVLIVO_BROWSER_WS_ENDPOINT:'ws://public.example.com:3000/'},browserType:{connect:async()=>{connects++;}}}),/REMOTE_BROWSER_ENDPOINT_INVALID/);assert.equal(connects,0);
 const capability=await createRemoteRenderedBrowser({env:{SAVLIVO_BROWSER_WS_ENDPOINT:'ws://127.0.0.1:3000/'},browserType:{connect:async()=>{connects++;return {close:async()=>{}};}}});assert.equal(typeof capability,'function');await capability.close();assert.equal(connects,0,'connection stays lazy until rendered work is scheduled');
});

test('production adapter loads the isolated exact client without opening a connection',async()=>{const capability=await createRemoteRenderedBrowser({env:{SAVLIVO_BROWSER_WS_ENDPOINT:'ws://127.0.0.1:3000/'}});assert.equal(typeof capability,'function');await capability.close();});
