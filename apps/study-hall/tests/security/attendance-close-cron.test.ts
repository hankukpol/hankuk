import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { timingSafeEqual } from "node:crypto";
import test from "node:test";
import { NextRequest, NextResponse } from "next/server";
import ts from "typescript";

test("automatic attendance closure fails closed and reports incomplete runs for retry", async () => {
  let calls = 0;
  let fail = false;
  let results: Array<{ pending?: boolean; failed?: boolean }> = [];
  const environment: { CRON_SECRET?: string } = {};
  const dependencies: Record<string, unknown> = {
    "node:crypto": { timingSafeEqual },
    "next/server": { NextResponse },
    "@/lib/services/attendance-close.service": { closeAllAttendance: async () => {
      calls++;
      if (fail) throw new Error("private database details");
      return results;
    } },
  };
  const code = ts.transpileModule(readFileSync("app/api/cron/attendance-close/route.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", "process", code)((id: string) => {
    assert.ok(id in dependencies, id);
    return dependencies[id];
  }, mod, mod.exports, { env: environment });
  const { GET } = mod.exports as typeof import("../../app/api/cron/attendance-close/route");
  const request = (token?: string) => new NextRequest("https://local/api/cron/attendance-close", { headers: token ? { authorization: token } : {} });
  assert.equal((await GET(request())).status, 401);
  assert.equal((await GET(request("Bearer test-secret"))).status, 503);
  environment.CRON_SECRET = "test-secret";
  for (const token of [undefined, "Bearer wrong", "Bearer test-secreX"]) assert.equal((await GET(request(token))).status, 401);
  assert.equal(calls, 0);
  const success = await GET(request("Bearer test-secret"));
  assert.equal(success.status, 200);
  assert.equal(success.headers.get("cache-control"), "no-store");
  for (const result of [{ pending: true }, { failed: true }]) {
    results = [result];
    assert.equal((await GET(request("Bearer test-secret"))).status, 503);
  }
  fail = true;
  const failure = await GET(request("Bearer test-secret"));
  assert.equal(failure.status, 503);
  assert.doesNotMatch(await failure.text(), /private database/);
});
