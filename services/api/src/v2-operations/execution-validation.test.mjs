import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {buildProductionGenesis} from '../research-v2/storage/production-genesis.mjs';
import {registerGenesisOverlay} from '../research-v2/storage/genesis-deployment.mjs';
import {sha} from '../research-v2/storage/core.mjs';
import {lifecycleMain} from '../../../../docs/catalog/global-47/research-v2/run-v15-mature-v2.mjs';
import {Operations} from './control.mjs';import {hash} from './artifacts.mjs';import {verifyExecutionBinding} from './lifecycle.mjs';
const capabilities={direct:false,tavily:false,decodo:false,browser:false,groq:false};
function fixture(t){
 const base=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'execution-validation-'))),root=base+'/source',dest=base+'/export';fs.mkdirSync(root);t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
 const put=(p,v)=>{fs.mkdirSync(path.dirname(root+'/'+p),{recursive:true});fs.writeFileSync(root+'/'+p,JSON.stringify(v));};
 const ids=Array.from({length:188},(_,i)=>'candidate-'+i);put('manifest.json',{expectedServices:188,serviceIds:ids});put('universe.json',{existing:Array.from({length:275},(_,i)=>({slug:'existing-'+i})),new_include:ids.map(slug=>({slug,name:slug,disposition:'NEW_INCLUDE',markets:[]})),research:[]});put('bindings.json',{schemaVersion:1,scope:'SHADOW_RESEARCH_ONLY',bindings:[]});
 const digest=p=>sha(fs.readFileSync(root+'/'+p));put('input.json',{version:1,cohortManifest:'manifest.json',universe:'universe.json',reviewedBindings:'bindings.json',runsRoot:'.savlivo/research-v2/old-runs',frozenHashes:{'manifest.json':digest('manifest.json'),'universe.json':digest('universe.json')}});
 put('.savlivo/protected.json',{evidence:[]});put('services/api/src/research-v2/protected-code.mjs','fixture');const s={version:1,key:'fixture',cohort:ids,parents:[],states:{},sources:{},quarantine:[],historicalRequests:0,parentRequests:0,inputHashes:Object.fromEntries(['manifest.json','universe.json','bindings.json','input.json','.savlivo/protected.json','services/api/src/research-v2/protected-code.mjs'].map(p=>[p,digest(p)]))};put('sealed.json',{...s,snapshotHash:sha(JSON.stringify(s))});
 const built=buildProductionGenesis({root,destination:dest,snapshotPath:'sealed.json',lifecycleInput:'input.json',expected:{cohort:188,baseline:275,reviewed:0,retainedTargets:0,historicalRequests:0,parentRequests:0},excluded:[{path:'unsealed.json',sha256:'a'.repeat(64),reason:'UNSEALED_HISTORICAL_CONTROL_SNAPSHOT_NOT_USED_AS_GENESIS_INPUT'}],createdAt:'2026-09-22T00:00:00Z',creationIdentity:'TEST',versions:{engine:'fixture',policy:'PRODUCTION_GENESIS_V1'}});
 registerGenesisOverlay(dest,built.manifest,built.genesis.genesisHash);fs.mkdirSync(dest+'/services/api/src/research-v2',{recursive:true});
 for(const [name,value] of [['market-expansion-evidence.json',{globalSources:{},services:[]}],['evidence.json',[]],['research-v2/provider-domain-discovery-bindings.json',{bindings:[]}]]){fs.mkdirSync(path.dirname(dest+'/docs/catalog/global-47/'+name),{recursive:true});fs.writeFileSync(dest+'/docs/catalog/global-47/'+name,JSON.stringify(value));}
 return {dest,built,ops:new Operations({repo:dest,root:dest+'/ops',lifecycleInput:built.manifest.productionInput,read:true,control:true,scheduling:false})};
}
for(const mutation of [null,'protected','code','genesis','input'])test('authoritative execution validation '+(mutation??'once after fast admission and restart'),async t=>{
 const f=fixture(t),logs=[];t.mock.method(console,'error',s=>{try{logs.push(JSON.parse(s));}catch{}});t.mock.method(console,'log',()=>{});
 t.mock.method(globalThis,'fetch',()=>{throw Error('NETWORK_FORBIDDEN');});
 const p=f.ops.preflight({objective:'MATURE_LIFECYCLE',scope:'SELECTED_SERVICES',services:['candidate-0'],capabilities},'actor');
 const job=f.ops.start(p.token,'actor',true),manifest=JSON.parse(fs.readFileSync(f.ops.config.root+'/runs/'+job.id+'/manifest.json'));
 assert.equal(manifest.lifecycle.output,null);assert.equal(logs.filter(x=>x.stage==='genesis-validation').length,0);
 const restarted=new Operations(f.ops.config);restarted.prepareQueued(restarted.db(),job);verifyExecutionBinding(f.dest,job,manifest);
 if(mutation==='protected')fs.appendFileSync(f.dest+'/.savlivo/protected.json',' ');
 if(mutation==='code')fs.appendFileSync(f.dest+'/services/api/src/research-v2/protected-code.mjs',' ');
 if(mutation==='genesis')fs.appendFileSync(f.dest+'/'+f.built.manifest.genesis,'tamper');
 if(mutation==='input')fs.appendFileSync(manifest.lifecycle.input,' ');
 let admitted=0,started=0;const old=process.cwd();
 try{process.chdir(f.dest);const execute=async()=>{verifyExecutionBinding(f.dest,job,manifest);return lifecycleMain(['--lifecycle','--input',manifest.lifecycle.input,'--live'],{onValidationStart:()=>started++,beforeExecution:({output})=>{verifyExecutionBinding(f.dest,job,manifest);admitted++;manifest.lifecycle.output=output;}});};if(mutation)await assert.rejects(execute);else {const result=await execute();assert.equal(result.executionComplete,true);assert.equal(fs.existsSync(manifest.lifecycle.output+'/network.jsonl')&&fs.statSync(manifest.lifecycle.output+'/network.jsonl').size>0,false);}}finally{process.chdir(old);}
 assert.equal(admitted,mutation?0:1);assert.equal(started,['input','genesis'].includes(mutation)?0:1);
 if(!mutation){assert.equal(logs.filter(x=>x.stage==='genesis-validation'&&x.status==='FINISHED').length,1);assert.equal(logs.filter(x=>x.stage==='reference-closure').length,1);assert.equal(logs.filter(x=>x.stage==='protected-file-hashes').length,1);assert.equal(logs.filter(x=>x.stage==='continuation-snapshot'&&x.status==='FINISHED').length,1);
 t.diagnostic(JSON.stringify({fastAdmissionMs:logs.filter(x=>x.event==='PREFLIGHT_FAST').map(x=>x.durationMs),fullValidationMs:logs.find(x=>x.stage==='genesis-validation'&&x.status==='FINISHED')?.durationMs,fullValidationCount:1}));
 const prior=process.cwd();try{process.chdir(f.dest);let crossed=false;await assert.rejects(()=>lifecycleMain(['--lifecycle','--input',manifest.lifecycle.input,'--live'],{expectedOutput:manifest.lifecycle.output+'-substituted',beforeExecution:()=>{crossed=true;}}),/LIFECYCLE_CHECKPOINT_CHANGED/);assert.equal(crossed,false);
 const resumed=await lifecycleMain(['--lifecycle','--input',manifest.lifecycle.input,'--live'],{expectedOutput:manifest.lifecycle.output,beforeExecution:()=>verifyExecutionBinding(f.dest,job,manifest)});assert.equal(resumed.additionalRequests,0);assert.equal(resumed.executionComplete,true);
 }finally{process.chdir(prior);}
 assert.equal(logs.filter(x=>x.stage==='genesis-validation'&&x.status==='FINISHED').length,3); // one per attempt, including rejected output and same-output restart
 }
 assert.equal(fs.existsSync(f.ops.config.root+'/runs/'+job.id+'/network.jsonl'),false);
});

