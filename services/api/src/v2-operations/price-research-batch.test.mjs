import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {executePriceResearchBatch,readPriceResearchBatchProgress} from './price-research-batch.mjs';

const capabilities={direct:true,tavily:true,decodo:false,browser:false,groq:false};
const target=(serviceId,targetMarket)=>({id:`price-research:${serviceId}:${targetMarket}`,serviceId,serviceName:serviceId,targetMarket,marketApplicabilityEstablished:false});
function fixture(t,targets=[target('alpha','DE'),target('alpha','NO'),target('beta','DE')]){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'bounded-price-batch-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));const config={objective:'PRICE_RESEARCH',targetKind:'CANONICAL_SELECTION',services:[...new Set(targets.map(row=>row.serviceId))],markets:['DE','NO'],targetingRevision:'a'.repeat(64),batchTargets:targets,logicalTargetCount:targets.length,perTargetRequestCeiling:96,batchRequestCeiling:targets.length*96,capabilities};return {directory,job:{id:'job',config}};}

test('batch executes one child at a time in deterministic namespaces and completed recovery is idempotent',async t=>{
 const f=fixture(t),order=[],directories=[];let active=0,maximum=0;
 const executeTarget=async({job,directory})=>{active++;maximum=Math.max(maximum,active);order.push(`${job.config.serviceId}:${job.config.market}`);directories.push(directory);assert.equal(job.config.targetKind,'KNOWN_SERVICE');active--;return {retainedSuggested:true,verifiedUntouched:true};};
 const result=await executePriceResearchBatch({...f,executeTarget});assert.equal(result.status,'COMPLETE');assert.equal(maximum,1);assert.deepEqual(order,['alpha:DE','alpha:NO','beta:DE']);assert.equal(new Set(directories).size,3);for(const directory of directories)assert(fs.existsSync(path.join(directory,'result.json')));
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directories[0],'result.json'))),{retainedSuggested:true,verifiedUntouched:true});
 const recovered=await executePriceResearchBatch({...f,executeTarget:async()=>{throw Error('DUPLICATE_EXECUTION');}});assert.equal(recovered.status,'COMPLETE');assert.deepEqual(order,['alpha:DE','alpha:NO','beta:DE']);
});

test('stop after an active child preserves completion and never starts the next child',async t=>{
 const f=fixture(t),order=[];let stop=false;
 const result=await executePriceResearchBatch({...f,shouldStop:()=>stop,executeTarget:async({job})=>{order.push(job.config.serviceId+':'+job.config.market);stop=true;return {ok:true};}});
 assert.equal(result.status,'STOPPED');assert.deepEqual(order,['alpha:DE']);assert.deepEqual(result.outcomes.map(row=>row.status),['COMPLETE','PENDING','PENDING']);const persisted=JSON.parse(fs.readFileSync(path.join(f.directory,'price-research-batch-progress.json')));assert.equal(persisted.nextIndex,1);assert.equal(Object.hasOwn(persisted,'outcomes'),false);assert.equal(fs.readFileSync(path.join(f.directory,'price-research-batch-progress.jsonl'),'utf8').trim().split('\n').length,2);
});

test('child failure is persisted with its exact target and is never retried on recovery',async t=>{
 const f=fixture(t),order=[];
 await assert.rejects(executePriceResearchBatch({...f,executeTarget:async({job})=>{const id=job.config.serviceId+':'+job.config.market;order.push(id);if(id==='alpha:NO')throw Error('INFRASTRUCTURE_FAILURE');return {ok:true};}}),/PRICE_RESEARCH_BATCH_CHILD_FAILED/);
 const progress=readPriceResearchBatchProgress(f.job.config,f.directory);assert.equal(progress.status,'FAILED');assert.deepEqual(progress.outcomes.map(row=>[row.targetId,row.status,row.failureCode??null]),[['price-research:alpha:DE','COMPLETE',null],['price-research:alpha:NO','FAILED','INFRASTRUCTURE_FAILURE'],['price-research:beta:DE','PENDING',null]]);
 await assert.rejects(executePriceResearchBatch({...f,executeTarget:async()=>{throw Error('MUST_NOT_RUN');}}),/PRICE_RESEARCH_BATCH_CHILD_FAILED/);assert.deepEqual(order,['alpha:DE','alpha:NO']);
});

