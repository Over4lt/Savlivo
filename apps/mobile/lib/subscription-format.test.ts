import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { URL } from "node:url";
import vm from "node:vm";
import ts from "typescript";

test("current API wrapper requests modern manual identity and retains auth", async () => {
  const source = readFileSync(new URL("../src/api.ts", import.meta.url), "utf8");
  const module = { exports: {} as any };
  let sent: any;
  const response = { items: [{ id: "one", serviceSlug: "manual", customServiceName: "Local TV" }] };
  const context = { module, exports: module.exports, process: { env: {} }, __DEV__: false,
    require: () => ({ getItem: async () => "test-token" }),
    fetch: async (_url: string, init: any) => { sent = init; return { ok: true, json: async () => response }; } };
  vm.runInNewContext(ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }), context);
  assert.equal(await module.exports.api("/v1/subscriptions"), response);
  assert.equal(sent.headers["x-savlivo-subscription-format"], "manual-v1");
  assert.equal(sent.headers.authorization, "Bearer test-token");
});
