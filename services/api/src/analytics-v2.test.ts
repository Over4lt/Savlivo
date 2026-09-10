import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Readable} from "node:stream";
import {privateDataPool} from "./private-data-db.js";
import {pool} from "./db.js";
import {applyVerifiedPurchase} from "./repositories-billing.js";
import {handlePrivateData} from "./private-data-http.js";
import {reportingEnabled,v2CollectionPolicy,currentPlanSql,planDistribution,reportFilters,windowFor,months,
  suppressSegments,parseSignal,createV2Recorder,writeSignal,captureTransitionPlan,historyBuckets,globalReport,segmentReport,maintainV2,cleanupV2OrphanActors,parseFinalizedServiceCells} from "./analytics-v2.js";
const validEnv={ANALYTICS_V2_REPORTING_ENABLED:"true",ANALYTICS_V2_COLLECTION_ENABLED:"true",ANALYTICS_COLLECTION_ENABLED:"true",
  ANALYTICS_PRIVACY_REVIEWED:"true",ANALYTICS_MAINTENANCE_ENABLED:"true",ANALYTICS_RAW_RETENTION_DAYS:"45",ANALYTICS_AGGREGATE_RETENTION_DAYS:"400"};
const now=new Date("2026-09-10T14:15:00Z");
const row={total:"3",preview:"1",manual:"1",premium:"1",invalid:"0",email:"MUST_NOT_LEAVE",effectivePlan:"PREMIUM"};
function env(t:any,values:Record<string,string|undefined>) {
  for(const [key,value] of Object.entries(values)){const old=process.env[key];if(value===undefined)delete process.env[key];else process.env[key]=value;
    t.after(()=>{if(old===undefined)delete process.env[key];else process.env[key]=old;});}
}
test("global exact counts of one, canonical plan source, paid membership and consistent denominator",()=>{
  assert.match(currentPlanSql,/LEFT JOIN entitlements/);assert.match(currentPlanSql,/e.plan::text='VIEWER'/);assert.doesNotMatch(currentPlanSql,/effectivePlan/);
  assert.match(currentPlanSql,/deletion_scheduled_for IS NULL/);
  const value=planDistribution(row);assert.equal(value.paid,2);assert.equal(value.paidPercentage,2/3*100);assert.equal(value.preview,1);
  assert.equal(value.percentages?.premium,1/3*100);assert.equal(JSON.stringify(value).includes("MUST_NOT_LEAVE"),false);
  assert.equal(planDistribution({...row,total:"1",preview:"0",manual:"0"}).premium,1);
  assert.throws(()=>planDistribution({...row,total:"4"}),/DATA_QUALITY/);
});
test("zero denominator has null percentages; missing entitlement is not Preview",()=>{
  const zero=planDistribution({total:0,preview:0,manual:0,premium:0,invalid:0});assert.equal(zero.paidPercentage,null);assert.equal(zero.percentages?.preview,null);
  const invalid=planDistribution({total:1,preview:0,manual:0,premium:0,invalid:1});assert.equal(invalid.state,"data-quality-issue");assert.equal(invalid.preview,0);assert.equal(invalid.percentages,null);
  for(const bad of [-1,NaN,undefined,"1.2",Number.MAX_SAFE_INTEGER+1])assert.throws(()=>planDistribution({...row,total:bad}));
});
test("reporting does not activate collection; all collection and retention gates explicit",()=>{
  assert.equal(reportingEnabled({}),false);assert.equal(v2CollectionPolicy({}),null);assert.deepEqual(v2CollectionPolicy(validEnv),{raw:45,aggregate:400});
  assert.equal(v2CollectionPolicy({...validEnv,ANALYTICS_COLLECTION_ENABLED:"false"}),null);
  assert.equal(reportingEnabled({...validEnv,ANALYTICS_COLLECTION_ENABLED:"false"}),true);
  for(const key of ["ANALYTICS_V2_COLLECTION_ENABLED","ANALYTICS_COLLECTION_ENABLED","ANALYTICS_PRIVACY_REVIEWED","ANALYTICS_MAINTENANCE_ENABLED","ANALYTICS_RAW_RETENTION_DAYS","ANALYTICS_AGGREGATE_RETENTION_DAYS"])
    assert.equal(v2CollectionPolicy({...validEnv,[key]:undefined}),null,key);
  for(const raw of ["30","44","46","NaN"])assert.equal(v2CollectionPolicy({...validEnv,ANALYTICS_RAW_RETENTION_DAYS:raw}),null);
});
test("only complete UTC days or twelve complete calendar months; current cards independent",()=>{
  assert.deepEqual(windowFor("7d",now),{start:new Date("2026-09-03T00:00Z"),end:new Date("2026-09-10T00:00Z")});
  assert.deepEqual(windowFor("12m",now),{start:new Date("2025-09-01T00:00Z"),end:new Date("2026-09-01T00:00Z")});
  assert.equal(months(now).length,12);assert.equal(months(now)[0],"2026-08");assert.equal(months(now)[11],"2025-09");
  assert.equal((windowFor("90d",now).end.getTime()-windowFor("90d",now).start.getTime())/86400000,90);
});
test("duplicate unknown arbitrary and cross filters fail closed",()=>{
  for(const range of ["7d","30d","90d","12m"])assert.deepEqual(reportFilters(new URLSearchParams({range})),{range});
  for(const query of ["range=1d","range=","range=7d&range=30d","start=2026-01-01","market=QA","service=netflix","plan=PREMIUM","range=7d&platform=ios","range=7d&exclude=x"])
    assert.throws(()=>reportFilters(new URLSearchParams(query)),/INVALID_FILTER/);
  assert.deepEqual(reportFilters(new URLSearchParams("month=2026-08&report=top-services"),true,now),{month:"2026-08",report:"top-services"});
  for(const query of ["month=2026-09&report=top-services","month=2025-08&report=top-services","month=2026-08&report=top-services&market=NO","month=2026-08&report=selected-markets&plan=PREMIUM","month=2026-08&month=2026-07&report=top-services","month=2026-08&report=other"])
    assert.throws(()=>reportFilters(new URLSearchParams(query),true,now),/INVALID_FILTER/);
});
test("10 distinct contributors displays; zero to nine share the same state; complementary suppression",()=>{
  assert.equal(suppressSegments([{service:"a",contributors:10}])[0].state,"available");
  for(const n of [0,1,9])assert.deepEqual(suppressSegments([{service:"a",contributors:n}]),[{service:"a",state:"suppressed"}]);
  const cells=suppressSegments([{service:"a",contributors:20},{service:"b",contributors:10},{service:"c",contributors:9}]);
  assert.deepEqual(cells,[{service:"a",state:"available",contributors:20},{service:"b",state:"suppressed"},{service:"c",state:"suppressed"}]);
  assert.doesNotMatch(JSON.stringify(cells),/other|total|percentage/i);
});
test("signals accept canonical identity only and no text, hashes, market or cross dimensions",()=>{
  assert.deepEqual(parseSignal({kind:"service_added",service:"netflix"}),{kind:"service_added",service:"netflix"});
  for(const service of ["manual","My private service","not-a-service"])assert.throws(()=>parseSignal({kind:"service_added",service}));
  for(const kind of ["new_account","ai_success","ai_failure","ai_fallback","no_result"]) {
    assert.deepEqual(parseSignal({kind}),{kind});
    for(const key of ["email","name","userId","accountId","actorId","query","queryHash","prompt","response","metadata","error","market","platform","url"])
      assert.throws(()=>parseSignal({kind,[key]:"private"}));
  }
  for(const kind of ["push","background","app_active","foreground","unknown"])assert.throws(()=>parseSignal({kind}));
  assert.throws(()=>parseSignal({kind:"no_result",service:"netflix"}));
});
test("transitions are enum-only; no-op restores cannot become transitions",()=>{
  for(const oldPlan of ["VIEWER","MANUAL","PREMIUM"])for(const newPlan of ["VIEWER","MANUAL","PREMIUM"])
    if(oldPlan===newPlan)assert.throws(()=>parseSignal({kind:"plan_transition",oldPlan,newPlan}));else assert.equal(parseSignal({kind:"plan_transition",oldPlan,newPlan}).kind,"plan_transition");
  for(const oldPlan of [null,"Preview","effectivePlan",undefined])assert.throws(()=>parseSignal({kind:"plan_transition",oldPlan,newPlan:"PREMIUM"}));
});
test("queue is bounded, disabled is no write, exceptions cannot reject customer actions",async()=>{
  let writes=0;const disabled=createV2Recorder(async()=>{writes++;},()=>false);assert.equal(disabled("owner",{kind:"new_account"}),false);assert.equal(writes,0);
  const failing=createV2Recorder(async()=>{writes++;throw new Error("DB offline");},()=>true);assert.equal(failing("owner",{kind:"new_account"}),true);
  await new Promise(resolve=>setImmediate(resolve));assert.equal(writes,1);
  let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});const bounded=createV2Recorder(async()=>gate,()=>true);
  for(let i=0;i<128;i++)assert.equal(bounded("owner",{kind:"new_account"}),true);assert.equal(bounded("owner",{kind:"new_account"}),false);release();
});
test("signal SQL atomically deduplicates before durable count and server assigns identity; deletion excluded",async(t)=>{
  env(t,validEnv);let sql="",values:any[]=[];
  t.mock.method(privateDataPool,"query",async(q:string,v:any[])=>{sql=q;values=v;return {rows:[]};});
  await writeSignal("internal-owner",{kind:"service_added",service:"netflix"},"generated-id",new Date());
  assert.match(sql,/ON CONFLICT\(id\) DO NOTHING RETURNING id/);assert.match(sql,/FROM inserted/);assert.match(sql,/deletion_scheduled_for IS NULL/);
  assert.equal(values[0],"internal-owner");assert.equal(values[3],"netflix");assert.match(sql,/45 days/);assert.match(sql,/400 days/);
  let writes=0;t.mock.method(privateDataPool,"query",async()=>{writes++;});process.env.ANALYTICS_COLLECTION_ENABLED="false";
  await writeSignal("owner",{kind:"new_account"},"id",new Date());assert.equal(writes,0);
});
test("optional entitlement observation uses locked canonical plan, missing state unknown, failure savepoint isolated",async(t)=>{
  env(t,validEnv);const queries:string[]=[];
  const client={query:async(q:string)=>{queries.push(q);if(q==="SHOW lock_timeout")return {rows:[{lock_timeout:"0"}]};if(q.includes("FOR UPDATE"))return {rows:[{plan:"MANUAL",effectivePlan:"PREMIUM"}]};return {rows:[]};}};
  assert.equal(await captureTransitionPlan(client as any,"owner"),"MANUAL");assert.ok(queries.some(q=>q.includes("FOR UPDATE")));
  const failing={query:async(q:string)=>{queries.push(q);if(q.includes("FOR UPDATE"))throw new Error("lock timeout");return {rows:[{lock_timeout:"0"}]};}};
  assert.equal(await captureTransitionPlan(failing as any,"owner"),null);assert.ok(queries.includes("ROLLBACK TO SAVEPOINT analytics_v2_observation"));
  process.env.ANALYTICS_COLLECTION_ENABLED="false";assert.equal(await captureTransitionPlan({query:()=>{throw new Error("must not query");}} as any,"owner"),null);
});
test("actual purchase succeeds during analytics outage and retry/restore does not duplicate no-op transition",async(t)=>{
  env(t,validEnv);let plan="VIEWER",writes=0,commits=0;
  const client={query:async(q:string,v:any[])=>{
    if(q==="SHOW lock_timeout")return {rows:[{lock_timeout:"0"}]};
    if(q.includes("SELECT plan::text"))return {rows:[{plan}]};
    if(q.includes("INSERT INTO purchase_events"))return {rowCount:1,rows:[{user_id:"owner"}]};
    if(q.includes("INSERT INTO entitlements"))plan=v[1];if(q==="COMMIT")commits++;
    return {rows:[]};},release(){}};
  t.mock.method(pool,"connect",async()=>client as any);t.mock.method(privateDataPool,"query",async()=>{writes++;throw new Error("analytics offline");});
  const purchase={userId:"owner",platform:"IOS" as const,productId:"test",externalTransactionId:"transaction",plan:"PREMIUM" as const};
  await applyVerifiedPurchase(purchase);await new Promise(r=>setImmediate(r));assert.equal(writes,1);assert.equal(plan,"PREMIUM");
  await applyVerifiedPurchase(purchase);await new Promise(r=>setImmediate(r));assert.equal(writes,1);assert.equal(commits,2);
});
test("history has gaps, not fake zero; monthly stock is month-end only; flows sum separately",()=>{
  const snapshots=[{...row,day:"2026-08-30",observed_at:"2026-08-30T01:00Z"},{...row,day:"2026-08-31",observed_at:"2026-08-31T02:00Z"}];
  const history=historyBuckets("12m",snapshots,[{day:"2026-08-30",metric:"new_account",count:2},{day:"2026-08-31",metric:"new_account",count:3}],now);
  assert.equal(history[0].plans.state,"unavailable");assert.equal(history[0].flows,null);assert.equal((history[11].plans as any).total,3);assert.equal(history[11].flows?.new_account,5);
  assert.equal(historyBuckets("12m",snapshots.slice(0,1),[],now)[11].plans.state,"unavailable");
  assert.equal(historyBuckets("7d",[],[],now).length,7);
});
test("current report works before 019 without fabricated history or identity fields",async(t)=>{
  t.mock.method(privateDataPool,"query",async(q:string)=>q===currentPlanSql?{rows:[row]}:{rows:[{present:false}]});
  const value=await globalReport("7d");assert.equal(value.current.total,3);assert.ok(value.history.every(b=>b.plans.state==="unavailable"));
  assert.doesNotMatch(JSON.stringify(value),/MUST_NOT_LEAVE|user_id|accountId|email|effectivePlan/);
  assert.match(value.unavailable.activeUsers,/No qualifying foreground/);assert.match(value.unavailable.retention,/D7\/D30/);assert.match(value.unavailable.push,/No receipt/);
});
test("segmented service output rejects arbitrary persisted fields and never exposes missing zero as zero",async(t)=>{
  t.mock.method(privateDataPool,"query",async(q:string)=>q.includes("to_regclass")?{rows:[{present:true}]}:{rows:[{cells:[{service:"netflix",state:"available",contributors:10,email:"SECRET"},{service:"spotify",state:"suppressed",contributors:9}]}]});
  await assert.rejects(segmentReport("top-services","2026-08"),/^Error: DATA_QUALITY$/);
  const markets=await segmentReport("selected-markets","2026-08");assert.equal(markets.state,"unavailable");assert.match((markets as any).reason,/not physical geography/);
});
test("v2 routes require same admin session and audit before any report read; customer JWT cannot authorize",async(t)=>{
  env(t,{...validEnv,NODE_ENV:"production",ADMIN_ENABLED:"true",ADMIN_ALLOWED_ORIGIN:"https://admin.savlivo.com",ADMIN_RP_ID:"admin.savlivo.com",ADMIN_AUDIT_RETENTION_DAYS:"180"});
  const queries:string[]=[];let auditFails=false;
  t.mock.method(privateDataPool,"query",async(q:string)=>{queries.push(q);if(q.includes("FROM admin_sessions s"))return {rows:[{user_id:"private-admin-id"}]};
    if(q.startsWith("INSERT INTO admin_audit")&&auditFails)throw new Error("audit offline");if(q===currentPlanSql)return {rows:[row]};return {rows:[{present:false}]};});
  async function request(auth:string,path="/v1/admin/analytics?range=7d") {
    const req=Readable.from([]) as any;req.url=path;req.method="GET";req.headers={origin:"https://admin.savlivo.com",authorization:auth};
    let status=0,body="";await handlePrivateData(req,{setHeader(){},writeHead(code:number){status=code;},end(value:string){body=value;}} as any);return {status,body};
  }
  assert.equal((await request("Bearer customer-jwt")).status,401);
  const auth=`Bearer adm_${"A".repeat(43)}`;assert.equal((await request(auth)).status,200);
  assert.ok(queries.findIndex(q=>q.startsWith("INSERT INTO admin_audit"))<queries.indexOf(currentPlanSql));
  queries.length=0;auditFails=true;assert.equal((await request(auth)).status,503);assert.equal(queries.includes(currentPlanSql),false);
  assert.equal((await request(auth,"/v1/admin/analytics?range=7d&market=QA")).status,400);
});
test("019 is additive transactional, no backfill or activation, actor cascades, bounded cleanup",async(t)=>{
  t.mock.method(privateDataPool,"connect",async()=>({query:(q:string,v:unknown[])=>privateDataPool.query(q,v),release(){}} as any));
  const migration=readFileSync(new URL("../../../db/migrations/019_analytics_v2.sql",import.meta.url),"utf8");
  assert.match(migration,/BEGIN;/);assert.match(migration,/COMMIT;/);assert.doesNotMatch(migration,/^(ALTER|DROP|DELETE|UPDATE|INSERT)\b/m);
  assert.match(migration,/REFERENCES users\(id\) ON DELETE CASCADE/);assert.match(migration,/REFERENCES analytics_v2_actors\(id\) ON DELETE CASCADE/);
  env(t,{ANALYTICS_MAINTENANCE_ENABLED:"true",ANALYTICS_V2_COLLECTION_ENABLED:undefined});const queries:string[]=[];
  t.mock.method(privateDataPool,"query",async(q:string)=>{queries.push(q);return {rows:[{present:true}]};});
  await maintainV2();assert.equal(queries.some(q=>q.startsWith("INSERT")),false);assert.equal(queries.filter(q=>q.startsWith("DELETE")).length,5);
  assert.ok(queries.filter(q=>q.startsWith("DELETE")&&!q.includes("DELETE FROM analytics_v2_actors")).every(q=>q.includes("LIMIT 5000")));
  assert.match(queries.find(q=>q.startsWith("SELECT a.id"))!,/LIMIT 5000 FOR UPDATE OF a SKIP LOCKED/);
});
test("existing mobile has no v2 instrumentation and manual add branch has no canonical signal",()=>{
  const source=readFileSync(new URL("repositories.ts",import.meta.url),"utf8");
  const manual=source.slice(source.indexOf('if (args.serviceSlug === "manual")'),source.indexOf('if(args.customServiceName !== undefined)'));
  assert.doesNotMatch(manual,/recordV2/);
  const mobile=readFileSync(new URL("../../../apps/mobile/app/index.tsx",import.meta.url),"utf8");assert.doesNotMatch(mobile,/recordV2|analytics\/events/);
});