test('new admitted generation isolates interrupted history; legacy continuation still blocks',async t=>{
 const f=fixture(t);t.mock.method(console,'log',()=>{});t.mock.method(console,'error',()=>{});t.mock.method(globalThis,'fetch',()=>{throw Error('NETWORK_FORBIDDEN');});
 const dir=f.dest+'/'+f.built.genesis.lifecycle.executionRoot+'/mature-lifecycle-'+ 'a'.repeat(16);fs.mkdirSync(dir,{recursive:true});
 const cohort=f.built.genesis.cohort;
 fs.writeFileSync(dir+'/lineage.json',JSON.stringify({cohort,fingerprint:'a'.repeat(64),executionGeneration:'33333333-3333-3333-3333-333333333333'}));
 fs.writeFileSync(dir+'/network.jsonl',JSON.stringify({service:cohort[0],kind:'DIRECT',at:'2026-01-01T00:00:00Z'})+'\n');
 fs.mkdirSync(dir+'/catalog');fs.writeFileSync(dir+'/catalog/adaptive-state.json',JSON.stringify({turn:99,cursor:7,pending:{unsafe:true},targets:{poison:{service:cohort[0],unproven:true}}}));
 const {spawn}=await import('node:child_process'),script=path.join(os.tmpdir(),'parent-unrelated-'+process.pid+'.mjs');fs.writeFileSync(script,"console.log('ready');setInterval(()=>{},1000);");t.after(()=>fs.rmSync(script,{force:true}));
 const unrelated=spawn(process.execPath,[script],{stdio:['ignore','pipe','pipe']});t.after(()=>unrelated.kill());await new Promise((resolve,reject)=>{unrelated.once('error',reject);unrelated.stdout.once('data',resolve);});process.kill(unrelated.pid,0);
 fs.writeFileSync(dir+'/handoff.lock',String(unrelated.pid));
 const oldFiles=['lineage.json','network.jsonl','catalog/adaptive-state.json','handoff.lock'];const original=oldFiles.map(p=>fs.readFileSync(dir+'/'+p));
 const old=process.cwd();try{process.chdir(f.dest);
 const preflight=f.ops.preflight({objective:'MATURE_LIFECYCLE',scope:'FULL_CATALOG',capabilities},'actor'),first=f.ops.start(preflight.token,'actor',true),manifest=JSON.parse(fs.readFileSync(f.ops.config.root+'/runs/'+first.id+'/manifest.json'));
 assert.equal(f.ops.start(preflight.token,'actor',true).id,first.id);assert.equal(f.ops.db().jobs.filter(j=>j.id===first.id).length,1);
 verifyExecutionBinding(f.dest,first,manifest);
 await assert.rejects(lifecycleMain(['--lifecycle','--input',manifest.lifecycle.input,'--live']),/HANDOFF_PREVIOUS_CONTINUATION_RECONCILIATION_REQUIRED/);
 const control={executionGeneration:manifest.lifecycle.admission.executionGeneration};
 assert.equal(control.executionGeneration,first.id);
 const check=await lifecycleMain(['--lifecycle','--input',manifest.lifecycle.input,'--check'],control);assert.equal(check.requestsConsumed,0);
 const result=await lifecycleMain(['--lifecycle','--input',manifest.lifecycle.input,'--live'],control);assert.equal(result.additionalRequests,0);assert.equal(result.executionComplete,true);
 const lineage=JSON.parse(fs.readFileSync(check.output+'/lineage.json'));assert.equal(lineage.supersededExecutions.length,1);assert.equal(lineage.supersededRequests,1);assert.equal(lineage.supersededExecutions[0].execution,path.basename(dir));
 f.ops.patchJob(first.id,{status:'COMPLETE'});
 const second=f.ops.start(f.ops.preflight({objective:'MATURE_LIFECYCLE',scope:'FULL_CATALOG',capabilities},'actor').token,'actor',true),m2=JSON.parse(fs.readFileSync(f.ops.config.root+'/runs/'+second.id+'/manifest.json'));
 assert.notEqual(second.id,first.id);assert.equal(m2.lifecycle.admission.executionGeneration,second.id);
 const check2=await lifecycleMain(['--lifecycle','--input',m2.lifecycle.input,'--check'],{executionGeneration:m2.lifecycle.admission.executionGeneration});assert.notEqual(check.output,check2.output);
 const tampered=structuredClone(m2);tampered.lifecycle.admission.executionGeneration=first.id;assert.throws(()=>verifyExecutionBinding(f.dest,second,tampered),/EXECUTION_BINDING/);
 for(let i=0;i<oldFiles.length;i++)assert.deepEqual(fs.readFileSync(dir+'/'+oldFiles[i]),original[i]);
 }finally{process.chdir(old);}
});

