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

const localizedHydration=({market,locale,currency,label,periodicity,period,action,code,plans,annual=[],bundle=[],duplicate=false})=>{
 const make=(row,group,cadence,unit)=>({collectionTitle:group,content:{planCard:{...card(row.name,row.amount,unit,row.id),periodicityText:cadence,price:{...card(row.name,row.amount,unit,row.id).price,currencyCode:currency},ctas:[{text:action,code}]}}});
 const items={[label]:plans.map(row=>make(row,label,periodicity,period))};
 if(annual.length)items.Yearly=annual.map(row=>make(row,'Yearly','Yearly','year'));
 if(bundle.length)items.Bundle=bundle.map(row=>make(row,'Bundle','Monthly','month'));
 const mappedData={idref1:{items}};
 if(duplicate)mappedData.idref2={items:structuredClone(items)};
 const title='HBO Max | Monthly plans',next=JSON.stringify({props:{pageProps:{mappedData}}}).replaceAll('<','\\u003c');
 return {url:`https://www.hbomax.com/${market.toLowerCase()}/${locale}`,body:`<html><head><title>${title}</title><meta property="og:title" content="${title}"></head><body><script id="__NEXT_DATA__" type="application/json">${next}</script></body></html>`};
};

// Compact structural fixtures; exact retained production bodies are replayed separately.
const documentedLayouts=[
 {market:'PL',locale:'pl',currency:'PLN',label:'miesięcznie',periodicity:'Miesięcznie',period:'miesiąc',action:'Wybierz pakiet',code:'choose.plan.add-on',plans:[{name:'Podstawowy',amount:'29,99',id:'29191'},{name:'Standardowy',amount:'39,99',id:'29192'},{name:'Premium',amount:'49,99',id:'26206'}],annual:[{name:'Podstawowy',amount:'299,00',id:'29193'},{name:'Standardowy',amount:'399,00',id:'29194'}]},
 {market:'BR',locale:'pt',currency:'BRL',label:'Mensal',periodicity:'Por mês',period:'mês',action:'Selecionar plano',code:'continue.account-creation.pre-purchase',plans:[{name:'Básico com anúncios',amount:'29,90',id:'31001'},{name:'Standard',amount:'44,90',id:'31002'},{name:'Platinum',amount:'55,90',id:'31003'}],annual:[{name:'Básico com anúncios',amount:'22,90',id:'31004'},{name:'Standard',amount:'34,90',id:'31005'}],duplicate:true},
 {market:'MY',locale:'en',currency:'MYR',label:'Monthly',periodicity:'Monthly',period:'month',action:'Select Plan',code:'continue.account-creation.pre-purchase',plans:[{name:'Standard',amount:'24.90',id:'32001'},{name:'Premium',amount:'39.90',id:'32002'}],annual:[{name:'Standard',amount:'199.90',id:'32003'},{name:'Premium',amount:'319.90',id:'32004'}],bundle:[{name:'HBO Max & Viu Bundle',amount:'33.90',id:'32005'}]},
 {market:'HK',locale:'en',currency:'HKD',label:'Monthly',periodicity:'Monthly',period:'month',action:'Select Plan',code:'continue.account-creation.pre-purchase',plans:[{name:'Standard',amount:'78.00',id:'33001'},{name:'Premium',amount:'98.00',id:'33002'}],annual:[{name:'Standard',amount:'780.00',id:'33003'},{name:'Premium',amount:'980.00',id:'33004'}]},
 {market:'TW',locale:'en',currency:'TWD',label:'Monthly',periodicity:'Monthly',period:'month',action:'Select Plan',code:'continue.account-creation.pre-purchase',plans:[{name:'Standard',amount:'220.00',id:'34001'},{name:'Premium',amount:'299.00',id:'34002'}],annual:[{name:'Standard',amount:'2190.00',id:'34003'},{name:'Premium',amount:'2990.00',id:'34004'}]},
];

