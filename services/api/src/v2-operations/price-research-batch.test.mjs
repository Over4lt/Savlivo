import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {executePriceResearchBatch,readPriceResearchBatchProgress} from './price-research-batch.mjs';
import {TargetResearchFailure} from '../research-v2/live/target-research-failure.mjs';
import {providerPricingRoutesForTarget} from '../research-v2/live/hybrid-provider-resource-memory.mjs';
import {derivedCountrySourceCandidates} from '../research-v2/live/derived-country-sources.mjs';
import {createPriceResearchAdapters} from './price-research-live.mjs';
import {researchLinkPriorityTarget} from './price-research.mjs';
import {recordResearchLinkResult} from './research-links.mjs';
import {runOpenWebResearch} from '../research-v2/live/open-web-discovery.mjs';

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

test('Suggested Only mode and one-call budget survive interrupted multi-market resume',async t=>{
 const f=fixture(t,[target('prime-video','NO'),target('prime-video','SE')]),seen=[];f.job.config.researchMode='suggested_only';f.job.config.perTargetRequestCeiling=1;f.job.config.batchRequestCeiling=2;f.job.config.capabilities={direct:false,tavily:false,decodo:false,browser:false,groq:false};
 let stop=false;
 const first=await executePriceResearchBatch({...f,shouldStop:()=>stop,executeTarget:async({job})=>{seen.push([job.config.market,job.config.researchMode]);stop=true;return {researchMode:'suggested_only',targets:[]};}});
 assert.equal(first.status,'STOPPED');assert.deepEqual(seen,[['NO','suggested_only']]);
 const resumed=await executePriceResearchBatch({...f,executeTarget:async({job})=>{seen.push([job.config.market,job.config.researchMode]);return {researchMode:'suggested_only',targets:[]};}});
 assert.equal(resumed.status,'COMPLETE');assert.equal(resumed.batchRequestCeiling,2);assert.deepEqual(seen,[['NO','suggested_only'],['SE','suggested_only']]);
 await assert.rejects(executePriceResearchBatch({...f,job:{...f.job,config:{...f.job.config,researchMode:'standard',perTargetRequestCeiling:96,batchRequestCeiling:192}},executeTarget:async()=>{throw Error('MUST_NOT_RUN');}}),/PRICE_RESEARCH_BATCH_BINDING_CHANGED/);
});

test('one-market canonical batch reaches Research-link priority adapters and persists its attempted outcome',async t=>{
 const f=fixture(t,[target('streamco','DE')]),link={id:'11111111-1111-4111-8111-111111111111',url:'https://help.streamco.example/pricing',kind:'DIRECT_SOURCE',marketScope:'GLOBAL',marketCode:null,enabled:true,truthAuthority:'NONE'},calls=[],updates=[];
 f.job.config.capabilities={direct:true,tavily:true,decodo:true,browser:false,groq:false};
 const result=await executePriceResearchBatch({...f,executeTarget:async({job,directory})=>{
  const caps=job.config.capabilities,priority=researchLinkPriorityTarget({id:`price-research:${job.config.serviceId}:${job.config.market}`,service:job.config.serviceId,serviceName:'StreamCo',market:job.config.market,operationsObjective:'PRICE_RESEARCH',researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},urls:[],leads:[],knownCommercialUrls:[],authorities:[],gaps:['plan','amount','currency','cadence','priceRole','ownership','market'],reads:[],queries:[],decisions:[],verified:[],blockedOrigins:[],researchLinks:[link],researchLinkOutcomes:[],persistedVerifiedCount:0},caps);
  const factory=await createPriceResearchAdapters({market:job.config.market,capabilities:caps,env:{DECODO_USERNAME:'fixturebase',DECODO_PASSWORD:'private-sentinel'}},{createDiscovery:async()=>({bind:()=>({search:()=>assert.fail('priority Tavily must stay disabled'),read:()=>assert.fail('priority Direct must stay disabled'),classify:async()=>({}),consumeProvider:async()=>({}),acquire:async args=>{calls.push({route:args.route,url:args.candidate.url,truthAuthority:args.candidate.authority.truthAuthority});return {classification:'CONTENT_NOT_COMMERCIAL',sourceClassification:{status:'PROVIDER_SOURCE'},verified:[],acquisitionBytes:0};}})})});
  const adapters=await factory({stage:'RESEARCH_LINK_PRIORITY',directory,targets:[priority]});
  const state=await runOpenWebResearch({...adapters,directory,targets:[priority],maxActions:1});
  for(const row of state.targets[0].researchLinkOutcomes)await recordResearchLinkResult({id:row.id,attemptedAt:row.at,result:row.result,client:{query:async(sql,args)=>{updates.push({sql,args});return {rows:[]};}}});
  return {researchLinkOutcomes:state.targets[0].researchLinkOutcomes};
 }});
 assert.equal(result.status,'COMPLETE');assert.equal(result.outcomes[0].status,'COMPLETE');
 assert.deepEqual(calls,[{route:'DECODO',url:link.url,truthAuthority:'NONE'}]);
 assert.equal(updates.length,1);assert.match(updates[0].sql,/last_used_at=\$2,last_result=\$3/);assert.equal(updates[0].args[0],link.id);assert.equal(updates[0].args[2],'PROVIDER_SOURCE_NO_VERIFIED');
 const child=JSON.parse(fs.readFileSync(path.join(f.directory,result.outcomes[0].artifactDirectory,'result.json')));assert.equal(child.researchLinkOutcomes[0].result,'PROVIDER_SOURCE_NO_VERIFIED');
});

