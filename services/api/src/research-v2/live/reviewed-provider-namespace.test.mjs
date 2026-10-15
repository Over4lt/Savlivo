import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {resolvePriceResearchIdentity} from '../../research-v3/research-identity-store.mjs';
import {canonicalReviewedProviderRoot,loadReviewedProviderNamespaces,reviewedNamespaceMatches,reviewedProviderNamespacesFor} from '../../research-v3/reviewed-provider-namespaces.mjs';
import {digest} from '../../research-v3/model.mjs';
import {evaluate} from '../../research-v3/truth.mjs';
import {autonomousProviderAuthorityDecision,hasProviderRoutingAuthority,providerRoutingAuthority} from './provider-routing-authority.mjs';
import {admittedDiscoveryCandidate} from './tavily-discovery.mjs';
import {validateDirectProviderPage,evaluateDirectProviderTruth} from './direct-provider-evidence.mjs';
import {targetMarketAcquisition} from './provider-access-gap.mjs';
import {OpenWebResearch,runOpenWebResearch,usefulProviderDestination} from './open-web-discovery.mjs';
import {discoveryActions} from './research-planner.mjs';
import {actionableDestinations} from './information-routing.mjs';
import {planResearch} from './research-planner.mjs';

const binding=reviewedProviderNamespacesFor('hulu','Hulu')[0];
const makeTarget=()=>({
 id:'price-research:hulu:PT',service:'hulu',serviceName:'Hulu',market:'PT',
 researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},
 reviewedProviderNamespaces:[structuredClone(binding)],urls:[],authorities:[],knownCommercialUrls:[],
 gaps:['plan','amount','currency','cadence','priceRole','ownership','market'],
 reads:[],queries:[],decisions:[],verified:[],blockedOrigins:[],
 capabilities:{direct:true,tavily:true,decodo:true,browser:false,groq:false}
});
const help='https://help.hulu.com/s/article/hulu-plans-and-prices';
const body='<html><title>Hulu Help Center</title><p>Learn about your Hulu account.</p></html>';

test('reviewed Hulu namespace is backed by exact hashed first-party catalog references and reaches the canonical identity',async()=>{
 const rows=loadReviewedProviderNamespaces(),resolved=await resolvePriceResearchIdentity('hulu',{client:{query(){assert.fail('static identity must not query database');}}});
 assert.equal(rows.length,1);
 assert.deepEqual(rows[0],binding);
 assert.equal(resolved.status,'RESEARCHABLE');
 assert.deepEqual(resolved.identity.reviewedProviderNamespaces,[binding]);
 assert.deepEqual(binding.provenance.map(row=>row.kind),['DIRECT_PROVIDER_PRICE_SOURCE','DIRECT_PROVIDER_MANAGEMENT_ROUTE']);
 for(const field of ['price','amount','currency','cadence','market','availability','verified'])assert.equal(Object.hasOwn(binding,field),false);
});

test('public-suffix and DNS-label matching admits only the reviewed Hulu namespace for Hulu',()=>{
 const target=makeTarget();
 for(const url of ['https://hulu.com/','https://www.hulu.com/annual-offer',help,'https://secure.hulu.com/account','https://a.b.help.hulu.com/article']){
  assert.equal(reviewedNamespaceMatches('hulu.com',url),true,url);
  const routing=providerRoutingAuthority(target,url),decision=autonomousProviderAuthorityDecision(target,url);
  assert.equal(routing?.provenance,'REVIEWED_PROVIDER_NAMESPACE',url);
  assert.equal(routing.binding.registrableDomain,'hulu.com');
  assert.equal(decision?.authority.authorityScope,'OWNED_DNS_NAMESPACE');
  assert.equal(admittedDiscoveryCandidate({url,authority:decision},target).url,decision.url);
 }
 for(const url of ['https://fakehulu.com/','https://hulu-example.com/','https://hulu.com.evil.com/','https://disneyplus.com/','https://evil.com/?source=hulu.com','https://foo.github.io/','http://help.hulu.com/','https://hulu.com:8443/']){
  assert.equal(providerRoutingAuthority(target,url),null,url);
 }
 assert.equal(reviewedNamespaceMatches('github.io','https://foo.github.io/'),false);
 assert.equal(hasProviderRoutingAuthority(target),true);
 const unbound={...target,reviewedProviderNamespaces:[]};
 assert.equal(hasProviderRoutingAuthority(unbound),false);
 assert.equal(providerRoutingAuthority(unbound,help),null);
 const other={...target,service:'disney-plus',serviceName:'Disney+'};
 assert.equal(providerRoutingAuthority(other,help),null);
 const forged=makeTarget();forged.reviewedProviderNamespaces[0].registrableDomain='evil.com';
 assert.equal(providerRoutingAuthority(forged,help),null);
});

