import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Operations,atomic} from './control.mjs';
import {operationsRequest} from './http.mjs';
import {cleanupEligibleAfter,dismissedCleanupDryRun} from './dismissed-cleanup.mjs';
import {publishReceipt} from '../research-v2/storage/references.mjs';
import {sha} from '../research-v2/storage/core.mjs';

const id='11111111-1111-1111-1111-111111111111',day=86400000;
const at='2026-10-10T12:00:00.000Z';
function fixture(t){const repo=fs.mkdtempSync(path.join(os.tmpdir(),'dismissed-cleanup-')),stateRoot=path.join(repo,'.savlivo','v2-operations');t.after(()=>fs.rmSync(repo,{recursive:true,force:true}));return {repo,stateRoot,run:path.join(stateRoot,'runs',id)};}
function put(file,body){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,body);}
function now(days){return new Date(Date.parse(at)+days*day).toISOString();}
const intent={schema:'V2_DISMISSED_WORKFILES_CLEANUP_V1',requestedAt:at,eligibleAfter:cleanupEligibleAfter(at)};
const job=(overrides={})=>({id,status:'STOPPED',actor:'one',resumableDismissedAt:at,workfilesCleanupIntent:intent,...overrides});
const event={type:'WORKFILES_CLEANUP_REQUESTED',jobId:id,dismissedAt:at,eligibleAfter:intent.eligibleAfter,policyDays:7};
function dry(f,options={}){return dismissedCleanupDryRun({repo:f.repo,stateRoot:f.stateRoot,jobs:[job(options.job)],events:[event],now:options.now??now(8),referenceSpec:options.referenceSpec??null}).rows[0];}

test('new dismiss records a durable seven-day intent; old dismiss stays unapproved',async t=>{
 const f=fixture(t),ops=new Operations({repo:f.repo,root:f.stateRoot,read:true,control:true}),old='22222222-2222-2222-2222-222222222222';
 ops.transaction(db=>db.jobs.push({id,status:'STOPPED',actor:'one'}, {id:old,status:'STOPPED',actor:'one',resumableDismissedAt:at}));
 put(path.join(f.run,'evidence.txt'),'original');put(path.join(f.stateRoot,'runs',old,'evidence.txt'),'old');
 const removed=ops.dismissResumable(id,'one'),again=ops.dismissResumable(id,'one');
 assert.equal(removed.cleanupEligibleAfter,cleanupEligibleAfter(removed.resumableDismissedAt));assert.deepEqual(again,removed);
 assert.equal(ops.db().events.filter(row=>row.type==='WORKFILES_CLEANUP_REQUESTED'&&row.jobId===id).length,1);
 assert.equal(ops.db().jobs.find(row=>row.id===old).workfilesCleanupIntent,undefined);
 assert.equal(ops.dismissResumable(old,'one').cleanupEligibleAfter,null,'repeated old dismissal does not create retroactive permission');
 const saved=fs.readFileSync(path.join(f.run,'evidence.txt')),at6=new Date(Date.parse(removed.resumableDismissedAt)+6*day).toISOString(),at7=removed.cleanupEligibleAfter,at8=new Date(Date.parse(at7)+day).toISOString();
 assert.equal(ops.cleanupDryRun('one',{now:at6}).rows.find(row=>row.jobId===id).status,'WAITING');
 for(const when of [at7,at8]){const row=ops.cleanupDryRun('one',{now:when}).rows.find(row=>row.jobId===id);assert.equal(row.status,'BLOCKED');assert(row.blockers.includes('REFERENCE_PROOF_UNAVAILABLE'));}
 const older=ops.cleanupDryRun('one',{now:at8}).rows.find(row=>row.jobId===old);assert.equal(older.status,'BLOCKED');assert(older.blockers.includes('NO_EXPLICIT_CLEANUP_INTENT'));
 const endpoint=await operationsRequest({method:'GET',url:new URL('http://local/v1/admin/v2-operations/storage/dismissed-cleanup'),actor:'one'},ops);assert.equal(endpoint.destructive,false);assert.equal(endpoint.total,2);assert.deepEqual(fs.readFileSync(path.join(f.run,'evidence.txt')),saved);
 await assert.rejects(operationsRequest({method:'GET',url:new URL('http://local/v1/admin/v2-operations/storage/dismissed-cleanup'),actor:null},ops),/UNAUTHORIZED/);
});

