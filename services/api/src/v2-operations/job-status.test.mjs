import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {Operations,atomic} from './control.mjs';import {operationsRequest} from './http.mjs';import {recordJobPhase} from './job-status.mjs';import {diagnosticContext} from './diagnostics.mjs';
const id='2892caf1-8c46-6533-9b67-6b87f7e50465';
test('job status is authoritative, actor-owned and preparation requires live persisted evidence',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'job-status-')),ops=new Operations({root,repo:root,read:true,control:true});
 const job={id,status:'QUEUED',actor:'one',config:{services:['fixture']}};ops.transaction(db=>db.jobs.push(job));
 const url=new URL('https://offline.invalid/v1/admin/v2-operations/jobs/'+id),get=actor=>operationsRequest({method:'GET',url,actor},ops);
 assert.equal((await get('one')).phase,null);await assert.rejects(get('two'),/JOB_NOT_FOUND/);await assert.rejects(get(null),/UNAUTHORIZED/);
 const logs=[];t.mock.method(console,'error',line=>logs.push(JSON.parse(line)));recordJobPhase(ops.config,job,'PREPARATION_STARTED');assert.equal((await get('one')).phase,null);fs.writeFileSync(path.join(root,'control.lock'),String(process.pid));assert.equal((await get('one')).phase,'Validating execution');fs.unlinkSync(path.join(root,'control.lock'));assert.equal((await get('one')).phase,null);
 recordJobPhase(ops.config,job,'PREPARATION_FAILED');assert.equal((await get('one')).phase,null);
 atomic(path.join(root,'runs',id,'execution-phase.json'),{jobId:id,event:'PREPARATION_STARTED',pid:99999999});assert.equal((await get('one')).phase,null);
 for(const status of ['RUNNING','COMPLETE','FAILED','STOPPED','INTERRUPTED','SKIPPED_CONFLICT','SKIPPED_NOT_DUE']){ops.transaction(db=>db.jobs[0].status=status);const r=await get('one');assert.equal(r.status,status);assert.equal(r.terminal,status!=='RUNNING');}
 assert.equal(logs[0].jobId,id);assert.equal(logs[0].eventType,'PREPARATION_STARTED');assert.equal(ops.db().jobs.length,1);
});
test('correlation accepts only purpose and opaque IDs, never tokens or arbitrary context',()=>{
 assert.deepEqual(diagnosticContext({purpose:'WORKER_PREPARE',jobId:id,token:'secret',path:'/private/evidence',operationId:'secret'}),{purpose:'WORKER_PREPARE',jobId:id});
 assert.deepEqual(diagnosticContext({purpose:'secret'}),{});
});

test('worker preparation remains QUEUED until claim/publication; observability adds no execution',async t=>{
 const {EventEmitter}=await import('node:events'),{syncBuiltinESMExports}=await import('node:module'),cp=(await import('node:child_process')).default;
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'observed-worker-')),config={root,repo:root,read:true,control:true,scheduling:false};
 const ops=new Operations(config),job={id,status:'QUEUED',actor:'one',origin:'ADMIN',config:{objective:'MATURE_LIFECYCLE'},sourceRun:null};ops.transaction(db=>db.jobs.push(job));fs.mkdirSync(path.join(root,'runs',id),{recursive:true});
 const values={V2_OPERATIONS_REPOSITORY_ROOT:root,V2_OPERATIONS_STATE_ROOT:root,ANALYTICS_V2_OPERATIONS_ENABLED:'true',ANALYTICS_V2_RUN_CONTROL_ENABLED:'true',ANALYTICS_V2_SCHEDULING_ENABLED:'false'},old=Object.fromEntries(Object.keys(values).map(k=>[k,process.env[k]]));Object.assign(process.env,values);t.after(()=>{for(const [k,v]of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v;});
 t.mock.method(Operations.prototype,'index',()=>[]);let prepared=0,spawned=0;
 t.mock.method(Operations.prototype,'prepareQueued',function(_db,j){prepared++;assert.equal(j.status,'QUEUED');assert.equal(this.config.diagnosticContext.jobId,id);assert.equal(this.db().jobs[0].status,'QUEUED');return true;});
 const child=Object.assign(new EventEmitter(),{pid:process.pid,unref(){},kill(){throw Error('No real child should be killed');}});
 t.mock.method(cp,'spawn',()=>{spawned++;return child;});syncBuiltinESMExports();t.after(()=>{t.mock.restoreAll();syncBuiltinESMExports();});
 const logs=[];t.mock.method(console,'error',line=>logs.push(JSON.parse(line)));
 const {tick}=await import('./worker.mjs');await tick();assert.equal(prepared,1);assert.equal(spawned,1);assert.equal(ops.db().jobs[0].status,'RUNNING');assert(ops.db().jobs[0].startedAt);
 assert.deepEqual(logs.filter(e=>e.event==='V2_JOB_EXECUTION').map(e=>e.eventType),['PREPARATION_STARTED','PREPARATION_COMPLETED','CHILD_SPAWNED','RUNNING_PUBLISHED']);
});