test("queued signal is an immutable projection of allowlisted fields, not a caller-owned object",async()=>{
  const seen:any[]=[];const record=createV2Recorder(async(_owner,event)=>{seen.push(event);},()=>true);
  const input:any={kind:"service_added",service:"netflix"};record("owner",input);input.service="PRIVATE MANUAL NAME";input.email="SECRET";
  await new Promise(r=>setImmediate(r));assert.deepEqual(seen,[{kind:"service_added",service:"netflix"}]);
});
test("monthly finalization uses DISTINCT actors, excludes deletion, suppresses before storage, never updates history",async(t)=>{
  t.mock.method(privateDataPool,"connect",async()=>({query:(q:string,v:unknown[])=>privateDataPool.query(q,v),release(){}} as any));
  env(t,validEnv);const queries:string[]=[];let cells:any[]=[];
  t.mock.method(privateDataPool,"query",async(q:string,v:any[])=>{
    queries.push(q);if(q.includes("to_regclass"))return {rows:[{present:true}]};
    if(q.includes("AS started_before"))return {rows:[{days:31,started_before:true}]};
    if(q.includes("count(DISTINCT"))return {rows:[{service:"netflix",contributors:20},{service:"spotify",contributors:10},{service:"apple-music",contributors:9}]};
    if(q.includes("INSERT INTO analytics_v2_service_months"))cells=JSON.parse(v[1]);return {rows:[]};});
  await maintainV2(new Date("2026-09-02T12:00Z"));
  assert.equal(cells.find(c=>c.service==="netflix").contributors,20);assert.deepEqual(cells.find(c=>c.service==="spotify"),{service:"spotify",state:"suppressed"});
  const distinct=queries.find(q=>q.includes("count(DISTINCT"))!;assert.match(distinct,/s.expires_at>now\(\)/);assert.match(distinct,/deletion_scheduled_for IS NULL/);
  assert.match(queries.find(q=>q.includes("INSERT INTO analytics_v2_service_months"))!,/ON CONFLICT\(month\) DO NOTHING/);
});
test("first partial activation month and missing daily observation cannot become a finalized segment",async(t)=>{
  t.mock.method(privateDataPool,"connect",async()=>({query:(q:string,v:unknown[])=>privateDataPool.query(q,v),release(){}} as any));
  env(t,validEnv);
  for(const coverage of [{days:31,started_before:false},{days:30,started_before:true}]) {
    let finalized=false;t.mock.method(privateDataPool,"query",async(q:string)=>{if(q.includes("service_months(month"))finalized=true;return {rows:[q.includes("AS started_before")?coverage:{present:true}]};});
    await maintainV2(new Date("2026-09-02T12:00Z"));assert.equal(finalized,false);
  }
});
test("snapshot failure still attempts raw and durable retention cleanup",async(t)=>{
  t.mock.method(privateDataPool,"connect",async()=>({query:(q:string,v:unknown[])=>privateDataPool.query(q,v),release(){}} as any));
  env(t,validEnv);const statements:string[]=[];
  t.mock.method(privateDataPool,"query",async(q:string)=>{statements.push(q);if(q.includes("INSERT INTO analytics_v2_snapshots"))throw new Error("snapshot failed");return {rows:[{present:true}]};});
  await assert.rejects(maintainV2(),/snapshot failed/);assert.equal(statements.filter(q=>q.startsWith("DELETE")).length,5);
});
test("AI outcome observer receives only a coarse enum; failure cannot change response or portfolio scope",async()=>{
  const {askAssistant}=await import("./assistant.js");const outcomes:unknown[]=[];
  const result=await askAssistant({message:"private prompt",languageHint:"invalid",context:{countryCode:"invalid",subscriptions:[{id:"PRIVATE",serviceName:"private",countryCode:"NO"}]}},async messages=>{
    assert.equal(messages.at(-1)!.content.includes('"id":"PRIVATE"'),false);
    return JSON.stringify({answer:"ordinary answer",language:"en",intent:"GENERAL"});
  },outcome=>{outcomes.push(outcome);throw new Error("telemetry failed");});
  assert.equal(result.answer,"ordinary answer");assert.deepEqual(outcomes,["success"]);assert.equal(result.language,"en");
});
test("push reports registered enabled endpoint rows only, never destinations, permission or delivery",async(t)=>{
  const {pushState}=await import("./analytics-v2.js");let sql="";
  t.mock.method(privateDataPool,"query",async(q:string)=>{sql=q;return {rows:[{endpoints:"1",destination:"SECRET"}]};});
  assert.deepEqual(await pushState(),{state:"available",registeredEnabledEndpoints:1});assert.match(sql,/e.channel='PUSH' AND e.enabled=true/);assert.doesNotMatch(sql,/destination|sent_at|payload/);
  t.mock.method(privateDataPool,"query",async()=>{throw new Error("missing table");});assert.equal((await pushState()).state,"unavailable");
});


