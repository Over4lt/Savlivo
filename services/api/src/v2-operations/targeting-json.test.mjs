import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {syncBuiltinESMExports} from 'node:module';
import {targetingJson,lengthOnly} from './targeting-json.mjs';
import {loadTargeting,loadTargetingIsolated,projectTargeting,selectTargeting} from './targeting.mjs';
import {inspectLifecycleInput} from '../research-v2/inventory/reviewed-cohort-handoff.mjs';
import {sha} from '../research-v2/storage/core.mjs';
import {Operations} from './control.mjs';
import {operationsRequest} from './http.mjs';

function fixture(t,count=3){
 const repo=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'targeting-projection-')));t.after(()=>fs.rmSync(repo,{recursive:true,force:true}));
 const put=(f,v)=>{fs.mkdirSync(path.dirname(repo+'/'+f),{recursive:true});fs.writeFileSync(repo+'/'+f,JSON.stringify(v));};
 const ids=Array.from({length:count},(_,i)=>['film','paper','music'][i]??'fixture-'+i);
 put('manifest.json',{serviceIds:ids,expectedServices:count});
 put('universe.json',{existing:[{slug:'baseline'}],new_include:ids.map((slug,i)=>({slug,name:slug,disposition:'NEW_INCLUDE',markets:i%2?['DE']:['NO','SE'],category:i%2?'news':'video'})),research:[]});
 put('bindings.json',{schemaVersion:1,scope:'SHADOW_RESEARCH_ONLY',bindings:[]});
 put('input.json',{version:1,cohortManifest:'manifest.json',universe:'universe.json',reviewedBindings:'bindings.json',runsRoot:'.savlivo/research-v2/fixture',frozenHashes:Object.fromEntries(['manifest.json','universe.json'].map(f=>[f,sha(fs.readFileSync(repo+'/'+f))]))});
 const dirs=['new','old'].map(n=>'.savlivo/research-v2/fixture/'+n);
 for(const [i,d]of dirs.entries()){
  put(d+'/lineage.json',{cohort:ids});
  put(d+'/final-dispositions.json',{services:ids.map((service_id,j)=>({service_id,researchComplete:!!(j%2),finalStatus:i?'OLD':'PARTIAL',humanReview:j===0?['REVIEW']:[],subscriptionQualification:{evidence:Array.from({length:150},(_,k)=>({locator:k,quote:'é / \\ " 😀',verification:{accepted:true}}))}}))});
  fs.utimesSync(repo+'/'+d+'/final-dispositions.json',1700000000-i,1700000000-i);
  put(d+'/catalog/adaptive-state.json',{targets:{shared:{service:i?'paper':'film',researchMemory:{payload:['unused']}},[i?'older':'newer']:{service:'music',evidence:[{irrelevant:true}]}},decisionHistory:[{ignored:true}]});
 }
 return {repo,put,dirs,settings:{repo,lifecycleInput:'input.json'}};
}
function reference({repo,dirs}){
 const read=f=>JSON.parse(fs.readFileSync(repo+'/'+f)),handoff=inspectLifecycleInput('input.json',repo),states={},latest=[],known=new Set(),fingerprints=[];
 for(const d of dirs){const bytes=fs.readFileSync(repo+'/'+d+'/final-dispositions.json');fingerprints.push([d,sha(bytes)]);for(const s of JSON.parse(bytes).services)if(!known.has(s.service_id)){known.add(s.service_id);latest.push(s);}for(const [id,target]of Object.entries(read(d+'/catalog/adaptive-state.json').targets))if(!states[id])states[id]={target};}
 return projectTargeting({handoff,scopes:{},states,latest,identity:{inputs:handoff.inputHashes,genesis:null,fingerprints}});
}

