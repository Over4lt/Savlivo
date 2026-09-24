import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {normalizeRun,normalizeLifecycleRun,publicRun,lifecycleServiceView,discover,hash} from './artifacts.mjs';
import {lifecyclePlan,verifyExecutionBinding} from './lifecycle.mjs';
const fixture=()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lifecycle-view-'));const put=(f,v)=>{fs.mkdirSync(path.dirname(path.join(dir,f)),{recursive:true});fs.writeFileSync(path.join(dir,f),JSON.stringify(v));};return {dir,put};};
test('mature lifecycle reports execution separately from unresolved research',()=>{const {dir,put}=fixture();put('lineage.json',{lifecycle:{key:'abc'},cohort:['one'],additionalRequestCeiling:36,historicalRequests:3838,parentRequests:721});put('summary.json',{executionComplete:true,researchComplete:false,baselineExcluded:275});put('final-dispositions.json',{services:[{service_id:'one',finalStatus:'UNRESOLVED'}]});fs.writeFileSync(path.join(dir,'network.jsonl'),[{service:'one',kind:'DISCOVERY'},{service:'one',kind:'DECODO'},{service:'one',kind:'ROBOTS'}].map(JSON.stringify).join('\n'));const r=normalizeLifecycleRun(dir,dir);assert.equal(r.status,'COMPLETE');assert.equal(r.lifecycle.researchComplete,false);assert.equal(r.lifecycle.unresolved,1);assert.equal(r.requests,3);assert.equal(r.lifecycle.requestsRemaining,33);assert.equal(r.routes.DECODO,1);assert.equal(r.lifecycle.historicalRequests,3838);assert.equal(publicRun(r)._lifecycleRows,undefined);});
test('quarantine is counted but invalid prices are not exposed as catalog prices',()=>{const s=lifecycleServiceView({service_id:'one',finalStatus:'PARTIAL',pricing:[{market:'US',status:'UNRESOLVED',quarantine:[{amount:999}]}],humanReview:['OWNERSHIP_REVIEW']});assert.equal(s.pricing[0].quarantined,1);assert.equal(JSON.stringify(s).includes('999'),false);assert.equal(s.priceEvidence,undefined);assert.equal(s.userPriceAuthoritative,true);});
test('unknown lifecycle scope fails closed before spawning',()=>{assert.throws(()=>lifecyclePlan({}, {objective:'MATURE_LIFECYCLE',scope:'ALL_DATABASE'}),/FROZEN_COHORT/);});
test('missing configured lifecycle is not replaced by baseline research',()=>{assert.throws(()=>lifecyclePlan({}, {objective:'MATURE_LIFECYCLE',scope:'FULL_CATALOG'}),/NOT_CONFIGURED/);});
test('lineage-only live runs are discoverable before final report exists',()=>{const {dir,put}=fixture();put('.savlivo/research-v2/universe-expansion/runs/current/lineage.json',{lifecycle:{}});assert.equal(discover(dir,path.join(dir,'ops')).length,1);});
test('selection cannot include a baseline service, before any CLI/transport call',()=>{const {dir,put}=fixture();put('input.json',{cohortManifest:'manifest.json'});put('manifest.json',{serviceIds:['new-service']});assert.throws(()=>lifecyclePlan({repo:dir,lifecycleInput:'input.json'},{objective:'MATURE_LIFECYCLE',scope:'SELECTED_SERVICES',services:['baseline-service']}),/INVALID_LIFECYCLE_SELECTION/);});
test('explicit selected scope validates duplicate IDs before any CLI/transport call',()=>{const {dir,put}=fixture();put('input.json',{cohortManifest:'manifest.json'});put('manifest.json',{serviceIds:['new-service']});assert.throws(()=>lifecyclePlan({repo:dir,lifecycleInput:'input.json'},{objective:'MATURE_LIFECYCLE',scope:'SELECTED_SERVICES',services:['new-service','new-service']}),/INVALID_LIFECYCLE_SELECTION/);});
test('control-plane import does not install the offline interpreter global transport guard',async()=>{const child=await import('node:child_process');const https=await import('node:https');const spawn=child.spawnSync,request=https.request;await import('./control.mjs');assert.equal(child.spawnSync,spawn);assert.equal(https.request,request);const r=child.spawnSync(process.execPath,['--version'],{encoding:'utf8'});assert.equal(r.status,0);});

