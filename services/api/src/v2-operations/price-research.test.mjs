import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Operations} from './control.mjs';
import {executePriceResearch,priceResearchPlan,reviewedNamespacePriceResearchSeed,runBoundedV3Verification,priorityRetainedV3Evidence} from './price-research.mjs';
import {runAdminV4FirstResearch} from '../google-ai/admin-live-pipeline.mjs';
import {reviewedProviderNamespacesFor} from '../research-v3/reviewed-provider-namespaces.mjs';
import {applyResearchHandoff} from '../research-v2/inventory/reviewed-cohort-execution.mjs';
import {perTargetRequestCeiling} from './price-research-mode.mjs';
import {readAvailabilitySearch} from './market-availability-search-memory.mjs';

const caps={direct:false,tavily:false,decodo:false,browser:false,groq:false};
test('unresolved priority V3 evidence crosses phases only with the exact retained source hash',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'price-research-priority-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const directory=path.join(root,'priority-research-links','acquisition'),body='<html>Provider source</html>',sha=value=>createHash('sha256').update(value).digest('hex'),hash=sha(body),observation={id:'country-source',url:'https://help.example.com/plans',sha256:hash,context:{transport:'DECODO',networkGeography:'NO'}},truth={needs:[{proposition:'PRICE_AMOUNT',state:'UNRESOLVED'}],offers:[],eligibility:{NO:{result:'UNRESOLVED'}}},target={id:'example-NO',service:'example',market:'NO'};
 fs.mkdirSync(path.join(directory,'raw'),{recursive:true});fs.writeFileSync(path.join(directory,'raw',hash+'.body'),body);
 const lead={url:'https://help.example.com/next',sourceBoundCandidate:true,truthAuthority:'NONE',authoritative:false,from:{bodyHash:hash,observation:observation.id},source:{start:6,end:14,sha256:sha(body.slice(6,14))}},priorityState={targets:{[target.id]:{v3Observation:observation,v3Truth:truth,leads:[lead],acquisitionOutcomes:[{researchLinkId:'link',sourceHash:hash,sourceClassification:{status:'PROVIDER_SOURCE',finalUrl:observation.url},countryV3Evaluation:{status:'EVALUATED',receiptStatus:'HASH_VERIFIED',geoClass:'G1'},runDirectory:directory}]}}};
 const evidence=priorityRetainedV3Evidence({priorityState,target,root});assert.deepEqual(evidence.v3Truth,truth);assert.equal(evidence.leads.length,1);assert.equal(evidence.v3Observation.sha256,hash);
 const downstream=applyResearchHandoff({...target,serviceName:'Example',...evidence},{kind:'V4_TO_V3_RESEARCH_HANDOFF',provider:'Example',targetMarket:'NO',researchLeads:{candidatePlans:[]},adaptiveTargetPatch:{urls:['https://example.com/plans'],leads:[{url:'https://example.com/plans',truthAuthority:'NONE',authoritative:false}],researchCandidateLineage:[]}});
 assert.deepEqual(downstream.v3Truth,truth);assert.equal(downstream.v3Observation.sha256,hash);assert.deepEqual(downstream.leads.map(row=>row.url),[lead.url,'https://example.com/plans']);
 fs.writeFileSync(path.join(directory,'raw',hash+'.body'),'tampered');assert.equal(priorityRetainedV3Evidence({priorityState,target,root}),null);
});
const fixture=t=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'price-research-operations-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return new Operations({repo:process.cwd(),root:path.join(root,'.savlivo/v2-operations'),lifecycleInput:null,read:true,control:true,scheduling:false,timezone:'Europe/Oslo',client:{query:async()=>({rows:[]})},marketExclusions:[],env:{},runtimeReadiness:{readGemini:async()=>null}});};

test('unknown provider seed requires explicit identity-discovery choice before Preflight or Start',async t=>{
 const ops=fixture(t),input={objective:'PRICE_RESEARCH',targetKind:'PROVIDER_OR_BRAND_SEED',seedName:'Unlisted Brand',market:'DE',capabilities:caps};
 await assert.rejects(ops.preflight(input,'admin'),/IDENTITY_DISCOVERY_CONSENT_REQUIRED/);
 await assert.rejects(ops.preflight({...input,identityDiscoveryConsent:false},'admin'),/IDENTITY_DISCOVERY_CONSENT_REQUIRED/);
 assert.equal(ops.db().preflights.length,0);assert.equal(ops.db().jobs.length,0);
 await assert.rejects(executePriceResearch({job:{config:input}}),/IDENTITY_DISCOVERY_CONSENT_REQUIRED/);
 const pre=await ops.preflight({...input,identityDiscoveryConsent:true},'admin');assert.equal(pre.runner,'PRICE_RESEARCH explicit provider identity discovery');assert.equal(pre.identityDiscovery.status,'UNKNOWN_SERVICE_SEED');assert.equal(pre.identityDiscovery.initialDiscoveryCanConsumeRequests,true);assert.equal(pre.servicesConsidered,1);const stored=ops.db().preflights[0];assert.equal(stored.config.seedName,'Unlisted Brand');assert.equal(stored.config.identityDiscoveryConsent,true);assert.equal(Object.hasOwn(stored.config,'serviceId'),false);
 const job=await ops.start(pre.token,'admin',true);assert.equal(job.config.objective,'PRICE_RESEARCH');assert.equal(job.config.targetKind,'PROVIDER_OR_BRAND_SEED');assert.equal(job.status,'QUEUED');
});

