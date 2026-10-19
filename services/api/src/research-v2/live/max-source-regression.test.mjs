import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {digest} from '../../research-v3/model.mjs';
import {interpretSubscriptionPage} from '../../research-v3/subscription-page.mjs';
import {baselineProviderSourceHosts,providerSourceDomainFamily} from '../../research-v3/provider-source-family.mjs';
import {acquisitionCapacity} from '../../research-v3/acquisition-contract.mjs';
import {classifyAcquiredSource,classifyRetainedSource} from './source-classification.mjs';
import {evaluateCountryProviderTruth,evaluateProviderSourceTruth} from './provider-source-v3.mjs';
import {projectEstablishedV3Offerings} from '../inventory/v3-result-projection.mjs';
import {OpenWebResearch,openWebBounds} from './open-web-discovery.mjs';
import {providerRoutingAuthority} from './provider-routing-authority.mjs';

const fixtureDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../research-v3/fixtures/max');
// US: fresh official Direct read. DE: exact Direct body retained by job
// 1b601bdb-6d4d-f8df-9ee0-3b48b31d85ce. Neither file carries a Decodo
// country receipt; the countryFixture below exercises that gate synthetically.
const cases={
 US:{url:'https://help.hbomax.com/us/Answer/Detail/000002547?pubDate=20260926',hash:'22f6b8c80f6fdc6524a5dd8ba64023b4a4abd6b93c6c1c6643af24270d75ad9c',file:'us-help-pricing.html.gz',plans:[['Basic with Ads',10.99,'USD'],['Standard',18.49,'USD'],['Premium',22.99,'USD']]},
 DE:{url:'https://www.hbomax.com/de/de',hash:'f6a618d5ab14ea3ce06b599756f707eccb12855b5430d03fc6625a4f5caf00df',file:'de-homepage.html.gz',plans:[['Basis mit Werbung',5.99,'EUR'],['Standard',11.99,'EUR'],['Premium',16.99,'EUR']]}
};
for(const row of Object.values(cases))row.body=gunzipSync(fs.readFileSync(path.join(fixtureDir,row.file))).toString('utf8');
const target=market=>({id:'max-'+market,service:'max',serviceName:'Max',market,providerSourceIdentityHosts:baselineProviderSourceHosts('max','Max'),authorities:[]});

function countryFixture(market,{body=cases[market].body,url=cases[market].url}={}){
 const hash=digest(body),id='fixture-'+market,before='1'.repeat(64),after='2'.repeat(64),continuityRef='same-session';
 const receipt=(url,bodySha256)=>({url,bodySha256,bindingRef:id,bindingChanged:false,destinationMode:'PINNED_CONNECT',continuityRef});
 const geo={classification:'G1',reasons:[],targetCountry:market,geoCountry:market,bodyHash:hash,sourceUrl:url,attemptId:id,transport:{providerId:'decodo',method:'APPROVED_PROXY',mode:'SESSION',bindingRef:id},receiptIndexes:{before:0,response:1,after:2},geoProofHashes:{before,after}};
 const sourceCheck={hash,status:'HASH_VERIFIED',receipt:{intact:true,bodyHash:hash,service:'max',serviceEstablished:true,bindingEstablished:true,sourceUrl:url,geo}};
 const attempt={id,providerId:'decodo',method:'APPROVED_PROXY',mode:'SESSION',targetCountry:market,bindingRef:id,sessionRef:id+'-session',requestedUrl:url,finalUrl:url,outcome:'OBSERVED',cleanup:'RELEASED',receipts:[receipt('https://exit.example/before',before),receipt(url,hash),receipt('https://exit.example/after',after)],transportVerification:{version:2,level:'BRACKET_VERIFIED',providerId:'decodo',bindingRef:id,targetCountry:market,before:{status:'MATCH',country:market},after:{status:'MATCH',country:market},target:{finalUrl:url,outcome:'OK'},equality:true,continuity:'NO_OBSERVED_CHANGE',conflicts:[]},page:{url,requestedUrl:url,outcome:'OK',httpStatus:200,contentType:'text/html',targetCountry:market,sourceIntegrity:{sha256:hash},rawSource:{text:body},accessDecisions:[{decision:'ALLOWED'}],authority:{status:'CONFIGURED_REVIEWED',hostname:new URL(url).hostname,provider:'Max',sourceType:'OFFICIAL_PROVIDER',sourceUrl:url,checkedAt:'2026-10-10T00:00:00.000Z'}}};
 return {target:target(market),sourceCheck,attempt};
}

