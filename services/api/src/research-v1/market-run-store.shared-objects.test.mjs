import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';
import {encodeCheckpointPayload} from './checkpoint-objects.mjs';
import {openMarketRunStore,readMarketRunRecords} from './market-run-store.mjs';

const payload={text:'monthly plan evidence '.repeat(55_000)};
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'shared-checkpoint-test-'));
 const savlivo=path.join(root,'.savlivo');fs.mkdirSync(savlivo,{mode:0o700});
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 return {root,savlivo,run:name=>path.join(savlivo,name,'journal')};
}
function objectProof(){
 const objects=[];encodeCheckpointPayload(payload,(hash,raw)=>objects.push({hash,raw}));
 assert.equal(objects.length,1);return objects[0];
}
function append(directory){
 const store=openMarketRunStore(directory,{checkpointObjects:true});
 try{store.append('TASK_CHECKPOINT',payload);}finally{store.close();}
 return path.join(directory,'.objects',objectProof().hash+'.json');
}
function sharedPath(root,hash){return path.join(root,'research-v1','shared-checkpoint-objects','sha256',hash.slice(0,2),hash+'.json');}

test('independent jobs hardlink identical complete read-only checkpoint bytes and reload after restart',t=>{
 const f=fixture(t),a=f.run('job-a'),b=f.run('job-b'),first=append(a),second=append(b),shared=sharedPath(f.savlivo,objectProof().hash);
 const stats=[first,second,shared].map(file=>fs.statSync(file));
 assert.equal(new Set(stats.map(s=>s.dev+':'+s.ino)).size,1);
 assert(stats.every(s=>(s.mode&0o222)===0));
 assert.deepEqual(readMarketRunRecords(a)[0].payload,payload);
 const replay=`import {readMarketRunRecords} from ${JSON.stringify(new URL('./market-run-store.mjs',import.meta.url).href)};for(const dir of process.argv.slice(1))if(readMarketRunRecords(dir)[0].payload.text.length!==${payload.text.length})process.exit(1);`;
 const restarted=spawnSync(process.execPath,['--input-type=module','-e',replay,a,b],{encoding:'utf8'});
 assert.equal(restarted.status,0,restarted.stderr);
 const separateBytes=stats[0].blocks*512+stats[1].blocks*512;
 const unique=new Map(stats.map(s=>[s.dev+':'+s.ino,s.blocks*512]));
 const physicalBytes=[...unique.values()].reduce((sum,n)=>sum+n,0);
 assert.equal(separateBytes-physicalBytes,stats[0].blocks*512);
 assert(physicalBytes<separateBytes);
 t.diagnostic(`checkpoint object physical bytes: separate=${separateBytes}, shared=${physicalBytes}, saved=${separateBytes-physicalBytes}`);
});

test('same hash with conflicting shared bytes fails closed without changing the journal',t=>{
 const f=fixture(t),{hash}=objectProof(),shared=sharedPath(f.savlivo,hash),run=f.run('collision');
 fs.mkdirSync(path.dirname(shared),{recursive:true,mode:0o700});fs.writeFileSync(shared,'incorrect bytes\n',{mode:0o400});
 const store=openMarketRunStore(run,{checkpointObjects:true});
 try{assert.throws(()=>store.append('TASK_CHECKPOINT',payload),/Shared checkpoint object collision/);}finally{store.close();}
 assert.equal(readMarketRunRecords(run).length,0);
 assert.equal(fs.readFileSync(shared,'utf8'),'incorrect bytes\n');
});

test('a writable shared candidate uses the original job-local publication',t=>{
 const f=fixture(t),{hash,raw}=objectProof(),shared=sharedPath(f.savlivo,hash),run=f.run('fallback');
 fs.mkdirSync(path.dirname(shared),{recursive:true,mode:0o700});fs.writeFileSync(shared,raw+'\n',{mode:0o600});
 const local=append(run),sharedStat=fs.statSync(shared),localStat=fs.statSync(local);
 assert.notEqual(localStat.ino,sharedStat.ino);
 assert(localStat.mode&0o200);
 assert.deepEqual(readMarketRunRecords(run)[0].payload,payload);
});

test('outside .savlivo retains the existing job-local checkpoint path',t=>{
 const f=fixture(t),run=path.join(f.root,'ordinary-run','journal'),local=append(run);
 assert.equal(fs.statSync(local).mode&0o200,0o200);
 assert.deepEqual(readMarketRunRecords(run)[0].payload,payload);
 assert.equal(fs.existsSync(path.join(f.savlivo,'research-v1')),false);
});
