import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {interpretSubscriptionPage} from './subscription-page.mjs';
import {context,digest} from './model.mjs';
import {projectObservation} from './projection.mjs';
import {admittedProjectionCandidates} from './native-structured.mjs';
import {evaluate} from './truth.mjs';
import {derivedCountrySourceCandidates} from '../research-v2/live/derived-country-sources.mjs';
import {researchLinkPriorityTarget} from '../research-v2/live/retained-render-source.mjs';
import {nextResearchLink} from '../research-v2/live/research-link-routing.mjs';
import {runOpenWebResearch} from '../research-v2/live/open-web-discovery.mjs';

// Synthetic source with the same field relationships as the retained NZ
// __NEXT_DATA__ record. This is not a production receipt or copied page.
const url='https://www.hbomax.com/nz/en';
const card=(name,amount,period,id,extra={})=>({periodicityText:period==='month'?'Monthly':'Yearly',productName:{richTextHtml:`<p>${name}</p>`,plainText:name},price:{format:'{{currency}}{{amount}}/{{period}}',currencyCode:'NZD',amount:{richTextHtml:`<p>${amount}</p>`,plainText:amount},period:{richTextHtml:`<p>${period}</p>`,plainText:period}},pricePlan:{id},ctas:[{text:'Select Plan',code:'continue.account-creation.pre-purchase'}],...extra});
const plans={Monthly:[card('Standard','15.99','month','38354'),card('Premium','20.99','month','38362')],Yearly:[card('Standard','159.99','year','38358'),card('Premium','209.99','year','38366')]};
const html=(monthly=plans.Monthly,{service='Max',og=true,yearly=plans.Yearly}={})=>{
 const title=`HBO ${service} | Stream movies`,items={Monthly:monthly.map(planCard=>({collectionTitle:'Monthly',content:{planCard}})),Yearly:yearly.map(planCard=>({collectionTitle:'Yearly',content:{planCard}}))};
 const next=JSON.stringify({props:{pageProps:{mappedData:{idref23:{items}}}}}).replaceAll('<','\\u003c');
 return `<html lang="en-NZ"><head><title>${title}</title>${og?`<meta property="og:title" content="${title}"/>`:''}</head><body><script id="__NEXT_DATA__" type="application/json">${next}</script></body></html>`;
};
const objective={kind:'PRICE',serviceId:'max',serviceName:'Max',providerHosts:['www.hbomax.com'],markets:['NZ'],seeds:[url]};
const observation=(body,{country='NZ',receipt=true,sourceUrl=url,hash=digest(body)}={})=>({id:'SYNTHETIC_NZ_G1_FIXTURE',kind:'PROVIDER',authority:'REVIEWED_PROVIDER',url:sourceUrl,context:context('DECODO',country),...(receipt?{transport:{requestedCountry:'NZ',verifiedCountry:country,verification:'BRACKET_VERIFIED'}}:{}),outcome:'OK',truncated:false,completeness:'COMPLETE',format:'WEB',contentType:'text/html',httpStatus:200,access:[{decision:'ALLOWED'}],body,sha256:hash});
const replay=(body,options={})=>{
 const o=observation(body,options),projection=projectObservation(o,objective);o.nativeStructured=projection.nativeStructured;o.candidates=admittedProjectionCandidates(projection);
 return {o,projection,truth:evaluate({objective,observations:[o],attempts:[],policyBlocks:[],stop:null})};
};

test('bounded hydration cards bind exactly two ordinary monthly plans to original source spans',()=>{
 const body=html(),parsed=interpretSubscriptionPage({body,url,providerName:'Max',marketCurrencyHint:'NZD'});
 assert.deepEqual(parsed.services.map(row=>row.name),['Max']);
 assert.deepEqual(parsed.offerings.map(row=>[row.name,row.charges[0].amount,row.charges[0].currency,row.charges[0].billingCadence]),[['Standard',15.99,'NZD','MONTHLY'],['Premium',20.99,'NZD','MONTHLY']]);
 for(const row of parsed.offerings){assert.equal(row.charges.length,1);assert.equal(row.charges[0].amountDerivation,'EXPLICIT');assert.equal(body.slice(row.presentation.start,row.presentation.end),row.presentation.quote);assert.equal(digest(row.presentation.quote),row.presentation.sha256);}
 assert.deepEqual(interpretSubscriptionPage({body,url,providerName:'Max'}).offerings,[],'market currency must be source-bound');
 assert.deepEqual(interpretSubscriptionPage({body,url,providerName:'Max',marketCurrencyHint:'EUR'}).offerings,[]);
});

test('synthetic G1 fixture establishes two source-bound offers through unchanged V3 Truth',()=>{
 const {o,projection,truth}=replay(html());assert.equal(truth.established,true);
 assert.deepEqual(projection.source.offers.map(row=>[row.amount,row.currency,row.billingCadence]),[[15.99,'NZD','MONTHLY'],[20.99,'NZD','MONTHLY']]);
 assert.deepEqual(truth.offers.map(row=>[row.propositions.PRICE_AMOUNT.value,row.propositions.TARGET_MARKET.value]),[[15.99,'NZ'],[20.99,'NZ']]);
 for(const row of truth.offers){const ref=row.propositions.PRICE_AMOUNT.evidence[0].reference;assert.equal(ref.sha256,o.sha256);assert.equal(digest(o.body.slice(ref.source.start,ref.source.end)),ref.source.sha256);}
});

