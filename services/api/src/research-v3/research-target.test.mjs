import test from 'node:test';
import assert from 'node:assert/strict';
import {digest} from './model.mjs';
import {reviewCandidateAuthority,reviewProviderSeedAuthority} from './provider-authority-review.mjs';
import {discoverResearchTargetCandidates,researchInputFromCandidates,reviewProviderSeedCandidate} from './provider-bootstrap.mjs';
import {createResearchTarget,knownServiceResearchTarget,providerOrBrandResearchTarget,providerSeedCampaignState,researchTargetFromLegacyService,researchTargetKinds,serviceDiscoveryObjective,serviceObjectiveForResearchTarget} from './research-target.mjs';
import {providerScopedRoutingRecord} from '../research-v2/live/hybrid-provider-resource-memory.mjs';
import {evaluate} from './truth.mjs';
import {refreshCatalog} from './subscription-catalog.mjs';

const market='DE',host='northstar.example',url=`https://${host}/about`;
const jsonLd=value=>`<script type="application/ld+json">${JSON.stringify(value)}</script>`;
const organizationAndBrand=jsonLd({'@context':'https://schema.org','@type':'Organization',name:'Northstar Holdings',url:`https://${host}`,brand:{'@type':'Brand',name:'Northstar'}});
const serviceAndProvider=jsonLd({'@context':'https://schema.org','@graph':[{'@id':'#service','@type':'Service',name:'Northstar Plus',provider:{'@id':'#provider'}},{'@id':'#provider','@type':'Organization',name:'Northstar Holdings',url:`https://${host}`}]});
const observation=(body=organizationAndBrand,overrides={})=>({id:'candidate-1',kind:'CANDIDATE',authority:'UNREVIEWED_CANDIDATE',url,context:{transport:'DIRECT',networkGeography:'UNBOUND',representation:'CANDIDATE_PAGE'},outcome:'OK',truncated:false,completeness:'COMPLETE',format:'WEB',contentType:'text/html',httpStatus:200,access:[{decision:'ALLOWED'}],body,sha256:digest(body),...overrides});
const providerTarget=()=>providerOrBrandResearchTarget({seedName:'Northstar',targetMarket:market});
const providerBinding=()=>reviewProviderSeedAuthority(observation(),providerTarget(),{candidateHosts:[host]});

test('legacy catalog target enters as KNOWN_SERVICE with exact service identity and default seed',()=>{
 const legacy={service:'northstar-plus',serviceName:'Northstar Plus',market};
 const target=researchTargetFromLegacyService(legacy);
 assert.deepEqual(target,{targetKind:'KNOWN_SERVICE',seedName:'Northstar Plus',targetMarket:market,serviceId:'northstar-plus',serviceName:'Northstar Plus'});
 assert.equal(target.serviceId,legacy.service);assert.equal(target.serviceName,legacy.serviceName);
 const objective=serviceObjectiveForResearchTarget(target,{candidateHosts:[host],seeds:[url]});
 assert.equal(objective.serviceId,'northstar-plus');assert.equal(objective.serviceName,'Northstar Plus');assert.deepEqual(objective.markets,[market]);
});

test('known-service discovery remains a normal V3 service objective',async()=>{
 const target=knownServiceResearchTarget({serviceId:'northstar-plus',serviceName:'Northstar Plus',targetMarket:market});
 const discovery=await discoverResearchTargetCandidates({researchTarget:target,search:async()=>({results:[{url}]})});
 const input=researchInputFromCandidates(discovery);
 assert.equal(input.objective.serviceId,target.serviceId);assert.equal(input.objective.serviceName,target.serviceName);
 assert.deepEqual(input.objective.candidateHosts,[host]);assert.deepEqual(input.objective.providerHosts,[]);
});

test('existing known-service source-bound service to provider proof remains valid',()=>{
 const objective=serviceObjectiveForResearchTarget(knownServiceResearchTarget({serviceId:'northstar-plus',serviceName:'Northstar Plus',targetMarket:market}),{candidateHosts:[host],seeds:[url]});
 const binding=reviewCandidateAuthority(observation(serviceAndProvider),objective);
 assert.equal(binding.reason,'STRUCTURED_EXACT_ORIGIN_RELATED_IDENTITY');assert.equal(binding.serviceId,'northstar-plus');assert.equal(binding.serviceName,'Northstar Plus');assert.equal(binding.host,host);
});

