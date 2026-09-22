// Metadata-only, bounded streaming audit. Never follows an unreviewed alias.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {safe,digest,sealed} from './core.mjs';
import {closure} from './references.mjs';
export const scanDefaults={maxEntries:3000000,maxDirectoryEntries:100000,maxDepth:128,maxDurationMs:1800000,progressEvery:10000,maxAliases:1024,maxDiagnostics:256};
const beneath=(p,base)=>p===base||p.startsWith(base+'/');
export function normalizeRoots(roots){return [...new Set(roots)].sort().filter((p,i,a)=>!a.slice(0,i).some(q=>beneath(p,q)));}
export function classifyAlias(root,relativePath){
 const base=fs.realpathSync(root),link=path.resolve(root,relativePath);let target;
 try { // Validate parents without requiring the final component to be non-symlink.
  const parent=path.posix.dirname(relativePath);if(parent!=='.')safe(root,parent);
  if(!fs.lstatSync(link).isSymbolicLink())throw Error('NOT_ALIAS');
  const raw=fs.readlinkSync(link);target=fs.realpathSync(link);
  if(!target.startsWith(base+path.sep))return {path:relativePath,target:raw,classification:'PATH_ESCAPE',safe:false};
  const canonical=path.relative(base,target).split(path.sep).join('/');safe(root,canonical);
  if(beneath(relativePath,canonical))return {path:relativePath,target:canonical,classification:'CYCLE',safe:false};
  return {path:relativePath,target:canonical,classification:'INTERNAL_SAFE_ALIAS',safe:true,portable:false,rawTarget:raw};
 }catch(e){return {path:relativePath,classification:e.code==='ELOOP'?'CYCLE':'UNKNOWN',safe:false,reason:e.code??e.message};}
}
export function* scanEntries(root,roots,{limits={},signal,progress=()=>{},io=fs,clock=Date.now}={}){
 const cfg={...scanDefaults,...limits};for(const v of Object.values(cfg))if(!Number.isSafeInteger(v)||v<1)throw Error('STORAGE_SCAN_LIMIT_CONFIG');
 const started=clock();let count=0;
 function check(){if(signal?.aborted)throw Error('STORAGE_SCAN_CANCELLED');if(clock()-started>cfg.maxDurationMs)throw Error('STORAGE_SCAN_TIMEOUT');if(++count>cfg.maxEntries)throw Error('STORAGE_SCAN_ENTRY_BUDGET');if(count%cfg.progressEvery===0)progress({entries:count});}
 function* walk(rel,depth){
  check();if(depth>cfg.maxDepth)throw Error('STORAGE_SCAN_DEPTH');
  // Parent validation prevents an alias from silently escaping the scan scope.

  const full=path.resolve(root,rel),s=io.lstatSync(full);
  if(s.isSymbolicLink()){yield {kind:'alias',...classifyAlias(root,rel)};return;}
  if(s.isDirectory()){
   const identity=`${s.dev}:${s.ino}:${s.mtimeMs}:${s.ctimeMs}`;
   const names=[];const dir=io.opendirSync(full);
   try{let e;while((e=dir.readSync())){if(names.length>=cfg.maxDirectoryEntries)throw Error('STORAGE_SCAN_DIRECTORY_BUDGET');names.push(e.name);}}finally{dir.closeSync();}
   names.sort();yield {kind:'directory',path:rel,identity};
   for(const name of names)yield* walk(rel+'/'+name,depth+1);
   const after=io.lstatSync(full);if(identity!==`${after.dev}:${after.ino}:${after.mtimeMs}:${after.ctimeMs}`)throw Error('STORAGE_DIRECTORY_PUBLICATION_RACE');
  }else if(s.isFile())yield {kind:'file',path:rel,bytes:s.size,allocatedBytes:s.blocks*512,identity:`${s.dev}:${s.ino}:${s.size}:${s.mtimeMs}:${s.ctimeMs}`,hardlinks:s.nlink};
  else throw Error('STORAGE_NOT_REGULAR');
 }
 const selected=normalizeRoots(roots);for(const rel of selected){if(path.isAbsolute(rel)||rel.split('/').includes('..')||path.posix.normalize(rel)!==rel||rel.includes('\\'))throw Error('STORAGE_PATH_ESCAPE');if(io===fs){const parent=path.posix.dirname(rel);if(parent!=='.')safe(root,parent);}yield* walk(rel,0);}
}
export function streamingInventory(root,spec,{writeRow=()=>{},...options}={}){
 if(spec.schema!=='V2_STORAGE_ROOTS_V1')throw Error('STORAGE_UNKNOWN_INVENTORY_SCHEMA');
 const refs=closure(root,spec.roots),proofs=new Map(refs.entries.map(e=>[e.path,e]));
 const hash=createHash('sha256'),errors=[...refs.errors],aliases=[],classes={};let files=0,logical=0,allocated=0,hardlinked=0,directories=0;
 const roots=normalizeRoots(spec.scan??spec.roots.map(r=>r.path));
 try{for(const row of scanEntries(root,roots,options)){
  if(errors.length>=(options.limits?.maxDiagnostics??scanDefaults.maxDiagnostics))throw Error('STORAGE_DIAGNOSTIC_BUDGET');
  if(row.kind==='alias'){if(aliases.length>=(options.limits?.maxAliases??scanDefaults.maxAliases))throw Error('STORAGE_ALIAS_BUDGET');aliases.push(row);if(!row.safe||!roots.some(p=>beneath(row.target,p)))errors.push('STORAGE_UNCLASSIFIED_OR_OUT_OF_SCOPE_ALIAS:'+row.path);}
  if(row.kind==='directory')directories++;
  if(row.kind==='file'){
   const proof=proofs.get(row.path);row.classification=proof?.classification??'UNKNOWN_OR_UNSAFE_TO_DELETE';row.protected=true;row.reclaimable=false;row.reasons=proof?.reasons??['NO_COMPLETE_REFERENCE_PROOF'];
   if(proof&&proof.identity!==row.identity)errors.push('STORAGE_PUBLICATION_RACE:'+row.path);
   files++;logical+=row.bytes;allocated+=row.allocatedBytes;if(row.hardlinks>1)hardlinked++;
   const c=classes[row.classification]??={files:0,allocatedBytes:0,logicalBytes:0};c.files++;c.allocatedBytes+=row.allocatedBytes;c.logicalBytes+=row.bytes;
  }
  hash.update(JSON.stringify(row)+'\n');writeRow(row);
 }}catch(e){errors.push(e.message);}
 const traversalComplete=!errors.some(e=>!refs.errors.includes(e));
 if(classes.UNKNOWN_OR_UNSAFE_TO_DELETE)errors.push('STORAGE_UNKNOWN_ARTIFACTS_PROTECTED');
 return sealed({schema:'V2_STREAM_INVENTORY_V1',traversalComplete,referenceClosureComplete:refs.complete,filesScanned:files,directoriesScanned:directories,logicalBytes:logical,allocatedBytes:allocated,allocationBasis:'SUM_ST_BLOCKS_NOT_UNIQUE_PHYSICAL_EXTENTS',hardlinkedFiles:hardlinked,classes,aliases,errors:[...new Set(errors)].sort(),rootGeneration:digest({roots,referenceGeneration:refs.rootGeneration,metadata:hash.digest('hex')}),safeToGc:false,destructive:false,referencedArtifactsSelectedForDeletion:0,reclaimableBytes:0,duplicateBytes:null});
}
