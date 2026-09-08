import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { NextRequest, NextResponse } from "next/server";
import * as schemas from "../../lib/morning-exam-analysis-schemas";

function load(options: { denied?: number; disabled?: boolean; fail?: boolean } = {}) {
  const calls: unknown[][] = [];
  const deps: Record<string, unknown> = {
    "next/server": { NextResponse },
    "./exam-analysis-route": { ANALYSIS_HEADERS: { "Cache-Control": "private, no-store" }, authorizeExamAnalysis: async () => options.denied ? { ok: false, status: options.denied, error: "거부" } : { ok: true, viewer: { role: "ADMIN" } } },
    "./division-feature-guard": { getDivisionFeatureDisabledError: async () => options.disabled ? "비활성" : null },
    "./api-error-response": { toApiErrorResponse: (e: object) => NextResponse.json({ error: "실패" }, { status: "issues" in e ? 400 : 500 }) },
    "./morning-exam-analysis-schemas": schemas,
    "./services/morning-exam-analysis.service": Object.fromEntries(["getMorningCohortAnalysis", "getMorningStudentReport"].map(name => [name, async (...args: unknown[]) => { calls.push(args); if (options.fail) throw new Error("private failure"); return { args }; }])),
  };
  const code = ts.transpileModule(readFileSync(new URL("../../lib/morning-exam-analysis-route.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", code)((id: string) => { assert.ok(id in deps, id); return deps[id]; }, module, module.exports);
  return { api: module.exports as typeof import("../../lib/morning-exam-analysis-route"), calls };
}
const request = (query = "examTypeId=t&from=2026-07-01&to=2026-09-08") => new NextRequest(`http://localhost/api/a/morning-exams/analysis?${query}`);
test("morning auth, feature and invalid range stop before any data load", async () => {
  for (const [options, status] of [[{ denied: 401 }, 401], [{ denied: 403 }, 403], [{ disabled: true }, 403]] as const) {
    const h = load(options), r = await h.api.handleMorningAnalysis(request(), "a");
    assert.equal(r.status, status); assert.equal(h.calls.length, 0); assert.equal(r.headers.get("cache-control"), "private, no-store");
  }
  const h = load();
  for (const q of ["", "examTypeId=t&from=2026-02-30", "examTypeId=t&from=2026-01-01&to=2026-09-08"]) assert.equal((await h.api.handleMorningAnalysis(request(q), "a")).status, 400);
  assert.equal(h.calls.length, 0);
});
test("morning student identity and range reach service; failures stay private", async () => {
  const h = load();
  assert.equal((await h.api.handleMorningAnalysis(request(), "a", "me")).status, 200);
  assert.deepEqual(h.calls[0], ["a", "t", "me", { from: "2026-07-01", to: "2026-09-08" }, { role: "ADMIN" }]);
  const r = await load({ fail: true }).api.handleMorningAnalysis(request(), "a");
  assert.equal(r.status, 500); assert.equal(r.headers.get("cache-control"), "private, no-store");
  assert.equal(JSON.stringify(await r.json()).includes("private failure"), false);
});