test('known canonical baseline, product and frozen identities are admitted to PRICE_RESEARCH; free text and malformed market are rejected',async t=>{
 const ops=fixture(t);for(const serviceId of ['strava','1password','chess-com']){const pre=await ops.preflight({objective:'PRICE_RESEARCH',targetKind:'KNOWN_SERVICE',serviceId,market:'DE',capabilities:caps},'admin');assert.equal(pre.servicesConsidered,1);assert.equal(ops.db().preflights.at(-1).config.serviceId,serviceId);}
 await assert.rejects(ops.preflight({objective:'PRICE_RESEARCH',targetKind:'KNOWN_SERVICE',serviceId:'chess-com',market:'DE',identityDiscoveryConsent:true,capabilities:caps},'admin'),/INVALID_PRICE_RESEARCH_IDENTITY/);
 await assert.rejects(ops.preflight({objective:'PRICE_RESEARCH',targetKind:'KNOWN_SERVICE',serviceId:'Strava subscription',market:'DE',capabilities:caps},'admin'));
 await assert.rejects(ops.preflight({objective:'PRICE_RESEARCH',targetKind:'PROVIDER_OR_BRAND_SEED',seedName:'Brand',market:'Germany',capabilities:caps},'admin'),/INVALID_PRICE_RESEARCH_MARKET/);
});

