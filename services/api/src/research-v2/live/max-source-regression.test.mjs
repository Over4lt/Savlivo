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
import {OpenWebResearch,openWebBounds,runOpenWebResearch} from './open-web-discovery.mjs';
import {providerRoutingAuthority} from './provider-routing-authority.mjs';
import {derivedCountrySourceCandidates} from './derived-country-sources.mjs';
import {researchLinkPriorityTarget} from './retained-render-source.mjs';
import {v3ResultFromTarget} from '../../google-ai/admin-live-pipeline.mjs';

const fixtureDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../research-v3/fixtures/max');
// US: fresh official Direct read. DE: exact Direct body retained by job
// 1b601bdb-6d4d-f8df-9ee0-3b48b31d85ce. Neither file carries a Decodo
// country receipt; the countryFixture below exercises that gate synthetically.
const cases={
 US:{url:'https://help.hbomax.com/us/Answer/Detail/000002547?pubDate=20260926',hash:'22f6b8c80f6fdc6524a5dd8ba64023b4a4abd6b93c6c1c6643af24270d75ad9c',file:'us-help-pricing.html.gz',plans:[['Basic with Ads',10.99,'USD'],['Standard',18.49,'USD'],['Premium',22.99,'USD']]},
 DE:{url:'https://www.hbomax.com/de/de',hash:'f6a618d5ab14ea3ce06b599756f707eccb12855b5430d03fc6625a4f5caf00df',file:'de-homepage.html.gz',plans:[['Basis mit Werbung',5.99,'EUR'],['Standard',11.99,'EUR'],['Premium',16.99,'EUR']]}
};
for(const row of Object.values(cases))row.body=gunzipSync(fs.readFileSync(path.join(fixtureDir,row.file))).toString('utf8');
const productionUS={
 ...cases.US,
 hash:'664386f1d597a5bfc9b830e5d407362a3614067af5eff85b2e096d40f1ee7c79',
 body:gunzipSync(fs.readFileSync(path.join(fixtureDir,'us-production-help-pricing.html.gz'))).toString('utf8'),
 // The production journal's G1 validation fields and record hash; unrelated
 // transport metadata is omitted, and the retained body is reattached below.
 receipt:JSON.parse(fs.readFileSync(path.join(fixtureDir,'us-production-g1-receipt.json'),'utf8'))
};
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

