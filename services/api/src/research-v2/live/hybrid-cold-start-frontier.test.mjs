import '../offline-replay/offline-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {digest} from '../../research-v3/model.mjs';
import {reviewV2CandidateAuthority} from '../../research-v3/v2-candidate-authority-adapter.mjs';
import {initializeAdaptiveState,assessAdaptiveService,runAdaptiveCampaign} from '../inventory/adaptive-campaign.mjs';
import {candidateRelevant,rankPlannerLeads,runOpenWebResearch,serviceIdentityTokens} from './open-web-discovery.mjs';
import {contextualQuery,planResearch} from './research-planner.mjs';
import {hasProviderRoutingAuthority} from './provider-routing-authority.mjs';

const capabilities={direct:true,tavily:true,decodo:false,browser:false,groq:false};
function target({service='nimbus',serviceName='Nimbus.com',market='NO',extra={}}={}){return {id:`${service}-price-${market}`,service,serviceName,market,researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},urls:[],authorities:[],gaps:['amount'],reads:[],queries:[],leads:[],decisions:[],blockedOrigins:[],verified:[],capabilities:{...capabilities},...extra};}
const manifest=t=>({targets:[t],conditionalFollowupTargets:[]});
const temp=t=>{const directory=fs.mkdtempSync(path.join(os.tmpdir(),'hybrid-cold-start-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));return directory;};
const acquired=(url,body='<main>Generic pricing information.</main>')=>({url,outcome:'OK',httpStatus:200,contentType:'text/html',body,sourceIntegrity:{sha256:digest(body)},accessDecisions:[{decision:'ALLOWED'}]});

test('higher adaptive wrapper activates existing authority discovery for a clean service target',async t=>{
 const x=target(),initial=initializeAdaptiveState(manifest(x)),assessment=assessAdaptiveService(initial,x.service);assert.equal(assessment.next.plan.route,'AUTHORITY_DISCOVERY');assert.equal(assessment.next.plan.reason,'AUTHORITY_UNRESOLVED');
 const calls=[];const state=await runAdaptiveCampaign({directory:temp(t),manifest:manifest(x),maxActions:1,createAdapters:async()=>({search:async({query})=>{calls.push(query);return {results:[]};},read:async()=>assert.fail('candidate read cannot precede discovery')})});
 assert.deepEqual(calls,[contextualQuery(x,0)]);assert.equal(state.services[x.service].used.searches,1);
});

test('authority discovery is not activated when its capability or objective work is absent',()=>{
 const disabled=target({extra:{capabilities:{...capabilities,tavily:false}}}),none=target({extra:{priceStrategy:'MANUAL_ONLY',manualOnlyDecision:{established:true,reference:{path:'reviewed'}}}});
 assert.equal(assessAdaptiveService(initializeAdaptiveState(manifest(disabled)),disabled.service).stop.reason,'CAPABILITY_DISABLED_TAVILY');
 const stopped=assessAdaptiveService(initializeAdaptiveState(manifest(none)),none.service);assert.equal(stopped.next,null);assert.equal(stopped.stop.reason,'MANUAL_ONLY_APPROPRIATE');
});

test('domain-shaped service identities discard suffix syntax and preserve the meaningful identity',()=>{
 for(const [serviceName,expected,noise] of [['Chess.com',['chess'],'com'],['Nimbus.com',['nimbus'],'com'],['Foo.co.uk',['foo'],'co'],['Service.io',['service'],'io'],['Brand.app',['brand'],'app']]){const x=target({serviceName});assert.deepEqual(serviceIdentityTokens(x),expected);assert(!serviceIdentityTokens(x).includes(noise));}
 assert.deepEqual(serviceIdentityTokens(target({serviceName:'Aurora Club'})),['aurora','club']);
 assert.equal(candidateRelevant(target({serviceName:'Chess.com'}),{title:'Generic offers',url:'https://unrelated.com/pricing'}),false);
 assert.equal(candidateRelevant(target({serviceName:'Chess.com'}),{title:'Chess membership',url:'https://unrelated.example/pricing'}),true);
});

test('pre-authority ordering favors a service-bearing host but remains routing metadata only',()=>{
 const x=target();x.leads=[{url:'https://third.example/pricing',title:'Nimbus pricing comparison',rank:0},{url:'https://www.nimbus.com/membership',title:'Membership',rank:4}];
 assert.equal(candidateRelevant(x,x.leads[0]),true,'third-party candidate remains inspectable');rankPlannerLeads(x);
 assert(x.leads[1].navigationPriority<x.leads[0].navigationPriority);const plan=planResearch(x,{unreadUrls:x.leads.map(l=>l.url)});assert.equal(plan.route,'AUTHORITY_DISCOVERY');assert.equal(plan.url,'https://www.nimbus.com/membership');
 assert.equal(hasProviderRoutingAuthority(x),false);assert.deepEqual(x.authorities,[]);assert.deepEqual(x.verified,[]);assert.equal(Object.hasOwn(x,'marketProof'),false);assert.equal(Object.hasOwn(x,'truth'),false);
});

test('exhausted search families drain unread candidates in rank order before semantic exhaustion',async t=>{
 const x=target(),calls=[],directory=temp(t);let searches=0;
 const state=await runOpenWebResearch({directory,targets:[x],search:async()=>{calls.push('SEARCH');searches++;return {results:searches===1?[]:[{url:'https://third.example/pricing',title:'Nimbus pricing comparison'},{url:'https://www.nimbus.com/membership',title:'Membership'}]};},read:async({url})=>{calls.push(url);return acquired(url);}});
 const current=state.targets[0];assert.deepEqual(calls,['SEARCH','SEARCH','https://www.nimbus.com/membership','https://third.example/pricing']);assert.equal(current.reads.length,2);assert.equal(current.done,'DISCOVERY_EXHAUSTED');assert.equal(current.remainingAuthorizedLeads?.length??0,0);assert.equal(hasProviderRoutingAuthority(current),false);
 assert(current.reads.every(r=>r.researchRole==='CANDIDATE_AUTHORITY_SOURCE'&&r.v3AuthorityReview.status==='UNRESOLVED_PROVIDER_IDENTITY'));
});

test('candidate read capacity stops an unread frontier with an explicit bound reason',()=>{
 const x=target();x.queries=[0,1].map(i=>({query:contextualQuery(x,i)}));x.leads=[{url:'https://www.nimbus.com/membership',title:'Membership',rank:0}];x.reads=Array.from({length:4},(_,i)=>({requestedUrl:`https://attempt-${i}.example/page`,url:`https://attempt-${i}.example/page`,outcome:'ERROR'}));rankPlannerLeads(x);
 const plan=planResearch(x,{unreadUrls:x.leads.map(l=>l.url),executionContext:{bounds:{reads:4,perServiceReads:4,searches:2,perServiceSearches:2,acquisitions:0,perServiceAcquisitions:0},usage:{reads:4,searches:2,acquisitions:0}}});
 assert.equal(plan.route,'STOP');assert.equal(plan.reason,'DIRECT_BUDGET_EXHAUSTED');assert.notEqual(plan.reason,'DISCOVERY_EXHAUSTED');assert.equal(plan.budgetBlocked.length,1);
});

test('search metadata and provider-looking paths cannot establish authority without accepted source material',()=>{
 const x=target(),url='https://www.nimbus.com/pricing',body='<title>Nimbus pricing</title><main>Search result: official Nimbus plans.</main>',sha256=digest(body);
 rankPlannerLeads(Object.assign(x,{leads:[{url,title:'Nimbus official pricing',snippet:'Best Nimbus subscription',rank:0}]}));assert.equal(hasProviderRoutingAuthority(x),false);
 const review=reviewV2CandidateAuthority({contractVersion:1,observationId:'candidate-only',target:{service:x.service,serviceName:x.serviceName},page:{url,requestedUrl:url,outcome:'OK',httpStatus:200,contentType:'text/html',truncated:false,bodyHash:sha256,sourceIntegrity:{sha256},rawSource:{text:body},accessDecisions:[{decision:'ALLOWED'}]}});
 assert.equal(review.providerAuthorityBinding,null);assert.equal(review.candidateObservation.kind,'CANDIDATE');assert.equal(hasProviderRoutingAuthority(x),false);
});

test('separate market runs retain isolated frontiers and the same finite bounds',async t=>{
 const no=target({market:'NO'}),de=target({market:'DE'}),root=temp(t),seen=[];
 for(const x of [no,de])await runOpenWebResearch({directory:path.join(root,x.market),targets:[x],maxActions:1,search:async()=>{seen.push(x.market);return {results:[{url:`https://${x.market.toLowerCase()}.nimbus.example/membership`,title:'Nimbus membership'}]};},read:async()=>assert.fail('one action permits search only')});
 const noState=JSON.parse(fs.readFileSync(path.join(root,'NO','state.json'))),deState=JSON.parse(fs.readFileSync(path.join(root,'DE','state.json')));assert.deepEqual(seen,['NO','DE']);assert.equal(noState.usage.searches,1);assert.equal(deState.usage.searches,1);assert(noState.targets[0].leads.every(l=>!l.url.includes('de.nimbus')));assert(deState.targets[0].leads.every(l=>!l.url.includes('no.nimbus')));
});
