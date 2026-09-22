// Verify the actual emitted graph without evaluating API startup jobs or transports.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
const root=fileURLToPath(new URL('../../../',import.meta.url));
test('clean committed production build resolves API graph and loads targeting on first start, independent of Decodo config',()=>{
 const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'savlivo-production-imports-')));
 // New isolated checkout: dirty source files and stale dist cannot satisfy imports.
 execFileSync('git',['archive','HEAD','-o',path.join(temp,'source.tar')],{cwd:root});
 execFileSync('tar',['-xf',path.join(temp,'source.tar'),'-C',temp]);
 fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir');
 fs.copyFileSync(new URL('./fix-contract-imports.mjs',import.meta.url),path.join(temp,'services/api/scripts/fix-contract-imports.mjs'));
 execFileSync('npm',['--workspace','@savlivo/api','run','build'],{cwd:temp,stdio:'pipe'});
 const visited=new Set();
 function visit(file){
  if(visited.has(file))return;visited.add(file);assert(fs.statSync(file).isFile(),file);
  if(!/\.(js|mjs|cjs)$/.test(file))return;
  const tree=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  function walk(n){
   const spec=ts.isImportDeclaration(n)||ts.isExportDeclaration(n)?n.moduleSpecifier:undefined;
   if(spec&&ts.isStringLiteral(spec)&&spec.text.startsWith('.'))visit(path.resolve(path.dirname(file),spec.text));
   ts.forEachChild(n,walk);
  }walk(tree);
 }
 const dist=path.join(temp,'services/api/dist');visit(path.join(dist,'services/api/src/server.js'));
 assert(visited.has(path.join(dist,'docs/catalog/global-47/research-v1/decodo-adapter.mjs')));
 assert(visited.has(path.join(dist,'packages/contracts/src/markets.js')));
 const preload=path.join(temp,'offline-start.mjs');
 fs.writeFileSync(preload,`import pg from 'pg'; import http from 'node:http';
 globalThis.fetch=()=>{throw Error('NETWORK_FORBIDDEN')};
 pg.Pool.prototype.query=async()=>({rows:[],rowCount:0});
 http.Server.prototype.listen=function(){console.log('OFFLINE_API_LISTEN_REACHED');process.exit(0)};
 `);
 for(const configured of [false,true,false,true]){
  const env={...process.env,V2_OPERATIONS_REPOSITORY_ROOT:temp,V2_OPERATIONS_STATE_ROOT:'.savlivo/v2-operations',V2_OPERATIONS_LIFECYCLE_INPUT:'',ANALYTICS_V2_OPERATIONS_ENABLED:'false',ANALYTICS_V2_RUN_CONTROL_ENABLED:'false',ANALYTICS_V2_SCHEDULING_ENABLED:'false',SAVLIVO_DECODO_USERNAME:configured?'offline-fixture':'',SAVLIVO_DECODO_PASSWORD:configured?'offline-fixture':''};
  execFileSync(process.execPath,['--input-type=module','-e',`globalThis.fetch=()=>{throw Error('NETWORK_FORBIDDEN')}; await import('./services/api/dist/services/api/src/v2-operations/targeting.mjs'); await import('./services/api/dist/services/api/src/v2-operations/control.mjs');`],{cwd:temp,env,stdio:'pipe'});
  const started=execFileSync(process.execPath,['--import',preload,path.join(dist,'services/api/src/server.js')],{cwd:temp,env,encoding:'utf8',timeout:15000});
  assert.match(started,/subscription market schema ensured/);
  assert.match(started,/OFFLINE_API_LISTEN_REACHED/);
  const supervised=spawnSync('npm',['--workspace','@savlivo/api','start'],{cwd:temp,env:{...env,NODE_OPTIONS:`--import=${preload}`},encoding:'utf8',timeout:30000});
  assert.equal(supervised.error,undefined);
  assert.match(supervised.stdout,/OFFLINE_API_LISTEN_REACHED/,supervised.stderr);
  assert.match(supervised.stdout,/STOPPED/);
  // The mocked API intentionally exits at listen; supervisor must fail closed.
  assert.equal(supervised.status,1,supervised.stderr);

 }
});
