import test from 'node:test';
import assert from 'node:assert/strict';
import {persistVerifiedLivePricesInTransaction} from './pricing-store.ts';
import {mergeFreshAndPersistedPricing} from './pricing.ts';
import {runAdminV4FirstResearch} from './google-ai/admin-live-pipeline.mjs';

const oldPrice=(market,plan,minor,at='2026-08-01T00:00:00.000Z')=>({
 serviceSlug:'max',serviceName:'Max',planSlug:plan.toLowerCase().replaceAll(' ','-'),planName:plan,
 billingProviderSlug:'direct',countryCode:market,currency:market==='NO'?'NOK':market==='SE'?'SEK':'DKK',
 monthlyPriceMinor:minor,updatedAt:at,source:'official-provider-adapter:max',
 sourceUrl:`https://www.hbomax.com/${market.toLowerCase()}/old`,confidence:'official-provider-adapter',
 priceType:'exact',verification:'authoritative-provider',sourceCount:1,verifiedByAgreement:false
});
const v3Price=(old,plan,minor,at='2026-10-20T00:00:00.000Z')=>({
 ...old,planSlug:plan.toLowerCase().replaceAll(' ','-'),planName:plan,monthlyPriceMinor:minor,
 updatedAt:at,source:'v3-truth',sourceUrl:`https://www.hbomax.com/${old.countryCode.toLowerCase()}/plans`
});

// A small transactional query double exercises the actual Verified writer's
// lock, alias, history and upsert decisions without touching any database.
function store(seed){
 const current=seed.map(row=>({...row,historySeriesId:null,verifiedAt:row.updatedAt,lastCheckedAt:row.updatedAt})),history=[];
 const client={async query(sql,args=[]){
  if(sql.includes('pg_advisory_xact_lock'))return {rows:[],rowCount:1};
  if(sql.includes('FROM verified_provider_prices')&&sql.includes('FOR UPDATE'))return {rows:current.filter(row=>row.serviceSlug===args[0]&&row.billingProviderSlug===args[1]&&row.countryCode===args[2]&&row.currency===args[3]).map(row=>({
   plan_identity:row.planIdentity??null,history_series_id:row.historySeriesId,service_slug:row.serviceSlug,
   plan_slug:row.planSlug,plan_name:row.planName,billing_provider_slug:row.billingProviderSlug,
   country_code:row.countryCode,currency:row.currency,monthly_price_minor:row.monthlyPriceMinor,
   source:row.source,source_url:row.sourceUrl,verification:row.verification,source_count:row.sourceCount,
   verified_by_agreement:row.verifiedByAgreement,verified_at_exact:row.verifiedAt,last_checked_at_exact:row.lastCheckedAt
  })),rowCount:current.length};
  if(sql.includes('SELECT monthly_price_minor,provider_verified_at')){
   const found=history.filter(row=>row.series===args[0]).sort((a,b)=>b.at.localeCompare(a.at))[0];
   return {rows:found?[{monthly_price_minor:found.minor,provider_verified_at:found.at}]:[],rowCount:found?1:0};
  }
  if(sql.includes('INSERT INTO verified_price_observations')&&sql.includes('VALUES(')){
   const [series,kind,identity,service,slug,name,route,market,currency,minor,source,url,verification,count,agreement,at]=args;
   if(history.some(row=>row.series===series&&row.at===at))return {rows:[],rowCount:0};
   history.push({series,kind,identity,service,slug,name,route,market,currency,minor,source,url,verification,count,agreement,at});
   return {rows:[{id:history.length}],rowCount:1};
  }
  if(sql.includes('DELETE FROM verified_provider_prices')){
   const index=current.findIndex(row=>row.serviceSlug===args[0]&&row.planSlug===args[1]&&row.billingProviderSlug===args[2]&&row.countryCode===args[3]&&row.currency===args[4]);
   if(index>=0)current.splice(index,1);return {rows:[],rowCount:index>=0?1:0};
  }
  if(sql.includes('INSERT INTO verified_provider_prices')){
   const [identity,service,slug,name,route,market,currency,minor,source,url,verification,count,agreement,at,series]=args;
   const index=current.findIndex(row=>row.serviceSlug===service&&row.planSlug===slug&&row.billingProviderSlug===route&&row.countryCode===market&&row.currency===currency);
   const prior=index>=0?current[index]:null;
   const row={planIdentity:prior?.planIdentity?.startsWith('catalog:')?identity:prior?.planIdentity??identity,
    historySeriesId:series,serviceSlug:service,planSlug:slug,planName:name,billingProviderSlug:route,countryCode:market,
    currency,monthlyPriceMinor:minor,source,sourceUrl:url,verification,sourceCount:count,verifiedByAgreement:agreement,
    verifiedAt:!prior||prior.monthlyPriceMinor!==minor||prior.planName!==name?at:prior.verifiedAt,lastCheckedAt:at};
   if(index>=0)current[index]=row;else current.push(row);return {rows:[],rowCount:1};
  }
  throw Error('UNEXPECTED_SQL: '+sql.slice(0,80));
 }};
 return {current,history,client};
}

