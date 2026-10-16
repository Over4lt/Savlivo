import test from 'node:test';
import assert from 'node:assert/strict';
import {digest} from './model.mjs';
import {authorityBinding} from './discovery-authority.mjs';
import {adaptV2CurrentSource} from './v2-current-source-adapter.mjs';
import {projectObservation} from './projection.mjs';
import {evaluate} from './truth.mjs';
import {projectV3SuggestedCandidates} from './suggested-projection.mjs';
import {projectEstablishedV3Offerings} from '../research-v2/inventory/v3-result-projection.mjs';
import {providerSelectedDollarCurrency} from './currency-sources.mjs';

const host='help.orbit.example',url=`https://${host}/en-GB/article/plans?redirect=true`;
const selector=code=>`<button aria-haspopup="listbox" aria-label="Change country or language. Current country ${code}">Country</button>`;
const row=(name,price,{action='Select plan',extra='',yearly=null}={})=>`<tr><td>${name}</td><td>${extra}</td><td>${price}${yearly?`<p>Yearly: ${yearly}</p>`:''}<a href="/choose">${action}</a></td></tr>`;
const table=(heading,rows,{header='Price'}={})=>`<h2>${heading}</h2><table><tr><th>Plan</th><th>Features</th><th>${header}</th></tr>${rows.join('')}</table>`;
const page=(market,sections)=>`<html><head><title>Orbit plans and prices</title><meta name="description" content="Prices for an Orbit subscription plan."></head><body>${selector(market)}<h1>Orbit plans and prices</h1>${sections}</body></html>`;
function replay({market='US',body,receipt=true,initialUrl=url,finalUrl=url,override={}}){
 const sha256=digest(body),objective={kind:'PRICE',serviceId:'orbit',serviceName:'Orbit',providerHosts:[host],markets:[market],seeds:[initialUrl]},providerAuthority={status:'AUTHORITATIVE_PROVIDER',binding:authorityBinding(objective,finalUrl)},observationId='fixture-'+market;
 const marketReceipt={kind:'PROVIDER_SELECTED_MARKET',observationId,targetMarket:market,transport:'DIRECT_BROWSER',initialUrl,finalUrl,providerHost:new URL(finalUrl).hostname,preSourceSha256:digest('prior source'),finalSourceSha256:sha256,preSelectedCode:'NO',selectedCode:market,selectedOption:market==='AU'?'Australia (English)':'United States (English)',selectorLabel:`Change country or language. Current country ${market}`,...override};
 const input={contractVersion:1,observationId,target:{service:'orbit',serviceName:'Orbit',market},page:{url:finalUrl,requestedUrl:initialUrl,outcome:'OK',httpStatus:200,contentType:'text/html',bodyHash:sha256,sourceIntegrity:{sha256},rawSource:{text:body},accessDecisions:[{decision:'ALLOWED'}]},providerAuthority,acquisition:receipt?{route:'PROVIDER_SELECTED_MARKET',marketReceipt}:{route:'DIRECT'}};
 const observation=adaptV2CurrentSource(input,objective),projection=projectObservation(observation,objective),truth=evaluate({objective,observations:[observation],attempts:[],policyBlocks:[],stop:null});
 const suggested=projectV3SuggestedCandidates({observation,objective,targetMarket:market,providerAuthority,truth});
 const verified=projectEstablishedV3Offerings({v3Truth:truth,v3Observation:{id:observation.id,url:observation.url,sha256:observation.sha256,context:observation.context},service:'orbit',serviceName:'Orbit',market});
 return {input,observation,objective,projection,truth,suggested,verified};
}
const regular=()=>table('Orbit standalone plans',[row('Orbit Basic','<p>Monthly: $12.49</p>'),row('Orbit Premium','<p>Monthly: $21.49</p>')]);

test('source-bound US dollar rows become two monthly standalone V3 offerings',()=>{
 const x=replay({body:page('US',regular())});
 assert.equal(providerSelectedDollarCurrency(x.observation,x.objective)?.code,'USD');
 assert.deepEqual(x.verified.map(o=>o.ordinaryRecurringPrice),[{amount:12.49,currency:'USD'},{amount:21.49,currency:'USD'}]);
 assert.equal(x.suggested.length,2);assert(x.suggested.every(o=>o.provenance==='V3_SOURCE_RESEARCH'));
 assert(x.projection.bindings['/offers/0'].currencyResolution.sourceHash===x.observation.sha256);
});