test("observation locks user KEY SHARE before entitlement and restores the caller timeout",async(t)=>{
  env(t,validEnv);const queries:Array<{sql:string;values?:unknown[]}>=[];
  const client={query:async(sql:string,values?:unknown[])=>{queries.push({sql,values});
    if(sql==="SHOW lock_timeout")return {rows:[{lock_timeout:"7s"}]};
    return {rows:[{id:"owner",plan:"PREMIUM"}]};}};
  assert.equal(await captureTransitionPlan(client as any,"owner"),"PREMIUM");
  const user=queries.findIndex(q=>q.sql==="SELECT id FROM users WHERE id=$1 FOR KEY SHARE");
  const entitlement=queries.findIndex(q=>q.sql.includes("FROM entitlements"));
  assert.ok(user>=0&&user<entitlement);assert.deepEqual(queries[user].values,["owner"]);
  assert.deepEqual(queries.find(q=>q.sql.includes("set_config"))?.values,["7s"]);
  assert.equal(queries.at(-1)?.sql,"RELEASE SAVEPOINT analytics_v2_observation");
});
test("user-lock timeout skips entitlement observation and rolls back only its savepoint",async(t)=>{
  env(t,validEnv);const queries:string[]=[];
  const client={query:async(sql:string)=>{queries.push(sql);if(sql.includes("FOR KEY SHARE"))throw Object.assign(new Error("lock timeout"),{code:"55P03"});
    return {rows:[{lock_timeout:"0"}]};}};
  assert.equal(await captureTransitionPlan(client as any,"owner"),null);
  assert.equal(queries.some(q=>q.includes("FROM entitlements")),false);
  assert.deepEqual(queries.slice(-2),["ROLLBACK TO SAVEPOINT analytics_v2_observation","RELEASE SAVEPOINT analytics_v2_observation"]);
  assert.equal(queries.includes("ROLLBACK"),false);
});


