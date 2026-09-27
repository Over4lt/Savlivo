import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {claimLeases,releaseLeases,transferLeases} from './leases.mjs';
const setup=()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'operations-lease-'));return [path.join(dir,'worker.lock'),path.join(dir,'runner.lock')];};
test('active Terminal PID lock is never replaced and partial acquisition rolls back',()=>{const files=setup();fs.writeFileSync(files[1],String(process.pid));assert.throws(()=>claimLeases(files),/CONFLICT/);assert.equal(fs.readFileSync(files[1],'utf8'),String(process.pid));assert.equal(fs.existsSync(files[0]),false);});
test('unknown empty owner fails closed',()=>{const files=setup();fs.writeFileSync(files[1],'');assert.throws(()=>claimLeases(files),/CONFLICT/);assert.equal(fs.readFileSync(files[1],'utf8'),'');});
test('release requires ownership and transfer preserves exclusion',()=>{const files=setup();claimLeases(files);releaseLeases(files,process.pid+100000);assert(files.every(f=>fs.existsSync(f)));transferLeases(files,process.pid,process.pid);assert.throws(()=>claimLeases(files));releaseLeases(files,process.pid);assert(files.every(f=>!fs.existsSync(f)));});
test('dead-owner lease can be reclaimed without resetting research state',()=>{const files=setup();for(const file of files)fs.writeFileSync(file,'2147483647');claimLeases(files);assert(files.every(f=>Number(fs.readFileSync(f))===process.pid));releaseLeases(files,process.pid);});

test('execution lease reclaims unrelated live PID but protects worker/poller and source locks',async t=>{
 const {spawn}=await import('node:child_process'),{executionLeaseActive}=await import('./worker-identity.mjs');const repo=fs.mkdtempSync(path.join(os.tmpdir(),'lease-identity-'));t.after(()=>fs.rmSync(repo,{recursive:true,force:true}));
 const worker=path.join(repo,'services/api/src/v2-operations/worker.mjs'),unrelated=path.join(repo,'unrelated.mjs');fs.mkdirSync(path.dirname(worker),{recursive:true});for(const file of [worker,unrelated])fs.writeFileSync(file,"console.log('ready');setInterval(()=>{},1000);");
 const lock=path.join(repo,'execution.lock'),source=path.join(repo,'runner.lock'),options={ownerActive:(file,pid)=>file===lock?executionLeaseActive(repo,pid):true};
 async function child(file,args=[]){const c=spawn(process.execPath,[file,...args],{stdio:['ignore','pipe','pipe']});t.after(()=>c.kill());await new Promise((resolve,reject)=>{c.once('error',reject);c.stdout.once('data',resolve);});return c;}
 const unrelatedChild=await child(unrelated);process.kill(unrelatedChild.pid,0);fs.writeFileSync(lock,String(unrelatedChild.pid));claimLeases([lock],process.pid,options);assert.equal(Number(fs.readFileSync(lock)),process.pid);assert.throws(()=>claimLeases([lock],process.pid,options),/ACTIVE_EXECUTION_CONFLICT/);releaseLeases([lock],process.pid);
 for(const args of [['--poll'],['--execute','12345678-1234-1234-1234-123456789abc']]){const c=await child(worker,args);fs.writeFileSync(lock,String(c.pid));assert.throws(()=>claimLeases([lock],process.pid,options),/ACTIVE_EXECUTION_CONFLICT/);releaseLeases([lock],process.pid);assert.equal(Number(fs.readFileSync(lock)),c.pid);fs.unlinkSync(lock);}
 fs.writeFileSync(source,String(unrelatedChild.pid));assert.throws(()=>claimLeases([lock,source],process.pid,options),/ACTIVE_EXECUTION_CONFLICT/);assert(!fs.existsSync(lock));assert.equal(Number(fs.readFileSync(source)),unrelatedChild.pid);
 fs.unlinkSync(source);claimLeases([lock],process.pid,options);transferLeases([lock],process.pid,unrelatedChild.pid);releaseLeases([lock],process.pid);assert(fs.existsSync(lock));releaseLeases([lock],unrelatedChild.pid);assert(!fs.existsSync(lock));
});
