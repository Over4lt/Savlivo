import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {executePriceResearchBatch} from './price-research-batch.mjs';

const capabilities={direct:true,tavily:true,decodo:false,browser:false,groq:false};
const target=(serviceId,targetMarket)=>({id:`price-research:${serviceId}:${targetMarket}`,serviceId,serviceName:serviceId,targetMarket,marketApplicabilityEstablished:false});
function fixture(t,targets=[target('alpha','DE'),target('alpha','NO'),target('beta','DE')]){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'bounded-price-batch-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));const config={objective:'PRICE_RESEARCH',targetKind:'CANONICAL_SELECTION',services:[...new Set(targets.map(row=>row.serviceId))],markets:['DE','NO'],targetingRevision:'a'.repeat(64),cursor:null,batchTargets:targets,logicalTargetCount:targets.length,continuationCursor:null,perTargetRequestCeiling:96,batchRequestCeiling:targets.length*96,capabilities};return {directory,job:{id:'job',config}};}

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
 assert.equal(result.status,'STOPPED');assert.deepEqual(order,['alpha:DE']);assert.deepEqual(result.outcomes.map(row=>row.status),['COMPLETE','PENDING','PENDING']);const persisted=JSON.parse(fs.readFileSync(path.join(f.directory,'price-research-batch-progress.json')));assert.equal(persisted.nextIndex,1);
});

test('child failure is persisted with its exact target and is never retried on recovery',async t=>{
 const f=fixture(t),order=[];
 await assert.rejects(executePriceResearchBatch({...f,executeTarget:async({job})=>{const id=job.config.serviceId+':'+job.config.market;order.push(id);if(id==='alpha:NO')throw Error('INFRASTRUCTURE_FAILURE');return {ok:true};}}),/PRICE_RESEARCH_BATCH_CHILD_FAILED/);
 const progress=JSON.parse(fs.readFileSync(path.join(f.directory,'price-research-batch-progress.json')));assert.equal(progress.status,'FAILED');assert.deepEqual(progress.outcomes.map(row=>[row.targetId,row.status,row.failureCode??null]),[['price-research:alpha:DE','COMPLETE',null],['price-research:alpha:NO','FAILED','INFRASTRUCTURE_FAILURE'],['price-research:beta:DE','PENDING',null]]);
 await assert.rejects(executePriceResearchBatch({...f,executeTarget:async()=>{throw Error('MUST_NOT_RUN');}}),/PRICE_RESEARCH_BATCH_CHILD_FAILED/);assert.deepEqual(order,['alpha:DE','alpha:NO']);
});

test('wrapper rejects duplicate targets and ceilings above the fixed 96 per target / 960 batch bounds',async t=>{
 const duplicate=[target('alpha','DE'),target('alpha','DE')],f=fixture(t,duplicate);await assert.rejects(executePriceResearchBatch({...f,executeTarget:async()=>({})}),/INVALID_PRICE_RESEARCH_BATCH/);
 f.job.config.batchTargets=Array.from({length:10},(_,index)=>target(`service-${index}`,'DE'));f.job.config.logicalTargetCount=10;f.job.config.batchRequestCeiling=961;await assert.rejects(executePriceResearchBatch({...f,executeTarget:async()=>({})}),/INVALID_PRICE_RESEARCH_BATCH/);
 const malformed=fixture(t,[target('alpha','DE')]);malformed.job.config.batchTargets[0].marketApplicabilityEstablished=true;await assert.rejects(executePriceResearchBatch({...malformed,executeTarget:async()=>({})}),/INVALID_PRICE_RESEARCH_BATCH/);
});
