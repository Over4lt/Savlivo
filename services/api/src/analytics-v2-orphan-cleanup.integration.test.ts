import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import pg from "pg";

// Explicit opt-in to the dedicated synthetic 019 fixture only; never runs migrations.
const target="postgresql://postgres@127.0.0.1:55459/sv_v2_019_20260910_b";
test("019 real PostgreSQL orphan cleanup concurrency",{skip:process.env.SAVLIVO_V2_ORPHAN_REHEARSAL!=="1"},async t=>{
  assert.equal(process.env.DATABASE_URL,target);
  const config={host:"127.0.0.1",port:55459,database:"sv_v2_019_20260910_b",user:"postgres",password:"",connectionTimeoutMillis:2000};
  const clients:pg.Client[]=[],owners:string[]=[];
  async function session(){
    assert.equal(config.host,"127.0.0.1");assert.equal(config.port,55459);assert.equal(config.database,"sv_v2_019_20260910_b");
    const client=new pg.Client(config);await client.connect();clients.push(client);
    const identity=(await client.query("SELECT current_database() AS db,inet_server_port() AS port")).rows[0];
    assert.equal(identity.db,config.database);assert.equal(identity.port,5432);
    await client.query("SET lock_timeout='2s'; SET statement_timeout='3s'");return client;
  }
  const control=await session();
  assert.equal((await control.query("SELECT to_regclass('public.analytics_v2_signals') IS NOT NULL AS present")).rows[0].present,true);
  const flags={ANALYTICS_COLLECTION_ENABLED:"true",ANALYTICS_V2_COLLECTION_ENABLED:"true",ANALYTICS_PRIVACY_REVIEWED:"true",ANALYTICS_MAINTENANCE_ENABLED:"true",ANALYTICS_RAW_RETENTION_DAYS:"45",ANALYTICS_AGGREGATE_RETENTION_DAYS:"400"};
  for(const [key,value] of Object.entries(flags)){const old=process.env[key];process.env[key]=value;t.after(()=>{if(old===undefined)delete process.env[key];else process.env[key]=old;});}
  const {privateDataPool}=await import("./private-data-db.js");
  const {writeSignal,cleanupV2OrphanActors}=await import("./analytics-v2.js");
  async function fixture(){const owner=randomUUID();owners.push(owner);
    await control.query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,'synthetic-disabled')",[owner,`orphan-${owner}@example.invalid`]);
    const actor=(await control.query("INSERT INTO analytics_v2_actors(user_id) VALUES($1) RETURNING id",[owner])).rows[0].id;
    return {owner,actor};
  }
  async function flow(){return Number((await control.query("SELECT coalesce(sum(count),0) AS n FROM analytics_v2_flows WHERE metric='no_result'")).rows[0].n);}
  async function survives(owner:string,id:string,before:number){
    assert.equal((await control.query("SELECT count(*)::int n FROM users WHERE id=$1",[owner])).rows[0].n,1);
    assert.equal((await control.query("SELECT count(*)::int n FROM analytics_v2_actors WHERE user_id=$1",[owner])).rows[0].n,1);
    assert.equal((await control.query("SELECT count(*)::int n FROM analytics_v2_signals s JOIN analytics_v2_actors a ON a.id=s.actor_id WHERE s.id=$1 AND a.user_id=$2",[id,owner])).rows[0].n,1);
    assert.equal(await flow(),before+1);
  }
  // Scheduling only: every query executes against real PostgreSQL, no fabricated results.
  function route(sub:typeof t,a:pg.Client,b:pg.Client,afterLock:()=>Promise<void>=async()=>{}){
    sub.mock.method(privateDataPool,"query",(sql:string,values?:unknown[])=>a.query(sql,values));
    sub.mock.method(privateDataPool,"connect",async()=>({query:async(sql:string,values?:unknown[])=>{
      const result=await b.query(sql,values);if(sql.startsWith("SELECT a.id"))await afterLock();return result;
    },release(){}} as any));
  }
  async function waitForBlock(pid:number,blocker:number){
    const deadline=Date.now()+1500;
    while(Date.now()<deadline){
      if((await control.query("SELECT $2::int=ANY(pg_blocking_pids($1)) AS blocked",[pid,blocker])).rows[0].blocked)return;
      await new Promise(r=>setTimeout(r,10));
    }
    throw new Error("Expected independent writer session to wait on cleanup actor lock");
  }
  try {
    await t.test("writer first: locked actor skipped without waiting, committed signal and flow survive",async sub=>{
      const {owner,actor}=await fixture(),a=await session(),b=await session(),id=randomUUID(),before=await flow();
      route(sub,a,b);await a.query("BEGIN");
      try {
        await writeSignal(owner,{kind:"no_result"},id,new Date());
        // If SKIP LOCKED regresses, the cleanup must fail rather than hang until writer commit.
        await b.query("SET lock_timeout='100ms'");
        await cleanupV2OrphanActors();
        assert.equal((await control.query("SELECT count(*)::int n FROM analytics_v2_actors WHERE id=$1",[actor])).rows[0].n,1);
        await a.query("COMMIT");await survives(owner,id,before);
        await cleanupV2OrphanActors();await survives(owner,id,before);
      }finally{await a.query("ROLLBACK");await b.query("ROLLBACK");}
    });
    await t.test("cleanup first: waiting upsert recreates deleted orphan and commits exactly one signal/flow",async sub=>{
      const {owner,actor}=await fixture(),a=await session(),b=await session(),id=randomUUID(),before=await flow();
      const pid=(await a.query("SELECT pg_backend_pid() pid")).rows[0].pid,blocker=(await b.query("SELECT pg_backend_pid() pid")).rows[0].pid;
      let writer:Promise<unknown>|undefined;
      route(sub,a,b,async()=>{
        writer=writeSignal(owner,{kind:"no_result"},id,new Date());void writer.catch(()=>{});
        await waitForBlock(pid,blocker);
      });
      try {
        await a.query("BEGIN");await cleanupV2OrphanActors();await writer;await a.query("COMMIT");
        assert.equal((await control.query("SELECT count(*)::int n FROM analytics_v2_actors WHERE id=$1",[actor])).rows[0].n,0);
        await survives(owner,id,before);
      }finally{await b.query("ROLLBACK");await writer?.catch(()=>{});await a.query("ROLLBACK");}
    });
    await t.test("bounded cleanup removes at most 5000 genuine orphans and never their customer rows",async sub=>{
      const a=await session(),b=await session();route(sub,a,b);
      const batch=Array.from({length:5001},()=>randomUUID());owners.push(...batch);
      await control.query("INSERT INTO users(id,email,password_hash) SELECT id,id::text||'@example.invalid','synthetic-disabled' FROM unnest($1::uuid[]) id",[batch]);
      await control.query("INSERT INTO analytics_v2_actors(user_id) SELECT unnest($1::uuid[])",[batch]);
      const deleted=await cleanupV2OrphanActors();assert.equal(deleted,5000);
      const remaining=(await control.query("SELECT count(*)::int n FROM analytics_v2_actors WHERE user_id=ANY($1::uuid[])",[batch])).rows[0].n;
      assert.ok(remaining>=1);assert.ok(remaining<5001);
      assert.equal((await control.query("SELECT count(*)::int n FROM users WHERE id=ANY($1::uuid[])",[batch])).rows[0].n,5001);
      await cleanupV2OrphanActors();
      assert.equal((await control.query("SELECT count(*)::int n FROM analytics_v2_actors WHERE user_id=ANY($1::uuid[])",[batch])).rows[0].n,0);
    });
  }finally{
    for(const client of clients)await client.query("ROLLBACK").catch(()=>{});
    await control.query("DELETE FROM users WHERE id=ANY($1::uuid[])",[owners]);
    await privateDataPool.end();for(const client of clients)await client.end();
  }
});
