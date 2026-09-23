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

test('real adapter fan-out across simultaneous markets uses at most four slots',async()=>{
  const {fetchProviderLocalPrices}=await import('./pricing-adapters.js');
  const original=globalThis.fetch;let active=0,peak=0,calls=0;
  globalThis.fetch=async()=>{calls++;peak=Math.max(peak,++active);await new Promise(r=>setTimeout(r,1));active--;throw Error('OFFLINE_FIXTURE');};
  try{await Promise.all(['NO','SE','DE'].map(country=>fetchProviderLocalPrices(country,country==='NO'?'NOK':country==='SE'?'SEK':'EUR')));assert(calls>4);assert(peak<=4,`peak ${peak}`);}
  finally{globalThis.fetch=original;}
});
