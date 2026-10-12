import '../offline-replay/offline-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {digest} from '../../research-v3/model.mjs';
import {providerOrBrandResearchTarget} from '../../research-v3/research-target.mjs';
import {runProviderSeedCampaign} from './provider-seed-campaign.mjs';

const market='DE';
const temp=t=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'cold-seed-authority-handoff-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;};
const page=(url,body)=>({url,requestedUrl:url,outcome:'OK',httpStatus:200,contentType:'text/html',truncated:false,body,sourceIntegrity:{sha256:digest(body)},accessDecisions:[{decision:'ALLOWED'}]});
const unresolved=(name,url,link)=>`<html><head><title>${name}</title><meta property="og:title" content="${name}"><meta property="og:site_name" content="${name}"><meta property="og:url" content="${url}"><link rel="canonical" href="${url}"></head><body><a href="${link}">Germany subscription offers</a><footer>© ${name} 2026</footer></body></html>`;
const terms=(name,url)=>`<html><head><script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@type':'Organization',name,url})}</script></head><body><main>We operate ${name} subscription service and provide our own digital library.</main><footer>© ${name} 2026</footer><script type="application/json">${JSON.stringify({subscriptionServiceCatalog:{scope:'PROVIDER_SUBSCRIPTION_SERVICES',coverage:'COMPLETE',serviceIds:[]}})}</script></body></html>`;

async function fixture(t,{name,root,regional,termsUrl,noisy}){
 const calls=[],rootBody=unresolved(name,root,regional),regionalBody='<html><body>Regional subscription presentation.</body></html>',termsBody=terms(name,termsUrl);let searches=0;
 const createAdapters=async({stage})=>{assert.equal(stage,'PROVIDER_SEED');return {search:async({query})=>{calls.push({type:'SEARCH',query});searches++;return searches===1?{results:[{url:noisy[0],title:name+' encyclopedia'},{url:root,title:name+' home'},{url:noisy[1],title:name+' social'}]}:{results:[{url:'https://reviews.invalid/'+name.toLowerCase(),title:name+' official review',content:'official snippet only'},{url:termsUrl,title:name+' terms'}]};},read:async({url})=>{calls.push({type:'READ',url});if(url===root)return page(url,rootBody);if(url===regional)return page(url,regionalBody);if(url===termsUrl)return page(url,termsBody);assert.fail('noisy candidate consumed a scarce read: '+url);}};};
 const result=await runProviderSeedCampaign({directory:temp(t),researchTarget:providerOrBrandResearchTarget({seedName:name,targetMarket:market}),createAdapters,capabilities:{direct:true,tavily:true,decodo:false,browser:false,groq:false}});
 return {result,calls};
}

test('cold noisy seed hands an exact source-bound regional candidate to existing AUTHORITY_DISCOVERY',async t=>{
 const name='Novella',root='https://global.novella.example/',regional='https://angebote-novella.example/de',termsUrl='https://angebote-novella.example/terms',{result,calls}=await fixture(t,{name,root,regional,termsUrl,noisy:['https://encyclopedia.invalid/novella','https://social.invalid/novella']});
 assert.deepEqual(calls.map(row=>row.type+':'+(row.url??row.query)),['SEARCH:Novella official site','READ:'+root,'READ:'+regional,'SEARCH:Novella angebote-novella.example official terms','READ:'+termsUrl]);
 assert.equal(result.authorityResearch.length,1);assert.equal(result.authorityResearch[0].trigger,'SOURCE_BOUND_EXACT_DESTINATION');assert.equal(result.authorityResearch[0].query,'Novella angebote-novella.example official terms');assert.equal(result.authorityResearch[0].searchResults[0].truthAuthority,'NONE');assert.equal(result.authorityResearch[0].searchResults[0].snippetExcludedFromEvidence,true);assert.equal(result.authorityResearch[0].result,'PROVIDER_BOUND');assert.equal(result.providerAuthorityBinding.host,'angebote-novella.example');assert.equal(result.usage.searches,2);assert.equal(result.usage.reads,3);assert.equal(result.candidateReviews.some(row=>row.url.includes('encyclopedia.invalid')),false);assert.equal(result.candidateReviews.some(row=>row.url.includes('social.invalid')),false);
});

test('provider-affinity continuation preempts encyclopedic and social rank without authorizing them',async t=>{
 const name='Cineverse',root='https://cineverse.example/',regional='https://de.cineverse.example/',termsUrl='https://de.cineverse.example/legal/terms',{result,calls}=await fixture(t,{name,root,regional,termsUrl,noisy:['https://reference.invalid/cineverse','https://community.invalid/cineverse']});
 assert.deepEqual(calls.filter(row=>row.type==='READ').map(row=>row.url),[root,regional,termsUrl]);assert.equal(result.authorityResearch[0].query,'Cineverse de.cineverse.example official terms');assert.equal(result.authorityResearch[0].reads.at(-1).status,'PROVIDER_BOUND');assert.equal(result.providerAuthorityBinding.host,'de.cineverse.example');for(const candidate of result.discovery.candidates.filter(row=>row.host.endsWith('.invalid')))assert.equal(candidate.truthAuthority,'NONE');assert.equal(result.usage.reads,3);assert.equal(result.usage.searches,2);
});