test('selective reader validates skipped JSON, preserves strings/numbers/duplicates and exact byte hash',t=>{
 const {repo}=fixture(t),f=repo+'/json';
 const source='{"skip":{"x":[true,false,null,-1.3e+4,"'+ 'x'.repeat(65530)+'\\uD83D\\uDE00"]},"picked":{"text":"é😀\\n\\t\\/\\\\\\\"","number":-0.25e-2},"picked":{"text":"last","number":1e999},"__proto__":{"safe":true},"humanReview":[{},null,"text"]}';
 fs.writeFileSync(f,source);const p=targetingJson(f,{picked:true,__proto__:null,humanReview:lengthOnly});
 assert.deepEqual(p.value.picked,JSON.parse(source).picked);assert.deepEqual(p.value.humanReview,{length:3});assert.equal(p.sha256,sha(Buffer.from(source)));assert(!Object.hasOwn(p.value,'skip'));
 for(const value of ['é😀','\\u1234',[],['a'],null,0,{length:2}]){fs.writeFileSync(f,JSON.stringify({humanReview:value}));assert.equal(!!targetingJson(f,{humanReview:lengthOnly}).value.humanReview?.length,!!value?.length);}
 for(const broken of ['{"skip":[1,]}','{"skip":{"a":1,}}','{"skip":"\\q"}','{"skip":"\n"}','{"skip":01}','{"skip":1e}','{"skip":-}','{"skip":tru}','{"skip":null}garbage','{"skip":[']){fs.writeFileSync(f,broken);assert.throws(()=>targetingJson(f,{picked:true}),/TARGETING_INVALID_JSON/);}
 fs.writeFileSync(f,'{"targets":{"__proto__":{"service":"film"},"x":{"service":"paper"},"x":{"service":"music"}}}');assert.deepEqual(targetingJson(f,{targets:{'*':{service:true}}}).value,JSON.parse(fs.readFileSync(f)));
});

test('direct projection equals full materialization, including revision, selection and duplicate target precedence',t=>{
 const f=fixture(t),expected=reference(f);assert.deepEqual(loadTargeting(f.settings),expected);
 for(const filters of [{},{preset:'RETAINED'},{preset:'UNRESOLVED'},{markets:['SE']},{categories:['news']},{q:'paper'},{services:['music']}])assert.deepEqual(selectTargeting(loadTargeting(f.settings),filters),selectTargeting(expected,filters));
 const before=expected.revision;f.put(f.dirs[1]+'/final-dispositions.json',{services:[{service_id:'film',evidence:['changed ignored payload']}]});assert.notEqual(loadTargeting(f.settings).revision,before,'exact raw historical fingerprint remains bound');
});

test('projection refuses publication races and frozen-input/cohort changes',t=>{
 const f=fixture(t),file=f.repo+'/'+f.dirs[0]+'/final-dispositions.json',read=fs.readSync;let changed=false;
 const mock=t.mock.method(fs,'readSync',(...args)=>{const n=read(...args);if(!changed){changed=true;fs.appendFileSync(file,' ');}return n;});
 try{assert.throws(()=>targetingJson(file,{services:{'*':{service_id:true}}}),/STORAGE_PUBLICATION_RACE/);}finally{mock.mock.restore();}
 f.put(f.dirs[0]+'/lineage.json',{cohort:['outside']});assert.throws(()=>loadTargeting(f.settings),/TARGETING_RUN_COHORT/);
 f.put('universe.json',{existing:[],new_include:[],research:[]});assert.throws(()=>loadTargeting(f.settings),/LIFECYCLE_FROZEN_INPUT/);
});

test('targeting never whole-file reads disposition/checkpoint payloads and still validates every historical service',t=>{
 const f=fixture(t),original=fs.readFileSync;
 const mock=t.mock.method(fs,'readFileSync',(file,...args)=>{assert(!/(final-dispositions|adaptive-state)\.json$/.test(String(file)),'must stream historical payload');return original(file,...args);});syncBuiltinESMExports();
 try{assert.equal(loadTargeting(f.settings).counts.eligible,3);}finally{mock.mock.restore();syncBuiltinESMExports();}
 f.put(f.dirs[1]+'/catalog/adaptive-state.json',{targets:{shared:{service:'outside'}}});assert.throws(()=>loadTargeting(f.settings),/TARGETING_TARGET_SERVICE/);
 f.put(f.dirs[1]+'/catalog/adaptive-state.json',{targets:{}});f.put(f.dirs[1]+'/final-dispositions.json',{services:[{service_id:'outside'}]});assert.throws(()=>loadTargeting(f.settings),/TARGETING_RUN_SERVICE/);
});

