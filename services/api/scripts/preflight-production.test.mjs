// Run after a clean production build; no source-mode module may satisfy worker packaging.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
test('compiled HTTP Preflight dispatch finds its emitted worker on the first request, without research',()=>{
 const root=fileURLToPath(new URL('../../../',import.meta.url));
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'compiled-preflight-'));
 const script=`
 import net from 'node:net';net.Socket.prototype.connect=()=>{throw Error('NETWORK_DENIED')};globalThis.fetch=()=>{throw Error('NETWORK_DENIED')};
 const {Operations}=await import('./services/api/dist/services/api/src/v2-operations/control.mjs');
 const {operationsRequest}=await import('./services/api/dist/services/api/src/v2-operations/http.mjs');
 const {preflightStatus}=await import('./services/api/dist/services/api/src/v2-operations/preflight-operations.mjs');
 const ops=new Operations({repo:${JSON.stringify(temp)},root:${JSON.stringify(temp+'/ops')},read:true,control:true,scheduling:false});
 const pending=await operationsRequest({method:'POST',url:new URL('https://offline.invalid/v1/admin/v2-operations/preflight'),actor:'fixture',body:{objective:'MATURE_LIFECYCLE'}},ops);
 if(pending.status!=='RUNNING')throw Error('NOT_ASYNC');
 for(let n=0;n<200;n++){await new Promise(r=>setTimeout(r,10));const state=preflightStatus(ops,'fixture',pending.id);if(state.status==='FAILED'){
 if(state.error!=='INVALID_LIFECYCLE_SCOPE'||ops.db().jobs.length)throw Error(JSON.stringify(state));console.log('COMPILED_PREFLIGHT_WORKER_PASS');process.exit(0);}}
 throw Error('NO_COMPLETION');`;
 const entry=path.join(temp,'check.mjs');fs.writeFileSync(entry,script.replaceAll("'./services/api/dist/","'"+pathToFileURL(root+'/services/api/dist/').href));
 const result=spawnSync(process.execPath,[entry],{cwd:root,encoding:'utf8',timeout:15000});
 assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/COMPILED_PREFLIGHT_WORKER_PASS/);
});