import {Operations} from './control.mjs';
import {operationsRequest} from './http.mjs';
function pickerFixture(t){const {dir,put}=fixture();t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const ids=Array.from({length:188},(_,i)=>'candidate-'+i);put('manifest.json',{serviceIds:ids,expectedServices:188});put('universe.json',{existing:[{service:'netflix',name:'Netflix',loginManageStatus:'ESTABLISHED'},...Array.from({length:274},(_,i)=>({service:'baseline-'+i,name:'Baseline '+i}))],new_include:ids.slice(0,173).map(slug=>({slug,name:slug,markets:[],disposition:'NEW_INCLUDE'})),research:ids.slice(173).map(slug=>({slug,name:slug,markets:[],disposition:'NEW_INCLUDE'})),exclude:[{slug:'excluded',name:'Excluded'}]});put('bindings.json',{schemaVersion:1,scope:'SHADOW_RESEARCH_ONLY',bindings:[]});put('input.json',{version:1,cohortManifest:'manifest.json',universe:'universe.json',reviewedBindings:'bindings.json',runsRoot:'.savlivo/research-v2/test-runs',frozenHashes:Object.fromEntries(['manifest.json','universe.json'].map(f=>[f,hash(fs.readFileSync(path.join(dir,f),'utf8'))]))});const ops=new Operations({repo:dir,root:path.join(dir,'ops'),lifecycleInput:'input.json',read:true,control:true,scheduling:true});return {ops,dir,ids};}
test('Find services exposes full legitimate universe while only frozen 188 are selectable',async t=>{const {ops,dir,ids}=pickerFixture(t),before=fs.readFileSync(path.join(dir,'manifest.json'));const data=await operationsRequest({method:'GET',url:new URL('http://local/v1/admin/v2-operations/services?q=Netflix'),actor:'test'},ops);assert.equal(data.total,1);assert.deepEqual({...data.rows[0],evidence:undefined},{service:'netflix',state:'ESTABLISHED',name:'Netflix',section:'existing',visible:true,eligible:false,selectable:false,eligibilityReason:'Outside the current frozen research cohort / manifest; visible for reference only.',evidence:undefined});const all=ops.services({limit:1000});assert.equal(all.total,463);assert.deepEqual(all.rows.filter(r=>r.eligible).map(r=>r.service),ids);assert(all.rows.filter(r=>r.eligible).every(r=>r.visible&&r.selectable));assert.equal(ops.services({unresolvedOnly:true,limit:1000}).total,188);assert.deepEqual(fs.readFileSync(path.join(dir,'manifest.json')),before);});
test('control/API rejects visible baseline injection before preflight or schedule persistence',async t=>{const {ops,dir}=pickerFixture(t);const config={objective:'MATURE_LIFECYCLE',scope:'SELECTED_SERVICES',services:['netflix']};await assert.rejects(completedRequest({method:'POST',url:new URL('http://local/v1/admin/v2-operations/preflight'),body:config,actor:'test'},ops),/INVALID_LIFECYCLE_SELECTION/);assert.throws(()=>ops.configInput(config),/INVALID_LIFECYCLE_SELECTION/);assert.equal(ops.db().jobs.length,0);assert.equal(ops.db().preflights.length,0);assert.deepEqual(ops.configInput({...config,services:['candidate-0']}).services,['candidate-0']);for(const scope of ['FULL_CATALOG','UNRESOLVED_ONLY']){assert.deepEqual(ops.configInput({...config,scope,services:[]}).services,[]);assert.throws(()=>ops.configInput({...config,scope}),/INVALID_LIFECYCLE_SCOPE/);}});

