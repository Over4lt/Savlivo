import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {assessAdaptiveService,initializeAdaptiveState} from '../inventory/adaptive-campaign.mjs';
import {destinationInformation} from './information-routing.mjs';
import {executableAction} from './execution-capabilities.mjs';
import {planResearch} from './research-planner.mjs';
import {planHybridRenderedAcquisition} from './hybrid-rendered-acquisition.mjs';
import {conditionalCommercialRenderingRequired,applicationShellRenderingRequired,activeRenderingNeed,reconcileRenderingNeed} from './rendering-diagnosis.mjs';
import {runOpenWebResearch} from './open-web-discovery.mjs';

const host='provider.example',membership=`https://${host}/memberships`,terms=`https://${host}/terms`,social='https://social.example/provider',related='https://de.provider-cdn.example/memberships',hash='a'.repeat(64);
const authority={hostname:host,provider:'Provider',sourceType:'OFFICIAL_PROVIDER',sourceUrl:membership,checkedAt:'2026-10-13T00:00:00.000Z'};
const observation=(url=membership,sha256=hash,id='direct-membership')=>({id,kind:'PROVIDER',url,sha256,context:{transport:'DIRECT',networkGeography:'UNBOUND',representation:'PROVIDER_PAGE'}});
const truth=()=>({prices:{DE:{propositions:{}}},needs:[{id:'DE:PRICE_AMOUNT',proposition:'PRICE_AMOUNT',market:'DE',offerId:null,state:'UNRESOLVED'}]});
const page=(url=membership,bodyHash=hash)=>({requestedUrl:url,url,outcome:'OK',bodyHash,sourceIntegrity:{sha256:bodyHash},accessDecisions:[{decision:'ALLOWED'}]});
const commercialLead=(url=membership,extra={})=>({url,title:'Membership plans',providerSeedObjectiveLead:true,objectiveCapability:'COMMERCIAL_OBJECTIVE',objectiveProgressValue:12,objectiveScore:12,...extra});
function target(extra={}){
 const v3Observation=observation(),v3Truth=truth(),lead=commercialLead();
 return {id:'provider-DE',service:'provider',serviceName:'Provider',market:'DE',researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},capabilities:{direct:true,tavily:false,decodo:true,browser:false,groq:false},urls:[membership,terms],knownCommercialUrls:[membership],authorities:[authority],reads:[page()],queries:[],decisions:[],verified:[],blockedOrigins:[],leads:[lead,{url:terms,title:'Legal terms'}],providerSeedCandidateServiceContext:{objectiveResource:{url:membership},objectiveLeads:[structuredClone(lead)]},v3Observation,v3Truth,providerInterpretations:[{url:membership,v3Observation,v3Truth}],...extra};
}
const retryable={url:membership,classification:'ACQUISITION_FAILED',countryV3Evaluation:{status:'UNRESOLVED',reason:'COUNTRY_PROVIDER_RECEIPT_UNAVAILABLE'}};
const terminal={url:membership,classification:'ACQUISITION_FAILED',countryV3Evaluation:{status:'UNRESOLVED',reason:'COUNTRY_ACCESS_POLICY_STOP'}};

test('A retryable country acquisition failure keeps the commercial resource active within existing finite bounds',()=>{
 const value=target({acquisitionOutcomes:[retryable],decisions:[{url:membership,acquisitionReserved:true,route:'DECODO'}]}),plan=planResearch(value);
 assert.equal(plan.route,'DECODO');assert.equal(plan.url,membership);assert.equal(executableAction(value,plan).executable,true);assert.equal(destinationInformation(value,terms).eligible,false);
 const assessment=assessAdaptiveService(initializeAdaptiveState({targets:[value],conditionalFollowupTargets:[]}),'provider');assert.equal(assessment.next.plan.url,membership);
});

