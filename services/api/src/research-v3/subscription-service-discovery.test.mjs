import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {canonical,context,digest} from './model.mjs';
import {reviewCandidateAuthority,reviewProviderSeedAuthority} from './provider-authority-review.mjs';
import {providerOrBrandResearchTarget,knownServiceResearchTarget,serviceObjectiveForResearchTarget} from './research-target.mjs';
import {admitSubscriptionService,rehydrateSubscriptionService} from './subscription-service-admission.mjs';
import {discoverSubscriptionServices,fanOutSubscriptionServices,providerSeedDiscoveryLifecycle,rehydrateDiscoveredService} from './subscription-service-discovery.mjs';
import {loadProviderSeedResources,providerSeedResourceMemoryContract,rememberProviderSeedResource} from './provider-seed-resource-memory.mjs';
import {hybridProviderResourceMemoryContract} from '../research-v2/live/hybrid-provider-resource-memory.mjs';
import {evaluate} from './truth.mjs';
import {refreshCatalog} from './subscription-catalog.mjs';

const host='northstar.example',url=`https://${host}/catalog`,market='DE';
const target=()=>providerOrBrandResearchTarget({seedName:'Northstar',targetMarket:market});
const jsonLd=value=>`<script type="application/ld+json">${JSON.stringify(value)}</script>`;
const authorityBody=jsonLd({'@context':'https://schema.org','@type':'Organization',name:'Northstar Holdings',url:`https://${host}/`,brand:{'@type':'Brand',name:'Northstar'}});
const authorityObservation=(overrides={})=>{const body=overrides.body??authorityBody;return {id:'authority-1',kind:'CANDIDATE',authority:'UNREVIEWED_CANDIDATE',url:`https://${host}/about`,context:{transport:'DIRECT',networkGeography:'UNBOUND',representation:'CANDIDATE_PAGE'},outcome:'OK',truncated:false,completeness:'COMPLETE',format:'WEB',contentType:'text/html',httpStatus:200,access:[{decision:'ALLOWED'}],body,sha256:digest(body),...overrides};};
const binding=()=>reviewProviderSeedAuthority(authorityObservation(),target(),{candidateHosts:[host]});
const providerObservation=(value,overrides={})=>{const body=typeof value==='string'?value:JSON.stringify(value),parsed=typeof value==='string'?null:value;return {id:overrides.id??'provider-1',kind:'PROVIDER',authority:'REVIEWED_PROVIDER',url:overrides.url??url,context:overrides.context??context('DIRECT'),outcome:'OK',truncated:false,completeness:'COMPLETE',format:overrides.format??'JSON',contentType:overrides.contentType??'application/json',httpStatus:200,access:[{decision:'ALLOWED'}],body,sha256:digest(body),...(parsed?.serviceId?{candidates:[{kind:'SERVICE',pointer:''},...(parsed.offers??[]).map((_,index)=>({kind:'OFFER',pointer:'/offers/'+index}))]}:{}),...overrides};};
const offer=(name='Basic',cadence='P1M')=>({'@type':'Offer',name,priceSpecification:{'@type':'UnitPriceSpecification',billingDuration:cadence}});
const service=(name,type='Service',extra={})=>({'@type':type,name,offers:{'@type':'OfferCatalog',name:'Subscription plans',itemListElement:[offer()]},...extra});
const discover=(values,options={})=>discoverSubscriptionServices({researchTarget:target(),providerAuthorityBinding:binding(),observations:(Array.isArray(values)?values:[values]).map((value,index)=>value?.kind?value:providerObservation(value,{id:'provider-'+index})),...options});

test('matrix 1-5: one, two and three Services retain distinct IDs and fan out to distinct KNOWN_SERVICE objectives',()=>{
 for(const count of [1,2,3]){const result=discover({'@graph':Array.from({length:count},(_,i)=>service('Northstar App '+(i+1)))}),children=fanOutSubscriptionServices(result);assert.equal(result.services.length,count);assert.equal(new Set(result.services.map(row=>row.serviceId)).size,count);assert.equal(children.length,count);assert.equal(new Set(children.map(row=>row.objective.serviceId)).size,count);assert.ok(children.every(row=>row.researchTarget.targetKind==='KNOWN_SERVICE'));}
});

