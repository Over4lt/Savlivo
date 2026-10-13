import '../offline-replay/offline-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {digest} from '../../research-v3/model.mjs';
import {providerOrBrandResearchTarget} from '../../research-v3/research-target.mjs';
import {reviewV2CandidateAuthority} from '../../research-v3/v2-candidate-authority-adapter.mjs';
import {runProviderSeedCampaign} from './provider-seed-campaign.mjs';
import {orderProviderSeedAuthorityCandidates,providerSeedAuthoritySemanticClass} from './provider-seed-authority-routing.mjs';

const unresolved={version:1,decision:'UNRESOLVED',stage:'FINAL',reason:'NO_ACCEPTED_PROVIDER_PROOF',mechanisms:[{mechanism:'OBSERVATION',outcome:'PASS'},{mechanism:'CANDIDATE_HOST',outcome:'PASS'},{mechanism:'STRUCTURED_DIRECT_IDENTITY',outcome:'NO_MATCH',reason:'NO_EXACT_ORIGIN_ORGANIZATION'}]};
const target=providerOrBrandResearchTarget({seedName:'Northstar',targetMarket:'DE'});
const candidate=(id,url,extra={})=>({candidateId:id,url,host:new URL(url).hostname,originKind:'SOURCE_BOUND_CONTINUATION',searchIndex:0,searchRank:0,insertionOrder:Number(id.replace(/\D/gu,''))||0,navigationDepth:1,score:extra.score??1,...extra});

test('exact target authority evidence wins over an irrelevant locale sibling for the reported gap',()=>{
 const exact=candidate('c1','https://eu.northstar.example/'),locale=candidate('c2','https://de-eu.northstar.example/',{score:20});
 const ordered=orderProviderSeedAuthorityCandidates(target,[locale,exact],{authorityGap:{authorityTargetHost:'eu.northstar.example',authorityDiagnostic:unresolved}});
 assert.equal(ordered[0].url,exact.url);assert.equal(ordered[0].routing.authorityGapOrder,3);assert.equal(ordered[1].routing.authorityGapOrder,4);
});

test('a sibling carrying explicit source-bound evidence for the exact target may win',()=>{
 const exact=candidate('c1','https://eu.northstar.example/catalog',{score:20}),sibling=candidate('c2','https://de-eu.northstar.example/about',{authorityEvidenceFor:'eu.northstar.example',sourceBoundCandidate:true,source:{observation:'observation-1'},score:1});
 const ordered=orderProviderSeedAuthorityCandidates(target,[exact,sibling],{authorityGap:{authorityTargetHost:'eu.northstar.example',authorityDiagnostic:unresolved}});
 assert.equal(ordered[0].url,sibling.url);assert.equal(ordered[0].routing.authorityGapOrder,0);
});

test('source-observed legal capability resolves the authority gap before generic identity presentation',()=>{
 const source={observation:'membership',start:10,end:40},about=candidate('c1','https://northstar.example/one',{label:'About',source,score:20}),legal=candidate('c2','https://northstar.example/two',{label:'Terms and privacy',source,score:1});
 const ordered=orderProviderSeedAuthorityCandidates(target,[about,legal],{authorityGap:{authorityTargetHost:'northstar.example',authorityDiagnostic:unresolved}});
 assert.equal(ordered[0].url,legal.url);assert.equal(ordered[0].routing.authorityEvidenceCapability.kind,'LEGAL_OR_OPERATOR_DOCUMENT');
});

test('explicit operator presentation beats a non-specific terms presentation in reverse case',()=>{
 const source={observation:'root',start:10,end:40},about=candidate('c1','https://northstar.example/a',{label:'About — operated by Northstar GmbH',source,score:1}),terms=candidate('c2','https://northstar.example/b',{label:'Subscriber terms',source,score:20});
 const ordered=orderProviderSeedAuthorityCandidates(target,[terms,about],{authorityGap:{authorityTargetHost:'northstar.example',authorityDiagnostic:unresolved}});
 assert.equal(ordered[0].url,about.url);assert.equal(ordered[0].routing.authorityEvidenceCapability.kind,'EXPLICIT_RELATIONSHIP_PRESENTATION');
});

test('G repeated zero-progress authority presentation class loses priority',()=>{
 const source={observation:'root',start:10,end:40},about=candidate('c1','https://northstar.example/a',{label:'About',source,score:20}),other=candidate('c2','https://northstar.example/b',{label:'Company',source,score:1}),legal=candidate('c3','https://northstar.example/c',{label:'Legal operator information',source,score:1}),semantic=providerSeedAuthoritySemanticClass(about),ordered=orderProviderSeedAuthorityCandidates(target,[about,other,legal],{authorityGap:{authorityTargetHost:'northstar.example',authorityDiagnostic:unresolved,zeroProgressClasses:{[semantic]:2}}});
 assert.equal(ordered[0].candidateId,legal.candidateId);assert.equal(ordered.find(row=>row.candidateId===about.candidateId).routing.zeroProgressPenalty,1);
});

