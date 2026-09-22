// Immutable payload objects. A journal record's hash binds the root/reference tree.
import assert from 'node:assert/strict';
import {existsSync,lstatSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const hash=s=>createHash('sha256').update(s).digest('hex');
const marker='$researchObjectV1',threshold=32768,objectLimit=16000000;
export function encodeCheckpointPayload(payload,put){
 let nodes=0;
 const encode=v=>{
  assert(++nodes<=500000,'Checkpoint object node bound');
  let out=v;
  if(v&&typeof v==='object'){
   assert(!Object.hasOwn(v,marker),'Reserved checkpoint reference key');
   out=Array.isArray(v)?v.map(x=>x===undefined?null:encode(x)):Object.fromEntries(Object.entries(v).filter(([,x])=>x!==undefined).map(([k,x])=>[k,encode(x)]));
  }
  const raw=JSON.stringify(out);
  if(Buffer.byteLength(raw)<threshold)return out;
  assert(Buffer.byteLength(raw)<=objectLimit,'Checkpoint immutable object size limit');
  const sha256=hash(raw);put(sha256,raw);return {[marker]:sha256};
 };
 return {$checkpointObjects:1,root:encode(payload)};
}
export function decodeCheckpointPayload(directory,payload){
 if(payload?.$checkpointObjects!==1)return payload;
 assert(Object.keys(payload).sort().join(',')==='$checkpointObjects,root','Invalid checkpoint encoding');
 let nodes=0,expanded=0;
 const decode=v=>{
  assert(++nodes<=500000,'Checkpoint expanded node bound');
  if(v&&typeof v==='object'&&Object.hasOwn(v,marker)){
   assert(Object.keys(v).length===1&&/^[a-f0-9]{64}$/.test(v[marker]),'Invalid checkpoint object reference');
   const path=join(directory,'.objects',v[marker]+'.json');assert(existsSync(path)&&!lstatSync(path).isSymbolicLink()&&lstatSync(path).size<=objectLimit+1,'Missing/invalid checkpoint object');
   const raw=readFileSync(path,'utf8').replace(/\n$/,'');assert.equal(hash(raw),v[marker],'Checkpoint object corruption');return decode(JSON.parse(raw));
  }
  if(typeof v==='string'){expanded+=Buffer.byteLength(v);assert(expanded<=200000000,'Checkpoint expanded payload bound');return v;}
  if(v&&typeof v==='object')return Array.isArray(v)?v.map(decode):Object.fromEntries(Object.entries(v).map(([k,x])=>[k,decode(x)]));
  return v;
 };
 return decode(payload.root);
}
