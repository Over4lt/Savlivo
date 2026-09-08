import type { IncomingMessage, ServerResponse } from "node:http";
import { privateDataPool as pool } from "./private-data-db.js";
import { getAuthUser } from "./auth.js";
import { recordAnalytics, retentionDays, collectionPolicy } from "./analytics.js";
import { parseAnalyticsEvent } from "../../../packages/contracts/src/analytics.js";
import { countryCurrencyData } from "../../../packages/contracts/src/markets.js";
import { verifiedProviderRegistry } from "./pricing-adapters.js";
import { serviceCatalog } from "../../../packages/contracts/src/catalog.js";

import {hashSession, authenticatedAdmin, beginRegistration, finishRegistration, beginAuthentication, finishAuthentication, revokeAdminSessions} from "./admin-passkeys.js";
export {hashSession, authenticatedAdmin} from "./admin-passkeys.js";
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
const loginLimit = createRateLimit(30);
const globalLoginLimit = createRateLimit(120, 1);
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
  // Hosting review is still pending: passkeys remain rehearsal-only.
  // Do not set a production deployment to development/test to bypass this gate.
  if (!["development", "test"].includes(env.NODE_ENV ?? "") || env.ADMIN_ENABLED !== "true" || env.ANALYTICS_MAINTENANCE_ENABLED !== "true" || !days || env.ADMIN_RP_ID !== origin.hostname || origin.origin !== env.ADMIN_ALLOWED_ORIGIN ||
    (origin.protocol !== "https:" && !(env.NODE_ENV !== "production" && origin.hostname === "localhost" && origin.protocol === "http:"))) return null;
  return {days, origin: origin.origin, rpID:env.ADMIN_RP_ID};
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
    // No password login in any runtime. Bootstrap tokens have enrollment-only scope.
    if (url.pathname === "/v1/admin/session" && req.method === "POST") {respond(res,404,{error:"NOT_FOUND"});return true;}
    if (url.pathname.startsWith("/v1/admin/passkeys/") && req.method === "POST") {
      if (!globalLoginLimit("passkey") || !loginLimit(req.socket.remoteAddress ?? "unknown")) {respond(res,429,{error:"RATE_LIMITED"});return true;}
      const route=url.pathname.slice("/v1/admin/passkeys/".length);
      if(!["register/options","register/verify","authenticate/options","authenticate/verify"].includes(route)){respond(res,404,{error:"NOT_FOUND"});return true;}
      const body=await boundedJson(req,32768) as Record<string,unknown>;
      const verifying=route.endsWith("/verify");
      if(!body || typeof body!=="object" || Array.isArray(body) || Object.keys(body).some(key=>!((verifying?["challengeId","response"]:[]) as string[]).includes(key)) ||
        (verifying && (typeof body.challengeId!=="string" || !body.response || typeof body.response!=="object")))throw new Error("INVALID_BODY");
      let result;
      if(route==="register/options")result=await beginRegistration(req.headers.authorization,config);
      else if(route==="authenticate/options")result=await beginAuthentication(config);
      else if(route==="register/verify")result=await finishRegistration(body.challengeId as string,body.response as Parameters<typeof finishRegistration>[1],config);
      else result=await finishAuthentication(body.challengeId as string,body.response as Parameters<typeof finishAuthentication>[1],config);
      respond(res,200,result);return true;
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
    if (url.pathname === "/v1/admin/sessions" && req.method === "DELETE") {
      await revokeAdminSessions(userId);
      await audit(userId,"sessions_revoked",config.days);
      respond(res,200,{ok:true});return true;
    }
    if (url.pathname === "/v1/admin/overview" && req.method === "GET") {
      const {market} = dashboardFilters(url);
      await audit(userId,"dashboard_read",config.days); // Failure denies the read.
      respond(res,200,await dashboardData(market));return true;
    }
    respond(res,404,{error:"NOT_FOUND"});return true;
  } catch (error) {
    if(error instanceof Error && error.message==="PASSKEY_DENIED"){respond(res,401,{error:"UNAUTHORIZED"});return true;}
    const invalid = error instanceof Error && ["INVALID_BODY","INVALID_EVENT","INVALID_FILTER"].includes(error.message) || error instanceof SyntaxError;
    respond(res,invalid ? 400 : 503,{error:invalid ? "INVALID_REQUEST" : "TEMPORARILY_UNAVAILABLE"});return true;
  }
}
