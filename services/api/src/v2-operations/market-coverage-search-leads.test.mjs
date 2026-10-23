import test from 'node:test';
import assert from 'node:assert/strict';
import {marketCoverageSearchLeads} from './market-coverage-search-leads.mjs';
import {projectResearchServices} from '../research-v3/research-service-projection.mjs';
import {projectPriceResearchTargeting} from './price-research-targeting.mjs';

test('broad search results are bounded, scoped to the service, and only review leads',()=>{
 const results=[
  {title:'WeTV available countries',url:'https://wetv.vip/en/help',snippet:'Tencent Video international version'},
  {title:'Tencent Video availability by country',url:'https://example.org/tencent',snippet:'Available in mainland China only.'},
  {title:'Tencent Video availability by country',url:'https://example.org/tencent#copy',snippet:'Duplicate'},
  {title:'Tencent Video country list',url:'https://example.org/tencent?token=private',snippet:'Secret URL'},
  {title:'Tencent Video countries',url:'http://example.org/insecure',snippet:'Unsecured'},
  {title:'Tencent Video regional availability',url:'https://example.net/tencent',snippet:'Another source'}
 ];
 const leads=marketCoverageSearchLeads('Tencent Video / 腾讯视频',results);
 assert.deepEqual(leads.map(row=>row.url),['https://example.org/tencent','https://example.net/tencent']);
 assert.deepEqual(leads[0].candidateMarkets,['CN']);
 assert.deepEqual(leads[1].candidateMarkets,[]);
 assert(leads.every(row=>row.classification==='UNVERIFIED_SEARCH_LEAD'));
 const projection=projectResearchServices({baseline:[{service:'tencent-video',name:'Tencent Video / 腾讯视频'}],frozen:[],manifestServiceIds:[],productCatalogRows:[]});
 const model=projectPriceResearchTargeting(projection,{services:['tencent-video']},[],[],[{serviceId:'tencent-video',leads}]);
 assert.equal(model.services.find(row=>row.serviceId==='tencent-video').coverageSearchLeads.length,2);
 assert.equal(model.targets.length,46);
 assert.equal(model.autoSkippedTargetCount,0);
 assert.equal(model.targets[0].targetMarket,'CN');
});

test('negative and ambiguous search snippets never become positive country hints',()=>{
 const leads=marketCoverageSearchLeads('Example TV',[
  {title:'Example TV countries',url:'https://example.org/no',snippet:'Not currently available in Norway.'},
  {title:'Example TV regions',url:'https://example.org/unclear',snippet:'Available in Norway and other countries.'},
  {title:'Example TV availability',url:'https://example.org/yes',snippet:'Available in Norway, Sweden and Denmark.'}
 ]);
 assert.deepEqual(leads.map(row=>row.candidateMarkets),[[],[],['NO','SE','DK']]);
});
