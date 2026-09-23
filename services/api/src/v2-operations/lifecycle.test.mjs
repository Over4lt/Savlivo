import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {normalizeLifecycleRun,publicRun,lifecycleServiceView,discover} from './artifacts.mjs';
import {lifecyclePlan} from './lifecycle.mjs';
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
function pickerFixture(t){const {dir,put}=fixture();t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const ids=Array.from({length:188},(_,i)=>'candidate-'+i);put('input.json',{cohortManifest:'manifest.json',universe:'universe.json',runsRoot:'runs'});put('manifest.json',{serviceIds:ids});put('universe.json',{existing:[{service:'netflix',name:'Netflix',loginManageStatus:'ESTABLISHED'},...Array.from({length:274},(_,i)=>({service:'baseline-'+i,name:'Baseline '+i}))],new_include:ids.slice(0,173).map(slug=>({slug,name:slug})),research:ids.slice(173).map(slug=>({slug,name:slug})),exclude:[{slug:'excluded',name:'Excluded'}]});const ops=new Operations({repo:dir,root:path.join(dir,'ops'),lifecycleInput:'input.json',read:true,control:true,scheduling:true});return {ops,dir,ids};}
test('Find services exposes full legitimate universe while only frozen 188 are selectable',async t=>{const {ops,dir,ids}=pickerFixture(t),before=fs.readFileSync(path.join(dir,'manifest.json'));const data=await operationsRequest({method:'GET',url:new URL('http://local/v1/admin/v2-operations/services?q=Netflix'),actor:'test'},ops);assert.equal(data.total,1);assert.deepEqual({...data.rows[0],evidence:undefined},{service:'netflix',state:'ESTABLISHED',name:'Netflix',section:'existing',visible:true,eligible:false,selectable:false,eligibilityReason:'Outside the current frozen research cohort / manifest; visible for reference only.',evidence:undefined});const all=ops.services({limit:1000});assert.equal(all.total,463);assert.deepEqual(all.rows.filter(r=>r.eligible).map(r=>r.service),ids);assert(all.rows.filter(r=>r.eligible).every(r=>r.visible&&r.selectable));assert.equal(ops.services({unresolvedOnly:true,limit:1000}).total,188);assert.deepEqual(fs.readFileSync(path.join(dir,'manifest.json')),before);});
test('control/API rejects visible baseline injection before preflight or schedule persistence',async t=>{const {ops,dir}=pickerFixture(t);const config={objective:'MATURE_LIFECYCLE',scope:'SELECTED_SERVICES',services:['netflix']};await assert.rejects(completedRequest({method:'POST',url:new URL('http://local/v1/admin/v2-operations/preflight'),body:config,actor:'test'},ops),/INVALID_LIFECYCLE_SELECTION/);assert.throws(()=>ops.configInput(config),/INVALID_LIFECYCLE_SELECTION/);assert.equal(ops.db().jobs.length,0);assert.equal(ops.db().preflights.length,0);assert.deepEqual(ops.configInput({...config,services:['candidate-0']}).services,['candidate-0']);for(const scope of ['FULL_CATALOG','UNRESOLVED_ONLY']){assert.deepEqual(ops.configInput({...config,scope,services:[]}).services,[]);assert.throws(()=>ops.configInput({...config,scope}),/INVALID_LIFECYCLE_SCOPE/);}});

test('full and unresolved plans remain manifest-bounded; selected plans preserve cohort order',async t=>{const {ops,dir,ids}=pickerFixture(t);const child=await import('node:child_process'),{syncBuiltinESMExports}=await import('node:module');const captured=[];const stub=t.mock.method(child.default,'spawnSync',(_command,args)=>{const input=JSON.parse(fs.readFileSync(args[args.indexOf('--input')+1]));captured.push(input.executionServices);return {status:0,stdout:JSON.stringify({output:'output',networkCalls:0,onlineStarted:false,servicesSelected:input.executionServices.length,baselineExcluded:275,maximumNewRequests:0,liveReady:false})};});syncBuiltinESMExports();try{for(const scope of ['FULL_CATALOG','UNRESOLVED_ONLY']){const plan=lifecyclePlan(ops.config,{objective:'MATURE_LIFECYCLE',scope,services:[]});assert.equal(plan.servicesConsidered,188);assert.deepEqual(captured.at(-1),ids);}lifecyclePlan(ops.config,{objective:'MATURE_LIFECYCLE',scope:'SELECTED_SERVICES',services:[ids[2],ids[0]]});assert.deepEqual(captured.at(-1),[ids[0],ids[2]]);assert(captured.every(rows=>!rows.includes('netflix')));}finally{stub.mock.restore();syncBuiltinESMExports();}});

