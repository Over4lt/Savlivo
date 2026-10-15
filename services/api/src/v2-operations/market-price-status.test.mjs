import test from 'node:test';
import assert from 'node:assert/strict';
import {operationsRequest} from './http.mjs';
import {marketPriceStatusSql} from './market-price-status.mjs';

const url=new URL('https://offline.invalid/v1/admin/v2-operations/price-research/market-price-status');
function fixture(){
 const queries=[],client={async query(sql,params){queries.push({sql,params});return {rows:[
  {service_slug:'chess-com',country_code:'ES',suggested_count:3,verified_count:0},
  {service_slug:'chess-com',country_code:'SE',suggested_count:0,verified_count:2},
  {service_slug:'1password',country_code:'SE',suggested_count:1,verified_count:0},
  {service_slug:'chess-com',country_code:'ZZ',suggested_count:1,verified_count:0}
 ]};}},ops={config:{read:true,client},async priceResearchTargeting(input){assert.deepEqual(input,{});return {services:[{serviceId:'chess-com',canonicalSlug:'chess-com',selectable:true},{serviceId:'1password',canonicalSlug:'1password',selectable:true},{serviceId:'blocked',canonicalSlug:'blocked',selectable:false}],markets:[{id:'ES'},{id:'SE'}]};}};
 return {ops,queries,request:(body,actor='admin')=>operationsRequest({method:'POST',url,body,actor},ops)};
}

test('market status endpoint reads one bounded current canonical projection for selected services',async()=>{
 const {request,queries}=fixture(),value=await request({services:['chess-com','1password']});
 assert.equal(value.version,'MARKET_PRICE_STATUS_V1');assert.deepEqual(value.rows,[
  {serviceId:'chess-com',market:'ES',suggestedCount:3,verifiedCount:0},
  {serviceId:'chess-com',market:'SE',suggestedCount:0,verifiedCount:2},
  {serviceId:'1password',market:'SE',suggestedCount:1,verifiedCount:0}
 ]);
 assert.equal(queries.length,1);assert.deepEqual(queries[0].params,[['chess-com','1password']]);
 assert.equal(queries[0].sql,marketPriceStatusSql);
 assert.match(marketPriceStatusSql,/active=true/);
 assert.match(marketPriceStatusSql,/verification IN \('registry','authoritative-provider'\)/);
 assert.match(marketPriceStatusSql,/verified_by_agreement=true AND source_count>=2/);
 assert.doesNotMatch(marketPriceStatusSql,/user_|job|history/i);
});

test('market status endpoint handles no selected service and rejects invalid or unavailable services',async()=>{
 const {request,queries}=fixture();assert.deepEqual((await request({services:[]})).rows,[]);assert.equal(queries.length,0);
 for(const body of [{},{services:['chess-com','chess-com']},{services:['missing']},{services:['blocked']},{services:[],markets:['SE']}])await assert.rejects(request(body));
 await assert.rejects(request({services:['chess-com']},null),/UNAUTHORIZED/);
 assert.equal(queries.length,0);
});
