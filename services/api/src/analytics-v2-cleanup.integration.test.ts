import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import pg from "pg";

test("019 retention classes isolate failures and recover",{skip:process.env.SAVLIVO_V2_CLEANUP_REHEARSAL!=="1"},async t=>{
  assert.equal(process.env.DATABASE_URL,"postgresql://postgres@127.0.0.1:55459/sv_v2_019_20260910_b");
  const config={host:"127.0.0.1",port:55459,database:"sv_v2_019_20260910_b",user:"postgres",password:"",connectionTimeoutMillis:2000};
  const clients:pg.Client[]=[],owners=[randomUUID(),randomUUID()];
  async function session(){
    assert.equal(config.host,"127.0.0.1");assert.equal(config.port,55459);assert.equal(config.database,"sv_v2_019_20260910_b");
    const c=new pg.Client(config);await c.connect();clients.push(c);
    const identity=(await c.query("SELECT current_database() db,inet_server_port() port")).rows[0];
    assert.equal(identity.db,config.database);assert.equal(identity.port,5432);
    await c.query("SET timezone='UTC';SET statement_timeout='5s';SET lock_timeout='100ms'");return c;
  }
  const control=await session(),worker=await session(),locker=await session();
  const {privateDataPool}=await import("./private-data-db.js"),{maintainV2}=await import("./analytics-v2.js");
  for(const [key,value] of Object.entries({ANALYTICS_MAINTENANCE_ENABLED:"true",ANALYTICS_V2_COLLECTION_ENABLED:"false"})){
    const old=process.env[key];process.env[key]=value;t.after(()=>{if(old===undefined)delete process.env[key];else process.env[key]=old;});
  }
  const sqls:string[]=[],codes:string[]=[];let releases=0;
  // Route to real independent PostgreSQL sessions; no fabricated query results.
  t.mock.method(privateDataPool,"query",async(sql:string,values:any[])=>{
    sqls.push(sql);try{return await worker.query(sql,values);}catch(error){codes.push((error as any).code);throw error;}
  });
  t.mock.method(privateDataPool,"connect",async()=>({query:async(sql:string,values:any[])=>{sqls.push(sql);return worker.query(sql,values);},release(){releases++;}} as any));
  const expired=randomUUID(),live=randomUUID();let actor:string,orphan:string;
  async function state(){return (await control.query(`SELECT
    (SELECT count(*)::int FROM analytics_v2_signals WHERE actor_id=$1 AND expires_at<=now()) expired,
    (SELECT count(*)::int FROM analytics_v2_signals WHERE id=$2) live,
    (SELECT count(*)::int FROM analytics_v2_actors WHERE id=$3) orphan,
    (SELECT count(*)::int FROM users WHERE id=ANY($4::uuid[])) customers,
    (SELECT count(*)::int FROM analytics_v2_snapshots WHERE day='1989-01-01') snapshot,
    (SELECT count(*)::int FROM analytics_v2_flows WHERE day='1989-01-01') flow,
    (SELECT count(*)::int FROM analytics_v2_service_months WHERE month='1989-01-01') AS month,
    (SELECT count(*)::int FROM analytics_v2_snapshots WHERE day='1989-02-01') live_snapshot,
    (SELECT count(*)::int FROM analytics_v2_flows WHERE day='1989-02-01') live_flow,
    (SELECT count(*)::int FROM analytics_v2_service_months WHERE month='1989-02-01') live_month`,[actor,live,orphan,owners])).rows[0];}
  try{
    for(const owner of owners)await control.query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,'synthetic-disabled')",[owner,owner+'@example.invalid']);
    actor=(await control.query("INSERT INTO analytics_v2_actors(user_id) VALUES($1) RETURNING id",[owners[0]])).rows[0].id;
    orphan=(await control.query("INSERT INTO analytics_v2_actors(user_id) VALUES($1) RETURNING id",[owners[1]])).rows[0].id;
    await control.query("INSERT INTO analytics_v2_signals VALUES($1,$2,'no_result',NULL,NULL,NULL,now()-interval '46 days',now()-interval '1 day'),($3,$2,'no_result',NULL,NULL,NULL,now(),now()+interval '45 days')",[expired,actor,live]);
    for(const [day,expiry] of [["1989-01-01","-1 day"],["1989-02-01","400 days"]]){
      await control.query("INSERT INTO analytics_v2_snapshots VALUES($1::date,$2::timestamptz,0,0,0,0,0,now()+$3::interval)",[day,day+'T00:00:00Z',expiry]);
      await control.query("INSERT INTO analytics_v2_flows VALUES($1::date,'no_result',1,now()+$2::interval)",[day,expiry]);
      await control.query("INSERT INTO analytics_v2_service_months(month,cells,expires_at) VALUES($1::date,'[]',now()+$2::interval)",[day,expiry]);
    }
    await t.test("locked signal fails but all independent classes succeed; next invocation recovers",async()=>{
      await locker.query("BEGIN");await locker.query("SELECT id FROM analytics_v2_signals WHERE id=$1 FOR UPDATE",[expired]);
      try{
        await assert.rejects(maintainV2(),/^Error: Analytics v2 cleanup incomplete: analytics_v2_signals$/);
        assert.deepEqual(codes,["55P03"]);assert.equal(releases,1);
        assert.equal(sqls.filter(sql=>sql.startsWith("DELETE")).length,5);assert.ok(sqls.includes("COMMIT"));
        assert.deepEqual(await state(),{expired:1,live:1,orphan:0,customers:2,snapshot:0,flow:0,month:0,live_snapshot:1,live_flow:1,live_month:1});
        assert.equal((await worker.query("SELECT 1 AS ok")).rows[0].ok,1);
      }finally{await locker.query("ROLLBACK");}
      await maintainV2();assert.equal((await state()).expired,0);assert.equal(releases,2);
    });
    await t.test("5001 expired rows converge in bounded batches and preserve nonexpired rows",async()=>{
      // Other rehearsal fixtures must not introduce competing expired candidates.
      assert.equal((await control.query("SELECT count(*)::int n FROM analytics_v2_signals WHERE expires_at<=now()")).rows[0].n,0);
      await control.query("INSERT INTO analytics_v2_signals SELECT gen_random_uuid(),$1,'no_result',NULL,NULL,NULL,now()-interval '46 days',now()-interval '1 day' FROM generate_series(1,5001)",[actor]);
      await maintainV2();assert.equal((await state()).expired,1);
      await maintainV2();const done=await state();assert.deepEqual(done,{expired:0,live:1,orphan:0,customers:2,snapshot:0,flow:0,month:0,live_snapshot:1,live_flow:1,live_month:1});
      await maintainV2();assert.deepEqual(await state(),done);assert.equal(releases,5);
      assert.equal((await control.query("SELECT count(*)::int n FROM analytics_v2_signals s LEFT JOIN analytics_v2_actors a ON a.id=s.actor_id WHERE a.id IS NULL")).rows[0].n,0);
    });
  }finally{
    for(const c of clients)await c.query("ROLLBACK").catch(()=>{});
    await control.query("DELETE FROM users WHERE id=ANY($1::uuid[])",[owners]);
    for(const [table,column] of [["analytics_v2_snapshots","day"],["analytics_v2_flows","day"],["analytics_v2_service_months","month"]])await control.query(`DELETE FROM ${table} WHERE ${column} IN ('1989-01-01','1989-02-01')`);
    for(const c of clients)await c.end();await privateDataPool.end();
  }
});