test('invalid priority adapter stage remains a job-global batch failure',async t=>{
 const f=fixture(t,[target('streamco','DE')]);
 await assert.rejects(executePriceResearchBatch({...f,executeTarget:async({directory})=>{const factory=await createPriceResearchAdapters({market:'DE',capabilities:{direct:false,tavily:false,decodo:false,browser:false,groq:false}});return factory({stage:'UNRECOGNIZED_RESEARCH_LINK_STAGE',directory});}}),/PRICE_RESEARCH_BATCH_CHILD_FAILED/);
 const progress=readPriceResearchBatchProgress(f.job.config,f.directory);assert.equal(progress.status,'FAILED');assert.equal(progress.outcomes[0].failureCode,'UNKNOWN_ADAPTER_STAGE');assert.equal(progress.outcomes[0].failureScope,'JOB');
});

test('completed child route metadata is rebuilt for the next market after resume',async t=>{
 const f=fixture(t,[target('alpha','DE'),target('alpha','NO'),target('beta','DE')]),url='https://alpha.example/membership',body='retained provider pricing body',sha256=createHash('sha256').update(body).digest('hex');let stop=false;
 const first=await executePriceResearchBatch({...f,shouldStop:()=>stop,executeTarget:async({job,directory})=>{
  assert.equal(job.config.market,'DE');const campaign=path.join(directory,'known-service'),native=path.join(campaign,'targets','price-research:alpha:DE','open-web-discovery');fs.mkdirSync(path.join(native,'bodies'),{recursive:true});fs.writeFileSync(path.join(native,'bodies',sha256+'.txt'),body);
  const reference={observation:'source-DE',sha256},state={targets:{'price-research:alpha:DE':{service:'alpha',serviceName:'alpha',market:'DE',reads:[{url,outcome:'OK',truncated:false,bodyHash:sha256,sourceIntegrity:{sha256},bodyFile:'bodies/'+sha256+'.txt'}],decisions:[{url,eligible:true,authority:{hostname:'alpha.example',service:'alpha',validated:true}}],providerInterpretations:[{url,v3Observation:{id:reference.observation,kind:'PROVIDER',url,sha256,context:{transport:'DIRECT'}},v3Truth:{prices:{DE:{propositions:{PRICE_AMOUNT:{state:'ESTABLISHED',evidence:[{reference}]}}}}}}]}}};fs.writeFileSync(path.join(campaign,'adaptive-state.json'),JSON.stringify(state));stop=true;return {ok:true};
 }});assert.equal(first.status,'STOPPED');
 const seen=[];const resumed=await executePriceResearchBatch({...f,executeTarget:async({job,providerPricingRouteMemory})=>{seen.push({service:job.config.serviceId,market:job.config.market,routes:providerPricingRoutesForTarget(providerPricingRouteMemory,{service:job.config.serviceId,serviceName:job.config.serviceId}) .map(row=>row.url)});return {ok:true};}});
 assert.equal(resumed.status,'COMPLETE');assert.deepEqual(seen,[{service:'alpha',market:'NO',routes:[url]},{service:'beta',market:'DE',routes:[]}]);
});

