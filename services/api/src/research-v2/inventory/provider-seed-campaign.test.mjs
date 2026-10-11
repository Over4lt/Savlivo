import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {digest} from '../../research-v3/model.mjs';
import {providerOrBrandResearchTarget} from '../../research-v3/research-target.mjs';
import {evaluateDirectProviderTruth,validateDirectProviderPage} from '../live/direct-provider-evidence.mjs';
import {providerRoutingAuthority} from '../live/provider-routing-authority.mjs';
import {initializeAdaptiveState,runAdaptiveCampaign} from './adaptive-campaign.mjs';
import {runProviderSeedCampaign} from './provider-seed-campaign.mjs';

const host='northstar.example',candidateUrl=`https://${host}/`,catalogUrl=`https://${host}/catalog`,market='DE';
const researchTarget=()=>providerOrBrandResearchTarget({seedName:'Northstar',targetMarket:market});
const authorityBody='<html><head><script type="application/ld+json">'+JSON.stringify({'@context':'https://schema.org','@type':'Organization',name:'Northstar',url:candidateUrl})+'</script></head><body>Northstar</body></html>';
const service=(name)=>({'@type':'SoftwareApplication',name,description:'Consumer subscription service',offers:{'@type':'OfferCatalog',name:'Subscription plans',itemListElement:[{'@type':'Offer',name:'Monthly',priceSpecification:{'@type':'UnitPriceSpecification',billingDuration:'P1M'}}]}});
const discoveryBody=(names,{complete=true}={})=>JSON.stringify({'@graph':names.map(service),...(complete?{subscriptionServiceCatalog:{scope:'PROVIDER_SUBSCRIPTION_SERVICES',coverage:'COMPLETE',serviceIds:names.map(name=>name.toLowerCase())}}:{})});
const childBody=(id,index=0)=>JSON.stringify({serviceId:id,offers:[{id:id+'-monthly',amount:12+index,currency:'EUR',cadence:'MONTHLY',billingCadence:'MONTHLY',consumer:true,relationship:'SUBSCRIPTION',role:'ORDINARY',market}],catalog:{scope:'SERVICE_MARKET',coverage:'COMPLETE',market,offerIds:[id+'-monthly']}});
const page=(url,body,contentType=url===candidateUrl?'text/html':'application/json')=>({url,requestedUrl:url,outcome:'OK',httpStatus:200,contentType,truncated:false,body,sourceIntegrity:{sha256:digest(body)},accessDecisions:[{decision:'ALLOWED'}]});
const temp=t=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'provider-seed-campaign-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;};

function adapters({names=['Orbit'],complete=true,calls=[],memoryRead=false}={}){
 return async ({stage})=>stage==='PROVIDER_SEED'?{
  search:async ({query})=>{calls.push({stage,route:'SEARCH',query});return {results:[{url:candidateUrl,title:'Northstar'}]};},
  read:async ({url,role})=>{calls.push({stage,route:'READ',url,role});if(role==='CANDIDATE_AUTHORITY_SOURCE')return page(candidateUrl,authorityBody);assert.equal(url,memoryRead?catalogUrl:bindingUrl());return page(catalogUrl,discoveryBody(names,{complete}));}
 }:{
  search:async ({query})=>{calls.push({stage,route:'SEARCH',query});return {results:[]};},
  read:async ({target})=>{calls.push({stage,route:'READ',service:target.service});const index=names.map(name=>name.toLowerCase()).indexOf(target.service);return page(catalogUrl,childBody(target.service,index));},
  consumeProvider:async args=>({...evaluateDirectProviderTruth({target:args.target,retained:validateDirectProviderPage(args)}),classification:'V3_NATIVE_PROVIDER_SOURCE',verified:[],blockers:[],monetary:1,needsGeo:false})
 };
}
const bindingUrl=()=>candidateUrl;

test('production-shaped provider seed autonomously reaches one KNOWN_SERVICE child and existing V3 Truth/catalog',async t=>{
 const directory=temp(t),calls=[],result=await runProviderSeedCampaign({directory,researchTarget:researchTarget(),createAdapters:adapters({calls})});
 assert.equal(result.providerAuthorityBinding.host,host);assert.equal(result.serviceDiscovery.status,'SERVICE_DISCOVERY_EXHAUSTED');assert.deepEqual(result.discoveredServices.map(row=>row.serviceId),['orbit']);assert.equal(result.children[0].target.service,'orbit');assert.equal(result.children[0].target.providerSeedAuthorityHandoff.service.serviceId,'orbit');
 assert.equal(Object.hasOwn(result.children[0].target,'marketProof'),false);assert.equal(Object.hasOwn(result.providerAuthorityBinding,'market'),false);const adaptiveTarget=result.adaptive.targets[result.children[0].targetId];assert.equal(providerRoutingAuthority(adaptiveTarget,catalogUrl).host,host);assert.equal(providerRoutingAuthority(adaptiveTarget,'https://billing.northstar.example/catalog'),null);
 assert.equal(result.lifecycle.results[0].offerings[0].ordinaryRecurringPrice.amount,12);assert.equal(result.lifecycle.results[0].catalog.state,'CATALOG_EXHAUSTED');assert.equal(result.lifecycle.complete,true);assert.equal(result.lifecycle.productionEligible,false);assert.equal(Object.hasOwn(result.researchTarget,'serviceId'),false);
 assert.deepEqual(calls.map(row=>row.route),['SEARCH','SEARCH','READ','READ','READ']);assert.equal(result.lifecycle.usage.reads,3);assert.equal(result.lifecycle.usage.searches,2);assert.equal(result.adaptive.budgetScope,'CAMPAIGN');assert.equal(result.adaptive.initialUsage.reads,2);
});

