import { randomUUID } from "node:crypto";
import { privateDataPool as pool } from "./private-data-db.js";
import { collectionPolicy, retentionDays } from "./analytics.js";
import { serviceCatalog } from "../../../packages/contracts/src/catalog.js";

const plans = ["VIEWER", "MANUAL", "PREMIUM"] as const;
type Plan = typeof plans[number];
export const unavailable = (reason: string) => ({state: "unavailable" as const, reason});
export function reportingEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.ANALYTICS_V2_REPORTING_ENABLED === "true" && env.ANALYTICS_PRIVACY_REVIEWED === "true"
    && env.ANALYTICS_MAINTENANCE_ENABLED === "true";
}
export function v2CollectionPolicy(env: NodeJS.ProcessEnv = process.env) {
  const raw = collectionPolicy(env), aggregate = retentionDays(env.ANALYTICS_AGGREGATE_RETENTION_DAYS, 400, 400);
  return env.ANALYTICS_V2_COLLECTION_ENABLED === "true" && raw === 45 && aggregate ? {raw, aggregate} : null;
}
export const currentPlanSql = `SELECT count(*)::text AS total,
  count(*) FILTER (WHERE e.plan::text='VIEWER')::text AS preview,
  count(*) FILTER (WHERE e.plan::text='MANUAL')::text AS manual,
  count(*) FILTER (WHERE e.plan::text='PREMIUM')::text AS premium,
  count(*) FILTER (WHERE e.plan IS NULL OR e.plan::text NOT IN ('VIEWER','MANUAL','PREMIUM'))::text AS invalid
  FROM users u LEFT JOIN entitlements e ON e.user_id=u.id WHERE u.deletion_scheduled_for IS NULL`;
function count(value: unknown): number {
  if (!/^[0-9]+$/.test(String(value))) throw new Error("DATA_QUALITY");
  const n = Number(value); if (!Number.isSafeInteger(n)) throw new Error("DATA_QUALITY"); return n;
}
export function planDistribution(row: Record<string, unknown>) {
  const total=count(row.total), preview=count(row.preview), manual=count(row.manual), premium=count(row.premium), invalid=count(row.invalid);
  if(total!==preview+manual+premium+invalid)throw new Error("DATA_QUALITY");
  const percentage=(n:number)=>total ? n/total*100 : null;
  return {state:invalid ? "data-quality-issue" : "available", total, preview, manual, premium,
    unclassified:invalid, paid:manual+premium, paidPercentage:invalid ? null : percentage(manual+premium),
    percentages:invalid ? null : {preview:percentage(preview),manual:percentage(manual),premium:percentage(premium)}};
}
export function months(now = new Date()) {
  return Array.from({length:12},(_,i)=>new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-1-i,1)).toISOString().slice(0,7));
}
export function reportFilters(params: URLSearchParams, segmented=false, now=new Date()) {
  const allowed=segmented?["month","report"]:["range"];
  for(const key of params.keys())if(!allowed.includes(key)||params.getAll(key).length!==1)throw new Error("INVALID_FILTER");
  if(segmented) {
    const month=params.get("month"), report=params.get("report");
    if(!month||!months(now).includes(month)||!["selected-markets","top-services"].includes(report??""))throw new Error("INVALID_FILTER");
    return {month,report};
  }
  const range=params.get("range")??"30d";
  if(!["7d","30d","90d","12m"].includes(range))throw new Error("INVALID_FILTER");
  return {range};
}
// Calendar DATE parameters must not use pg's local-time Date serialization.
export const utcCalendarDate=(date:Date)=>date.toISOString().slice(0,10);
export function windowFor(range:string, now=new Date()) {
  const end=range==="12m"?new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1)):
    new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()));
  const start=range==="12m"?new Date(Date.UTC(end.getUTCFullYear()-1,end.getUTCMonth(),1)):
    new Date(end.getTime()-Number(range.slice(0,-1))*86400000);
  if(!["7d","30d","90d","12m"].includes(range))throw new Error("INVALID_FILTER");
  return {start,end};
}
// Non-exclusive service contributors, no denominator, remainder or cross-filter. Suppress an
// additional smallest visible cell whenever another cell is suppressed (including zero).
export function suppressSegments(cells: Array<{service:string; contributors:number}>) {
  const safe=cells.filter(c=>c.contributors>=10).sort((a,b)=>a.contributors-b.contributors||a.service.localeCompare(b.service));
  const complement=cells.some(c=>c.contributors<10)?safe[0]?.service:undefined;
  return cells.map(c=>c.contributors>=10&&c.service!==complement
    ? {service:c.service,state:"available" as const,contributors:c.contributors}
    : {service:c.service,state:"suppressed" as const});
}
export type Signal = {kind:"new_account"|"ai_success"|"ai_failure"|"ai_fallback"|"no_result"}
  | {kind:"service_added";service:string} | {kind:"plan_transition";oldPlan:Plan;newPlan:Plan};
