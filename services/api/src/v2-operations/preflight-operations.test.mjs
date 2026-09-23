import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {Operations} from './control.mjs';
import {beginPreflight,preflightStatus,launchPreflight} from './preflight-operations.mjs';
import {operationsRequest} from './http.mjs';
const input={objective:'MATURE_LIFECYCLE',scope:'SELECTED_SERVICES',services:['example'],capabilities:{direct:true,tavily:true,decodo:false,browser:false,groq:false}};
function fixture(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'async-preflight-'));return new Operations({root,repo:root,read:true,control:true,scheduling:false});}
const result=()=>({token:'fixture-token',expiresAt:new Date(Date.now()+900000).toISOString(),config:input});
test('disconnected request and new Operations instance recover actor-owned completion without a research job',()=>{
 const ops=fixture();let finish,calls=0;const launch=(_c,_i,_a,done)=>{calls++;finish=done;};
 const first=beginPreflight(ops,input,'actor',launch);assert.equal(first.status,'RUNNING');
 assert.equal(beginPreflight(ops,{...input,capabilities:{...input.capabilities}},'actor',launch).id,first.id);assert.equal(calls,1);
 assert.throws(()=>beginPreflight(ops,input,'other',launch),/BUSY/);assert.throws(()=>preflightStatus(ops,'other',first.id),/NOT_FOUND/);
 const reloaded=new Operations(ops.config);assert.equal(preflightStatus(reloaded,'actor',first.id).status,'RUNNING');finish({result:result()});
 assert.equal(preflightStatus(reloaded,'actor',first.id).result.token,'fixture-token');assert.deepEqual(ops.db().jobs,[]);
 assert.equal(beginPreflight(ops,input,'actor',launch).id,first.id);assert.equal(calls,1);
});
test('failure and expiry never return a successful token; retention and restart fail closed',()=>{
 const ops=fixture();const failed=beginPreflight(ops,input,'a',(_c,_i,_a,done)=>done({error:'PREFLIGHT_VALIDATION_FAILED'}));assert.equal(preflightStatus(ops,'a',failed.id).status,'FAILED');
 const good=beginPreflight(ops,input,'a',(_c,_i,_a,done)=>done({result:result()}));ops.transaction(db=>{db.preflightOperations.find(r=>r.id===good.id).result.expiresAt='2000-01-01';});assert.equal(preflightStatus(ops,'a',good.id).status,'EXPIRED');assert.equal(preflightStatus(ops,'a',good.id).result,undefined);
 const running=beginPreflight(ops,input,'a',()=>{});ops.transaction(db=>{db.preflightOperations.find(r=>r.id===running.id).ownerPid=99999999;});assert.equal(preflightStatus(ops,'a',running.id).status,'FAILED');
 for(let i=0;i<40;i++)beginPreflight(ops,input,'a',(_c,_i,_a,done)=>done({error:'FAILED'}));assert(ops.db().preflightOperations.length<=32);
 ops.transaction(db=>db.preflightOperations.forEach(r=>r.createdAt='2000-01-01'));assert.deepEqual(preflightStatus(ops,'a').rows,[]);
});
test('status endpoint requires authentication and run-control; Start retains actor, confirmation and expiry checks',async()=>{
 const ops=fixture(),url=new URL('https://offline.invalid/v1/admin/v2-operations/preflights');
 await assert.rejects(operationsRequest({method:'GET',url,actor:null},ops),/UNAUTHORIZED/);
 ops.config.control=false;assert.throws(()=>beginPreflight(ops,input,'a'),/DISABLED/);assert.throws(()=>preflightStatus(ops,'a'),/DISABLED/);ops.config.control=true;
 assert.throws(()=>ops.start('missing','a',false),/CONFIRMATION/);assert.throws(()=>ops.start('missing','a',true),/EXPIRED/);
 ops.transaction(db=>db.preflights.push({token:'x',actor:'a',expiresAt:new Date(Date.now()+900000).toISOString(),config:input,catalogHash:'old'}));
 assert.throws(()=>ops.start('x','other',true),/EXPIRED/);ops.plan=()=>({catalogHash:'changed'});assert.throws(()=>ops.start('x','a',true),/STALE/);assert.deepEqual(ops.db().jobs,[]);
});
test('production worker validates off the HTTP thread and reports failure without starting research',async()=>{
 const ops=fixture();let ticks=0;const timer=setInterval(()=>ticks++,1);
 try{const outcome=await new Promise(resolve=>launchPreflight(ops.config,input,'a',resolve));assert(outcome.error);assert(ticks>0);assert.deepEqual(ops.db().jobs,[]);}finally{clearInterval(timer);}
});

test('real isolated Preflight native subprocess can block while HTTP status stays responsive; completion persists token only',async()=>{
 const ops=fixture();ops.config.lifecycleInput='input.json';
 const put=(name,value)=>{const file=path.join(ops.config.repo,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value));};
 put('input.json',{cohortManifest:'manifest.json'});put('manifest.json',{serviceIds:['example']});
 fs.symlinkSync(new URL('../../../../node_modules',import.meta.url),path.join(ops.config.repo,'node_modules'),'dir');
 const cli=path.join(ops.config.repo,'docs/catalog/global-47/research-v2/run-mature-v2.mjs');fs.mkdirSync(path.dirname(cli),{recursive:true});
 fs.writeFileSync(cli,`if(!process.argv.includes('--check')||process.argv.includes('--live'))throw Error('UNSAFE');
 globalThis.fetch=()=>{throw Error('NETWORK_FORBIDDEN')};
 Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,100);
 console.log(JSON.stringify({output:'output',networkCalls:0,onlineStarted:false,servicesSelected:1,baselineExcluded:275,maximumNewRequests:36,liveReady:true}));`);
 let ticks=0;const timer=setInterval(()=>ticks++,1);
 try{
  const operation=await operationsRequest({method:'POST',url:new URL('https://offline.invalid/v1/admin/v2-operations/preflight'),body:input,actor:'a'},ops);
  assert.equal(operation.status,'RUNNING');let status;
  for(let i=0;i<500;i++){status=preflightStatus(ops,'a',operation.id);if(status.status!=='RUNNING')break;await new Promise(r=>setTimeout(r,10));}
  assert.equal(status.status,'SUCCEEDED',JSON.stringify(status));assert(status.result.token);assert(ticks>20);
  assert.deepEqual(ops.db().jobs,[]);assert.equal(ops.db().preflights.length,1);
 }finally{clearInterval(timer);}
});
