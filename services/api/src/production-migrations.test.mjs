import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {migrationFiles,productionRoot,runProductionMigrations} from './production-migrations.ts';
import {researchLinksRequest} from './v2-operations/research-links.mjs';

const expectedColumns={id:'uuid',service_id:'text',url:'text',kind:'text',market_scope:'text',
 market_code:'text',enabled:'boolean',created_at:'timestamp with time zone',
 updated_at:'timestamp with time zone',last_used_at:'timestamp with time zone',last_result:'text'};
const requiredTables=['users','services','subscriptions','purchase_events','subscription_status_history',
 'verified_provider_prices','analytics_actors','analytics_events','admin_roles','admin_sessions',
 'admin_audit','admin_passkeys','admin_passkey_challenges','verified_price_observations','suggested_provider_prices'];
const requiredColumns=['users.password_hash','users.deletion_requested_at','users.deletion_scheduled_for',
 'subscriptions.country_code','subscriptions.custom_service_name','subscriptions.status_effective_date',
 'verified_provider_prices.plan_identity',
 'admin_roles.webauthn_user_id','admin_roles.enrollment_version','admin_sessions.credential_id',
 'admin_sessions.enrollment_origin','admin_sessions.enrollment_only','admin_passkey_challenges.enrollment_version'];
const requiredConstraints=['subscription_status_history_real_transition_check','verified_provider_prices_verification_check',
 'subscription_service_identity','admin_audit_action_check'];
const requiredIndexes=['purchase_events_platform_tx_idx','subscription_status_history_subscription_idx',
 'subscription_status_history_user_idx','users_deletion_scheduled_idx','analytics_events_time_market_idx',
 'analytics_events_actor_idx','analytics_events_expiry_idx','admin_sessions_expiry_idx','admin_audit_expiry_idx',
 'verified_price_observations_identity_idx','admin_roles_webauthn_user_idx','admin_passkeys_user_idx',
 'admin_sessions_credential_idx','admin_passkey_challenges_expiry_idx',
 'suggested_provider_prices_active_scope_idx','suggested_provider_prices_market_idx',
 'verified_provider_prices_plan_identity_idx'];

class MigrationDatabase {
 constructor({legacy=false}={}){this.ledger=new Map();this.base=legacy;this.legacy=legacy;this.links=false;this.linkRows=[];this.queries=[];this.locked=false;this.failOn=null;}
 async query(sql,args=[]){
  this.queries.push({sql,args});const text=sql.trim();
  if(text.startsWith('SELECT pg_try_advisory_lock')){if(this.locked)return {rows:[{acquired:false}]};this.locked=true;return {rows:[{acquired:true}]};}
  if(text.startsWith('SELECT pg_advisory_unlock')){this.locked=false;return {rows:[{pg_advisory_unlock:true}]};}
  if(text==='BEGIN'){this.save={ledger:new Map(this.ledger),base:this.base,links:this.links};return {rows:[]};}
  if(text==='COMMIT'){this.save=null;return {rows:[]};}
  if(text==='ROLLBACK'){Object.assign(this,this.save);this.save=null;return {rows:[]};}
  if(text.startsWith('SET ')||text.startsWith('CREATE TABLE IF NOT EXISTS production_schema_migrations'))return {rows:[]};
  if(text.startsWith('SELECT file_path,sha256 FROM production_schema_migrations'))return {rows:[...this.ledger].map(([file_path,sha256])=>({file_path,sha256}))};
  if(text.startsWith("SELECT to_regtype('public.savlivo_plan')"))return {rows:[{initialized:this.base}]};
  if(text.startsWith("SELECT table_name FROM information_schema.tables"))return {rows:(this.legacy?requiredTables:[]).map(table_name=>({table_name}))};
  if(text.startsWith("SELECT table_name,column_name FROM information_schema.columns"))return {rows:(this.legacy?requiredColumns:[]).map(name=>({table_name:name.split('.')[0],column_name:name.split('.')[1]}))};
  if(text.startsWith("SELECT conname FROM pg_constraint"))return {rows:(this.legacy?requiredConstraints:[]).map(conname=>({conname}))};
  if(text.startsWith("SELECT indexname FROM pg_indexes"))return {rows:(this.legacy?requiredIndexes:[]).map(indexname=>({indexname}))};
  if(text.startsWith('SELECT tgname FROM pg_trigger'))return {rows:this.legacy?[{tgname:'admin_passkey_replacement'}]:[]};
  if(text.startsWith('SELECT slug FROM services'))return {rows:(this.legacy?args[0]:[]).map(slug=>({slug}))};
  if(text.startsWith('INSERT INTO production_schema_migrations')){this.ledger.set(args[0],args[1]);return {rows:[]};}
  if(text.startsWith("SELECT column_name,data_type,is_nullable FROM information_schema.columns"))return {rows:this.links?Object.entries(expectedColumns).map(([column_name,data_type])=>({column_name,data_type,is_nullable:['market_code','last_used_at','last_result'].includes(column_name)?'YES':'NO'})):[]};
  if(text.startsWith('SELECT indexname,indexdef FROM pg_indexes'))return {rows:this.links?[
   {indexname:'price_research_links_unique_route',indexdef:'CREATE UNIQUE INDEX price_research_links_unique_route ON public.price_research_links (service_id, url, market_scope, COALESCE(market_code, \'\'))'},
   {indexname:'price_research_links_service_enabled',indexdef:'CREATE INDEX price_research_links_service_enabled ON public.price_research_links (service_id, enabled, market_scope, market_code)'}]:[]};
  if(text.startsWith('SELECT pg_get_constraintdef'))return {rows:this.links?[{definition:"CHECK (action IN ('research_link_changed'))"}]:[]};
  if(text.startsWith('SELECT id,service_id,url,kind,market_scope,market_code,enabled,created_at,updated_at,last_used_at,last_result FROM price_research_links')){
   if(!this.links)throw Error('relation price_research_links does not exist');
   return {rows:this.linkRows.filter(row=>row.service_id===args[0])};
  }
  if(this.failOn&&text.includes(this.failOn))throw Error('synthetic database failure');
  if(text.includes('CREATE TYPE savlivo_plan'))this.base=true;
  if(text.includes('CREATE TABLE IF NOT EXISTS price_research_links'))this.links=true;
  return {rows:[]};
 }
}

