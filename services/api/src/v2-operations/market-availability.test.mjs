import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {officialMarketAvailability,discoverOfficialMarketAvailability} from './market-availability.mjs';
import {readAvailabilitySearch,reserveAvailabilitySearch} from './market-availability-search-memory.mjs';
import {projectResearchServices} from '../research-v3/research-service-projection.mjs';
import {projectPriceResearchTargeting,selectPriceResearchTargets} from './price-research-targeting.mjs';
import {firstThirtyServiceMarketOverview,serviceMarketOverviewFor} from './service-market-overview.mjs';

const now=new Date().toISOString();
const official=body=>officialMarketAvailability({serviceId:'netflix',serviceName:'Netflix',url:'https://help.netflix.com/en/node/14164',body,checkedAt:now,officialHosts:['www.netflix.com']});
const page=(heading,items,title='Where is Netflix available?')=>`<html lang="en"><head><title>${title}</title></head><body><h1>Netflix</h1><h2>${heading}</h2><ul>${items.map(item=>`<li>${item}</li>`).join('')}</ul></body></html>`;
const projection=projectResearchServices({baseline:[{service:'netflix',name:'Netflix'},{service:'chess-com',name:'Chess.com'}],frozen:[],manifestServiceIds:[],productCatalogRows:[]});

test('the first 30 service overview follows the actual canonical API order and never acts as exclusion proof',()=>{
 const universe=JSON.parse(fs.readFileSync(new URL('../../../../docs/catalog/global-47/research-v2/v15-discovery-20260921/expanded-service-universe.json',import.meta.url)));
 const ids=[...universe.existing,...universe.new_include,...universe.research].slice(0,30).map(row=>row.service??row.slug);
 assert.deepEqual(firstThirtyServiceMarketOverview.map(row=>row.serviceId),ids);
 assert.equal(serviceMarketOverviewFor('hulu').reportedUnavailableMarkets.length,45);
 assert.equal(serviceMarketOverviewFor('disney-plus').unknownMarkets.length,46);
 for(const id of ['chatgpt','claude']){
  assert.deepEqual(serviceMarketOverviewFor(id).reportedUnavailableMarkets,['CN','HK']);
  assert(!serviceMarketOverviewFor(id).availableMarkets.includes('HK'));
 }
 const hulu=projectResearchServices({baseline:[{service:'hulu',name:'Hulu'}],frozen:[],manifestServiceIds:[],productCatalogRows:[]});
 const target=projectPriceResearchTargeting(hulu,{services:['hulu']});
 assert.equal(target.targets.length,46);
 assert.equal(target.targets[0].targetMarket,'US');
 assert.equal(target.autoSkippedTargetCount,0);
 const paramount=projectResearchServices({baseline:[{service:'paramount-plus',name:'Paramount+'}],frozen:[],manifestServiceIds:[],productCatalogRows:[]});
 const prioritized=projectPriceResearchTargeting(paramount,{services:['paramount-plus']});
 assert.equal(prioritized.targets.length,46);
 assert.equal(prioritized.targets[0].targetMarket,'AU');
 assert(prioritized.targets.findIndex(row=>row.targetMarket==='VN')>prioritized.targets.findIndex(row=>row.targetMarket==='AU'));
 assert.deepEqual(projectPriceResearchTargeting(paramount,{services:['paramount-plus'],markets:['VN','AU']}).targets.map(row=>row.targetMarket),['VN','AU']);
});

