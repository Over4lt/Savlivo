import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import type {Client} from "pg";

export const productionRoot = fileURLToPath(new URL("../../../",import.meta.url));
export const schemaFile = "db/schema.sql";
export const migrationFiles = [
  "db/migrations/002_auth.sql",
  "db/migrations/003_billing.sql",
  "db/migrations/004_subscription_status_history.sql",
  "db/migrations/005_status_history_invariants.sql",
  "db/migrations/007_authoritative_provider_pricing.sql",
  "db/migrations/008_add_mainland_china_services.sql",
  "db/migrations/009_subscription_market.sql",
  "db/migrations/010_account_deletion_grace_period.sql",
  "db/migrations/011_add_viaplay.sql",
  "db/migrations/012_manual_subscriptions.sql",
  "db/migrations/013_private_analytics.sql",
  "db/migrations/014_verified_price_observations.sql",
  "db/migrations/015_admin_passkeys.sql",
  "db/migrations/019_suggested_provider_prices.sql",
  "db/migrations/021_price_research_links.sql",
  "db/migrations/022_price_research_market_exclusions.sql",
  "db/migrations/023_durable_verified_price_history.sql",
  "db/migrations/024_price_analytics_history_index.sql",
  "db/migrations/025_verified_bootstrap_integrity.sql",
  "db/migrations/026_suggested_price_calculation.sql",
  "services/api/src/savlivo-migration-savings-ledger-1.7.0.sql",
  "services/api/migrations/20260824_notifications.sql",
  "services/api/migrations/20260907_password_reset.sql",
] as const;

const legacyThrough="db/migrations/019_suggested_provider_prices.sql";
const legacyFiles=migrationFiles.slice(0,migrationFiles.indexOf(legacyThrough)+1);
const lockKey=[1927559088,20261016] as const;
const sha256=(value:string)=>createHash("sha256").update(value).digest("hex");
const failure=(code:string):never=>{throw Error("PRODUCTION_MIGRATION_"+code);};
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const statement=(value:string)=>{
 const header=value.match(/^(?:(?:\s*--[^\n]*(?:\n|$))|\s)*/)?.[0]??"";
 const body=value.slice(header.length).trim();
 if(/^BEGIN;/i.test(body)){
  if(!/COMMIT;\s*$/i.test(body))failure("TRANSACTION_WRAPPER_INVALID");
  return header+body.replace(/^BEGIN;\s*/i,"").replace(/\s*COMMIT;\s*$/i,"");
 }
 return value;
};
type Database=Pick<Client,"query">;

async function acquireLock(client:Database){
 const deadline=Date.now()+60_000;
 while(Date.now()<deadline){
  const result=await client.query("SELECT pg_try_advisory_lock($1,$2) AS acquired",[...lockKey]);
  if(result.rows[0]?.acquired===true)return;
  await delay(250);
 }
 failure("LOCK_TIMEOUT");
}

