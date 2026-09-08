import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

function load(options: { role?: string; disabled?: boolean; fail?: boolean } = {}) {
  const calls: unknown[][] = [];
  const dependencies: Record<string, unknown> = {
    zod: { z }, "next/server": { NextResponse }, "next/cache": { revalidatePath: () => {} },
    "@/lib/api-auth": { requireApiAuth: async (_slug: string, roles: string[]) => {
      assert.deepEqual(roles, ["ADMIN", "SUPER_ADMIN"]);
      return roles.includes(options.role ?? "") ? { ok: true, session: { role: options.role, id: "actor" } } : { ok: false, status: options.role ? 403 : 401, error: "권한 없음" };
    } },
    "@/lib/division-feature-guard": { getDivisionFeatureDisabledError: async () => options.disabled ? "비활성" : null },
    "@/lib/api-error-response": { toApiErrorResponse: (error: unknown) => NextResponse.json({ error: "처리 실패" }, { status: error instanceof z.ZodError ? 400 : 500 }) },
    "@/lib/services/exam-import.service": Object.fromEntries(["listExamImports", "deleteExamImport"].map((name) => [name, async (...args: unknown[]) => { calls.push([name, ...args]); if (options.fail) throw Error("private DB detail"); return name === "listExamImports" ? [] : { removedStudents: 2, keptManualScores: 1 }; }])),
  };
  const source = readFileSync(new URL("../../lib/exam-import-history-route.ts", import.meta.url), "utf8");
  const module = { exports: {} };
  new Function("require", "module", "exports", ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)((id: string) => { assert.ok(id in dependencies, id); return dependencies[id]; }, module, module.exports);
  return { api: module.exports as typeof import("../../lib/exam-import-history-route"), calls };
}
const req = (query = "") => new NextRequest(`http://localhost/api/a/exam-imports${query}`);

test("import history and deletion deny assistants, students and disabled features before service calls", async () => {
  for (const options of [{}, { role: "ASSISTANT" }, { role: "STUDENT" }, { role: "ADMIN", disabled: true }]) {
    const h = load(options);
    for (const id of [undefined, "session"]) {
      const response = await h.api.handleExamImportHistory(req(), "a", id);
      assert.equal(response.status, options.role ? 403 : 401);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
    }
    assert.equal(h.calls.length, 0);
  }
});
test("history query and deletion IDs are bounded; deletion returns protected manual count", async () => {
  const h = load({ role: "ADMIN" });
  assert.equal((await h.api.handleExamImportHistory(req("?examTypeId="), "a")).status, 400);
  assert.equal((await h.api.handleExamImportHistory(req(), "a", " ")).status, 400);
  assert.equal(h.calls.length, 0);
  const history = await h.api.handleExamImportHistory(req("?examTypeId=type"), "a");
  assert.deepEqual(await history.json(), { history: [] });
  assert.deepEqual(h.calls[0], ["listExamImports", "a", { role: "ADMIN", id: "actor" }, { examTypeId: "type" }]);
  const removed = await h.api.handleExamImportHistory(req(), "a", "session");
  assert.deepEqual(await removed.json(), { result: { removedStudents: 2, keptManualScores: 1 } });
  assert.equal(removed.headers.get("cache-control"), "private, no-store");
});
test("history service failures stay contained and do not expose private error detail", async () => {
  const h = load({ role: "SUPER_ADMIN", fail: true });
  const response = await h.api.handleExamImportHistory(req(), "a", "session");
  assert.equal(response.status, 500);
  assert.ok(!(await response.text()).includes("private DB"));
});