test('two discovered Services keep stable distinct children, Truth, catalogs and one shared budget',async t=>{
 const directory=temp(t),result=await runProviderSeedCampaign({directory,researchTarget:researchTarget(),createAdapters:adapters({names:['Orbit','Pulse']})}),rows=result.lifecycle.results.sort((a,b)=>a.serviceId.localeCompare(b.serviceId));
 assert.deepEqual(result.discoveredServices.map(row=>row.serviceId),['orbit','pulse']);assert.equal(new Set(result.children.map(row=>row.targetId)).size,2);assert.deepEqual(rows.map(row=>[row.serviceId,row.offerings[0].ordinaryRecurringPrice.amount]),[['orbit',12],['pulse',13]]);assert.ok(rows.every(row=>row.catalog.state==='CATALOG_EXHAUSTED'));assert.equal(result.lifecycle.usage.reads,4);assert.equal(result.adaptive.bounds.reads,4);assert.equal(result.lifecycle.children.some(row=>row.truth?.offers?.some(offer=>offer.id.startsWith(row.serviceId==='orbit'?'pulse':'orbit'))),false);
});

test('authoritative zero and insufficient evidence produce no fake Service or catalog',async t=>{
 const exhausted=await runProviderSeedCampaign({directory:path.join(temp(t),'zero'),researchTarget:researchTarget(),createAdapters:adapters({names:[]})});assert.equal(exhausted.serviceDiscovery.status,'SERVICE_DISCOVERY_EXHAUSTED');assert.deepEqual(exhausted.children,[]);assert.equal(exhausted.lifecycle.complete,true);assert.deepEqual(exhausted.lifecycle.results,[]);
 const unresolved=await runProviderSeedCampaign({directory:path.join(temp(t),'unresolved'),researchTarget:researchTarget(),createAdapters:adapters({names:[],complete:false})});assert.equal(unresolved.serviceDiscovery.status,'SERVICE_DISCOVERY_UNRESOLVED');assert.deepEqual(unresolved.children,[]);assert.equal(unresolved.lifecycle.complete,false);assert.equal(unresolved.lifecycle.termination.kind,'OPEN_RELEVANT_SPACE');
});

test('partial shared capacity preserves both children and exposes the pending child without multiplying reads',async t=>{
 const result=await runProviderSeedCampaign({directory:temp(t),researchTarget:researchTarget(),createAdapters:adapters({names:['Orbit','Pulse']}),limits:{reads:3}});assert.equal(result.discoveredServices.length,2);assert.equal(result.lifecycle.usage.reads,3);assert.equal(result.lifecycle.children.filter(row=>row.status==='RESEARCHED').length,1);assert.equal(result.lifecycle.children.filter(row=>row.status==='PENDING_CAPACITY').length,1);assert.equal(result.lifecycle.complete,false);assert.equal(result.lifecycle.termination.kind,'BUDGET_LIMITED');
});

test('restart revalidates authority and Service admission, keeps child IDs, and continues without replaying completed Truth',async t=>{
 const directory=temp(t),calls=[],factory=adapters({names:['Orbit','Pulse'],calls}),first=await runProviderSeedCampaign({directory,researchTarget:researchTarget(),createAdapters:factory,maxChildActions:1}),ids=first.children.map(row=>row.targetId),firstChildReads=calls.filter(row=>row.stage==='KNOWN_SERVICE_CHILD').length;
 assert.equal(firstChildReads,1);const resumed=await runProviderSeedCampaign({directory,researchTarget:researchTarget(),createAdapters:factory});assert.deepEqual(resumed.children.map(row=>row.targetId),ids);assert.equal(new Set(resumed.children.map(row=>row.targetId)).size,2);assert.equal(calls.filter(row=>row.stage==='PROVIDER_SEED'&&row.route==='READ').length,2);assert.equal(calls.filter(row=>row.stage==='KNOWN_SERVICE_CHILD').length,2);assert.equal(resumed.lifecycle.results.length,2);
});