test('unaltered production Max US source and original G1 receipt establish three monthly offerings',()=>{
 const row=productionUS;
 assert.equal(digest(row.body),row.hash);
 assert.match(row.body,/HHURL\.config\.selectedCountry\s*=\s*["']us["']/u);
 const parsed=interpretSubscriptionPage({body:row.body,url:row.url,providerName:'Max',marketCurrencyHint:'USD'});
 assert.deepEqual(parsed.offerings.map(offer=>[offer.name,offer.charges[0].amount,offer.charges[0].currency]),row.plans);
 assert(parsed.offerings.every(offer=>offer.charges.length===1&&offer.charges[0].cadence==='MONTHLY'&&offer.charges[0].billingCadence==='MONTHLY'));
 const archived=row.receipt;
 assert.equal(archived.jobId,'ed80a630-0f21-8f5f-520d-b8528567d200');
 assert.equal(archived.sourceCheck.hash,row.hash);
 assert.equal(archived.sourceCheck.receipt.geo.sourceReference.hash,archived.recordHash);
 assert.equal(archived.sourceCheck.receipt.geo.classification,'G1');
 const attempt={...archived.attempt,page:{...archived.attempt.page,rawSource:{text:row.body}}};
 const result=evaluateCountryProviderTruth({target:archived.target,sourceCheck:archived.sourceCheck,attempt});
 const established=projectEstablishedV3Offerings({...archived.target,...result});
 assert.deepEqual(established.map(offer=>[offer.name,offer.ordinaryRecurringPrice.amount,offer.ordinaryRecurringPrice.currency]),row.plans);
 assert.equal(new Set(established.map(offer=>offer.id)).size,3);
 assert(result.v3Truth.established);
 assert(established.every(offer=>offer.propositionStates.TARGET_MARKET==='ESTABLISHED'));
 assert.equal(result.v3SuggestedCandidates.length,3);
 assert(result.v3SuggestedCandidates.every(candidate=>candidate.provenance==='V3_SOURCE_RESEARCH'));
 assert.equal(result.v3Observation.sha256,row.hash);
 const wrongCountry=structuredClone(archived.sourceCheck);
 wrongCountry.receipt.geo.geoCountry='DE';
 assert.throws(()=>evaluateCountryProviderTruth({target:archived.target,sourceCheck:wrongCountry,attempt}),/COUNTRY_PROVIDER_RECEIPT_INVALID/);
 const wrongHash={...attempt,page:{...attempt.page,rawSource:{text:row.body+' '}}};
 assert.throws(()=>evaluateCountryProviderTruth({target:archived.target,sourceCheck:archived.sourceCheck,attempt:wrongHash}),/COUNTRY_PROVIDER_HASH_MISMATCH/);
});

test('Max US help article rejects absent, ambiguous and conflicting country markers',()=>{
 const row=productionUS,marker=/HHURL\.config\.selectedCountry\s*=\s*["']us["']/u;
 const parse=body=>interpretSubscriptionPage({body,url:row.url,providerName:'Max',marketCurrencyHint:'USD'}).offerings;
 assert.equal(digest(row.body),row.hash);
 assert.deepEqual(parse(row.body.replace(marker,'')),[]);
 assert.deepEqual(parse(row.body.replace(marker,'HHURL.config.selectedCountry = "de"')),[]);
 assert.deepEqual(parse(row.body.replace(marker,'HHURL.config.selectedCountry = "us"; HHURL.config.selectedCountry = "de"')),[]);
 assert.deepEqual(parse(row.body.replace(marker,'HHURL.config.selectedCountry = "us"; HHURL.config.selectedCountry = "US"')),[]);
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

// Structural excerpt of the retained ES page (full body SHA-256
// 98015f36ea21299b63f271eb9238c14f824427eb874a5633db3dd75a36cd5d5f).
// This local excerpt is intentionally not represented as the production body.
const esCard=(id,name,price,route='/addon-picker')=>`<div id="${id}" data-testid="plan-card"><span aria-label="${name}" data-testid="plan-card-title" role="heading">${name}</span><div><span data-testid="price-container" role="text"><span class="price">${price} €</span>/mes</span></div><a href="https://auth.hbomax.com${route}?pricePlanId=${id}&amp;flow=purchase">Seleccionar plan</a></div>`;
const esExcerpt=`<html lang="es-ES"><head><title>HBO Max | Disfruta de HBO, Discovery, televisión y películas</title></head><body><script>const template = '<div data-testid="plan-card-container"></div>';</script><h1>Empieza a disfrutar con los planes de HBO Max desde solo 6,99 €/mes</h1><button role="tab" aria-label="mensual" aria-selected="true">mensual</button><button role="tab" aria-label="anual" aria-selected="false">anual</button><div data-testid="plan-card-container">${esCard('31014','Básico con anuncios','6,99')}${esCard('30920','Estándar','10,99')}${esCard('30924','Premium','15,99')}${esCard('28610','HBO Max DAZN','44,99','/create-account')}</div><footer><a href="/affiliate">Programa de afiliados</a></footer></body></html>`;
const esUrl='https://www.hbomax.com/es/es',esPlans=[['Básico con anuncios',6.99,'EUR'],['Estándar',10.99,'EUR'],['Premium',15.99,'EUR']];
// Structural excerpt of the official GB article observed in the stopped job.
// This is not the retained 77,799-byte Direct body (SHA-256 1f5bf276...):
// its own hash and any G1 receipt below are deliberately synthetic.
const gbUrl='https://help.hbomax.com/gb/Answer/Detail/000002547';
const gbPlans=[['Basic with Ads',4.99,'GBP'],['Standard with Ads',5.99,'GBP'],['Standard',9.99,'GBP'],['Premium',14.99,'GBP']];
const gbItem=(name,price)=>`<li class="listitem"><p><a class="link">${name}</a> - £${price}/month</p></li>`;
const gbExcerpt=`<html lang="en"><head><title>HBO Max | All about HBO Max plans</title></head><body><script>HHURL.config.selectedCountry = "GB";</script><span>United Kingdom</span><h1>All about HBO Max plans</h1><section><div class="titlepage"><h3 class="title">Saver Plan</h3></div><p>Save on an annual commitment, billed monthly.</p></section><p>You can subscribe to HBO Max through many providers.</p><p>Here are the HBO Max plans and prices:</p><section class="section internal"><div class="titlepage"><div><div class="title"><h3 class="title">HBO Max Entertainment plans</h3></div></div></div><div class="itemizedlist"><ul class="itemizedlist">${gbItem('Basic with Ads','4.99')}${gbItem('Standard with Ads','5.99')}${gbItem('Standard','9.99')}${gbItem('Premium','14.99')}</ul></div></section><section class="section internal"><div class="titlepage"><div><div class="title"><h3 class="title">HBO Max Entertainment &amp; TNT Sports plans</h3></div></div></div><div class="itemizedlist"><ul class="itemizedlist">${gbItem('TNT Sports (UK only)','30.99')}${gbItem('TNT Sports + Premium (UK only)','45.98')}</ul></div><p>HBO Max Standard with Ads Upgrade for £1/month.</p></section></body></html>`;

test('Max GB article layout binds four ordinary monthly plans and ignores Saver, Sports and upgrade prices',()=>{
 const parsed=interpretSubscriptionPage({body:gbExcerpt,url:gbUrl,providerName:'Max',marketCurrencyHint:'GBP'});
 assert.deepEqual(parsed.services.map(row=>row.name),['Max']);
 assert.deepEqual(parsed.offerings.map(row=>[row.name,row.charges[0].amount,row.charges[0].currency]),gbPlans);
 assert(parsed.offerings.every(row=>row.charges.length===1&&row.charges[0].cadence==='MONTHLY'&&row.charges[0].billingCadence==='MONTHLY'&&row.charges[0].amountDerivation==='EXPLICIT'));
 const direct=evaluateProviderSourceTruth({target:target('GB'),retained:{url:gbUrl,requestedUrl:gbUrl,httpStatus:200,contentType:'text/html',bodyHash:digest(gbExcerpt),sourceIntegrity:{sha256:digest(gbExcerpt)},rawSource:{text:gbExcerpt},accessDecisions:[{decision:'ALLOWED'}]},acquisition:{route:'DIRECT'},observationId:'direct-gb-excerpt'});
 assert.equal(projectEstablishedV3Offerings({...target('GB'),...direct}).length,0,'Direct has no G1 market receipt');
 const fixture=countryFixture('GB',{body:gbExcerpt,url:gbUrl}),result=evaluateCountryProviderTruth(fixture),established=projectEstablishedV3Offerings({...fixture.target,...result});
 assert.deepEqual(established.map(row=>[row.name,row.ordinaryRecurringPrice.amount,row.ordinaryRecurringPrice.currency]),gbPlans);
 assert.equal(result.v3SuggestedCandidates.length,4);
 assert(result.v3SuggestedCandidates.every(row=>row.provenance==='V3_SOURCE_RESEARCH'));
});

test('Max GB layout rejects missing, conflicting and wrong country, section, amount and receipt evidence',()=>{
 const parse=(body,url=gbUrl,hint='GBP')=>interpretSubscriptionPage({body,url,providerName:'Max',marketCurrencyHint:hint}).offerings;
 for(const body of [gbExcerpt.replace('HHURL.config.selectedCountry = "GB";',''),gbExcerpt.replace('selectedCountry = "GB"','selectedCountry = "de"'),gbExcerpt.replace('selectedCountry = "GB"','selectedCountry = "gb"; HHURL.config.selectedCountry = "GB"'),gbExcerpt.replace('United Kingdom</span>','Germany</span>'),gbExcerpt.replace('HBO Max Entertainment plans</h3>','HBO Max Saver plans</h3>')])assert.deepEqual(parse(body),[]);
 assert.deepEqual(parse(gbExcerpt,'https://help.hbomax.com/us/Answer/Detail/000002547'),[]);
 assert.deepEqual(parse(gbExcerpt,gbUrl,'USD'),[]);
 assert.deepEqual(parse(gbExcerpt.replace('£9.99/month','£99.99/year')).map(row=>row.name),['Basic with Ads','Standard with Ads','Premium']);
 const wrongMarket=countryFixture('GB',{body:gbExcerpt,url:gbUrl});wrongMarket.sourceCheck.receipt.geo.geoCountry='US';assert.throws(()=>evaluateCountryProviderTruth(wrongMarket),/COUNTRY_PROVIDER_RECEIPT_INVALID/);
 const wrongHash=countryFixture('GB',{body:gbExcerpt,url:gbUrl});wrongHash.attempt.page.rawSource.text+=' ';assert.throws(()=>evaluateCountryProviderTruth(wrongHash),/COUNTRY_PROVIDER_HASH_MISMATCH/);
 const missing=countryFixture('GB',{body:gbExcerpt,url:gbUrl});missing.sourceCheck.receipt.intact=false;assert.throws(()=>evaluateCountryProviderTruth(missing),/COUNTRY_PROVIDER_RECEIPT_INVALID/);
});

test('offline GB priority campaign sends the inferred pricing article through unchanged country V3 before Global fallback',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'max-gb-priority-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const derived=derivedCountrySourceCandidates({service:'max',market:'GB'}),global={id:'22222222-2222-4222-8222-222222222222',serviceId:'max',url:'https://www.hbomax.com/',kind:'DIRECT_SOURCE',marketScope:'GLOBAL',marketCode:null,enabled:true,truthAuthority:'NONE'};
 const caps={direct:false,decodo:true,tavily:false,browser:false,groq:false},current=researchLinkPriorityTarget({...target('GB'),id:'price-research:max:GB',operationsObjective:'PRICE_RESEARCH',researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},researchLinks:[global],researchLinkOutcomes:[],derivedCountryCandidates:derived,urls:[],leads:[],knownCommercialUrls:[],reads:[],queries:[],decisions:[],verified:[],blockedOrigins:[],gaps:['plan','amount','currency','cadence','priceRole','ownership','market'],capabilities:caps},caps),requests=[];
 const state=await runOpenWebResearch({directory,targets:[current],maxActions:1,search:async()=>assert.fail('Tavily request'),read:async()=>assert.fail('Direct request'),acquire:async({candidate,target:selected,route})=>{
  requests.push({url:candidate.url,market:selected.market,route});
  const fixture=countryFixture('GB',{body:gbExcerpt,url:gbUrl}),result=evaluateCountryProviderTruth(fixture),established=projectEstablishedV3Offerings({...fixture.target,...result});
  return {...result,classification:'VERIFIED_OUTPUT',sourceClassification:{status:'PROVIDER_SOURCE',finalUrl:gbUrl,sourceHash:digest(gbExcerpt)},countryV3Evaluation:{status:'EVALUATED',receiptStatus:'HASH_VERIFIED',geoClass:'G1'},verified:established,acquisitionBytes:Buffer.byteLength(gbExcerpt)};
 }});
 assert.deepEqual(requests,[{url:gbUrl,market:'GB',route:'DECODO'}]);
 assert.equal(state.usage.acquisitions,1);
 assert.deepEqual(v3ResultFromTarget(state.targets[0]).verified.map(row=>[row.plan,row.amount,row.currency]),gbPlans);
 assert.equal(state.targets[0].researchLinkOutcomes.length,0,'inferred routes are not Admin Research Links');
});

test('Max ES provider-owned affiliate navigation is not a third-party price presentation',()=>{
 const body=esExcerpt.replace('</footer>',`<script>${JSON.stringify(JSON.stringify({url:'/affiliate'}))}</script></footer>`),hash=digest(body),page={url:esUrl,requestedUrl:esUrl,outcome:'OK',httpStatus:200,contentType:'text/html',truncated:false,bodyHash:hash,sourceIntegrity:{sha256:hash},accessDecisions:[{decision:'ALLOWED'}]};
 assert.equal(classifyAcquiredSource({target:target('ES'),page,body,observationId:'es-excerpt'}).status,'PROVIDER_SOURCE');
 const disclaimer=body.replace('</footer>','<p>Not affiliated with HBO Max</p></footer>'),otherHash=digest(disclaimer);
 assert.equal(classifyAcquiredSource({target:target('ES'),page:{...page,bodyHash:otherHash,sourceIntegrity:{sha256:otherHash}},body:disclaimer,observationId:'es-third-party'}).status,'THIRD_PARTY_SOURCE');
 const affiliate=body.replace('</footer>','<p>This is an affiliate reseller page.</p></footer>'),affiliateHash=digest(affiliate);
 assert.equal(classifyAcquiredSource({target:target('ES'),page:{...page,bodyHash:affiliateHash,sourceIntegrity:{sha256:affiliateHash}},body:affiliate,observationId:'es-affiliate-reseller'}).status,'THIRD_PARTY_SOURCE');
});

test('Max ES monthly cards bind three standalone offerings and exclude the DAZN bundle',()=>{
 const parsed=interpretSubscriptionPage({body:esExcerpt,url:esUrl,providerName:'Max',marketCurrencyHint:'EUR'});
 assert.deepEqual(parsed.services.map(row=>row.name),['Max']);
 assert.deepEqual(parsed.offerings.map(row=>[row.name,row.charges[0].amount,row.charges[0].currency]),esPlans);
 assert(parsed.offerings.every(row=>row.charges.length===1&&row.charges[0].cadence==='MONTHLY'&&row.charges[0].billingCadence==='MONTHLY'));
 const fixture=countryFixture('ES',{body:esExcerpt,url:esUrl}),result=evaluateCountryProviderTruth(fixture),established=projectEstablishedV3Offerings({...fixture.target,...result});
 assert.deepEqual(established.map(row=>[row.name,row.ordinaryRecurringPrice.amount,row.ordinaryRecurringPrice.currency]),esPlans);
 assert.equal(result.v3SuggestedCandidates.length,3);
 assert(result.v3SuggestedCandidates.every(row=>row.provenance==='V3_SOURCE_RESEARCH'));
});

test('Max ES cards reject wrong locale, annual selection, mismatched action, and wrong market receipt',()=>{
 const parse=body=>interpretSubscriptionPage({body,url:esUrl,providerName:'Max',marketCurrencyHint:'EUR'}).offerings;
 assert.deepEqual(parse(esExcerpt.replace('lang="es-ES"','lang="de-DE"')),[]);
 assert.deepEqual(parse(esExcerpt.replace('aria-label="mensual" aria-selected="true"','aria-label="mensual" aria-selected="false"').replace('aria-label="anual" aria-selected="false"','aria-label="anual" aria-selected="true"')),[]);
 assert.deepEqual(parse(esExcerpt.replace('pricePlanId=30920','pricePlanId=99999')).map(row=>row.name),['Básico con anuncios','Premium']);
 const fixture=countryFixture('ES',{body:esExcerpt,url:esUrl});fixture.sourceCheck.receipt.geo.geoCountry='DE';
 assert.throws(()=>evaluateCountryProviderTruth(fixture),/COUNTRY_PROVIDER_RECEIPT_INVALID/);
});
