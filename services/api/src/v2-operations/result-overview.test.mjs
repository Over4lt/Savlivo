import test from 'node:test';import assert from 'node:assert/strict';import {operationsRequest} from './http.mjs';import {lifecycleServiceView} from './artifacts.mjs';
test('recorded run exposes full compact cohort in one service read, keeping detailed page bounded',async()=>{
 let calls=0;const rows=Array.from({length:150},(_,i)=>({service:String(i),state:'PARTIAL',subscription:'VERIFIED',requests:0,evidence:[{text:'excluded from compact projection'}]}));
 const ops={config:{read:true},run:()=>({id:'a'.repeat(24),jobId:'j',status:'COMPLETE'}),services:({limit})=>{calls++;assert.equal(limit,Number.MAX_SAFE_INTEGER);return {rows,total:150};},db:()=>({jobs:[{id:'j',status:'COMPLETE',startedAt:'start',finishedAt:'end'}],events:[]})};
 const r=await operationsRequest({method:'GET',url:new URL('https://offline.invalid/v1/admin/v2-operations/runs/'+ 'a'.repeat(24)),actor:'a'},ops);
 assert.equal(calls,1);assert.equal(r.services.rows.length,100);assert.equal(r.overviewServices.length,150);assert.equal(r.overviewServices[0].subscription,'VERIFIED');assert(!('evidence'in r.overviewServices[0]));assert.equal(r.run.startedAt,'start');assert.equal(r.run.finishedAt,'end');assert.equal(r.run.diagnostic,null);
});
test('subscription qualification is passed through without inference from pricing',()=>{
 assert.equal(lifecycleServiceView({subscriptionQualification:{status:'VERIFIED'},pricing:[]}).subscription,'VERIFIED');assert.equal(lifecycleServiceView({pricing:[{status:'ESTABLISHED'}]}).subscription,undefined);
});
