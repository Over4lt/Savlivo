import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPricingLimiter, settledPricingMap} from './pricing-concurrency.js';
import {pool} from './db.js';
import {getRegionalPricing, runPricingRefreshBatch} from './pricing.js';

test('startup has no pricing acquisition invocation or pricing timer; on-demand endpoint remains', () => {
  const source=readFileSync(new URL('./server.ts',import.meta.url),'utf8');
  assert.doesNotMatch(source,/runPricingVerification|refreshVerifiedPricingCountries|pricingVerificationTimer/);
  assert.match(source,/getRegionalPricing\(country,\s*\{ forceRefresh: refresh \}\)/);
});

test('shared limiter bounds overlapping callers and releases slots after rejection', async () => {
  const limit=createPricingLimiter(4); let active=0, peak=0;
  const results=await settledPricingMap(Array.from({length:40},(_,i)=>i),10,i=>limit(async()=>{
    peak=Math.max(peak,++active);await new Promise(r=>setTimeout(r,1));active--;
    if(i===3)throw Error('fixture');return i;
  }));
  assert.equal(peak,4);assert.equal(active,0);assert.equal(results[3].status,'rejected');assert.equal(results[39].status,'fulfilled');
});

test('explicit overlapping market batches stay bounded and do not claim evidence success', async()=>{
  let active=0,peak=0;
  const refresh=async(c:string)=>{peak=Math.max(peak,++active);await new Promise(r=>setTimeout(r,1));active--;if(c==='DE')throw Error('fixture');};
  const [result]=await Promise.all([runPricingRefreshBatch(['US','DE','NO'],refresh),runPricingRefreshBatch(['SE','DK'],refresh)]);
  assert.equal(peak,2);assert.equal(result.marketsAttempted,3);assert.equal(result.marketsCompleted,2);assert.deepEqual(result.failed,['DE']);
  assert.equal(result.acquisition,null);assert.equal(result.verification,null);assert.equal(result.persistence,null);
});

test('on-demand pricing retains persisted evidence, caches it, and explicit refresh remains available',async()=>{
  const originalQuery=pool.query,originalFetch=globalThis.fetch;let fetches=0;
  globalThis.fetch=async()=>{fetches++;throw Error('OFFLINE_FIXTURE');};
  pool.query=(async()=>({rows:[{service_slug:'fixture-service',plan_slug:'standard',plan_name:'Standard',billing_provider_slug:'direct',country_code:'NO',currency:'NOK',monthly_price_minor:12300,source:'persisted-fixture',source_url:'https://example.invalid',verification:'authoritative-provider',source_count:1,verified_by_agreement:false,last_checked_at:new Date('2026-01-01')}],rowCount:1})) as unknown as typeof pool.query;
  try{
    const first=await getRegionalPricing('NO',{forceRefresh:true});assert(first.items.some(i=>i.serviceSlug==='fixture-service'));assert(fetches>0);
    const before=fetches;assert.equal(await getRegionalPricing('NO'),first);assert.equal(fetches,before);
    await getRegionalPricing('NO',{forceRefresh:true});assert(fetches>before);
  }finally{pool.query=originalQuery;globalThis.fetch=originalFetch;}
});

test('24-hour adapter cache observes a later V3 write without another provider request',async()=>{
  const originalQuery=pool.query,originalFetch=globalThis.fetch;
  let fetches=0,readFails=false;
  const old={service_slug:'max',plan_slug:'legacy-fixture-tier',plan_name:'Legacy fixture tier',billing_provider_slug:'direct',
    country_code:'SE',currency:'SEK',monthly_price_minor:9900,source:'official-provider-adapter:max',
    source_url:'https://www.hbomax.com/se',verification:'authoritative-provider',source_count:1,
    verified_by_agreement:false,last_checked_at:new Date('2026-10-19T00:00:00Z')};
  let rows=[old];
  globalThis.fetch=async()=>{fetches++;throw Error('OFFLINE_FIXTURE');};
  pool.query=(async()=>{if(readFails)throw Error('DB_READ_FAILED');return {rows,rowCount:rows.length};}) as unknown as typeof pool.query;
  try{
    const first=await getRegionalPricing('SE',{forceRefresh:true});
    assert.equal(first.items.find(item=>item.planSlug==='legacy-fixture-tier')?.monthlyPriceMinor,9900);
    const calls=fetches;
    rows=[{...old,monthly_price_minor:10900,source:'v3-truth',last_checked_at:new Date('2026-10-20T00:00:00Z')}];
    const updated=await getRegionalPricing('SE');
    assert.equal(updated.items.find(item=>item.planSlug==='legacy-fixture-tier')?.monthlyPriceMinor,10900);
    assert.equal(updated.items.find(item=>item.planSlug==='legacy-fixture-tier')?.source,'v3-truth');
    assert.equal(fetches,calls);
    readFails=true;
    assert.equal(await getRegionalPricing('SE'),updated);
  }finally{pool.query=originalQuery;globalThis.fetch=originalFetch;}
});

