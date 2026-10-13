import test from 'node:test';
import assert from 'node:assert/strict';
import {assessAdaptiveService,initializeAdaptiveState} from '../inventory/adaptive-campaign.mjs';
import {destinationInformation} from './information-routing.mjs';
import {executableAction} from './execution-capabilities.mjs';
import {planResearch} from './research-planner.mjs';

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