test('B non-retryable country failure moves to another commercial action for the same gap',()=>{
 const next=commercialLead(related,{providerAffinity:{kind:'RELATED_PROVIDER_CANDIDATE',hostnameAffinity:3,boundHost:host,candidateHost:'de.provider-cdn.example'},authorityStatus:'UNRESOLVED'}),value=target({capabilities:{direct:true,tavily:true,decodo:true,browser:false,groq:false},acquisitionOutcomes:[terminal],decisions:[{url:membership,acquisitionReserved:true,route:'DECODO'}]});value.leads.push(next);value.providerSeedCandidateServiceContext.objectiveLeads.push(next);
 const plan=planResearch(value);assert.equal(plan.route,'AUTHORITY_DISCOVERY');assert.equal(plan.url,related);assert.equal(plan.reason,'OBJECTIVE_LEAD_AUTHORITY_RESEARCH');assert.notEqual(plan.url,terms);
});

test('C a foreign-market commercial observation makes target-country acquisition the next action',()=>{
 const foreign=`https://${host}/en/no/memberships`,foreignHash='b'.repeat(64),v3Observation=observation(foreign,foreignHash,'direct-foreign'),v3Truth=truth(),lead=commercialLead(foreign),value=target({urls:[foreign,terms],knownCommercialUrls:[foreign],reads:[page(foreign,foreignHash)],leads:[lead,{url:terms,title:'Legal terms'}],providerSeedCandidateServiceContext:{objectiveResource:{url:foreign},objectiveLeads:[structuredClone(lead)]},v3Observation,v3Truth,providerInterpretations:[{url:foreign,v3Observation,v3Truth}]});
 const plan=planResearch(value);assert.equal(plan.route,'DECODO');assert.equal(plan.url,foreign);assert.equal(plan.reason,'TARGET_MARKET_OBSERVATION_REQUIRED');
});

test('D completed authority does not make legal resources eligible for a price or market gap',()=>{const value=target();assert.equal(destinationInformation(value,terms).eligible,false);assert.equal(destinationInformation(value,membership).eligible,true);});

test('E resource value is capability and gap specific',()=>{
 const value=target(),marketPlan=planResearch(value);assert.deepEqual([marketPlan.url,marketPlan.route],[membership,'DECODO']);assert.equal(destinationInformation(value,terms).reason,'NOT_CURRENT_COMMERCIAL_GAP_DESTINATION');
 const authorityTarget=target({capabilities:{direct:true,tavily:true,decodo:true,browser:false,groq:false},authorities:[],v3Observation:undefined,v3Truth:undefined,providerInterpretations:[],reads:[],providerSeedCandidateServiceContext:undefined,leads:[{url:terms,title:'Provider legal identity',providerSeedObjectiveLead:true,objectiveCapability:'UNRESOLVED_OBJECTIVE',objectiveProgressValue:5}]});assert.equal(planResearch(authorityTarget).route,'AUTHORITY_DISCOVERY');
});

test('F wrong-state observation advances through a provider market-state resource and can justify a changed country request',()=>{
 const selector=`https://${host}/market/de`,selectorHash='c'.repeat(64),value=target({acquisitionOutcomes:[{url:membership,classification:'COMMERCIAL_FIELDS_INSUFFICIENT',countryV3Evaluation:{status:'EVALUATED',receiptStatus:'HASH_VERIFIED',geoClass:'G1'}}],decisions:[{url:membership,acquisitionReserved:true,route:'DECODO'}]});value.urls.push(selector);value.leads.push({url:selector,title:'Market selector',continuationContext:'MARKET'});
 let plan=planResearch(value);assert.equal(plan.route,'DIRECT');assert.equal(plan.url,selector);
 const selectorObservation=observation(selector,selectorHash,'direct-selector'),selectorTruth=truth();value.reads.push(page(selector,selectorHash));value.providerInterpretations.push({url:selector,v3Observation:selectorObservation,v3Truth:selectorTruth});value.v3Observation=selectorObservation;value.v3Truth=selectorTruth;
 plan=planResearch(value);assert.equal(plan.route,'DECODO');assert.equal(plan.url,selector);
});

