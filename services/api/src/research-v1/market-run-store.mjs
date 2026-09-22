// Local single-owner append-only research journal; not a distributed transaction.
import assert from 'node:assert/strict';
import {encodeCheckpointPayload,decodeCheckpointPayload} from './checkpoint-objects.mjs';
import {mkdirSync,readdirSync,readFileSync,openSync,writeFileSync,fsyncSync,closeSync,linkSync,unlinkSync,rmdirSync,existsSync,statSync,lstatSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {hostname} from 'node:os';
import {randomUUID,createHash} from 'node:crypto';
export const storeVersion='MARKET_RUN_STORE_V1';
export const digest=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const syncDir=p=>{const fd=openSync(p,'r');try{fsyncSync(fd);}finally{closeSync(fd);}};
function publish(dir,name,value){
 const temp=join(dir,'.pending-'+randomUUID()),fd=openSync(temp,'wx',0o600);
 try{writeFileSync(fd,JSON.stringify(value)+'\n');fsyncSync(fd);}finally{closeSync(fd);}
 linkSync(temp,join(dir,name));syncDir(dir);unlinkSync(temp);syncDir(dir);
}
// Read-only inspection uses exactly the store's chain checks, without acquiring or
// modifying historical ownership. Active/incomplete stores are not knowledge.
// Streaming is bounded by one existing journal record, not cumulative history size.
export function* iterateMarketRunRecords(directory,{owned=false,maxRecordBytes=50001024,maxRecords=100000}={}){
 const dir=resolve(directory),owner=join(dir,'.owner.json');
 const objects=join(dir,'.objects');if(existsSync(objects)){assert(!lstatSync(objects).isSymbolicLink()&&lstatSync(objects).isDirectory(),'Invalid object directory');assert(readdirSync(objects).every(n=>/^[a-f0-9]{64}\.json$/.test(n)),'Incomplete checkpoint object publication');}
 assert(owned||!existsSync(owner),'Retained run is owned');
 const names=readdirSync(dir).filter(n=>n!=='.objects'&&!(owned&&n==='.owner.json')).sort();
 assert(names.length<=maxRecords,'Journal record limit');
 assert(names.every(n=>/^record-\d{8}\.json$/.test(n)),'Unexpected/incomplete journal file');
 let previous=null;
 for(const [i,name] of names.entries()){
  assert.equal(name,`record-${String(i+1).padStart(8,'0')}.json`);
  const path=join(dir,name);assert(!lstatSync(path).isSymbolicLink()&&statSync(path).isFile()&&statSync(path).size<=maxRecordBytes,'Journal record byte limit');
  const r=JSON.parse(readFileSync(path));assert.equal(r.version,storeVersion);assert.equal(r.sequence,i+1);assert.equal(r.previous,previous);
  const {hash,...body}=r;assert.equal(hash,digest(body),'Journal corruption');previous=hash;yield {...r,payload:decodeCheckpointPayload(dir,r.payload)};
 }
 assert(owned||!existsSync(owner),'Retained run became owned');
 assert.deepEqual(readdirSync(dir).filter(n=>n!=='.objects'&&!(owned&&n==='.owner.json')).sort(),names,'Journal changed during inspection');
}
export function readMarketRunRecords(directory,{owned=false,maxBytes=250000000}={}){
 let bytes=0;const records=[];
 for(const r of iterateMarketRunRecords(directory,{owned})){
  bytes+=statSync(join(resolve(directory),`record-${String(r.sequence).padStart(8,'0')}.json`)).size;assert(bytes<=maxBytes,'Retained journal byte limit');records.push(r);
 }
 return records;
}
export function openMarketRunStore(directory,{recoverDeadOwnerToken=null,checkpointObjects=false}={}){
 const dir=resolve(directory);mkdirSync(dir,{recursive:true});syncDir(dirname(dir));
 const gate=join(dir,'.ownership-gate'),ownerPath=join(dir,'.owner.json');
 mkdirSync(gate); // Never guess whether a stranded acquisition/release gate is safe to remove.
 let owner;
 try{
  if(existsSync(ownerPath)){
   const prior=JSON.parse(readFileSync(ownerPath));
   assert(prior.version===storeVersion&&prior.host===hostname()&&prior.token===recoverDeadOwnerToken,'Run owned; explicit dead-owner recovery required');
   assert(Number.isSafeInteger(prior.pid)&&prior.pid>0);
   let dead=false;try{process.kill(prior.pid,0);}catch(e){if(e.code==='ESRCH')dead=true;}
   assert(dead,'Owner is alive or cannot be proven dead');unlinkSync(ownerPath);syncDir(dir);
  }
  owner={version:storeVersion,token:randomUUID(),pid:process.pid,host:hostname()};publish(dir,'.owner.json',owner);
 }finally{rmdirSync(gate);syncDir(dir);}
 let closed=false,poisoned=false,count=0,head=null;
 const verifyOwner=()=>{assert(!closed&&!poisoned,'Store closed or persistence failed');assert.equal(JSON.parse(readFileSync(ownerPath)).token,owner.token);};
 const close=()=>{if(closed)return;mkdirSync(gate);try{assert.equal(JSON.parse(readFileSync(ownerPath)).token,owner.token);unlinkSync(ownerPath);syncDir(dir);closed=true;}finally{rmdirSync(gate);syncDir(dir);}};
 try{
  for(const r of iterateMarketRunRecords(dir,{owned:true})){count=r.sequence;head=r.hash;}
 }catch(e){close();throw e;}
 return {owner:structuredClone(owner),count:()=>count,iterate:()=>iterateMarketRunRecords(dir,{owned:true}),records:()=>readMarketRunRecords(dir,{owned:true}),
  append(type,payload){verifyOwner();
   const logicalBytes=Buffer.byteLength(JSON.stringify(payload));
   if(logicalBytes>200000000)throw Object.assign(Error('Checkpoint expanded payload bound'),{code:'CHECKPOINT_EXPANDED_SIZE_LIMIT'});
   if(checkpointObjects&&['TASK_CHECKPOINT','TASK_COMPLETE'].includes(type)&&logicalBytes>1000000){
    const objects=join(dir,'.objects');mkdirSync(objects,{recursive:true});assert(!lstatSync(objects).isSymbolicLink(),'Invalid object directory');
    payload=encodeCheckpointPayload(payload,(hash,raw)=>{const name=hash+'.json',path=join(objects,name);if(existsSync(path)){assert(!lstatSync(path).isSymbolicLink()&&readFileSync(path,'utf8')===raw+'\n','Immutable object changed');}else publish(objects,name,JSON.parse(raw));});
   }assert(typeof type==='string');assert(count<100000,'Journal record limit');
   const body={version:storeVersion,sequence:count+1,previous:head,type,payload:structuredClone(payload)};
   if(Buffer.byteLength(JSON.stringify(body))>50000000)throw Object.assign(Error('Journal record size limit'),{code:'JOURNAL_RECORD_SIZE_LIMIT'});const record={...body,hash:digest(body)};
   try{publish(dir,`record-${String(body.sequence).padStart(8,'0')}.json`,record);count=record.sequence;head=record.hash;return structuredClone(record);}catch(e){poisoned=true;throw e;}
  },close};
}
