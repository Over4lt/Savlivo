import crypto from "node:crypto";

const KEYLEN = 64;

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, KEYLEN).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) return false;
  const actual = crypto.scryptSync(password, salt, KEYLEN);
  const expected = Buffer.from(hashHex, "hex");
  return actual.length === expected.length &&
    crypto.timingSafeEqual(actual, expected);
}