test('H related-host witness is routing evidence only and cannot inherit authority',()=>{
 const witness=candidate('c1','https://related.northstar.example/relationship',{authorityEvidenceFor:'northstar.example',sourceBoundCandidate:true,source:{observation:'provider-source',start:1,end:20},label:'Northstar provider relationship'}),ordered=orderProviderSeedAuthorityCandidates(target,[witness],{authorityGap:{authorityTargetHost:'northstar.example',authorityDiagnostic:unresolved}});
 assert.equal(ordered[0].routing.authorityGapOrder,0);assert.equal(ordered[0].truthAuthority,undefined);assert.equal('providerAuthorityBinding' in ordered[0],false);
});

const page=(url,body)=>({url,requestedUrl:url,outcome:'OK',httpStatus:200,contentType:'text/html',truncated:false,rawSource:{text:body},bodyHash:digest(body),sourceIntegrity:{sha256:digest(body)},accessDecisions:[{decision:'ALLOWED'}]});
const redirect=(requestedUrl,url)=>({url,requestedUrl,outcome:'ROUTING_ONLY',httpStatus:302,contentType:null,truncated:false,redirects:[url],accessDecisions:[{decision:'ALLOWED'}],redirectStop:{kind:'CROSS_HOST_REDIRECT_STOP',requestedUrl,requestedHost:new URL(requestedUrl).hostname,sourceUrl:requestedUrl,sourceHost:new URL(requestedUrl).hostname,destinationUrl:url,destinationHost:new URL(url).hostname,redirectChain:[requestedUrl,url],navigationDepth:1,httpStatus:302}});

test('an already-read routing-only resource is not reacquired during authority evidence research',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'gap-authority-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const routing='https://northstar.example/subscription',exact='https://offers.northstar.example/subscription',terms='https://offers.northstar.example/legal/terms',calls=[];let searches=0;
 const createAdapters=async()=>({
  search:async()=>{searches++;return {results:searches===1?[{url:routing,title:'Northstar subscription'}]:[{url:routing,title:'Northstar subscription'},{url:exact,title:'Northstar offers'},{url:terms,title:'Northstar terms'}]};},
  read:async({url})=>{calls.push(url);if(url===routing)return redirect(routing,exact);if(url===exact)return page(exact,'<html><body>Northstar subscription.</body></html>');if(url===terms)return page(terms,`<script type="application/ld+json">${JSON.stringify({'@type':'Organization',name:'Northstar',url:'https://offers.northstar.example/'})}</script>`);assert.fail('unexpected read: '+url);}
 });
 const result=await runProviderSeedCampaign({directory:root,researchTarget:target,createAdapters,limits:{reads:3},capabilities:{direct:true,tavily:true,decodo:false,browser:false,groq:false}});
 assert.deepEqual(calls,[routing,exact,terms]);assert.equal(calls.filter(url=>url===routing).length,1);assert.equal(result.providerAuthorityBinding.host,'offers.northstar.example');
});

test('an unrelated third-party legal-looking source cannot establish provider authority',()=>{
 const url='https://legal-archive.example/northstar/terms',body='<html><head><title>Legal Archive</title><meta property="og:title" content="Legal Archive"></head><body>Northstar terms mirror.</body></html>',review=reviewV2CandidateAuthority({contractVersion:1,observationId:'third-party',target:{service:'northstar',serviceName:'Northstar'},page:{...page(url,body),rawSource:{text:body}}});
 assert.equal(review.providerAuthorityBinding,null);assert.equal(review.candidateObservation.authority,'UNREVIEWED_CANDIDATE');
});

test('F targeted authority search ends in semantic exhaustion instead of consuming the read ceiling',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'gap-authority-exhausted-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const exact='https://northstar.example/offers';let searches=0,reads=0;
 const result=await runProviderSeedCampaign({directory:root,researchTarget:target,createAdapters:async()=>({search:async()=>({results:++searches===1?[{url:exact,title:'Northstar subscription offers'}]:[]}),read:async({url})=>{reads++;return page(url,'<html><body>Subscription offers.</body></html>');}}),capabilities:{direct:true,tavily:true,decodo:false,browser:false,groq:false}});
 assert.equal(result.providerAuthorityBinding,null);assert.equal(result.termination.reason,'PROVIDER_AUTHORITY_SEMANTIC_EXHAUSTION');assert.equal(result.authorityResearch.length,1);assert.match(result.authorityResearch[0].query,/northstar\.example/);assert.equal(result.authorityResearch[0].progress.outcome,'NO_PROGRESS');assert(reads<4);assert(searches<=2);
});
