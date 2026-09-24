import test,{after} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {retainedPriceReview} from './open-web-discovery.mjs';
import {retainedSuccesses} from './retained-success.mjs';
import {currentRetainedPriceReview} from './retained-pricing.mjs';
import {createResearchMemory} from './research-memory.mjs';
import {applyPriceQuarantine} from '../inventory/reviewed-cohort-execution.mjs';
import {initializeAdaptiveState,assessAdaptiveService,runAdaptiveCampaign} from '../inventory/adaptive-campaign.mjs';
import {writeLifecycleDisposition} from '../inventory/lifecycle-continuation.mjs';
import {planResearch} from './research-planner.mjs';
import {runExpansionCampaign} from '../inventory/expansion-campaign.mjs';
import {positiveProviderAmount} from '../intelligence/recurring-price-eligibility.mjs';
const cwd=process.cwd(),root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'retained-price-policy-')));process.chdir(root);after(()=>{process.chdir(cwd);fs.rmSync(root,{recursive:true});});
const sha=x=>createHash('sha256').update(x).digest('hex'),hash='a'.repeat(64),url='https://provider.example/plans';
const target=()=>({id:'fixture-price-DE',service:'fixture',serviceName:'Fixture',market:'DE',researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},authorities:[{hostname:'provider.example',provider:'Fixture',sourceType:'OFFICIAL_PROVIDER',checkedAt:'2026-01-01'}],urls:[url],verified:[],reads:[],queries:[],decisions:[],capabilities:{direct:true,tavily:true,decodo:false,browser:false,groq:false}});
const observation=(amount='12',confidence='HIGH',plan='Basic')=>({service:'fixture',market:'DE',plan,amount,currency:'EUR',confidence,source:{kind:'ORIGINAL_PROVIDER',hash,url},billingInterval:{normalized:'P1M'},fields:{provenance:{status:'ESTABLISHED'}},blockers:[]});
let counter=0;
function artifact(rows){const dir=root+'/source-'+counter++;fs.mkdirSync(dir+'/interpretation-0001',{recursive:true});const file=dir+'/interpretation-0001/provider-price-intelligence.json';fs.writeFileSync(file,JSON.stringify({observations:rows}));return {dir,file};}
function remembered(t,rows,capturedAt='2026-09-20'){const doc={summary:{service:t.service,market:t.market,hash},receipt:{intact:true,serviceEstablished:true},observations:rows},file=root+'/memory-'+counter+++'.json';fs.writeFileSync(file,JSON.stringify(doc));t.researchMemory=createResearchMemory({...t,reads:[{requestedUrl:url,outcome:'OK',bodyHash:hash,sourceIntegrity:{checkedAt:capturedAt}}]},{path:file,hash:sha(fs.readFileSync(file))});return t;}
const assess=t=>assessAdaptiveService(initializeAdaptiveState({targets:[t],conditionalFollowupTargets:[]}),t.service);
function final(t){const dir=root+'/final-'+counter++;fs.mkdirSync(dir);return writeLifecycleDisposition({directory:dir,handoff:{cohort:{manifest:{serviceIds:[t.service]}},targets:[t]},phases:{pricing:{targets:{[t.id]:t},services:{}}},events:[],bootstrap:[],researchMarkets:{fixture:['DE']},executionComplete:true})[0];}
for(const value of [0,'0','0.00','00.000'])for(const confidence of ['HIGH','MEDIUM'])test('zero cannot survive retained summary or reuse: '+value+'/'+confidence,()=>{const t=target(),rows=[observation(value,confidence)],a=artifact(rows);assert(!positiveProviderAmount(value));assert.equal(retainedPriceReview(a.dir,t),null);remembered(t,rows);assert.equal(retainedSuccesses(t)[0].sufficient,null);t.retainedPriceReview={sourceBound:true,confidence,sourceHash:hash,artifact:a.file};assert.equal(currentRetainedPriceReview(t),null);assert.notEqual(assess(t).stop?.reason,confidence+'_SUFFICIENT');assert.equal(final(t).pricing[0].status,'UNRESOLVED');assert.equal(JSON.parse(fs.readFileSync(a.file)).observations.length,1);});
for(const confidence of ['HIGH','MEDIUM'])test('quarantine dominates raw interpretation, cached review, sufficiency and final disposition: '+confidence,()=>{
 const t=target(),o=observation('12',confidence),a=artifact([o]),verified={...o,monthlyPlanId:'p',sourceHashes:[hash],status:'V2_VERIFIED'};t.verified=[verified];
 const review=retainedPriceReview(a.dir,t);assert.equal(review.confidence,confidence);t.retainedPriceReview=review;assert.equal(assess(t).stop.reason,confidence+'_SUFFICIENT');
 const before=fs.readFileSync(a.file,'utf8');assert.equal(applyPriceQuarantine(t,[{...verified,service:t.service,market:t.market}]),1);assert.equal(t.verified.length,0);assert.equal(t.retainedPriceReview,undefined);assert.equal(retainedPriceReview(a.dir,t),null);
 t.retainedPriceReview=review;assert.equal(currentRetainedPriceReview(t),null);remembered(t,[o]);assert.equal(retainedSuccesses(t)[0].sufficient,null);assert.notEqual(assess(t).stop?.reason,confidence+'_SUFFICIENT');assert.equal(final(t).pricing[0].status,'UNRESOLVED');assert.equal(fs.readFileSync(a.file,'utf8'),before);
});
test('a quarantined offer does not erase another eligible plan or annual price',()=>{const t=target(),bad=observation(),good={...observation('120','MEDIUM','Annual'),billingInterval:{normalized:'P1Y'}};t.quarantinedVerified=[{value:{...bad,sourceHashes:[hash]}}];const a=artifact([bad,good]);assert.equal(retainedPriceReview(a.dir,t).plan,'Annual');assert.equal(retainedPriceReview(a.dir,t).confidence,'MEDIUM');});
test('staleness, source invalidation and authority rejection cannot resurrect reuse',()=>{for(const kind of ['stale','invalidated','authority']){const t=remembered(target(),[observation()],'2020-01-01');if(kind==='stale')t.researchAsOf='2026-09-24';if(kind==='invalidated')t.invalidatedEvidence=[hash];if(kind==='authority')t.authorities=[];assert.equal(retainedSuccesses(t)[0]?.sufficient??null,null);}});
test('eligible positive reuse stays local and preserves budgets and history',()=>{const t=remembered(target(),[observation('12','MEDIUM')]);t.priorUsage={reads:5,searches:2};const before=JSON.stringify(t);const r=retainedSuccesses(t)[0];assert(r.intact);assert.equal(r.sufficient.confidence,'MEDIUM');assert.equal(JSON.stringify(t),before);});
test('legacy summary resolves its positive local observation; absent amount/evidence is not eligibility',()=>{const t=target(),a=artifact([observation()]);t.retainedPriceReview={sourceBound:true,confidence:'HIGH',sourceHash:hash,artifact:a.file};assert.equal(currentRetainedPriceReview(t).amount,'12');delete t.retainedPriceReview.artifact;assert.equal(currentRetainedPriceReview(t),null);});
test('stale cached summary stays stale; invalidation blocks direct artifact reconstruction',()=>{const t=target(),a=artifact([observation()]);t.retainedPriceReview={sourceBound:true,confidence:'HIGH',artifact:a.file,sourceHash:hash,stale:true};assert.equal(currentRetainedPriceReview(t),null);t.invalidatedEvidence=[hash];assert.equal(retainedPriceReview(a.dir,t),null);});
test('qualified same-price scopes remain distinct from a quarantined scope',()=>{const t=target(),a={...observation(),scope:{location:{value:'A'}}},b={...observation(),scope:{location:{value:'B'}}};t.quarantinedVerified=[{value:{...a,sourceHashes:[hash]}}];const f=artifact([a,b]);assert.equal(retainedPriceReview(f.dir,t).scope.location.value,'B');});
test('zero stored verified state does not appear as a final eligible provider price',()=>{const t=target();t.verified=[{...observation('0'),sourceHashes:[hash],status:'V2_VERIFIED'}];const before=JSON.stringify(t.verified),row=final(t);assert.equal(row.pricing[0].status,'UNRESOLVED');assert.deepEqual(row.pricing[0].observations,[]);assert.equal(JSON.stringify(t.verified),before);});