test('completed priority-only AU route is recovered for NZ without replaying AU Truth',async t=>{
 const f=fixture(t,[target('max','AU'),target('max','NZ')]),url='https://www.hbomax.com/au/en',source='retained AU provider monthly pricing',sha256=createHash('sha256').update(source).digest('hex'),reference={observation:'country-v3-au',sha256};let stop=false;
 const first=await executePriceResearchBatch({...f,shouldStop:()=>stop,executeTarget:async({job,directory})=>{
  assert.equal(job.config.market,'AU');const campaign=path.join(directory,'priority-research-links'),native=path.join(campaign,'targets','price-research:max:AU','open-web-discovery'),acquisition=path.join(native,'acquisitions','retained-AU');fs.mkdirSync(path.join(acquisition,'raw'),{recursive:true});fs.writeFileSync(path.join(acquisition,'raw',sha256+'.body'),source);
  const state={targets:{'price-research:max:AU':{service:'max',serviceName:'max',market:'AU',derivedCountryCandidates:derivedCountrySourceCandidates({service:'max',market:'AU'}),reads:[],decisions:[{url,eligible:true,route:'DECODO',acquisitionReserved:true}],acquisitionOutcomes:[{url,runDirectory:acquisition,sourceHash:sha256,sourceClassification:{status:'PROVIDER_SOURCE',finalUrl:url,sourceHash:sha256},countryV3Evaluation:{status:'EVALUATED',sourceHash:sha256,receiptStatus:'HASH_VERIFIED',geoClass:'G1'}}],providerInterpretations:[{url,v3Observation:{id:reference.observation,kind:'PROVIDER',url,sha256,context:{transport:'DECODO',networkGeography:'AU'}},v3Truth:{established:true,prices:{AU:{established:true,propositions:{PRICE_AMOUNT:{state:'ESTABLISHED',evidence:[{value:11.99,reference}]},CURRENCY:{state:'ESTABLISHED',evidence:[{value:'AUD',reference}]},MONTHLY_CADENCE:{state:'ESTABLISHED',evidence:[{value:true,reference}]}}}}}}]}}};fs.writeFileSync(path.join(campaign,'adaptive-state.json'),JSON.stringify(state));stop=true;return {verified:3};
 }});assert.equal(first.status,'STOPPED');
 const resumed=await executePriceResearchBatch({...f,executeTarget:async({job,providerPricingRouteMemory})=>{
  assert.equal(job.config.market,'NZ');const routes=providerPricingRoutesForTarget(providerPricingRouteMemory,{service:'max',serviceName:'max',market:'NZ',derivedCountryCandidates:derivedCountrySourceCandidates({service:'max',market:'NZ'})});assert.deepEqual(routes.map(row=>row.url),['https://www.hbomax.com/nz/en']);assert.equal(JSON.stringify(routes).includes(sha256),false);assert.equal(routes[0].sources,undefined);return {verified:2};
 }});assert.equal(resumed.status,'COMPLETE');
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

test('typed target failure retains artifacts and continues later targets with exact checkpoint counts',async t=>{
 const f=fixture(t),order=[],result=await executePriceResearchBatch({...f,executeTarget:async({job,directory})=>{const id=job.config.serviceId+':'+job.config.market;order.push(id);fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,'research-artifact.json'),JSON.stringify({id}));if(id==='alpha:NO')throw new TargetResearchFailure('DIRECT_PROVIDER_AUTHORITY_REQUIRED');return {id,verified:[id]};}});
 assert.equal(result.status,'COMPLETE');assert.equal(result.nextIndex,3);assert.equal(result.batchRequestCeiling,288);assert.deepEqual(result.outcomes.map(row=>[row.status,row.failureCode??null,row.failureScope??null]),[['COMPLETE',null,null],['FAILED','DIRECT_PROVIDER_AUTHORITY_REQUIRED','TARGET'],['COMPLETE',null,null]]);
 assert.deepEqual(order,['alpha:DE','alpha:NO','beta:DE']);assert.equal(fs.existsSync(path.join(f.directory,result.outcomes[1].artifactDirectory,'research-artifact.json')),true);assert.equal(fs.existsSync(path.join(f.directory,result.outcomes[1].artifactDirectory,'result.json')),false);
 const events=fs.readFileSync(path.join(f.directory,'price-research-batch-progress.jsonl'),'utf8').trim().split('\n').map(JSON.parse);assert.deepEqual(events.filter(row=>row.status==='FAILED').map(row=>[row.index,row.failureCode,row.failureScope]),[[1,'DIRECT_PROVIDER_AUTHORITY_REQUIRED','TARGET']]);assert.equal(events.filter(row=>row.status==='COMPLETE').length,2);
 const recovered=await executePriceResearchBatch({...f,executeTarget:async()=>{throw Error('DUPLICATE_EXECUTION');}});assert.equal(recovered.status,'COMPLETE');assert.deepEqual(order,['alpha:DE','alpha:NO','beta:DE']);
});