test('reviewed namespace admits only commercially relevant support search leads',()=>{
 const target=makeTarget();
 assert.equal(usefulProviderDestination(target,{url:help,title:'Hulu subscription plans and prices',navigationOnly:true}),true);
 assert.equal(usefulProviderDestination(target,{url:'https://help.hulu.com/s/article/account',title:'Hulu account sign in',navigationOnly:true}),false);
 assert.equal(usefulProviderDestination(target,{url:'https://help.hulu.com/s/article/privacy',title:'Hulu privacy',navigationOnly:true}),false);
 assert.equal(usefulProviderDestination(target,{url:'https://disneyplus.com/plans',title:'Hulu subscription plans and prices',navigationOnly:true}),false);
});

test('reviewed namespace alone creates no pricing or target-market Truth',()=>{
 const target=makeTarget(),url=help,decision=autonomousProviderAuthorityDecision(target,url);
 assert.equal(decision.eligible,true);
 const truth=evaluate({objective:{kind:'PRICE',serviceId:'hulu',serviceName:'Hulu',providerHosts:[new URL(url).hostname],markets:['PT'],seeds:[url]},observations:[],attempts:[],policyBlocks:[],stop:null});
 assert.equal(truth.established,false);
 assert.equal(truth.prices.PT.propositions.PRICE_AMOUNT.state,'UNRESOLVED');
 assert.equal(truth.prices.PT.propositions.TARGET_MARKET.state,'UNRESOLVED');
 assert.equal(targetMarketAcquisition(target,url),null);
});

test('a hash-verified admitted Hulu support page reaches normal V3 interpretation and unresolved country need',t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'hulu-domain-source-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const target=makeTarget(),hash=digest(body),file='bodies/'+hash+'.txt';fs.mkdirSync(path.join(directory,'bodies'));fs.writeFileSync(path.join(directory,file),body);
 const routing=providerRoutingAuthority(target,help),page={url:help,requestedUrl:help,outcome:'OK',httpStatus:200,contentType:'text/html',bodyFile:file,bodyHash:hash,sourceIntegrity:{sha256:hash},accessDecisions:[{decision:'ALLOWED'}],providerAuthority:{provenance:routing.provenance,binding:routing.binding}};
 const retained=validateDirectProviderPage({target,page,directory});
 const interpreted=evaluateDirectProviderTruth({target,retained});
 assert.equal(interpreted.v3Observation.kind,'PROVIDER');
 assert.equal(interpreted.v3Observation.url,help);
 assert.equal(interpreted.v3Truth.established,false);
 assert(interpreted.v3Truth.needs.some(need=>need.market==='PT'&&need.state==='UNRESOLVED'));
 target.reads.push(page);target.v3Truth=interpreted.v3Truth;
 target.providerInterpretations=[{url:help,v3Observation:interpreted.v3Observation,v3Truth:interpreted.v3Truth}];
 assert.equal(targetMarketAcquisition(target,help)?.primaryFailureReason,'TARGET_MARKET_OBSERVATION_REQUIRED');
});