test('G social continuation loses while a commercial market action remains',()=>{
 const source={observation:'direct-membership',bodySha256:hash,start:1,end:2,sha256:'d'.repeat(64)},value=target({acquisitionOutcomes:[retryable],decisions:[{url:membership,acquisitionReserved:true,route:'DECODO'}]});value.leads.push({url:social,title:'Instagram',sourceBoundCandidate:true,continuationScore:99,continuationContext:'CONTENT',truthAuthority:'NONE',authoritative:false,source,from:{url:membership,bodyHash:hash,locator:source,mechanism:'V3_SOURCE_BOUND_CONTINUATION'}});
 const plan=planResearch(value);assert.equal(plan.route,'DECODO');assert.equal(plan.url,membership);assert.equal(plan.sourceBoundCandidates.length,0);
});

test('H a successful country observation prevents unchanged semantic reacquisition',()=>{
 const value=target({acquisitionOutcomes:[{url:membership,classification:'COMMERCIAL_FIELDS_INSUFFICIENT',countryV3Evaluation:{status:'EVALUATED',receiptStatus:'HASH_VERIFIED',geoClass:'G1'}}],decisions:[{url:membership,acquisitionReserved:true,route:'DECODO'}]});assert.equal(executableAction(value,{route:'DECODO',url:membership}).reason,'EQUIVALENT_RESOURCE_ALREADY_ATTEMPTED');assert.notEqual(planResearch(value).url,membership);
});

test('I market exhaustion occurs only after commercial capability and alternatives are exhausted',()=>{
 const value=target({capabilities:{direct:true,tavily:false,decodo:true,browser:false,groq:false},acquisitionOutcomes:[terminal],decisions:[{url:membership,acquisitionReserved:true,route:'DECODO'}]});const plan=planResearch(value);assert.equal(plan.route,'STOP');assert.notEqual(plan.url,terms);assert.equal(destinationInformation(value,terms).eligible,false);
});

test('J conditional commercial country bytes preserve the same objective resource for rendered fallback',()=>{
 const body='<main><section x-show="market === \'de\'">Core 4,99 EUR/Monat</section><section x-show="market === \'us\'">Core 5.99 USD/month</section></main>';
 assert.equal(conditionalCommercialRenderingRequired(body),true);assert.equal(conditionalCommercialRenderingRequired('<main>Core 4,99 EUR/Monat</main>'),false);
 const value=target({capabilities:{direct:true,tavily:false,decodo:true,browser:true,groq:false},demonstratedRendering:true,acquisitionOutcomes:[{url:membership,classification:'COMMERCIAL_FIELDS_INSUFFICIENT',renderingRequired:true,countryV3Evaluation:{status:'EVALUATED',receiptStatus:'HASH_VERIFIED',geoClass:'G1'}}],decisions:[{url:membership,acquisitionReserved:true,route:'DECODO'}]});
 const plan=planResearch(value);assert.equal(plan.route,'PARK_RENDERING');assert.equal(plan.reason,'RENDERING_REQUIRED');const rendered=planHybridRenderedAcquisition(value,{url:membership,transport:'DECODO'});assert.equal(rendered.scheduled,true);assert.equal(rendered.url,membership);assert.equal(rendered.country,'DE');
});

test('scripted provider shell needs rendering while static prices remain static',()=>{
 const shell='<html><body><webruntime-app></webruntime-app><script src="/app.js"></script><script>bootstrap()</script></body></html>';
 const staticPrices='<html><body><main><h2>Basic</h2><p>GBP 9 / month</p></main><script src="/app.js"></script><script>bootstrap()</script></body></html>';
 const staticWithConsent=staticPrices.replace('</body>','<div>Cookie consent <button>Reject all</button></div></body>');
 assert.equal(applicationShellRenderingRequired(shell),true);
 assert.equal(applicationShellRenderingRequired(staticPrices),false);
 assert.equal(applicationShellRenderingRequired(staticWithConsent),false);
});

test('K commercial country insufficiency without a rendering diagnosis remains genuinely exhausted when no alternative exists',()=>{
 const value=target({capabilities:{direct:true,tavily:false,decodo:true,browser:true,groq:false},acquisitionOutcomes:[{url:membership,classification:'COMMERCIAL_FIELDS_INSUFFICIENT',renderingRequired:false,countryV3Evaluation:{status:'EVALUATED',receiptStatus:'HASH_VERIFIED',geoClass:'G1'}}],decisions:[{url:membership,acquisitionReserved:true,route:'DECODO'}]});const plan=planResearch(value);assert.equal(plan.route,'STOP');assert.notEqual(plan.reason,'RENDERING_REQUIRED');
});

