import test from 'node:test';
import assert from 'node:assert/strict';
import {context,digest} from './model.mjs';
import {interpretSubscriptionPage,validHtmlExtractionRecipe} from './subscription-page.mjs';
import {projectObservation} from './projection.mjs';
import {evaluate} from './truth.mjs';

const url='https://help.orbit.example/article/how-much-does-an-orbit-subscription-cost';
const objective={kind:'PRICE',serviceId:'orbit',serviceName:'Orbit',providerHosts:['help.orbit.example'],markets:['US'],seeds:[url]};
const paragraph=(name,monthly,annual)=>`<p>You can sign up for an ${name} plan for $${monthly} a month or $${annual} per year.</p>`;
const page=(rows)=>`<html><head><title>How much does an Orbit subscription cost?</title></head><body><main><h1>How much does an Orbit subscription cost?</h1>${rows.join('')}</main></body></html>`;
const ordinary=page([
 paragraph('Orbit Basic','8.99','89.99'),
 paragraph('Orbit Premium','12.99','129.99'),
 '<p>Additionally, you can sign up for the Orbit Select Tier for $19.99/month or $199.99/year.</p>',
]);

function replay(body,{country='US',receipt=true,hash=digest(body)}={}){
 const observation={id:'source',kind:'PROVIDER',authority:'REVIEWED_PROVIDER',url,context:context('DECODO',country),outcome:'OK',truncated:false,completeness:'COMPLETE',format:'WEB',contentType:'text/html',httpStatus:200,access:[{decision:'ALLOWED'}],body,sha256:hash,...(receipt?{transport:{verification:'BRACKET_VERIFIED',requestedCountry:country,verifiedCountry:country}}:{})};
 const projection=projectObservation(observation,objective);
 observation.nativeStructured=projection.nativeStructured;observation.candidates=projection.candidates;
 return {projection,truth:evaluate({objective,observations:[observation],attempts:[],policyBlocks:[],stop:null})};
}

test('source-bound help prose yields three distinct monthly plans and excludes annual alternatives',()=>{
 const {projection,truth}=replay(ordinary);
 assert.deepEqual(projection.source.offers.map((offer,index)=>[projection.bindings['/offers/'+index].offer,offer.amount,offer.currency,offer.cadence,offer.billingCadence]),[
  ['Orbit Basic',8.99,'USD','MONTHLY','MONTHLY'],
  ['Orbit Premium',12.99,'USD','MONTHLY','MONTHLY'],
  ['Orbit Select',19.99,'USD','MONTHLY','MONTHLY'],
 ]);
 assert.equal(truth.established,true);
 assert.deepEqual(truth.offers.map(offer=>offer.propositions.PRICE_AMOUNT.value),[8.99,12.99,19.99]);
 assert.equal(projection.extractionTrace.recipe.rule,'HTML_HELP_PROSE_MONTHLY_PLAN');
 assert.equal(validHtmlExtractionRecipe(projection.extractionTrace.recipe),true);
 assert(projection.source.offers.every((_,index)=>projection.bindings['/offers/'+index].currencyResolution.basis==='VERIFIED_COUNTRY_OBSERVATION'));
 const extractionTrace={};
 const replayed=interpretSubscriptionPage({body:ordinary,url,providerName:'Orbit',marketCurrencyHint:'USD',verifiedMarket:'US',extractionHint:projection.extractionTrace.recipe,extractionTrace});
 assert.equal(extractionTrace.hintOutcome,'APPLIED');
 assert.deepEqual(replayed.offerings.map(row=>row.name),['Orbit Basic','Orbit Premium','Orbit Select']);
});

test('the same help prose needs an independently verified market and intact source hash',()=>{
 assert.equal(replay(ordinary,{receipt:false}).truth.established,false);
 assert.equal(replay(ordinary,{country:'CA'}).truth.established,false);
 assert.equal(replay(ordinary,{hash:digest('changed')}).truth.established,false);
 assert.deepEqual(interpretSubscriptionPage({body:ordinary,url,providerName:'Orbit',marketCurrencyHint:'GBP',verifiedMarket:'GB'}).offerings,[]);
 assert.deepEqual(interpretSubscriptionPage({body:ordinary,url,providerName:'Another',marketCurrencyHint:'USD',verifiedMarket:'US'}).offerings,[]);
 assert.deepEqual(interpretSubscriptionPage({body:ordinary.replaceAll('</p>', ' All prices in CAD.</p>'),url,providerName:'Orbit',marketCurrencyHint:'USD',verifiedMarket:'US'}).offerings,[]);
});

test('annual equivalents, promotions, add-ons and unbound help text do not create standalone plans',()=>{
 const bad=page([
  paragraph('Orbit Basic','8.99','89.99'),
  '<p>You can sign up for an Orbit Annual plan for $7.99/month billed annually.</p>',
  '<p>You can sign up for an Orbit Premium promotion plan for $2.99/month for the first month.</p>',
  '<p>You can sign up for an Orbit Extra Member plan for $3.99/month.</p>',
 ]);
 assert.deepEqual(interpretSubscriptionPage({body:bad,url,providerName:'Orbit',marketCurrencyHint:'USD',verifiedMarket:'US'}).offerings,[]);
 assert.equal(replay(bad).truth.established,false);
 const withoutHeading=ordinary.replace('<h1>How much does an Orbit subscription cost?</h1>','<h1>Help</h1>');
 assert.deepEqual(interpretSubscriptionPage({body:withoutHeading,url,providerName:'Orbit',marketCurrencyHint:'USD',verifiedMarket:'US'}).offerings,[]);
});
