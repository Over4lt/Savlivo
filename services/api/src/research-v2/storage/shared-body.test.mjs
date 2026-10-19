import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {sha} from './core.mjs';
import {putEvidence,readObservation} from './evidence.mjs';
import {retainSharedSourceBody} from './shared-body.mjs';

function fixture(t){
 const repo=fs.mkdtempSync(path.join(os.tmpdir(),'shared-source-body-'));
 t.after(()=>fs.rmSync(repo,{recursive:true,force:true}));
 const disk=path.join(repo,'.savlivo'),store=path.join(disk,'research-v2','storage');
 const run=(market,index)=>path.join(disk,'v2-operations','runs',market+'-'+index,'open-web-discovery');
 return {repo,disk,store,run};
}

test('100 identical acquisitions retain 100 paths and one physical body inode',t=>{
 const f=fixture(t),body='monthly provider source '.repeat(45000),hash=sha(body),inodes=new Set();
 for(let i=0;i<100;i++){
  const directory=f.run('US',i),result=retainSharedSourceBody(directory,body,hash),file=path.join(directory,result.bodyFile),stat=fs.statSync(file);
  assert.equal(result.bodyHash,hash);assert.equal(fs.readFileSync(file,'utf8'),body);inodes.add(stat.dev+':'+stat.ino);
 }
 const blob=path.join(f.store,'blobs','sha256',hash.slice(0,2),hash),stat=fs.statSync(blob);
 assert.equal(inodes.size,1);assert.equal(stat.nlink,101);assert.equal(stat.mode&0o222,0);
 assert(stat.blocks*512<body.length+8192);
 assert.equal(fs.readdirSync(path.dirname(blob)).filter(name=>name.includes('.publishing-')).length,0);
});

test('same and different market bodies keep independent observations and exact bytes',t=>{
 const f=fixture(t),first='monthly US evidence',second='monthly DE evidence',a=retainSharedSourceBody(f.run('US',1),first),b=retainSharedSourceBody(f.run('DE',1),first),c=retainSharedSourceBody(f.run('DE',2),second);
 assert.equal(fs.statSync(path.join(f.run('US',1),a.bodyFile)).ino,fs.statSync(path.join(f.run('DE',1),b.bodyFile)).ino);
 assert.notEqual(fs.statSync(path.join(f.run('US',1),a.bodyFile)).ino,fs.statSync(path.join(f.run('DE',2),c.bodyFile)).ino);
 const one=putEvidence(f.store,{bytes:first,observationId:'us-observation',observation:{market:'US',retrievedAt:'2026-10-01T00:00:00Z'}});
 const two=putEvidence(f.store,{bytes:first,observationId:'de-observation',observation:{market:'DE',retrievedAt:'2026-10-02T00:00:00Z'}});
 assert.equal(one.blob.path,two.blob.path);assert.notEqual(one.contentHash,two.contentHash);
 assert.equal(readObservation(f.store,'us-observation').observation.market,'US');assert.equal(readObservation(f.store,'de-observation').observation.market,'DE');
});

test('bad expected hash or pre-existing changed body fails closed',t=>{
 const f=fixture(t),directory=f.run('US',1),body='original';
 assert.throws(()=>retainSharedSourceBody(directory,body,'a'.repeat(64)),/STORAGE_BLOB_HASH/);
 const result=retainSharedSourceBody(directory,body);
 assert.throws(()=>retainSharedSourceBody(directory,'changed',result.bodyHash),/STORAGE_BLOB_HASH/);
 const other=f.run('DE',1),file=path.join(other,result.bodyFile);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'tampered');
 assert.throws(()=>retainSharedSourceBody(other,body),/STORAGE_IMMUTABLE_CONFLICT/);
 assert.equal(fs.readFileSync(path.join(directory,result.bodyFile),'utf8'),body);
});

test('outside persistent disk retains a stable body path without shared-store writes',t=>{
 const f=fixture(t),directory=path.join(f.repo,'offline-run'),body='offline fixture',a=retainSharedSourceBody(directory,body),b=retainSharedSourceBody(directory,body);
 assert.deepEqual(a,b);assert.equal(fs.readFileSync(path.join(directory,a.bodyFile),'utf8'),body);
 assert.equal(fs.existsSync(f.store),false);
});

test('a pre-existing writable blob is never linked into a run',t=>{
 const f=fixture(t),body='legacy mutable evidence',hash=sha(body),blob=path.join(f.store,'blobs','sha256',hash.slice(0,2),hash);
 fs.mkdirSync(path.dirname(blob),{recursive:true});fs.writeFileSync(blob,body,{mode:0o600});fs.chmodSync(blob,0o600);
 const result=retainSharedSourceBody(f.run('US',1),body),source=path.join(f.run('US',1),result.bodyFile);
 assert.notEqual(fs.statSync(blob).ino,fs.statSync(source).ino);
 assert.equal(fs.readFileSync(source,'utf8'),body);
});