test('provider memory restores only authority/routing and still performs a fresh provider acquisition',async t=>{
 const root=temp(t),memory=path.join(root,'memory'),firstCalls=[],secondCalls=[];await runProviderSeedCampaign({directory:path.join(root,'first'),researchTarget:researchTarget(),createAdapters:adapters({calls:firstCalls}),providerSeedMemoryRoot:memory,memoryNow:'2026-10-11T00:00:00.000Z'});
 const second=await runProviderSeedCampaign({directory:path.join(root,'second'),researchTarget:researchTarget(),createAdapters:adapters({calls:secondCalls,memoryRead:true}),providerSeedMemoryRoot:memory,memoryNow:'2026-10-11T01:00:00.000Z'});assert.equal(secondCalls.some(row=>row.stage==='PROVIDER_SEED'&&row.route==='SEARCH'),false);assert.equal(secondCalls.some(row=>row.role==='CANDIDATE_AUTHORITY_SOURCE'),false);assert.equal(secondCalls.filter(row=>row.role==='PROVIDER_SOURCE').length,1);assert.equal(second.lifecycle.results.length,1);const stored=fs.readFileSync(path.join(memory,'provider-seed-resources.json'),'utf8');assert.equal(stored.includes('orbit'),false);assert.equal(stored.includes('v3Truth'),false);
});

test('ordinary KNOWN_SERVICE adaptive entry keeps its compatible state shape and per-service budget',async t=>{
 const target={id:'known',service:'known',serviceName:'Known',market:'DE',researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},urls:[],authorities:[],capabilities:{direct:false,tavily:false,decodo:false,browser:false,groq:false}},manifest={targets:[target],conditionalFollowupTargets:[]},initialized=initializeAdaptiveState(manifest);assert.equal(Object.hasOwn(initialized,'budgetScope'),false);assert.equal(initialized.turn,0);
 const result=await runAdaptiveCampaign({directory:temp(t),manifest,limits:{reads:0,searches:0,acquisitions:0},createAdapters:async()=>assert.fail('no adapter')});assert.equal(Object.hasOwn(result,'budgetScope'),false);assert.equal(result.services.known.stop.kind,'RESEARCH_OPTIMAL_STOP');
});

test('provider-seed routing independently reacquires a regional redirect before binding and enters Service discovery within four reads',async t=>{
 const directory=temp(t),seed='Aster',official='https://aster-labs.example/',regional='https://de.aster-labs.example/',regionalHost=new URL(regional).hostname,authority='<script type="application/ld+json">'+JSON.stringify({'@context':'https://schema.org','@type':'Organization',name:'Aster Holdings',url:regional,brand:{'@type':'Brand',name:seed}})+'</script>',provider=discoveryBody(['Orbit']),calls=[];
 const response=(requested,url,body,contentType='text/html')=>({requestedUrl:requested,url,redirects:requested===url?[]:[url],outcome:'OK',httpStatus:200,contentType,truncated:false,rawSource:{text:body},sourceIntegrity:{sha256:digest(body)},accessDecisions:[{decision:'ALLOWED'}]});
 const factory=async({stage})=>stage==='PROVIDER_SEED'?{
  search:async()=>({results:[{url:'https://encyclopedia.example/aster'},{url:'https://aster.ca.us/'},{url:official}]}),
  read:async({url,role})=>{calls.push({stage,url,role});if(role==='PROVIDER_SOURCE')return response(regional,regional,provider,'application/json');if(url===official)return response(official,regional,authority);if(url===regional)return response(regional,regional,authority);return response(url,url,'<main>Unrelated directory</main>');}
 }:{search:async()=>({results:[]}),read:async({target})=>{calls.push({stage,service:target.service});return response(regional,regional,childBody(target.service),'application/json');},consumeProvider:async args=>({...evaluateDirectProviderTruth({target:args.target,retained:validateDirectProviderPage(args)}),classification:'V3_NATIVE_PROVIDER_SOURCE',verified:[],blockers:[],monetary:1,needsGeo:false})};
 const result=await runProviderSeedCampaign({directory,researchTarget:providerOrBrandResearchTarget({seedName:seed,targetMarket:market}),createAdapters:factory,limits:{reads:4}});
 assert.deepEqual(calls.filter(row=>row.stage==='PROVIDER_SEED').map(row=>[row.url,row.role]),[[official,'CANDIDATE_AUTHORITY_SOURCE'],[regional,'CANDIDATE_AUTHORITY_SOURCE'],[regional,'PROVIDER_SOURCE']]);
 assert.deepEqual(result.candidateReviews.map(row=>row.status),['REDIRECTED','ESTABLISHED']);assert.equal(result.candidateReviews[0].redirectCandidateId,result.discovery.candidates.find(row=>row.originKind==='REDIRECT_DESTINATION').candidateId);assert.equal(result.providerAuthorityBinding.host,regionalHost);assert.equal(result.providerAuthorityBinding.proof.url,regional);assert.equal(result.providerAuthorityBinding.proof.scope,'EXACT_HOST_PROVIDER_SOURCING');assert.notEqual(result.providerAuthorityBinding.host,new URL(official).hostname);
 assert.deepEqual(result.discoveredServices.map(row=>row.serviceId),['orbit']);assert.equal(result.serviceDiscovery.status,'SERVICE_DISCOVERY_EXHAUSTED');assert.equal(result.children.length,1);assert.equal(result.children[0].researchTarget.targetKind,'KNOWN_SERVICE');assert.equal(result.lifecycle.usage.reads,4);assert.equal(result.lifecycle.usage.bytes,result.usage.bytes);
 const adaptiveTarget=result.adaptive.targets[result.children[0].targetId];assert.equal(providerRoutingAuthority(adaptiveTarget,regional).host,regionalHost);assert.equal(providerRoutingAuthority(adaptiveTarget,'https://sibling.'+regionalHost+'/catalog'),null);
});