test('stale rendering need is retired when latest V3 needs are satisfied',()=>{
 const value=target({capabilities:{direct:true,tavily:false,decodo:true,browser:true,groq:false},v3Truth:{established:true,prices:{DE:{propositions:{}}},needs:[]},demonstratedRendering:true,acquisitionOutcomes:[{url:membership,renderingRequired:true,runDirectory:'/retained',sourceHash:hash,transport:'DECODO'}]});
 const result=reconcileRenderingNeed(value,{required:true,url:membership,runDirectory:'/retained',transport:'DECODO',sourceHash:hash});assert.equal(result.actionable,false);assert.equal(activeRenderingNeed(value),null);assert.notEqual(planResearch(value).route,'PARK_RENDERING');
});

test('partial Truth keeps only the remaining offering proposition as rendering motivation',()=>{
 const value=target({capabilities:{direct:true,tavily:false,decodo:true,browser:true,groq:false},v3Truth:{established:true,prices:{DE:{propositions:{}}},needs:[{id:'base:PRICE_AMOUNT',offerId:'base',proposition:'PRICE_AMOUNT',market:'DE',state:'UNRESOLVED'}]},demonstratedRendering:true,acquisitionOutcomes:[{url:membership,renderingRequired:true,runDirectory:'/retained',sourceHash:hash,transport:'DECODO'}]});
 const result=reconcileRenderingNeed(value,{required:true,url:membership,runDirectory:'/retained',transport:'DECODO',sourceHash:hash}),plan=planResearch(value);assert.deepEqual(result.remainingNeeds,['base:PRICE_AMOUNT']);assert.equal(plan.route,'PARK_RENDERING');assert.deepEqual(plan.renderingNeed.motivatingNeeds.map(row=>row.id),['base:PRICE_AMOUNT']);
});

test('adaptive scheduler activates a still-material rendered capability',()=>{
 const value=target({capabilities:{direct:true,tavily:false,decodo:true,browser:true,groq:false},demonstratedRendering:true,renderingNeed:{kind:'RENDERED_REPRESENTATION',url:membership,transport:'DECODO',market:'DE',sourceHash:hash,runDirectory:'/retained',motivatingNeeds:truth().needs}}),assessment=assessAdaptiveService(initializeAdaptiveState({targets:[value],conditionalFollowupTargets:[]}),'provider');
 assert.equal(assessment.next.plan.route,'PARK_RENDERING');assert.equal(assessment.next.decision,'ACTIVATE');assert.equal(assessment.next.capability.executable,true);
});

test('PARK_RENDERING resumes the executor on the same resource and then reconciles',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'capability-reconciliation-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));let calls=0;
 const value=target({capabilities:{direct:true,tavily:false,decodo:true,browser:true,groq:false},demonstratedRendering:true,renderingNeed:{kind:'RENDERED_REPRESENTATION',url:membership,transport:'DECODO',market:'DE',sourceHash:hash,runDirectory:'/retained',motivatingNeeds:truth().needs}});
 const result=await runOpenWebResearch({directory,targets:[value],maxActions:1,search:async()=>assert.fail('search'),read:async()=>assert.fail('read'),render:async({need})=>{calls++;assert.equal(need.url,membership);assert.equal(need.transport,'DECODO');return {outcome:'OBSERVED',actionId:'rendered',url:membership,renderingRequired:false,v3Observation:observation(membership,'e'.repeat(64),'rendered'),v3Truth:{established:true,prices:{DE:{propositions:{}}},needs:[]},v3Catalog:{state:'CATALOG_UNRESOLVED'}};}}),current=result.targets[0];
 assert.equal(calls,1);assert.equal(current.renderingOutcomes[0].outcome,'OBSERVED');assert.equal(current.demonstratedRendering,false);assert.equal(current.v3Truth.needs.length,0);
});