test('known-service offering Truth and SERVICE_MARKET catalog semantics remain unchanged',()=>{
 const target=knownServiceResearchTarget({serviceId:'northstar-plus',serviceName:'Northstar Plus',targetMarket:market}),objective=serviceObjectiveForResearchTarget(target,{providerHosts:[host],seeds:[url]});
 const source={serviceId:target.serviceId,offers:[{id:'monthly',amount:12,currency:'EUR',cadence:'MONTHLY',billingCadence:'MONTHLY',consumer:true,relationship:'SUBSCRIPTION',role:'ORDINARY',market}],catalog:{scope:'SERVICE_MARKET',coverage:'COMPLETE',market,offerIds:['monthly']}},body=JSON.stringify(source);
 const provider={id:'provider-1',kind:'PROVIDER',authority:'REVIEWED_PROVIDER',url,context:{transport:'DIRECT',networkGeography:'UNBOUND',representation:'PROVIDER_PAGE'},outcome:'OK',truncated:false,completeness:'COMPLETE',format:'JSON',contentType:'application/json',httpStatus:200,access:[{decision:'ALLOWED'}],body,sha256:digest(body),candidates:[{kind:'SERVICE',pointer:''},{kind:'OFFER',pointer:'/offers/0'}]};
 const knowledge={objective,observations:[provider],attempts:[],policyBlocks:[],stop:null},truth=evaluate(knowledge),catalog=refreshCatalog(knowledge,truth);
 assert.equal(truth.established,true);assert.equal(truth.offers[0].propositions.PRICE_AMOUNT.value,12);assert.equal(catalog.state,'CATALOG_EXHAUSTED');assert.equal(catalog.scopeEvidence[0].market,market);
});

test('provider or brand seed carries no service identity and cannot create a V3 service objective',async()=>{
 const target=providerTarget();
 assert.deepEqual(target,{targetKind:'PROVIDER_OR_BRAND_SEED',seedName:'Northstar',targetMarket:market});
 assert.equal(Object.hasOwn(target,'serviceId'),false);assert.equal(Object.hasOwn(target,'serviceName'),false);
 assert.throws(()=>serviceObjectiveForResearchTarget(target),/SUBSCRIPTION_SERVICE_DISCOVERY_REQUIRED/);
 assert.throws(()=>createResearchTarget({...target,serviceName:'Northstar'}),/PROVIDER_SEED_CANNOT_DECLARE_SERVICE/);
 const discovery=await discoverResearchTargetCandidates({researchTarget:target,search:async()=>({results:[{url}]})});
 assert.equal(Object.hasOwn(discovery,'service'),false);assert.equal(Object.hasOwn(discovery,'serviceName'),false);assert.equal(JSON.stringify(discovery).includes('northstar"'),false);
 assert.throws(()=>researchInputFromCandidates(discovery),/SUBSCRIPTION_SERVICE_DISCOVERY_REQUIRED/);
});

test('provider identity is source-established and is not copied from the seed',()=>{
 const binding=providerBinding();
 assert.equal(binding.providerIdentity.presentationName,'Northstar Holdings');assert.notEqual(binding.providerIdentity.presentationName,binding.researchTarget.seedName);
 assert.equal(binding.proof.reason,'STRUCTURED_EXACT_ORIGIN_RELATED_IDENTITY');assert.equal(binding.proof.scope,'EXACT_HOST_PROVIDER_SOURCING');assert.equal(binding.host,host);
 assert.equal(Object.hasOwn(binding,'serviceId'),false);assert.equal(Object.hasOwn(binding,'serviceName'),false);
 assert.equal(binding.providerIdentity.source.bodySha256,digest(organizationAndBrand));
});

test('provider-seed review requires the discovered exact host',()=>{
 assert.throws(()=>reviewProviderSeedAuthority(observation(),providerTarget()),/CANDIDATE_HOSTS_REQUIRED/);
 assert.equal(reviewProviderSeedAuthority(observation(),providerTarget(),{candidateHosts:['other.example']}),null);
});

test('candidate discovery and source review establish ProviderBinding without a Service',async()=>{
 const target=providerTarget(),discovery=await discoverResearchTargetCandidates({researchTarget:target,search:async()=>({results:[{url}]})});
 const binding=reviewProviderSeedCandidate(discovery,observation()),state=providerSeedCampaignState(target,{providerAuthorityBinding:binding});
 assert.equal(state.providerAuthority.status,'ESTABLISHED');assert.deepEqual(state.services,[]);
 assert.deepEqual(state.serviceDiscovery,{objective:serviceDiscoveryObjective,status:'PROVIDER_ESTABLISHED_SERVICE_DISCOVERY_REQUIRED'});
 assert.equal(state.productionEligible,false);assert.equal(Object.hasOwn(state,'catalog'),false);
});

