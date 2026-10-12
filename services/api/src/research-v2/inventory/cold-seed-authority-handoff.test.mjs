import '../offline-replay/offline-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {digest} from '../../research-v3/model.mjs';
import {providerOrBrandResearchTarget} from '../../research-v3/research-target.mjs';
import {runProviderSeedCampaign} from './provider-seed-campaign.mjs';

const market='DE';
const temp=t=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'cold-seed-authority-handoff-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;};
const page=(url,body)=>({url,requestedUrl:url,outcome:'OK',httpStatus:200,contentType:'text/html',truncated:false,body,sourceIntegrity:{sha256:digest(body)},accessDecisions:[{decision:'ALLOWED'}]});
const incomplete=url=>({url,requestedUrl:url,outcome:'UNRESOLVED',failure:{code:'DIRECT_FETCH_FAILED'},accessDecisions:[{decision:'ALLOWED'}]});
const terms=(name,url)=>`<html><head><script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@type':'Organization',name,url})}</script></head><body><main>We operate ${name} subscription service and provide our own digital library.</main><footer>© ${name} 2026</footer><script type="application/json">${JSON.stringify({subscriptionServiceCatalog:{scope:'PROVIDER_SUBSCRIPTION_SERVICES',coverage:'COMPLETE',serviceIds:[]}})}</script></body></html>`;
const malformedPresentation=(name,url)=>`<html><head><title></title><meta property="og:title" content="${name}"><meta property="og:site_name" content="${name}"><meta property="og:url" content="${url}"><link rel="canonical" href="${url}"></head><body><main>${name} subscription offers.</main></body></html>`;
const conflictingPresentation=(name,url)=>`<html><head><title>Other Operator</title><meta property="og:title" content="Other Operator"><meta property="og:url" content="${url}"><link rel="canonical" href="${url}"><meta name="description" content="${name} offers a subscription service"></head><body><main>Other Operator</main></body></html>`;

test('invalid standalone presentation still researches the exact plausible provider candidate',async t=>{
 const name='Leafread',candidate='https://offers.leafread.example/de',termsUrl='https://offers.leafread.example/legal/terms',calls=[];let searches=0;
 const createAdapters=async()=>({
  search:async({query})=>{calls.push({type:'SEARCH',query});searches++;return searches===1?{results:[{url:candidate,title:name+' offer'}]}:{results:[{url:'https://reviews.invalid/leafread',title:name+' review',content:'official snippet only'},{url:termsUrl,title:name+' terms'}]};},
  read:async({url})=>{calls.push({type:'READ',url});if(url===candidate)return page(url,malformedPresentation(name,url));if(url===termsUrl)return page(url,terms(name,url));assert.fail('unexpected read: '+url);}
 });
 const result=await runProviderSeedCampaign({directory:temp(t),researchTarget:providerOrBrandResearchTarget({seedName:name,targetMarket:market}),createAdapters,capabilities:{direct:true,tavily:true,decodo:false,browser:false,groq:false}});
 const original=result.candidateReviews.find(row=>row.url===candidate);
 assert.equal(original.authorityDiagnostic.mechanisms.find(row=>row.mechanism==='FIRST_PARTY_DOCUMENT_PRESENTATION').outcome,'INVALID');
 assert.equal(original.authorityDiagnostic.mechanisms.some(row=>row.outcome==='CONFLICT'),false);
 assert.deepEqual(calls.map(row=>row.type+':'+(row.url??row.query)),['SEARCH:Leafread official site','READ:'+candidate,'SEARCH:Leafread offers.leafread.example official terms','READ:'+termsUrl]);
 assert.equal(result.authorityResearch.length,1);
 assert.equal(result.authorityResearch[0].trigger,'EXACT_UNRESOLVED_PROVIDER_CANDIDATE');
 assert.equal(result.authorityResearch[0].url,candidate);
 assert.equal(result.authorityResearch[0].query,'Leafread offers.leafread.example official terms');
 assert.equal(result.authorityResearch[0].searchResults[0].truthAuthority,'NONE');
 assert.equal(result.authorityResearch[0].searchResults[0].snippetExcludedFromEvidence,true);
 assert.equal(result.authorityResearch[0].result,'PROVIDER_BOUND');
 assert.equal(result.providerAuthorityBinding.host,'offers.leafread.example');
 assert.equal(result.usage.searches,2);
 assert.equal(result.usage.reads,2);
});

