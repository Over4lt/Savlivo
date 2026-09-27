import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';
import {Operations} from './control.mjs';import {operationsRequest} from './http.mjs';
test('external restart reconciles a RUNNING job whose numeric PID no longer owns execution; recovery stays explicit',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'orphan-owner-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const env={V2_OPERATIONS_REPOSITORY_ROOT:root,V2_OPERATIONS_STATE_ROOT:root,ANALYTICS_V2_OPERATIONS_ENABLED:'true',ANALYTICS_V2_RUN_CONTROL_ENABLED:'true',ANALYTICS_V2_SCHEDULING_ENABLED:'false'},old=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);t.after(()=>{for(const [k,v]of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v;});
 const id='12345678-1234-1234-1234-123456789abc',worker=path.join(root,'services/api/src/v2-operations/worker.mjs'),other=path.join(root,'api.mjs');fs.mkdirSync(path.dirname(worker),{recursive:true});for(const file of [worker,other])fs.writeFileSync(file,"console.log('ready');setInterval(()=>{},1000);");
 async function launch(file,args=[]){const child=cp.spawn(process.execPath,[file,...args],{stdio:['ignore','pipe','pipe']});t.after(()=>child.kill());await new Promise((resolve,reject)=>{child.once('error',reject);child.stdout.once('data',resolve);});return child;}
 const unrelated=await launch(other);process.kill(unrelated.pid,0);
 // After external process loss the persisted numeric PID resolves to an unrelated process.
 const ops=new Operations({repo:root,root,read:true,control:true,scheduling:false}),job={id,status:'RUNNING',pid:unrelated.pid,actor:'actor',origin:'ADMIN',stopRequested:false,config:{objective:'MATURE_LIFECYCLE'},sourceRun:null};ops.transaction(db=>db.jobs.push(job));const dir=root+'/runs/'+id;fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(dir+'/operation.json',JSON.stringify(job));fs.writeFileSync(dir+'/manifest.json',JSON.stringify({lifecycle:{output:'lifecycle',admission:{executionGeneration:id}},limits:{totalRequests:100}}));fs.writeFileSync(dir+'/checkpoint.json','{"turn":7,"used":3}');fs.writeFileSync(dir+'/network.jsonl','{"kind":"DIRECT"}\n');const bytes=['manifest.json','checkpoint.json','network.jsonl'].map(f=>fs.readFileSync(dir+'/'+f));
 const control=action=>operationsRequest({method:'POST',url:new URL('https://offline.invalid/v1/admin/v2-operations/jobs/'+id+'/'+action),body:{},actor:'actor'},ops);
 await control('stop');assert.equal(ops.db().jobs[0].status,'RUNNING');assert.equal(ops.db().jobs[0].stopRequested,true);
 const {tick}=await import('./worker.mjs?external-restart');await tick();await tick();
 assert.equal(ops.db().jobs[0].status,'INTERRUPTED');assert.equal(ops.db().jobs[0].error,'WORKER_PROCESS_EXITED_CHECKPOINT_PRESERVED');assert.equal(ops.db().events.filter(e=>e.type==='RUN_INTERRUPTED').length,1);await assert.rejects(control('stop'),/RUN_NOT_ACTIVE/);
 assert.equal((await control('resume')).status,'QUEUED');await assert.rejects(control('resume'),/RUN_NOT_RESUMABLE/);assert.equal(ops.db().events.filter(e=>e.type==='RESUME_REQUESTED').length,1);
 const execution=await launch(worker,['--execute',id]);let spawns=0;t.mock.method(Operations.prototype,'prepareQueued',()=>true);t.mock.method(cp,'spawn',()=>{spawns++;return execution;});syncBuiltinESMExports();t.after(()=>{t.mock.restoreAll();syncBuiltinESMExports();});
 await tick();assert.equal(ops.db().jobs[0].status,'RUNNING');assert.equal(ops.db().jobs[0].pid,execution.pid);await Promise.all([tick(),tick()]);assert.equal(spawns,1);assert.equal(ops.db().jobs[0].status,'RUNNING');
 // Unknown inspection is protected, even if it prevents proving ownership.
 const read=fs.readFileSync;if(process.platform==='linux')t.mock.method(fs,'readFileSync',function(file,...args){if(file===`/proc/${execution.pid}/cmdline`)throw Object.assign(Error('denied'),{code:'EACCES'});return read.call(this,file,...args);});else{t.mock.method(cp,'spawnSync',()=>({error:Error('denied')}));syncBuiltinESMExports();}
 await tick();assert.equal(ops.db().jobs[0].status,'RUNNING');
 await control('stop');await tick();assert.equal(ops.db().jobs[0].status,'RUNNING');assert.equal(ops.db().jobs[0].stopRequested,true);
 const exited=new Promise(resolve=>execution.once('exit',resolve));execution.kill();await exited;await tick();await tick();assert.equal(ops.db().jobs[0].status,'INTERRUPTED');assert.equal(spawns,1);
 for(const [i,f]of ['manifest.json','checkpoint.json','network.jsonl'].entries())assert.deepEqual(fs.readFileSync(dir+'/'+f),bytes[i]);
});
