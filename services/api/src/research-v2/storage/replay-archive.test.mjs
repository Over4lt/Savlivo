import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createReplayArchive,restoreReplayArchive,archiveDryRun} from './replay-archive.mjs';
import {publishReceipt} from './references.mjs';
import {sha} from './core.mjs';

function fixture(t){
 const outer=fs.mkdtempSync(path.join(os.tmpdir(),'replay-archive-')),root=outer+'/root',run='runs/mature-lifecycle-pilot',archive=outer+'/pilot.gz';fs.mkdirSync(root);t.after(()=>fs.rmSync(outer,{recursive:true,force:true}));
 const put=(name,bytes)=>{const p=root+'/'+run+'/'+name;fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,bytes);};
 put('summary.json',JSON.stringify({executionComplete:true,researchComplete:true,productionPromoted:false}));
 put('evidence/bodies/source.body',Buffer.from('provider source '.repeat(20000)));
 put('evidence/journal/record.json',JSON.stringify({version:1,sourceHash:sha('provider source '.repeat(20000))}));
 fs.mkdirSync(root+'/'+run+'/empty');fs.linkSync(root+'/'+run+'/evidence/bodies/source.body',root+'/'+run+'/evidence/bodies/source-copy.body');
 const receipt='receipt.json';publishReceipt(root,{destination:receipt,roots:[{path:run,format:'TREE',classification:'REFERENCED_EVIDENCE'}],runId:run,versions:{engine:'fixture',policy:'archive-pilot',schema:1},cohort:['service'],baseline:[],createdAt:'2026-10-20'});
 return {outer,root,run,archive,receipt,options:{root,run,archivePath:archive,receiptPath:receipt}};
}
function inventory(root){const rows=[];function walk(p,relative=''){for(const name of fs.readdirSync(p).sort()){const r=relative?relative+'/'+name:name,f=path.join(p,name),s=fs.lstatSync(f);if(s.isDirectory())walk(f,r);else rows.push({path:r,bytes:s.size,sha256:sha(fs.readFileSync(f))});}}walk(root);return rows;}

test('lossless compressed archive restores every path, byte count, hash and internal hardlink',async t=>{
 const f=fixture(t),plan=archiveDryRun(f.options);assert.equal(plan.status,'ARCHIVABLE',JSON.stringify(plan.reasons));assert.equal(plan.cleanupEligible,false);
 const before=inventory(f.root+'/'+f.run),sourceBody=fs.readFileSync(f.root+'/'+f.run+'/evidence/bodies/source.body');
 const result=await createReplayArchive(f.options);assert(result.archivePhysicalBytes<result.sourcePhysicalBytes);assert(result.hypotheticalNetPhysicalSavingBytes>0);assert.equal(result.reclaimableNowBytes,0);
 t.diagnostic(JSON.stringify({sourcePhysicalBytes:result.sourcePhysicalBytes,archivePhysicalBytes:result.archivePhysicalBytes,hypotheticalNetPhysicalSavingBytes:result.hypotheticalNetPhysicalSavingBytes,reclaimableNowBytes:result.reclaimableNowBytes}));
 const destination=f.outer+'/restored',restored=await restoreReplayArchive({archivePath:f.archive,destination});assert(restored.restored);assert.deepEqual(inventory(destination),before);assert.deepEqual(fs.readFileSync(f.root+'/'+f.run+'/evidence/bodies/source.body'),sourceBody);
 assert(fs.statSync(destination+'/empty').isDirectory());
 assert.equal(fs.statSync(destination+'/evidence/bodies/source.body').ino,fs.statSync(destination+'/evidence/bodies/source-copy.body').ino);
 assert.equal(fs.statSync(f.root+'/'+f.run+'/evidence/bodies/source.body').ino,fs.statSync(f.root+'/'+f.run+'/evidence/bodies/source-copy.body').ino);
});

test('missing closure, active execution, external hardlink and insufficient space block archival copy',t=>{
 const f=fixture(t);assert.equal(archiveDryRun({...f.options,receiptPath:'missing.json'}).status,'BLOCKED');
 const summary=f.root+'/'+f.run+'/summary.json',original=fs.readFileSync(summary);fs.writeFileSync(summary,JSON.stringify({executionComplete:false,researchComplete:false}));assert.equal(archiveDryRun(f.options).status,'BLOCKED');fs.writeFileSync(summary,original);
 fs.mkdirSync(f.root+'/'+f.run+'/pricing');fs.writeFileSync(f.root+'/'+f.run+'/pricing/adaptive.lock','123');assert.deepEqual(archiveDryRun(f.options).reasons,['ARCHIVE_LOCK_PRESENT_OR_TERMINAL_UNPROVEN']);fs.unlinkSync(f.root+'/'+f.run+'/pricing/adaptive.lock');fs.rmdirSync(f.root+'/'+f.run+'/pricing');
 fs.linkSync(f.root+'/'+f.run+'/evidence/bodies/source.body',f.outer+'/external-link');assert.equal(archiveDryRun(f.options).status,'UNKNOWN');fs.unlinkSync(f.outer+'/external-link');
 assert.equal(archiveDryRun({...f.options,reserveBytes:Number.MAX_SAFE_INTEGER}).status,'BLOCKED');
});

test('corrupt and interrupted archives never publish a restored destination',async t=>{
 const f=fixture(t);await createReplayArchive(f.options);
 const bytes=fs.readFileSync(f.archive),corrupt=f.outer+'/corrupt.gz',truncated=f.outer+'/truncated.gz';fs.writeFileSync(corrupt,Buffer.from(bytes));const fd=fs.openSync(corrupt,'r+');const marker=Buffer.from([bytes[Math.floor(bytes.length/2)]^255]);fs.writeSync(fd,marker,0,1,Math.floor(bytes.length/2));fs.closeSync(fd);fs.writeFileSync(truncated,bytes.subarray(0,Math.floor(bytes.length/2)));
 for(const [source,destination]of [[corrupt,f.outer+'/corrupt-restore'],[truncated,f.outer+'/interrupted-restore']]){await assert.rejects(()=>restoreReplayArchive({archivePath:source,destination}));assert.equal(fs.existsSync(destination),false);}
 assert(fs.existsSync(f.root+'/'+f.run+'/evidence/bodies/source.body'));
});

test('source changes invalidate the receipt and archive remains unpublished',async t=>{const f=fixture(t);fs.appendFileSync(f.root+'/'+f.run+'/evidence/journal/record.json','changed');assert.notEqual(archiveDryRun(f.options).status,'ARCHIVABLE');await assert.rejects(()=>createReplayArchive(f.options));assert.equal(fs.existsSync(f.archive),false);});