for(const competing of [false,true])test('explicit Resume reaches validated handoff: '+(competing?'active competitor blocks':'unrelated live PID reclaimed'),async t=>{
 const cp=(await import('node:child_process')).default,{EventEmitter}=await import('node:events'),{syncBuiltinESMExports}=await import('node:module'),{operationsRequest}=await import('./http.mjs');
 const f=fixture(t),script=path.join(os.tmpdir(),'handoff-unrelated-'+process.pid+'.mjs');fs.writeFileSync(script,"console.log('ready');setInterval(()=>{},1000);");t.after(()=>fs.rmSync(script,{force:true}));const unrelated=cp.spawn(process.execPath,[script],{stdio:['ignore','pipe','pipe']});t.after(()=>unrelated.kill());await new Promise((resolve,reject)=>{unrelated.once('error',reject);unrelated.stdout.once('data',resolve);});
 let owner=unrelated;
 if(competing){const entry=path.join(f.dest,'docs/catalog/global-47/research-v2/run-v15-mature-v2.mjs');fs.mkdirSync(path.dirname(entry),{recursive:true});fs.writeFileSync(entry,"console.log('ready');setInterval(()=>{},1000);");owner=cp.spawn(process.execPath,[entry,'--lifecycle','--live'],{stdio:['ignore','pipe','pipe']});t.after(()=>owner.kill());await new Promise((resolve,reject)=>{owner.once('error',reject);owner.stdout.once('data',resolve);});}
 const p=f.ops.preflight({objective:'MATURE_LIFECYCLE',scope:'SELECTED_SERVICES',services:['candidate-0'],capabilities},'actor'),job=f.ops.start(p.token,'actor',true);f.ops.patchJob(job.id,{status:'INTERRUPTED',pid:unrelated.pid,error:'WORKER_PROCESS_EXITED_CHECKPOINT_PRESERVED'});
 const env={V2_OPERATIONS_REPOSITORY_ROOT:f.dest,V2_OPERATIONS_STATE_ROOT:f.ops.config.root,ANALYTICS_V2_OPERATIONS_ENABLED:'true',ANALYTICS_V2_RUN_CONTROL_ENABLED:'true',ANALYTICS_V2_SCHEDULING_ENABLED:'false'},previous=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);t.after(()=>{for(const [k,v]of Object.entries(previous))if(v===undefined)delete process.env[k];else process.env[k]=v;});
 const resume=()=>operationsRequest({method:'POST',url:new URL('https://offline.invalid/v1/admin/v2-operations/jobs/'+job.id+'/resume'),body:{},actor:'actor'},f.ops);assert.equal((await resume()).status,'QUEUED');await assert.rejects(resume(),/RUN_NOT_RESUMABLE/);assert.equal(f.ops.db().events.filter(e=>e.type==='RESUME_REQUESTED').length,1);
 let spawns=0;const child=Object.assign(new EventEmitter(),{pid:process.pid,unref(){},kill(){}});t.mock.method(cp,'spawn',()=>{spawns++;return child;});syncBuiltinESMExports();t.after(()=>{t.mock.restoreAll();syncBuiltinESMExports();});const {tick}=await import('./worker.mjs?handoff-chain='+competing);await tick();assert.equal(spawns,1);assert.equal(f.ops.db().jobs.find(j=>j.id===job.id).status,'RUNNING');await tick();assert.equal(spawns,1);
 const manifest=JSON.parse(fs.readFileSync(f.ops.config.root+'/runs/'+job.id+'/manifest.json')),generation=manifest.lifecycle.admission.executionGeneration,cwd=process.cwd();let validated=0,output;
 t.mock.method(globalThis,'fetch',()=>{throw Error('NETWORK_FORBIDDEN');});
 try{process.chdir(f.dest);const run=lifecycleMain(['--lifecycle','--input',manifest.lifecycle.input,'--live'],{executionGeneration:generation,beforeExecution:({output:dir})=>{verifyExecutionBinding(f.dest,f.ops.db().jobs.find(j=>j.id===job.id),manifest);validated++;output=dir;fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(dir+'/handoff.lock',String(owner.pid));fs.writeFileSync(dir+'/preserved-checkpoint.json','{"turn":7}');fs.writeFileSync(dir+'/network.jsonl','');}});if(competing){await assert.rejects(run,/HANDOFF_ACTIVE/);assert.equal(validated,1);assert.equal(fs.readFileSync(output+'/handoff.lock','utf8'),String(owner.pid));assert.equal(fs.readFileSync(output+'/preserved-checkpoint.json','utf8'),'{"turn":7}');assert.equal(fs.readFileSync(output+'/network.jsonl','utf8'),'');return;}const result=await run;assert.equal(result.executionComplete,true);assert.equal(result.additionalRequests,0);assert.equal(validated,1);assert.equal(fs.readFileSync(output+'/preserved-checkpoint.json','utf8'),'{"turn":7}');assert.equal(fs.readFileSync(output+'/network.jsonl','utf8'),'');assert(!fs.existsSync(output+'/handoff.lock'));assert.equal(JSON.parse(fs.readFileSync(output+'/lineage.json')).executionGeneration,generation);}finally{process.chdir(cwd);}
});
