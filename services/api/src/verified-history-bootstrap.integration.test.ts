import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {pool} from "./db.js";
import {executeVerifiedBootstrapPlan,preflightVerifiedBootstrap,runVerifiedBootstrap} from "./verified-history-bootstrap.js";

const enabled=process.env.SAVLIVO_DISPOSABLE_DB_TEST==="1";
const expectedUrl="postgresql://postgres@127.0.0.1:55439/savlivo_test";
const sql=(name:string)=>readFileSync(new URL(`../../../${name}`,import.meta.url),"utf8");
const verifiedAt="2026-08-30T00:00:00Z";

async function insert(service:string,slug:string,name:string,market:string,currency:string,amount:number,
  at=verifiedAt,verification="authoritative-provider"){
 await pool.query(`INSERT INTO verified_provider_prices(plan_identity,service_slug,plan_slug,plan_name,
   billing_provider_slug,country_code,currency,monthly_price_minor,source,source_url,verification,
   source_count,verified_by_agreement,verified_at,last_checked_at)
   VALUES($1,$2,$3,$4,'direct',$5,$6,$7,'v3-truth','https://provider.example/prices?token=private',
   $8,1,false,$9::timestamptz,$9::timestamptz)`,[
  `catalog:${service}:${market.toLowerCase()}:${slug}:direct:${currency.toLowerCase()}`,
  service,slug,name,market,currency,amount,verification,at]);
}