test('active, queued, locked and resumable states block cleanup',t=>{
 const f=fixture(t);put(path.join(f.run,'evidence.txt'),'body');
 for(const status of ['RUNNING','QUEUED']){const row=dry(f,{job:{status}});assert.equal(row.status,'BLOCKED');assert(row.blockers.includes('JOB_ACTIVE_OR_QUEUED'));}
 put(path.join(f.run,'runner.lock'),'123');let row=dry(f);assert.equal(row.status,'BLOCKED');assert(row.blockers.some(reason=>reason.startsWith('JOB_LOCK_PRESENT:')));
 fs.rmSync(path.join(f.run,'runner.lock'));put(path.join(f.stateRoot,'execution.lock'),'123');row=dry(f);assert(row.blockers.includes('OPERATIONS_LOCK_PRESENT'));
});

test('bounded inode accounting counts local hardlinks once and excludes links outside the job',t=>{
 const f=fixture(t),local=path.join(f.run,'local.txt'),copy=path.join(f.run,'local-copy.txt'),shared=path.join(f.run,'shared.txt'),outside=path.join(f.repo,'permanent','shared.txt');
 put(local,'l'.repeat(8192));fs.linkSync(local,copy);put(shared,'s'.repeat(8192));fs.mkdirSync(path.dirname(outside),{recursive:true});fs.linkSync(shared,outside);
 const row=dry(f),allocated=fs.statSync(local).blocks*512;
 assert.equal(row.status,'BLOCKED');assert.equal(row.filesScanned,3);assert.equal(row.uniqueInodes,2);assert.equal(row.sharedOutsideFiles,1);assert.equal(row.exclusiveAllocatedBytes,allocated);assert.equal(row.potentialAllocatedBytes,0);
 assert.deepEqual(dry(f),row,'repeated checks do not change state');
});

test('only a fully certified expired disposable file becomes eligible; broken references fail closed',t=>{
 const f=fixture(t),base='.savlivo/v2-operations/runs',runs=[];
 for(let i=0;i<5;i++){
  const name=i===0?id:`22222222-2222-2222-2222-${String(i).padStart(12,'0')}`,relative=`${base}/${name}`,directory=path.join(f.repo,relative);
  put(path.join(directory,'summary.json'),JSON.stringify({executionComplete:true,finishedAt:i===0?'2026-01-01T00:00:00Z':'2026-10-19T00:00:00Z'}));put(path.join(directory,'proof.txt'),'proof-'+i);
  const receipt=`.savlivo/research-v2/storage/finalized/${name}.json`;
  publishReceipt(f.repo,{destination:receipt,roots:[{path:relative+'/summary.json',format:'JSON',classification:'PERMANENT_HISTORY'},{path:relative+'/proof.txt',format:'BYTES',classification:'REFERENCED_EVIDENCE'}],runId:relative,versions:{engine:'fixture',policy:'fixture',schema:1},cohort:['service'],baseline:[],capabilities:{},createdAt:i===0?'2026-01-01T00:00:00Z':'2026-10-19T00:00:00Z'});
  runs.push({path:relative,receipt});
 }
 const diagnostic=`${base}/${id}/debug.log`;put(path.join(f.repo,diagnostic),'temporary');
 const referenceSpec={schema:'V2_STORAGE_ROOTS_V1',roots:[],scan:[],runs,candidates:[{schema:'V2_DISPOSABLE_ARTIFACT_V1',path:diagnostic,sha256:sha('temporary'),classification:'SHORT_TERM_DIAGNOSTIC',producer:'fixture',reason:'diagnostic',createdAt:'2026-01-01T00:00:00Z',run:runs[0].path}]};
 const row=dry(f,{referenceSpec});assert.equal(row.status,'ELIGIBLE',JSON.stringify(row.blockers));assert.equal(row.certifiedFiles,1);assert.equal(row.potentialAllocatedBytes,fs.statSync(path.join(f.repo,diagnostic)).blocks*512);assert.equal(row.destructive,undefined);
 assert.deepEqual(dry(f,{referenceSpec}),row);
 put(path.join(f.run,'proof.txt'),'changed');const broken=dry(f,{referenceSpec});assert.equal(broken.status,'BLOCKED');assert.equal(broken.certifiedFiles,0);assert(broken.blockers.some(reason=>reason.includes('HASH')||reason.includes('REFERENCE')));
});
