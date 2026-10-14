import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {playwrightChildEnvironment,pwuserIdentity,runtimeConfiguration,browserHost,browserPort} from './supervisor.mjs';

test('Playwright child receives only the bounded non-secret environment',()=>{
 const env=playwrightChildEnvironment({PATH:'/safe/bin',LANG:'C.UTF-8',DATABASE_URL:'secret',OPENAI_API_KEY:'secret',GEMINI_API_KEY:'secret',TAVILY_API_KEY:'secret',SAVLIVO_DECODO_PASSWORD:'secret',ADMIN_PASSKEY:'secret',CHROME_DEVEL_SANDBOX:'/unsafe'});
 assert.deepEqual(env,{PATH:'/safe/bin',HOME:'/home/pwuser',PLAYWRIGHT_BROWSERS_PATH:'/ms-playwright',NODE_ENV:'production',LANG:'C.UTF-8'});
 for(const name of ['DATABASE_URL','OPENAI_API_KEY','GEMINI_API_KEY','TAVILY_API_KEY','SAVLIVO_DECODO_PASSWORD','ADMIN_PASSKEY'])assert.equal(Object.hasOwn(env,name),false);
});

test('runtime fixes the server to pwuser and loopback without an endpoint override',()=>{
 const config=runtimeConfiguration({SAVLIVO_BROWSER_RUNTIME:'LOCAL_CONTAINER',DATABASE_URL:'api-only'},{passwd:'pwuser:x:1001:1001::/home/pwuser:/bin/bash\n'});
 assert.deepEqual(pwuserIdentity('pwuser:x:1001:1001::/home/pwuser:/bin/bash\n'),{uid:1001,gid:1001});assert.equal(browserHost,'127.0.0.1');assert.equal(browserPort,3001);assert.equal(config.browser.uid,1001);assert.equal(config.browser.gid,1001);assert.equal(config.browser.stdin,'pipe');assert.deepEqual(config.browser.args.slice(-6),['--host','127.0.0.1','--port','3001','--max-clients','1']);assert.equal(config.browser.env.CHROME_DEVEL_SANDBOX,undefined);assert.equal(config.browser.env.DATABASE_URL,undefined);assert.equal(config.api.env.DATABASE_URL,'api-only');
});

test('runtime rejects missing mode and every endpoint override',()=>{
 assert.throws(()=>runtimeConfiguration({}, {passwd:'pwuser:x:1001:1001::/home/pwuser:/bin/bash\n'}),/LOCAL_CONTAINER_BROWSER_RUNTIME_REQUIRED/);
 assert.throws(()=>runtimeConfiguration({SAVLIVO_BROWSER_RUNTIME:'LOCAL_CONTAINER',SAVLIVO_BROWSER_WS_ENDPOINT:'ws:\/\/127.0.0.1:3002/'},{passwd:'pwuser:x:1001:1001::/home/pwuser:/bin/bash\n'}),/BROWSER_ENDPOINT_OVERRIDE_FORBIDDEN/);
});

test('Docker runtime keeps one API image, loopback server and no browser port exposure',()=>{
 const docker=fs.readFileSync(new URL('../../Dockerfile',import.meta.url),'utf8');assert.match(docker,/WORKDIR \/opt\/render\/project\/src/);assert.match(docker,/SAVLIVO_BROWSER_RUNTIME=LOCAL_CONTAINER/);assert.doesNotMatch(docker,/EXPOSE\s+3001|0\.0\.0\.0|docker\.sock|SAVLIVO_BROWSER_WS_ENDPOINT|chrome[_-]sandbox|CHROME_DEVEL_SANDBOX|chmod\s+4755/);
});