for(const confidence of ['HIGH','MEDIUM'])test('positive retained '+confidence+' reaches adaptive sufficiency with zero external calls',async()=>{
 const t=remembered({...target(),adaptiveExecution:true},[observation('12',confidence)]);let calls=0;
 const forbidden=async()=>{calls++;throw Error('UNEXPECTED_EXTERNAL_WORK');};
 const s=await runAdaptiveCampaign({directory:root+'/positive-reuse-'+counter++,manifest:{targets:[t],conditionalFollowupTargets:[]},createAdapters:async()=>({read:forbidden,search:forbidden,classify:forbidden,acquire:forbidden})});
 assert.equal(calls,0);assert.equal(s.services.fixture.stop.reason,confidence+'_SUFFICIENT');assert.equal(s.services.fixture.used.reads,0);assert.equal(s.services.fixture.used.searches,0);
});
test('positive qualified sufficiency preserves user-price-preferred policy',()=>{const t=target(),a=artifact([observation('12','MEDIUM')]);t.priceStrategy='USER_PRICE_PREFERRED';t.retainedPriceReview=retainedPriceReview(a.dir,t);assert.equal(assess(t).stop.reason,'USER_PRICE_PREFERRED_SUFFICIENT');});
test('no provider price and zero-only evidence retain the service disposition',()=>{for(const rows of [[],[observation('0')]]){const t=target(),a=artifact(rows);t.retainedPriceReview=retainedPriceReview(a.dir,t);const row=final(t);assert.equal(row.service_id,t.service);assert.equal(row.providerAuthority.status,'ESTABLISHED');assert.equal(row.pricing[0].status,'UNRESOLVED');}});

