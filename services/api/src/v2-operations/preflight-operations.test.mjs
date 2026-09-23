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
 put('input.json',{cohortManifest:'manifest.json',universe:'universe.json'});put('universe.json',{existing:[],new_include:[{slug:'example',markets:['NO']}],research:[]});put('manifest.json',{serviceIds:['example']});
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
  // Recover successful Preflight, explicitly confirm Start, then detach the request.
  const token=preflightStatus(new Operations(ops.config),'a',operation.id).result.token;
  const start=await operationsRequest({method:'POST',url:new URL('https://offline.invalid/v1/admin/v2-operations/start'),actor:'a',body:{token,confirmed:true}},ops);
  assert.equal(start.status,'RUNNING');const before=ticks;
  const retry=await operationsRequest({method:'POST',url:new URL('https://offline.invalid/v1/admin/v2-operations/start'),actor:'a',body:{token,confirmed:true}},ops);assert.equal(retry.id,start.id);
  for(let i=0;i<500;i++){status=preflightStatus(ops,'a',start.id,'START');if(status.status!=='RUNNING')break;await new Promise(r=>setTimeout(r,10));}
  assert.equal(status.status,'SUCCEEDED',JSON.stringify(status));assert(ticks-before>20);assert.equal(ops.db().jobs.length,1);
  const recovered=preflightStatus(new Operations(ops.config),'a',start.id,'START');assert.equal(recovered.result.id,ops.db().jobs[0].id);
 }finally{clearInterval(timer);}
});

test('same actor after relogin sees expired operation without token; another actor sees nothing',async()=>{
 const ops=fixture(),expired={...result(),expiresAt:new Date(Date.now()-1000).toISOString()};
 const operation=beginPreflight(ops,input,'stable-user-id',(_c,_i,_a,done)=>done({result:expired}));
 const reloaded=new Operations(ops.config),url=new URL('https://offline.invalid/v1/admin/v2-operations/preflights');
 const history=await operationsRequest({method:'GET',url,actor:'stable-user-id'},reloaded);
 assert.equal(history.rows[0].id,operation.id);assert.equal(history.rows[0].status,'EXPIRED');assert.equal(history.rows[0].result,undefined);
 assert.deepEqual((await operationsRequest({method:'GET',url,actor:'different-user-id'},reloaded)).rows,[]);
 assert.throws(()=>preflightStatus(reloaded,'different-user-id',operation.id),/NOT_FOUND/);
 assert.deepEqual(reloaded.db().jobs,[]);
});

test('30-minute review clock starts after validation, is independent of login, and never renews on recovery',t=>{
 const loginAt=Date.UTC(2026,8,23),completedAt=loginAt+336000;
 t.mock.timers.enable({apis:['Date'],now:loginAt});const ops=fixture();let plans=0;
 ops.plan=()=>{plans++;if(plans===1)t.mock.timers.setTime(completedAt);return {config:input,catalogHash:'authenticated-current',manifest:{},liveReady:true};};
 const operation=beginPreflight(ops,input,'stable-user',(_c,_i,actor,done)=>done({result:ops.preflight(input,actor)}));
 const saved=preflightStatus(ops,'stable-user',operation.id).result,expiry=completedAt+30*60000;
 assert.equal(Date.parse(saved.expiresAt),expiry);assert.equal(ops.db().jobs.length,0);
 const original=ops.db().preflights[0];
 // Session loss/relogin changes neither the durable record nor its owner/expiry.
 const relogged=new Operations(ops.config);
 for(const time of [completedAt+60000,expiry-1]){t.mock.timers.setTime(time);assert.equal(preflightStatus(relogged,'stable-user',operation.id).result.expiresAt,saved.expiresAt);assert.deepEqual(ops.db().preflights[0],original);}
 assert.equal(preflightStatus(relogged,'other-user').rows.length,0);
 ops.enqueue=()=>({validationPassed:true});assert.deepEqual(ops.start(saved.token,'stable-user',true),{validationPassed:true});assert.equal(plans,2);
 for(const time of [expiry,expiry+1]){t.mock.timers.setTime(time);assert(time<loginAt+60*60000);assert.equal(preflightStatus(relogged,'stable-user',operation.id).status,'EXPIRED');assert.throws(()=>ops.start(saved.token,'stable-user',true),/PREFLIGHT_EXPIRED/);}
 assert.equal(plans,2);assert.deepEqual(ops.db().jobs,[]);assert.equal(ops.db().preflights[0].expiresAt,saved.expiresAt);
});
