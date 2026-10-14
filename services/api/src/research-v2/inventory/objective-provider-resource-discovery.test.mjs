import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {digest} from '../../research-v3/model.mjs';
import {discoverProviderResourceCandidates,providerResourceDiscoveryQuery} from '../../research-v3/provider-bootstrap.mjs';
import {providerOrBrandResearchTarget,serviceDiscoveryObjective} from '../../research-v3/research-target.mjs';
import {evaluateDirectProviderTruth,validateDirectProviderPage} from '../live/direct-provider-evidence.mjs';
import {orderProviderSeedAuthorityCandidates} from './provider-seed-authority-routing.mjs';
import {runProviderSeedCampaign} from './provider-seed-campaign.mjs';

const market='DE';
const temp=t=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'objective-provider-resource-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;};
const page=(url,body,contentType='text/html')=>({url,requestedUrl:url,outcome:'OK',httpStatus:200,contentType,truncated:false,body,sourceIntegrity:{sha256:digest(body)},accessDecisions:[{decision:'ALLOWED'}]});
const incomplete=url=>({url,requestedUrl:url,outcome:'UNRESOLVED',failure:{code:'REDIRECT_LIMIT'},accessDecisions:[{decision:'ALLOWED'}]});
const service=(name,amount=12)=>({'@type':'SoftwareApplication',name,description:'Consumer subscription service',offers:{'@type':'OfferCatalog',name:'Membership plans',itemListElement:[{'@type':'Offer',name:'Monthly',priceSpecification:{'@type':'UnitPriceSpecification',price:amount,priceCurrency:'EUR',billingDuration:'P1M',eligibleRegion:market}}]}});
const authorityCatalog=({provider,url,name,amount=12})=>{const serviceId=name.toLowerCase().replace(/[^a-z0-9]+/g,'-'),identity={'@context':'https://schema.org','@graph':[{'@type':'Organization',name:provider,url,brand:{'@type':'Brand',name:provider}},service(name,amount)],subscriptionServiceCatalog:{scope:'PROVIDER_SUBSCRIPTION_SERVICES',coverage:'COMPLETE',serviceIds:[serviceId]}},prices={serviceId,offers:[{id:serviceId+'-monthly',amount,currency:'EUR',cadence:'MONTHLY',billingCadence:'MONTHLY',consumer:true,relationship:'SUBSCRIPTION',role:'ORDINARY',market}],catalog:{scope:'SERVICE_MARKET',coverage:'COMPLETE',market,offerIds:[serviceId+'-monthly']}};return `<html><head><script type="application/ld+json">${JSON.stringify(identity)}</script><script type="application/json">${JSON.stringify(prices)}</script></head><body>${provider} legal and subscription information</body></html>`;};
const childBody=(id,amount=12)=>JSON.stringify({serviceId:id,offers:[{id:id+'-monthly',amount,currency:'EUR',cadence:'MONTHLY',billingCadence:'MONTHLY',consumer:true,relationship:'SUBSCRIPTION',role:'ORDINARY',market}],catalog:{scope:'SERVICE_MARKET',coverage:'COMPLETE',market,offerIds:[id+'-monthly']}});

test('existing semantic objectives create one small deterministic provider-resource query',()=>{
 assert.deepEqual(providerResourceDiscoveryQuery({providerName:'Fable',targetMarket:market,unresolvedObjectives:[serviceDiscoveryObjective]}),{kind:'SUBSCRIPTION_PRICE',objectives:[serviceDiscoveryObjective],query:'Fable subscription plans membership pricing Germany'});
 assert.equal(providerResourceDiscoveryQuery({providerName:'Fable',targetMarket:market,unresolvedObjectives:['ACCOUNT_LOGIN_EXISTS']}).query,'Fable login account Germany');
 assert.equal(providerResourceDiscoveryQuery({providerName:'Fable',targetMarket:market,unresolvedObjectives:['MEMBERSHIP_MANAGEMENT_EXISTS']}).query,'Fable manage subscription billing membership Germany');
 assert.equal(providerResourceDiscoveryQuery({providerName:'Fable',targetMarket:market,unresolvedObjectives:['CANCELLATION']}).query,'Fable cancel subscription membership Germany');
});

test('login and subscription management use the same discovery and routing mechanism without capability claims',async()=>{
 const target=providerOrBrandResearchTarget({seedName:'Lantern',targetMarket:market});
 const login=await discoverProviderResourceCandidates({researchTarget:target,unresolvedObjectives:['ACCOUNT_LOGIN_EXISTS'],search:async()=>({results:[{url:'https://lantern.example/join',title:'Subscribe to Lantern'},{url:'https://accounts.lantern.example/session',title:'Lantern account login'}]}),bounds:{searches:1,candidates:4}}),loginOrder=orderProviderSeedAuthorityCandidates(target,login.candidates);
 assert.equal(login.searches[0].query,'Lantern login account Germany');assert.equal(loginOrder[0].url,'https://accounts.lantern.example/session');assert.equal(loginOrder[0].providerAuthority,'NONE');assert.equal(loginOrder[0].truthAuthority,'NONE');assert.equal(Object.hasOwn(loginOrder[0],'capability'),false);
 const management=await discoverProviderResourceCandidates({researchTarget:target,unresolvedObjectives:['MEMBERSHIP_MANAGEMENT_EXISTS'],search:async()=>({results:[{url:'https://login.lantern.example/',title:'Lantern login'},{url:'https://members.lantern.example/portal',title:'Manage Lantern subscription and billing'}]}),bounds:{searches:1,candidates:4}}),managementOrder=orderProviderSeedAuthorityCandidates(target,management.candidates);
 assert.equal(managementOrder[0].url,'https://members.lantern.example/portal');assert.equal(managementOrder[0].objectiveIntent,'SUBSCRIPTION_MANAGEMENT');assert.equal(managementOrder[0].providerAuthority,'NONE');assert.notEqual(managementOrder[0].url,loginOrder[0].url);
});

