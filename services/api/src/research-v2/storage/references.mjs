import fs from 'node:fs';
import {adaptDocument,adaptSnapshot} from './schema-adapters.mjs';
import path from 'node:path';
import {safe,relative,read,sha,digest,stableBytes,statFile,files,sealed,verifySeal,immutable,canonical,CLASSES} from './core.mjs';
const pathKeys=new Set(['path','file','bodyFile','artifact','directory','originalDirectory','reviewSource','sourceDirectory','sourceRunDirectory','parentDirectory','derivedDirectory','legacyDirectory','cohortManifest','universe','reviewedBindings','providerWorklist','researchScopes','quarantineFile','reconciliationFile','statesFile','input','output','checkpoint','previousRun']);
const hashKeys=new Set(['sha256','hash','bodyHash','contentHash','snapshotHash','fingerprint','inputHash','codeHash','sourceHash']);
// Conservative adapter: path-bearing structures not understood here block closure publication.
// Never infer reclaimability from a directory name or treat an opaque JSON document as raw bytes.
export function closure(root,roots,{maxFiles=100000,maxBytes=4*1024**3,genesisArchive=false}={}){
 const terminalLocks=new Map();
 let archiveMode=genesisArchive;
 const journalCache=new Map();
 const entries=new Map(),errors=[],pending=roots.map(r=>({...r,reason:r.reason??'EXPLICIT_ROOT'}));let total=0,currentReference=null,currentField=null,cursor=0;
 const enqueue=(ref,from)=>{if(!ref||typeof ref.path!=='string'||!CLASSES.includes(ref.classification)||!['JSON','JSONL','BYTES','TREE','FINALIZED','SNAPSHOT','CODE'].includes(ref.format))throw Error('STORAGE_UNKNOWN_REFERENCE');pending.push({...ref,reason:from});};
 function resolve(value,owner,key){if(path.isAbsolute(value))return relative(root,value);if(value.startsWith('.savlivo/')||value.startsWith('docs/')||value.startsWith('services/')||value.startsWith('db/'))return value;if(key==='bodyFile')return path.posix.join(path.posix.dirname(owner),value);const local=path.posix.join(path.posix.dirname(owner),value);if(fs.existsSync(safe(root,local)))return local;if(fs.existsSync(safe(root,value)))return value;throw Error('STORAGE_UNKNOWN_PATH:'+value);}
 function scan(value,owner){
  if(!value||typeof value!=='object')return;
  if(value.status==='REJECTED_INVALID_PRICE_INTERPRETATION'||value.robotsUrl||value.version==='V2_FIELD_VERIFICATION_V1'||value.version===2||value.candidateId||value.factId||value.bodyHash&&(value.unit||value.records))value=adaptDocument(root,value,'nested-evidence').value;
  if(value.inputHashes||value.frozenHashes){for(const [p,h]of Object.entries({...value.inputHashes,...value.frozenHashes})){const name=resolve(p,owner,'path');enqueue({path:name,sha256:h,format:/\.(mjs|js|ts)$/.test(name)?'CODE':format(name),classification:'REFERENCED_EVIDENCE'},owner+':inputHashes');}}
  for(const [key,v]of Object.entries(value)){
   if((key==='runId'&&value.schema?.startsWith('V2_ANALYTICS_'))||['inputHashes','frozenHashes'].includes(key)||hashKeys.has(key)||key==='runsRoot')continue; // runsRoot is a destination; not historical evidence.
   if(key==='runDirectory'&&v!==null)throw Error('STORAGE_UNKNOWN_PATH_FIELD:runDirectory');
   if(typeof v==='string'){
    if(/^https?:\/\//.test(v)||!v||v.includes('<')||v.includes('\n'))continue;
    const looksPath=v.startsWith('.savlivo/')||v.startsWith('docs/')||v.startsWith('/Users/')||v.startsWith('/opt/')||v.startsWith('/tmp/')||v.startsWith('/private/')||(/(?:^|\/)[^/]+\.(json|jsonl|txt|body|log)$/.test(v));
    if(pathKeys.has(key)||looksPath){currentField=key;
     if(!pathKeys.has(key))throw Error('STORAGE_UNKNOWN_PATH_FIELD:'+key);
     const name=resolve(v,owner,key),f=safe(root,name);if(!fs.existsSync(f))throw Error('STORAGE_MISSING_REFERENCE:'+name);
     let expected=key==='bodyFile'?value.bodyHash:key==='path'?(value.sha256??value.hash):undefined;
     if(key==='path'&&/\/journal\/record-\d{8}\.json$/.test(name)&&typeof value.pointer==='string'&&(value.hash||value.recordHash)&&!value.sha256){
      const identity=statFile(f).identity;let cached=journalCache.get(name);
      if(cached&&cached.identity!==identity)throw Error('STORAGE_PUBLICATION_RACE');
      if(!cached){const b=stableBytes(f);cached={identity,record:JSON.parse(b),byteHash:sha(b)};if(journalCache.size>=16)journalCache.delete(journalCache.keys().next().value);journalCache.set(name,cached);}
      const record=cached.record,{hash,...payload}=record;if(cached.sealValid===undefined)cached.sealValid=hash===sha(JSON.stringify(payload));
      if(record.version!=='MARKET_RUN_STORE_V1'||!cached.sealValid||hash!==(value.hash??value.recordHash)||value.sequence!==undefined&&value.sequence!==record.sequence)throw Error('STORAGE_JOURNAL_REFERENCE_HASH');
      if(!value.pointer.startsWith('/'))throw Error('STORAGE_JOURNAL_POINTER');let selected=record.payload;
      for(const segment of value.pointer.slice(1).split('/')){const key=segment.replaceAll('~1','/').replaceAll('~0','~');if(!selected||!Object.hasOwn(selected,key))throw Error('STORAGE_JOURNAL_POINTER');selected=selected[key];}
      expected=cached.byteHash;
     }
     enqueue({path:name,sha256:expected,format:fs.statSync(f).isDirectory()?'TREE':format(name),classification:'REFERENCED_EVIDENCE'},owner+':'+key);
    }
   }else if(v&&typeof v==='object')scan(v,owner);
  }
 }
 try{while(cursor<pending.length){let ref=pending[cursor];pending[cursor++]=null;currentReference=ref.path;if(!CLASSES.includes(ref.classification))throw Error('STORAGE_UNKNOWN_CLASS');const file=safe(root,ref.path);
   if(ref.format==='TREE'){for(const f of files(root,ref.path,maxFiles))enqueue({path:f,format:format(f),classification:ref.classification},ref.reason);continue;}
   const existing=entries.get(ref.path);
   if(existing){if(statFile(file).identity!==existing.identity)throw Error('STORAGE_PUBLICATION_RACE');if(ref.sha256&&ref.sha256!==existing.sha256)throw Error('STORAGE_REFERENCE_HASH:'+ref.path);existing.reasons=[...new Set([...existing.reasons,ref.reason])].sort();continue;}
   if(ref.path.endsWith('.lock')&&!terminalLocks.has(ref.path))throw Error('STORAGE_LOCK_REFERENCE_UNSAFE');const bytes=stableBytes(file),hash=sha(bytes);if(ref.sha256&&hash!==ref.sha256)throw Error('STORAGE_REFERENCE_HASH:'+ref.path);
   if(terminalLocks.has(ref.path)){if(hash!==terminalLocks.get(ref.path))throw Error('STORAGE_ARCHIVED_LOCK_HASH');ref={...ref,classification:'PERMANENT_HISTORY',reason:'SEALED_TERMINAL_LOCK_BYTES_NOT_PRODUCTION_OWNERSHIP'};}
   if(entries.has(ref.path)){entries.get(ref.path).reasons=[...new Set([...entries.get(ref.path).reasons,ref.reason])].sort();continue;}
   total+=bytes.length;if(entries.size>=maxFiles||total>maxBytes)throw Error('STORAGE_CLOSURE_LIMIT');
   entries.set(ref.path,{path:ref.path,sha256:hash,...statFile(file),classification:ref.classification,format:ref.format,reasons:[ref.reason]});
   if(ref.format==='CODE'){if(!/\.(mjs|js|ts)$/.test(ref.path)||!ref.path.match(/^(docs|services|packages)\//))throw Error('STORAGE_CODE_REFERENCE');continue;}
   if(ref.format==='BYTES'){if(/\.(json|jsonl|mjs|js|ts)$/.test(ref.path))throw Error('STORAGE_OPAQUE_STRUCTURED_REFERENCE');continue;}
   if(ref.format==='FINALIZED'){const m=verifySeal(JSON.parse(bytes),'V2_FINALIZED_REFERENCES_V1');for(const e of m.entries)enqueue(e,ref.path);continue;}
   if(ref.format==='SNAPSHOT'){const s=JSON.parse(bytes),{snapshotHash,...p}=s;const legacy=sha(JSON.stringify(p));if(!Object.hasOwn(s,'snapshotHash'))throw Error('STORAGE_LEGACY_SEAL_MISSING');if(s.version!==1||snapshotHash!==legacy)throw Error('STORAGE_LEGACY_SNAPSHOT_HASH');
    if(archiveMode)for(const parent of s.parents??[]){
     if(!['catalog','pricing'].some(phase=>s.inputHashes[parent.directory+'/'+phase+'/adaptive.lock']))continue;
     const bound=p=>{const b=stableBytes(safe(root,p));if(!s.inputHashes[p]||sha(b)!==s.inputHashes[p])throw Error('STORAGE_ARCHIVE_TERMINAL_PROOF');return b;};
     const summary=JSON.parse(bound(parent.directory+'/summary.json'));
     const ledger=String(bound(parent.directory+'/network.jsonl')).trim().split('\n').filter(Boolean).map(JSON.parse);
     if(summary.executionComplete!==true||summary.additionalRequests!==ledger.length||parent.requests!==ledger.length||ledger.some(e=>!s.cohort.includes(e.service)))throw Error('STORAGE_ARCHIVE_ACCOUNTING');
     for(const phase of ['catalog','pricing']){const lock=parent.directory+'/'+phase+'/adaptive.lock';if(!s.inputHashes[lock])continue;const state=JSON.parse(bound(parent.directory+'/'+phase+'/adaptive-state.json'));if(state.complete!==true||state.pending!==null)throw Error('STORAGE_ARCHIVE_NOT_TERMINAL');const pid=String(bound(lock));if(!/^[1-9][0-9]*$/.test(pid))throw Error('STORAGE_ARCHIVE_LOCK_SCHEMA');terminalLocks.set(lock,s.inputHashes[lock]);}
    }
    scan(s.sources?adaptSnapshot(root,s):s,ref.path);continue;}
   if(!['JSON','JSONL'].includes(ref.format))throw Error('STORAGE_UNKNOWN_SCHEMA');
   const values=ref.format==='JSON'?[JSON.parse(bytes)]:String(bytes).split('\n').filter(Boolean).map(JSON.parse);
   for(const v of values){
    if(v?.schema==='PRODUCTION_GENESIS_V1'){
     const {genesisHash,...payload}=v;if(genesisHash!==digest(payload)||v.lineage?.kind!=='NEW_PRODUCTION_GENESIS'||v.lineage.continuesHistoricalSnapshot!==false)throw Error('STORAGE_GENESIS_SEAL');
     const boundary=verifySeal(v.protectedReferences,'V2_FINALIZED_REFERENCES_V1');if(boundary.boundaryKind!=='PRODUCTION_GENESIS_V1'||!boundary.complete||boundary.unknownRequiredDependencies!==0||!Array.isArray(v.excludedUntrustedHistoricalArtifacts)||!v.excludedUntrustedHistoricalArtifacts.length||boundary.entries.some(e=>v.excludedUntrustedHistoricalArtifacts.some(x=>x.path===e.path||x.sha256===e.sha256)))throw Error('STORAGE_GENESIS_BOUNDARY');
     if(digest(boundary.roots)!==digest(v.sourceRoots))throw Error('STORAGE_GENESIS_ROOTS');archiveMode=true;
     for(const r of v.sourceRoots){const e=boundary.entries.find(e=>e.path===r.path);if(!e)throw Error('STORAGE_GENESIS_ROOT_HASH');enqueue({...r,sha256:e.sha256},'PRODUCTION_GENESIS_SOURCE');}
     enqueue({path:v.lifecycle.productionInput,sha256:v.lifecycle.productionInputHash,format:'JSON',classification:'PERMANENT_CANONICAL'},'PRODUCTION_GENESIS_EXECUTION_INPUT');continue;
    }
    if(v?.schema&& !['V2_EVIDENCE_OBSERVATION_V1','V2_BLOB_V1','V2_ANALYTICS_RUN_V1','V2_ANALYTICS_SERVICE_V1','V2_ANALYTICS_INDEX_V1','V2_HISTORY_INDEX_POINTER_V1'].includes(v.schema))throw Error('STORAGE_UNKNOWN_SCHEMA:'+v.schema);const adapted=adaptDocument(root,v,ref.path);for(const r of adapted.references)enqueue(r,r.reason);scan(adapted.value,ref.path);}
  }}catch(e){errors.push(e.message?.startsWith('STORAGE_')?e.message:'STORAGE_UNREADABLE_OR_UNKNOWN_REFERENCE');}
 const result=[...entries.values()].sort((a,b)=>a.path.localeCompare(b.path));return {complete:errors.length===0,errors,errorReference:errors.length?currentReference:null,errorField:errors.length?currentField:null,entries:result,rootGeneration:digest(result.map(e=>[e.path,e.sha256])),logicalBytes:result.reduce((n,e)=>n+e.bytes,0)};
}
export const format=p=>p.endsWith('.jsonl')?'JSONL':p.endsWith('.json')?'JSON':'BYTES';
export function validateReceipt(root,receipt){verifySeal(receipt,'V2_FINALIZED_REFERENCES_V1');if(!receipt.complete||receipt.entries.some(e=>!CLASSES.includes(e.classification)))throw Error('STORAGE_INCOMPLETE_FINALIZATION');for(const e of receipt.entries){if(sha(stableBytes(safe(root,e.path)))!==e.sha256)throw Error('STORAGE_REFERENCE_HASH:'+e.path);}const actual=closure(root,receipt.roots);if(!actual.complete||actual.entries.length!==receipt.entries.length||actual.entries.some(e=>!receipt.entries.some(r=>r.path===e.path&&r.sha256===e.sha256)))throw Error('STORAGE_INCOMPLETE_FINALIZATION');return receipt;}
export function publishReceipt(root,{destination,roots,runId,versions,cohort,baseline,capabilities,createdAt,continuation=null}){
 if(!versions?.engine||!versions.policy||!versions.schema||!createdAt||!Array.isArray(cohort)||!cohort.length||new Set(cohort).size!==cohort.length||!Array.isArray(baseline)||cohort.some(id=>baseline.includes(id)))throw Error('STORAGE_FINALIZATION_SCOPE');
 const result=closure(root,roots);if(!result.complete)throw Error(result.errors.join(';'));
 const receipt=sealed({schema:'V2_FINALIZED_REFERENCES_V1',complete:true,runId,createdAt,versions,cohort,baseline,capabilities,roots,continuation,entries:result.entries.map(({identity,...e})=>e),rootGeneration:result.rootGeneration});
 validateReceipt(root,receipt);immutable(safe(root,destination),canonical(receipt));return validateReceipt(root,receipt);
}
