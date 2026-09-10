import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

// Opt-in, synthetic, rollback-only fixture. Run separately in both supported test TZs.
test("019 calendar bindings are independent of Node timezone",{skip:process.env.SAVLIVO_V2_CALENDAR_REHEARSAL!=="1"},async t=>{
  const target="postgresql://postgres@127.0.0.1:55459/sv_v2_019_20260910_b";
  assert.equal(process.env.DATABASE_URL,target);assert.ok(["UTC","America/Los_Angeles"].includes(process.env.TZ??""));
  const config={host:"127.0.0.1",port:55459,database:"sv_v2_019_20260910_b",user:"postgres",password:"",connectionTimeoutMillis:2000};
  assert.equal(config.host,"127.0.0.1");assert.equal(config.port,55459);assert.equal(config.database,"sv_v2_019_20260910_b");
  const client=new pg.Client(config);await client.connect();
  const identity=(await client.query("SELECT current_database() db,inet_server_port() port")).rows[0];
  assert.equal(identity.db,config.database);assert.equal(identity.port,5432);
  await client.query("SET timezone='UTC'; SET lock_timeout='1s'; SET statement_timeout='5s'");
  const {privateDataPool}=await import("./private-data-db.js");
  const {globalReport,maintainV2,segmentReport,months}=await import("./analytics-v2.js");
  t.mock.timers.enable({apis:["Date"],now:new Date("2026-09-10T14:15:00Z")});
  const flags={ANALYTICS_V2_COLLECTION_ENABLED:"true",ANALYTICS_COLLECTION_ENABLED:"true",ANALYTICS_PRIVACY_REVIEWED:"true",ANALYTICS_MAINTENANCE_ENABLED:"true",ANALYTICS_RAW_RETENTION_DAYS:"45",ANALYTICS_AGGREGATE_RETENTION_DAYS:"400"};
  for(const [key,value] of Object.entries(flags)){const old=process.env[key];process.env[key]=value;t.after(()=>{if(old===undefined)delete process.env[key];else process.env[key]=old;});}
  // Real SQL/results; private cleanup's nested transaction is isolated by a savepoint.
  const seen:Array<{sql:string;values:any[]}>=[];
  t.mock.method(privateDataPool,"query",async(sql:string,values:any[]=[])=>{
    seen.push({sql,values});
    if(sql.includes("notification_endpoints")){
      await client.query("SAVEPOINT optional_push");
      try{return await client.query(sql,values);}catch(error){await client.query("ROLLBACK TO SAVEPOINT optional_push");throw error;}
      finally{await client.query("RELEASE SAVEPOINT optional_push");}
    }
    return client.query(sql,values);
  });
  t.mock.method(privateDataPool,"connect",async()=>({query:(sql:string,values:any[])=>client.query(
    sql.startsWith("BEGIN")?"SAVEPOINT orphan_cleanup":sql==="COMMIT"?"RELEASE SAVEPOINT orphan_cleanup":sql==="ROLLBACK"?"ROLLBACK TO SAVEPOINT orphan_cleanup":sql,values),release(){}} as any));
  try{
    for(const [range,start,end,last] of [["7d","2026-09-03","2026-09-10","2026-09-09"],["30d","2026-08-11","2026-09-10","2026-09-09"],["90d","2026-06-12","2026-09-10","2026-09-09"],["12m","2025-09-01","2026-09-01","2026-08-31"]])await t.test(range,async()=>{
      await client.query("BEGIN");
      try{
        await client.query("DELETE FROM analytics_v2_snapshots; DELETE FROM analytics_v2_flows");
        await client.query("INSERT INTO analytics_v2_snapshots VALUES($1::date,$2::timestamptz,333,333,0,0,0,now()+interval '400 days')",[last,last+"T00:00:00Z"]);
        await client.query("INSERT INTO analytics_v2_flows VALUES($1::date,'no_result',7,now()+interval '400 days')",[last]);
        seen.length=0;const result=await globalReport(range);
        for(const q of seen.filter(q=>q.sql.includes("day >= $1::date"))){
          assert.deepEqual(q.values,[start,end]);
          assert.deepEqual((await client.query("SELECT to_char($1::date,'YYYY-MM-DD') AS start,to_char($2::date,'YYYY-MM-DD') AS end",q.values)).rows[0],{start,end});
        }
        assert.equal((result.history.at(-1)!.plans as any).total,333);assert.equal(result.history.at(-1)!.flows?.no_result,7);
      }finally{await client.query("ROLLBACK");}
    });
    await t.test("closed-month coverage, insertion and lookup use the same UTC calendar month",async()=>{
      await client.query("BEGIN");
      try{
        await client.query("DELETE FROM analytics_v2_snapshots; DELETE FROM analytics_v2_service_months");
        await client.query(`INSERT INTO analytics_v2_snapshots SELECT day::date,day,0,0,0,0,0,now()+interval '400 days'
          FROM generate_series('2026-07-31T00:00:00Z'::timestamptz,'2026-08-31T00:00:00Z'::timestamptz,interval '1 day') day`);
        seen.length=0;await maintainV2(new Date("2026-09-02T12:00:00Z"));
        assert.deepEqual(seen.find(q=>q.sql.includes("AS started_before"))!.values,["2026-08-01","2026-09-01"]);
        assert.equal(seen.find(q=>q.sql.includes("service_months(month"))!.values[0],"2026-08-01");
        assert.ok(seen.find(q=>q.sql.includes("count(DISTINCT"))!.values.every(v=>v instanceof Date));
        assert.deepEqual((await client.query("SELECT to_char(month,'YYYY-MM-DD') AS month FROM analytics_v2_service_months")).rows,[{month:"2026-08-01"}]);
        assert.equal(months()[0],"2026-08");assert.equal((await segmentReport("top-services","2026-08")).state,"available");
      }finally{await client.query("ROLLBACK");}
    });
  }finally{await client.query("ROLLBACK");await client.end();await privateDataPool.end();}
});