test('Max aliases only the two exact official HBO Max source hosts',()=>{
 assert(target('US').providerSourceIdentityHosts.includes('www.max.com'));
 for(const host of ['www.max.com','www.hbomax.com','help.hbomax.com'])assert(providerSourceDomainFamily(target('US'),`https://${host}/plans`),host);
 for(const host of ['hbomax.com.evil.example','evil.hbomax.com','not-hbomax.com','help.hbomax.com.evil.example'])assert.equal(providerSourceDomainFamily(target('US'),`https://${host}/plans`),null,host);
 assert.equal(providerSourceDomainFamily({...target('US'),service:'netflix',serviceName:'Netflix'},cases.US.url),null);
 assert.equal(providerRoutingAuthority(target('US'),cases.US.url),null,'post-acquisition identity grants no navigation authority');
 for(const market of ['US','DE']){
  const row=cases[market],page={url:row.url,requestedUrl:row.url,outcome:'OK',httpStatus:200,contentType:'text/html',truncated:false,bodyHash:row.hash,sourceIntegrity:{sha256:row.hash},accessDecisions:[{decision:'ALLOWED'}]};
  assert.equal(classifyAcquiredSource({target:target(market),page,body:row.body,observationId:'max-'+market}).status,'PROVIDER_SOURCE');
  assert.equal(classifyAcquiredSource({target:target(market),page:{...page,sourceIntegrity:{sha256:'0'.repeat(64)}},body:row.body,observationId:'tampered'}).reason,'SOURCE_INTEGRITY_INVALID');
 }
});

for(const [market,row] of Object.entries(cases))test(`authentic ${market} frozen source has exactly three standalone monthly Max plans`,()=>{
 assert.equal(digest(row.body),row.hash);
 const parsed=interpretSubscriptionPage({body:row.body,url:row.url,providerName:'Max',marketCurrencyHint:market==='US'?'USD':'EUR'});
 assert.deepEqual(parsed.services.map(service=>service.name),['Max']);
 assert.deepEqual(parsed.offerings.map(offer=>[offer.name,offer.charges[0].amount,offer.charges[0].currency]),row.plans);
 assert(parsed.offerings.every(offer=>offer.charges.length===1&&offer.charges[0].cadence==='MONTHLY'&&offer.charges[0].billingCadence==='MONTHLY'&&offer.charges[0].amountDerivation==='EXPLICIT'));
 assert(parsed.offerings.every(offer=>digest(row.body.slice(offer.presentation.start,offer.presentation.end))===offer.presentation.sha256));
 assert.equal(parsed.limited,false);
});