test('cold noisy discovery does not hand unadmitted service context to V3',async t=>{
 const seed='Storyleaf',resource='https://catalog.storyleaf.example/choices',legal='https://catalog.storyleaf.example/legal',plans='https://catalog.storyleaf.example/data',serviceName='Storyleaf Reader',serviceId='storyleaf-reader',calls=[];let searches=0;
 const resourceBody=`<main>Storyleaf membership choices.</main><footer><a href="/legal">Legal company terms</a></footer>`,legalBody=`<html><head><script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@type':'Organization',name:seed,url:legal})}</script></head><body><a href="/data">Subscription plans and prices</a></body></html>`,plansBody=JSON.stringify({'@graph':[service(serviceName,12)],subscriptionServiceCatalog:{scope:'PROVIDER_SUBSCRIPTION_SERVICES',coverage:'COMPLETE',serviceIds:[serviceId]},serviceId,offers:[{id:serviceId+'-monthly',amount:12,currency:'EUR',cadence:'MONTHLY',billingCadence:'MONTHLY',consumer:true,relationship:'SUBSCRIPTION',role:'ORDINARY',market}],catalog:{scope:'SERVICE_MARKET',coverage:'COMPLETE',market,offerIds:[serviceId+'-monthly']}});
 const createAdapters=async({stage})=>stage==='PROVIDER_SEED'?{
  search:async({query})=>{calls.push({stage,type:'SEARCH',query});searches++;return {results:[{url:resource,title:'Storyleaf membership offers and plans',content:'Choose a subscription plan'}]};},
  read:async({url})=>{calls.push({stage,type:'READ',url});if(url===resource)return page(url,resourceBody);if(url===legal)return page(url,legalBody);if(url===plans)return page(url,plansBody,'application/json');assert.fail('unrelated generic result must not be read: '+url);}
 }:{
  search:async()=>({results:[]}),read:async({url})=>{calls.push({stage,type:'READ',url});return page(url??legal,plansBody,'application/json');},consumeProvider:async args=>({...evaluateDirectProviderTruth({target:args.target,retained:validateDirectProviderPage(args)}),classification:'V3_NATIVE_PROVIDER_SOURCE',verified:[],blockers:[],monetary:1,needsGeo:false})
 };
 const result=await runProviderSeedCampaign({directory:temp(t),researchTarget:providerOrBrandResearchTarget({seedName:seed,targetMarket:market}),createAdapters,capabilities:{direct:true,tavily:true,decodo:false,browser:false,groq:false}});
 assert.deepEqual(calls.filter(row=>row.type==='SEARCH').map(row=>row.query),['Storyleaf subscription plans membership pricing Germany']);
 assert.deepEqual(calls.filter(row=>row.stage==='PROVIDER_SEED'&&row.type==='READ').map(row=>row.url),[resource,legal]);assert.deepEqual(calls.filter(row=>row.stage!=='PROVIDER_SEED'&&row.type==='READ').map(row=>row.url),[]);assert.equal(result.candidateReviews.find(row=>row.url===resource).status,'UNRESOLVED');assert.equal(result.providerAuthorityBinding.host,'catalog.storyleaf.example');assert.equal(result.serviceDiscovery.status,'SERVICE_DISCOVERY_UNRESOLVED');assert.deepEqual(result.discoveredServices,[]);assert.deepEqual(result.children,[]);assert.equal(result.termination.reason,'SUBSCRIPTION_SERVICE_ADMISSION_UNRESOLVED');
 assert.equal(result.discovery.candidates.find(row=>row.url===resource).originKind,'OBJECTIVE_SEARCH');assert.equal(result.discovery.candidates.find(row=>row.url===resource).truthAuthority,'NONE');assert.equal(result.discovery.candidates.find(row=>row.url===resource).providerAuthority,'NONE');
});

test('an incomplete exact root spends the remaining normal search on the objective and ranks an opaque membership resource',async t=>{
 const seed='Cinema House',root='https://cinema-house.example/',resource='https://cinema-house.example/choices',calls=[];let searches=0;
 const createAdapters=async()=>({search:async({query})=>{calls.push({type:'SEARCH',query});searches++;return searches===1?{results:[{url:root,title:'Cinema House'}]}:{results:[{url:root,title:'Cinema House home'},{url:resource,title:'Cinema House membership plans'},{url:'https://encyclopedia.example/cinema-house',title:'Cinema House reference'},{url:'https://social.example/cinema-house',title:'Cinema House social'}]};},read:async({url})=>{calls.push({type:'READ',url});if(url===root)return incomplete(url);if(url===resource)return page(url,authorityCatalog({provider:seed,url:resource,name:'Cinema House Plus'}));assert.fail('lower-value result must not be read: '+url);}});
 const result=await runProviderSeedCampaign({directory:temp(t),researchTarget:providerOrBrandResearchTarget({seedName:seed,targetMarket:market}),createAdapters,limits:{reads:2},capabilities:{direct:true,tavily:true,decodo:false,browser:false,groq:false}});
 assert.deepEqual(calls.filter(row=>row.type==='SEARCH').map(row=>row.query),['Cinema House subscription plans membership pricing Germany','Cinema House official site']);assert.deepEqual(calls.filter(row=>row.type==='READ').map(row=>row.url),[root,resource]);assert.equal(result.discovery.candidates.find(row=>row.host==='cinema-house.example'&&row.url===resource).url,resource);assert.equal(result.providerAuthorityBinding.host,'cinema-house.example');assert.equal(result.usage.searches,2);assert.equal(result.usage.reads,2);
});
