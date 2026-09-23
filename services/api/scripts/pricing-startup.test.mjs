// Run after the production build. Exercise the listen callback with all I/O mocked.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('production API startup does not acquire pricing or register a daily refresh',()=>{
 const root=fileURLToPath(new URL('../../../',import.meta.url));
 const dir=mkdtempSync(path.join(tmpdir(),'pricing-startup-'));
 const preload=path.join(dir,'offline.mjs');
 const pg=fileURLToPath(new URL('../../../node_modules/pg/lib/index.js',import.meta.url));
 writeFileSync(preload,`import pg from ${JSON.stringify(pg)};import http from 'node:http';
 let fetches=0;const intervals=[];
 globalThis.fetch=async()=>{fetches++;throw Error('NETWORK_FORBIDDEN')};
 pg.Pool.prototype.query=async()=>({rows:[],rowCount:0});
 globalThis.setInterval=(fn,ms)=>{intervals.push(ms);return {unref(){}}};
 http.Server.prototype.listen=function(...args){args.at(-1)();setTimeout(()=>{
 console.log('STARTUP_AUDIT '+JSON.stringify({fetches,intervals}));process.exit(0)},100)};
 `);
 const result=spawnSync(process.execPath,['--import',preload,'services/api/dist/services/api/src/server.js'],{cwd:root,encoding:'utf8',timeout:15000,env:{...process.env,ANALYTICS_V2_OPERATIONS_ENABLED:'false',ANALYTICS_V2_RUN_CONTROL_ENABLED:'false',ANALYTICS_V2_SCHEDULING_ENABLED:'false'}});
 assert.equal(result.status,0,result.stderr);
 const match=result.stdout.match(/STARTUP_AUDIT (.+)/);assert(match,result.stdout);
 const report=JSON.parse(match[1]);assert.equal(report.fetches,0);assert(!report.intervals.includes(86400000));
 assert.doesNotMatch(result.stdout,/pricing verification checked/);
});