test('aggregate candidate bytes remain bounded and every read receives only remaining allowance',async t=>{
 const directory=temp(t),allowances=[],urls=Array.from({length:4},(_,index)=>`https://pebble-${index}.example/`),factory=async({stage})=>{assert.equal(stage,'PROVIDER_SEED');return {search:async()=>({results:urls.map(url=>({url}))}),read:async({url,maxBytes})=>{allowances.push(maxBytes);return page(url,'xx');}};};
 const result=await runProviderSeedCampaign({directory,researchTarget:providerOrBrandResearchTarget({seedName:'Pebble',targetMarket:market}),createAdapters:factory,limits:{reads:4,bytes:8}});
 assert.deepEqual(allowances,[8,6,4,2]);assert.equal(result.usage.bytes,8);assert(result.usage.bytes<=8);assert.deepEqual(result.candidateReviews.map(row=>row.status),['UNRESOLVED','UNRESOLVED','UNRESOLVED','UNRESOLVED']);assert.deepEqual(result.termination,{kind:'BUDGET_LIMITED',reason:'PROVIDER_AUTHORITY_BYTE_BOUND'});
});

test('oversized final candidate cannot create complete evidence and restart preserves exhausted bytes',async t=>{
 const directory=temp(t),calls=[],urls=['https://quartz-one.example/','https://quartz-two.example/','https://quartz-three.example/'],factory=async()=>({search:async()=>({results:urls.map(url=>({url}))}),read:async({url,maxBytes})=>{calls.push({url,maxBytes});return page(url,'xx');}}),input={directory,researchTarget:providerOrBrandResearchTarget({seedName:'Quartz',targetMarket:market}),createAdapters:factory,limits:{reads:4,bytes:5}};
 const first=await runProviderSeedCampaign(input);assert.deepEqual(calls.map(row=>row.maxBytes),[5,3,1]);assert.equal(first.usage.bytes,5);assert.deepEqual(first.termination,{kind:'BUDGET_LIMITED',reason:'PROVIDER_AUTHORITY_BYTE_BOUND'});assert.equal(first.candidateReviews.at(-1).status,'CAPACITY_LIMITED');assert.equal(first.providerAuthorityBinding,null);
 const before=calls.length,second=await runProviderSeedCampaign(input);assert.equal(calls.length,before);assert.equal(second.usage.bytes,5);assert.deepEqual(second.termination,{kind:'BUDGET_LIMITED',reason:'PROVIDER_AUTHORITY_BYTE_BOUND'});
});

test('redirect candidates preserve the same aggregate byte budget',async t=>{
 const directory=temp(t),start='https://ember.example/',regional='https://de.ember.example/',allowances=[],factory=async()=>({search:async()=>({results:[{url:start}]}),read:async({url,maxBytes})=>{allowances.push(maxBytes);const body=url===start?'abc':'de';return {requestedUrl:url,url:url===start?regional:url,redirects:url===start?[regional]:[],outcome:'OK',httpStatus:200,contentType:'text/html',truncated:false,body,sourceIntegrity:{sha256:digest(body)},accessDecisions:[{decision:'ALLOWED'}]};}});
 const result=await runProviderSeedCampaign({directory,researchTarget:providerOrBrandResearchTarget({seedName:'Ember',targetMarket:market}),createAdapters:factory,limits:{reads:4,bytes:5}});assert.deepEqual(allowances,[5,2]);assert.equal(result.usage.bytes,5);assert.equal(result.discovery.candidates.filter(row=>row.originKind==='REDIRECT_DESTINATION').length,1);assert.deepEqual(result.termination,{kind:'BUDGET_LIMITED',reason:'PROVIDER_AUTHORITY_BYTE_BOUND'});
});