test("orphan cleanup locks a bounded batch then rechecks in a fresh READ COMMITTED statement",async(t)=>{
  const queries:Array<{sql:string;values?:unknown[]}>=[];let released=false;
  t.mock.method(privateDataPool,"connect",async()=>({query:async(sql:string,values?:unknown[])=>{
    queries.push({sql,values});return {rows:sql.startsWith("SELECT a.id")?[{id:"candidate"}]:[],rowCount:0};
  },release(){released=true;}} as any));
  assert.equal(await cleanupV2OrphanActors(),0);
  assert.equal(queries[0].sql,"BEGIN ISOLATION LEVEL READ COMMITTED");
  assert.match(queries[1].sql,/NOT EXISTS[\s\S]*LIMIT 5000 FOR UPDATE OF a SKIP LOCKED/);
  assert.match(queries[2].sql,/a.id=ANY\(\$1::uuid\[\]\)[\s\S]*NOT EXISTS/);
  assert.deepEqual(queries[2].values,[["candidate"]]);assert.equal(queries[3].sql,"COMMIT");assert.equal(released,true);
});
test("orphan cleanup failure rolls back and releases its private connection",async(t)=>{
  const queries:string[]=[];let released=false;
  t.mock.method(privateDataPool,"connect",async()=>({query:async(sql:string)=>{
    queries.push(sql);if(sql.startsWith("DELETE"))throw new Error("cleanup failed");return {rows:[]};
  },release(){released=true;}} as any));
  await assert.rejects(cleanupV2OrphanActors(),/cleanup failed/);
  assert.equal(queries.at(-1),"ROLLBACK");assert.equal(queries.includes("COMMIT"),false);assert.equal(released,true);
});

