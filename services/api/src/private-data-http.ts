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
  res.writeHead(status, {"Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY", "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'"});
  res.end(JSON.stringify(data));
}
export function adminConfiguration(env: NodeJS.ProcessEnv = process.env) {
  const days = retentionDays(env.ADMIN_AUDIT_RETENTION_DAYS, 30, 365);
  let origin: URL;
  try { origin = new URL(env.ADMIN_ALLOWED_ORIGIN ?? ""); } catch { return null; }
  // Temporary fail-closed boundary: legacy password auth is local rehearsal only.
  // Do not set a production deployment to development/test to bypass this gate.
  if (!["development", "test"].includes(env.NODE_ENV ?? "") || env.ADMIN_ENABLED !== "true" || env.ANALYTICS_MAINTENANCE_ENABLED !== "true" || !days || origin.origin !== env.ADMIN_ALLOWED_ORIGIN ||
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
export function dashboardFilters(url: URL): {market: string | null} {
  // No time windows or user-derived drilldowns: overlapping queries permit subtraction.
  if ([...url.searchParams.keys()].some(key => key !== "market") ||
    url.searchParams.getAll("market").length > 1) throw new Error("INVALID_FILTER");
  const market = url.searchParams.get("market") || null;
  if (market && !countryCurrencyData.some(([code]) => code === market)) throw new Error("INVALID_FILTER");
  return {market};
}
export async function dashboardData(market: string | null) {
  // Deliberately query no accounts, portfolios, actors or events. Suppression alone
  // cannot protect live aggregates against repeated/overlapping queries.
  const storedPrices = await pool.query(`SELECT verification,count(*)::int AS prices FROM verified_provider_prices
    WHERE ($1::text IS NULL OR country_code=$1) GROUP BY verification ORDER BY verification`, [market]);
  return {markets: countryCurrencyData, catalogServices: serviceCatalog.length,
    dataQuality: {selectableMarkets: countryCurrencyData.length, catalogServices: serviceCatalog.length,
      registryRows: Object.entries(verifiedProviderRegistry).filter(([country]) => !market || country === market)
        .reduce((sum,[,rows]) => sum + rows.length,0), persistedPrices: storedPrices.rows},
    market, collectionEnabled: collectionPolicy() !== null, rawRetentionDays: collectionPolicy(),
    disclosureModel: "non-personal-provider-coverage-only",
    notes: ["Only catalog and provider-price coverage is reported. These are not user spending or Savlivo revenue.",
      "User-derived events, accounts, entitlements, portfolios, spending and funnels are deferred because overlapping reports can disclose small changes.",
      "No user-level drilldowns or rolling time windows are available. No anonymity guarantee is claimed."]};
}
export async function handlePrivateData(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  let url: URL;
  try {url = new URL(req.url ?? "/", "http://localhost");}
  catch {respond(res,400,{error:"INVALID_REQUEST"});return true;}
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
      const token = `adm_${randomBytes(32).toString("base64url")}`;
      await pool.query(`WITH issued AS (
        INSERT INTO admin_sessions(token_hash,user_id,expires_at)
        SELECT $1,u.id,now()+interval '15 minutes' FROM users u JOIN admin_roles r ON r.user_id=u.id
        WHERE u.id=$2 AND r.role='analytics_reader' AND u.deletion_scheduled_for IS NULL
        AND u.password_hash=$4 RETURNING user_id
      ) INSERT INTO admin_audit(user_id,action,expires_at)
        SELECT user_id,'session_created',now()+$3*interval '1 day' FROM issued RETURNING user_id`,
        [hashSession(token),id,config.days,user.rows[0].password_hash]).then(result=>{
          if(result.rowCount!==1)throw new Error("ADMIN_SESSION_NOT_ISSUED");
        });
      respond(res,200,{token,expiresInSeconds:900});return true;
    }
    const userId = await authenticatedAdmin(req.headers.authorization);
    if (!userId) {respond(res,401,{error:"UNAUTHORIZED"});return true;}
    if (!readLimit(userId)) {respond(res,429,{error:"RATE_LIMITED"});return true;}
    if (url.pathname === "/v1/admin/session" && req.method === "DELETE") {
      // Revoking privilege must not depend on audit availability. Never roll this deletion back.
      await pool.query("DELETE FROM admin_sessions WHERE token_hash=$1",[hashSession(req.headers.authorization!.slice(7))]);
      await audit(userId,"session_closed",config.days);
      respond(res,200,{ok:true});return true;
    }
    if (url.pathname === "/v1/admin/overview" && req.method === "GET") {
      const {market} = dashboardFilters(url);
      await audit(userId,"dashboard_read",config.days); // Failure denies the read.
      respond(res,200,await dashboardData(market));return true;
    }
    respond(res,404,{error:"NOT_FOUND"});return true;
  } catch (error) {
    const invalid = error instanceof Error && ["INVALID_BODY","INVALID_EVENT","INVALID_FILTER"].includes(error.message) || error instanceof SyntaxError;
    respond(res,invalid ? 400 : 503,{error:invalid ? "INVALID_REQUEST" : "TEMPORARILY_UNAVAILABLE"});return true;
  }
}
