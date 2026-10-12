import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {digest} from '../../research-v3/model.mjs';
import {providerOrBrandResearchTarget} from '../../research-v3/research-target.mjs';
import {orderProviderSeedAuthorityCandidates,providerSeedHostnameAffinity,providerSeedObjectiveContinuation,providerSeedRedirectCandidate,refreshProviderSeedAuthorityFrontier} from './provider-seed-authority-routing.mjs';
import {runProviderSeedCampaign} from './provider-seed-campaign.mjs';

const market='DE';
const temp=t=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'objective-routing-continuity-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;};
const candidate=(url,index,extra={})=>({candidateId:'candidate-'+index,url,host:new URL(url).hostname,originKind:'SEARCH',searchIndex:1,resultIndex:index,searchRank:index,insertionOrder:index,navigationDepth:0,truthAuthority:'NONE',...extra});
const routed=(requested,destination)=>({url:destination,redirects:[destination],outcome:'ROUTING_ONLY',httpStatus:302,contentType:null,accessDecisions:[{targetUrl:requested,decision:'ALLOWED'}],redirectStop:{kind:'CROSS_HOST_REDIRECT_STOP',requestedUrl:requested,requestedHost:new URL(requested).hostname,sourceUrl:requested,sourceHost:new URL(requested).hostname,destinationUrl:destination,destinationHost:new URL(destination).hostname,redirectChain:[requested,destination],navigationDepth:1,httpStatus:302}});
const authorityPage=(url,name)=>{const body=`<html><head><script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@type':'Organization',name,url,subscriptionServiceCatalog:{scope:'PROVIDER_SUBSCRIPTION_SERVICES',coverage:'COMPLETE',serviceIds:[]}})}</script></head><body>${name} subscription information</body></html>`;return {url,requestedUrl:url,outcome:'OK',httpStatus:200,contentType:'text/html',truncated:false,body,sourceIntegrity:{sha256:digest(body)},accessDecisions:[{decision:'ALLOWED'}]};};

test('objective-selected cross-host destination keeps semantic intent, wins the unchanged read frontier, and earns authority only after review',async t=>{
 const seed='Helio Stream',target=providerOrBrandResearchTarget({seedName:seed,targetMarket:market}),selected='https://www.heliostream.example/app-subscription',destination='https://eu.heliostream.example/app-subscription',lower=['https://support.heliostream.example/help','https://heliostream-fitness.example/about'],calls=[];let searches=0;
 const createAdapters=async()=>({
  search:async()=>{searches++;return searches===1?{results:[{url:'https://directory.example/helio-stream',title:'Helio Stream reference'}]}:{results:[{url:selected,title:'Helio Stream subscription plans and pricing'},{url:lower[0],title:'Helio Stream support'},{url:lower[1],title:'Helio Stream company'}]};},
  read:async({url,candidate:row})=>{calls.push({url,candidate:structuredClone(row)});if(url===selected)return routed(selected,destination);if(url===destination)return authorityPage(destination,seed);assert.fail('lower-value row consumed the bounded read frontier: '+url);}
 });
 const result=await runProviderSeedCampaign({directory:temp(t),researchTarget:target,createAdapters,limits:{reads:2,searches:2,candidateDestinations:12},capabilities:{direct:true,tavily:true,decodo:false,browser:false,groq:false}}),parent=result.discovery.candidates.find(row=>row.url===selected),continuation=result.discovery.candidates.find(row=>row.url===destination);
 assert.deepEqual(calls.map(row=>row.url),[selected,destination]);assert.equal(parent.objectiveIntent,'SUBSCRIPTION_PRICE');assert(parent.objectiveRelevance>0);assert.equal(continuation.objectiveIntent,parent.objectiveIntent);assert.equal(continuation.objectiveRelevance,parent.objectiveRelevance);assert.equal(continuation.parentCandidateId,parent.candidateId);assert.equal(continuation.truthAuthority,'NONE');assert.equal(Object.hasOwn(continuation,'providerAuthorityBinding'),false);assert.equal(Object.hasOwn(continuation,'authority'),false);
 assert.equal(calls[1].candidate.candidateId,continuation.candidateId);assert.equal(calls[1].candidate.truthAuthority,'NONE');assert.equal(result.providerAuthorityBinding.host,new URL(destination).hostname);assert.equal(result.candidateReviews[1].status,'ESTABLISHED');assert.equal(result.usage.reads,2);assert.equal(result.usage.searches,2);
});

test('offers redirect keeps objective continuity across a host change and outranks unrelated source-bound rows',()=>{
 const target=providerOrBrandResearchTarget({seedName:'Leaf Press',targetMarket:market}),parent=candidate('https://leafpress.example/offers',0,{originKind:'OBJECTIVE_SEARCH',objectiveIntent:'SUBSCRIPTION_PRICE',objectiveRelevance:18,score:18}),unrelated=candidate('https://support.leafpress.example/account',1,{candidateId:'source-bound-unrelated',originKind:'SOURCE_BOUND_CONTINUATION',score:6,parentCandidateId:'different-parent'}),created=providerSeedRedirectCandidate({researchTarget:target,parent,page:routed(parent.url,'https://www.leafpress.example/offers'),candidates:[parent,unrelated],navigationDepthLimit:4,insertionOrder:2}),ordered=orderProviderSeedAuthorityCandidates(target,[unrelated,created.candidate]);
 assert.equal(created.candidate.objectiveIntent,'SUBSCRIPTION_PRICE');assert.equal(created.candidate.objectiveRelevance,18);assert.equal(created.candidate.score,undefined);assert.equal(created.routing.objectiveScore,18);assert.equal(ordered[0].candidateId,created.candidate.candidateId);assert.equal(created.candidate.truthAuthority,'NONE');assert.equal(Object.hasOwn(created.candidate,'providerAuthorityBinding'),false);
});