test("calendar SQL bounds are explicit UTC dates while service signal bounds remain timestamps",async t=>{
  t.mock.timers.enable({apis:["Date"],now:new Date("2026-09-10T14:15:00Z")});
  env(t,validEnv);const seen:Array<{sql:string;values:any[]}>=[];
  t.mock.method(privateDataPool,"query",async(sql:string,values:any[]=[])=>{
    seen.push({sql,values});
    if(sql===currentPlanSql)return {rows:[row]};
    if(sql.includes("to_regclass"))return {rows:[{present:true}]};
    if(sql.includes("AS started_before"))return {rows:[{days:31,started_before:true}]};
    return {rows:[]};
  });
  t.mock.method(privateDataPool,"connect",async()=>({query:async()=>({rows:[]}),release(){}} as any));
  for(const [range,start,end] of [["7d","2026-09-03","2026-09-10"],["30d","2026-08-11","2026-09-10"],["90d","2026-06-12","2026-09-10"],["12m","2025-09-01","2026-09-01"]]){
    seen.length=0;await globalReport(range);
    const bounds=seen.filter(q=>q.sql.includes("day >= $1::date"));assert.equal(bounds.length,2);
    for(const q of bounds)assert.deepEqual(q.values,[start,end]);
  }
  seen.length=0;await maintainV2(new Date("2026-09-02T12:00:00Z"));
  assert.deepEqual(seen.find(q=>q.sql.includes("AS started_before"))!.values,["2026-08-01","2026-09-01"]);
  assert.equal(seen.find(q=>q.sql.includes("service_months(month"))!.values[0],"2026-08-01");
  const timestamps=seen.find(q=>q.sql.includes("count(DISTINCT"))!.values;
  assert.ok(timestamps.every(v=>v instanceof Date));
  assert.deepEqual(timestamps.map(v=>v.toISOString()),["2026-08-01T00:00:00.000Z","2026-09-01T00:00:00.000Z"]);
  seen.length=0;await segmentReport("top-services","2026-08");
  assert.deepEqual(seen.at(-1)!.values,["2026-08-01"]);
});


