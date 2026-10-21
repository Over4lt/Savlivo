import test from 'node:test';
import assert from 'node:assert/strict';
import {operationsRequest} from './http.mjs';
import {marketPriceStatusSql,projectMarketPriceStatus} from './market-price-status.mjs';

const url=new URL('https://offline.invalid/v1/admin/v2-operations/price-research/market-price-status');
function fixture(){
 const queries=[],client={async query(sql,params){queries.push({sql,params});return {rows:[
  ...[0,1,2].map(i=>({service_slug:'chess-com',country_code:'ES',plan_identity:'suggested-'+i,billing_provider_slug:'direct',kind:'suggested'})),
  ...[0,1].map(i=>({service_slug:'chess-com',country_code:'ES',plan_identity:'old-'+i,plan_slug:'old-'+i,plan_name:'Old '+i,billing_provider_slug:'direct',currency:'EUR',source:'official-provider-adapter:chess-com',verification:'authoritative-provider',kind:'old_verified'})),
  ...[0,1].map(i=>({service_slug:'chess-com',country_code:'SE',plan_identity:'verified-'+i,plan_slug:'verified-'+i,plan_name:'Verified '+i,billing_provider_slug:'direct',currency:'SEK',source:'v3-truth',verification:'authoritative-provider',kind:'verified'})),
  {service_slug:'chess-com',country_code:'SE',plan_identity:'old',plan_slug:'old',plan_name:'Old',billing_provider_slug:'direct',currency:'SEK',source:'official-provider-adapter:chess-com',verification:'authoritative-provider',kind:'old_verified'},
  {service_slug:'1password',country_code:'SE',plan_identity:'suggested',billing_provider_slug:'direct',kind:'suggested'},
  {service_slug:'chess-com',country_code:'ZZ',plan_identity:'suggested',billing_provider_slug:'direct',kind:'suggested'}
 ]};}},ops={config:{read:true,client},async priceResearchTargeting(input){assert.deepEqual(input,{});return {services:[{serviceId:'chess-com',canonicalSlug:'chess-com',name:'Chess.com',selectable:true},{serviceId:'1password',canonicalSlug:'1password',name:'1Password',selectable:true},{serviceId:'blocked',canonicalSlug:'blocked',selectable:false}],markets:[{id:'ES'},{id:'SE'}]};}};
 return {ops,queries,request:(body,actor='admin')=>operationsRequest({method:'POST',url,body,actor},ops)};
}

test('market status endpoint reads one bounded current canonical projection for selected services',async()=>{
 const {request,queries}=fixture(),value=await request({services:['chess-com','1password']});
 assert.equal(value.version,'MARKET_PRICE_STATUS_V1');assert.deepEqual(value.rows,[
  {serviceId:'chess-com',market:'ES',suggestedCount:3,verifiedCount:0,oldVerifiedCount:2,retainedOldVerifiedCount:2},
  {serviceId:'chess-com',market:'SE',suggestedCount:0,verifiedCount:2,oldVerifiedCount:1,retainedOldVerifiedCount:1},
  {serviceId:'1password',market:'SE',suggestedCount:1,verifiedCount:0,oldVerifiedCount:0,retainedOldVerifiedCount:0}
 ]);
 assert.equal(queries.length,1);assert.deepEqual(queries[0].params,[['chess-com','1password']]);
 assert.equal(queries[0].sql,marketPriceStatusSql);
 assert.match(marketPriceStatusSql,/active=true/);
 assert.match(marketPriceStatusSql,/source LIKE 'official-provider-adapter:%'/);
 assert.match(marketPriceStatusSql,/plan_name/);
 assert.match(marketPriceStatusSql,/verification IN \('registry','authoritative-provider'\)/);
 assert.match(marketPriceStatusSql,/verified_by_agreement=true AND source_count>=2/);
 assert.doesNotMatch(marketPriceStatusSql,/user_|job|history/i);
});

const price=(market,planName,planSlug,source,amount,extra={})=>({service_slug:'max',country_code:market,plan_identity:`catalog:max:${market.toLowerCase()}:${planSlug}:direct:eur`,plan_slug:planSlug,plan_name:planName,billing_provider_slug:'direct',currency:'EUR',monthly_price_minor:amount,source,source_url:'https://www.hbomax.com/nl/en',verification:'authoritative-provider',source_count:1,verified_by_agreement:false,kind:source==='v3-truth'?'verified':'old_verified',...extra});
test('NL bundles remain retained while only ordinary V3 plans count as active Old Verified coverage',()=>{
 const rows=[price('NL','Basic With Ads','basic-with-ads','v3-truth',599),price('NL','Standard','standard','v3-truth',1199),price('NL','Premium','premium','v3-truth',1699),
  ...[['54c576f7d7721e8f5a26c1c66ccd4d3a0e379888c8ae59aeff753a0d0772580d',599],['41227e6fdf91d631115a5f99b52cf76f96f01ba7ee992412d771452c46cbc6b5',1199],['e02a30f15b3a511a3531b036eec16137ccc07ae55c5c8da7231fbba1eddbac98',1699]].map(([id,amount])=>price('NL',id,id,'v3-truth',amount)),
  price('NL','HBO Max Basic met reclame \\u0026 Videoland Basis','bundle-basic','official-provider-adapter:max',999),
  price('NL','HBO Max Standaard \\u0026 Videoland Plus','bundle-standard','official-provider-adapter:max',1799),
  price('NL','HBO Max Premium \\u0026 Videoland Premium','bundle-premium','official-provider-adapter:max',2399)];
 const [status]=projectMarketPriceStatus(rows,()=> 'Max');
 assert.deepEqual([status.verifiedCount,status.oldVerifiedCount,status.retainedOldVerifiedCount],[3,0,3]);
});

test('partial V3 coverage retains unrelated ordinary Old Verified and ambiguous identities',()=>{
 const rows=[price('BE','Basic With Ads','basic-with-ads','v3-truth',599),price('BE','Basic With Ads','old-basic','official-provider-adapter:max',499),
  price('BE','Standard','standard','official-provider-adapter:max',1199),price('BE','Legacy Plus','legacy-plus','official-provider-adapter:max',1399),
  price('BE','abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789','abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789','v3-truth',1199)];
 const [status]=projectMarketPriceStatus(rows,()=> 'Max');
 assert.deepEqual([status.verifiedCount,status.oldVerifiedCount,status.retainedOldVerifiedCount],[2,2,3]);
});

test('market status endpoint handles no selected service and rejects invalid or unavailable services',async()=>{
 const {request,queries}=fixture();assert.deepEqual((await request({services:[]})).rows,[]);assert.equal(queries.length,0);
 for(const body of [{},{services:['chess-com','chess-com']},{services:['missing']},{services:['blocked']},{services:[],markets:['SE']}])await assert.rejects(request(body));
 await assert.rejects(request({services:['chess-com']},null),/UNAUTHORIZED/);
 assert.equal(queries.length,0);
});
