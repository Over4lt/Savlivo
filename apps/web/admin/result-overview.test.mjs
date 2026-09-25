import test from 'node:test';import assert from 'node:assert/strict';import {resultOverview,outcome,needsAction,filterOverviewRows} from './result-overview.js';
const run={status:'COMPLETE',requests:137,bounds:{totalRequests:1096},capabilityUsage:{directRequests:111,tavilyRequests:26,decodoRequests:0,browserExecutions:0,groqCalls:0}};
const rows=Array.from({length:50},(_,i)=>({service:'service-'+i,name:'Service '+i,state:i<22?'HUMAN_REVIEW_REQUIRED':i<40?'PARTIAL':'UNRESOLVED',humanReview:i<22?['RETAINED_REVIEW']:[],requests:i<5?0:3,identity:'VERIFIED',subscription:i<30?'ESTABLISHED':'UNRESOLVED',markets:'UNRESOLVED',login:i<20?'ESTABLISHED':'UNRESOLVED',management:'UNRESOLVED',cancellation:i<10?'NOT_APPLICABLE':'UNRESOLVED',unresolvedReasons:i%2?['DISCOVERY_EXHAUSTED','BUDGET_EXHAUSTED','DISCOVERY_EXHAUSTED']:[],pricing:i<27?[{market:'XX',status:i===0?'ESTABLISHED':'UNRESOLVED',confidence:i===0?'HIGH':null}]:[]}));
test('50-service execution COMPLETE does not imply admission or research completion',()=>{
 const m=resultOverview(run,rows);assert.equal(m.total,50);assert.equal(m.buckets.review.length,22);assert.equal(m.buckets.partial.length,18);assert.equal(m.buckets.pending.length,10);assert.equal(m.buckets.complete.length,0);assert.equal(Object.values(m.buckets).flat().length,50);assert.equal(new Set(Object.values(m.buckets).flat()).size,50);
});
test('action is explicit review only; ordinary unresolved and access/budget reasons are not failures',()=>{
 assert.equal(needsAction({state:'UNRESOLVED',unresolvedReasons:['BUDGET_EXHAUSTED']}),false);assert.equal(needsAction({authority:'HUMAN_REVIEW_REQUIRED'}),true);assert.equal(outcome({state:'FAILED'}),'other');assert.equal(outcome({state:'BLOCKED'}),'other');assert.equal(outcome({researchComplete:true,pricing:[{status:'UNRESOLVED'}]}),'complete');assert.equal(outcome({state:'LOGIN_MANAGE_ESTABLISHED'}),'account');
});
test('pricing targets, confidence, no target and quarantine are independent of service outcome',()=>{
 const m=resultOverview(run,rows);assert.equal(m.price.targets,27);assert.equal(m.price.established,1);assert.equal(m.price.unresolved,26);assert.equal(m.price.noTarget.length,23);assert.deepEqual(m.price.confidence,{HIGH:1});
 const p=resultOverview(run,[{service:'x',researchComplete:true,pricing:[{status:'ESTABLISHED',amount:0,confidence:'HIGH',quarantined:2},{status:'ESTABLISHED',confidence:'MEDIUM'},{status:'PARTIAL',confidence:'Unavailable'}]}]);assert.equal(p.price.established,1);assert.equal(p.price.unresolved,1);assert.equal(p.price.partial,1);assert.equal(p.price.quarantined,2);assert.deepEqual(p.price.confidence,{MEDIUM:1});assert.equal(p.buckets.complete.length,1);
});
test('reason counts overlap but deduplicate within a service',()=>{
 const m=resultOverview(run,rows);assert.equal(m.reasons.get('DISCOVERY_EXHAUSTED').length,25);assert.equal(m.reasons.get('BUDGET_EXHAUSTED').length,25);assert.equal(m.reasons.get('HUMAN_REVIEW_REQUIRED').length,22);assert.equal(m.total,50);
});
test('dimension denominators exclude explicit not-applicable and report unknown separately',()=>{
 const m=resultOverview(run,rows);assert.equal(m.dimensions.identity.established,50);assert.equal(m.dimensions.subscription.established,30);assert.equal(m.dimensions.cancellation.applicable,40);assert.equal(m.dimensions.cancellation.notApplicable,10);assert.equal(m.dimensions.authority.unknown,50);
});
test('efficiency retains measured usage and distinguishes zero fresh requests from not researched',()=>{
 const e=resultOverview(run,rows).efficiency;assert.equal(e.used,137);assert.equal(e.budget,1096);assert.equal(e.perService,2.74);assert.deepEqual(e.usage,{Direct:111,Tavily:26,Decodo:0,Browser:0,Groq:0});assert.equal(e.zero,5);assert.equal(e.active,45);
});
test('all metric memberships filter exact services and reset without requests',()=>{
 const m=resultOverview(run,rows);for(const ids of [...Object.values(m.buckets),m.action,...m.reasons.values(),m.price.establishedServices,m.price.unresolvedServices,m.price.noTarget])assert.deepEqual(filterOverviewRows(rows,{ids:new Set(ids)}).map(r=>r.service),ids);
 assert.equal(filterOverviewRows(rows).length,50);assert.equal(filterOverviewRows(rows,{q:'Service 49'}).length,1);
});
test('large cohort aggregates in bounded passes without altering inputs',()=>{
 const cohort=Array.from({length:10000},(_,i)=>({...rows[i%50],service:String(i)})),before=JSON.stringify(cohort);assert.equal(resultOverview(run,cohort).total,10000);assert.equal(JSON.stringify(cohort),before);
});
