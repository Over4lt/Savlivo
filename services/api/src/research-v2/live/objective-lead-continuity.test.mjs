import '../offline-replay/offline-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {providerOrBrandResearchTarget} from '../../research-v3/research-target.mjs';
import {discoverProviderResourceCandidates} from '../../research-v3/provider-bootstrap.mjs';
import {providerSeedObjectiveLeads} from '../inventory/provider-seed-campaign.mjs';
import {planResearch} from './research-planner.mjs';
import {providerRoutingAuthority} from './provider-routing-authority.mjs';
import {providerRoutingSnapshot,summarizeProviderRoutingProgress} from './provider-resource-routing.mjs';

const market='DE',host='northstar.example',membership=`https://${host}/membership`,terms=`https://${host}/terms`,social='https://social.example/northstar';
const researchTarget=providerOrBrandResearchTarget({seedName:'Northstar',targetMarket:market});
const binding={contractVersion:1,researchTarget,host,providerIdentity:{presentationName:'Northstar GmbH'},proof:{url:terms,scope:'EXACT_HOST_PROVIDER_SOURCING'}};
const lead=(url,extra={})=>({url,title:'Northstar membership pricing',providerSeedObjectiveLead:true,objectiveIntent:'SUBSCRIPTION_PRICE',objectiveRelevance:16,objectiveScore:16,objectiveProgressValue:16,targetMarket:market,acquisitionStatus:'UNREAD',authorityStatus:new URL(url).hostname===host?'EXACT_HOST_ESTABLISHED':'UNRESOLVED',canContributeEvidence:false,evidenceStatus:'DISCOVERY_LEAD_ONLY',authoritative:false,truthAuthority:'NONE',...extra});
const context=(leads=[lead(membership)])=>({contractVersion:1,kind:'CANDIDATE_SERVICE_RESEARCH_CONTEXT',serviceId:'candidate-northstar',candidateId:'candidate-northstar',serviceName:'Northstar GmbH',status:'SERVICE_UNRESOLVED',truthAuthority:'NONE',admitted:false,researchPermission:false,providerRelationship:{kind:'CANDIDATE_UNDER_REVIEWED_PROVIDER',host,bindingReference:binding},objective:{kind:'SUBSCRIPTION_PRICE',market,seedName:'Northstar'},objectiveResource:{url:leads[0]?.url??terms,observation:null,sha256:null,acquired:false,authorityEstablished:new URL(leads[0]?.url??terms).hostname===host,selection:'PROVIDER_SEED_OBJECTIVE_RELEVANCE'},objectiveLeads:leads,sourceObservations:[]});
const target=(leads=[lead(membership)],extra={})=>({id:'northstar-DE',service:'candidate-northstar',serviceName:'Northstar GmbH',market,researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},providerSeedResearchTarget:researchTarget,providerSeedCandidateServiceContext:context(leads),urls:[membership,terms],knownCommercialUrls:[membership,terms],authorities:[{hostname:host,provider:'Northstar GmbH',sourceType:'OFFICIAL_PROVIDER',sourceUrl:terms,checkedAt:'2026-10-13T00:00:00.000Z'}],leads,reads:[],queries:[],decisions:[],blockedOrigins:[],verified:[],gaps:['plan','amount','currency','cadence','priceRole','ownership','market'],capabilities:{direct:true,tavily:true,decodo:true,browser:true,groq:false},...extra});
const candidate=(id,url,extra={})=>({candidateId:id,url,host:new URL(url).hostname,searchIndex:0,resultIndex:0,searchRank:0,insertionOrder:0,originKind:'OBJECTIVE_SEARCH',truthAuthority:'NONE',providerAuthority:'NONE',objectiveIntent:'SUBSCRIPTION_PRICE',objectiveRelevance:16,score:16,discoveryContext:{title:'Northstar membership pricing',discoveryOnly:true},navigationDepth:0,...extra});

test('A discovered but unread objective lead crosses binding and remains executable',async()=>{
 const discovery=await discoverProviderResourceCandidates({researchTarget,search:async()=>({results:[{url:terms,title:'Northstar terms'},{url:membership,title:'Northstar membership pricing'}]}),bounds:{searches:1,candidates:12}});assert.equal(discovery.candidates.length,2);
 const state={discovery:{candidates:discovery.candidates},candidateReviews:[{candidateId:discovery.candidates[0].candidateId,url:terms,host,status:'ESTABLISHED',reason:'FIRST_PARTY_PRESENTATION',readOrdinal:1,observationMetadata:{id:'terms'},bodyReference:{path:'terms'}}]},leads=providerSeedObjectiveLeads(researchTarget,binding,state,16),membershipLead=leads.find(row=>row.url===membership);assert.equal(membershipLead.acquisitionStatus,'UNREAD');const value=target(leads);value.providerSeedCandidateServiceContext=context(leads);const plan=planResearch(value);assert.equal(plan.route,'DIRECT');assert.equal(plan.url,membership);
});

