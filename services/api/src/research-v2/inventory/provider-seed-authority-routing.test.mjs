import test from 'node:test';
import assert from 'node:assert/strict';
import {providerOrBrandResearchTarget} from '../../research-v3/research-target.mjs';
import {compareProviderSeedAuthorityRows,observedAuthorityEvidenceCapability,orderProviderSeedAuthorityCandidates,providerSeedCandidateRouting,providerSeedRedirectCandidate,refreshProviderSeedAuthorityFrontier} from './provider-seed-authority-routing.mjs';

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

test('authority resource value comes from observed source presentation and not URL path',()=>{
 const source={observation:'source',start:1,end:12},generic=candidate('https://northstar.example/legal',0,{originKind:'SOURCE_BOUND_CONTINUATION',label:'Explore',source}),operator=candidate('https://northstar.example/explore',1,{originKind:'SOURCE_BOUND_CONTINUATION',label:'Legal operator information',source}),rows=orderProviderSeedAuthorityCandidates(target,[generic,operator],{authorityGap:{authorityTargetHost:'northstar.example',authorityDiagnostic:{decision:'UNRESOLVED',mechanisms:[{mechanism:'FIRST_PARTY_PROSE',outcome:'NO_MATCH'}]}}});
 assert.equal(rows[0].url,operator.url);assert.equal(rows[0].routing.authorityEvidenceCapability.kind,'EXPLICIT_RELATIONSHIP_PRESENTATION');assert.equal(observedAuthorityEvidenceCapability(generic).kind,'OTHER_PRESENTATION');
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

test('equal-affinity safe redirect keeps its provenance order when one read remains',()=>{
 const parent=candidate('https://northstar.example/start',0),redirect=providerSeedRedirectCandidate({researchTarget:target,parent,page:page('https://de.northstar.example/about'),candidates:[parent],navigationDepthLimit:3,insertionOrder:2}).candidate,independent=candidate('https://northstar-labs.example/about',1),rows=orderProviderSeedAuthorityCandidates(target,[redirect,independent],{remainingReads:1});
 assert.equal(rows[0].candidateId,redirect.candidateId);assert.equal(rows[0].routing.hostnameAffinity,rows[1].routing.hostnameAffinity);assert.equal(Object.hasOwn(rows[0].routing,'branchPreference'),false);assert.deepEqual(orderProviderSeedAuthorityCandidates(target,[redirect,independent],{remainingReads:2}).map(row=>row.candidateId),rows.map(row=>row.candidateId));
});

test('source-bound objective score refreshes equal-affinity ordering without granting authority',()=>{
 const unrelated=candidate('https://northstar-labs.example/about',0),continuation=candidate('https://de.northstar.example/subscription',1,{candidateId:'source-bound',originKind:'SOURCE_BOUND_CONTINUATION',score:20,source:{observation:'candidate-observation',bodySha256:'body-hash',start:10,end:20,sha256:'span-hash'}}),rows=ordered([unrelated,continuation]);
 assert.equal(rows[0].candidateId,continuation.candidateId);assert.equal(rows[0].routing.objectiveScore,20);assert.equal(rows[0].truthAuthority,'NONE');assert.equal(Object.hasOwn(rows[0],'providerAuthorityBinding'),false);
});

test('adaptive frontier admits below K, shrinks after attempt, grows later, and never deletes history',()=>{
 const a=candidate('https://northstar.example/about',0),b=candidate('https://reference.example/',1),c=candidate('https://northstar-labs.example/about',2),d=candidate('https://another.example/',3),first=refreshProviderSeedAuthorityFrontier({researchTarget:target,candidates:[a,b],activeCandidateIds:[a.candidateId,b.candidateId],newCandidates:[c],limit:3});
 assert.deepEqual(new Set(first.activeCandidateIds),new Set([a.candidateId,b.candidateId,c.candidateId]));assert.equal(first.candidates.length,3);assert.deepEqual(first.admittedIds,[c.candidateId]);
 const shrunk=refreshProviderSeedAuthorityFrontier({researchTarget:target,candidates:first.candidates,activeCandidateIds:first.activeCandidateIds,limit:3,deactivateCandidateIds:[a.candidateId]});assert.equal(shrunk.activeCandidateIds.length,2);assert.equal(shrunk.candidates.length,3);assert(shrunk.candidates.some(row=>row.candidateId===a.candidateId));
 const grown=refreshProviderSeedAuthorityFrontier({researchTarget:target,candidates:shrunk.candidates,activeCandidateIds:shrunk.activeCandidateIds,newCandidates:[d],limit:3});assert.equal(grown.activeCandidateIds.length,3);assert.equal(grown.candidates.length,4);assert(grown.activeCandidateIds.includes(d.candidateId));
});

test('batch refresh retains deterministic top K and replaces only the two stronger arrivals',()=>{
 const active=[candidate('https://northstar.example/about',0),candidate('https://northstar-labs.example/about',1),candidate('https://northstar-cloud.example/about',2),candidate('https://reference-a.example/',3),candidate('https://reference-b.example/',4),candidate('https://auth.example/login',5)],strongA=candidate('https://de.northstar.example/about',6,{originKind:'REDIRECT_DESTINATION',parentCandidateId:active[0].candidateId}),strongB=candidate('https://northstar-service.example/about',7),weak=candidate('https://payment.example/login',8,{originKind:'REDIRECT_DESTINATION',parentCandidateId:active[0].candidateId}),result=refreshProviderSeedAuthorityFrontier({researchTarget:target,candidates:active,activeCandidateIds:active.map(row=>row.candidateId),newCandidates:[strongA,strongB,weak],limit:6});
 assert.equal(result.candidates.length,9);assert.equal(result.activeCandidateIds.length,6);assert.deepEqual(new Set(result.admittedIds),new Set([strongA.candidateId,strongB.candidateId]));assert.equal(result.displacedIds.length,2);assert(!result.activeCandidateIds.includes(weak.candidateId));assert(result.rejectedCandidates.some(row=>row.candidateId===weak.candidateId&&row.reason==='PROVIDER_CANDIDATE_DESTINATION_BOUND'));assert(active.slice(0,3).every(row=>result.activeCandidateIds.includes(row.candidateId)));
});

test('single stronger arrival displaces at most one weakest active candidate while retaining both in history',()=>{
 const weak=candidate('https://accounts.directory.example/login',0),parent=candidate('https://northstar-labs.example/start',1),independent=candidate('https://reference.example/',9,{searchRank:9,insertionOrder:9}),active=[weak,parent,independent],redirect=providerSeedRedirectCandidate({researchTarget:target,parent,page:page('https://de.northstar.example/about'),candidates:active,navigationDepthLimit:3,insertionOrder:10}).candidate,result=refreshProviderSeedAuthorityFrontier({researchTarget:target,candidates:active,activeCandidateIds:active.map(row=>row.candidateId),newCandidates:[redirect],limit:3});
 assert.deepEqual(result.displacedIds,[weak.candidateId]);assert.deepEqual(result.admittedIds,[redirect.candidateId]);assert.equal(result.activeCandidateIds.length,3);assert.equal(result.candidates.length,4);assert(result.candidates.some(row=>row.candidateId===weak.candidateId));assert(result.candidates.some(row=>row.candidateId===redirect.candidateId));assert.equal(redirect.truthAuthority,'NONE');assert.equal(Object.hasOwn(redirect,'providerAuthorityBinding'),false);
});

test('large protected history does not consume an underfull active frontier',()=>{
 const history=['READ','OBSERVED','REVIEWED','AUTHORITY','REDIRECT_PARENT'].map((kind,index)=>candidate(`https://history-${index}.example/`,index,{historyKind:kind})),incoming=candidate('https://northstar.example/about',8),result=refreshProviderSeedAuthorityFrontier({researchTarget:target,candidates:history,activeCandidateIds:[],newCandidates:[incoming],limit:2,ineligibleCandidateIds:history.map(row=>row.candidateId)});
 assert.deepEqual(result.activeCandidateIds,[incoming.candidateId]);assert.equal(result.candidates.length,6);assert(history.every(row=>result.candidates.includes(row)));assert.equal(result.displacedIds.length,0);
});

test('weaker redirect and equal duplicate cannot churn stronger independent frontier',()=>{
 const parent=candidate('https://northstar-labs.example/start',0),independent=candidate('https://northstar.example/about',1),active=[parent,independent],weak=providerSeedRedirectCandidate({researchTarget:target,parent,page:page('https://auth.example/login'),candidates:active,navigationDepthLimit:3,insertionOrder:2}).candidate,weakResult=refreshProviderSeedAuthorityFrontier({researchTarget:target,candidates:active,activeCandidateIds:active.map(row=>row.candidateId),newCandidates:[weak],limit:2});
 assert.deepEqual(new Set(weakResult.activeCandidateIds),new Set(active.map(row=>row.candidateId)));assert.equal(weakResult.candidates.length,3);assert.equal(weakResult.displacedIds.length,0);assert.equal(providerSeedCandidateRouting(target,weak,weakResult.candidates).destinationClass,'AUTH_OR_PAYMENT');
 const duplicate={...independent,candidateId:'duplicate'},equal=refreshProviderSeedAuthorityFrontier({researchTarget:target,candidates:weakResult.candidates,activeCandidateIds:weakResult.activeCandidateIds,newCandidates:[duplicate],limit:2});assert.deepEqual(equal.activeCandidateIds,weakResult.activeCandidateIds);assert.equal(equal.candidates.length,3);assert(equal.rejectedCandidates.some(row=>row.candidateId===duplicate.candidateId&&row.reason==='REDIRECT_DESTINATION_DUPLICATE'));
});

test('old checkpoint reconstruction is deterministic and explicit inactive membership does not resurrect',()=>{
 const history=[candidate('https://reference.example/',0),candidate('https://northstar.example/about',1),candidate('https://northstar-labs.example/about',2),candidate('https://auth.example/login',3)],reviewed=[history[1].candidateId],first=refreshProviderSeedAuthorityFrontier({researchTarget:target,candidates:history,limit:2,ineligibleCandidateIds:reviewed}),second=refreshProviderSeedAuthorityFrontier({researchTarget:target,candidates:history,limit:2,ineligibleCandidateIds:reviewed});
 assert.equal(first.reconstructed,true);assert.deepEqual(first.activeCandidateIds,second.activeCandidateIds);assert.equal(first.activeCandidateIds.length,2);assert(!first.activeCandidateIds.includes(history[1].candidateId));
 const persisted=refreshProviderSeedAuthorityFrontier({researchTarget:target,candidates:history,activeCandidateIds:[first.activeCandidateIds[0]],limit:2,ineligibleCandidateIds:reviewed});assert.deepEqual(persisted.activeCandidateIds,[first.activeCandidateIds[0]]);assert.equal(persisted.reconstructed,false);
});

test('deduplication, redirect loop, and depth rejection never consume active capacity',()=>{
 const parent=candidate('https://northstar.example/start',0),other=candidate('https://reference.example/',1),active=[parent,other],duplicate={...other,candidateId:'duplicate'},admission=refreshProviderSeedAuthorityFrontier({researchTarget:target,candidates:active,activeCandidateIds:active.map(row=>row.candidateId),newCandidates:[duplicate],limit:2});
 assert.deepEqual(admission.activeCandidateIds,active.map(row=>row.candidateId));assert.equal(admission.candidates.length,2);
 const base={researchTarget:target,parent:{...parent,redirectChain:['https://origin.example/'],navigationDepth:1},candidates:active,navigationDepthLimit:2,insertionOrder:2};assert.equal(providerSeedRedirectCandidate({...base,page:page('https://origin.example/')}).candidate,null);assert.equal(providerSeedRedirectCandidate({...base,parent:{...base.parent,navigationDepth:2},page:page('https://regional.example/')}).candidate,null);
});