test("finalized cells retain stored identities, order, exact counts and suppression without live membership",()=>{
  const cells=[{service:"retired-historical-service",state:"available",contributors:18},{service:"netflix",state:"suppressed"}];
  const result=parseFinalizedServiceCells(cells);assert.deepEqual(result,cells);assert.notEqual(result,cells);
  assert.notEqual(result[0],cells[0]);assert.deepEqual(parseFinalizedServiceCells([]),[]);
});
test("finalized cell validation rejects malformed content rather than projecting or revealing it",()=>{
  const good={service:"apple-tv-plus",state:"available",contributors:18};
  const invalid=[null,{},"text",[null],[[]],[{...good,email:"SECRET"}],[{...good,service:"user@example.com"}],
    [{...good,service:"Private Name"}],[{...good,service:"x".repeat(129)}],[{...good,state:"unknown"}],
    [{...good,contributors:9}],[{...good,contributors:"18"}],[{...good,contributors:10.5}],
    [{...good,contributors:Number.MAX_SAFE_INTEGER+1}],[{service:"netflix",state:"suppressed",contributors:0}],
    [{service:"netflix",state:"suppressed",contributors:9}],[good,good],[{service:"netflix"}]];
  for(const input of invalid)assert.throws(()=>parseFinalizedServiceCells(input),/^Error: DATA_QUALITY$/);
});