test('off-domain redirect and source-integrity failure cannot be admitted as Hulu provider evidence',t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'hulu-domain-redirect-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const target=makeTarget(),hash=digest(body),file='bodies/'+hash+'.txt';fs.mkdirSync(path.join(directory,'bodies'));fs.writeFileSync(path.join(directory,file),body);
 const routing=providerRoutingAuthority(target,help),page={url:'https://example.com/landing',requestedUrl:help,outcome:'OK',httpStatus:200,contentType:'text/html',bodyFile:file,bodyHash:hash,sourceIntegrity:{sha256:hash},accessDecisions:[{decision:'ALLOWED'}],providerAuthority:{provenance:routing.provenance,binding:routing.binding}};
 assert.throws(()=>validateDirectProviderPage({target,page,directory}),/DIRECT_PROVIDER_AUTHORITY_REQUIRED/);
 assert.equal(providerRoutingAuthority(target,page.url),null);
 const tampered={...page,url:help,bodyHash:'0'.repeat(64)};
 assert.throws(()=>validateDirectProviderPage({target,page:tampered,directory}),/DIRECT_PROVIDER_HASH_MISMATCH/);
});

test('redirect within the reviewed namespace uses the final host binding',t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'hulu-domain-same-namespace-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const target=makeTarget(),final='https://secure.hulu.com/account',hash=digest(body),file='bodies/'+hash+'.txt';fs.mkdirSync(path.join(directory,'bodies'));fs.writeFileSync(path.join(directory,file),body);
 const finalRouting=providerRoutingAuthority(target,final),page={url:final,requestedUrl:help,outcome:'OK',httpStatus:200,contentType:'text/html',bodyFile:file,bodyHash:hash,sourceIntegrity:{sha256:hash},accessDecisions:[{decision:'ALLOWED'}],providerAuthority:{provenance:finalRouting.provenance,binding:finalRouting.binding}};
 const retained=validateDirectProviderPage({target,page,directory});
 assert.equal(retained.authority.hostname,'secure.hulu.com');
 assert.equal(evaluateDirectProviderTruth({target,retained}).v3Observation.url,final);
});

test('live discovery reads a reviewed support lead as provider source without separate body ownership proof',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'hulu-domain-open-web-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const calls=[],target=makeTarget();target.urls=[help];
 const state=await runOpenWebResearch({directory,targets:[target],maxActions:1,
  search:async()=>assert.fail('known reviewed provider URL should be read directly'),
  read:async({url})=>{calls.push('READ');return {url,outcome:'OK',httpStatus:200,contentType:'text/html',body,sourceIntegrity:{sha256:digest(body)},accessDecisions:[{decision:'ALLOWED'}]};},
  classify:async()=>assert.fail('reviewed namespace should route without a new body ownership review'),
  consumeProvider:async({candidate})=>{calls.push('INTERPRET');assert.equal(candidate.authority.reason,'REVIEWED_PROVIDER_NAMESPACE');return {classification:'FIELDS_UNRESOLVED',verified:[],blockers:[],needsGeo:false};}
 });
 assert.deepEqual(calls,['READ','INTERPRET']);
 const page=state.targets[0].reads[0];
 assert.equal(page.researchRole,'PROVIDER_SOURCE');
 assert.equal(page.providerAuthority.provenance,'REVIEWED_PROVIDER_NAMESPACE');
 assert.equal(state.targets[0].verified.length,0);
});

test('pricing-relevant Hulu support search lead reaches provider interpretation without becoming ownership proof',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'hulu-domain-search-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const calls=[];
 const state=await runOpenWebResearch({directory,targets:[makeTarget()],maxActions:3,
  search:async()=>{calls.push('SEARCH');return {results:[{url:help,title:'Hulu subscription plans and prices',content:'untrusted snippet'}]};},
  read:async({url})=>{calls.push('READ');assert.equal(url,help);return {url,outcome:'OK',httpStatus:200,contentType:'text/html',body,sourceIntegrity:{sha256:digest(body)},accessDecisions:[{decision:'ALLOWED'}]};},
  classify:async()=>assert.fail('search snippet cannot supply the reviewed namespace'),
  consumeProvider:async({candidate})=>{calls.push('INTERPRET');assert.equal(candidate.authority.reason,'REVIEWED_PROVIDER_NAMESPACE');return {classification:'FIELDS_UNRESOLVED',verified:[],blockers:[],needsGeo:false};}
 });
 assert(calls.includes('READ'),JSON.stringify(calls));
 assert(calls.includes('INTERPRET'),JSON.stringify(calls));
 assert.equal(state.targets[0].reads[0].providerAuthority.provenance,'REVIEWED_PROVIDER_NAMESPACE');
 assert.equal(state.targets[0].verified.length,0);
});