test('interrupted legacy target-local failure resumes pending targets without changing completed or failed history',async t=>{
 const f=fixture(t,[target('alpha','DE'),target('alpha','NO'),target('beta','DE'),target('beta','NO')]),order=[];
 await assert.rejects(executePriceResearchBatch({...f,executeTarget:async({job})=>{const id=job.config.serviceId+':'+job.config.market;order.push(id);if(id==='alpha:NO')throw Error('DIRECT_PROVIDER_AUTHORITY_REQUIRED');return {id,verificationEvidence:[{targetMarket:job.config.market,plan:'Gold'}]};}}),/PRICE_RESEARCH_BATCH_CHILD_FAILED/);
 const journal=path.join(f.directory,'price-research-batch-progress.jsonl'),events=fs.readFileSync(journal,'utf8').trim().split('\n').map(JSON.parse);delete events.at(-1).failureScope;fs.writeFileSync(journal,events.map(row=>JSON.stringify(row)).join('\n')+'\n');
 await assert.rejects(executePriceResearchBatch({...f,executeTarget:async()=>{throw Error('MUST_NOT_RUN');}}),/PRICE_RESEARCH_BATCH_CHILD_FAILED/);
 const blockedUrl='https://provider.example/register?returnUrl=/',retryJournal=path.join(f.directory,'price-research-targets','02-alpha-NO','known-service-v3-verification-retry-1','targets','price-research:alpha:NO','open-web-discovery','journal.jsonl');fs.mkdirSync(path.dirname(retryJournal),{recursive:true});fs.writeFileSync(retryJournal,JSON.stringify({type:'ACTION_RESULT',action:{type:'READ',target:'price-research:alpha:NO',url:blockedUrl},response:{requestedUrl:blockedUrl,outcome:'ACCESS_CONTROL_STOP',failure:{code:'ROBOTS_ACCESS_STOP'}}})+'\n');
 const firstFile=path.join(f.directory,'price-research-targets','01-alpha-DE','result.json'),firstBytes=fs.readFileSync(firstFile),before=readPriceResearchBatchProgress(f.job.config,f.directory);assert.equal(before.status,'FAILED');assert.equal(before.nextIndex,1);
 const resumed=await executePriceResearchBatch({...f,executeTarget:async({job})=>{const id=job.config.serviceId+':'+job.config.market;order.push(id);if(id==='beta:DE')throw new TargetResearchFailure('SOURCE_REVIEW_REQUIRED');return {id,verified:[id]};}});
 assert.equal(resumed.status,'COMPLETE');assert.equal(resumed.nextIndex,4);assert.equal(resumed.batchRequestCeiling,384);assert.deepEqual(order,['alpha:DE','alpha:NO','beta:DE','beta:NO']);assert.deepEqual(resumed.outcomes.map(row=>row.status),['COMPLETE','FAILED','FAILED','COMPLETE']);assert.deepEqual(fs.readFileSync(firstFile),firstBytes);assert.deepEqual(JSON.parse(firstBytes).verificationEvidence,[{targetMarket:'DE',plan:'Gold'}]);assert.equal(resumed.outcomes[1].failureCode,'DIRECT_PROVIDER_AUTHORITY_REQUIRED');assert.equal(resumed.outcomes[2].failureCode,'SOURCE_REVIEW_REQUIRED');assert.equal(fs.readFileSync(journal,'utf8').trim().split('\n').filter(line=>JSON.parse(line).index===1&&JSON.parse(line).status==='FAILED').length,1);
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