async function assertLegacyBaseline(client:Database){
 const relations=["users","services","subscriptions","purchase_events","subscription_status_history",
  "verified_provider_prices","analytics_actors","analytics_events","admin_roles","admin_sessions",
  "admin_audit","admin_passkeys","admin_passkey_challenges","verified_price_observations",
  "suggested_provider_prices"];
 const found=(await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")).rows;
 const tables=new Set(found.map(row=>row.table_name));
 if(relations.some(name=>!tables.has(name)))failure("LEGACY_BASELINE_INCOMPLETE");
 const columns=(await client.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public'")).rows;
 const names=new Set(columns.map(row=>row.table_name+"."+row.column_name));
 const required=["users.password_hash","users.deletion_requested_at","users.deletion_scheduled_for",
  "subscriptions.country_code","subscriptions.custom_service_name","subscriptions.status_effective_date",
  "verified_provider_prices.plan_identity",
  "admin_roles.webauthn_user_id","admin_roles.enrollment_version","admin_sessions.credential_id",
  "admin_sessions.enrollment_origin","admin_sessions.enrollment_only",
  "admin_passkey_challenges.enrollment_version"];
 if(required.some(name=>!names.has(name)))failure("LEGACY_BASELINE_INCOMPLETE");
 const constraints=(await client.query("SELECT conname FROM pg_constraint WHERE connamespace='public'::regnamespace")).rows;
 const checks=new Set(constraints.map(row=>row.conname));
 if(["subscription_status_history_real_transition_check","verified_provider_prices_verification_check",
  "subscription_service_identity","admin_audit_action_check"].some(name=>!checks.has(name)))failure("LEGACY_BASELINE_INCOMPLETE");
 const indexes=(await client.query("SELECT indexname FROM pg_indexes WHERE schemaname='public'")).rows;
 const indexNames=new Set(indexes.map(row=>row.indexname));
 if(["purchase_events_platform_tx_idx","subscription_status_history_subscription_idx",
  "subscription_status_history_user_idx","users_deletion_scheduled_idx","analytics_events_time_market_idx",
  "analytics_events_actor_idx","analytics_events_expiry_idx","admin_sessions_expiry_idx",
  "admin_audit_expiry_idx","verified_price_observations_identity_idx","admin_roles_webauthn_user_idx",
  "admin_passkeys_user_idx","admin_sessions_credential_idx","admin_passkey_challenges_expiry_idx",
  "suggested_provider_prices_active_scope_idx","suggested_provider_prices_market_idx",
  "verified_provider_prices_plan_identity_idx"].some(name=>!indexNames.has(name)))failure("LEGACY_BASELINE_INCOMPLETE");
 const triggers=(await client.query("SELECT tgname FROM pg_trigger WHERE tgrelid='public.admin_passkeys'::regclass AND NOT tgisinternal")).rows;
 if(!triggers.some(row=>row.tgname==='admin_passkey_replacement'))failure("LEGACY_BASELINE_INCOMPLETE");
 const slugs=(await client.query("SELECT slug FROM services WHERE slug = ANY($1)",[
  ["tencent-video","iqiyi","mango-tv","youku","bilibili","qq-music","netease-cloud-music",
   "kugou-music","baidu-netdisk","wps","viaplay"]
 ])).rows;
 if(slugs.length!==11)failure("LEGACY_BASELINE_INCOMPLETE");
}

export async function assertResearchLinksSchema(client:Database){
 const columns=(await client.query("SELECT column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='price_research_links'")).rows;
 const found=new Map(columns.map(row=>[row.column_name,row]));
 const expected:Record<string,string>={id:"uuid",service_id:"text",url:"text",kind:"text",
  market_scope:"text",market_code:"text",enabled:"boolean",created_at:"timestamp with time zone",
  updated_at:"timestamp with time zone",last_used_at:"timestamp with time zone",last_result:"text"};
 for(const [name,type] of Object.entries(expected))if(found.get(name)?.data_type!==type)failure("RESEARCH_LINK_SCHEMA_INVALID");
 for(const name of ["id","service_id","url","kind","market_scope","enabled","created_at","updated_at"])
  if(found.get(name)?.is_nullable!=="NO")failure("RESEARCH_LINK_SCHEMA_INVALID");
 const indexes=(await client.query("SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='price_research_links'")).rows;
 const unique=indexes.find(row=>row.indexname==="price_research_links_unique_route");
 if(!unique||!String(unique.indexdef).includes("UNIQUE INDEX")||
  !["service_id","url","market_scope","COALESCE"].every(part=>String(unique.indexdef).toUpperCase().includes(part.toUpperCase()))||
  !indexes.some(row=>row.indexname==="price_research_links_service_enabled"))failure("RESEARCH_LINK_SCHEMA_INVALID");
 const audit=(await client.query("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='public.admin_audit'::regclass AND conname='admin_audit_action_check'")).rows;
 if(!String(audit[0]?.definition??"").includes("research_link_changed"))failure("RESEARCH_LINK_SCHEMA_INVALID");
}

export async function runProductionMigrations(client:Database,{root=productionRoot}={}){
 await acquireLock(client);
 let applied=0,skipped=0,baselined=0;
 try{
  await client.query("SET lock_timeout = '10s'");
  await client.query("SET statement_timeout = '120s'");
  await client.query(`CREATE TABLE IF NOT EXISTS production_schema_migrations (
    file_path TEXT PRIMARY KEY,
    sha256 CHAR(64) NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    baseline BOOLEAN NOT NULL DEFAULT false
  )`);
  const files=[schemaFile,...migrationFiles],sources=new Map<string,string>();
  for(const file of files)sources.set(file,await readFile(resolve(root,file),"utf8"));
  const existing=(await client.query("SELECT file_path,sha256 FROM production_schema_migrations")).rows;
  const ledger=new Map(existing.map(row=>[row.file_path,String(row.sha256).trim()]));
  const baseExists=(await client.query("SELECT to_regtype('public.savlivo_plan') IS NOT NULL AS initialized")).rows[0]?.initialized===true;
  if(ledger.size===0&&baseExists){
   await assertLegacyBaseline(client);
   await client.query("BEGIN");
   try{
    for(const file of [schemaFile,...legacyFiles]){
     const hash=sha256(sources.get(file)!);
     await client.query("INSERT INTO production_schema_migrations(file_path,sha256,baseline) VALUES($1,$2,true)",[file,hash]);
     ledger.set(file,hash);baselined++;
    }
    await client.query("COMMIT");
   }catch(error){await client.query("ROLLBACK");throw error;}
  }
  if(baseExists&&!ledger.has(schemaFile))failure("LEDGER_INCOMPLETE");
  for(const file of files){
   const sql=sources.get(file)!,hash=sha256(sql),prior=ledger.get(file);
   if(prior){if(prior!==hash)failure("CHECKSUM_MISMATCH");skipped++;continue;}
   await client.query("BEGIN");
   try{
    await client.query(statement(sql));
    await client.query("INSERT INTO production_schema_migrations(file_path,sha256) VALUES($1,$2)",[file,hash]);
    await client.query("COMMIT");applied++;ledger.set(file,hash);
   }catch(error){await client.query("ROLLBACK");throw error;}
  }
  await assertResearchLinksSchema(client);
  return {applied,skipped,baselined};
 }finally{
  await client.query("SELECT pg_advisory_unlock($1,$2)",[...lockKey]);
 }
}