test('Max NO partially verified plans replace only their matching old row and preserve the old price as history',async()=>{
 const old=['Basic','Standard','Premium'].map((name,index)=>oldPrice('NO',name,[9900,12900,17900][index]));
 const db=store(old),fresh=v3Price(old[1],'Standard',14900);
 assert.deepEqual(await persistVerifiedLivePricesInTransaction([fresh],db.client),{received:1,persisted:1});
 assert.deepEqual(db.current.map(row=>[row.planName,row.source,row.monthlyPriceMinor]),[
  ['Basic','official-provider-adapter:max',9900],['Standard','v3-truth',14900],['Premium','official-provider-adapter:max',17900]]);
 assert.deepEqual(db.history.map(row=>[row.kind,row.minor,row.source]),[
  ['BOOTSTRAP_BASELINE',12900,'official-provider-adapter:max'],['PRICE_CHANGE',14900,'v3-truth']]);
 assert.equal(db.history[0].url,old[1].sourceUrl);
 assert.equal(new Set(db.history.map(row=>row.series)).size,1);
 await persistVerifiedLivePricesInTransaction([fresh],db.client);
 assert.equal(db.current.length,3);assert.equal(db.history.length,2,'a repeated V3 write adds no history');
 const laterAdapter={...old[1],updatedAt:'2026-10-21T00:00:00.000Z',monthlyPriceMinor:11900};
 assert.equal((await persistVerifiedLivePricesInTransaction([laterAdapter],db.client)).persisted,0);
 assert.equal(db.current[1].monthlyPriceMinor,14900);assert.equal(db.history.length,2);
 assert.deepEqual(mergeFreshAndPersistedPricing([laterAdapter],db.current).map(row=>row.monthlyPriceMinor),[9900,14900,17900]);
});

test('Max SE service-prefixed rename keeps one current plan and the original price evidence',async()=>{
 const old=oldPrice('SE','Standard',13900),db=store([old]),fresh=v3Price(old,'Max Standard',15900);
 assert.equal((await persistVerifiedLivePricesInTransaction([fresh],db.client)).persisted,1);
 assert.deepEqual(db.current.map(row=>[row.planName,row.source,row.monthlyPriceMinor]),[['Max Standard','v3-truth',15900]]);
 assert.deepEqual(db.history.map(row=>[row.kind,row.minor,row.url]),[
  ['BOOTSTRAP_BASELINE',13900,old.sourceUrl],['PRICE_CHANGE',15900,fresh.sourceUrl]]);
 const laterAdapter={...old,updatedAt:'2026-10-21T00:00:00.000Z'};
 assert.equal((await persistVerifiedLivePricesInTransaction([laterAdapter],db.client)).persisted,0);
 assert.deepEqual(mergeFreshAndPersistedPricing([laterAdapter],db.current).map(row=>row.planName),['Max Standard']);
 assert.equal(db.current.length,1);assert.equal(db.history.length,2);
});

test('Max DK failed verification leaves old rows untouched and does not call the Verified writer',async()=>{
 const old=['Basic','Standard'].map((name,index)=>oldPrice('DK',name,[9900,12900][index])),before=structuredClone(old);
 let writes=0;const target={id:'price-research:max:DK',service:'max',serviceName:'Max',market:'DK'};
 const result=await runAdminV4FirstResearch({targets:[target],apiKey:'offline',acquireGoogle:async()=>({status:'GOOGLE_AI_ACCESS_FAILURE',aiResult:null,audit:{request:{requestCount:0,status:'ADAPTER_FAILURE'}}}),
  persistSuggested:async()=>({persisted:0}),loadSuggested:async()=>[],loadVerified:async()=>structuredClone(old),
  persistVerified:async()=>{writes++;throw Error('UNEXPECTED_VERIFIED_WRITE');},
  runDownstream:async()=>({result:{},v3Results:{[target.id]:{suggested:[],verified:[],contradictions:[],operationalFailures:[{kind:'V3_VERIFICATION_RETRY_EXHAUSTED'}]}}})});
 assert.equal(writes,0);assert.deepEqual(old,before);assert.equal(result.targets[0].persisted.verified,0);
 assert.equal(result.targets[0].combined.verified.every(row=>row.provenance==='EXISTING_VERIFIED'),true);
});

test('unproven Max DK rename never deletes an old tier by guessing equivalence',async()=>{
 const old=oldPrice('DK','Standard',12900),db=store([old]);
 await persistVerifiedLivePricesInTransaction([v3Price(old,'Ultimate',15900)],db.client);
 assert.deepEqual(db.current.map(row=>row.planName),['Standard','Ultimate']);
 assert.equal(db.current[0].source,'official-provider-adapter:max');
 assert.deepEqual(db.history.map(row=>row.kind),['BASELINE']);
});

test('unreplaced Max adapter rows retain their ordinary bounded refresh behavior',async()=>{
 const old=oldPrice('DK','Basic',9900),db=store([old]);
 const refreshed={...old,monthlyPriceMinor:10900,updatedAt:'2026-10-20T00:00:00.000Z'};
 assert.equal((await persistVerifiedLivePricesInTransaction([refreshed],db.client)).persisted,1);
 assert.equal(db.current[0].monthlyPriceMinor,10900);
 assert.deepEqual(db.history.map(row=>[row.kind,row.minor]),[
  ['BOOTSTRAP_BASELINE',9900],['PRICE_CHANGE',10900]]);
});
