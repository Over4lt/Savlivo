import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {executePriceResearchBatch,readPriceResearchBatchProgress} from './price-research-batch.mjs';
import {createSuggestedOnlyGoogleGate} from './suggested-only-google-gate.mjs';
import {TargetResearchFailure} from '../research-v2/live/target-research-failure.mjs';
import {runAdminSuggestedOnlyResearch} from '../google-ai/admin-live-pipeline.mjs';

const target=(serviceId,market)=>({id:`price-research:${serviceId}:${market}`,serviceId,serviceName:serviceId,targetMarket:market,marketApplicabilityEstablished:false});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function fixture(t,targets){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'suggested-parallel-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const config={objective:'PRICE_RESEARCH',targetKind:'CANONICAL_SELECTION',services:[...new Set(targets.map(row=>row.serviceId))],markets:targets.map(row=>row.targetMarket),targetingRevision:'a'.repeat(64),batchTargets:targets,logicalTargetCount:targets.length,perTargetRequestCeiling:2,batchRequestCeiling:targets.length*2,researchMode:'suggested_only',capabilities:{direct:false,tavily:false,decodo:false,browser:false,groq:false}};
 return {directory,job:{id:'offline-job',config}};
}
function result(job,requests=2){
 const {serviceId,market}=job.config,targetId=`price-research:${serviceId}:${market}`;
 return {kind:'ADMIN_V4_FIRST_RESEARCH_RESULT',researchMode:'suggested_only',downstreamResult:null,targets:[{target:{id:targetId,service:serviceId,market},persisted:{suggestedPlans:1,verified:0},capabilityUsage:{googleAiRequests:requests,directAttempts:0,tavilyAttempts:0,decodoAttempts:0,browserAttempts:0},combined:{suggested:[{plan:`Plan ${market}`,amount:market==='NO'?79:market==='SE'?89:99,currency:market==='NO'?'NOK':market==='SE'?'SEK':'DKK',sourceUrl:`https://${serviceId}.example/${market.toLowerCase()}`}]} }]};
}
const noRateLimit={before:async()=>{},after:()=>{}};

test('fixed-delay offline Gemini simulation improves six-market throughput at 1, 2 and 3 workers',async t=>{
 const measurements=[];
 for(const parallelism of [1,2,3]){
  const f=fixture(t,['NO','SE','DK','FI','DE','NL'].map(market=>target('netflix',market)));
  let active=0,peak=0;const started=performance.now();
  const progress=await executePriceResearchBatch({...f,suggestedOnlyParallelism:parallelism,googleRequestGate:createSuggestedOnlyGoogleGate({minimumIntervalMs:5,rateLimitCooldownMs:20}),executeTarget:async({job,googleRequestGate})=>{
   await googleRequestGate.before();active++;peak=Math.max(peak,active);await wait(45);active--;googleRequestGate.after('COMPLETED');return result(job);
  }});
  measurements.push({parallelism,wallMs:Math.round(performance.now()-started),peak,targets:progress.outcomes.length});
  assert.equal(progress.status,'COMPLETE');assert.equal(peak,parallelism);
  assert.deepEqual(progress.outcomes.map(row=>row.status),Array(6).fill('COMPLETE'));
  const prices=progress.outcomes.map(row=>JSON.parse(fs.readFileSync(path.join(f.directory,row.artifactDirectory,'result.json'),'utf8')).targets[0].combined.suggested[0]);
  assert.deepEqual(prices.map(row=>row.currency).slice(0,3),['NOK','SEK','DKK']);assert.equal(new Set(prices.map(row=>row.sourceUrl)).size,6);
 }
 assert(measurements[2].wallMs<measurements[0].wallMs*0.75,JSON.stringify(measurements));
 t.diagnostic(JSON.stringify({simulatedGeminiDelayMs:45,simulatedMinimumIntervalMs:5,measurements}));
});

test('one service drains before another starts and faster markets refill its queue',async t=>{
 const f=fixture(t,[target('a','NO'),target('a','SE'),target('a','DK'),target('b','NO')]),events=[];
 await executePriceResearchBatch({...f,suggestedOnlyParallelism:2,googleRequestGate:noRateLimit,executeTarget:async({job})=>{
  events.push('start:'+job.config.serviceId+':'+job.config.market);
  await wait(job.config.market==='NO'&&job.config.serviceId==='a'?25:5);
  events.push('done:'+job.config.serviceId+':'+job.config.market);return result(job);
 }});
 assert(events.indexOf('start:a:DK')<events.indexOf('done:a:NO'));
 assert(events.indexOf('start:b:NO')>events.indexOf('done:a:DK'));
 assert(events.indexOf('start:b:NO')>events.indexOf('done:a:NO'));
});