test('live redirect rechecks the final registrable domain before provider interpretation',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'hulu-domain-live-redirect-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const target=makeTarget();target.urls=[help];let consumed=0;
 const state=await runOpenWebResearch({directory,targets:[target],maxActions:1,
  search:async()=>assert.fail('reviewed destination should be read directly'),
  read:async()=>({url:'https://example.com/landing',outcome:'OK',httpStatus:200,contentType:'text/html',body,sourceIntegrity:{sha256:digest(body)},accessDecisions:[{decision:'ALLOWED'}]}),
  classify:async()=>({eligible:false,reason:'OWNERSHIP_UNPROVEN'}),
  consumeProvider:async()=>{consumed++;assert.fail('off-domain final page cannot be interpreted as Hulu provider');}
 });
 assert.equal(consumed,0);
 assert.notEqual(state.targets[0].reads[0].researchRole,'PROVIDER_SOURCE');
 assert.equal(state.targets[0].verified.length,0);
});

test('live same-namespace redirect retains the independently reviewed final host',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'hulu-domain-live-same-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const target=makeTarget();target.urls=[help];const final='https://secure.hulu.com/account';let admitted=0;
 const state=await runOpenWebResearch({directory,targets:[target],maxActions:1,
  search:async()=>assert.fail('reviewed destination should be read directly'),
  read:async()=>({url:final,outcome:'OK',httpStatus:200,contentType:'text/html',body,sourceIntegrity:{sha256:digest(body)},accessDecisions:[{decision:'ALLOWED'}]}),
  classify:async()=>assert.fail('final Hulu host has reviewed namespace authority'),
  consumeProvider:async({candidate})=>{admitted++;assert.equal(candidate.authority.url,final);return {classification:'FIELDS_UNRESOLVED',verified:[],blockers:[],needsGeo:false};}
 });
 assert.equal(admitted,1);
 assert.equal(state.targets[0].reads[0].providerAuthority.binding.host,'secure.hulu.com');
});

test('existing exact-host reviewed routing remains exact-host only',()=>{
 const target={...makeTarget(),reviewedProviderNamespaces:[],authorities:[{hostname:'www.chess.com',provider:'Chess.com',sourceType:'OFFICIAL_PROVIDER',checkedAt:'2026-09-18'}],service:'chess-com',serviceName:'Chess.com'};
 assert.equal(providerRoutingAuthority(target,'https://www.chess.com/membership').provenance,'HISTORICAL_REVIEWED_PROVIDER');
 assert.equal(providerRoutingAuthority(target,'https://help.chess.com/'),null);
});


test('reviewed price-source host yields a routing-only canonical root; absent review yields none',()=>{
 const root=canonicalReviewedProviderRoot(binding);
 assert.equal(root.url,'https://www.hulu.com/');
 assert.equal(root.registrableDomain,'hulu.com');
 assert.equal(root.meaning,'ROUTING_ONLY_NOT_EVIDENCE');
 assert.equal(root.truthAuthority,'NONE');
 for(const field of ['price','amount','currency','market','availability','verified'])assert.equal(Object.hasOwn(root,field),false);
 assert.equal(canonicalReviewedProviderRoot(null),null);
 assert.equal(canonicalReviewedProviderRoot({status:'REVIEWED',scope:'OWNED_DNS_NAMESPACE',registrableDomain:'other.com',provenance:[]}),null);
});

test('reviewed namespace query precedes broad queries without changing the search count',()=>{
 const target={...makeTarget(),operationsObjective:'PRICE_RESEARCH'};
 const actions=discoveryActions(target);
 assert.equal(actions[0].need,'REVIEWED_NAMESPACE');
 assert.match(actions[0].query,/site:hulu\.com/);
 assert.equal(actions[1].need,'CONTEXT');
 assert.equal(discoveryActions({...target,reviewedProviderNamespaces:[]}).some(row=>row.need==='REVIEWED_NAMESPACE'),false);
});

