import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {verifyRetainedRun} from './module-stage.mjs';
import {containerMemory,verificationDiagnostics} from './verification-diagnostics.mjs';

function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'verification-diagnostics-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const out=path.join(dir,'interpretation-0001');
 for(const [name,value] of Object.entries({'corpus/sources':{sources:[]},'discovery/bindings':[],'monthly/candidates':[],'monthly/monthly-plan-inventory':[],'monthly/facts':[],'monthly/sources-analyzed':[],'provider-price-intelligence':{}})){
  const file=path.join(out,name+'.json');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value));
 }
 return {dir,out,file:path.join(out,'targeted-runtime-diagnostics.jsonl')};
}
const records=file=>fs.readFileSync(file,'utf8').trim().split('\n').map(JSON.parse);
test('actual verifier launch/exit produces paired bounded scalar telemetry and unchanged result',async t=>{
 const {dir,out,file}=fixture(t);const result=await verifyRetainedRun(dir),rows=records(file);
 assert.deepEqual(rows.map(r=>r.event),['TARGETED_VERIFICATION_START','TARGETED_VERIFICATION_END']);
 assert.equal(rows[0].session,rows[1].session);assert.equal(rows[0].childPid,null);assert.ok(rows[1].childPid>1);
 assert.equal(rows[1].exitCode,0);assert.equal(rows[1].signal,null);assert.ok(rows[1].durationMs>=0);
 assert.ok(Date.parse(rows[1].at)>=Date.parse(rows[0].at));assert.equal(rows[0].parentPid,process.pid);
 for(const row of rows){assert.ok(row.rssBytes>0);assert.ok(row.heapUsedBytes>0);assert.ok(JSON.stringify(row).length<1200);assert.ok(Object.values(row).every(v=>v===null||['number','string'].includes(typeof v)));}
 assert.deepEqual(result,JSON.parse(fs.readFileSync(path.join(out,'targeted-verification.json'))));
 assert.deepEqual(Object.values(result.offline),[0,0,0,0,0,0]);assert.equal(result.monetaryFacts,0);
});
test('actual verifier failure records exit without changing failure contract',async t=>{
 const {dir,out,file}=fixture(t);fs.unlinkSync(path.join(out,'monthly/facts.json'));
 await assert.rejects(verifyRetainedRun(dir),/VERIFICATION_WORKER_FAILED/);
 const rows=records(file);assert.equal(rows.length,2);assert.equal(rows[1].event,'TARGETED_VERIFICATION_END');assert.notEqual(rows[1].exitCode,0);
 assert.equal(fs.existsSync(path.join(out,'targeted-verification.json')),false);
});
test('telemetry write failure cannot affect actual verifier success or failure',async t=>{
 const a=fixture(t);fs.mkdirSync(a.file);assert.equal((await verifyRetainedRun(a.dir)).monetaryFacts,0);
 const b=fixture(t);fs.mkdirSync(b.file);fs.unlinkSync(path.join(b.out,'monthly/facts.json'));
 await assert.rejects(verifyRetainedRun(b.dir),/VERIFICATION_WORKER_FAILED/);
});
test('one start and one terminal record per invocation; repeated invocations append',t=>{
 const {out,file}=fixture(t);
 for(let i=0;i<40;i++){const finish=verificationDiagnostics(out);finish('TARGETED_VERIFICATION_ERROR');finish('TARGETED_VERIFICATION_END');}
 assert.equal(records(file).length,80);assert.ok(fs.statSync(file).size<80*1200);
 const finish=verificationDiagnostics(path.join(out,'absent'));assert.doesNotThrow(()=>finish('TARGETED_VERIFICATION_ERROR'));
});
test('unavailable memory collection cannot escape into research',async t=>{
 const {dir}=fixture(t);t.mock.method(process,'memoryUsage',()=>{throw Error('UNAVAILABLE');});
 assert.equal((await verifyRetainedRun(dir)).monetaryFacts,0);
});
test('bounded cgroup v2/v1 reads and unavailable/unlimited measurements remain unknown',t=>{
 const {dir}=fixture(t);assert.deepEqual(containerMemory(dir),{cgroupVersion:null,cgroupCurrentBytes:null,cgroupLimitBytes:null});
 fs.writeFileSync(path.join(dir,'memory.current'),'1234\n');fs.writeFileSync(path.join(dir,'memory.max'),'max\n');
 assert.deepEqual(containerMemory(dir),{cgroupVersion:2,cgroupCurrentBytes:1234,cgroupLimitBytes:null});
 fs.writeFileSync(path.join(dir,'memory.max'),'2147483648');assert.equal(containerMemory(dir).cgroupLimitBytes,2147483648);
 fs.writeFileSync(path.join(dir,'memory.current'),'9'.repeat(5000));assert.equal(containerMemory(dir).cgroupCurrentBytes,null);
 fs.mkdirSync(path.join(dir,'memory'));fs.writeFileSync(path.join(dir,'memory/memory.usage_in_bytes'),'4321');fs.writeFileSync(path.join(dir,'memory/memory.limit_in_bytes'),'9223372036854771712');
 assert.deepEqual(containerMemory(dir),{cgroupVersion:1,cgroupCurrentBytes:4321,cgroupLimitBytes:null});
});
