import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import type { IncomingMessage } from "node:http";
import { parseAnalyticsEvent, analyticsEvents } from "../../../packages/contracts/src/analytics.js";
import { collectionPolicy, createEventRecorder } from "./analytics.js";
import { adminConfiguration, authenticatedAdmin, boundedJson, createRateLimit, dashboardFilters, hashSession, handlePrivateData } from "./private-data-http.js";
import { createToken } from "./auth.js";
const valid = {event:"catalog_search",market:"NO",platform:"ios"};
test("all named events accept only enum dimensions",()=>{
  for(const event of analyticsEvents) assert.equal(parseAnalyticsEvent({...valid,event}).event,event);
  assert.equal(parseAnalyticsEvent({...valid,service:"netflix",category:"video"}).service,"netflix");
});
test("rejects arbitrary identity, raw AI text, secrets, amounts and properties",()=>{
  for(const key of ["email","name","userId","actorId","prompt","response","query","metadata","url","price","token","latitude","timestamp"])
    assert.throws(()=>parseAnalyticsEvent({...valid,[key]:"private"}));
  for(const key of ["event","market","platform","service","category"]) assert.throws(()=>parseAnalyticsEvent({...valid,[key]:"user@example.org"}));
  for(const input of [null,[],"text",{}, {...valid,platform:["ios"]}, {...valid,market:"RU"}]) assert.throws(()=>parseAnalyticsEvent(input));
});
test("no-result demand stores neither query hashes nor invented service identifiers",()=>{
  assert.equal(parseAnalyticsEvent({...valid,event:"catalog_no_result"}).service,undefined);
  assert.throws(()=>parseAnalyticsEvent({...valid,event:"catalog_no_result",service:"netflix"}));
  assert.throws(()=>parseAnalyticsEvent({...valid,queryHash:"a".repeat(64)}));
});
test("collection requires explicit privacy approval and bounded retention",()=>{
  assert.equal(collectionPolicy({}),null);
  for(const value of [undefined,"0","91","30.5","garbage"]) assert.equal(collectionPolicy({ANALYTICS_COLLECTION_ENABLED:"true",ANALYTICS_MAINTENANCE_ENABLED:"true",ANALYTICS_PRIVACY_REVIEWED:"true",ANALYTICS_RAW_RETENTION_DAYS:value}),null);
  assert.equal(collectionPolicy({ANALYTICS_COLLECTION_ENABLED:"true",ANALYTICS_MAINTENANCE_ENABLED:"true",ANALYTICS_PRIVACY_REVIEWED:"true",ANALYTICS_RAW_RETENTION_DAYS:"30"}),30);
});
test("disabled recording makes no database call; write failure cannot reject product action",async()=>{
  let writes=0; const disabled=createEventRecorder(async()=>{writes++;},()=>null);
  assert.equal(disabled("user",valid),false);assert.equal(writes,0);
  const failing=createEventRecorder(async()=>{writes++;throw new Error("offline");},()=>30);
  assert.equal(failing("user",valid),true);
  await new Promise(resolve=>setImmediate(resolve)); assert.equal(writes,1);
});
test("noncritical write queue is bounded",async()=>{
  let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
  const record=createEventRecorder(async()=>gate,()=>30);
  for(let i=0;i<128;i++) assert.equal(record("user",valid),true);
  assert.equal(record("user",valid),false);release();
});
test("bounded reader rejects oversized and non-JSON payloads",async()=>{
  const req=(body:string,type="application/json")=>Object.assign(Readable.from([Buffer.from(body)]),{headers:{"content-type":type}}) as IncomingMessage;
  assert.deepEqual(await boundedJson(req(JSON.stringify(valid))),valid);
  await assert.rejects(boundedJson(req("x".repeat(1025))));
  await assert.rejects(boundedJson(req("{}","text/plain")));
});
test("admin fails closed without complete explicit configuration",()=>{
  assert.equal(adminConfiguration({}),null);
  assert.equal(adminConfiguration({ADMIN_ENABLED:"true",ANALYTICS_MAINTENANCE_ENABLED:"true",ADMIN_AUDIT_RETENTION_DAYS:"180",ADMIN_ALLOWED_ORIGIN:"http://example.org"}),null);
  assert.equal(adminConfiguration({ADMIN_ENABLED:"true",ANALYTICS_MAINTENANCE_ENABLED:"true",ADMIN_AUDIT_RETENTION_DAYS:"180",ADMIN_ALLOWED_ORIGIN:"https://savlivo.com"})?.origin,"https://savlivo.com");
});
test("customer tokens and client admin claims cannot become privileged sessions",async()=>{
  assert.equal(await authenticatedAdmin(undefined),null);
  assert.equal(await authenticatedAdmin(`Bearer ${createToken({id:"user",email:"admin@example.org"})}`),null);
  assert.equal(await authenticatedAdmin('Bearer {"role":"admin"}'),null);
  assert.equal(hashSession("adm_secret").includes("secret"),false);
});
test("rate limiting expires and memory capacity denies by default",()=>{
  const limit=createRateLimit(2,1);assert.equal(limit("a",0),true);assert.equal(limit("a",0),true);
  assert.equal(limit("a",0),false);assert.equal(limit("b",0),false);assert.equal(limit("b",60000),true);
});
test("dashboard rejects arbitrary ranges, market text and duplicate filters",()=>{
  assert.deepEqual(dashboardFilters(new URL("https://x/?days=7&market=NO")),{days:7,market:"NO"});
  for(const query of ["days=999","market=RU","email=x","days=7&days=30"]) assert.throws(()=>dashboardFilters(new URL(`https://x/?${query}`)));
});
test("private handler leaves existing customer routes unchanged and disabled admin denies",async()=>{
  const req={url:"/v1/assistant",headers:{}} as IncomingMessage;
  assert.equal(await handlePrivateData(req,{} as any),false);
  const saved=process.env.ADMIN_ENABLED;delete process.env.ADMIN_ENABLED;
  let status=0;const response={writeHead:(code:number)=>{status=code;},end:()=>{}} as any;
  try {assert.equal(await handlePrivateData({...req,url:"/v1/admin/overview"} as IncomingMessage,response),true);assert.equal(status,404);}
  finally {if(saved!==undefined)process.env.ADMIN_ENABLED=saved;}
});
test("retention still purges expired events when its audit write fails",async(t)=>{
  const {privateDataPool}=await import("./private-data-db.js");
  const {maintainPrivateData}=await import("./private-data-maintenance.js");
  const previous={...process.env};
  const statements:string[]=[];
  t.mock.method(privateDataPool,"query",async(query:string)=>{statements.push(query);if(query.startsWith("INSERT INTO admin_audit"))throw new Error("audit unavailable");return {rows:[]};});
  t.mock.method(console,"warn",()=>{});
  try {
    process.env.ANALYTICS_MAINTENANCE_ENABLED="true";process.env.ADMIN_AUDIT_RETENTION_DAYS="180";delete process.env.PRICING_HISTORY_ENABLED;
    await maintainPrivateData();assert.ok(statements.some(query=>query.startsWith("DELETE FROM analytics_events")));
  } finally {for(const key of ["ANALYTICS_MAINTENANCE_ENABLED","ADMIN_AUDIT_RETENTION_DAYS","PRICING_HISTORY_ENABLED"]) {if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}}
});
test("all optional database idle errors are handled without logging payloads",async(t)=>{
  const {privateDataPool}=await import("./private-data-db.js");
  const messages:unknown[][]=[];t.mock.method(console,"warn",(...args:unknown[])=>messages.push(args));
  assert.doesNotThrow(()=>privateDataPool.emit("error",new Error("password=secret email=user@example.org")));
  assert.equal(messages.length,1);assert.equal(JSON.stringify(messages).includes("secret"),false);
});
test("analytics/admin outage does not intercept any existing customer route",async(t)=>{
  const {privateDataPool}=await import("./private-data-db.js");
  t.mock.method(privateDataPool,"query",async()=>{throw new Error("database unavailable");});
  for(const path of ["/v1/auth/login","/v1/subscriptions","/v1/subscriptions/id","/v1/assistant","/v1/savings","/v1/actions","/v1/pricing","/v1/notifications/preferences","/v1/reports"]) {
    for(const method of ["GET","POST","PATCH","DELETE"])assert.equal(await handlePrivateData({url:path,method,headers:{}} as IncomingMessage,{} as any),false);
  }
});
test("every declared analytics dimension rejects objects arrays oversized strings and sensitive text",()=>{
  for(const field of ["event","market","platform","service","category"]) {
    for(const value of [{},["ios"],null,42,true,"x".repeat(4096),"https://example.org/account","Full Legal Name","raw prompt", "token=secret"])
      assert.throws(()=>parseAnalyticsEvent({...valid,[field]:value}),`${field} ${typeof value}`);
  }
  for(const field of ["fullName","password","accessToken","refreshToken","ip","rawPrompt","rawResponse","searchText","cookies","actor_id","user_id"])assert.throws(()=>parseAnalyticsEvent({...valid,[field]:"secret"}));
});
test("malformed request targets cannot reject the shared server callback",async()=>{
  let status=0;
  assert.equal(await handlePrivateData({url:"http://[",headers:{}} as IncomingMessage,{writeHead:(code:number)=>{status=code;},end:()=>{}} as any),true);
  assert.equal(status,400);
});