test('provider root and pricing lead outrank unrelated publisher and remain bounded Direct candidates',t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'namespace-rank-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const root=canonicalReviewedProviderRoot(binding),target={...makeTarget(),operationsObjective:'PRICE_RESEARCH',urls:[root.url,'https://publisher.example/hulu-prices'],leads:[{url:root.url,title:'Provider root',providerRootSeed:true,truthAuthority:'NONE',authoritative:false},{url:'https://publisher.example/hulu-prices',title:'Hulu prices'}]};
 const session=new OpenWebResearch(directory,[target]);
 assert.equal(session.next().url,root.url);
 const scoped=session.target(target.id);
 scoped.leads.push({url:help,title:'Hulu plans and prices',providerNamespaceCandidate:true,truthAuthority:'NONE',authoritative:false});
 const ordered=actionableDestinations(scoped,{urls:scoped.leads.map(row=>row.url),executionContext:{bounds:session.bounds,usage:session.state.usage}});
 assert.equal(ordered.candidates[0].url,help);
 assert.equal(ordered.candidates.some(row=>row.url==='https://publisher.example/hulu-prices'),false);
});

test('root with no price yields provider navigation and Direct reads the child before search',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'namespace-root-navigation-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const root=canonicalReviewedProviderRoot(binding).url,target={...makeTarget(),operationsObjective:'PRICE_RESEARCH',urls:[root]};
 const calls=[],rootBody='<html><a href="/plans">Subscription plans and prices</a></html>';
 const state=await runOpenWebResearch({directory,targets:[target],maxActions:2,
  search:async()=>assert.fail('provider navigation should precede search'),
  read:async({url})=>{calls.push(['READ',url]);return {url,outcome:'OK',httpStatus:200,contentType:'text/html',body:url===root?rootBody:body,sourceIntegrity:{sha256:digest(url===root?rootBody:body)},accessDecisions:[{decision:'ALLOWED'}]};},
  classify:async()=>assert.fail('reviewed namespace routes provider page'),
  consumeProvider:async({candidate})=>{calls.push(['V3',candidate.url]);return {classification:'FIELDS_UNRESOLVED',verified:[],blockers:[],needsGeo:false};}
 });
 assert.deepEqual(calls.slice(0,4),[['READ',root],['V3',root],['READ','https://www.hulu.com/plans'],['V3','https://www.hulu.com/plans']]);
 assert.equal(state.targets[0].verified.length,0);
});

test('failed provider root and namespace search can fall back to broad bounded discovery',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'namespace-fallback-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const root=canonicalReviewedProviderRoot(binding).url,target={...makeTarget(),operationsObjective:'PRICE_RESEARCH',urls:[root]},queries=[];
 const state=await runOpenWebResearch({directory,targets:[target],maxActions:3,
  search:async({query})=>{queries.push(query);return query.includes('site:hulu.com')?{results:[],failure:{code:'NETWORK_FAILURE'}}:{results:[]};},
  read:async({url})=>({url,outcome:'NETWORK_FAILURE',failure:{code:'NETWORK_FAILURE'},body:''}),
  classify:async()=>({eligible:false}),
  consumeProvider:async()=>assert.fail('failed root is not evidence')
 });
 assert.equal(state.targets[0].verified.length,0);
 assert.equal(queries.length,2);
 assert.match(queries[0],/site:hulu\.com/);
 assert.doesNotMatch(queries[1],/site:hulu\.com/);
 assert.equal(state.usage.searches,2);
 assert.equal(state.usage.reads,1);
});

