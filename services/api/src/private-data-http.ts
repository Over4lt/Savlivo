import type { IncomingMessage, ServerResponse } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { privateDataPool as pool } from "./private-data-db.js";
import { hashPassword, verifyPassword } from "./passwords.js";
import { getAuthUser } from "./auth.js";
import { recordAnalytics, retentionDays, collectionPolicy } from "./analytics.js";
import { parseAnalyticsEvent } from "../../../packages/contracts/src/analytics.js";
import { countryCurrencyData } from "../../../packages/contracts/src/markets.js";
import { verifiedProviderRegistry } from "./pricing-adapters.js";
import { serviceCatalog } from "../../../packages/contracts/src/catalog.js";

export const hashSession = (token: string) => createHash("sha256").update(token).digest("hex");
export function createRateLimit(max: number, capacity = 5000) {
  const entries = new Map<string, {count: number; until: number}>();
  return (key: string, now = Date.now()): boolean => {
    for (const [id, entry] of entries) if (entry.until <= now) entries.delete(id);
    const entry = entries.get(key);
    if (!entry) {
      if (entries.size >= capacity) return false;
      entries.set(key, {count: 1, until: now + 60_000});
      return true;
    }
    return ++entry.count <= max;
  };
}
const dummyPasswordHash = hashPassword(randomBytes(32).toString("hex"));
const loginLimit = createRateLimit(5);
const globalLoginLimit = createRateLimit(30, 1);
const readLimit = createRateLimit(30);
const eventLimit = createRateLimit(30);
export async function boundedJson(req: IncomingMessage, maxBytes = 1024): Promise<unknown> {
  if (req.headers["content-type"]?.split(";")[0].trim().toLowerCase() !== "application/json") throw new Error("INVALID_BODY");
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += Buffer.byteLength(chunk);
    if (size > maxBytes) throw new Error("INVALID_BODY");
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
function respond(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, {"Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"});
  res.end(JSON.stringify(data));
}
export function adminConfiguration(env: NodeJS.ProcessEnv = process.env) {
  const days = retentionDays(env.ADMIN_AUDIT_RETENTION_DAYS, 30, 365);
  let origin: URL;
  try { origin = new URL(env.ADMIN_ALLOWED_ORIGIN ?? ""); } catch { return null; }
  if (env.ADMIN_ENABLED !== "true" || env.ANALYTICS_MAINTENANCE_ENABLED !== "true" || !days || origin.origin !== env.ADMIN_ALLOWED_ORIGIN ||
    (origin.protocol !== "https:" && !(env.NODE_ENV !== "production" && origin.hostname === "localhost" && origin.protocol === "http:"))) return null;
  return {days, origin: origin.origin};
}
export async function authenticatedAdmin(token: string | undefined): Promise<string | null> {
  if (!token || !/^Bearer adm_[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const result = await pool.query(`SELECT s.user_id FROM admin_sessions s
    JOIN admin_roles r ON r.user_id=s.user_id JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=$1 AND s.expires_at>now() AND r.role='analytics_reader'
    AND u.deletion_scheduled_for IS NULL`, [hashSession(token.slice(7))]);
  return result.rows[0]?.user_id ?? null;
}
async function audit(userId: string, action: string, days: number) {
  await pool.query("INSERT INTO admin_audit(user_id,action,expires_at) VALUES($1,$2,now()+$3*interval '1 day')", [userId,action,days]);
}
export function dashboardFilters(url: URL): {days: number; market: string | null} {
  if ([...url.searchParams.keys()].some(key => !["days","market"].includes(key)) ||
    url.searchParams.getAll("days").length > 1 || url.searchParams.getAll("market").length > 1) throw new Error("INVALID_FILTER");
  const days = Number(url.searchParams.get("days") ?? "30");
  const market = url.searchParams.get("market") || null;
  if (![7,30,90].includes(days) || (market && !countryCurrencyData.some(([code]) => code === market))) throw new Error("INVALID_FILTER");
  return {days,market};
}
export async function dashboardData(days: number, market: string | null) {
  // Read-only transaction + statement timeout bounds query load. All user-derived groups require 10 users.
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout = '3000ms'");
    const events = await client.query(`SELECT event, count(*)::int AS count, count(DISTINCT actor_id)::int AS actors
      FROM analytics_events WHERE occurred_at >= now()-$1*interval '1 day' AND expires_at>now()
      AND ($2::text IS NULL OR market=$2) GROUP BY event HAVING count(DISTINCT actor_id)>=10 ORDER BY event`, [days,market]);
    const subscriptions = await client.query(`SELECT currency, count(*)::int AS subscriptions,
      count(DISTINCT user_id)::int AS users, sum(monthly_price_minor)::text AS monthly_hundredths,
      count(*) FILTER(WHERE monthly_price_minor IS NULL)::int AS unknown_amounts
      FROM subscriptions WHERE status='ACTIVE' AND ($1::text IS NULL OR country_code=$1)
      GROUP BY currency HAVING count(DISTINCT user_id)>=10 ORDER BY currency`,[market]);
    const entitlements = await client.query(`SELECT e.plan,count(*)::int AS users FROM entitlements e
      JOIN users u ON u.id=e.user_id WHERE ($1::text IS NULL OR u.country_code=$1)
      GROUP BY e.plan HAVING count(*)>=10 ORDER BY e.plan`,[market]);
    const newUsers = await client.query(`SELECT count(*)::int AS count FROM users
      WHERE created_at>=now()-$1*interval '1 day' AND ($2::text IS NULL OR country_code=$2) HAVING count(*)>=10`,[days,market]);
    const serviceDistribution=await client.query(`SELECT COALESCE(svc.slug,'manual') AS service,
      bp.slug AS billing_route,count(*)::int AS subscriptions FROM subscriptions s
      LEFT JOIN services svc ON svc.id=s.service_id JOIN billing_providers bp ON bp.id=s.billing_provider_id
      WHERE s.status='ACTIVE' AND ($1::text IS NULL OR s.country_code=$1)
      GROUP BY svc.slug,bp.slug HAVING count(DISTINCT s.user_id)>=10 ORDER BY subscriptions DESC,service,billing_route LIMIT 20`,[market]);
    const storedPrices=await client.query(`SELECT verification,count(*)::int AS prices FROM verified_provider_prices
      WHERE ($1::text IS NULL OR country_code=$1) GROUP BY verification ORDER BY verification`,[market]);
    const dataQuality={selectableMarkets:countryCurrencyData.length,catalogServices:serviceCatalog.length,
      registryRows:Object.entries(verifiedProviderRegistry).filter(([country])=>!market||country===market).reduce((sum,[,rows])=>sum+rows.length,0),
      persistedPrices:storedPrices.rows};
    await client.query("COMMIT");
    return {markets: countryCurrencyData, catalogServices: serviceCatalog.length, events: events.rows,
      subscriptions: subscriptions.rows, serviceDistribution:serviceDistribution.rows, dataQuality, entitlements: entitlements.rows, newUsers: newUsers.rows[0]?.count ?? null,
      days, market, collectionEnabled: collectionPolicy() !== null,
      rawRetentionDays: collectionPolicy(), minimumCohort: 10,
      notes: ["Event counts are client-reported, not verified provider outcomes. Mobile instrumentation is not installed.",
        "Event window may be incomplete due to expiry or collection start. No DAU/retention/conversion claim is made.",
        "Subscription totals cover stored ACTIVE rows only, without scheduled/effective-date adjustment; grouped by currency in stored hundredths. Not complete current spending or Savlivo revenue.",
        "Entitlements are last stored records, not verified current paid access. Entitlements/new accounts use account country, not selected-market activity. Small cohorts are suppressed."]};
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally {client.release();}
}
export async function handlePrivateData(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const isAdmin = url.pathname.startsWith("/v1/admin/");
  if (!isAdmin && url.pathname !== "/v1/analytics/events") return false;
  try {
    if (!isAdmin) {
      res.setHeader("Access-Control-Allow-Origin", "*");
      if (req.method === "OPTIONS") {
        res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
        res.setHeader("Access-Control-Allow-Methods", "POST"); respond(res,204,{}); return true;
      }
      if (req.method !== "POST") {respond(res,405,{error:"METHOD_NOT_ALLOWED"}); return true;}
      let userId: string;
      try { userId=getAuthUser(req).id; } catch {respond(res,401,{error:"UNAUTHORIZED"}); return true;}
      if (!eventLimit(userId)) {respond(res,429,{error:"RATE_LIMITED"}); return true;}
      const event = parseAnalyticsEvent(await boundedJson(req));
      // Identity is only derived from the authenticated account; never accepted in JSON.
      recordAnalytics(userId,event);
      respond(res,202,{accepted:true}); return true;
    }
    const config = adminConfiguration();
    if (!config) {respond(res,404,{error:"NOT_FOUND"}); return true;}
    if (req.headers.origin !== config.origin) {respond(res,403,{error:"FORBIDDEN"}); return true;}
    res.setHeader("Access-Control-Allow-Origin",config.origin);
    res.setHeader("Vary","Origin");
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Headers","Authorization, Content-Type");
      res.setHeader("Access-Control-Allow-Methods","GET, POST, DELETE");respond(res,204,{});return true;
    }
    if (url.pathname === "/v1/admin/session" && req.method === "POST") {
      // Remote address is only an expiring in-memory abuse key. Never trust forwarded headers here.
      if (!globalLoginLimit("login") || !loginLimit(req.socket.remoteAddress ?? "unknown")) {respond(res,429,{error:"RATE_LIMITED"});return true;}
      const body = await boundedJson(req,1024) as Record<string,unknown>;
      if (!body || Array.isArray(body) || Object.keys(body).some(key=>!["email","password"].includes(key)) ||
        typeof body.email !== "string" || typeof body.password !== "string" || body.email.length>254 || body.password.length>256) throw new Error("INVALID_BODY");
      const user = await pool.query(`SELECT u.id,u.password_hash FROM users u JOIN admin_roles r ON r.user_id=u.id
        WHERE u.email=$1 AND r.role='analytics_reader' AND u.deletion_scheduled_for IS NULL`,[body.email.trim().toLowerCase()]);
      const passwordValid = verifyPassword(body.password,user.rows[0]?.password_hash ?? dummyPasswordHash);
      if (!user.rows[0] || !passwordValid) {respond(res,401,{error:"UNAUTHORIZED"});return true;}
      const id = user.rows[0].id;
      await audit(id,"session_created",config.days);
      const token = `adm_${randomBytes(32).toString("base64url")}`;
      await pool.query("INSERT INTO admin_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '15 minutes')",[hashSession(token),id]);
      respond(res,200,{token,expiresInSeconds:900});return true;
    }
    const userId = await authenticatedAdmin(req.headers.authorization);
    if (!userId) {respond(res,401,{error:"UNAUTHORIZED"});return true;}
    if (!readLimit(userId)) {respond(res,429,{error:"RATE_LIMITED"});return true;}
    if (url.pathname === "/v1/admin/session" && req.method === "DELETE") {
      await audit(userId,"session_closed",config.days);
      await pool.query("DELETE FROM admin_sessions WHERE token_hash=$1",[hashSession(req.headers.authorization!.slice(7))]);
      respond(res,200,{ok:true});return true;
    }
    if (url.pathname === "/v1/admin/overview" && req.method === "GET") {
      const {days,market} = dashboardFilters(url);
      await audit(userId,"dashboard_read",config.days); // Failure denies the read.
      respond(res,200,await dashboardData(days,market));return true;
    }
    respond(res,404,{error:"NOT_FOUND"});return true;
  } catch (error) {
    const invalid = error instanceof Error && ["INVALID_BODY","INVALID_EVENT","INVALID_FILTER"].includes(error.message) || error instanceof SyntaxError;
    respond(res,invalid ? 400 : 503,{error:invalid ? "INVALID_REQUEST" : "TEMPORARILY_UNAVAILABLE"});return true;
  }
}