test('BE refresh and cache never present the retired Disney+ ads adapter price as current',async()=>{
  const originalQuery=pool.query,originalConnect=pool.connect,originalFetch=globalThis.fetch;
  let fetches=0;
  const v3=(slug:string,name:string,minor:number)=>({plan_identity:`catalog:disney-plus:be:${slug}:direct:eur`,
    service_slug:'disney-plus',plan_slug:slug,plan_name:name,
    billing_provider_slug:'direct',country_code:'BE',currency:'EUR',monthly_price_minor:minor,
    source:'v3-truth',source_url:'https://help.disneyplus.com/en-GB/article/disneyplus-price?redirect=true',
    verification:'authoritative-provider',source_count:1,verified_by_agreement:false,
    last_checked_at:new Date('2026-10-20T00:00:00Z')});
  const rows=[v3('disney-standard','Disney+ Standard',1099),v3('disney-premium','Disney+ Premium',1599)];
  globalThis.fetch=async()=>{fetches++;throw Error('OFFLINE_FIXTURE');};
  pool.query=(async()=>({rows,rowCount:rows.length})) as unknown as typeof pool.query;
  pool.connect=(async()=>{throw Error('NO_TEST_WRITES');}) as unknown as typeof pool.connect;
  try{
    for(const snapshot of [await getRegionalPricing('BE',{forceRefresh:true}),await getRegionalPricing('BE')]){
      const disney=snapshot.items.filter(row=>row.serviceSlug==='disney-plus');
      assert.equal(disney.some(row=>row.planSlug==='standard-with-ads'||row.monthlyPriceMinor===699),false);
      assert.deepEqual(disney.filter(row=>row.source==='v3-truth').map(row=>[row.planSlug,row.monthlyPriceMinor,row.source]).sort(),
        [['disney-premium',1599,'v3-truth'],['disney-standard',1099,'v3-truth']]);
    }
    assert(fetches>0);
  }finally{pool.query=originalQuery;pool.connect=originalConnect;globalThis.fetch=originalFetch;}
});

test('NL pricing and its cached API snapshot expose three source-linked Max plans while retaining database rows',async()=>{
  const originalQuery=pool.query,originalConnect=pool.connect,originalFetch=globalThis.fetch;
  const ids=['54c576f7d7721e8f5a26c1c66ccd4d3a0e379888c8ae59aeff753a0d0772580d','41227e6fdf91d631115a5f99b52cf76f96f01ba7ee992412d771452c46cbc6b5','e02a30f15b3a511a3531b036eec16137ccc07ae55c5c8da7231fbba1eddbac98'];
  const names=['Basic With Ads','Standard','Premium'],slugs=['basic-with-ads','standard','premium'],amounts=[599,1199,1699];
  const row=(slug:string,name:string,amount:number,source:string)=>({plan_identity:`catalog:max:nl:${slug}:direct:eur`,service_slug:'max',plan_slug:slug,plan_name:name,billing_provider_slug:'direct',country_code:'NL',currency:'EUR',monthly_price_minor:amount,source,source_url:'https://www.hbomax.com/nl/en',verification:'authoritative-provider',source_count:1,verified_by_agreement:false,last_checked_at:new Date('2026-10-21T10:49:59.605Z')});
  const rows=[...slugs.map((slug,i)=>row(slug,names[i],amounts[i],'v3-truth')),...ids.map((id,i)=>row(id,id,amounts[i],'v3-truth')),
    ...['HBO Max Basic met reclame \\u0026 Videoland Basis','HBO Max Standaard \\u0026 Videoland Plus','HBO Max Premium \\u0026 Videoland Premium'].map((name,i)=>row('bundle-'+i,name,[999,1799,2399][i],'official-provider-adapter:max'))];
  globalThis.fetch=async()=>{throw Error('OFFLINE_FIXTURE');};
  pool.query=(async()=>({rows,rowCount:rows.length})) as unknown as typeof pool.query;
  pool.connect=(async()=>{throw Error('NO_TEST_WRITES');}) as unknown as typeof pool.connect;
  try{
    for(const snapshot of [await getRegionalPricing('NL',{forceRefresh:true}),await getRegionalPricing('NL')]){
      const max=snapshot.items.filter(item=>item.serviceSlug==='max');
      assert.deepEqual(max.map(item=>[item.planSlug,item.planName,item.monthlyPriceMinor]),[['basic-with-ads','Basic With Ads',599],['standard','Standard',1199],['premium','Premium',1699]]);
    }
    assert.equal(rows.length,9,'read projection leaves all persisted rows intact');
  }finally{pool.query=originalQuery;pool.connect=originalConnect;globalThis.fetch=originalFetch;}
});

test('real adapter fan-out across simultaneous markets uses at most four slots',async()=>{
  const {fetchProviderLocalPrices}=await import('./pricing-adapters.js');
  const original=globalThis.fetch;let active=0,peak=0,calls=0;
  globalThis.fetch=async()=>{calls++;peak=Math.max(peak,++active);await new Promise(r=>setTimeout(r,1));active--;throw Error('OFFLINE_FIXTURE');};
  try{await Promise.all(['NO','SE','DE'].map(country=>fetchProviderLocalPrices(country,country==='NO'?'NOK':country==='SE'?'SEK':'EUR')));assert(calls>4);assert(peak<=4,`peak ${peak}`);}
  finally{globalThis.fetch=original;}
});