export function parseSignal(input: unknown): Signal {
  if(!input||typeof input!=="object"||Array.isArray(input))throw new Error("INVALID_EVENT");
  const x=input as Record<string,unknown>;
  const keys=x.kind==="service_added"?["kind","service"]:x.kind==="plan_transition"?["kind","oldPlan","newPlan"]:["kind"];
  if(Object.keys(x).some(k=>!keys.includes(k)))throw new Error("INVALID_EVENT");
  if(x.kind==="service_added"&&serviceCatalog.some(s=>s.slug===x.service))return {kind:"service_added",service:x.service as string};
  if(x.kind==="plan_transition"&&plans.includes(x.oldPlan as Plan)&&plans.includes(x.newPlan as Plan)&&x.oldPlan!==x.newPlan)return {kind:"plan_transition",oldPlan:x.oldPlan as Plan,newPlan:x.newPlan as Plan};
  if(["new_account","ai_success","ai_failure","ai_fallback","no_result"].includes(x.kind as string))return {kind:x.kind as "new_account"|"ai_success"|"ai_failure"|"ai_fallback"|"no_result"};
  throw new Error("INVALID_EVENT");
}
export function createV2Recorder(write:(owner:string,event:Signal,id:string,at:Date)=>Promise<void>, enabled=()=>!!v2CollectionPolicy()) {
  let pending=0,chain=Promise.resolve();
  return (owner:string,input:unknown) => {
    try {
      if(!enabled()||pending>=128)return false;
      const event=parseSignal(input),id=randomUUID(),at=new Date();pending++;
      chain=chain.then(()=>write(owner,event,id,at)).catch(()=>undefined).finally(()=>{pending--;});return true;
    } catch {return false;}
  };
}
export async function writeSignal(owner:string,event:Signal,id:string,at:Date) {
  // Recheck gates at execution, not only enqueue. UUID makes re-execution idempotent.
  if(!v2CollectionPolicy()||at.toISOString().slice(0,10)!==new Date().toISOString().slice(0,10))return;
  const metric=event.kind==="plan_transition"?`${event.oldPlan}_${event.newPlan}`:event.kind;
  await pool.query(`WITH actor AS (
    INSERT INTO analytics_v2_actors(user_id) SELECT id FROM users WHERE id=$1 AND deletion_scheduled_for IS NULL
    ON CONFLICT(user_id) DO UPDATE SET user_id=EXCLUDED.user_id RETURNING id
  ), inserted AS (
    INSERT INTO analytics_v2_signals(id,actor_id,kind,service,old_plan,new_plan,occurred_at,expires_at)
    SELECT $2,id,$3,$4,$5,$6,$7::timestamptz,$7::timestamptz+interval '45 days' FROM actor
    ON CONFLICT(id) DO NOTHING RETURNING id
  ) INSERT INTO analytics_v2_flows(day,metric,count,expires_at)
    SELECT ($7::timestamptz AT TIME ZONE 'UTC')::date,$8,1,$7::timestamptz+interval '400 days' FROM inserted
    ON CONFLICT(day,metric) DO UPDATE SET count=analytics_v2_flows.count+1`,
    [owner,id,event.kind,event.kind==="service_added"?event.service:null,event.kind==="plan_transition"?event.oldPlan:null,
      event.kind==="plan_transition"?event.newPlan:null,at,metric]);
}
export const recordV2 = createV2Recorder(writeSignal);
// Only the existing authoritative purchase boundary calls this. Failure rolls back
// just the optional read. Row locking serializes the old/new entitlement observation;
// no-op restores do not create transitions. Missing state is never guessed as Preview.
export async function captureTransitionPlan(client: import("pg").PoolClient, owner:string):Promise<Plan|null> {
  if(!v2CollectionPolicy())return null;
  await client.query("SAVEPOINT analytics_v2_observation");
  try {
    const oldTimeout=await client.query("SHOW lock_timeout");
    await client.query("SET LOCAL lock_timeout='500ms'");
    // Match purchase FK/account-deletion order: parent user before entitlement.
    // KEY SHARE blocks deletion/key changes without blocking ordinary user updates.
    // Savepoint rollback releases both observation locks on contention/failure.
    await client.query("SELECT id FROM users WHERE id=$1 FOR KEY SHARE",[owner]);
    const result=await client.query("SELECT plan::text AS plan FROM entitlements WHERE user_id=$1 FOR UPDATE",[owner]);
    await client.query("SELECT set_config('lock_timeout',$1,true)",[oldTimeout.rows[0].lock_timeout]);
    await client.query("RELEASE SAVEPOINT analytics_v2_observation");
    return plans.includes(result.rows[0]?.plan)?result.rows[0].plan:null;
  } catch {
    await client.query("ROLLBACK TO SAVEPOINT analytics_v2_observation");
    await client.query("RELEASE SAVEPOINT analytics_v2_observation");
    return null;
  }
}