test('provider binding alone establishes neither market nor subscription availability',()=>{
 const state=providerSeedCampaignState(providerTarget(),{providerAuthorityBinding:providerBinding()});
 assert.equal(state.researchTarget.targetMarket,market);assert.equal(state.productionEligible,false);assert.deepEqual(state.services,[]);
 assert.equal(JSON.stringify(state).includes('availabilityEstablished'),false);assert.equal(Object.hasOwn(state,'truth'),false);assert.equal(Object.hasOwn(state,'catalog'),false);
});

test('provider-scoped routing memory represents discovery without manufacturing a Service',()=>{
 const record=providerScopedRoutingRecord({researchTarget:providerTarget(),providerAuthorityBinding:providerBinding(),url,observedAt:'2026-10-11T00:00:00.000Z'});
 assert.equal(record.scope,'PROVIDER');assert.equal(record.service,null);assert.equal(record.resource.role,'SERVICE_DISCOVERY');assert.equal(record.resource.reacquisition,'REQUIRED');
 assert.equal(record.host,host);assert.equal(record.marketContext.targetMarket,market);assert.equal(record.marketContext.availabilityEstablished,false);
 for(const forbidden of ['truth','catalog','price','offering'])assert.equal(Object.hasOwn(record,forbidden),false);
 assert.throws(()=>providerSeedCampaignState(providerTarget(),{providerResources:[record]}),/PROVIDER_BINDING_REQUIRED/);
 assert.equal(providerSeedCampaignState(providerTarget(),{providerAuthorityBinding:providerBinding(),providerResources:[record]}).providerResources.length,1);
 assert.throws(()=>providerScopedRoutingRecord({researchTarget:providerTarget(),providerAuthorityBinding:providerBinding(),url:'https://other.example/',observedAt:'2026-10-11T00:00:00.000Z'}),/PROVIDER_RESOURCE_SCOPE_INVALID/);
});

test('hardware or article evidence cannot become a Service merely because provider authority exists',()=>{
 const hardware=jsonLd({'@type':'Product',name:'Northstar',manufacturer:{'@type':'Organization',name:'Northstar Hardware Inc',url:`https://${host}`}}),binding=reviewProviderSeedAuthority(observation(hardware),providerTarget(),{candidateHosts:[host]});
 assert.equal(binding.providerIdentity.presentationName,'Northstar Hardware Inc');assert.deepEqual(providerSeedCampaignState(providerTarget(),{providerAuthorityBinding:binding}).services,[]);
 const article='<article>Northstar is a popular product and subscription.</article>';
 assert.equal(reviewProviderSeedAuthority(observation(article),providerTarget(),{candidateHosts:[host]}),null);
});

test('two future Services under one Provider stay separate and cannot collapse into the seed',()=>{
 const first=knownServiceResearchTarget({serviceId:'northstar-one',serviceName:'Northstar One',targetMarket:market,seedName:'Northstar'}),second=knownServiceResearchTarget({serviceId:'northstar-two',serviceName:'Northstar Two',targetMarket:market,seedName:'Northstar'});
 const a=serviceObjectiveForResearchTarget(first,{providerHosts:[host]}),b=serviceObjectiveForResearchTarget(second,{providerHosts:[host]});
 assert.notEqual(a.serviceId,b.serviceId);assert.notEqual(a.serviceName,b.serviceName);assert.deepEqual(a.providerHosts,b.providerHosts);assert.equal(a.serviceName==='Northstar'||b.serviceName==='Northstar',false);
});

test('provider with no admitted Service has discovery state but no empty pseudo-catalog',()=>{
 const unresolved=providerSeedCampaignState(providerTarget());assert.equal(unresolved.providerAuthority.status,'UNRESOLVED');assert.equal(unresolved.serviceDiscovery.status,'PROVIDER_AUTHORITY_REQUIRED');assert.deepEqual(unresolved.services,[]);assert.equal(Object.hasOwn(unresolved,'catalog'),false);
 const established=providerSeedCampaignState(providerTarget(),{providerAuthorityBinding:providerBinding()});assert.deepEqual(established.services,[]);assert.equal(Object.hasOwn(established,'catalog'),false);
});

test('target kinds are explicit and closed',()=>{
 assert.deepEqual(researchTargetKinds,{KNOWN_SERVICE:'KNOWN_SERVICE',PROVIDER_OR_BRAND_SEED:'PROVIDER_OR_BRAND_SEED'});
 assert.throws(()=>createResearchTarget({targetKind:'BRAND',seedName:'Northstar',targetMarket:market}),/RESEARCH_TARGET_INVALID/);
});