test('fast plans bind cohort order without spawning native validation',t=>{
 const {ops,ids}=pickerFixture(t);
 for(const scope of ['FULL_CATALOG','UNRESOLVED_ONLY']){const p=lifecyclePlan(ops.config,{objective:'MATURE_LIFECYCLE',scope,services:[]});assert.equal(p.servicesConsidered,188);assert.deepEqual(p.manifest.lifecycle.admission.services,ids);assert.equal(p.preflight.validation,'DEFERRED_TO_EXECUTION');assert.equal(p.manifest.lifecycle.output,null);}
 const p=lifecyclePlan(ops.config,{objective:'MATURE_LIFECYCLE',scope:'SELECTED_SERVICES',services:[ids[2],ids[0]]});assert.deepEqual(p.manifest.lifecycle.admission.services,[ids[0],ids[2]]);assert.equal(ops.db().jobs.length,0);
});
test('fast admission validates exact immutable input, capability, budget and Human Review bindings',t=>{
 const {ops,dir}=pickerFixture(t);const capabilities={direct:true,tavily:false,decodo:false,browser:false,groq:false};
 const p=lifecyclePlan(ops.config,{objective:'MATURE_LIFECYCLE',scope:'SELECTED_SERVICES',services:['candidate-0'],capabilities});
 const job={config:p.config,admissionHash:hash(p.manifest.lifecycle.admission)};
 verifyExecutionBinding(dir,job,p.manifest);
 for(const change of [m=>m.capabilities.direct=false,m=>m.limits.totalRequests++,m=>m.lifecycle.inputHash='bad',m=>m.lifecycle.admission.version=2,m=>m.humanLeadSnapshot.sha256='bad']){const m=structuredClone(p.manifest);change(m);assert.throws(()=>verifyExecutionBinding(dir,job,m));}
 for(const change of [j=>j.config.capabilities.direct=false,j=>j.config.services=['candidate-1'],j=>j.admissionHash='bad']){const j=structuredClone(job);change(j);assert.throws(()=>verifyExecutionBinding(dir,j,p.manifest));}
 fs.appendFileSync(path.join(dir,'universe.json'),' ');assert.throws(()=>verifyExecutionBinding(dir,job,p.manifest),/EXECUTION_INPUT_CHANGED/);
});
test('Preflight persists reviewable intent only and starts no execution',t=>{
 const {ops}=pickerFixture(t);const p=ops.preflight({objective:'MATURE_LIFECYCLE',scope:'SELECTED_SERVICES',services:['candidate-0'],capabilities:{direct:true,tavily:false,decodo:false,browser:false,groq:false}},'admin');assert(p.token);assert.equal(p.preflight.validation,'DEFERRED_TO_EXECUTION');assert.equal(ops.db().jobs.length,0);
});

async function completedRequest(request,ops){
 const operation=await operationsRequest(request,ops);
 for(let n=0;n<500;n++){
  const state=await operationsRequest({method:'GET',url:new URL('http://local/v1/admin/v2-operations/preflights/'+operation.id),actor:request.actor},ops);
  if(state.status==='FAILED')throw Error(state.error);
  if(state.status==='SUCCEEDED')return state.result;
  await new Promise(resolve=>setTimeout(resolve,10));
 }
 throw Error('Test preflight timed out');
}

test('queued admission without an execution output remains observable without invented lifecycle results',()=>{
 const {dir,put}=fixture();put('operation.json',{id:'job',status:'QUEUED',origin:'ADMIN'});put('manifest.json',{lifecycle:{output:null,input:'pending'},capabilities:{direct:false}});const r=normalizeRun(dir,dir);assert.equal(r.jobId,'job');assert.equal(r.status,'QUEUED');assert.equal(r.lifecycle,null);assert.equal(r.requests,undefined);
});
