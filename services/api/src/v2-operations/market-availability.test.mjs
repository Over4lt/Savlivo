import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {officialMarketAvailability,discoverOfficialMarketAvailability} from './market-availability.mjs';
import {projectResearchServices} from '../research-v3/research-service-projection.mjs';
import {projectPriceResearchTargeting,selectPriceResearchTargets} from './price-research-targeting.mjs';

const now=new Date().toISOString();
const official=body=>officialMarketAvailability({serviceId:'netflix',serviceName:'Netflix',url:'https://help.netflix.com/en/node/14164',body,checkedAt:now,officialHosts:['www.netflix.com']});
const page=(heading,items,title='Where is Netflix available?')=>`<html lang="en"><head><title>${title}</title></head><body><h1>Netflix</h1><h2>${heading}</h2><ul>${items.map(item=>`<li>${item}</li>`).join('')}</ul></body></html>`;
const projection=projectResearchServices({baseline:[{service:'netflix',name:'Netflix'},{service:'chess-com',name:'Chess.com'}],frozen:[],manifestServiceIds:[],productCatalogRows:[]});

test('explicit official nonavailability skips only the documented service-market pair',()=>{
 const proof=official(page('Netflix is not available in:', ['China','North Korea']));
 assert.deepEqual(proof.unavailableMarkets,['CN']);
 const input={services:['netflix','chess-com'],markets:['CN','NO']},model=projectPriceResearchTargeting(projection,input,[],[proof]);
 assert.equal(model.selectedMarkets,2);assert.equal(model.autoSkippedTargetCount,1);assert.equal(model.serviceMarketTargets,3);
 assert.deepEqual(model.targets.map(row=>[row.serviceId,row.targetMarket]),[['netflix','NO'],['chess-com','CN'],['chess-com','NO']]);
 assert.equal(selectPriceResearchTargets(model).logicalTargetCount,3);
 const single=projectPriceResearchTargeting(projection,{services:['netflix'],markets:['CN']},[],[proof]);
 assert.throws(()=>selectPriceResearchTargets(single),/PRICE_RESEARCH_MARKET_UNAVAILABLE/);
 assert.notEqual(model.revision,projectPriceResearchTargeting(projection,input).revision);
});

test('an official paragraph followed by a country list is also explicit negative proof',()=>{
 const body='<html lang="en"><title>How many countries is Netflix available in?</title><p>Netflix is not available in:</p><ul><li>China</li><li>North Korea</li></ul></html>';
 assert.deepEqual(official(body).unavailableMarkets,['CN']);
});

test('automatic discovery uses the known official page before any free search and requires intact robots-cleared bytes',async()=>{
 const body='<html lang="en"><title>How many countries is Netflix available in?</title><p>Netflix is not available in:</p><ul><li>China</li></ul></html>',url='https://help.netflix.com/en/node/14164';
 let searches=0,reads=0;
 const proof=await discoverOfficialMarketAvailability({serviceId:'netflix',name:'Netflix'},{
  search:async()=>{searches++;return {results:[]};},
  read:async request=>{reads++;assert.equal(request.url,url);return {outcome:'OK',httpStatus:200,url,checkedAt:now,rawSource:{text:body},sourceIntegrity:{sha256:createHash('sha256').update(body).digest('hex')},accessDecisions:[{decision:'ALLOWED'}]};}
 });
 assert.equal(searches,0);assert.equal(reads,1);assert.deepEqual(proof.unavailableMarkets,['CN']);
 const repeat=await discoverOfficialMarketAvailability({serviceId:'netflix',name:'Netflix'},{search:async()=>{throw Error('SHOULD_NOT_SEARCH');},read:async()=>{throw Error('SHOULD_NOT_READ');}});
 assert.deepEqual(repeat,proof);
});

test('free discovery remains a routing hint and rejects tampered or policy-blocked pages',async()=>{
 const body='<html lang="en"><title>Where is Max available?</title><h2>Max is not available in:</h2><ul><li>China</li></ul></html>',url='https://www.max.com/availability';
 let searches=0;
 const proof=await discoverOfficialMarketAvailability({serviceId:'max',name:'Max'},{
  search:async()=>{searches++;return {results:[{title:'Max available countries',url}]};},
  read:async()=>({outcome:'OK',httpStatus:200,url,checkedAt:now,rawSource:{text:body},sourceIntegrity:{sha256:'0'.repeat(64)},accessDecisions:[{decision:'ALLOWED'}]})
 });
 assert.equal(searches,1);assert.equal(proof,null);
 const scriptOnly='<html lang="en"><title>Where is Max available?</title><script><h2>Max is not available in:</h2><ul><li>China</li></ul></script></html>';
 assert.equal(officialMarketAvailability({serviceId:'max',serviceName:'Max',url,body:scriptOnly,checkedAt:now,officialHosts:['www.max.com']}),null);
});

test('unknown, stale or incomplete coverage never auto-excludes a market',()=>{
 const proof=official(page('Available locations',['Norway','Sweden']));assert.equal(proof,null);
 const wrongHost=officialMarketAvailability({serviceId:'netflix',serviceName:'Netflix',url:'https://other.example/coverage',body:page('Netflix is not available in:',['China']),checkedAt:now,officialHosts:['www.netflix.com']});
 assert.equal(wrongHost,null);
 const wrongService=official(page('Netflix is not available in:',['China'],'Other service availability'));assert.equal(wrongService,null);
 const stale={version:1,serviceId:'netflix',sourceHash:'a'.repeat(64),sourceUrl:'https://help.netflix.com/en/node/14164',checkedAt:'2020-01-01T00:00:00Z',unavailableMarkets:['CN']};
 assert.equal(projectPriceResearchTargeting(projection,{services:['netflix'],markets:['CN']},[],[stale]).serviceMarketTargets,1);
});

test('only an explicit complete service-coverage list can exclude by absence',()=>{
 const countries=['United States','Canada','United Kingdom','Germany','France','Spain','Italy','Norway','Sweden','Denmark','Brazil'];
 const complete=page('Available countries',countries).replace('<h2>Available countries</h2>','<p>Netflix subscriptions are available in the countries listed below.</p><h2>Available countries</h2>');
 const proof=official(complete);assert(proof);assert(proof.unavailableMarkets.includes('CN'));assert(!proof.unavailableMarkets.includes('NO'));
 assert.equal(official(complete.replace('Denmark','Unknown territory')),null);
 assert.equal(official(complete.replace('subscriptions are available in the countries listed below','some examples of available countries')),null);
});