test('explicit conflicting provider presentation cannot trigger or gain provider authority',async t=>{
 const name='Leafread',candidate='https://offers.leafread.example/de',calls=[];
 const createAdapters=async()=>({
  search:async({query})=>{calls.push({type:'SEARCH',query});return {results:[{url:candidate,title:name+' offer'}]};},
  read:async({url})=>{calls.push({type:'READ',url});return page(url,conflictingPresentation(name,url));}
 });
 const result=await runProviderSeedCampaign({directory:temp(t),researchTarget:providerOrBrandResearchTarget({seedName:name,targetMarket:market}),createAdapters,limits:{reads:2},capabilities:{direct:true,tavily:true,decodo:false,browser:false,groq:false}}),review=result.candidateReviews[0];
 assert.equal(review.authorityDiagnostic.mechanisms.some(row=>row.outcome==='CONFLICT'),true);
 assert.deepEqual(calls.map(row=>row.type),['SEARCH','READ']);
 assert.equal(result.authorityResearch,undefined);
 assert.equal(result.providerAuthorityBinding,null);
});

test('incomplete exact provider root uses objective discovery without giving third parties authority',async t=>{
 const name='Cinemora',candidate='https://watch.cinemora.example/',evidence='https://encyclopedia.example/cinemora',locale='https://de.encyclopedia.example/cinemora',termsUrl='https://watch.cinemora.example/legal/terms',calls=[];let searches=0,candidateReads=0;
 const evidenceBody=`<html><body><main>Independent reference page.</main><a href="${locale}">Deutsch</a><a href="${candidate}">${name} official site</a></body></html>`;
 const createAdapters=async()=>({
  search:async({query})=>{calls.push({type:'SEARCH',query});searches++;return searches===1?{results:[{url:candidate,title:name+' home'},{url:evidence,title:name+' reference'}]}:{results:[{url:termsUrl,title:name+' terms'}]};},
  read:async({url})=>{calls.push({type:'READ',url});if(url===candidate&&candidateReads++===0)return incomplete(url);if(url===candidate)return page(url,'<html><head><title>'+name+'</title></head><body>Subscription service.</body></html>');if(url===evidence)return page(url,evidenceBody);if(url===termsUrl)return page(url,terms(name,url));assert.fail('unexpected read: '+url);}
 });
 const result=await runProviderSeedCampaign({directory:temp(t),researchTarget:providerOrBrandResearchTarget({seedName:name,targetMarket:market}),createAdapters,capabilities:{direct:true,tavily:true,decodo:false,browser:false,groq:false}});
 assert.deepEqual(calls.filter(row=>row.type==='READ').map(row=>row.url),[candidate,termsUrl]);
 assert.deepEqual(calls.filter(row=>row.type==='SEARCH').map(row=>row.query),['Cinemora official site','Cinemora subscription plans membership pricing Germany']);
 assert.equal(result.authorityResearch,undefined);
 assert.equal(result.providerAuthorityBinding.host,'watch.cinemora.example');
 assert.equal(result.discovery.candidates.some(row=>row.url===termsUrl&&row.originKind==='OBJECTIVE_SEARCH'),true);
 assert.equal(calls.some(row=>row.url===evidence||row.url===locale),false);
 assert.equal(result.candidateReviews.some(row=>row.host==='encyclopedia.example'&&row.status==='ESTABLISHED'),false);
 assert.equal(result.candidateReviews.some(row=>row.host==='de.encyclopedia.example'&&row.status==='ESTABLISHED'),false);
 assert.equal(result.discovery.candidates.filter(row=>row.host.endsWith('encyclopedia.example')).every(row=>row.truthAuthority==='NONE'),true);
 assert.equal(result.usage.searches,2);
 assert.equal(result.usage.reads,2);
});