// Lock before rechecking: a single DELETE/CTE can retain a stale child-table
// snapshot while waiting for a writer. FOR UPDATE also conflicts with FK KEY SHARE.
export async function cleanupV2OrphanActors() {
  const client=await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    const candidates=await client.query(`SELECT a.id FROM analytics_v2_actors a
      WHERE NOT EXISTS(SELECT 1 FROM analytics_v2_signals s WHERE s.actor_id=a.id)
      LIMIT 5000 FOR UPDATE OF a SKIP LOCKED`);
    // Separate statement is intentional: READ COMMITTED takes a fresh snapshot.
    const result=await client.query(`DELETE FROM analytics_v2_actors a WHERE a.id=ANY($1::uuid[])
      AND NOT EXISTS(SELECT 1 FROM analytics_v2_signals s WHERE s.actor_id=a.id)`,[candidates.rows.map(row=>row.id)]);
    await client.query("COMMIT");
    return result.rowCount??0;
  } catch(error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {client.release();}
}

// No collection on report reads. This maintenance-only sampler retains the FIRST real
// observation of each UTC day, with its actual timestamp; it is not a midnight balance.
export async function maintainV2(now=new Date()) {
  if(process.env.ANALYTICS_MAINTENANCE_ENABLED!=="true")return;
  const exists=await pool.query("SELECT to_regclass('public.analytics_v2_snapshots') IS NOT NULL AS present");
  if(!exists.rows[0]?.present)return;
  try {
  if(v2CollectionPolicy()) {
    await pool.query(`INSERT INTO analytics_v2_snapshots(day,observed_at,total,preview,manual,premium,invalid,expires_at)
      SELECT (now() AT TIME ZONE 'UTC')::date,now(),q.total::bigint,q.preview::bigint,q.manual::bigint,q.premium::bigint,q.invalid::bigint,now()+interval '400 days'
      FROM (${currentPlanSql}) q ON CONFLICT(day) DO NOTHING`);
    // Wait until the second day of the month. Never reconstruct an unobserved month.
    const month=months(now)[0], start=new Date(`${month}-01T00:00:00Z`);
    const end=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1));
    if(now.getUTCDate()>=2 && now.getUTCDate()<=10) {
      const coverage=await pool.query(`SELECT count(*)::int AS days, EXISTS(SELECT 1 FROM analytics_v2_snapshots WHERE day < $1::date AND expires_at>now()) AS started_before FROM analytics_v2_snapshots
        WHERE day >= $1::date AND day < $2::date AND expires_at>now()`,[utcCalendarDate(start),utcCalendarDate(end)]);
      if(coverage.rows[0]?.started_before && coverage.rows[0]?.days===(end.getTime()-start.getTime())/86400000) {
        const rows=await pool.query(`SELECT s.service,count(DISTINCT s.actor_id)::int AS contributors
          FROM analytics_v2_signals s JOIN analytics_v2_actors a ON a.id=s.actor_id JOIN users u ON u.id=a.user_id
          WHERE s.kind='service_added' AND s.occurred_at >= $1 AND s.occurred_at < $2
          AND s.expires_at>now() AND u.deletion_scheduled_for IS NULL GROUP BY s.service`,[start,end]);
        const cells=suppressSegments(serviceCatalog.map(s=>({service:s.slug,contributors:rows.rows.find(r=>r.service===s.slug)?.contributors??0})));
        await pool.query(`INSERT INTO analytics_v2_service_months(month,cells,expires_at) VALUES($1,$2::jsonb,$1::date+interval '1 month 400 days')
          ON CONFLICT(month) DO NOTHING`,[utcCalendarDate(start),JSON.stringify(cells)]);
      }
    }
  }
  } finally {
  const failed:string[]=[];
  // Each expiry statement autocommits independently. One failure must not starve
  // unrelated retention classes; orphan cleanup retains its own locked transaction.
  for(const table of ["analytics_v2_signals","analytics_v2_snapshots","analytics_v2_flows","analytics_v2_service_months"]) {
    try {await pool.query(`DELETE FROM ${table} WHERE ctid IN (SELECT ctid FROM ${table} WHERE expires_at<=now() LIMIT 5000)`);}
    catch {failed.push(table);}
  }
  try {await cleanupV2OrphanActors();}catch {failed.push("analytics_v2_actors");}
  // Fixed class names only, no database error text or customer data. The existing
  // maintenance caller catches this and reports incomplete maintenance.
  if(failed.length)throw new Error(`Analytics v2 cleanup incomplete: ${failed.join(", ")}`);
  }
}
export function historyBuckets(range:string, snapshots:Array<Record<string,any>>, flows:Array<Record<string,any>>,now=new Date()) {
  const {start,end}=windowFor(range,now), buckets=[];
  for(let at=new Date(start);at<end;) {
    const next=range==="12m"?new Date(Date.UTC(at.getUTCFullYear(),at.getUTCMonth()+1,1)):new Date(at.getTime()+86400000);
    const key=at.toISOString().slice(0,10), last=new Date(next.getTime()-86400000).toISOString().slice(0,10);
    const snap=snapshots.find(s=>s.day===last); // Month-end observed stock, never sum or interpolation.
    const periodFlows=flows.filter(f=>f.day>=key&&f.day<=last);
    buckets.push({period:range==="12m"?key.slice(0,7):key,
      plans:snap?{...planDistribution(snap),observedAt:snap.observed_at}:unavailable("insufficient history"),
      // Observed flows, not an assertion of complete capture or zero when no signal exists.
      flows:periodFlows.length?Object.fromEntries([...new Set(periodFlows.map(f=>f.metric))].map(metric=>[metric,periodFlows.filter(f=>f.metric===metric).reduce((sum,f)=>sum+count(f.count),0)])):null});
    at=next;
  }
  return buckets;
}
export async function pushState() {
  try {
    const result=await pool.query(`SELECT count(*)::text AS endpoints FROM notification_endpoints e
      JOIN users u ON u.id=e.user_id WHERE e.channel='PUSH' AND e.enabled=true AND u.deletion_scheduled_for IS NULL`);
    return {state:"available",registeredEnabledEndpoints:count(result.rows[0]?.endpoints)};
  } catch {return unavailable("Registered endpoint aggregate unavailable; no OS permission or delivery inference.");}
}
export async function globalReport(range:string) {
  const current=await pool.query(currentPlanSql);
  const {start,end}=windowFor(range);
  const exists=await pool.query("SELECT to_regclass('public.analytics_v2_snapshots') IS NOT NULL AS present");
  let snapshots:Record<string,any>[]=[], flows:Record<string,any>[]=[];
  if(exists.rows[0]?.present) {
    snapshots=(await pool.query(`SELECT to_char(day,'YYYY-MM-DD') AS day,observed_at,total,preview,manual,premium,invalid
      FROM analytics_v2_snapshots WHERE day >= $1::date AND day < $2::date AND expires_at>now() ORDER BY day`,[utcCalendarDate(start),utcCalendarDate(end)])).rows;
    flows=(await pool.query(`SELECT to_char(day,'YYYY-MM-DD') AS day,metric,count FROM analytics_v2_flows
      WHERE day >= $1::date AND day < $2::date AND expires_at>now() ORDER BY day,metric`,[utcCalendarDate(start),utcCalendarDate(end)])).rows;
  }
  return {range, current:planDistribution(current.rows[0]), push:await pushState(), history:historyBuckets(range,snapshots,flows), months:months(),
    collectionEnabled:!!v2CollectionPolicy(), historyState:exists.rows[0]?.present?"forward-only":"migration-required", semantics:"Recorded best-effort flows; gaps are unavailable. Plan stock is the first actual observation on the indicated day. Paid means membership, not revenue.",
    unavailable:{activeUsers:"No qualifying foreground instrumentation; account existence is not activity.",
      retention:"No qualifying D7/D30 activity signal; no cohorts fabricated.", selectedMarkets:"No qualifying selected-market foreground instrumentation.",
      noResult:"No current mobile search instrumentation; absent observations do not mean zero searches.",

      push:"No receipt-based device delivery or OS permission signal.",technicalHealth:"No approved general API error counter; AI route outcomes only."}};
}
// Historical membership and suppression belong to the finalized record, not today's catalog.
// Slugs are stable identities, not free-text labels; construct output field by field.
export function parseFinalizedServiceCells(input:unknown) {
  if(!Array.isArray(input))throw new Error("DATA_QUALITY");
  const seen=new Set<string>();
  return input.map(value=>{
    if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("DATA_QUALITY");
    const cell=value as Record<string,unknown>,service=cell.service;
    if(typeof service!=="string"||service.length>128||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(service)||seen.has(service))throw new Error("DATA_QUALITY");
    seen.add(service);
    const keys=cell.state==="available"?["service","state","contributors"]:["service","state"];
    if(Object.keys(cell).length!==keys.length||Object.keys(cell).some(key=>!keys.includes(key)))throw new Error("DATA_QUALITY");
    if(cell.state==="suppressed")return {service,state:"suppressed" as const};
    if(cell.state!=="available"||!Number.isSafeInteger(cell.contributors)||(cell.contributors as number)<10)throw new Error("DATA_QUALITY");
    return {service,state:"available" as const,contributors:cell.contributors as number};
  });
}

export async function segmentReport(report:string,month:string) {
  if(report==="selected-markets")return {month,report,...unavailable("Qualifying selected-market foreground signal is not instrumented; this is not physical geography.")};
  const exists=await pool.query("SELECT to_regclass('public.analytics_v2_service_months') IS NOT NULL AS present");
  if(!exists.rows[0]?.present)return {month,report,...unavailable("insufficient history")};
  const result=await pool.query("SELECT cells FROM analytics_v2_service_months WHERE month=$1::date AND expires_at>now()",[`${month}-01`]);
  if(!result.rows[0])return {month,report,...unavailable("incomplete period or insufficient history")};
  const cells=parseFinalizedServiceCells(result.rows[0].cells);
  return {month,report,state:"available",cells,semantics:"Distinct current contributors adding each canonical service; non-exclusive; no remainder. Finalized best-effort observations, not anonymous."};
}