test('B related-host objective lead survives as Research without authority inheritance',()=>{
 const related='https://de.northstar.example/membership',relatedLead=lead(related,{providerAffinity:{kind:'RELATED_PROVIDER_CANDIDATE',hostnameAffinity:3,boundHost:host,candidateHost:'de.northstar.example'},authorityStatus:'UNRESOLVED'}),value=target([relatedLead],{urls:[terms]});value.providerSeedCandidateServiceContext=context([relatedLead]);const plan=planResearch(value,{unreadUrls:value.leads.map(row=>row.url),executionContext:{bounds:{perServiceReads:4,reads:24,perServiceSearches:2,searches:8,perServiceAcquisitions:3,acquisitions:8,bytes:1024,bytesPerPage:1024},usage:{reads:0,searches:0,acquisitions:0,bytes:0}}});assert.equal(plan.route,'AUTHORITY_DISCOVERY');assert.equal(plan.reason,'OBJECTIVE_LEAD_AUTHORITY_RESEARCH');assert.equal(plan.url,related);assert.equal(providerRoutingAuthority(value,related),null);
});

test('C multi-gap resource set retains authority and commercial resources together',()=>{
 const state={discovery:{candidates:[candidate('membership',membership),candidate('terms',terms,{originKind:'SOURCE_BOUND_CONTINUATION',objectiveRelevance:16,score:16,discoveryContext:{title:'Terms',discoveryOnly:true}})]},candidateReviews:[{candidateId:'membership',url:membership,host,status:'UNRESOLVED',reason:'PROVIDER_AUTHORITY_UNRESOLVED',readOrdinal:1,observationMetadata:{id:'membership'},bodyReference:{path:'membership'}},{candidateId:'terms',url:terms,host,status:'ESTABLISHED',reason:'FIRST_PARTY_PRESENTATION',readOrdinal:2,observationMetadata:{id:'terms'},bodyReference:{path:'terms'}}]},leads=providerSeedObjectiveLeads(researchTarget,binding,state,16);assert.deepEqual(leads.map(row=>row.url).sort(),[membership,terms].sort());assert.equal(leads.find(row=>row.url===membership).canContributeEvidence,true);assert.equal(leads.find(row=>row.url===terms).authorityStatus,'EXACT_HOST_ESTABLISHED');
});

test('D authority completion resumes the original price objective',()=>{
 const value=target();value.reads=[{requestedUrl:terms,url:terms,outcome:'OK'}];const plan=planResearch(value);assert.equal(plan.route,'DIRECT');assert.equal(plan.url,membership);assert.equal(plan.objective,'PRICE_OFFERING_DISCOVERY');
});

test('E country selection chooses commercial objective resource over terms',()=>{
 const value=target(),truth={needs:[{id:'price-market',proposition:'TARGET_MARKET',market,state:'UNRESOLVED'}]},observation={id:'membership-observation',kind:'PROVIDER',url:membership,sha256:'a'.repeat(64),context:{transport:'DIRECT',networkGeography:'UNBOUND',representation:'PROVIDER_PAGE'}};value.reads=[{requestedUrl:membership,url:membership,outcome:'OK',bodyHash:observation.sha256,sourceIntegrity:{sha256:observation.sha256},accessDecisions:[{decision:'ALLOWED'}]}];value.providerInterpretations=[{url:membership,v3Truth:truth,v3Observation:observation}];value.v3Truth=truth;value.leads.push({url:terms,title:'Legal terms'});const plan=planResearch(value);assert.equal(plan.route,'DECODO');assert.equal(plan.url,membership);
});

test('F known unread objective lead outranks generic source-bound continuation',()=>{
 const value=target();value.leads.push({url:social,title:'Social',sourceBoundCandidate:true,continuationScore:99,truthAuthority:'NONE',authoritative:false,source:{observation:'terms',bodySha256:'b'.repeat(64),start:0,end:5,sha256:'c'.repeat(64)},from:{url:terms,bodyHash:'b'.repeat(64),locator:{observation:'terms',sha256:'c'.repeat(64)},mechanism:'V3_SOURCE_BOUND_CONTINUATION'}});const plan=planResearch(value);assert.equal(plan.route,'DIRECT');assert.equal(plan.url,membership);
});

test('G successful legal read is not price progress after authority is resolved',()=>{
 const value=target(),before=providerRoutingSnapshot(value),summary=summarizeProviderRoutingProgress({target:value,before,page:{url:terms,requestedUrl:terms,bodyHash:'d'.repeat(64)},lead:{url:terms,title:'Legal terms'}});assert.equal(summary.outcome,'NO_PROGRESS');assert.equal(summary.routingRole,'GENERAL_PROVIDER');
});

test('H unread search lead remains non-evidence',()=>{
 const value=target();assert.equal(value.providerSeedCandidateServiceContext.objectiveLeads[0].evidenceStatus,'DISCOVERY_LEAD_ONLY');assert.equal(value.providerSeedCandidateServiceContext.objectiveLeads[0].canContributeEvidence,false);assert.equal(value.v3Truth,undefined);assert.equal(value.verified.length,0);
});

test('I related-host lead remains non-authoritative until independently reviewed',()=>{
 const related='https://de.northstar.example/membership',value=target([lead(related,{authorityStatus:'UNRESOLVED'})],{urls:[terms]});assert.equal(providerRoutingAuthority(value,related),null);assert.equal(value.providerSeedCandidateServiceContext.truthAuthority,'NONE');assert.equal(value.providerSeedCandidateServiceContext.admitted,false);
});

test('J true exhaustion stops after meaningful leads are attempted and no capability remains',()=>{
 const value=target([],{urls:[],knownCommercialUrls:[],leads:[],capabilities:{direct:false,tavily:false,decodo:false,browser:false,groq:false}});value.providerSeedCandidateServiceContext=context([]);const plan=planResearch(value);assert.equal(plan.route,'STOP');assert.match(plan.reason,/CAPABILITY_DISABLED_TAVILY|DISCOVERY_EXHAUSTED/);
});
