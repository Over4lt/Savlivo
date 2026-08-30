import crypto from "node:crypto";
import type { IncomingMessage } from "node:http";

const jwtSecretFromEnv =
  process.env.JWT_SECRET?.trim();

if (
  process.env.NODE_ENV === "production" &&
  !jwtSecretFromEnv
) {
  throw new Error(
    "JWT_SECRET_REQUIRED_IN_PRODUCTION"
  );
}

const JWT_SECRET =
  jwtSecretFromEnv || "dev-only-change-me";

function b64url(input: Buffer | string) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString("base64url");
}

function signRaw(data: string) {
  return b64url(
    crypto.createHmac("sha256", JWT_SECRET).update(data).digest()
  );
}

export interface AuthUser {
  id: string;
  email: string;
}

export function createToken(user: AuthUser, ttlSeconds = 60 * 60 * 24 * 30) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      sub: user.id,
      email: user.email,
      exp: Math.floor(Date.now() / 1000) + ttlSeconds
    })
  );
  const unsigned = `${header}.${payload}`;
  return `${unsigned}.${signRaw(unsigned)}`;
}

export function verifyToken(token: string): AuthUser {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("INVALID_TOKEN");
  const [header, payload, signature] = parts;
  const unsigned = `${header}.${payload}`;
  const expected = signRaw(unsigned);

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error("INVALID_TOKEN");
  }

  const decoded = JSON.parse(
    Buffer.from(payload, "base64url").toString("utf8")
  );

  if (!decoded.sub || !decoded.email || !decoded.exp) {
    throw new Error("INVALID_TOKEN");
  }
  if (decoded.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("TOKEN_EXPIRED");
  }
  return { id: decoded.sub, email: decoded.email };
}

export function getAuthUser(req: IncomingMessage): AuthUser {
  const raw = req.headers.authorization;
  if (!raw?.startsWith("Bearer ")) throw new Error("UNAUTHORIZED");
  return verifyToken(raw.slice("Bearer ".length));
}