test('invalid parallelism fails back to the existing serial path',async t=>{
 const f=fixture(t,[target('a','NO'),target('a','SE')]);let active=0,peak=0;
 const progress=await executePriceResearchBatch({...f,suggestedOnlyParallelism:4,googleRequestGate:noRateLimit,executeTarget:async({job})=>{active++;peak=Math.max(peak,active);await wait(3);active--;return result(job);}});
 assert.equal(progress.status,'COMPLETE');assert.equal(peak,1);
});

test('Stop drains active markets, then Resume skips completed results',async t=>{
 const f=fixture(t,['NO','SE','DK'].map(market=>target('netflix',market))),seen=[];let stop=false;
 const first=await executePriceResearchBatch({...f,suggestedOnlyParallelism:2,googleRequestGate:noRateLimit,shouldStop:()=>stop,executeTarget:async({job})=>{
  seen.push(job.config.market);await wait(job.config.market==='NO'?5:15);stop=true;return result(job);
 }});
 assert.equal(first.status,'STOPPED');assert.deepEqual(new Set(seen),new Set(['NO','SE']));assert.deepEqual(first.outcomes.map(row=>row.status),['COMPLETE','COMPLETE','PENDING']);
 stop=false;
 const second=await executePriceResearchBatch({...f,suggestedOnlyParallelism:2,googleRequestGate:noRateLimit,executeTarget:async({job})=>{seen.push(job.config.market);return result(job);}});
 assert.equal(second.status,'COMPLETE');assert.deepEqual(seen,['NO','SE','DK']);
});

test('crash recovery accepts only exact completed child receipt and never repeats uncertain paid calls',async t=>{
 const f=fixture(t,[target('netflix','NO')]);
 await executePriceResearchBatch({...f,suggestedOnlyParallelism:2,googleRequestGate:noRateLimit,executeTarget:async({job})=>result(job)});
 const journal=path.join(f.directory,'price-research-batch-progress.jsonl'),events=fs.readFileSync(journal,'utf8').trim().split('\n').map(JSON.parse);
 fs.writeFileSync(journal,JSON.stringify(events[0])+'\n');
 let calls=0;
 const recovered=await executePriceResearchBatch({...f,suggestedOnlyParallelism:2,googleRequestGate:noRateLimit,executeTarget:async()=>{calls++;throw Error('DUPLICATE_PAID_CALL');}});
 assert.equal(recovered.status,'COMPLETE');assert.equal(calls,0);
 await executePriceResearchBatch({...f,suggestedOnlyParallelism:2,googleRequestGate:noRateLimit,executeTarget:async()=>{calls++;throw Error('DUPLICATE_PAID_CALL');}});
 const child=path.join(f.directory,recovered.outcomes[0].artifactDirectory),resultFile=path.join(child,'result.json'),original=fs.readFileSync(resultFile);
 fs.writeFileSync(journal,JSON.stringify(events[0])+'\n');fs.writeFileSync(resultFile,Buffer.concat([original,Buffer.from(' ')]));
 await assert.rejects(executePriceResearchBatch({...f,suggestedOnlyParallelism:2,googleRequestGate:noRateLimit,executeTarget:async()=>{calls++;}}),/PRICE_RESEARCH_CHILD_RECOVERY_UNSAFE/);
 fs.writeFileSync(resultFile,original);fs.unlinkSync(path.join(child,'suggested-only-completion.json'));
 await assert.rejects(executePriceResearchBatch({...f,suggestedOnlyParallelism:2,googleRequestGate:noRateLimit,executeTarget:async()=>{calls++;}}),/PRICE_RESEARCH_CHILD_RECOVERY_UNSAFE/);
 assert.equal(calls,0);
});