test('enabled production Operations preflight invokes only native check and persists no job',async t=>{
 const {ops,dir}=pickerFixture(t);ops.config.scheduling=false;
 const child=await import('node:child_process'),{syncBuiltinESMExports}=await import('node:module');
 const stub=t.mock.method(child.default,'spawnSync',(_command,args,options)=>{
  assert(args.includes('--check'));assert(!args.includes('--live'));assert.equal(options.cwd,dir);assert.equal(options.env,process.env);
  return {status:0,stdout:JSON.stringify({output:'output',networkCalls:0,onlineStarted:false,servicesSelected:1,baselineExcluded:275,maximumNewRequests:36,liveReady:true})};
 });syncBuiltinESMExports();
 try{const result=ops.preflight({objective:'MATURE_LIFECYCLE',scope:'SELECTED_SERVICES',services:['candidate-0'],capabilities:{direct:true,tavily:true,decodo:false,browser:false,groq:false}},'admin');
 assert(result.token);assert.equal(result.servicesConsidered,1);assert.equal(ops.db().jobs.length,0);assert.equal(ops.db().preflights.length,1);
 }finally{stub.mock.restore();syncBuiltinESMExports();}
});
test('native preflight failure retains safe subprocess reason instead of discarding it',async t=>{
 const {ops}=pickerFixture(t),child=await import('node:child_process'),{syncBuiltinESMExports}=await import('node:module');
 const stub=t.mock.method(child.default,'spawnSync',()=>({status:1,stderr:JSON.stringify({event:'V2_OPERATIONS_FAILURE',reason:'GENESIS_DEPLOYMENT_REPOSITORY_INPUTS_MISSING'})}));syncBuiltinESMExports();
 try{assert.throws(()=>ops.preflight({objective:'MATURE_LIFECYCLE',scope:'SELECTED_SERVICES',services:['candidate-0']},'admin'),e=>e.message==='MATURE_LIFECYCLE_PREFLIGHT_FAILED'&&e.operationsDiagnostic.reason==='GENESIS_DEPLOYMENT_REPOSITORY_INPUTS_MISSING');assert.equal(ops.db().jobs.length,0);}finally{stub.mock.restore();syncBuiltinESMExports();}
});

test('production-scale healthy native check beyond the old 120s deadline remains bounded',async t=>{
 const {ops}=pickerFixture(t),child=await import('node:child_process'),{syncBuiltinESMExports}=await import('node:module');
 const simulatedHealthyDuration=180000;
 const stub=t.mock.method(child.default,'spawnSync',(_command,args,options)=>{
  assert(args.includes('--check'));assert(!args.includes('--live'));
  assert(args.includes('--max-old-space-size=512'));assert(args.includes('--expose-gc'));assert.equal(options.timeout,600000);assert(options.timeout>simulatedHealthyDuration);
  return {status:0,stdout:JSON.stringify({output:'output',networkCalls:0,onlineStarted:false,servicesSelected:1,maximumNewRequests:36,liveReady:true}),stderr:JSON.stringify({event:'V2_NATIVE_CHECK_STAGE',stage:'reference-closure',status:'FINISHED',durationMs:simulatedHealthyDuration})};
 });syncBuiltinESMExports();
 try{const p=lifecyclePlan(ops.config,{objective:'MATURE_LIFECYCLE',scope:'SELECTED_SERVICES',services:['candidate-0']});assert.equal(p.servicesConsidered,1);assert.equal(p.preflight.networkCalls,0);assert.equal(ops.db().jobs.length,0);}finally{stub.mock.restore();syncBuiltinESMExports();}
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
