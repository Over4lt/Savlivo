import test from 'node:test';
import assert from 'node:assert/strict';
import {providerOrBrandResearchTarget} from '../../research-v3/research-target.mjs';
import {orderProviderSeedAuthorityCandidates,providerSeedCandidateRouting,providerSeedRedirectCandidate} from './provider-seed-authority-routing.mjs';

const target=providerOrBrandResearchTarget({seedName:'Northstar',targetMarket:'DE'});
const candidate=(url,index,extra={})=>({candidateId:'candidate-'+index,url,host:new URL(url).hostname,originKind:'SEARCH',searchIndex:0,resultIndex:index,searchRank:index,insertionOrder:index,navigationDepth:0,truthAuthority:'NONE',...extra});
const ordered=rows=>orderProviderSeedAuthorityCandidates(target,rows);
const page=(url,redirects=[])=>({url,redirects,outcome:'OK',httpStatus:200,truncated:false,accessDecisions:[{decision:'ALLOWED'}]});

test('provider affinity routes ahead of generic categories while every weak candidate remains fallback',()=>{
 const rows=[candidate('https://encyclopedia.example/northstar',0),candidate('https://northstar.ca.us/',1),candidate('https://social.example/northstar',2),candidate('https://marketplace.example/store/apps/northstar',3),candidate('https://publication.news/northstar',4),candidate('https://forum.example/r/northstar',5),candidate('https://northstar-fitness.example/about',6)],result=ordered(rows);
 assert.equal(result[0].url,'https://northstar-fitness.example/about');
 assert.deepEqual(new Set(result.map(row=>row.candidateId)),new Set(rows.map(row=>row.candidateId)));
 assert.equal(result.at(-1).routing.objective,'PROVIDER_SEED_AUTHORITY_ACQUISITION');
});

test('routing metadata grants no authority, preserves search provenance, and stable ties are deterministic',()=>{
 const first=candidate('https://northstar-one.example/about',4,{searchIndex:1,searchRank:7,insertionOrder:9}),second=candidate('https://northstar-two.example/about',3,{searchIndex:1,searchRank:7,insertionOrder:8}),rows=ordered([first,second]);
 assert.equal(rows[0].candidateId,second.candidateId);assert.equal(rows[1].searchRank,7);assert.equal(rows[0].truthAuthority,'NONE');assert.equal(Object.hasOwn(rows[0],'providerAuthorityBinding'),false);
 assert.deepEqual(ordered(JSON.parse(JSON.stringify([first,second]))).map(row=>row.candidateId),rows.map(row=>row.candidateId));
});

test('identity resources beat commercial-looking paths when hostname affinity is equal',()=>{
 const root=candidate('https://northstar.example/about',1),commercial=candidate('https://northstar.example/buy-subscription-pricing',0),rows=ordered([commercial,root]);
 assert.equal(rows[0].url,root.url);assert.equal(rows[0].routing.hostnameAffinity,rows[1].routing.hostnameAffinity);
});

test('redirect destination is a bounded provenance-rich candidate and never an authority grant',()=>{
 const parent=candidate('https://northstar.example/start',2),final='https://de.northstar.example/about',created=providerSeedRedirectCandidate({researchTarget:target,parent,page:page(final,[final]),candidates:[parent],navigationDepthLimit:3,insertionOrder:1});
 assert.equal(created.candidate.originKind,'REDIRECT_DESTINATION');assert.equal(created.candidate.parentCandidateId,parent.candidateId);assert.equal(created.candidate.parentRequestedUrl,parent.url);assert.equal(created.candidate.parentRequestedHost,parent.host);assert.equal(created.candidate.finalUrl,final);assert.equal(created.candidate.finalHost,'de.northstar.example');assert.deepEqual(created.candidate.redirectChain,[parent.url,final]);assert.equal(created.candidate.navigationDepth,1);assert.equal(created.candidate.searchRank,parent.searchRank);assert.equal(created.candidate.truthAuthority,'NONE');assert.equal(Object.hasOwn(created.candidate,'providerAuthorityBinding'),false);
});

test('redirect loops, duplicate destinations, access denial, and navigation depth do not grow the frontier',()=>{
 const parent=candidate('https://northstar.example/start',0,{redirectChain:['https://origin.example/','https://northstar.example/start'],navigationDepth:1}),base={researchTarget:target,parent,candidates:[parent],navigationDepthLimit:3,insertionOrder:1};
 assert.equal(providerSeedRedirectCandidate({...base,page:page('https://origin.example/')}).reason,'REDIRECT_LOOP');
 assert.equal(providerSeedRedirectCandidate({...base,candidates:[parent,candidate('https://regional.example/',1)],page:page('https://regional.example/')}).reason,'REDIRECT_DESTINATION_DUPLICATE');
 assert.equal(providerSeedRedirectCandidate({...base,page:{...page('https://regional.example/'),accessDecisions:[{decision:'DISALLOWED'}]}}).reason,'REDIRECT_ACCESS_NOT_ALLOWED');
 assert.equal(providerSeedRedirectCandidate({...base,parent:{...parent,navigationDepth:3},page:page('https://regional.example/')}).reason,'REDIRECT_NAVIGATION_DEPTH_BOUND');
});

test('strong redirect may preempt weak fallback; generic auth/payment redirect cannot preempt provider candidate',()=>{
 const parent=candidate('https://northstar.example/start',0),strong=providerSeedRedirectCandidate({researchTarget:target,parent,page:page('https://de.northstar.example/about'),candidates:[parent],navigationDepthLimit:3,insertionOrder:2}).candidate,weak=candidate('https://forum.example/northstar',1);
 assert.equal(ordered([weak,strong,parent]).find(row=>row.candidateId!==parent.candidateId).candidateId,strong.candidateId);
 const auth=providerSeedRedirectCandidate({researchTarget:target,parent,page:page('https://auth.example/login'),candidates:[parent],navigationDepthLimit:3,insertionOrder:2}).candidate,independent=candidate('https://northstar-fitness.example/about',1),ranked=orderProviderSeedAuthorityCandidates(target,[auth,independent],{remainingReads:1});
 assert.equal(ranked[0].candidateId,independent.candidateId);assert.equal(providerSeedCandidateRouting(target,auth,[parent,auth]).destinationClass,'AUTH_OR_PAYMENT');
});

test('equal-affinity independent candidate wins the final read over a redirect branch',()=>{
 const parent=candidate('https://northstar.example/start',0),redirect=providerSeedRedirectCandidate({researchTarget:target,parent,page:page('https://de.northstar.example/about'),candidates:[parent],navigationDepthLimit:3,insertionOrder:2}).candidate,independent=candidate('https://northstar-labs.example/about',1),rows=orderProviderSeedAuthorityCandidates(target,[redirect,independent],{remainingReads:1});
 assert.equal(rows[0].candidateId,independent.candidateId);assert.equal(rows[0].routing.hostnameAffinity,rows[1].routing.hostnameAffinity);
});