test('single migration list includes 021 with complete Research links columns and duplicate index',()=>{
 assert.equal(migrationFiles.filter(file=>file.endsWith('021_price_research_links.sql')).length,1);
 const sql=fs.readFileSync(productionRoot+'db/migrations/021_price_research_links.sql','utf8');
 for(const name of Object.keys(expectedColumns))assert.match(sql,new RegExp('\\b'+name+'\\b'));
 assert.match(sql,/CREATE UNIQUE INDEX IF NOT EXISTS price_research_links_unique_route/);
 assert.match(sql,/\(service_id,url,market_scope,coalesce\(market_code,''\)\)/);
 assert.match(sql,/research_link_changed/);
 assert.doesNotMatch(sql,/DROP TABLE|TRUNCATE|DELETE FROM price_research_links/i);
});

test('022 adds only per-service market exclusions and preserves pricing/history tables',()=>{
 assert.equal(migrationFiles.filter(file=>file.endsWith('022_price_research_market_exclusions.sql')).length,1);
 const sql=fs.readFileSync(productionRoot+'db/migrations/022_price_research_market_exclusions.sql','utf8');
 assert.match(sql,/CREATE TABLE IF NOT EXISTS price_research_market_exclusions/);
 assert.match(sql,/PRIMARY KEY \(service_id,market_code\)/);
 assert.match(sql,/price_research_market_exclusions_market_idx/);
 assert.match(sql,/market_exclusion_changed/);
 assert.doesNotMatch(sql,/\b(?:DELETE|TRUNCATE|DROP TABLE|UPDATE)\b[^;]*(?:verified_provider_prices|suggested_provider_prices|verified_price_observations)/i);
});

test('023 adds series metadata without backfilling or changing existing prices and observations',()=>{
 assert.equal(migrationFiles.filter(file=>file.endsWith('023_durable_verified_price_history.sql')).length,1);
 const sql=fs.readFileSync(productionRoot+'db/migrations/023_durable_verified_price_history.sql','utf8');
 for(const field of ['history_series_id','plan_identity','billing_interval','history_event_kind','provider_effective_at'])
  assert.match(sql,new RegExp('\\b'+field+'\\b'));
 assert.match(sql,/verified_price_observations_series_time_unique/);
 assert.doesNotMatch(sql,/\b(?:DELETE|TRUNCATE|DROP TABLE|UPDATE|INSERT INTO)\b/i);
});

test('024 adds only the bounded Price Analytics service-series read index',()=>{
 assert.equal(migrationFiles.filter(file=>file.endsWith('024_price_analytics_history_index.sql')).length,1);
 const sql=fs.readFileSync(productionRoot+'db/migrations/024_price_analytics_history_index.sql','utf8');
 assert.match(sql,/verified_price_observations_service_series_time_idx/);
 assert.match(sql,/\(service_slug,history_series_id,provider_verified_at,id\)/);
 assert.doesNotMatch(sql,/\b(?:DELETE|TRUNCATE|DROP|UPDATE|INSERT)\b/i);
});

