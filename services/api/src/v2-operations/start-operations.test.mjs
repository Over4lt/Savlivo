import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {Operations} from './control.mjs';import {beginStart,preflightStatus} from './preflight-operations.mjs';import {operationsRequest} from './http.mjs';
const caps={direct:true,tavily:true,decodo:false,browser:false,groq:false};
function fixture(){const repo=fs.mkdtempSync(path.join(os.tmpdir(),'start-control-')),ops=new Operations({repo,root:path.join(repo,'ops'),read:true,control:true,scheduling:false});
 const config={objective:'MATURE_LIFECYCLE',scope:'SELECTED_SERVICES',services:['one'],capabilities:caps};
 ops.transaction(db=>db.preflights.push({token:'token',actor:'actor',expiresAt:'2999-01-01',config,catalogHash:'same'}));
 ops.plan=()=>({config,catalogHash:'same',liveReady:true,actionable:1,manifest:{catalog:[],targets:[],lifecycle:{input:'fixture',output:'fixture'}},source:null});ops.conflicts=()=>[];ops.retainedProofs=()=>[];return ops;
}
test('confirmed Start disconnect/retry recovers one job; status survives lost completion message and token expiry',()=>{
 const ops=fixture();let finish,launches=0;const launch=(_c,_i,_a,done,action)=>{assert.equal(action,'START');launches++;finish=done;};
 const a=beginStart(ops,{token:'token',confirmed:true},'actor',launch);assert.equal(a.status,'RUNNING');assert.equal(ops.db().jobs.length,0);
 assert.equal(beginStart(ops,{token:'token',confirmed:true},'actor',launch).id,a.id);assert.equal(launches,1);
 const job=ops.start('token','actor',true); // Mock validation, actual atomic publication; no poller exists.
 assert.equal(preflightStatus(new Operations(ops.config),'actor',a.id,'START').result.id,job.id);
 finish({error:'SIMULATED_LOST_WORKER_MESSAGE'});assert.equal(preflightStatus(ops,'actor',a.id,'START').status,'SUCCEEDED');
 ops.transaction(db=>db.preflights=[]);assert.equal(beginStart(ops,{token:'token',confirmed:true},'actor',launch).result.id,job.id);
 assert.equal(ops.start('token','actor',true).id,job.id);assert.equal(ops.db().jobs.length,1);assert.equal(launches,1);
 assert.throws(()=>preflightStatus(ops,'other',a.id,'START'),/NOT_FOUND/);assert.throws(()=>beginStart(ops,{token:'token',confirmed:true},'other',launch),/EXPIRED/);
});
test('Start gates reject expiry, missing confirmation, actor and payload changes before dispatch',()=>{
 const ops=fixture(),launch=()=>{throw Error('SHOULD_NOT_LAUNCH')};
 assert.throws(()=>beginStart(ops,{token:'token',confirmed:false},'actor',launch),/CONFIRMATION/);
 for(const extra of [{services:['baseline']},{capabilities:{direct:false}},{objective:'other'}])assert.throws(()=>beginStart(ops,{token:'token',confirmed:true,...extra},'actor',launch),/INVALID_BODY/);
 assert.throws(()=>beginStart(ops,{token:'token',confirmed:true},'other',launch),/EXPIRED/);
 ops.transaction(db=>db.preflights[0].expiresAt='2000-01-01');assert.throws(()=>beginStart(ops,{token:'token',confirmed:true},'actor',launch),/EXPIRED/);assert.equal(ops.db().jobs.length,0);
});
test('final publication repeats token checks, detects mutation during validation and requires readiness/storage',t=>{
 for(const mode of ['stale','selection','capabilities','expiry','readiness','storage']){
  const ops=fixture(),plan=ops.plan;
  ops.plan=()=>{const p=plan();if(mode==='stale')p.catalogHash='changed';
   if(['selection','capabilities','expiry'].includes(mode))ops.transaction(db=>{if(mode==='selection')db.preflights[0].config.services=['other'];if(mode==='capabilities')db.preflights[0].config.capabilities.direct=false;if(mode==='expiry')db.preflights[0].expiresAt='2000-01-01';});
   if(mode==='readiness')p.liveReady=false;return p;};
  const mocked=mode==='storage'?t.mock.method(fs,'statfsSync',()=>({blocks:100,bfree:1,bavail:1,bsize:4096})):null;
  try{assert.throws(()=>ops.start('token','actor',true),/STALE|EXPIRED|CAPABILITY_UNAVAILABLE|STORAGE_LOW_SPACE/);assert.equal(ops.db().jobs.length,0);}finally{mocked?.mock.restore();}
 }
});
test('publication crash cannot create two directories/jobs for one confirmation',()=>{
 const ops=fixture(),transaction=ops.transaction.bind(ops);let id;
 ops.transaction=fn=>{const db=ops.db();const job=fn(db);id=job.id;throw Error('CRASH_BEFORE_STATE_PUBLICATION');};
 assert.throws(()=>ops.start('token','actor',true),/CRASH/);assert.equal(ops.db().jobs.length,0);
 ops.transaction=transaction;assert.equal(ops.start('token','actor',true).id,id);assert.equal(ops.db().jobs.length,1);assert.equal(fs.readdirSync(path.join(ops.config.root,'runs')).length,1);
});
test('failed Start is a recoverable zero-job outcome; Preflight records are not Start records',()=>{
 const ops=fixture(),r=beginStart(ops,{token:'token',confirmed:true},'actor',(_c,_i,_a,done)=>done({error:'PREFLIGHT_STALE'}));
 assert.equal(preflightStatus(ops,'actor',r.id,'START').status,'FAILED');assert.deepEqual(preflightStatus(ops,'actor').rows,[]);assert.equal(ops.db().jobs.length,0);
});

test('job receipt remains recoverable after short-lived operation retention is pruned',()=>{
 const ops=fixture(),job=ops.start('token','actor',true);ops.transaction(db=>{db.preflightOperations=[];db.preflights=[];});
 const receipts=preflightStatus(new Operations(ops.config),'actor',undefined,'START');assert.equal(receipts.rows[0].result.id,job.id);
 assert.equal(preflightStatus(ops,'actor',job.id,'START').result.id,job.id);assert.equal(preflightStatus(ops,'other',undefined,'START').rows.length,0);
 assert.equal(ops.db().jobs.length,1);
});

test('an executed/conflicting on-disk job is never overwritten to recover an interrupted publication',()=>{
 const ops=fixture(),transaction=ops.transaction.bind(ops);let id;
 ops.transaction=fn=>{const job=fn(ops.db());id=job.id;throw Error('CRASH');};assert.throws(()=>ops.start('token','actor',true),/CRASH/);
 const file=path.join(ops.config.root,'runs',id,'operation.json'),job=JSON.parse(fs.readFileSync(file));job.status='RUNNING';fs.writeFileSync(file,JSON.stringify(job));const bytes=fs.readFileSync(file);
 ops.transaction=transaction;assert.throws(()=>ops.start('token','actor',true),/JOB_RECOVERY_CONFLICT/);assert.deepEqual(fs.readFileSync(file),bytes);assert.equal(ops.db().jobs.length,0);
});
