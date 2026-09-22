import fs from 'node:fs';
import {safe,read,files,sha,stableBytes,digest,statFile,CLASSES,sealed} from './core.mjs';
import {closure,format,validateReceipt} from './references.mjs';
export const retentionPolicy={schema:'V2_RETENTION_POLICY_V1',latestCompletedRuns:4,recentDays:60,diagnosticDays:30,screenshotDays:14,cacheDays:7,destructive:false};
const day=86400000;
function coordination(root,paths){return paths.map(p=>[p,fs.existsSync(safe(root,p))?sha(stableBytes(safe(root,p))):null]);}
export function inventory(root,spec,{now=new Date().toISOString(),policy=retentionPolicy,beforeRecheck=()=>{}}={}){
 if(spec.schema!=='V2_STORAGE_ROOTS_V1'||!Array.isArray(spec.roots)||!Array.isArray(spec.scan)||policy.destructive!==false)throw Error('STORAGE_UNKNOWN_INVENTORY_SCHEMA');
 const coordinationPaths=spec.coordination??[],initial=coordination(root,coordinationPaths),roots=[...spec.roots],errors=[],runMetadata=[];
 // Explicit run locations come from the engine/operator input, never a deletion heuristic.
 for(const run of spec.runs??[]){const summaryFile=run.path+'/summary.json',summary=fs.existsSync(safe(root,summaryFile))?read(safe(root,summaryFile)):null;
  const complete=summary?.executionComplete===true,receiptFile=run.receipt??run.path+'/finalized-references.json';let receipt=null;
  if(fs.existsSync(safe(root,receiptFile)))try{receipt=validateReceipt(root,read(safe(root,receiptFile)));}catch(e){errors.push(e.message);}
  const finished=Date.parse(receipt?.createdAt??summary?.finishedAt??'');runMetadata.push({path:run.path,complete,receipt,receiptFile,finished});
 }
 const ordered=runMetadata.filter(r=>r.complete&&r.receipt).sort((a,b)=>b.finished-a.finished||a.path.localeCompare(b.path)),recent=new Set(ordered.filter((r,i)=>i<policy.latestCompletedRuns||!Number.isFinite(r.finished)||Date.parse(now)-r.finished<policy.recentDays*day).map(r=>r.path));
 for(const run of runMetadata){if(run.receipt)roots.push({path:run.receiptFile,format:'FINALIZED',classification:'PERMANENT_HISTORY',reason:'FINALIZED_REFERENCE_BOUNDARY'});
  if(!run.complete||!run.receipt||recent.has(run.path))roots.push({path:run.path,format:'TREE',classification:!run.complete?'RESUME_CRITICAL':'REFERENCED_EVIDENCE',reason:!run.complete?'ACTIVE_OR_RESUMABLE_NOT_ABANDONED':!run.receipt?'LEGACY_FINGERPRINT_CONTRACT':'RECENT_COMPLETED_RUN'});
 }
 for(const p of coordinationPaths)if(fs.existsSync(safe(root,p)))roots.push({path:p,format:format(p),classification:'RESUME_CRITICAL',reason:'OPERATIONS_COORDINATION'});
 const refs=closure(root,roots);errors.push(...refs.errors);const protectedMap=new Map(refs.entries.map(e=>[e.path,e]));
 const declared=new Map();for(const candidate of spec.candidates??[]){
  if(candidate.schema!=='V2_DISPOSABLE_ARTIFACT_V1'||!['SHORT_TERM_DIAGNOSTIC','REGENERABLE_CACHE'].includes(candidate.classification)||!candidate.producer||!candidate.reason||!Number.isFinite(Date.parse(candidate.createdAt)))throw Error('STORAGE_UNKNOWN_CANDIDATE');
  const owner=runMetadata.find(r=>r.path===candidate.run);if(!owner?.receipt){errors.push('STORAGE_CANDIDATE_UNFINALIZED');continue;}declared.set(candidate.path,candidate);
 }
 const scanned=[...new Set([...spec.scan.flatMap(p=>files(root,p)),...protectedMap.keys()])].sort(),rows=[],hashes=new Map(),duplicates=new Map(),inodes=new Set();let duplicateBytes=0;
 for(const p of scanned){const file=safe(root,p),s=statFile(file),bytes=stableBytes(file),hash=sha(bytes),proof=protectedMap.get(p),candidate=declared.get(p);let classification=proof?.classification??'UNKNOWN_OR_UNSAFE_TO_DELETE',reason=proof?.reasons??['NO_PROVEN_REFERENCE_SCHEMA'],reclaimable=false;
  if(!proof&&candidate){if(hash!==candidate.sha256){errors.push('STORAGE_CANDIDATE_CHANGED:'+p);}else{classification=candidate.classification;const days=classification==='REGENERABLE_CACHE'?policy.cacheDays:candidate.kind==='DIAGNOSTIC_SCREENSHOT'?policy.screenshotDays:policy.diagnosticDays;reclaimable=!recent.has(candidate.run)&&Date.parse(now)-Date.parse(candidate.createdAt)>=days*day;reason=[reclaimable?'EXPLICIT_FINALIZED_UNREFERENCED_ARTIFACT_EXPIRED':'RETENTION_WINDOW',candidate.reason];}}
  const inode=s.identity.split(':').slice(0,2).join(':'),allocated=inodes.has(inode)?0:s.allocatedBytes;inodes.add(inode);
  if(hashes.has(hash)&&hashes.get(hash)!==inode)duplicateBytes+=allocated;else hashes.set(hash,inode);
  if(!duplicates.has(hash))duplicates.set(hash,[]);duplicates.get(hash).push(p);
  rows.push({path:p,sha256:hash,bytes:s.bytes,allocatedBytes:allocated,classification,protected:!reclaimable,reclaimable,reasons:reason,identity:s.identity});
 }
 beforeRecheck();const rescanned=[...new Set([...spec.scan.flatMap(p=>files(root,p)),...protectedMap.keys()])].sort();if(digest(rescanned)!==digest(scanned))errors.push('STORAGE_DIRECTORY_PUBLICATION_RACE');if(digest(initial)!==digest(coordination(root,coordinationPaths)))errors.push('STORAGE_COORDINATION_CHANGED');
 for(const row of rows)if(row.identity!==statFile(safe(root,row.path)).identity)errors.push('STORAGE_PUBLICATION_RACE:'+row.path);
 // Unknown files remain protected and prevent certification of a complete GC graph.
 if(rows.some(r=>r.classification==='UNKNOWN_OR_UNSAFE_TO_DELETE'))errors.push('STORAGE_UNKNOWN_ARTIFACTS_PROTECTED');
 const duplicateCandidates=[...duplicates].filter(([,paths])=>paths.length>1).map(([sha256,paths])=>({sha256,paths}));
 const safeToGc=errors.length===0;if(!safeToGc)for(const row of rows){row.protected=true;row.reclaimable=false;}
 const classes=Object.fromEntries(CLASSES.map(c=>[c,rows.filter(r=>r.classification===c).reduce((n,r)=>n+r.allocatedBytes,0)]));
 return sealed({schema:'V2_GC_DRY_RUN_V1',asOf:now,policy,rootGeneration:digest({roots:refs.rootGeneration,coordination:initial,files:rows.map(r=>[r.path,r.sha256,r.identity]),policy}),safeToGc,errors:[...new Set(errors)].sort(),referencedArtifactsSelectedForDeletion:0,destructive:false,filesScanned:rows.length,filesProtected:rows.filter(r=>r.protected).length,filesReclaimable:rows.filter(r=>r.reclaimable).length,protectedBytes:rows.filter(r=>r.protected).reduce((n,r)=>n+r.allocatedBytes,0),reclaimableBytes:rows.filter(r=>r.reclaimable).reduce((n,r)=>n+r.allocatedBytes,0),duplicateBytes,duplicateCandidates,classes,oldestRetainedFullRun:ordered.filter(r=>recent.has(r.path)).map(r=>r.receipt.createdAt).sort()[0]??null,rows});
}
export function validatePlan(root,spec,plan,options={}){const current=inventory(root,spec,{...options,now:plan.asOf,policy:plan.policy});if(current.rootGeneration!==plan.rootGeneration)throw Error('STORAGE_STALE_GC_PLAN');return current.safeToGc;}