test('fresh official US-only wording excludes other markets while ambiguous and altered pages fail open',()=>{
 const checkedAt=new Date().toISOString(),huluUrl=serviceMarketOverviewFor('hulu').sourceUrl;
 const hulu='<html lang="en"><title>Disney+, ESPN, and Hulu Subscriber Agreement</title><p>The ESPN and Hulu Services are only available in the United States and certain of its territories.</p></html>';
 const options={serviceId:'hulu',serviceName:'Hulu',url:huluUrl,body:hulu,checkedAt,officialHosts:['www.hulu.com']};
 const proof=officialMarketAvailability(options);
 assert.equal(proof?.unavailableMarkets.length,45);
 assert(proof.unavailableMarkets.includes('NO'));
 assert(!proof.unavailableMarkets.includes('US'));
 assert.equal(proof.sourceHash,createHash('sha256').update(hulu).digest('hex'));
 const projection=projectResearchServices({baseline:[{service:'hulu',name:'Hulu'}],frozen:[],manifestServiceIds:[],productCatalogRows:[]});
 const targeted=projectPriceResearchTargeting(projection,{services:['hulu'],markets:['US','NO']},[],[proof]);
 assert.deepEqual(targeted.targets.map(row=>row.targetMarket),['US']);
 assert.equal(officialMarketAvailability({...options,url:'https://www.hulu.com/another-page'}),null);
 assert.equal(officialMarketAvailability({...options,body:hulu.replace('Hulu Services are only available in the United States','Hulu Services may be available in other markets')}),null);
 assert.equal(officialMarketAvailability({...options,body:hulu.replace('and Hulu Subscriber Agreement','Subscriber Agreement')}),null);
 const peacockUrl=serviceMarketOverviewFor('peacock').sourceUrl;
 const peacock='<html lang="en"><title>Peacock Terms of Service</title><p>The Peacock Service is for individuals who are 18 years of age or older and reside in the United States (including its territories and possessions).</p></html>';
 assert.equal(officialMarketAvailability({serviceId:'peacock',serviceName:'Peacock',url:peacockUrl,body:peacock,checkedAt,officialHosts:['www.peacocktv.com']})?.unavailableMarkets.length,45);
 assert.equal(officialMarketAvailability({serviceId:'peacock',serviceName:'Peacock',url:peacockUrl,body:peacock.replace('reside in the United States','reside in supported territories'),checkedAt,officialHosts:['www.peacocktv.com']}),null);
});

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

test('paid lookup is one durable lead per service; only intact official bytes can exclude',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'availability-paid-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const body=page('Max is not available in:',['China'],'Where is Max available?'),url='https://www.max.com/availability';
 let paidCalls=0,freeCalls=0,reads=0;
 const options={ledgerRoot:root,paidSearchEnabled:true,
  search:async()=>{freeCalls++;return {results:[]};},
  paidSearch:async()=>{paidCalls++;return {results:[{title:'Max available countries',url},{title:'Unrelated availability',url:'https://unrelated.example/availability'}],usageCredits:1};},
  read:async request=>{reads++;assert.equal(request.url,url);return {outcome:'OK',httpStatus:200,url,checkedAt:now,rawSource:{text:body},sourceIntegrity:{sha256:createHash('sha256').update(body).digest('hex')},accessDecisions:[{decision:'ALLOWED'}]};}
 };
 const proof=await discoverOfficialMarketAvailability({serviceId:'max',name:'Max'},options);
 assert.deepEqual(proof.unavailableMarkets,['CN']);assert.equal(paidCalls,1);assert.equal(freeCalls,1);assert.equal(reads,1);
 const record=readAvailabilitySearch(root,'max');assert.equal(record.status,'COMPLETE');assert.deepEqual(record.leadUrls,[url]);assert.equal(record.proof.sourceHash,proof.sourceHash);
 const repeat=await discoverOfficialMarketAvailability({serviceId:'max',name:'Max'},{...options,paidSearch:async()=>{throw Error('PAID_AGAIN');},read:async()=>{throw Error('READ_AGAIN');}});
 assert.deepEqual(repeat,proof);assert.equal(paidCalls,1);
});

test('unknown and interrupted paid lookups never trigger another charge or false exclusion',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'availability-unknown-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 let paidCalls=0;
 const options={ledgerRoot:root,paidSearchEnabled:true,search:async()=>({results:[]}),read:async()=>{throw Error('NO_VALID_OFFICIAL_BODY');},
  paidSearch:async()=>{paidCalls++;return {results:[{title:'Max available countries',url:'https://third-party.example/availability'}]};}};
 assert.equal(await discoverOfficialMarketAvailability({serviceId:'max',name:'Max'},options),null);
 assert.equal(readAvailabilitySearch(root,'max').status,'COMPLETE');assert.equal(paidCalls,1);
 assert.equal(await discoverOfficialMarketAvailability({serviceId:'max',name:'Max'},options),null);assert.equal(paidCalls,1);
 const interrupted=fs.mkdtempSync(path.join(os.tmpdir(),'availability-reserved-'));t.after(()=>fs.rmSync(interrupted,{recursive:true,force:true}));
 assert.equal(reserveAvailabilitySearch(interrupted,'max',now),true);
 assert.equal(await discoverOfficialMarketAvailability({serviceId:'max',name:'Max'},{...options,ledgerRoot:interrupted}),null);assert.equal(paidCalls,1);
});