test('matrix 6 and 50: offerings stay under their discovered Service and seedName cannot collapse multiple Services',()=>{
 const result=discover({'@graph':[service('Orbit'),service('Pulse')]}),children=fanOutSubscriptionServices(result);assert.deepEqual(result.services.map(row=>row.serviceId),['orbit','pulse']);assert.ok(children.every(row=>row.researchTarget.seedName!==target().seedName));
 const bodies=children.map(({objective},i)=>providerObservation({serviceId:objective.serviceId,offers:[{id:'basic',amount:10+i,currency:'EUR',cadence:'MONTHLY',billingCadence:'MONTHLY',consumer:true,relationship:'SUBSCRIPTION',role:'ORDINARY',market}],catalog:{scope:'SERVICE_MARKET',coverage:'COMPLETE',market,offerIds:['basic']}},{id:'truth-'+i,context:context('DECODO',market)}));
 for(let i=0;i<children.length;i++){const knowledge={objective:children[i].objective,observations:[bodies[i]],attempts:[],policyBlocks:[],stop:null},truth=evaluate(knowledge);assert.equal(truth.offers.length,1);assert.equal(truth.offers[0].propositions.PRICE_AMOUNT.value,10+i);assert.equal(evaluate({...knowledge,observations:[bodies[1-i]]}).established,false);}
});

test('matrix 7-8 plus adversarial hardware: hardware never becomes a Service',()=>{
 const hardware={'@type':'Product',name:'Northstar Plus',sku:'HW-1',description:'Premium hardware purchase'},mixed=discover({'@graph':[hardware,service('Northstar Cloud')]});assert.deepEqual(mixed.services.map(row=>row.serviceName),['Northstar Cloud']);
 const only=discover({'@graph':[hardware,{'@type':'Product',name:'Northstar Pro',gtin13:'1234567890123',offers:offer('Purchase','P1Y')}]});assert.deepEqual(only.services,[]);assert.equal(only.status,'SERVICE_DISCOVERY_UNRESOLVED');
});

test('matrix 9-12 and adversarial publication: articles, support, login, brand and plan names do not become Services',()=>{
 const article=discover({'@type':'Article',headline:'Review',about:service('Orbit')});assert.deepEqual(article.services,[]);
 const html='<main><section><h2>Support Center</h2><p>Subscription plans and billing help.</p></section><section><h2>Login Account</h2><p>Manage your membership plans.</p></section></main>',peripheral=discover(providerObservation(html,{format:'WEB',contentType:'text/html'}));assert.deepEqual(peripheral.services,[]);
 const brand=discover({'@graph':[{'@type':'Organization',name:'Northstar'},{'@type':'Brand',name:'Orbit'},{'@type':'Offer',name:'Pro',description:'Subscription tier'}]});assert.deepEqual(brand.services,[]);
});

test('matrix 13-15: named app, membership and recurring software can be admitted without price',()=>{
 const value={'@graph':[service('Orbit App','SoftwareApplication'),{'@type':'Service',name:'Trail Membership',description:'Consumer membership program'}, {'@type':'SoftwareApplication',name:'Pulse Desktop',offers:{'@type':'Offer',name:'Standard',priceSpecification:{billingDuration:'P1Y'}}}]},result=discover(value);
 assert.deepEqual(result.services.map(row=>row.serviceName),['Orbit App','Pulse Desktop','Trail Membership']);assert.ok(result.services.every(row=>!Object.hasOwn(row,'price')&&!Object.hasOwn(row,'amount')&&!Object.hasOwn(row,'currency')));
});

test('matrix 16-19 plus adversarial provider/plan token: tiers and cadence variants do not become Services',()=>{
 const result=discover({'@graph':[{'@type':'Organization',name:'Northstar'},service('Northstar', 'Service',{offers:{'@type':'OfferCatalog',name:'Subscription plans',itemListElement:[offer('Free'),offer('Plus'),offer('Pro'),offer('Monthly','P1M'),offer('Annual','P1Y')]}})]});
 assert.deepEqual(result.services.map(row=>row.serviceName),['Northstar']);assert.equal(result.services.some(row=>['Free','Plus','Pro','Monthly','Annual'].includes(row.serviceName)),false);
});