for(const layout of documentedLayouts)test(`${layout.market} hydration layout yields only distinct source-bound monthly offers`,()=>{
 const {body,url}=localizedHydration(layout),parsed=interpretSubscriptionPage({body,url,providerName:'Max',marketCurrencyHint:layout.currency});
 assert.deepEqual(parsed.offerings.map(row=>[row.name,row.charges[0].amount,row.charges[0].currency,row.charges[0].billingCadence]),layout.plans.map(row=>[row.name,Number(row.amount.replace(',','.')),layout.currency,'MONTHLY']));
 assert.equal(parsed.services.length,1);
 const objective={kind:'PRICE',serviceId:'max',serviceName:'Max',providerHosts:['www.hbomax.com'],markets:[layout.market],seeds:[url]};
 const o={...observation(body,{country:layout.market,sourceUrl:url}),transport:{requestedCountry:layout.market,verifiedCountry:layout.market,verification:'BRACKET_VERIFIED'}};
 const projection=projectObservation(o,objective);o.nativeStructured=projection.nativeStructured;o.candidates=admittedProjectionCandidates(projection);
 const truth=evaluate({objective,observations:[o],attempts:[],policyBlocks:[],stop:null});
 assert.equal(truth.established,true);
 assert.deepEqual(truth.offers.map(row=>[row.propositions.PRICE_AMOUNT.value,row.propositions.CURRENCY.value,row.propositions.TARGET_MARKET.value]),layout.plans.map(row=>[Number(row.amount.replace(',','.')),layout.currency,layout.market]));
 for(const row of truth.offers)assert.equal(row.propositions.PRICE_AMOUNT.evidence[0].reference.sha256,o.sha256);
});

test('localized hydration rejects annual installments, add-ons, conflicting duplicates and wrong market proof',()=>{
 const pl=documentedLayouts[0],br=documentedLayouts[1];
 const polish=localizedHydration(pl),brazilian=localizedHydration(br);
 assert.deepEqual(interpretSubscriptionPage({body:polish.body,url:polish.url,providerName:'Max',marketCurrencyHint:'BRL'}).offerings,[]);
 assert.deepEqual(interpretSubscriptionPage({body:polish.body.replaceAll('Wybierz pakiet','Wybierz dodatek'),url:polish.url,providerName:'Max',marketCurrencyHint:'PLN'}).offerings,[]);
 assert.deepEqual(interpretSubscriptionPage({body:polish.body.replaceAll('Miesięcznie','Rocznie'),url:polish.url,providerName:'Max',marketCurrencyHint:'PLN'}).offerings,[]);
 assert.equal(interpretSubscriptionPage({body:brazilian.body,url:brazilian.url,providerName:'Max',marketCurrencyHint:'BRL'}).offerings.length,3,'duplicated card collections do not double-count plans');
 const conflicting=brazilian.body.replace('"amount":{"richTextHtml":"\\u003cp>29,90\\u003c/p>","plainText":"29,90"}', '"amount":{"richTextHtml":"\\u003cp>99,90\\u003c/p>","plainText":"99,90"}');
 assert.deepEqual(interpretSubscriptionPage({body:conflicting,url:brazilian.url,providerName:'Max',marketCurrencyHint:'BRL'}).offerings,[],'conflicting duplicate plan identities fail closed');
 const ancillary=localizedHydration({...br,duplicate:false,plans:[...br.plans.slice(0,2),{name:'Platinum add-on',amount:'55,90',id:'31003'}]});
 assert.deepEqual(interpretSubscriptionPage({body:ancillary.body,url:ancillary.url,providerName:'Max',marketCurrencyHint:'BRL'}).offerings.map(row=>row.name),['Básico com anúncios','Standard']);
 const discounted=localizedHydration({...br,duplicate:false,plans:[...br.plans.slice(0,2),{name:'Platinum promotional discount',amount:'10,90',id:'31003'}]});
 assert.deepEqual(interpretSubscriptionPage({body:discounted.body,url:discounted.url,providerName:'Max',marketCurrencyHint:'BRL'}).offerings.map(row=>row.name),['Básico com anúncios','Standard']);
 const objective={kind:'PRICE',serviceId:'max',serviceName:'Max',providerHosts:['www.hbomax.com'],markets:['PL'],seeds:[polish.url]};
 for(const options of [{country:'DE'},{receipt:false},{hash:'0'.repeat(64)}]){
  const o={...observation(polish.body,{...options,sourceUrl:polish.url}),transport:options.receipt===false?undefined:{requestedCountry:options.country??'PL',verifiedCountry:options.country??'PL',verification:'BRACKET_VERIFIED'}};
  const projection=projectObservation(o,objective);o.nativeStructured=projection.nativeStructured;o.candidates=admittedProjectionCandidates(projection);
  assert.equal(evaluate({objective,observations:[o],attempts:[],policyBlocks:[],stop:null}).established,false);
 }
});

test('hydration JSON remains bounded after admitting larger complete country pages',()=>{
 const layout=documentedLayouts[2],{body,url}=localizedHydration(layout);
 const oversized=body.replace('"mappedData":','"padding":"'+ 'x'.repeat(1_500_000)+'","mappedData":');
 assert.deepEqual(interpretSubscriptionPage({body:oversized,url,providerName:'Max',marketCurrencyHint:'MYR'}).offerings,[]);
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