test('positive retained service coverage stops routing without asserting a national default',()=>{
 const t=target(),a=artifact([observation('12','MEDIUM')]);t.priceStrategy='USER_PRICE_PREFERRED';t.retainedPriceReview=retainedPriceReview(a.dir,t);
 const p=planResearch(t);assert.equal(p.route,'RETAINED_SUFFICIENT');assert.equal(p.marketApplicabilityEstablished,false);
 delete t.retainedPriceReview;assert.equal(planResearch(t,{retained:{confidence:'HIGH'}}).route,'DIRECT');
});
test('retained positive interpreter output remains service and market bound',()=>{
 const t={...target(),researchObjective:'PRICING'},a=artifact([observation()]);
 assert.equal(retainedPriceReview(a.dir,t).confidence,'HIGH');assert.equal(retainedPriceReview(a.dir,{...t,service:'other'}),null);assert.equal(retainedPriceReview(a.dir,{...t,market:'NO'}),null);
});
test('one positive service-coverage claim avoids subsequent market acquisition without overwriting its price',async()=>{
 const first={...target(),id:'first'},second={...target(),id:'second',market:'US'},calls=[],a=artifact([observation()]);
 const args={directory:root+'/carry-forward-'+counter++,targets:[second,first],catalog:[first,second],preparedPriorityBatches:[[first.id],[second.id]],createAdapters:async()=>({read:async x=>{calls.push(x.target.id);return {url:x.url,outcome:'OK',body:'fixture'};},search:async()=>({results:[]}),classify:async()=>({eligible:true}),consumeProvider:async()=>({verified:[],runDirectory:a.dir,monetary:1,needsGeo:true}),acquire:async()=>{throw Error('SUFFICIENT_DIRECT_MUST_NOT_ESCALATE');}})};
 const r=await runExpansionCampaign(args);assert.deepEqual(calls,['first']);assert.equal(r.results[1].status,'SOURCE_BOUND_PRICE_ALREADY_AVAILABLE');assert.equal(r.results[1].retainedPriceReview.market,'DE');assert.equal(r.results[1].retainedPriceReview.amount,'12');assert.equal(r.results[1].verified.length,0);
 await runExpansionCampaign(args);assert.deepEqual(calls,['first']);
});