test('wrong country, missing receipt, changed hash and foreign host never establish NZ truth',()=>{
 const body=html();for(const options of [{country:'AU'},{receipt:false},{hash:'0'.repeat(64)},{sourceUrl:'https://third-party.example/nz/en'}]){
  const {truth}=replay(body,options);assert.equal(truth.established,false,JSON.stringify(options));
  assert.equal(truth.offers.some(row=>row.propositions.PRICE_AMOUNT.state==='ESTABLISHED'&&row.propositions.TARGET_MARKET.state==='ESTABLISHED'),false);
 }
});

test('hydration extraction rejects ambiguous records, promotions, bundles and annual equivalence',()=>{
 const unsafe=[
  [card('Standard','15.99','month','38354'),card('Standard','20.99','month','38362')],
  [card('Standard','15.99','month','38354'),card('Premium + Sports bundle','20.99','month','38362')],
  [card('Standard','15.99','month','38354'),card('Student Premium','20.99','month','38362')],
  [card('Standard','15.99','month','38354'),card('Premium','20.99','month','38354')],
  [card('Standard','15.99','month','38354'),card('Premium','20.99','month','38362',{badge:{text:{plainText:'Promotional discount'}}})],
  [card('Standard','15.99','year','38354'),card('Premium','20.99','year','38362')],
  [card('Standard','15.99','month','38354',{ctas:[]}),card('Premium','20.99','month','38362')],
 ];
 for(const rows of unsafe)assert.deepEqual(interpretSubscriptionPage({body:html(rows),url,providerName:'Max',marketCurrencyHint:'NZD'}).offerings,[]);
 assert.deepEqual(interpretSubscriptionPage({body:html(plans.Monthly,{og:false}),url,providerName:'Max',marketCurrencyHint:'NZD'}).services,[]);
 assert.deepEqual(interpretSubscriptionPage({body:html().replace('"pricePlan"','"other"'),url,providerName:'Max',marketCurrencyHint:'NZD'}).offerings,[]);
});

test('same bounded hydration structure can serve another provider without a Max or NZ price rule',()=>{
 const body=html([card('Silver','9.99','month','10001'),card('Gold','19.99','month','10002')],{service:'Orbit'}).replaceAll('HBO Orbit','Orbit');
 const rows=interpretSubscriptionPage({body,url:'https://orbit.example/nz/en',providerName:'Orbit',marketCurrencyHint:'NZD'});
 assert.deepEqual(rows.services.map(row=>row.name),['Orbit']);assert.deepEqual(rows.offerings.map(row=>row.name),['Silver','Gold']);
});

test('offline NZ derived route reaches mock Decodo G1 and stops before global, Browser or AI',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'nz-hydration-route-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const global={id:'GLOBAL',serviceId:'max',url:'https://www.hbomax.com/',kind:'DIRECT_SOURCE',marketScope:'GLOBAL',marketCode:null,enabled:true,truthAuthority:'NONE',lastResult:'ACQUISITION_FAILED'};
 const derived=derivedCountrySourceCandidates({service:'max',market:'NZ',researchLinks:[global]});
 const target=researchLinkPriorityTarget({id:'price-research:max:NZ',service:'max',serviceName:'Max',market:'NZ',operationsObjective:'PRICE_RESEARCH',researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},urls:[],knownCommercialUrls:[],leads:[],authorities:[],gaps:['amount'],reads:[],queries:[],decisions:[],verified:[],blockedOrigins:[],researchLinks:[global],researchLinkOutcomes:[],derivedCountryCandidates:derived,providerSourceIdentityHosts:['www.hbomax.com'],acquisitionOutcomes:[],capabilities:{direct:false,decodo:true,browser:false,tavily:false}}, {direct:false,decodo:true,browser:false,tavily:false});
 assert.equal(nextResearchLink(target).url,url);const requested=[];
 const state=await runOpenWebResearch({directory,targets:[target],maxActions:2,search:async()=>assert.fail('AI/search'),read:async()=>assert.fail('Direct/Browser'),acquire:async({candidate,target:selected})=>{
  requested.push([candidate.url,selected.market]);const source=html(),{o,truth}=replay(source);
  return {classification:'VERIFIED_OUTPUT',sourceClassification:{status:'PROVIDER_SOURCE',sourceHash:o.sha256},countryV3Evaluation:{status:'EVALUATED',sourceHash:o.sha256,receiptStatus:'HASH_VERIFIED',geoClass:'G1'},verified:truth.offers.map(row=>({name:row.id,amount:row.propositions.PRICE_AMOUNT.value,market:row.propositions.TARGET_MARKET.value}))};
 }});
 assert.deepEqual(requested,[[url,'NZ']]);assert.equal(state.targets[0].verified.length,2);
 assert.equal(state.targets[0].acquisitionOutcomes.length,1);
});
