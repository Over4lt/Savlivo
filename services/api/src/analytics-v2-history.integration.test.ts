import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

// Dedicated disposable fixture only. Every persisted change rolls back; no migrations.
test("019 finalized history survives live catalog changes",{skip:process.env.SAVLIVO_V2_HISTORY_REHEARSAL!=="1"},async t=>{
  assert.equal(process.env.DATABASE_URL,"postgresql://postgres@127.0.0.1:55459/sv_v2_019_20260910_b");
  const config={host:"127.0.0.1",port:55459,database:"sv_v2_019_20260910_b",user:"postgres",password:"",connectionTimeoutMillis:2000};
  assert.equal(config.host,"127.0.0.1");assert.equal(config.port,55459);assert.equal(config.database,"sv_v2_019_20260910_b");
  const client=new pg.Client(config);await client.connect();
  const identity=(await client.query("SELECT current_database() db,inet_server_port() port")).rows[0];
  assert.equal(identity.db,config.database);assert.equal(identity.port,5432);
  await client.query("SET timezone='UTC'; SET lock_timeout='1s'; SET statement_timeout='5s'");
  const {privateDataPool}=await import("./private-data-db.js");
  const {segmentReport}=await import("./analytics-v2.js");
  const {serviceCatalog:readonlyCatalog}=await import("../../../packages/contracts/src/catalog.js");
  // Test-only mutation models a later deployed catalog; always restored in finally.
  const serviceCatalog=readonlyCatalog as Array<(typeof readonlyCatalog)[number]>;
  const original=[...serviceCatalog];
  t.mock.method(privateDataPool,"query",(sql:string,values:any[])=>client.query(sql,values));
  const cells=[{service:"apple-tv-plus",state:"available",contributors:18},{service:"netflix",state:"suppressed"}];
  try{
    await client.query("BEGIN");await client.query("DELETE FROM analytics_v2_service_months WHERE month='2026-08-01'");
    // Same finalized JSON and first-winner insert semantics as the application writer.
    await client.query(`INSERT INTO analytics_v2_service_months(month,cells,expires_at) VALUES($1,$2::jsonb,$1::date+interval '1 month 400 days')
      ON CONFLICT(month) DO NOTHING`,["2026-08-01",JSON.stringify(cells)]);
    const stored=async()=> (await client.query("SELECT cells::text AS cells FROM analytics_v2_service_months WHERE month='2026-08-01'")).rows[0].cells;
    const bytes=await stored(),baseline=await segmentReport("top-services","2026-08");
    assert.deepEqual((baseline as any).cells,cells);
    await t.test("removal, restoration and repeated reads retain the complete finalized report",async()=>{
      const i=serviceCatalog.findIndex(s=>s.slug==="apple-tv-plus");assert.ok(i>=0);const removed=serviceCatalog.splice(i,1)[0];
      try{assert.deepEqual(await segmentReport("top-services","2026-08"),baseline);}finally{serviceCatalog.splice(i,0,removed);}
      assert.deepEqual(await segmentReport("top-services","2026-08"),baseline);assert.equal(await stored(),bytes);
    });
    await t.test("new catalog identity and renamed live label cannot rewrite historical membership or identity",async()=>{
      const i=serviceCatalog.findIndex(s=>s.slug==="apple-tv-plus"),old=serviceCatalog[i];
      serviceCatalog[i]={...old,name:"Synthetic renamed display label"};
      serviceCatalog.push({...old,slug:"synthetic-new-after-finalization"});
      try{assert.deepEqual(await segmentReport("top-services","2026-08"),baseline);}finally{serviceCatalog.pop();serviceCatalog[i]=old;}
      assert.equal(await stored(),bytes);
    });
    await t.test("malformed stored cells fail closed; rollback preserves original bytes",async()=>{
      for(const invalid of [[{...cells[0],email:"SECRET"}],[{service:"netflix",state:"suppressed",contributors:9}],
        [{...cells[0],contributors:1}],[{...cells[0],service:"private@example.com"}],[cells[0],cells[0]],[null]]){
        await client.query("SAVEPOINT malformed_fixture");
        try{
          await client.query("UPDATE analytics_v2_service_months SET cells=$1::jsonb WHERE month='2026-08-01'",[JSON.stringify(invalid)]);
          await assert.rejects(segmentReport("top-services","2026-08"),/^Error: DATA_QUALITY$/);
        }finally{await client.query("ROLLBACK TO SAVEPOINT malformed_fixture");await client.query("RELEASE SAVEPOINT malformed_fixture");}
      }
      assert.equal(await stored(),bytes);assert.deepEqual(await segmentReport("top-services","2026-08"),baseline);
      assert.deepEqual(Object.keys((baseline as any).cells[1]).sort(),["service","state"]);
      assert.equal("total" in baseline,false);assert.equal("other" in baseline,false);
    });
  }finally{serviceCatalog.splice(0,serviceCatalog.length,...original);await client.query("ROLLBACK");await client.end();await privateDataPool.end();}
});
