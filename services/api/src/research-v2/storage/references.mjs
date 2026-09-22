import fs from 'node:fs';
import path from 'node:path';
import {safe,relative,read,sha,digest,stableBytes,statFile,files,sealed,verifySeal,immutable,canonical,CLASSES} from './core.mjs';
const pathKeys=new Set(['path','file','bodyFile','artifact','directory','originalDirectory','reviewSource','sourceDirectory','sourceRunDirectory','parentDirectory','derivedDirectory','legacyDirectory','cohortManifest','universe','reviewedBindings','providerWorklist','researchScopes','quarantineFile','reconciliationFile','statesFile','input','output','checkpoint','previousRun']);
const hashKeys=new Set(['sha256','hash','bodyHash','contentHash','snapshotHash','fingerprint','inputHash','codeHash','sourceHash']);
// Conservative adapter: path-bearing structures not understood here block closure publication.
// Never infer reclaimability from a directory name or treat an opaque JSON document as raw bytes.
export function closure(root,roots,{maxFiles=100000,maxBytes=4*1024**3}={}){
 const entries=new Map(),errors=[],pending=roots.map(r=>({...r,reason:r.reason??'EXPLICIT_ROOT'}));let total=0;
 const enqueue=(ref,from)=>{if(!ref||typeof ref.path!=='string'||!CLASSES.includes(ref.classification)||!['JSON','JSONL','BYTES','TREE','FINALIZED','SNAPSHOT'].includes(ref.format))throw Error('STORAGE_UNKNOWN_REFERENCE');pending.push({...ref,reason:from});};
 function resolve(value,owner,key){if(path.isAbsolute(value))return relative(root,value);if(value.startsWith('.savlivo/')||value.startsWith('docs/')||value.startsWith('services/')||value.startsWith('db/'))return value;if(key==='bodyFile')return path.posix.join(path.posix.dirname(owner),value);const local=path.posix.join(path.posix.dirname(owner),value);if(fs.existsSync(safe(root,local)))return local;if(fs.existsSync(safe(root,value)))return value;throw Error('STORAGE_UNKNOWN_PATH:'+value);}
 function scan(value,owner){
  if(!value||typeof value!=='object')return;
  if(value.inputHashes||value.frozenHashes){for(const [p,h]of Object.entries({...value.inputHashes,...value.frozenHashes})){const name=resolve(p,owner,'path');enqueue({path:name,sha256:h,format:format(name),classification:'REFERENCED_EVIDENCE'},owner+':inputHashes');}}
  for(const [key,v]of Object.entries(value)){
   if((key==='runId'&&value.schema?.startsWith('V2_ANALYTICS_'))||['inputHashes','frozenHashes'].includes(key)||hashKeys.has(key)||key==='runsRoot')continue; // runsRoot is a destination; not historical evidence.
   if(typeof v==='string'){
    if(/^https?:\/\//.test(v)||!v||v.includes('<')||v.includes('\n'))continue;
    const looksPath=v.startsWith('.savlivo/')||v.startsWith('docs/')||v.startsWith('/Users/')||v.startsWith('/opt/')||v.startsWith('/tmp/')||v.startsWith('/private/')||(/(?:^|\/)[^/]+\.(json|jsonl|txt|body|log)$/.test(v));
    if(pathKeys.has(key)||looksPath){
     if(!pathKeys.has(key))throw Error('STORAGE_UNKNOWN_PATH_FIELD:'+key);
     const name=resolve(v,owner,key),f=safe(root,name);if(!fs.existsSync(f))throw Error('STORAGE_MISSING_REFERENCE:'+name);
     enqueue({path:name,sha256:key==='bodyFile'?value.bodyHash:key==='path'?(value.sha256??value.hash):undefined,format:fs.statSync(f).isDirectory()?'TREE':format(name),classification:'REFERENCED_EVIDENCE'},owner+':'+key);
    }
   }else if(v&&typeof v==='object')scan(v,owner);
  }
 }
 try{while(pending.length){const ref=pending.shift();if(!CLASSES.includes(ref.classification))throw Error('STORAGE_UNKNOWN_CLASS');const file=safe(root,ref.path);
   if(ref.format==='TREE'){for(const f of files(root,ref.path,maxFiles))enqueue({path:f,format:format(f),classification:ref.classification},ref.reason);continue;}
   if(ref.path.endsWith('.lock'))throw Error('STORAGE_LOCK_REFERENCE_UNSAFE');const bytes=stableBytes(file),hash=sha(bytes);if(ref.sha256&&hash!==ref.sha256)throw Error('STORAGE_REFERENCE_HASH:'+ref.path);
   if(entries.has(ref.path)){entries.get(ref.path).reasons=[...new Set([...entries.get(ref.path).reasons,ref.reason])].sort();continue;}
   total+=bytes.length;if(entries.size>=maxFiles||total>maxBytes)throw Error('STORAGE_CLOSURE_LIMIT');
   entries.set(ref.path,{path:ref.path,sha256:hash,...statFile(file),classification:ref.classification,format:ref.format,reasons:[ref.reason]});
   if(ref.format==='BYTES'){if(/\.(json|jsonl|mjs|js|ts)$/.test(ref.path))throw Error('STORAGE_OPAQUE_STRUCTURED_REFERENCE');continue;}
   if(ref.format==='FINALIZED'){const m=verifySeal(JSON.parse(bytes),'V2_FINALIZED_REFERENCES_V1');for(const e of m.entries)enqueue(e,ref.path);continue;}
   if(ref.format==='SNAPSHOT'){const s=JSON.parse(bytes),{snapshotHash,...p}=s;const legacy=sha(JSON.stringify(p));if(s.version!==1||snapshotHash!==legacy)throw Error('STORAGE_LEGACY_SNAPSHOT_HASH');scan(s,ref.path);continue;}
   if(!['JSON','JSONL'].includes(ref.format))throw Error('STORAGE_UNKNOWN_SCHEMA');
   const values=ref.format==='JSON'?[JSON.parse(bytes)]:String(bytes).split('\n').filter(Boolean).map(JSON.parse);
   for(const v of values){if(v?.schema&& !['V2_EVIDENCE_OBSERVATION_V1','V2_BLOB_V1','V2_ANALYTICS_RUN_V1','V2_ANALYTICS_SERVICE_V1','V2_ANALYTICS_INDEX_V1','V2_HISTORY_INDEX_POINTER_V1'].includes(v.schema))throw Error('STORAGE_UNKNOWN_SCHEMA:'+v.schema);scan(v,ref.path);}
  }}catch(e){errors.push(e.message?.startsWith('STORAGE_')?e.message:'STORAGE_UNREADABLE_OR_UNKNOWN_REFERENCE');}
 const result=[...entries.values()].sort((a,b)=>a.path.localeCompare(b.path));return {complete:errors.length===0,errors,entries:result,rootGeneration:digest(result.map(e=>[e.path,e.sha256])),logicalBytes:result.reduce((n,e)=>n+e.bytes,0)};
}
export const format=p=>p.endsWith('.jsonl')?'JSONL':p.endsWith('.json')?'JSON':'BYTES';
export function validateReceipt(root,receipt){verifySeal(receipt,'V2_FINALIZED_REFERENCES_V1');if(!receipt.complete||receipt.entries.some(e=>!CLASSES.includes(e.classification)))throw Error('STORAGE_INCOMPLETE_FINALIZATION');for(const e of receipt.entries){if(sha(stableBytes(safe(root,e.path)))!==e.sha256)throw Error('STORAGE_REFERENCE_HASH:'+e.path);}const actual=closure(root,receipt.roots);if(!actual.complete||actual.entries.length!==receipt.entries.length||actual.entries.some(e=>!receipt.entries.some(r=>r.path===e.path&&r.sha256===e.sha256)))throw Error('STORAGE_INCOMPLETE_FINALIZATION');return receipt;}
export function publishReceipt(root,{destination,roots,runId,versions,cohort,baseline,capabilities,createdAt,continuation=null}){
 if(!versions?.engine||!versions.policy||!versions.schema||!createdAt||!Array.isArray(cohort)||!cohort.length||new Set(cohort).size!==cohort.length||!Array.isArray(baseline)||cohort.some(id=>baseline.includes(id)))throw Error('STORAGE_FINALIZATION_SCOPE');
 const result=closure(root,roots);if(!result.complete)throw Error(result.errors.join(';'));
 const receipt=sealed({schema:'V2_FINALIZED_REFERENCES_V1',complete:true,runId,createdAt,versions,cohort,baseline,capabilities,roots,continuation,entries:result.entries.map(({identity,...e})=>e),rootGeneration:result.rootGeneration});
 validateReceipt(root,receipt);immutable(safe(root,destination),canonical(receipt));return validateReceipt(root,receipt);
}