test('existing bounded body store retains the full DE page and classifies its exact hash',t=>{
 const row=cases.DE,directory=fs.mkdtempSync(path.join(os.tmpdir(),'max-de-retained-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 assert(Buffer.byteLength(row.body)<openWebBounds.bytesPerPage);
 assert(Buffer.byteLength(row.body)<acquisitionCapacity.decodedResponseBytes);
 const current=target('DE'),session=new OpenWebResearch(directory,[{...current,operationsObjective:'PRICE_RESEARCH',researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},urls:[],leads:[],gaps:['amount'],capabilities:{direct:true,tavily:false,decodo:true,browser:false,groq:false}}]);
 session.state.pending={id:'frozen-response',type:'READ',target:current.id,url:row.url};
 session.accept('frozen-response',{url:row.url,outcome:'OK',httpStatus:200,contentType:'text/html',sourceIntegrity:{sha256:row.hash},accessDecisions:[{decision:'ALLOWED'}],rawSource:{text:row.body}});
 const read=session.target(current.id).reads[0];
 assert.equal(read.bodyHash,row.hash);
 assert.equal(digest(fs.readFileSync(path.join(directory,read.bodyFile),'utf8')),row.hash);
 assert.equal(classifyRetainedSource({directory,target:current,page:read,observationId:'retained-de'}).status,'PROVIDER_SOURCE');
});

test('US article rejects unsupported list shapes and annual-only, discounted and bundled rows',()=>{
 const row=cases.US,modified=row.body.replace('$18.49/month or $184.99/year','$184.99/year').replace('Basic with Ads</a> - $10.99/month','HBO Max + Hulu bundle</a> - $10.99/month');
 const parsed=interpretSubscriptionPage({body:modified,url:row.url,providerName:'Max',marketCurrencyHint:'USD'});
 assert.deepEqual(parsed.offerings.map(offer=>offer.name),[]);
 assert.deepEqual(interpretSubscriptionPage({body:row.body.replace('monthly or yearly billing.','flexible billing.'),url:row.url,providerName:'Max',marketCurrencyHint:'USD'}).offerings,[]);
 const additions=['Student Discount','Introductory Premium','HBO Max + Hulu bundle','Sports Add-On'].map(name=>`<li class="listitem"><p><a>${name}</a> - $4.99/month or $49.99/year</p></li>`).join('');
 const listEnd=row.body.indexOf('</ul>',row.body.indexOf('Here are the HBO Max plans and prices:'));
 const withExtras=row.body.slice(0,listEnd)+additions+row.body.slice(listEnd);
 assert.deepEqual(interpretSubscriptionPage({body:withExtras,url:row.url,providerName:'Max',marketCurrencyHint:'USD'}).offerings.map(offer=>offer.name),row.plans.map(plan=>plan[0]));
});

test('DE homepage rejects annual action, mismatched card and non-standalone offer',()=>{
 const row=cases.DE,modified=row.body.replace('route=ad-free-monthly','route=ad-free-annual').replace('Basis mit Werbung</h3>','Extra Member</h3>');
 const parsed=interpretSubscriptionPage({body:modified,url:row.url,providerName:'Max',marketCurrencyHint:'EUR'});
 assert.deepEqual(parsed.offerings.map(offer=>offer.name),[]);
 const promotional=row.body.replace('Basis mit Werbung</h3>','Basis mit Werbung</h3><p>Erste 3 Monate Rabatt</p>');
 assert.deepEqual(interpretSubscriptionPage({body:promotional,url:row.url,providerName:'Max',marketCurrencyHint:'EUR'}).offerings.map(offer=>offer.name),['Standard','Premium']);
});

for(const [market,row] of Object.entries(cases))test(`${market} Direct source has no Verified market without country receipt`,()=>{
 const result=evaluateProviderSourceTruth({target:target(market),retained:{url:row.url,requestedUrl:row.url,httpStatus:200,contentType:'text/html',bodyHash:row.hash,sourceIntegrity:{sha256:row.hash},rawSource:{text:row.body},accessDecisions:[{decision:'ALLOWED'}]},acquisition:{route:'DIRECT'},observationId:'direct-'+market});
 assert.equal(result.v3Truth.established,false);
 assert.equal(projectEstablishedV3Offerings({...target(market),...result}).length,0);
});

for(const [market,row] of Object.entries(cases))test(`${market} source passes unchanged V3 Truth with a simulated valid country receipt`,()=>{
 // These receipt records are test doubles. The frozen files themselves came
 // from Direct reads and are not evidence of a production Verified result.
 const fixture=countryFixture(market),result=evaluateCountryProviderTruth(fixture),established=projectEstablishedV3Offerings({...fixture.target,...result});
 assert.deepEqual(established.map(offer=>[offer.name,offer.ordinaryRecurringPrice.amount,offer.ordinaryRecurringPrice.currency]),row.plans);
 assert.equal(result.v3SuggestedCandidates.length,3);
 assert(result.v3SuggestedCandidates.every(candidate=>candidate.provenance==='V3_SOURCE_RESEARCH'));
 assert(established.every(offer=>offer.propositionStates.TARGET_MARKET==='ESTABLISHED'));
});

test('receipt and source hash must match the exact retained Max body',()=>{
 const missing=countryFixture('DE');missing.sourceCheck.receipt.intact=false;assert.throws(()=>evaluateCountryProviderTruth(missing),/COUNTRY_PROVIDER_RECEIPT_INVALID/);
 const mismatch=countryFixture('DE');mismatch.sourceCheck.receipt.bodyHash='0'.repeat(64);assert.throws(()=>evaluateCountryProviderTruth(mismatch),/COUNTRY_PROVIDER_HASH_MISMATCH/);
 const wrongCountry=countryFixture('DE');wrongCountry.sourceCheck.receipt.geo.geoCountry='US';assert.throws(()=>evaluateCountryProviderTruth(wrongCountry),/COUNTRY_PROVIDER_RECEIPT_INVALID/);
});

test('a Swedish provider page is not accepted as US price evidence',()=>{
 const body=cases.DE.body.replace(/<html\b[^>]*>/u,'<html lang="sv-SE">').replaceAll('€/Monat','kr/månad'),fixture=countryFixture('US',{body,url:'https://www.hbomax.com/se/sv'}),result=evaluateCountryProviderTruth(fixture);
 assert.equal(projectEstablishedV3Offerings({...fixture.target,...result}).length,0);
 const germanAsUS=countryFixture('US',{body:cases.DE.body,url:cases.DE.url}),crossCountry=evaluateCountryProviderTruth(germanAsUS);
 assert.equal(projectEstablishedV3Offerings({...germanAsUS.target,...crossCountry}).length,0);
});