const lifecycleInput='docs/catalog/global-47/research-v2/v15-mature-handoff-20260921/lifecycle-input.json';
function batchFixture(t,databaseIdentities=[]){const root=fs.mkdtempSync(path.join(os.tmpdir(),'price-research-batch-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return new Operations({repo:process.cwd(),root,lifecycleInput,read:true,control:true,scheduling:false,timezone:'Europe/Oslo',databaseIdentities,marketExclusions:[],env:{},runtimeReadiness:{readGemini:async()=>null}});}
const dbIdentity=id=>({research_service_id:id,canonical_slug:id.replace(/^research-/,''),canonical_name:id,normalized_name:id,identity_type:'Service',status:'RESEARCHABLE',aliases:[],provider_host:'provider.example',provider_binding_digest:'a'.repeat(64),provider_observation:'observation',source_url:'https://provider.example',source_body_sha256:'b'.repeat(64),relationship:'PROVIDER_PRESENTS_SERVICE',extraction_mechanism:'STRUCTURED_DATA',admission_version:1,created_at:'2026-10-14T00:00:00.000Z',updated_at:'2026-10-14T00:00:00.000Z'});

test('canonical selection Preflight freezes the exact complete scope and Start queues only that scope',async t=>{
 const ops=batchFixture(t),targeting=await ops.priceResearchTargeting({services:['chess-com','1password'],markets:['DE','NO']}),input={objective:'PRICE_RESEARCH',targetKind:'CANONICAL_SELECTION',services:['chess-com','1password'],markets:['DE','NO'],targetingRevision:targeting.revision,capabilities:caps};
 const pre=await ops.preflight(input,'admin');assert.equal(pre.logicalTargetCount,4);assert.equal(pre.batchTargetCount,4);assert.equal(pre.perTargetRequestCeiling,96);assert.equal(pre.totalSafetyCeiling,384);assert.equal(pre.continuationCursor,null);
 const stored=ops.db().preflights[0].config;assert.deepEqual(stored.batchTargets.map(row=>[row.serviceId,row.targetMarket]),[['1password','DE'],['1password','NO'],['chess-com','DE'],['chess-com','NO']]);assert(stored.batchTargets.every(row=>row.marketApplicabilityEstablished===false));
 const job=await ops.start(pre.token,'admin',true);assert.equal(job.status,'QUEUED');assert.deepEqual(job.config,stored);assert.equal((await ops.start(pre.token,'admin',true)).id,job.id);assert.equal(ops.db().jobs.length,1);const manifest=JSON.parse(fs.readFileSync(path.join(ops.config.root,'runs',job.id,'manifest.json')));assert.equal(manifest.targets.length,4);assert.equal(manifest.limits.perTargetRequests,96);assert.equal(manifest.limits.totalRequests,384);assert(manifest.targets.every(row=>row.marketApplicabilityEstablished===false));
});

test('official unavailable proof excludes targets before Preflight and freezes the evidence without paid attempts',async t=>{
 const ops=batchFixture(t),proof={version:1,serviceId:'chess-com',sourceUrl:'https://chess.com/availability',sourceHash:'a'.repeat(64),checkedAt:new Date().toISOString(),unavailableMarkets:['CN'],basis:'OFFICIAL_EXPLICIT_OR_EXHAUSTIVE_COVERAGE'};
 ops.config.marketAvailability=[proof];
 const targeting=await ops.priceResearchTargeting({services:['chess-com','1password'],markets:['CN','NO']});
 assert.equal(targeting.autoSkippedTargetCount,1);assert.equal(targeting.serviceMarketTargets,3);
 assert.deepEqual(targeting.targets.map(row=>[row.serviceId,row.targetMarket]),[['1password','CN'],['1password','NO'],['chess-com','NO']]);
 const pre=await ops.preflight({objective:'PRICE_RESEARCH',targetKind:'CANONICAL_SELECTION',services:['chess-com','1password'],markets:['CN','NO'],targetingRevision:targeting.revision,capabilities:caps},'admin');
 assert.equal(pre.batchTargetCount,3);assert.equal(pre.totalSafetyCeiling,288);assert.deepEqual(pre.autoSkippedPairs.map(row=>[row.serviceId,row.market]),[['chess-com','CN']]);
 const job=await ops.start(pre.token,'admin',true),manifest=JSON.parse(fs.readFileSync(path.join(ops.config.root,'runs',job.id,'manifest.json')));
 assert.equal(manifest.targets.length,3);assert.deepEqual(manifest.priceResearch.availabilityProofs,[proof]);
 assert(!manifest.targets.some(row=>row.service==='chess-com'&&row.market==='CN'));
 await assert.rejects(ops.preflight({objective:'PRICE_RESEARCH',targetKind:'KNOWN_SERVICE',serviceId:'chess-com',market:'CN',capabilities:caps},'admin'),/PRICE_RESEARCH_MARKET_UNAVAILABLE/);
 assert.equal(ops.db().jobs.length,1);
});

test('Preflight spends at most one availability lead search and freezes newly proven skips before Start',async t=>{
 const ops=batchFixture(t),url='https://www.max.com/availability',body='<html lang="en"><title>Where is Max available?</title><h2>Max is not available in:</h2><ul><li>China</li></ul></html>';
 let paidCalls=0;
 ops.config.availabilityDiscovery=true;ops.config.availabilityPaidSearch=true;
 ops.config.availabilityOptions={search:async()=>({results:[]}),paidSearch:async()=>{paidCalls++;return {results:[{title:'Max available countries',url}]};},
  read:async()=>({outcome:'OK',httpStatus:200,url,checkedAt:new Date().toISOString(),rawSource:{text:body},sourceIntegrity:{sha256:createHash('sha256').update(body).digest('hex')},accessDecisions:[{decision:'ALLOWED'}]})};
 const scope={services:['max'],markets:['CN','NO']},preview=await ops.priceResearchTargeting(scope);
 assert.equal(preview.serviceMarketTargets,2);assert.equal(paidCalls,0);
 const pre=await ops.preflight({objective:'PRICE_RESEARCH',targetKind:'CANONICAL_SELECTION',...scope,targetingRevision:preview.revision,capabilities:caps},'admin');
 assert.equal(paidCalls,1);assert.equal(pre.batchTargetCount,1);assert.deepEqual(pre.autoSkippedPairs.map(row=>row.market),['CN']);
 assert.equal(readAvailabilitySearch(ops.config.root,'max').status,'COMPLETE');
 const job=await ops.start(pre.token,'admin',true);assert.equal(job.status,'QUEUED');assert.equal(job.config.batchTargets.length,1);assert.equal(job.config.batchTargets[0].targetMarket,'NO');assert.equal(paidCalls,1);
});

test('changed official availability evidence makes Start require a new Preflight',async t=>{
 const ops=batchFixture(t),proof={version:1,serviceId:'chess-com',sourceUrl:'https://chess.com/availability',sourceHash:'a'.repeat(64),checkedAt:new Date().toISOString(),unavailableMarkets:['CN']};
 ops.config.marketAvailability=[proof];
 const scope={services:['chess-com'],markets:['CN','NO']},targeting=await ops.priceResearchTargeting(scope);
 const pre=await ops.preflight({objective:'PRICE_RESEARCH',targetKind:'CANONICAL_SELECTION',...scope,targetingRevision:targeting.revision,capabilities:caps},'admin');
 ops.config.marketAvailability=[{...proof,unavailableMarkets:['CN','NO']}];
 await assert.rejects(ops.start(pre.token,'admin',true),/TARGETING_STALE|PREFLIGHT_STALE|NO_ELIGIBLE_PRICE_RESEARCH_TARGETS/);
 assert.equal(ops.db().jobs.length,0);
});

test('Suggested Only preflight freezes two markets, at most two Google requests each, and disables expensive capabilities',async t=>{
 const ops=batchFixture(t);ops.config.env.GEMINI_API_KEY='offline-test-key';
 const targeting=await ops.priceResearchTargeting({services:['chess-com'],markets:['NO','SE']});
 const input={objective:'PRICE_RESEARCH',targetKind:'CANONICAL_SELECTION',services:['chess-com'],markets:['NO','SE'],targetingRevision:targeting.revision,researchMode:'suggested_only',capabilities:{direct:true,tavily:true,decodo:true,browser:true,groq:true}};
 const pre=await ops.preflight(input,'admin');assert.equal(pre.liveReady,true);assert.equal(pre.batchTargetCount,2);assert.equal(pre.perTargetRequestCeiling,2);assert.equal(pre.totalSafetyCeiling,4);
 const job=await ops.start(pre.token,'admin',true);assert.equal(job.config.researchMode,'suggested_only');assert.equal(job.config.batchRequestCeiling,4);assert.deepEqual(job.config.capabilities,caps);
 const manifest=JSON.parse(fs.readFileSync(path.join(ops.config.root,'runs',job.id,'manifest.json')));
 assert.equal(manifest.priceResearch.researchMode,'suggested_only');assert.deepEqual(manifest.limits,{perTargetRequests:2,totalRequests:4});
 await assert.rejects(ops.preflight({...input,researchMode:'invalid'},'admin'),/INVALID_PRICE_RESEARCH_MODE/);
 await assert.rejects(ops.preflight({objective:'PRICE_RESEARCH',targetKind:'PROVIDER_OR_BRAND_SEED',seedName:'Unlisted Brand',market:'NO',identityDiscoveryConsent:true,researchMode:'suggested_only',capabilities:caps},'admin'),/SUGGESTED_ONLY_REQUIRES_KNOWN_SERVICE/);
});

test('new single-market Suggested Only jobs freeze two calls; older jobs without a ceiling retain one',async t=>{
 const ops=fixture(t);ops.config.env.GEMINI_API_KEY='offline-test-key';
 const input={objective:'PRICE_RESEARCH',targetKind:'KNOWN_SERVICE',serviceId:'chess-com',market:'NO',researchMode:'suggested_only',capabilities:caps};
 const pre=await ops.preflight(input,'admin');
 assert.equal(pre.totalSafetyCeiling,2);
 const job=await ops.start(pre.token,'admin',true);
 assert.equal(job.config.perTargetRequestCeiling,2);
 assert.equal(perTargetRequestCeiling(job.config),2);
 assert.equal(perTargetRequestCeiling({...job.config,perTargetRequestCeiling:undefined}),1);
});

test('exclusions filter Preflight, freeze only eligible targets, and preserve existing job snapshots',async t=>{
 const ops=batchFixture(t),exclusions=ops.config.marketExclusions;
 exclusions.push({service_id:'chess-com',market_code:'IN',reason:null});
 const input={objective:'PRICE_RESEARCH',targetKind:'CANONICAL_SELECTION',services:['chess-com','1password'],markets:['IN','NO'],capabilities:caps};
 const targeting=await ops.priceResearchTargeting({services:input.services,markets:input.markets});
 assert.equal(targeting.excludedTargetCount,1);assert.equal(targeting.serviceMarketTargets,3);
 const pre=await ops.preflight({...input,targetingRevision:targeting.revision},'admin');
 assert.equal(pre.logicalTargetCount,3);assert.equal(pre.batchTargetCount,3);assert.equal(pre.totalSafetyCeiling,288);
 assert.deepEqual(ops.db().preflights[0].config.batchTargets.map(row=>[row.serviceId,row.targetMarket]),[['1password','IN'],['1password','NO'],['chess-com','NO']]);
 const job=await ops.start(pre.token,'admin',true);assert.equal(job.config.batchTargets.length,3);
 exclusions.push({service_id:'chess-com',market_code:'NO',reason:null});
 assert.equal(ops.db().jobs[0].config.batchTargets.length,3);
 assert.deepEqual(ops.db().jobs[0].config.batchTargets.map(row=>row.targetMarket),['IN','NO','NO']);
 const next=await ops.priceResearchTargeting({services:input.services,markets:input.markets});assert.equal(next.serviceMarketTargets,2);
 const nextPre=await ops.preflight({...input,targetingRevision:next.revision},'admin');assert.equal(nextPre.batchTargetCount,2);
});

test('an exclusion added after Preflight blocks Start before any research job is queued',async t=>{
 const ops=batchFixture(t),input={objective:'PRICE_RESEARCH',targetKind:'CANONICAL_SELECTION',services:['chess-com'],markets:['IN'],capabilities:caps};
 const targeting=await ops.priceResearchTargeting({services:input.services,markets:input.markets}),pre=await ops.preflight({...input,targetingRevision:targeting.revision},'admin');
 ops.config.marketExclusions.push({service_id:'chess-com',market_code:'IN',reason:null});
 await assert.rejects(ops.start(pre.token,'admin',true),/TARGETING_STALE/);assert.equal(ops.db().jobs.length,0);
 const excluded=await ops.priceResearchTargeting({services:input.services,markets:input.markets});
 await assert.rejects(ops.preflight({...input,targetingRevision:excluded.revision},'admin'),/PRICE_RESEARCH_MARKET_EXCLUDED/);
});

test('known-service single-market Preflight rejects exclusion and re-inclusion restores eligibility',async t=>{
 const ops=fixture(t),input={objective:'PRICE_RESEARCH',targetKind:'KNOWN_SERVICE',serviceId:'chess-com',market:'IN',capabilities:caps};
 ops.config.marketExclusions.push({service_id:'chess-com',market_code:'IN',reason:null});
 await assert.rejects(ops.preflight(input,'admin'),/PRICE_RESEARCH_MARKET_EXCLUDED/);assert.equal(ops.db().jobs.length,0);
 ops.config.marketExclusions.length=0;const pre=await ops.preflight(input,'admin');assert.equal(pre.actionable,1);
});

test('known provider names and canonical aliases cannot bypass an excluded market before discovery',async t=>{
 const ops=fixture(t);ops.config.marketExclusions.push({service_id:'chess-com',market_code:'IN',reason:null},{service_id:'disney-plus',market_code:'IN',reason:null});
 for(const seedName of ['Chess.com','Disney+','Disney_Plus','Disney/Plus','Disney  Plus'])await assert.rejects(ops.preflight({objective:'PRICE_RESEARCH',targetKind:'PROVIDER_OR_BRAND_SEED',seedName,market:'IN',identityDiscoveryConsent:true,capabilities:caps},'admin'),error=>error.message==='PRICE_RESEARCH_MARKET_EXCLUDED'&&error.status===409);
 assert.equal(ops.db().preflights.length,0);assert.equal(ops.db().jobs.length,0);
});

test('known provider aliases remain eligible in included markets and Start rechecks exclusions',async t=>{
 const ops=fixture(t),input={objective:'PRICE_RESEARCH',targetKind:'PROVIDER_OR_BRAND_SEED',market:'DE',identityDiscoveryConsent:true,capabilities:caps};
 let canonicalPreflight,aliasPreflight;
 for(const seedName of ['Disney+','Disney_Plus']){
  const pre=await ops.preflight({...input,seedName},'admin');assert.equal(pre.identityDiscovery.status,'KNOWN_SERVICE_SEED');
  if(seedName==='Disney+')canonicalPreflight=pre;else aliasPreflight=pre;
 }
 const job=await ops.start(aliasPreflight.token,'admin',true);assert.equal(job.status,'QUEUED');
 ops.config.marketExclusions.push({service_id:'disney-plus',market_code:'DE',reason:null});
 await assert.rejects(ops.start(canonicalPreflight.token,'admin',true),/PRICE_RESEARCH_MARKET_EXCLUDED/);
 assert.equal(ops.db().jobs.length,1);assert.equal(ops.db().jobs[0].config.market,'DE');
});

test('ambiguous provider aliases stop before discovery without choosing either identity',async t=>{
 const one={...dbIdentity('research-alias-one'),aliases:['Shared Seed']},two={...dbIdentity('research-alias-two'),aliases:['Shared_Seed']};
 const ops=batchFixture(t,[one,two]);
 await assert.rejects(ops.preflight({objective:'PRICE_RESEARCH',targetKind:'PROVIDER_OR_BRAND_SEED',seedName:'Shared/Seed',market:'DE',identityDiscoveryConsent:true,capabilities:caps},'admin'),error=>error.message==='AMBIGUOUS_PRICE_RESEARCH_IDENTITY'&&error.status===409);
 assert.equal(ops.db().preflights.length,0);assert.equal(ops.db().jobs.length,0);
});

test('failed V3 verification does not create a market exclusion or remove future targets',async t=>{
 const ops=batchFixture(t),target={id:'price-research:chess-com:IN',service:'chess-com',market:'IN'};
 const outcome=await runBoundedV3Verification({targets:[target],handoffs:{[target.id]:{researchLeads:{candidatePlans:[]}}},execute:async()=>({adaptive:{targets:{}},v3Results:{[target.id]:{suggested:[],verified:[],contradictions:[],operationalFailures:[{kind:'V3_VERIFICATION_RETRY_EXHAUSTED'}]}}})});
 assert.equal(outcome.v3Results[target.id].verified.length,0);assert.deepEqual(ops.config.marketExclusions,[]);
 const targeting=await ops.priceResearchTargeting({services:['chess-com'],markets:['IN']});assert.equal(targeting.serviceMarketTargets,1);
});

test('42 explicit markets and all 46 markets are admitted completely with no target-count continuation',async t=>{
 const ops=batchFixture(t),universe=await ops.priceResearchTargeting({}),markets=universe.markets.map(row=>row.id),fortyTwo=markets.slice(0,42);
 for(const selectedMarkets of [fortyTwo,[]]){
  const targeting=await ops.priceResearchTargeting({services:['chess-com'],markets:selectedMarkets}),input={objective:'PRICE_RESEARCH',targetKind:'CANONICAL_SELECTION',services:['chess-com'],markets:selectedMarkets,targetingRevision:targeting.revision,capabilities:caps},plan=await priceResearchPlan(input,ops.config),expected=selectedMarkets.length||46;
  assert.equal(plan.logicalTargetCount,expected);assert.equal(plan.batchTargetCount,expected);assert.equal(plan.config.batchTargets.length,expected);assert.equal(plan.totalSafetyCeiling,expected*96);assert.equal(plan.continuationCursor,null);assert.equal(Object.hasOwn(plan.config,'cursor'),false);assert.equal(Object.hasOwn(plan.config,'continuationCursor'),false);
 }
 const targeting=await ops.priceResearchTargeting({services:['chess-com'],markets:fortyTwo});await assert.rejects(priceResearchPlan({objective:'PRICE_RESEARCH',targetKind:'CANONICAL_SELECTION',services:['chess-com'],markets:fortyTwo,targetingRevision:targeting.revision,cursor:'10.'+'0'.repeat(64),capabilities:caps},ops.config),/INVALID_PRICE_RESEARCH_CONFIG/);await assert.rejects(priceResearchPlan({objective:'PRICE_RESEARCH',targetKind:'CANONICAL_SELECTION',services:[],markets:[],targetingRevision:targeting.revision,capabilities:caps},ops.config),/PRICE_RESEARCH_SELECTION_REQUIRED/);
});

test('full current canonical universe survives Preflight and Start as one 21,298-target job',async t=>{
 const ops=batchFixture(t),universe=await ops.priceResearchTargeting({}),serviceIds=universe.services.filter(row=>row.selectable).map(row=>row.serviceId),targeting=await ops.priceResearchTargeting({services:serviceIds,markets:[]}),input={objective:'PRICE_RESEARCH',targetKind:'CANONICAL_SELECTION',services:serviceIds,markets:[],targetingRevision:targeting.revision,capabilities:caps};
 const pre=await ops.preflight(input,'admin');assert.equal(pre.logicalTargetCount,21298);assert.equal(pre.batchTargetCount,21298);assert.equal(pre.totalSafetyCeiling,21298*96);assert.equal(pre.continuationCursor,null);assert.equal(ops.db().preflights[0].config.batchTargets.length,21298);
 const job=await ops.start(pre.token,'admin',true);assert.equal(job.config.batchTargets.length,21298);assert.equal(job.config.logicalTargetCount,21298);assert.equal(ops.db().jobs.length,1);const manifest=JSON.parse(fs.readFileSync(path.join(ops.config.root,'runs',job.id,'manifest.json')));assert.equal(manifest.targets.length,21298);assert.equal(manifest.limits.totalRequests,21298*96);
});

test('Start rejects changed canonical projection and worker preparation rejects a changed frozen batch',async t=>{
 const identities=[],ops=batchFixture(t,identities),targeting=await ops.priceResearchTargeting({services:['chess-com'],markets:['DE']}),pre=await ops.preflight({objective:'PRICE_RESEARCH',targetKind:'CANONICAL_SELECTION',services:['chess-com'],markets:['DE'],targetingRevision:targeting.revision,capabilities:caps},'admin');
 identities.push(dbIdentity('research-new-service'));await assert.rejects(ops.start(pre.token,'admin',true),error=>error.message==='TARGETING_STALE'&&error.status===409);assert.equal(ops.db().jobs.length,0);identities.length=0;
 const valid=await ops.start(pre.token,'admin',true),file=path.join(ops.config.root,'runs',valid.id,'manifest.json'),manifest=JSON.parse(fs.readFileSync(file));manifest.targets[0].market='NO';fs.writeFileSync(file,JSON.stringify(manifest));assert.throws(()=>ops.prepareQueued(ops.db(),valid),/PRICE_RESEARCH_BATCH_BINDING_CHANGED/);
});

test('PRICE_RESEARCH Preflight exposes blocking capability readiness and non-blocking Gemini readiness',async t=>{
 const ops=fixture(t);ops.config.env={TAVILY_API_KEY:'fixture-private'};const pre=await ops.preflight({objective:'PRICE_RESEARCH',targetKind:'KNOWN_SERVICE',serviceId:'chess-com',market:'ES',capabilities:{...caps,tavily:true}},'admin');assert.equal(pre.liveReady,true);assert.equal(pre.capabilityCheck.availability.tavily.reason,'CONFIGURED');assert.equal(pre.capabilityCheck.auxiliary.googleAi.reason,'GEMINI_CREDENTIAL_UNAVAILABLE');assert.equal(pre.capabilityCheck.auxiliary.googleAi.blocking,false);assert.equal(JSON.stringify(pre).includes('fixture-private'),false);
});

const verificationTarget={id:'price-research:example:DE',service:'example',serviceName:'Example',market:'DE'};
const verificationHandoff={kind:'V4_TO_V3_RESEARCH_HANDOFF',provider:'Example',targetMarket:'DE',researchLeads:{candidatePlans:[{suggestedId:'v4:one'}]}};
const emptyV3=()=>({suggested:[],verified:[],contradictions:[],operationalFailures:[]});
function adaptiveAttempt({reason='NO_EXECUTABLE_PROGRESS_RECONCILE',kind='BLOCKED',usage={},bounds={},verification=true}={}){const used={reads:1,searches:0,acquisitions:0,retainedReviews:0,bytes:1,...usage};return {executionComplete:true,turn:used.actions??1,bounds:{reads:24,searches:8,acquisitions:8,retainedReviews:64,turns:512,bytes:16*1024*1024,...bounds},targets:{[verificationTarget.id]:{id:verificationTarget.id,service:'example',serviceName:'Example',market:'DE',...(verification?{v4VerificationRequirement:{kind:'SOURCE_BOUND_PRICE_VERIFICATION_REQUIRED'}}:{})}},services:{example:{used,stop:{kind,reason}}}};}
const downstreamSequence=(attempts,calls=[])=>async(_handoffs,options)=>{calls.push(structuredClone(options));const next=attempts.shift();return typeof next==='function'?next(options):next;};

test('V4 Suggested retries one isolated no-progress V3 attempt and accepts Verified truth',async()=>{
 const calls=[],verified={plan:'Individual',amount:10.99,currency:'EUR'},result=await runBoundedV3Verification({targets:[verificationTarget],handoffs:{[verificationTarget.id]:verificationHandoff},execute:downstreamSequence([{adaptive:adaptiveAttempt(),v3Results:{[verificationTarget.id]:emptyV3()}},options=>({adaptive:{...adaptiveAttempt({reason:'VERIFIED',usage:{reads:2}}),budgetScope:'CAMPAIGN',initialUsage:options.initialUsage,turn:options.initialUsage.actions+2},v3Results:{[verificationTarget.id]:{...emptyV3(),verified:[verified]}}})],calls)});
 assert.equal(calls.length,2);assert.equal(calls[1].attempt,2);assert.deepEqual(result.v3Results[verificationTarget.id].verified,[verified]);assert.equal(result.result.v3VerificationRetry.outcomes[verificationTarget.id].status,'AUTHORITATIVE_PROGRESS');
 assert.deepEqual(result.verificationRetry.targets[verificationTarget.id],{attempted:true,count:1,usageScope:'TARGET',firstAttemptReason:'NO_EXECUTABLE_PROGRESS_RECONCILE',firstAttemptOutcome:'UNRESOLVED',firstAttemptUsage:{actions:1,reads:1,searches:0,acquisitions:0,retainedReviews:0,bytes:1},retryOutcome:'VERIFIED',retryReason:'VERIFIED',retryUsage:{actions:2,reads:2,searches:0,acquisitions:0,retainedReviews:0,bytes:1},verifiedAttempt:2});
});

test('Max retry carries only proven G1 unpriced and body-limit URLs as routing memory',async()=>{
 const max={id:'price-research:max:GB',service:'max',serviceName:'Max',market:'GB'},url='https://help.hbomax.com/gb/Home/Index',hash='a'.repeat(64),first=adaptiveAttempt();
 first.targets={[max.id]:{id:max.id,service:'max',market:'GB',v4VerificationRequirement:{kind:'SOURCE_BOUND_PRICE_VERIFICATION_REQUIRED'},acquisitionOutcomes:[
  {url,classification:'COMMERCIAL_FIELDS_INSUFFICIENT',sourceClassification:{status:'PROVIDER_SOURCE',finalUrl:url,sourceHash:hash},countryV3Evaluation:{status:'EVALUATED',receiptStatus:'HASH_VERIFIED',geoClass:'G1'}},
  {url:'https://help.hbomax.com/gb/unverified',classification:'CONTENT_NOT_COMMERCIAL',sourceClassification:{status:'PROVIDER_SOURCE',sourceHash:hash},countryV3Evaluation:{status:'UNRESOLVED',receiptStatus:'UNRESOLVED',geoClass:'G0'}},
  {url:'https://www.hbomax.com/',classification:'ACQUISITION_FAILED',responseTooLarge:true},
  {url:'https://help.hbomax.com/gb/timeout',classification:'ACQUISITION_FAILED',responseTooLarge:false}
 ]}};first.services={max:{used:{reads:1,searches:0,acquisitions:1,retainedReviews:0,bytes:100},stop:{kind:'BLOCKED',reason:'NO_EXECUTABLE_PROGRESS_RECONCILE'}}};
 const calls=[];await runBoundedV3Verification({targets:[max],handoffs:{[max.id]:verificationHandoff},execute:downstreamSequence([{adaptive:first,v3Results:{[max.id]:emptyV3()}},{adaptive:first,v3Results:{[max.id]:emptyV3()}}],calls)});
 assert.deepEqual(calls[1].priorNoProgressProviderUrls[max.id],[url,'https://www.hbomax.com/']);
});

test('same no-progress routing memory applies to another service without promoting unbound evidence',async()=>{
 const url='https://help.example.com/de/plans',hash='b'.repeat(64),first=adaptiveAttempt(),current=first.targets[verificationTarget.id];
 current.acquisitionOutcomes=[
  {url,classification:'CONTENT_NOT_COMMERCIAL',sourceClassification:{status:'PROVIDER_SOURCE',finalUrl:url,sourceHash:hash},countryV3Evaluation:{status:'EVALUATED',receiptStatus:'HASH_VERIFIED',geoClass:'G1'}},
  {url:'https://help.example.com/de/unknown',classification:'CONTENT_NOT_COMMERCIAL',sourceClassification:{status:'PROVIDER_SOURCE',sourceHash:hash},countryV3Evaluation:{status:'UNRESOLVED',receiptStatus:'UNRESOLVED',geoClass:'G0'}}
 ];
 const calls=[];await runBoundedV3Verification({targets:[verificationTarget],handoffs:{[verificationTarget.id]:verificationHandoff},execute:downstreamSequence([{adaptive:first,v3Results:{[verificationTarget.id]:emptyV3()}},{adaptive:first,v3Results:{[verificationTarget.id]:emptyV3()}}],calls)});
 assert.deepEqual(calls[1].priorNoProgressProviderUrls[verificationTarget.id],[url]);
});

test('first V3 attempt can verify pricing while service coverage later stops with no executable progress',async()=>{
 const calls=[],result=await runBoundedV3Verification({targets:[verificationTarget],handoffs:{[verificationTarget.id]:{...verificationHandoff,researchLeads:{candidatePlans:[]}}},execute:downstreamSequence([{adaptive:adaptiveAttempt({verification:false,usage:{reads:4,searches:1,acquisitions:1,bytes:665527}}),v3Results:{[verificationTarget.id]:{...emptyV3(),verified:[{plan:'Gold',amount:5.99,currency:'EUR'}]}}}],calls)});
 assert.equal(calls.length,1);assert.equal(result.v3Results[verificationTarget.id].verified.length,1);assert.deepEqual(result.verificationRetry.targets[verificationTarget.id],{attempted:false,count:0,usageScope:'TARGET',firstAttemptReason:'NO_EXECUTABLE_PROGRESS_RECONCILE',firstAttemptOutcome:'VERIFIED',firstAttemptUsage:{actions:1,reads:4,searches:1,acquisitions:1,retainedReviews:0,bytes:665527},retryOutcome:null,retryReason:null,retryUsage:null,verifiedAttempt:1});
});

test('a second no-progress result exhausts exactly one V3 retry and remains Suggested-only',async()=>{
 const calls=[],result=await runBoundedV3Verification({targets:[verificationTarget],handoffs:{[verificationTarget.id]:verificationHandoff},execute:downstreamSequence([{adaptive:adaptiveAttempt(),v3Results:{[verificationTarget.id]:emptyV3()}},{adaptive:adaptiveAttempt(),v3Results:{[verificationTarget.id]:emptyV3()}}],calls)}),failures=result.v3Results[verificationTarget.id].operationalFailures;
 assert.equal(calls.length,2);assert.equal(result.verificationRetry.attemptedTargetIds.length,1);assert(failures.some(row=>row.kind==='V3_VERIFICATION_RETRY_EXHAUSTED'&&row.reason==='NO_EXECUTABLE_PROGRESS_RECONCILE'));assert.equal(result.v3Results[verificationTarget.id].verified.length,0);
});

test('V3 retry requires a V4 candidate and unresolved verification without authoritative conflict',async()=>{
 for(const row of [
  {name:'no V4 Suggested',handoff:{...verificationHandoff,researchLeads:{candidatePlans:[]}},v3:emptyV3(),state:adaptiveAttempt()},
  {name:'existing Verified',handoff:verificationHandoff,v3:{...emptyV3(),verified:[{plan:'Individual'}]},state:adaptiveAttempt()},
  {name:'authoritative contradiction',handoff:verificationHandoff,v3:{...emptyV3(),contradictions:[{kind:'AUTHORITATIVE_PRICE_CONTRADICTION'}]},state:adaptiveAttempt()},
  {name:'policy/access blocker',handoff:verificationHandoff,v3:emptyV3(),state:adaptiveAttempt({reason:'PROVIDER_ACCESS_POLICY_STOP'})},
  {name:'hard budget exhaustion',handoff:verificationHandoff,v3:emptyV3(),state:adaptiveAttempt({usage:{reads:24},kind:'BUDGET_LIMITED'})}
 ]){const calls=[],result=await runBoundedV3Verification({targets:[verificationTarget],handoffs:{[verificationTarget.id]:row.handoff},execute:downstreamSequence([{adaptive:row.state,v3Results:{[verificationTarget.id]:row.v3}}],calls)});assert.equal(calls.length,1,row.name);assert.deepEqual(result.verificationRetry.attemptedTargetIds,[],row.name);}
});

test('V3 retry carries first usage into the same hard budget and rejects aggregate overflow',async()=>{
 const calls=[],first=adaptiveAttempt({usage:{actions:3,reads:20,searches:5,acquisitions:2,retainedReviews:4,bytes:1000}}),retry=options=>({adaptive:{...adaptiveAttempt({reason:'VERIFIED',usage:{actions:1,reads:4,searches:3,acquisitions:6,retainedReviews:60,bytes:16*1024*1024-1000}}),budgetScope:'CAMPAIGN',initialUsage:options.initialUsage},v3Results:{[verificationTarget.id]:{...emptyV3(),verified:[{plan:'Individual'}]}}});
 await runBoundedV3Verification({targets:[verificationTarget],handoffs:{[verificationTarget.id]:verificationHandoff},execute:downstreamSequence([{adaptive:first,v3Results:{[verificationTarget.id]:emptyV3()}},retry],calls)});assert.deepEqual(calls[1].initialUsage,{actions:3,reads:20,searches:5,acquisitions:2,retainedReviews:4,bytes:1000});
 const overflow=options=>({adaptive:{...adaptiveAttempt({usage:{reads:5}}),budgetScope:'CAMPAIGN',initialUsage:options.initialUsage},v3Results:{[verificationTarget.id]:emptyV3()}});await assert.rejects(runBoundedV3Verification({targets:[verificationTarget],handoffs:{[verificationTarget.id]:verificationHandoff},execute:downstreamSequence([{adaptive:first,v3Results:{[verificationTarget.id]:emptyV3()}},overflow])}),/V3_VERIFICATION_RETRY_BUDGET_VIOLATION/);
});

test('V3 retry preserves stop and infrastructure failures instead of converting them to Suggested-only',async()=>{
 await assert.rejects(runBoundedV3Verification({targets:[verificationTarget],handoffs:{[verificationTarget.id]:verificationHandoff},execute:downstreamSequence([{adaptive:adaptiveAttempt(),v3Results:{[verificationTarget.id]:emptyV3()}},()=>{throw Error('PRICE_RESEARCH_STOPPED');}])}),/PRICE_RESEARCH_STOPPED/);
});

test('V4 acquisition runs once while first and retry V3 attempts retain separate artifact identities',async()=>{
 let googleRequests=0;const calls=[],googlePlan={planName:'Individual',amount:10.99,currency:'EUR',paymentCadence:'MONTHLY_RECURRING',commitment:'NONE',ordinaryRecurringPrice:10.99,introPrice:null,introDuration:null,sourceUrl:'https://example.test/pricing',sourceEvidence:'Individual EUR 10.99 monthly',marketEvidence:'Germany',billingBasis:'charged monthly',annualOnly:false,freeTier:false,summary:'Monthly',warnings:[],market:'DE',sourceReferences:['https://example.test/pricing']},acquisition={status:'GOOGLE_AI_SUCCESS',aiResult:{provider:'Example',market:'DE',plans:[googlePlan],sources:[],warnings:[],timestamp:'2026-10-15T00:00:00.000Z',requestCount:1},audit:{timestamp:'2026-10-15T00:00:00.000Z',request:{requestCount:1}}};
 const result=await runAdminV4FirstResearch({targets:[verificationTarget],artifactDirectory:null,apiKey:'test',acquireGoogle:async()=>{googleRequests++;return acquisition;},persistSuggested:async()=>({}),persistVerified:async()=>({}),loadSuggested:async()=>[],loadVerified:async()=>[],runDownstream:({handoffs})=>runBoundedV3Verification({targets:[verificationTarget],handoffs,execute:downstreamSequence([{adaptive:adaptiveAttempt(),v3Results:{[verificationTarget.id]:emptyV3()}},{adaptive:adaptiveAttempt(),v3Results:{[verificationTarget.id]:emptyV3()}}],calls)})});
 assert.equal(googleRequests,1);assert.equal(calls.length,2);assert.equal(calls[0].attempt,1);assert.equal(calls[1].artifactName,'v3-verification-retry-1');assert.equal(result.downstreamResult.v3VerificationRetry.firstAttemptArtifact,'primary');assert.equal(result.downstreamResult.v3VerificationRetry.retryAttemptArtifact,'v3-verification-retry-1');assert.equal(result.targets[0].verificationRetry.attempted,true);assert.equal(result.targets[0].verificationRetry.firstAttemptReason,'NO_EXECUTABLE_PROGRESS_RECONCILE');assert.equal(result.targets[0].verificationRetry.retryOutcome,'UNRESOLVED');assert(result.targets[0].combined.operationalFailures.some(row=>row.kind==='V3_VERIFICATION_RETRY_EXHAUSTED'));
});


test('live known-service target seeds the reviewed provider root as routing only',()=>{
 const namespace=reviewedProviderNamespacesFor('hulu','Hulu')[0],seed=reviewedNamespacePriceResearchSeed({serviceName:'Hulu',reviewedProviderNamespaces:[namespace]});
 assert.deepEqual(seed.urls,['https://www.hulu.com/']);
 assert.equal(seed.leads[0].providerRootSeed,true);
 assert.equal(seed.leads[0].truthAuthority,'NONE');
 assert.equal(seed.leads[0].authoritative,false);
 assert.equal(seed.leads[0].evidenceStatus,'DISCOVERY_LEAD_ONLY');
 assert.equal(seed.leads[0].from.method,'REVIEWED_NAMESPACE_ROOT');
 assert.deepEqual(reviewedNamespacePriceResearchSeed({serviceName:'Example'}),{reviewedProviderNamespaces:[],urls:[]});
});