test('an already discovered exact redirect destination is updated with objective continuity and reranked',()=>{
 const target=providerOrBrandResearchTarget({seedName:'Leaf Press',targetMarket:market}),parent=candidate('https://leafpress.example/offers',0,{originKind:'OBJECTIVE_SEARCH',objectiveIntent:'SUBSCRIPTION_PRICE',objectiveRelevance:18,score:18}),existing=candidate('https://www.leafpress.example/offers',1),unrelated=candidate('https://support.leafpress.example/about',2,{score:6}),created=providerSeedRedirectCandidate({researchTarget:target,parent,page:routed(parent.url,existing.url),candidates:[parent,existing,unrelated],navigationDepthLimit:4,insertionOrder:3}),refresh=refreshProviderSeedAuthorityFrontier({researchTarget:target,candidates:[parent,existing,unrelated],activeCandidateIds:[existing.candidateId,unrelated.candidateId],newCandidates:[created.candidate],deactivateCandidateIds:[parent.candidateId],limit:3}),updated=refresh.candidates.find(row=>row.candidateId===existing.candidateId);
 assert.equal(created.candidate.candidateId,existing.candidateId);assert.deepEqual(refresh.updatedIds,[existing.candidateId]);assert.equal(updated.originKind,'REDIRECT_DESTINATION');assert.equal(updated.parentCandidateId,parent.candidateId);assert.equal(updated.objectiveIntent,'SUBSCRIPTION_PRICE');assert.equal(updated.objectiveRelevance,18);assert.equal(refresh.activeCandidateIds[0],existing.candidateId);assert.equal(updated.truthAuthority,'NONE');assert.equal(Object.hasOwn(updated,'providerAuthorityBinding'),false);
});

test('source-bound child can continue the exact parent objective without inheriting facts or authority',()=>{
 const parent=candidate('https://northlight.example/memberships',0,{originKind:'OBJECTIVE_SEARCH',objectiveIntent:'SUBSCRIPTION_PRICE',objectiveRelevance:16,providerAuthorityBinding:{host:'northlight.example'},price:9.99}),child=candidate('https://northlight.example/plans',1,{score:20}),projection=providerSeedObjectiveContinuation(parent,child),projected={...child,...projection,originKind:'SOURCE_BOUND_CONTINUATION',parentCandidateId:parent.candidateId,truthAuthority:'NONE'};
 assert.deepEqual(projection,{objectiveIntent:'SUBSCRIPTION_PRICE',objectiveRelevance:16});assert.equal(projected.parentCandidateId,parent.candidateId);assert.equal(projected.truthAuthority,'NONE');assert.equal(Object.hasOwn(projected,'providerAuthorityBinding'),false);assert.equal(Object.hasOwn(projected,'price'),false);
});

test('account objective continuity survives an exact redirect while arbitrary account rows keep zero provider affinity',()=>{
 const target=providerOrBrandResearchTarget({seedName:'Northlight',targetMarket:market}),parent=candidate('https://northlight.example/login',0,{originKind:'OBJECTIVE_SEARCH',objectiveIntent:'ACCOUNT_LOGIN',objectiveRelevance:12}),redirect=providerSeedRedirectCandidate({researchTarget:target,parent,page:routed(parent.url,'https://accounts.northlight.example/login'),candidates:[parent],navigationDepthLimit:4,insertionOrder:1}).candidate,arbitrary=candidate('https://accounts.northlight.example/login-help',2,{objectiveIntent:'ACCOUNT_LOGIN',objectiveRelevance:12});
 assert(providerSeedHostnameAffinity(target,redirect)>0);assert.equal(providerSeedHostnameAffinity(target,arbitrary),0);assert.equal(redirect.truthAuthority,'NONE');assert.equal(Object.hasOwn(redirect,'providerAuthorityBinding'),false);
});

test('an unrelated later discovery does not inherit another candidate objective',()=>{
 const target=providerOrBrandResearchTarget({seedName:'Northlight',targetMarket:market}),selected=candidate('https://northlight.example/pricing',0,{originKind:'OBJECTIVE_SEARCH',objectiveIntent:'SUBSCRIPTION_PRICE',objectiveRelevance:18,score:18}),unrelated=candidate('https://northlight-labs.example/about',1),ordered=orderProviderSeedAuthorityCandidates(target,[unrelated,selected]);
 assert.equal(unrelated.objectiveIntent,undefined);assert.equal(unrelated.objectiveRelevance,undefined);assert.equal(ordered[0].candidateId,selected.candidateId);assert.equal(ordered[1].routing.objectiveScore,0);
});