test("independent expiry classes and orphan cleanup run before aggregated incomplete error",async t=>{
  env(t,{ANALYTICS_MAINTENANCE_ENABLED:"true",ANALYTICS_V2_COLLECTION_ENABLED:undefined});
  const attempted:string[]=[];let released=false;
  t.mock.method(privateDataPool,"query",async(sql:string)=>{
    if(sql.includes("to_regclass"))return {rows:[{present:true}]};
    attempted.push(sql);
    if(sql.startsWith("DELETE FROM analytics_v2_signals")||sql.startsWith("DELETE FROM analytics_v2_flows"))throw new Error("PRIVATE database detail");
    return {rows:[]};
  });
  t.mock.method(privateDataPool,"connect",async()=>({query:async(sql:string)=>{attempted.push(sql);return {rows:[],rowCount:0};},release(){released=true;}} as any));
  await assert.rejects(maintainV2(),/^Error: Analytics v2 cleanup incomplete: analytics_v2_signals, analytics_v2_flows$/);
  assert.equal(attempted.filter(sql=>sql.startsWith("DELETE")).length,5);
  assert.ok(attempted.includes("COMMIT"));assert.equal(released,true);
});
test("orphan transaction failure is included after independent expiry cleanup",async t=>{
  env(t,{ANALYTICS_MAINTENANCE_ENABLED:"true",ANALYTICS_V2_COLLECTION_ENABLED:undefined});
  let expiry=0,released=false;const orphan:string[]=[];
  t.mock.method(privateDataPool,"query",async(sql:string)=>{if(sql.startsWith("DELETE"))expiry++;return {rows:[{present:true}]};});
  t.mock.method(privateDataPool,"connect",async()=>({query:async(sql:string)=>{orphan.push(sql);if(sql.startsWith("SELECT a.id"))throw new Error("lock timeout");return {rows:[]};},release(){released=true;}} as any));
  await assert.rejects(maintainV2(),/^Error: Analytics v2 cleanup incomplete: analytics_v2_actors$/);
  assert.equal(expiry,4);assert.equal(orphan.at(-1),"ROLLBACK");assert.equal(released,true);
});
