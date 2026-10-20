// Read-only, bounded assessment. No deletion contract is exposed here.
import fs from 'node:fs';
import path from 'node:path';
import {scanEntries} from '../research-v2/storage/stream-scan.mjs';
import {inventory} from '../research-v2/storage/inventory.mjs';
import {relative,safe,statFile} from '../research-v2/storage/core.mjs';
import {resumeAllowed} from './resume-policy.mjs';
import {executionWorkerActive} from './worker-identity.mjs';

const week=7*86400000;
export function cleanupEligibleAfter(dismissedAt){const time=Date.parse(dismissedAt);if(!Number.isFinite(time))throw Error('INVALID_DISMISSAL_TIME');return new Date(time+week).toISOString();}
const limits={maxEntries:20000,maxDirectoryEntries:10000,maxDepth:64,maxDurationMs:10000,progressEvery:10000,maxAliases:128,maxDiagnostics:32};
const unique=values=>[...new Set(values)].sort();
function inspectJob(repo,run){
 const files=[],blockers=[];
 try{
  for(const entry of scanEntries(repo,[run],{limits})){
   if(entry.kind==='alias'){blockers.push('SYMLINK_OR_ALIAS:'+entry.path);continue;}
   if(entry.kind==='file'){
    files.push(entry);
    if(entry.path.endsWith('.lock')||entry.path.endsWith('/.owner.json')||entry.path.endsWith('/.ownership-gate'))blockers.push('JOB_LOCK_PRESENT:'+entry.path);
   }
  }
  for(const entry of files)if(statFile(safe(repo,entry.path)).identity!==entry.identity)blockers.push('FILE_CHANGED_DURING_SCAN:'+entry.path);
 }catch(error){blockers.push(error.message?.startsWith('STORAGE_')?error.message:'JOB_SCAN_FAILED');}
 const inodes=new Map();for(const file of files){const key=file.identity.split(':').slice(0,2).join(':');const value=inodes.get(key)??{links:0,hardlinks:file.hardlinks,allocatedBytes:file.allocatedBytes};value.links++;inodes.set(key,value);}
 return {files,blockers,uniqueInodes:inodes.size,exclusiveAllocatedBytes:[...inodes.values()].reduce((n,inode)=>n+(inode.links===inode.hardlinks?inode.allocatedBytes:0),0),sharedOutsideFiles:[...inodes.values()].filter(inode=>inode.links<inode.hardlinks).length};
}
export function dismissedCleanupDryRun({repo,stateRoot,jobs,events=[],now=new Date().toISOString(),offset=0,limit=20,referenceSpec=null}){
 if(!Number.isFinite(Date.parse(now))||!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>20)throw Error('INVALID_CLEANUP_DRY_RUN');
 const selected=jobs.filter(job=>job.resumableDismissedAt).sort((a,b)=>String(a.resumableDismissedAt).localeCompare(String(b.resumableDismissedAt))||a.id.localeCompare(b.id));
 const rows=selected.slice(offset,offset+limit).map(job=>{
  const blockers=[],dismissedAt=job.resumableDismissedAt;let eligibleAfter=null;
  try{eligibleAfter=cleanupEligibleAfter(dismissedAt);}catch{blockers.push('INVALID_DISMISSAL_TIME');}
  const intent=job.workfilesCleanupIntent;
  if(intent?.schema!=='V2_DISMISSED_WORKFILES_CLEANUP_V1'||intent.requestedAt!==dismissedAt||intent.eligibleAfter!==eligibleAfter)blockers.push('NO_EXPLICIT_CLEANUP_INTENT');
  if(!events.some(event=>event.type==='WORKFILES_CLEANUP_REQUESTED'&&event.jobId===job.id&&event.dismissedAt===dismissedAt&&event.eligibleAfter===eligibleAfter&&event.policyDays===7))blockers.push('CLEANUP_AUDIT_MISSING');
  if(['QUEUED','RUNNING'].includes(job.status)||executionWorkerActive(repo,job))blockers.push('JOB_ACTIVE_OR_QUEUED');
  if(resumeAllowed(job,events))blockers.push('JOB_RESUMABLE');
  if(['execution.lock','control.lock'].some(name=>fs.existsSync(path.join(stateRoot,name))))blockers.push('OPERATIONS_LOCK_PRESENT');
  let run=null,scan={files:[],blockers:[],uniqueInodes:0,exclusiveAllocatedBytes:0,sharedOutsideFiles:0};
  if(!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(job.id))blockers.push('INVALID_JOB_ID');
  else try{run=relative(repo,path.join(stateRoot,'runs',job.id));if(!fs.existsSync(safe(repo,run)))blockers.push('RUN_DIRECTORY_MISSING');else scan=inspectJob(repo,run);}catch{blockers.push('RUN_DIRECTORY_OUTSIDE_REPOSITORY');}
  blockers.push(...scan.blockers);
  const waiting=eligibleAfter!==null&&Date.parse(now)<Date.parse(eligibleAfter);
  let certifiedFiles=0,certifiedAllocatedBytes=0;
  if(!waiting&&!blockers.length){
   if(!referenceSpec)blockers.push('REFERENCE_PROOF_UNAVAILABLE');
   else if(scan.files.reduce((sum,file)=>sum+file.bytes,0)>64*1024*1024)blockers.push('REFERENCE_RECHECK_SIZE_LIMIT');
   else try{
    // The existing GC contract alone may certify disposable files. Protected
    // evidence remains in place even when one diagnostic is eligible.
    const plan=inventory(repo,{...referenceSpec,scan:[run]},{now,maxReferenceFiles:20000,maxReferenceBytes:64*1024*1024});
    const owned=plan.rows.filter(row=>row.path.startsWith(run+'/')),eligible=owned.filter(row=>row.reclaimable);
    if(!plan.safeToGc)blockers.push(...plan.errors);
    if(owned.length!==scan.files.length)blockers.push('JOB_REFERENCE_INVENTORY_INCOMPLETE');
    const scanned=new Map(scan.files.map(file=>[file.path,file.identity]));if(owned.some(row=>scanned.get(row.path)!==row.identity))blockers.push('JOB_CHANGED_DURING_DRY_RUN');
    if(!eligible.length)blockers.push('NO_CERTIFIED_DISPOSABLE_FILES');
    const byInode=new Map();for(const row of eligible){const key=row.identity.split(':').slice(0,2).join(':');byInode.set(key,(byInode.get(key)??0)+1);}
    certifiedFiles=eligible.length;
    certifiedAllocatedBytes=scan.files.reduce((sum,file)=>{const key=file.identity.split(':').slice(0,2).join(':');if(byInode.get(key)!==file.hardlinks)return sum;byInode.delete(key);return sum+file.allocatedBytes;},0);
   }catch(error){blockers.push(error.message?.startsWith('STORAGE_')?error.message:'REFERENCE_PROOF_FAILED');}
  }
  if(blockers.length){certifiedFiles=0;certifiedAllocatedBytes=0;}
  return {jobId:job.id,dismissedAt,eligibleAfter,status:blockers.length?'BLOCKED':waiting?'WAITING':'ELIGIBLE',filesScanned:scan.files.length,uniqueInodes:scan.uniqueInodes,exclusiveAllocatedBytes:scan.exclusiveAllocatedBytes,potentialAllocatedBytes:certifiedAllocatedBytes,certifiedFiles,sharedOutsideFiles:scan.sharedOutsideFiles,blockers:unique(blockers)};
 });
 return {schema:'V2_DISMISSED_CLEANUP_DRY_RUN_V1',asOf:now,total:selected.length,offset,limit,rows,destructive:false};
}