test('source-bound AU dollar rows resolve AUD without promoting Extra Member',()=>{
 const body=page('AU',table('Orbit plans',[row('Orbit Basic','<p>Monthly: $9.99</p>'),row('Orbit Standard','<p>Monthly: $17.99</p>'),row('Orbit Premium','<p>Monthly: $24.99</p>'),row('Extra Member','<p>Monthly: $7.99</p>')]));
 const x=replay({market:'AU',body});assert.equal(providerSelectedDollarCurrency(x.observation,x.objective)?.code,'AUD');
 assert.deepEqual(x.verified.map(o=>o.ordinaryRecurringPrice.amount),[9.99,17.99,24.99]);assert(x.verified.every(o=>o.ordinaryRecurringPrice.currency==='AUD'));assert.equal(x.suggested.length,3);
});

test('standalone table remains while adjacent bundle and add-on tables are excluded',()=>{
 const body=page('US',table('Orbit bundle plans',[row('Basic','<p>Monthly: $3.99</p>'),row('Premium','<p>Monthly: $4.99</p>')])+regular()+table('Orbit add-ons',[row('Extra Member','<p>Monthly: $5.99</p>'),row('Storage','<p>Monthly: $6.99</p>')]));
 const x=replay({body});assert.deepEqual(x.verified.map(o=>o.ordinaryRecurringPrice.amount),[12.49,21.49]);
});

test('multiple standalone rows inherit a shared monthly payment table header',()=>{
 const body=page('US',table('Orbit plans',[row('Orbit Basic','<p>$12.49</p>'),row('Orbit Premium','<p>$21.49</p>')],{header:'Monthly payment'}));
 const x=replay({body});assert.deepEqual(x.verified.map(o=>o.ordinaryRecurringPrice.amount),[12.49,21.49]);
});

test('a section billing statement applies to adjacent plan rows but not annual equivalents',()=>{
 const body=page('AU','<h2>Orbit plans</h2><p>Plans are billed monthly.</p><table><tr><th>Plan</th><th>Price</th></tr>'+row('Orbit Basic','<p>$9.99</p>')+row('Orbit Premium','<p>$24.99</p>')+row('Orbit Annual','<p>$179.99 yearly, equivalent to $14.99 per month</p>')+'</table>');
 const x=replay({market:'AU',body});assert.deepEqual(x.verified.map(o=>o.ordinaryRecurringPrice.amount),[9.99,24.99]);
});

test('bare dollar, locale, and selector chrome without a bound receipt cannot establish currency or market',()=>{
 for(const finalUrl of [url,`https://${host}/en-US/article/plans?redirect=true`]){
  const x=replay({body:page('US',regular()),receipt:false,finalUrl});assert.equal(providerSelectedDollarCurrency(x.observation,x.objective),null);assert.equal(x.verified.length,0);assert.equal(x.suggested.length,0);
 }
});

test('stale source hash and wrong selector cannot resolve a dollar price',()=>{
 const body=page('US',regular());
 assert.throws(()=>replay({body,override:{finalSourceSha256:digest('different')}}),/PROVIDER_SELECTED_MARKET_SOURCE_INVALID/);
 assert.throws(()=>replay({body,override:{selectorLabel:'Change country or language. Current country AU'}}),/PROVIDER_SELECTED_MARKET_SOURCE_INVALID/);
});

test('third-party source is not admitted as provider authority for a market-bound dollar',()=>{
 const body=page('US',regular());assert.throws(()=>replay({body,finalUrl:'https://other.example/plans'}),/V2_V3_AUTHORITY_BINDING_INVALID/);
});

test('annual, annual-equivalent, promotional, and unrelated dollar amounts do not become monthly plans',()=>{
 const body=page('US',regular()+table('Annual plans',[row('Annual A','<p>Yearly: $120</p>'),row('Annual B','<p>Yearly: $240, equivalent to $20 /month</p>'),row('Annual C','<p>Monthly: $10 annual equivalent</p>')])+table('Promotions',[row('Trial A','<p>Monthly: $3 introductory</p>'),row('Trial B','<p>Monthly: $4 first month</p>')])+'<aside><p>Donation: $1 /month</p></aside>');
 const x=replay({body});assert.deepEqual(x.verified.map(o=>o.ordinaryRecurringPrice.amount),[12.49,21.49]);
});