test('025 adds one-bootstrap integrity and event-time read index without touching price rows',()=>{
 assert.equal(migrationFiles.filter(file=>file.endsWith('025_verified_bootstrap_integrity.sql')).length,1);
 const sql=fs.readFileSync(productionRoot+'db/migrations/025_verified_bootstrap_integrity.sql','utf8');
 assert.match(sql,/CREATE UNIQUE INDEX IF NOT EXISTS verified_price_observations_one_bootstrap_per_series/);
 assert.match(sql,/history_event_kind='BOOTSTRAP_BASELINE'/);
 assert.match(sql,/THEN observed_at ELSE provider_verified_at END/);
 assert.doesNotMatch(sql,/\b(?:DELETE|TRUNCATE|DROP|UPDATE|INSERT)\b/i);
});

test('fresh and repeated startup apply each migration once; Research links GET uses migrated shape',async()=>{
 const db=new MigrationDatabase(),first=await runProductionMigrations(db),second=await runProductionMigrations(db);
 assert.equal(first.applied,migrationFiles.length+1);assert.equal(second.applied,0);assert.equal(second.skipped,migrationFiles.length+1);
 assert.equal(db.links,true);assert.equal(db.ledger.size,migrationFiles.length+1);
 assert.equal(db.queries.filter(row=>row.sql.includes('CREATE TABLE IF NOT EXISTS price_research_links')).length,1);
 for(const fragment of ['CREATE TABLE IF NOT EXISTS analytics_actors','CREATE TABLE IF NOT EXISTS price_research_links']){
  const body=db.queries.find(row=>row.sql.includes(fragment))?.sql??'';
  assert.doesNotMatch(body,/^\s*(?:--[^\n]*\n\s*)*BEGIN;/i);
  assert.doesNotMatch(body,/COMMIT;\s*$/i);
 }
 db.linkRows.push({id:'11111111-1111-4111-8111-111111111111',service_id:'streamco',url:'https://streamco.example/pricing',
  kind:'DIRECT_SOURCE',market_scope:'GLOBAL',market_code:null,enabled:true,created_at:new Date(),updated_at:new Date(),last_used_at:null,last_result:null});
 const ops={config:{read:true,control:true,client:db},priceResearchTargeting:async()=>({services:[{serviceId:'streamco',selectable:true}]})};
 const result=await researchLinksRequest({method:'GET',serviceId:'streamco',ops,actor:'admin',client:db});
 assert.equal(result.rows[0].url,'https://streamco.example/pricing');assert.equal(result.rows[0].marketScope,'GLOBAL');
});

test('verified legacy schema is baselined without replaying old data migrations, then additive migrations run',async()=>{
 const db=new MigrationDatabase({legacy:true}),result=await runProductionMigrations(db);
 assert.equal(result.baselined,15);assert.equal(result.applied,8);assert.equal(db.links,true);
 assert.equal(db.queries.some(row=>row.sql.includes("DO UPDATE SET\n  name = EXCLUDED.name")),false);
 assert.equal((await runProductionMigrations(db)).applied,0);
});

test('concurrent startup attempts serialize on the advisory lock and share one ledger',async()=>{
 const db=new MigrationDatabase(),results=await Promise.all([runProductionMigrations(db),runProductionMigrations(db)]);
 assert.deepEqual(results.map(result=>result.applied).sort((a,b)=>a-b),[0,migrationFiles.length+1]);
 assert.equal(db.queries.filter(row=>row.sql.includes('CREATE TABLE IF NOT EXISTS price_research_links')).length,1);
 assert.equal(db.locked,false);
});

test('incomplete legacy baseline and SQL failure fail closed before 021 is marked applied',async()=>{
 const missing=new MigrationDatabase({legacy:true});missing.legacy=false;
 await assert.rejects(runProductionMigrations(missing),/PRODUCTION_MIGRATION_LEGACY_BASELINE_INCOMPLETE/);
 assert.equal(missing.ledger.size,0);assert.equal(missing.locked,false);
 const db=new MigrationDatabase();db.failOn='CREATE TABLE IF NOT EXISTS price_research_links';
 await assert.rejects(runProductionMigrations(db),/synthetic database failure/);
 assert.equal(db.ledger.has('db/migrations/021_price_research_links.sql'),false);assert.equal(db.links,false);assert.equal(db.locked,false);
});

test('changed migration bytes fail checksum validation instead of replaying a committed file',async()=>{
 const db=new MigrationDatabase();await runProductionMigrations(db);
 db.ledger.set('db/migrations/021_price_research_links.sql','0'.repeat(64));
 await assert.rejects(runProductionMigrations(db),/PRODUCTION_MIGRATION_CHECKSUM_MISMATCH/);
 assert.equal(db.locked,false);
});