test("Verified bootstrap is an explicit, atomic as-of initialization on disposable PostgreSQL",{skip:!enabled},async t=>{
 assert.equal(process.env.DATABASE_URL,expectedUrl);
 t.after(async()=>{await pool.end();});
 await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
 for(const name of ["db/schema.sql","db/migrations/002_auth.sql","db/migrations/009_subscription_market.sql",
  "db/migrations/014_verified_price_observations.sql","db/migrations/019_suggested_provider_prices.sql",
  "db/migrations/023_durable_verified_price_history.sql","db/migrations/024_price_analytics_history_index.sql",
  "db/migrations/025_verified_bootstrap_integrity.sql"])await pool.query(sql(name));
 for(const [slug,name,oldAmount,newAmount] of [["basic","Basic",6900,8900],
  ["standard","Standard",10900,12900],["premium","Premium",15900,17900]] as const){
  await insert("disney-plus",`old-${slug}`,name,"NO","NOK",oldAmount,"2026-08-30T00:00:00Z");
  await insert("disney-plus",`new-${slug}`,`Disney+ ${name}`,"NO","NOK",newAmount,"2026-10-18T00:00:00Z");
 }
 await insert("chess-com","diamond","Diamond","SG","USD",999);
 await insert("netflix","standard-qa","Standard","QA","USD",1299);
 await insert("netflix","standard-ro","Standard","RO","USD",1399);
 await insert("disney-plus","weak","Suggested","NO","NOK",4999,verifiedAt,"registry");
 await pool.query(`INSERT INTO verified_price_observations(service_slug,plan_slug,plan_name,billing_provider_slug,
   country_code,currency,monthly_price_minor,source,source_url,verification,source_count,
   verified_by_agreement,provider_verified_at)
   VALUES('disney-plus','legacy','Legacy','direct','NO','NOK',6999,'legacy',
   'https://provider.example/old','authoritative-provider',1,false,$1::timestamptz)`,[verifiedAt]);
 await pool.query(`INSERT INTO suggested_provider_prices(suggested_id,plan_identity,service_slug,plan_name,
   billing_provider_slug,country_code,currency,monthly_price_minor,payment_cadence,provenance,source_url,
   researched_at,warnings,active)
   VALUES('bootstrap-suggested','catalog:disney-plus:no:suggested:direct:nok','disney-plus','Suggested',
   'direct','NO','NOK',4999,'MONTHLY_RECURRING','V3_SOURCE_RESEARCH',
   'https://provider.example/prices',now(),'[]',true)`);
 const user=(await pool.query("INSERT INTO users(email,password_hash) VALUES('bootstrap-test@example.invalid','disabled') RETURNING id")).rows[0].id;
 await pool.query(`INSERT INTO subscriptions(user_id,service_id,billing_provider_id,status,country_code,currency,
   monthly_price_minor) SELECT $1,s.id,b.id,'ACTIVE','NO','NOK',29999 FROM services s,billing_providers b
   WHERE s.slug='disney-plus' AND b.slug='direct'`,[user]);

 const first=await preflightVerifiedBootstrap();
 assert.equal(first.rowsExamined,10);
 assert.equal(first.candidates.length,6);
 assert.equal(first.excluded.OLDER_PROVEN_ALIAS,3);
 assert.equal(first.excluded.NOT_AUTHORITATIVE_PROVIDER,1);
 assert.equal(first.reviewFlags.CROSS_CURRENCY_REVIEW,3);
 assert.deepEqual(first.candidates.filter(row=>row.row.serviceSlug==="disney-plus")
  .map(row=>row.row.planSlug),["new-basic","new-premium","new-standard"]);
 assert.equal(first.candidates.some(row=>row.row.serviceSlug==="chess-com"),true);
 const dry=await runVerifiedBootstrap();
 assert.equal(dry.mode,"READ_ONLY_AS_OF_PREFLIGHT");
 assert.equal(JSON.stringify(dry).includes("token=private"),false);
 assert.equal((await pool.query("SELECT count(*)::int n FROM verified_price_observations")).rows[0].n,1);
 await assert.rejects(executeVerifiedBootstrapPlan(first),/BOOTSTRAP_EXPLICIT_CONFIRMATION_REQUIRED/);
 await assert.rejects(executeVerifiedBootstrapPlan(first,{execute:true,confirm:"BOOTSTRAP_AS_OF",expectedDigest:"0".repeat(64)}),
  /BOOTSTRAP_PREFLIGHT_DIGEST_CHANGED/);

 // A row changed after the consistent snapshot must be skipped without losing
 // the unaffected series or changing any current amount or verification date.
 await pool.query("UPDATE verified_provider_prices SET monthly_price_minor=1099 WHERE service_slug='chess-com'");
 const applied=await executeVerifiedBootstrapPlan(first,{execute:true,confirm:"BOOTSTRAP_AS_OF",expectedDigest:first.digest});
 assert.equal(applied.inserted,5);assert.equal(applied.changed,1);
 const after=await preflightVerifiedBootstrap();
 assert.equal(after.candidates.length,1);
 assert.equal(after.excluded.ALREADY_INITIALIZED,5);
 const second=await executeVerifiedBootstrapPlan(after,{execute:true,confirm:"BOOTSTRAP_AS_OF",expectedDigest:after.digest});
 assert.equal(second.inserted,1);
 const repeated=await preflightVerifiedBootstrap();assert.equal(repeated.candidates.length,0);
 const records=(await pool.query(`SELECT history_event_kind,plan_slug,monthly_price_minor,provider_verified_at,
   observed_at,provider_effective_at,history_series_id FROM verified_price_observations
   WHERE history_series_id IS NOT NULL ORDER BY plan_slug`)).rows;
 assert.equal(records.length,6);
 assert(records.every(row=>row.history_event_kind==="BOOTSTRAP_BASELINE"&&row.provider_effective_at===null));
 assert(records.every(row=>new Date(row.observed_at).getTime()>new Date(row.provider_verified_at).getTime()));
 assert.equal(new Set(records.map(row=>row.history_series_id)).size,6);
 assert.equal((await pool.query(`SELECT count(*)::int n FROM verified_price_observations
   WHERE history_series_id IS NULL`)).rows[0].n,1);
 assert.equal((await pool.query("SELECT count(*)::int n FROM suggested_provider_prices WHERE suggested_id='bootstrap-suggested'"))
  .rows[0].n,1);
 assert.equal((await pool.query("SELECT monthly_price_minor FROM subscriptions WHERE user_id=$1",[user]))
  .rows[0].monthly_price_minor,29999);
 assert.equal((await pool.query("SELECT monthly_price_minor FROM verified_provider_prices WHERE service_slug='chess-com'"))
  .rows[0].monthly_price_minor,1099);

 await insert("chess-com","gold","Gold","NO","NOK",599);
 const concurrent=await preflightVerifiedBootstrap();
 const outcomes=await Promise.all([1,2].map(()=>executeVerifiedBootstrapPlan(concurrent,{
  execute:true,confirm:"BOOTSTRAP_AS_OF",expectedDigest:concurrent.digest})));
 assert.equal(outcomes.reduce((sum,row)=>sum+row.inserted,0),1);
 assert.equal((await pool.query(`SELECT count(*)::int n FROM verified_price_observations
   WHERE plan_slug='gold' AND history_event_kind='BOOTSTRAP_BASELINE'`)).rows[0].n,1);

 await insert("netflix","atomic","Atomic","DE","EUR",899);
 await pool.query(`CREATE FUNCTION reject_bootstrap() RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN IF NEW.plan_slug='atomic' AND NEW.history_event_kind='BOOTSTRAP_BASELINE'
   THEN RAISE EXCEPTION 'synthetic bootstrap failure'; END IF; RETURN NEW; END $$`);
 await pool.query(`CREATE TRIGGER reject_bootstrap BEFORE INSERT ON verified_price_observations
   FOR EACH ROW EXECUTE FUNCTION reject_bootstrap()`);
 try{
  const atomic=await preflightVerifiedBootstrap();
  await assert.rejects(executeVerifiedBootstrapPlan(atomic,{
   execute:true,confirm:"BOOTSTRAP_AS_OF",expectedDigest:atomic.digest}),/synthetic bootstrap failure/);
  assert.equal((await pool.query("SELECT history_series_id FROM verified_provider_prices WHERE plan_slug='atomic'"))
   .rows[0].history_series_id,null);
  assert.equal((await pool.query("SELECT count(*)::int n FROM verified_price_observations WHERE plan_slug='atomic'"))
   .rows[0].n,0);
 }finally{
  await pool.query("DROP TRIGGER reject_bootstrap ON verified_price_observations");
  await pool.query("DROP FUNCTION reject_bootstrap()");
 }
 await insert("netflix","orphan-assignment","Orphan assignment","DE","EUR",799);
 await pool.query("UPDATE verified_provider_prices SET history_series_id=$1 WHERE plan_slug='orphan-assignment'",[
  "vh:"+"f".repeat(64)]);
 const orphan=await preflightVerifiedBootstrap();
 assert.equal(orphan.excluded.ASSIGNED_WITHOUT_BASELINE,1);
 assert.equal(orphan.candidates.some(row=>row.row.planSlug==="orphan-assignment"),false);
});