test('a target-local failure stays isolated, while invalid budgets stop future markets',async t=>{
 const f=fixture(t,['NO','SE','DK'].map(market=>target('netflix',market))),seen=[];
 const progress=await executePriceResearchBatch({...f,suggestedOnlyParallelism:2,googleRequestGate:noRateLimit,executeTarget:async({job})=>{
  seen.push(job.config.market);if(job.config.market==='NO')throw new TargetResearchFailure('SOURCE_REVIEW_REQUIRED');return result(job);
 }});
 assert.equal(progress.status,'COMPLETE');assert.deepEqual(progress.outcomes.map(row=>row.status),['FAILED','COMPLETE','COMPLETE']);assert.deepEqual(seen,['NO','SE','DK']);
 const bad=fixture(t,['NO','SE','DK'].map(market=>target('prime-video',market)));let calls=0;
 await assert.rejects(executePriceResearchBatch({...bad,suggestedOnlyParallelism:2,googleRequestGate:noRateLimit,executeTarget:async({job})=>{calls++;return result(job,3);}}),/PRICE_RESEARCH_BATCH_CHILD_FAILED/);
 assert.equal(calls,2);assert.equal(readPriceResearchBatchProgress(bad.job.config,bad.directory).outcomes[2].status,'PENDING');
});

test('shared gate spaces requests and applies one bounded 429 cooldown without extra calls',async()=>{
 let now=1000;const sleeps=[];
 const gate=createSuggestedOnlyGoogleGate({minimumIntervalMs:10,rateLimitCooldownMs:50,now:()=>now,sleep:async ms=>{sleeps.push(ms);now+=ms;}});
 await gate.before();gate.after('HTTP_429');await gate.before();
 assert.deepEqual(sleeps,[50]);assert.equal(now,1050);
 await gate.before();assert.deepEqual(sleeps,[50,10]);
});

test('parallel batch uses the real Suggested projection with independent market persistence and one shared gate',async t=>{
 const f=fixture(t,['NO','SE','DK'].map(market=>target('prime-video',market))),stored=[],requests=[],gateEvents=[];
 const gate={before:async()=>gateEvents.push('before'),after:status=>gateEvents.push(status??'success')};
 const progress=await executePriceResearchBatch({...f,suggestedOnlyParallelism:3,googleRequestGate:gate,executeTarget:async({job,directory,googleRequestGate})=>{
  const market=job.config.market,currency={NO:'NOK',SE:'SEK',DK:'DKK'}[market],amount={NO:79,SE:89,DK:69}[market],url=`https://provider.example/${market.toLowerCase()}/pricing`;
  return runAdminSuggestedOnlyResearch({targets:[{id:`price-research:prime-video:${market}`,service:'prime-video',serviceName:'Prime Video',market}],artifactDirectory:directory,apiKey:'offline',maxGoogleRequests:2,googleRequestGate,
   acquireGoogle:async()=>{requests.push(market);await wait(5);return {status:'GOOGLE_AI_SUCCESS',aiResult:{provider:'Prime Video',market,plans:[{planName:'Prime Video',amount,currency,ordinaryRecurringPrice:amount,paymentCadence:'MONTHLY',commitment:null,annualOnly:false,freeTier:false,billingBasis:'per month',sourceUrl:url,sourceEvidence:`Prime Video ${amount} ${currency} monthly`,marketEvidence:`Offered in ${market}`,summary:'Standalone subscription',warnings:[],introPrice:null,introDuration:null}],sources:[{title:'Pricing',url}],warnings:[],timestamp:'2026-10-22T00:00:00.000Z',requestCount:1},audit:{request:{requestCount:1,status:'COMPLETED'},groundingCitations:[{url}]}};},
   persistSuggested:async rows=>{stored.push(...rows);},loadVerified:async()=>[]});
 }});
 assert.equal(progress.status,'COMPLETE');assert.equal(requests.length,3);assert.equal(gateEvents.filter(row=>row==='before').length,3);
 assert.equal(stored.length,3);assert.deepEqual(new Set(stored.map(row=>row.countryCode)),new Set(['NO','SE','DK']));
 assert.deepEqual(new Set(stored.map(row=>row.suggested.currency)),new Set(['NOK','SEK','DKK']));
 assert.equal(new Set(stored.map(row=>row.suggested.sourceUrl)).size,3);
 assert(progress.outcomes.every(row=>JSON.parse(fs.readFileSync(path.join(f.directory,row.artifactDirectory,'result.json'),'utf8')).targets[0].persisted.verified===0));
});