test('summary then real isolated targeting API succeeds; repeated reads preserve all files',async t=>{
 const f=fixture(t),snapshot=()=>{const rows={};function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=d+'/'+e.name;if(e.isDirectory())walk(p);else rows[p]=sha(fs.readFileSync(p));}}walk(f.repo);return rows;},before=snapshot();
 const ops=new Operations({...f.settings,root:f.repo+'/ops',read:true,control:false,scheduling:false});
 const get=route=>operationsRequest({method:'GET',url:new URL('http://local/v1/admin/v2-operations/'+route),actor:'admin'},ops);
 assert.equal((await get('summary')).lifecycleConfigured,true);
 const result=await get('targeting');assert.equal(result.selectedServices,3);assert.equal(result.revision,reference(f).revision);
 for(let i=0;i<3;i++){ops.targetingCache=null;assert.deepEqual(await get('targeting'),result);}
 assert.deepEqual(snapshot(),before);assert(!fs.existsSync(ops.config.root));
 await assert.rejects(operationsRequest({method:'GET',url:new URL('http://local/v1/admin/v2-operations/targeting')},ops),/UNAUTHORIZED/);
});

test('large structural lifecycle history succeeds under unchanged 512 MiB isolated child',async t=>{
 let settings;
 if(process.env.TARGETING_STRUCTURAL_FIXTURE)settings={repo:process.env.TARGETING_STRUCTURAL_FIXTURE,lifecycleInput:'input.json'};
 else{
  const f=fixture(t,188);settings=f.settings;
  const ids=JSON.parse(fs.readFileSync(f.repo+'/manifest.json')).serviceIds;
  const evidence=JSON.stringify({proofDigest:'a'.repeat(64),locator:'monthly/row',dimension:'monthlyRecurring',status:'ESTABLISHED',source:{path:'retained/source.json',sha256:'b'.repeat(64)},observation:{fact:'subscription',value:true},verification:{accepted:true,reason:'SOURCE_BOUND'}});
  // Same nested evidence structure at four times the reported three-file footprint.
  // Write bounded per-service chunks; never build the whole fixture in JS memory.
  for(const [i,size]of [264177897,123686249,123395977].entries()){
   const d='.savlivo/research-v2/fixture/large-'+i;f.put(d+'/lineage.json',{cohort:ids});
   const file=f.repo+'/'+d+'/final-dispositions.json',fd=fs.openSync(file,'w'),n=Math.floor(size/ids.length/(evidence.length+1));
   try{fs.writeSync(fd,'{"services":[');for(const [j,id]of ids.entries()){
    fs.writeSync(fd,(j?',':'')+JSON.stringify({service_id:id,researchComplete:j%3===0,finalStatus:'PARTIAL',humanReview:j%7===0?['REVIEW']:[]}).slice(0,-1)+',"subscriptionQualification":{"evidence":[');
    fs.writeSync(fd,(evidence+',').repeat(n-1)+evidence+']}}');
   }fs.writeSync(fd,']}');}finally{fs.closeSync(fd);}
   fs.utimesSync(file,1700000100-i,1700000100-i);
  }
 }
 const a=loadTargetingIsolated(settings),ops=new Operations({...settings,root:settings.repo+'/ops',read:true,control:false});
 const b=await operationsRequest({method:'GET',url:new URL('http://local/v1/admin/v2-operations/targeting'),actor:'admin'},ops);
 assert.equal(b.revision,a.revision);assert.equal(b.selectedServices,188);assert.deepEqual(loadTargetingIsolated(settings),a);
});
