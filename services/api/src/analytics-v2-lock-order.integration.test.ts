import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import pg from "pg";

// Opt-in only; uses the already-created, dedicated local 019 rehearsal fixture.
// No schema creation/migrations, production URL fallback, or shared DB access.
const target="postgresql://postgres@127.0.0.1:55459/sv_v2_019_20260910_b";
const enabled=process.env.SAVLIVO_V2_LOCK_REHEARSAL==="1";
test("019 real PostgreSQL user-first observation locking",{skip:!enabled},async t=>{
  assert.equal(process.env.DATABASE_URL,target);
  const url=new URL(target);assert.equal(url.hostname,"127.0.0.1");assert.equal(url.port,"55459");assert.equal(url.pathname,"/sv_v2_019_20260910_b");
  const config={host:"127.0.0.1",port:55459,database:"sv_v2_019_20260910_b",user:"postgres",password:"",connectionTimeoutMillis:2000};
  const clients:pg.Client[]=[],owners:string[]=[];
  async function session(){
    const client=new pg.Client(config);
    // Configuration proven before opening the connection or issuing any SQL.
    assert.equal(config.host,"127.0.0.1");assert.equal(config.port,55459);assert.equal(config.database,"sv_v2_019_20260910_b");
    await client.connect();clients.push(client);
    const identity=(await client.query("SELECT current_database() AS db,inet_server_port() AS port")).rows[0];
    assert.equal(identity.db,config.database);assert.equal(identity.port,5432);
    await client.query("SET lock_timeout='5s'; SET statement_timeout='8s'");return client;
  }
  const control=await session();
  assert.equal((await control.query("SELECT to_regclass('public.analytics_v2_signals') IS NOT NULL AS present")).rows[0].present,true);
  const flags={ANALYTICS_COLLECTION_ENABLED:"true",ANALYTICS_V2_COLLECTION_ENABLED:"true",ANALYTICS_PRIVACY_REVIEWED:"true",ANALYTICS_MAINTENANCE_ENABLED:"true",ANALYTICS_RAW_RETENTION_DAYS:"45",ANALYTICS_AGGREGATE_RETENTION_DAYS:"400"};
  for(const [key,value] of Object.entries(flags)){const old=process.env[key];process.env[key]=value;t.after(()=>{if(old===undefined)delete process.env[key];else process.env[key]=old;});}
  const {pool}=await import("./db.js"),{privateDataPool}=await import("./private-data-db.js");
  const {applyVerifiedPurchase}=await import("./repositories-billing.js");
  async function fixture(){const id=randomUUID();owners.push(id);
    await control.query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,'synthetic-disabled')",[id,`lock-${id}@example.invalid`]);
    await control.query("INSERT INTO entitlements(user_id,plan) VALUES($1,'VIEWER')",[id]);return id;
  }
  const purchase=(userId:string,externalTransactionId=randomUUID())=>({userId,externalTransactionId,platform:"IOS" as const,productId:"synthetic-lock-test",plan:"PREMIUM" as const});
  async function blocked(pid:number){
    const deadline=Date.now()+3000;
    while(Date.now()<deadline){
      const row=(await control.query("SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1",[pid])).rows[0];
      if(row?.wait_event_type==="Lock")return;
      await new Promise(r=>setTimeout(r,10));
    }
    throw new Error("Expected independent PostgreSQL session to block");
  }
  // Scheduling proxy only: ALL SQL and transaction results come from real PostgreSQL.
  // Pause after the actual observation savepoint to reproduce the old interleaving.
  function routedClient(sub:typeof t,client:pg.Client,afterObservation:()=>Promise<void>){
    const sql:string[]=[],codes:string[]=[];let paused=false;
    sub.mock.method(pool,"connect",async()=>({
      query:async(text:string,values?:unknown[])=>{
        sql.push(text);
        try {const result=await client.query(text,values);
          if(text==="RELEASE SAVEPOINT analytics_v2_observation"&&!paused){paused=true;await afterObservation();}
          return result;
        }catch(error){codes.push((error as {code?:string}).code??"unknown");throw error;}
      },release(){}
    } as any));
    return {sql,codes};
  }
  try {
    await t.test("old deadlock schedule: purchase commits, then waiting deletion cascades",async sub=>{
      const owner=await fixture(),a=await session(),b=await session();
      const pid=(await b.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      let deletion:Promise<unknown>|undefined;
      const observed=routedClient(sub,a,async()=>{
        await b.query("BEGIN");
        deletion=b.query("DELETE FROM users WHERE id=$1 RETURNING id",[owner]);
        // Attach immediately so an assertion failure cannot cause an unhandled rejection.
        void deletion.catch(()=>{});
        await blocked(pid);
      });
      try {
        await applyVerifiedPurchase(purchase(owner));
        assert.ok(observed.sql.includes("COMMIT"));assert.deepEqual(observed.codes,[]);
        const deleted=await deletion as pg.QueryResult;assert.equal(deleted.rowCount,1);await b.query("COMMIT");
        for(const table of ["users","entitlements","purchase_events"]){
          const column=table==="users"?"id":"user_id";
          assert.equal((await control.query(`SELECT count(*)::int n FROM ${table} WHERE ${column}=$1`,[owner])).rows[0].n,0);
        }
      }finally{await a.query("ROLLBACK");await b.query("ROLLBACK");}
    });
    for(const locked of ["users","entitlements"] as const)await t.test(`${locked} contention: observation times out, purchase still commits`,async sub=>{
      const owner=await fixture(),a=await session(),b=await session();
      await b.query("BEGIN");
      await b.query(`SELECT ${locked==="users"?"id":"user_id"} FROM ${locked} WHERE ${locked==="users"?"id":"user_id"}=$1 FOR UPDATE`,[owner]);
      const observed=routedClient(sub,a,async()=>{
        if(locked==="entitlements") {
          // The failed observation must have released its earlier user KEY SHARE.
          await b.query("SELECT id FROM users WHERE id=$1 FOR UPDATE NOWAIT",[owner]);
        }
        await b.query("ROLLBACK");
      });
      try {
        await applyVerifiedPurchase(purchase(owner));
        assert.ok(observed.codes.includes("55P03"));assert.equal(observed.codes.includes("40P01"),false);
        assert.ok(observed.sql.includes("ROLLBACK TO SAVEPOINT analytics_v2_observation"));
        assert.ok(observed.sql.includes("COMMIT"));assert.equal(observed.sql.includes("ROLLBACK"),false);
        assert.equal((await control.query("SELECT plan FROM entitlements WHERE user_id=$1",[owner])).rows[0].plan,"PREMIUM");
        assert.equal((await a.query("SHOW lock_timeout")).rows[0].lock_timeout,"5s");
      }finally{await a.query("ROLLBACK");await b.query("ROLLBACK");}
    });
    await t.test("actual repository same-plan retry preserves one transition",async()=>{
      const owner=await fixture(),args=purchase(owner);
      await applyVerifiedPurchase(args);await applyVerifiedPurchase(args);
      let n=0;const deadline=Date.now()+3000;
      while(Date.now()<deadline){
        n=(await control.query("SELECT count(*)::int n FROM analytics_v2_signals s JOIN analytics_v2_actors a ON a.id=s.actor_id WHERE a.user_id=$1 AND s.kind='plan_transition'",[owner])).rows[0].n;
        if(n===1)break;await new Promise(r=>setTimeout(r,10));
      }
      assert.equal(n,1);
      assert.equal((await control.query("SELECT count(*)::int n FROM purchase_events WHERE user_id=$1",[owner])).rows[0].n,1);
    });
  }finally{
    // Only synthetic accounts created by this test are removed. No migration or truncation.
    for(const client of clients)await client.query("ROLLBACK").catch(()=>{});
    for(const owner of owners)await control.query("DELETE FROM users WHERE id=$1",[owner]);
    await pool.end();await privateDataPool.end();
    for(const client of clients)await client.end();
  }
});
