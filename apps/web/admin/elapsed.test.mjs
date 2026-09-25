import test from 'node:test';
import assert from 'node:assert/strict';
import {elapsedText,elapsedClock} from './live-status.js';
const start='2026-09-25T12:00:00.000Z',epoch=Date.parse(start);
const active={status:'RUNNING',terminal:false,startedAt:start};
test('active elapsed derives from wall time, including delayed/background ticks and reconnect',()=>{
 assert.equal(elapsedText(active,epoch+1000),'Elapsed: 0m 1s');
 assert.equal(elapsedText(active,epoch+125000),'Elapsed: 2m 5s');
 assert.equal(elapsedText({...active,startedAt:new Date(epoch+60000).toISOString()},epoch+125000),'Elapsed: 1m 5s');
});
test('terminal elapsed freezes at authoritative end, with persisted update fallback',()=>{
 const job={...active,terminal:true,status:'COMPLETE',finishedAt:new Date(epoch+65000).toISOString()};
 assert.equal(elapsedText(job,epoch+999999),'Elapsed: 1m 5s');
 assert.equal(elapsedText({...job,finishedAt:null,updatedAt:new Date(epoch+65000).toISOString()}),'Elapsed: 1m 5s (as of status update)');
});
test('missing, invalid and reversed timestamps fail safely',()=>{
 for(const job of [{...active,startedAt:null},{...active,startedAt:'invalid'},{...active,terminal:true,finishedAt:'invalid'},{...active,terminal:true,finishedAt:new Date(epoch-1).toISOString()}])assert.equal(elapsedText(job,epoch),'Elapsed: not reported');
});
test('one display-only timer survives repeated renders, rebases, stops at terminal and disposes',()=>{
 const pending=new Map();let now=epoch,id=0,value,current=true;
 const clock=elapsedClock(text=>value=text,()=>current,(fn,delay)=>{assert.equal(delay,1000);pending.set(++id,fn);return id;},key=>pending.delete(key),()=>now);
 const tick=()=>{const [key,fn]=pending.entries().next().value;pending.delete(key);fn();};
 clock.update(active);clock.update(active);assert.equal(pending.size,1);
 now=epoch+91000;tick();assert.equal(value,'Elapsed: 1m 31s');assert.equal(pending.size,1);
 clock.update({...active,startedAt:new Date(epoch+60000).toISOString()});assert.equal(value,'Elapsed: 0m 31s');assert.equal(pending.size,1);
 clock.update({...active,status:'FAILED',terminal:true,finishedAt:new Date(epoch+10000).toISOString()});assert.equal(value,'Elapsed: 0m 10s');assert.equal(pending.size,0);
 clock.update(active);current=false;tick();assert.equal(pending.size,0);
 current=true;clock.update(active);clock.dispose();assert.equal(pending.size,0);clock.update(active);assert.equal(pending.size,0);
});
