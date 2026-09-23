import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {canonical,digest,sha,stableHash,stableJsonLines} from './core.mjs';
test('bounded canonical hashing is byte-compatible with existing immutable seals',()=>{
 const cases=[null,true,12,'text 💚',[undefined,NaN,Infinity],{z:1,'10':'ten','2':'two',a:{skip:undefined,value:'é'},arr:[1,null]},Object.fromEntries(Array.from({length:20000},(_,i)=>['key'+i,{path:'p/'+i,sha256:'a'.repeat(64),values:[i,false,null]}]))];
 for(const value of cases)assert.equal(digest(value),sha(canonical(value)));
});
test('protected file hashes use bounded reads and preserve exact bytes',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'storage-hash-')),file=path.join(dir,'body');t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const data=Buffer.alloc(2*1024*1024+3,123);fs.writeFileSync(file,data);
 const original=fs.readSync;let maximum=0;t.mock.method(fs,'readSync',(...args)=>{maximum=Math.max(maximum,args[3]);return original(...args);});
 assert.equal(stableHash(file),sha(data));assert(maximum<=65536);
});

test('JSONL consumes records incrementally with bounded reads and exact Unicode',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'storage-jsonl-')),file=path.join(dir,'events.jsonl');t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 fs.writeFileSync(file,Array.from({length:10000},(_,i)=>JSON.stringify({i,text:'é💚'.repeat(20)})).join('\n'));
 const original=fs.readSync;let bytes=0;t.mock.method(fs,'readSync',(...args)=>{assert(args[3]<=65536);const n=original(...args);bytes+=n;return n;});
 const rows=stableJsonLines(file);assert.equal(bytes,0);assert.deepEqual(rows.next().value,{i:0,text:'é💚'.repeat(20)});assert(bytes<=65536);
 let count=1;for(const row of rows){assert.equal(row.i,count++);}assert.equal(count,10000);
});

test('streamed legacy JSON hashes and snapshot publication preserve exact historical serialization',async()=>{
 const {jsonDigest,streamJson}=await import('./core.mjs');
 const value={z:1,'12':'a','3':'b',nested:{a:[1,null,'é💚',{},[]],omit:undefined},data:Array.from({length:30000},(_,i)=>({i,value:'example'}))};
 assert.equal(jsonDigest(value),sha(JSON.stringify(value)));
 for(const space of [0,2]){const chunks=[];streamJson(value,s=>chunks.push(s),{space});assert.equal(chunks.join(''),JSON.stringify(value,null,space));assert(chunks.length>10);assert(Math.max(...chunks.map(s=>s.length))<131072);}
});

test('streamed verification still fails on a concurrently changed protected file',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'storage-race-')),file=path.join(dir,'body');t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));fs.writeFileSync(file,'original');
 const original=fs.readSync;let changed=false;t.mock.method(fs,'readSync',(...args)=>{const n=original(...args);if(!changed){changed=true;fs.appendFileSync(file,'changed');}return n;});
 assert.throws(()=>stableHash(file),/STORAGE_PUBLICATION_RACE/);
});

test('schema adaptation shares unchanged graphs without mutating or skipping locator validation',async()=>{
 const {adaptDocument}=await import('./schema-adapters.mjs');
 const untouched={observations:Array.from({length:1000},(_,i)=>({text:'example',i}))};
 const original={version:'V2_FIELD_VERIFICATION_V1',untouched,locator:{path:'$/html/body[1]'}};
 const copy=structuredClone(original),adapted=adaptDocument('/tmp',original,'verification.json');
 assert.deepEqual(original,copy);assert.equal(adapted.value.untouched,untouched);assert.equal(adapted.value.locator.domLocator,'$/html/body[1]');
 assert.throws(()=>adaptDocument('/tmp',{...original,locator:{path:'$/invalid?locator'}},'verification.json'),/DOM_LOCATOR/);
});

test('validation collection cadence is bounded by unique files, not repeated references',async t=>{
 const {closure}=await import('./references.mjs');const root=fs.mkdtempSync(path.join(os.tmpdir(),'storage-cadence-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const roots=Array.from({length:256},(_,i)=>{const file=i+'.txt';fs.writeFileSync(path.join(root,file),'body');return {path:file,format:'BYTES',classification:'REFERENCED_EVIDENCE'};});
 roots.push(...Array.from({length:10000},()=>roots[0]));let calls=0;const gc=globalThis.gc;
 globalThis.gc=()=>calls++;t.mock.method(process,'memoryUsage',()=>({heapUsed:200*1024**2,external:0}));
 try{const result=closure(root,roots);assert.equal(result.complete,true);assert.equal(result.entries.length,256);assert.equal(calls,2);}finally{if(gc)globalThis.gc=gc;else delete globalThis.gc;}
});

test('JSONL parsing is bound to the identity whose bytes were authenticated',async t=>{
 const {statFile}=await import('./core.mjs'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'jsonl-identity-')),file=path.join(dir,'events.jsonl');t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 fs.writeFileSync(file,'{"old":true}\n');const identity=statFile(file).identity;stableHash(file);fs.appendFileSync(file,'{"new":true}\n');
 assert.throws(()=>[...stableJsonLines(file,identity)],/STORAGE_PUBLICATION_RACE/);
});