test('matrix 20: distinct named subscription products remain distinct under one provider',()=>{assert.deepEqual(discover({'@graph':[service('Alpha'),service('Beta')]}).services.map(row=>row.serviceName),['Alpha','Beta']);});

test('matrix 21-24: snippets, third-party and unauthorized observations fail; exact authorized provider evidence admits',()=>{
 assert.equal(admitSubscriptionService({candidate:{identity:{name:'Snippet Service',type:'Service'},subscription:{kind:'EXPLICIT_SUBSCRIPTION'},source:{mechanism:'SEARCH_SNIPPET'}},observation:providerObservation(service('Snippet Service')),researchTarget:target(),providerAuthorityBinding:binding()}).status,'UNRESOLVED');
 assert.deepEqual(discover(providerObservation(JSON.stringify(service('Third Party')),{kind:'CANDIDATE'})).services,[]);
 assert.deepEqual(discover(providerObservation(JSON.stringify(service('Other Host')),{url:'https://other.example/catalog'})).services,[]);
 assert.deepEqual(discover(service('Exact Host App')).services.map(row=>row.serviceName),['Exact Host App']);
});

test('matrix 25-30: authority or partial/model evidence cannot admit and failures remain unresolved',()=>{
 assert.deepEqual(discover({'@type':'Organization',name:'Northstar Holdings'}).services,[]);
 assert.deepEqual(discover({'@type':'OfferCatalog',name:'Subscription plans'}).services,[]);
 assert.deepEqual(discover({'@type':'Service',name:'Named App'}).services,[]);
 assert.deepEqual(discover({'@type':'Service',name:['Alpha','Beta'],description:'Subscription service'}).services,[]);
 assert.deepEqual(discover(providerObservation(service('Model Guess'),{semantic:true})).services,[]);
 assert.equal(discover([]).status,'SERVICE_DISCOVERY_UNRESOLVED');
});

test('matrix 31-34: unchanged evidence rehydrates and all material tampering fails closed',()=>{
 const observation=providerObservation(service('Orbit App')),result=discover(observation),original=result.services[0];assert.equal(rehydrateDiscoveredService({service:original,observation,researchTarget:target(),providerAuthorityBinding:binding()}).status,'ADMITTED');
 const name=structuredClone(original);name.serviceName='Orbit App X';assert.equal(rehydrateDiscoveredService({service:name,observation,researchTarget:target(),providerAuthorityBinding:binding()}).status,'UNRESOLVED');
 const relation=structuredClone(original);relation.provenance.subscription.value='Membership plans';assert.equal(rehydrateDiscoveredService({service:relation,observation,researchTarget:target(),providerAuthorityBinding:binding()}).status,'UNRESOLVED');
 const source=structuredClone(original);source.provenance.bodySha256='0'.repeat(64);assert.equal(rehydrateDiscoveredService({service:source,observation,researchTarget:target(),providerAuthorityBinding:binding()}).status,'UNRESOLVED');
 const admission={status:'ADMITTED',service:original};assert.equal(rehydrateSubscriptionService({admission,observation:{...observation,body:observation.body+' '},researchTarget:target(),providerAuthorityBinding:binding()}).status,'UNRESOLVED');
});

test('matrix 35-40: discovery completion distinguishes open space, capacity, explicit complete lists and no evidence',()=>{
 assert.equal(discover(service('Orbit')).status,'SERVICE_FOUND_MORE_POSSIBLE');
 const capacity=discover({'@graph':[service('Alpha'),service('Beta')]},{bounds:{candidates:1}});assert.equal(capacity.status,'SERVICE_DISCOVERY_UNRESOLVED');assert.equal(capacity.termination.kind,'CAPACITY');
 const complete=discover({'@graph':[service('Alpha'),service('Beta')],subscriptionServiceCatalog:{scope:'PROVIDER_SUBSCRIPTION_SERVICES',coverage:'COMPLETE',serviceIds:['alpha','beta']}});assert.equal(complete.status,'SERVICE_DISCOVERY_EXHAUSTED');assert.equal(complete.termination.kind,'SEMANTIC_EXHAUSTION');
 const zero=discover({subscriptionServiceCatalog:{scope:'PROVIDER_SUBSCRIPTION_SERVICES',coverage:'COMPLETE',serviceIds:[]}});assert.equal(zero.status,'SERVICE_DISCOVERY_EXHAUSTED');assert.deepEqual(zero.services,[]);
 assert.equal(discover([]).status,'SERVICE_DISCOVERY_UNRESOLVED');assert.equal(discover({'@type':'Organization',name:'Northstar'}).status,'SERVICE_DISCOVERY_UNRESOLVED');
});