test('scope above ten executes sequentially and resumes without repeating completed targets',async t=>{
 const targets=Array.from({length:12},(_,index)=>target(`service-${String(index).padStart(2,'0')}`,'DE')),f=fixture(t,targets),order=[];let stop=false;
 const first=await executePriceResearchBatch({...f,shouldStop:()=>stop,executeTarget:async({job})=>{order.push(job.config.serviceId);if(order.length===5)stop=true;return {ok:true};}});assert.equal(first.status,'STOPPED');assert.equal(first.nextIndex,5);assert.equal(first.outcomes.filter(row=>row.status==='COMPLETE').length,5);
 stop=false;const recovered=await executePriceResearchBatch({...f,shouldStop:()=>stop,executeTarget:async({job})=>{order.push(job.config.serviceId);return {ok:true};}});assert.equal(recovered.status,'COMPLETE');assert.equal(recovered.outcomes.length,12);assert.equal(new Set(order).size,12);assert.deepEqual(order,targets.map(row=>row.serviceId));
});

test('legacy durable progress is migrated and completed targets remain idempotent',async t=>{
 const f=fixture(t),config={...f.job.config,cursor:null,continuationCursor:null},first=config.batchTargets[0],legacyBinding=createHash('sha256').update(JSON.stringify({targetingRevision:config.targetingRevision,services:config.services,markets:config.markets,cursor:null,batchTargets:config.batchTargets,logicalTargetCount:config.logicalTargetCount,continuationCursor:null,perTargetRequestCeiling:config.perTargetRequestCeiling,batchRequestCeiling:config.batchRequestCeiling})).digest('hex');f.job.config=config;
 fs.writeFileSync(path.join(f.directory,'price-research-batch-progress.json'),JSON.stringify({version:1,kind:'PRICE_RESEARCH_BATCH_PROGRESS',binding:legacyBinding,targetingRevision:config.targetingRevision,logicalTargetCount:3,perTargetRequestCeiling:96,batchRequestCeiling:288,status:'STOPPED',nextIndex:1,outcomes:[{targetId:first.id,serviceId:first.serviceId,targetMarket:first.targetMarket,status:'COMPLETE',artifactDirectory:'price-research-targets/01-alpha-DE'},...config.batchTargets.slice(1).map((row,index)=>({targetId:row.id,serviceId:row.serviceId,targetMarket:row.targetMarket,status:'PENDING',artifactDirectory:`price-research-targets/0${index+2}-${row.serviceId}-${row.targetMarket}`}))]}));
 const order=[],result=await executePriceResearchBatch({...f,executeTarget:async({job})=>{order.push(`${job.config.serviceId}:${job.config.market}`);return {ok:true};}});assert.equal(result.status,'COMPLETE');assert.deepEqual(order,['alpha:NO','beta:DE']);assert.equal(result.outcomes[0].status,'COMPLETE');assert.equal(JSON.parse(fs.readFileSync(path.join(f.directory,'price-research-batch-progress.json'))).version,2);
});

test('synthetic large scope persists compact checkpoint state without truncating targets',async t=>{
 const targets=Array.from({length:11000},(_,index)=>target(`future-${String(index).padStart(5,'0')}`,'DE')),f=fixture(t,targets),result=await executePriceResearchBatch({...f,shouldStop:()=>true,executeTarget:async()=>{throw Error('MUST_NOT_RUN');}}),persisted=JSON.parse(fs.readFileSync(path.join(f.directory,'price-research-batch-progress.json')));
 assert.equal(result.outcomes.length,11000);assert.equal(result.nextIndex,0);assert.equal(result.status,'STOPPED');assert.equal(persisted.logicalTargetCount,11000);assert.equal(Object.hasOwn(persisted,'outcomes'),false);assert(fs.statSync(path.join(f.directory,'price-research-batch-progress.json')).size<2048);assert.equal(fs.existsSync(path.join(f.directory,'price-research-batch-progress.jsonl')),false);
});

test('wrapper rejects duplicate targets, mismatched dynamic ceilings and malformed targets',async t=>{
 const duplicate=[target('alpha','DE'),target('alpha','DE')],f=fixture(t,duplicate);await assert.rejects(executePriceResearchBatch({...f,executeTarget:async()=>({})}),/INVALID_PRICE_RESEARCH_BATCH/);
 f.job.config.batchTargets=Array.from({length:12},(_,index)=>target(`service-${index}`,'DE'));f.job.config.logicalTargetCount=12;f.job.config.batchRequestCeiling=12*96+1;await assert.rejects(executePriceResearchBatch({...f,executeTarget:async()=>({})}),/INVALID_PRICE_RESEARCH_BATCH/);
 const malformed=fixture(t,[target('alpha','DE')]);malformed.job.config.batchTargets[0].marketApplicabilityEstablished=true;await assert.rejects(executePriceResearchBatch({...malformed,executeTarget:async()=>({})}),/INVALID_PRICE_RESEARCH_BATCH/);
});
