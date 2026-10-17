import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {pool} from './db.ts';

const enabled=process.env.DATABASE_URL?.startsWith('postgresql://postgres@127.0.0.1:55440/');
const apiDirectory=fileURLToPath(new URL('..',import.meta.url));
const scope=['netflix','ZZ'];
const scripts={snapshot:'scripts/snapshot-verified-repair-history.mjs',repair:'scripts/reconcile-verified-current.mjs'};
const run=(script,args=[])=>{
 const result=spawnSync(process.execPath,['--import','tsx',scripts[script],'--service',scope[0],'--market',scope[1],...args],
  {cwd:apiDirectory,env:process.env,encoding:'utf8',timeout:15000});
 if(result.status!==0)throw Error(`${script} failed: ${result.stderr}`);
 return JSON.parse(result.stdout);
};
const clear=async()=>{
 await pool.query('DELETE FROM verified_provider_prices WHERE service_slug=$1 AND country_code=$2',scope);
 await pool.query('DELETE FROM verified_price_observations WHERE service_slug=$1 AND country_code=$2',scope);
};
test.after(async()=>{if(enabled)await pool.end();});

test('scoped history snapshot precedes idempotent current Verified repair', {skip:!enabled},async()=>{
 await clear();
 try{
  const plans=[
   ['Standard with Ads','standard-with-ads',6900,'2026-08-30T13:39:53.916975Z','2026-09-23T09:25:11.251879Z'],
   ['Standard','standard',10900,'2026-08-30T13:39:53.920744Z','2026-09-23T09:25:11.255170Z'],
   ['Premium','premium',15900,'2026-08-30T13:39:54.014847Z','2026-09-23T09:25:11.257916Z'],
   ['Netflix Standard with Ads','netflix-standard-with-ads',8900,'2026-10-16T23:33:45.789537Z','2026-10-16T23:33:45.789537Z'],
   ['Netflix Standard','netflix-standard',12900,'2026-10-16T23:33:45.792140Z','2026-10-16T23:33:45.792140Z'],
   ['Netflix Premium','netflix-premium',17900,'2026-10-16T23:33:45.793833Z','2026-10-16T23:33:45.793833Z']
  ];
  for(const [name,slug,amount,verifiedAt,checkedAt] of plans)await pool.query(`INSERT INTO verified_provider_prices
   (service_slug,plan_slug,plan_name,plan_identity,billing_provider_slug,country_code,currency,
    monthly_price_minor,source,source_url,verification,source_count,verified_by_agreement,verified_at,last_checked_at)
   VALUES ($1,$2,$3,$4,'direct',$5,'NOK',$6,'test-provider','https://example.test/pricing',
    'authoritative-provider',1,false,$7::timestamptz,$8::timestamptz)`,
   [scope[0],slug,name,`catalog:${scope[0]}:zz:${slug}:direct:nok`,scope[1],amount,verifiedAt,checkedAt]);

  const before=run('repair');
  assert.equal(before.currentCount,6);assert.equal(before.historyCount,0);
  assert.equal(before.candidateCount,3);assert.equal(before.ready,false);assert.equal(before.deleteCount,0);
  assert.deepEqual(before.groups.map(group=>[group.remove.amount,group.keep.amount]).sort((a,b)=>a[0]-b[0]),[[6900,8900],[10900,12900],[15900,17900]]);
  const premature=spawnSync(process.execPath,['--import','tsx',scripts.repair,'--service',scope[0],'--market',scope[1],
   '--apply','--expect-digest',before.digest],{cwd:apiDirectory,env:process.env,encoding:'utf8',timeout:15000});
  assert.notEqual(premature.status,0);
  assert.match(premature.stderr,/REPAIR_REFUSED_HISTORY_OR_AMBIGUITY/);
  const dry=run('snapshot');
  assert.equal(dry.missingObservationCount,6);
  assert.equal(dry.digest,before.digest);
  const wrongDigest=spawnSync(process.execPath,['--import','tsx',scripts.snapshot,'--service',scope[0],'--market',scope[1],
   '--apply','--expect-digest','0'.repeat(64)],{cwd:apiDirectory,env:process.env,encoding:'utf8',timeout:15000});
  assert.notEqual(wrongDigest.status,0);
  assert.match(wrongDigest.stderr,/SNAPSHOT_CURRENT_CHANGED/);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM verified_price_observations WHERE service_slug=$1 AND country_code=$2',scope)).rows[0].n,0);
  const backfilled=run('snapshot',['--apply','--expect-digest',dry.digest]);
  assert.equal(backfilled.inserted,6);assert.equal(backfilled.currentCount,6);assert.equal(backfilled.historyCount,6);
  const history=(await pool.query(`SELECT plan_name,monthly_price_minor,provider_verified_at::text AS verified_at_exact,
    observed_at FROM verified_price_observations WHERE service_slug=$1 AND country_code=$2 ORDER BY monthly_price_minor`,scope)).rows;
  assert.deepEqual(history.map(row=>row.monthly_price_minor),[6900,8900,10900,12900,15900,17900]);
  for(const row of history){
   const original=plans.find(plan=>plan[2]===row.monthly_price_minor);
   assert.equal(row.verified_at_exact.replace(' ','T').replace('+00','Z'),original[3].replace(/0+Z$/,'Z'));
   assert.ok(row.observed_at);
  }
  const repeatedSnapshot=run('snapshot');
  assert.equal(repeatedSnapshot.missingObservationCount,0);
  assert.equal(run('snapshot',['--apply','--expect-digest',repeatedSnapshot.digest]).inserted,0);
  const ready=run('repair');
  assert.equal(ready.ready,true);assert.equal(ready.deleteCount,3);
  assert.equal(run('repair',['--apply','--expect-digest',ready.digest]).removed,3);
  const current=(await pool.query('SELECT plan_name,monthly_price_minor FROM verified_provider_prices WHERE service_slug=$1 AND country_code=$2 ORDER BY monthly_price_minor',scope)).rows;
  assert.deepEqual(current,[
   {plan_name:'Netflix Standard with Ads',monthly_price_minor:8900},
   {plan_name:'Netflix Standard',monthly_price_minor:12900},
   {plan_name:'Netflix Premium',monthly_price_minor:17900}
  ]);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM verified_price_observations WHERE service_slug=$1 AND country_code=$2',scope)).rows[0].n,6);
  assert.equal(run('repair').deleteCount,0);
 }finally{await clear();}
});