test('discovery consumes an explicit bounded acquisition state and capacity never becomes semantic exhaustion',()=>{
 const result=discover(service('Orbit'),{acquisitionState:{actions:16,acquisitions:8,navigationDepth:4}});assert.equal(result.status,'SERVICE_FOUND_MORE_POSSIBLE');assert.deepEqual({actions:result.usage.actions,acquisitions:result.usage.acquisitions,navigationDepth:result.usage.navigationDepth},{actions:16,acquisitions:8,navigationDepth:4});
 const limited=discover(service('Orbit'),{acquisitionState:{actions:17,acquisitions:8,navigationDepth:4}});assert.equal(limited.status,'SERVICE_DISCOVERY_UNRESOLVED');assert.equal(limited.termination.kind,'CAPACITY');
});

test('matrix 41-43: provider memory routes fresh reacquisition, never stores admission, and remains separate from service memory',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'provider-seed-memory-'));try{const authority=authorityObservation(),provider=providerObservation(service('Orbit')),row=rememberProviderSeedResource({root,researchTarget:target(),providerAuthorityBinding:binding(),authorityObservation:authority,providerObservation:provider,role:'SUBSCRIPTION_CATALOG_ROOT',acquisition:{route:'DIRECT'},acquiredAt:'2026-10-11T00:00:00.000Z'}),loaded=loadProviderSeedResources({root,researchTarget:target()});
  assert.equal(row.resource.reacquisition,'REQUIRED');assert.equal(loaded.resources.length,1);assert.equal(loaded.resources[0].acquisition.reacquisition,'REQUIRED');assert.equal(JSON.stringify(JSON.parse(fs.readFileSync(path.join(root,'provider-seed-resources.json'),'utf8'))).includes('Orbit'),false);assert.equal(Object.hasOwn(row,'service'),false);assert.equal(Object.hasOwn(row,'truth'),false);assert.notEqual(providerSeedResourceMemoryContract.namespace,hybridProviderResourceMemoryContract.namespace);
  assert.throws(()=>rememberProviderSeedResource({root,researchTarget:target(),providerAuthorityBinding:binding(),authorityObservation:authority,providerObservation:providerObservation(service('Other'),{url:'https://sibling.northstar.example/'}),acquisition:{route:'DIRECT'},acquiredAt:'2026-10-11T00:00:00.000Z'}),/CURRENT_PROVIDER_OBSERVATION_REQUIRED/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('matrix 44-48: fanout inherits exact authority routing but no market fact, then uses existing Truth and SERVICE_MARKET catalog',()=>{
 const discovery=discover(service('Orbit')),child=fanOutSubscriptionServices(discovery)[0],expected=serviceObjectiveForResearchTarget(knownServiceResearchTarget({serviceId:'orbit',serviceName:'Orbit',targetMarket:market}),{providerHosts:[host],seeds:[url]});assert.equal(canonical(child.objective),canonical(expected));assert.equal(child.marketEstablished,false);assert.equal(child.productionEligible,false);
 const source={serviceId:'orbit',offers:[{id:'monthly',amount:12,currency:'EUR',cadence:'MONTHLY',billingCadence:'MONTHLY',consumer:true,relationship:'SUBSCRIPTION',role:'ORDINARY',market}],catalog:{scope:'SERVICE_MARKET',coverage:'COMPLETE',market,offerIds:['monthly']}},directSource={serviceId:'orbit',offers:[{...source.offers[0],market:null}]},direct=providerObservation(directSource,{context:context('DIRECT')}),country=providerObservation(source,{context:context('DECODO',market),transport:{requestedCountry:market,verifiedCountry:market,verification:'BRACKET_VERIFIED'}});
 const directKnowledge={objective:child.objective,observations:[direct],attempts:[],policyBlocks:[],stop:null};assert.equal(evaluate(directKnowledge).established,false);
 const knowledge={objective:child.objective,observations:[country],attempts:[],policyBlocks:[],stop:null},truth=evaluate(knowledge),catalog=refreshCatalog(knowledge,truth);assert.equal(truth.established,true);assert.equal(catalog.state,'CATALOG_EXHAUSTED');assert.equal(catalog.scopeEvidence[0].market,market);
});

test('matrix 49: known-service source-bound authority remains unchanged',()=>{
 const serviceTarget=knownServiceResearchTarget({serviceId:'orbit',serviceName:'Orbit',targetMarket:market}),objective=serviceObjectiveForResearchTarget(serviceTarget,{candidateHosts:[host],seeds:[`https://${host}/about`]}),body=jsonLd({'@graph':[{'@id':'#service','@type':'Service',name:'Orbit',provider:{'@id':'#provider'}},{'@id':'#provider','@type':'Organization',name:'Northstar Holdings',url:`https://${host}/`}]});assert.equal(reviewCandidateAuthority(authorityObservation({body,sha256:digest(body)}),objective).reason,'STRUCTURED_EXACT_ORIGIN_RELATED_IDENTITY');
});

test('adversarial sources fail closed while duplicate native nodes deduplicate',()=>{
 const retailer=discover({'@graph':[{'@type':'Product',name:'Premium Device',sku:'D-1',offers:offer('Purchase')},{'@type':'Organization',name:'Retailer'}]}),review=discover({'@type':'Article',headline:'Best subscriptions',about:service('Review Subject')}),brands=discover({'@graph':[{'@type':'Organization',name:'Parent'},{'@type':'Brand',name:'Alpha'},{'@type':'Brand',name:'Beta'}]}),ambiguous=discover({'@type':'Product',name:'Mystery',provider:{name:'Unknown'},description:'Subscription product'}),malformed=discover(providerObservation('<script type="application/ld+json">{bad</script>',{format:'WEB',contentType:'text/html'}));
 for(const result of [retailer,review,brands,ambiguous,malformed])assert.deepEqual(result.services,[]);
 const duplicate=service('Orbit'),deduped=discover({'@graph':[duplicate,structuredClone(duplicate)]});assert.deepEqual(deduped.services.map(row=>row.serviceId),['orbit']);
});

test('adversarial app/hardware mixture and external auth or billing hosts stay outside exact-host admission',()=>{
 const mixed=discover({'@graph':[service('Orbit App','SoftwareApplication'),{'@type':'Product',name:'Orbit Premium',sku:'DEVICE-PRO',description:'Premium subscription-ready hardware'}]});assert.deepEqual(mixed.services.map(row=>row.serviceName),['Orbit App']);
 for(const external of ['https://auth.example/login','https://billing.northstar.example/plans']){const result=discover(providerObservation(service('External Product'),{url:external}));assert.deepEqual(result.services,[]);assert.ok(result.unresolved.some(row=>row.reason==='AUTHORITATIVE_PROVIDER_OBSERVATION_REQUIRED'));}
});

test('native HTML does not promote a heading merely because nearby copy says subscription',()=>{
 const body='<main><section><h1>Orbit Reader</h1><p>Choose a subscription plan for Orbit Reader.</p></section></main>',result=discover(providerObservation(body,{format:'WEB',contentType:'text/html'}));assert.deepEqual(result.services,[]);
});

test('provider campaign lifecycle contains discovery and child Services without production eligibility',()=>{
 const lifecycle=providerSeedDiscoveryLifecycle(discover(service('Orbit')));assert.equal(lifecycle.providerAuthority.status,'ESTABLISHED');assert.equal(lifecycle.serviceDiscovery.objective,'SUBSCRIPTION_SERVICE_DISCOVERY');assert.equal(lifecycle.discoveredServices.length,1);assert.equal(lifecycle.childServices.length,1);assert.equal(lifecycle.productionEligible,false);assert.equal(Object.hasOwn(lifecycle,'truth'),false);
});