test('constrained search marks legitimate nested provider lead and ignores spoof and publisher',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'namespace-search-mark-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const target={...makeTarget(),operationsObjective:'PRICE_RESEARCH'};
 const session=new OpenWebResearch(directory,[target]);
 const action=session.next();assert.equal(action.type,'SEARCH');assert.equal(action.providerNamespaceSearch,true);
 session.accept(action.id,{results:[{url:help,title:'Hulu plans and prices'},{url:'https://hulu.com.evil.com/pricing',title:'Hulu pricing'},{url:'https://publisher.example/hulu-pricing',title:'Hulu prices'}]});
 const leads=session.target(target.id).leads;
 assert.deepEqual(leads.map(row=>row.url),[help]);
 assert.equal(leads[0].providerNamespaceCandidate,true);
 assert.equal(leads[0].from.method,'REVIEWED_NAMESPACE_SEARCH');
 assert.equal(leads[0].truthAuthority,'NONE');
 assert.equal(leads[0].authoritative,false);
 assert.equal(session.next().url,help);
});


test('official search lead reaches Direct V3 price candidate and existing country gate',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'namespace-decodo-gate-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const target={...makeTarget(),operationsObjective:'PRICE_RESEARCH'},priceBody='<html><p>Consumer plan $9.99 per month</p></html>',hash=digest(priceBody),actions=[];
 const proposition=(state,value)=>({state,value,evidence:[],contradictions:[]}),truth={prices:{PT:{id:'consumer',propositions:{SERVICE_IDENTITY:proposition('ESTABLISHED',true),PRICE_AMOUNT:proposition('ESTABLISHED',9.99),CURRENCY:proposition('ESTABLISHED','USD'),MONTHLY_SUBSCRIPTION:proposition('ESTABLISHED',true),CONSUMER_SUBSCRIPTION:proposition('ESTABLISHED',true),TARGET_MARKET:proposition('UNRESOLVED',null)}}},needs:[{id:'PT:consumer:TARGET_MARKET',proposition:'TARGET_MARKET',market:'PT',offerId:'consumer',state:'UNRESOLVED'}]};
 const state=await runOpenWebResearch({directory,targets:[target],maxActions:2,
  search:async({query})=>{actions.push('SEARCH');assert.match(query,/site:hulu\.com/);return {results:[{url:help,title:'Official subscription plans and prices'},{url:'https://publisher.example/hulu-prices',title:'Article'}]};},
  read:async({url})=>{actions.push('DIRECT');assert.equal(url,help);return {url,outcome:'OK',httpStatus:200,contentType:'text/html',body:priceBody,sourceIntegrity:{sha256:hash},accessDecisions:[{decision:'ALLOWED'}]};},
  classify:async()=>assert.fail('reviewed namespace authority must route'),
  consumeProvider:async({page})=>{actions.push('V3');assert.equal(page.bodyHash,hash);return {classification:'MARKET_UNRESOLVED',verified:[],blockers:[],needsGeo:false,v3Observation:{id:'provider-price',kind:'PROVIDER',url:help,sha256:hash,context:{transport:'DIRECT',networkGeography:'UNBOUND'}},v3Truth:truth};}
 });
 assert.deepEqual(actions,['SEARCH','DIRECT','V3']);
 const current=state.targets[0];
 assert.equal(current.verified.length,0);
 assert.equal(current.v3Truth.prices.PT.propositions.PRICE_AMOUNT.state,'ESTABLISHED');
 assert.equal(current.v3Truth.prices.PT.propositions.TARGET_MARKET.state,'UNRESOLVED');
 assert.equal(targetMarketAcquisition(current,help)?.primaryFailureReason,'TARGET_MARKET_OBSERVATION_REQUIRED');
 const next=planResearch(current,{unreadUrls:current.leads.map(row=>row.url)});assert.equal(next.route,'DECODO');assert.equal(next.reason,'TARGET_MARKET_OBSERVATION_REQUIRED');
});

test('namespace query and provider lead resume without replaying search',t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'namespace-resume-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const target={...makeTarget(),operationsObjective:'PRICE_RESEARCH'},session=new OpenWebResearch(directory,[target]),search=session.next();
 assert.equal(search.type,'SEARCH');session.accept(search.id,{results:[{url:help,title:'Official plans and prices'}]});
 const resumed=new OpenWebResearch(directory,[target]);const next=resumed.next();
 assert.equal(next.type,'READ');assert.equal(next.url,help);
 assert.equal(resumed.state.usage.searches,1);
 assert.equal(resumed.target(target.id).queries.length,1);
});
