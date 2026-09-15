import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

function load(role?: string, division = "police") {
  const calls: unknown[][] = [];
  const dependencies: Record<string, unknown> = {
    zod: { z }, "next/server": { NextResponse },
    "@/lib/api-auth": { requireApiAuth: async (slug: string, roles: string[]) =>
      role && roles.includes(role) && (slug === division || role === "SUPER_ADMIN")
        ? { ok: true, session: { id: "actor", role } }
        : { ok: false, status: role ? 403 : 401, error: "권한 없음" } },
    "@/lib/division-feature-guard": { getDivisionFeatureDisabledError: async () => null },
    "@/lib/api-error-response": { toApiErrorResponse: () => NextResponse.json({ error: "실패" }, { status: 500 }) },
    "@/lib/management-policy": { kstDate: () => "2026-09-15" },
    "@/lib/services/management-policy.service": { getManagementPolicy: async () => null },
    "@/lib/services/policy-attendance.service": {
      confirmPolicyAttendance: async (...args: unknown[]) => { calls.push(args); return { confirmed: 1 }; },
      previewPolicyAttendance: async () => [],
    },
  };
  const source = readFileSync(new URL("../../app/api/[division]/management-policy/route.ts", import.meta.url), "utf8");
  const loaded = { exports: {} };
  new Function("require", "module", "exports", ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)((id: string) => {
    assert.ok(id in dependencies, id); return dependencies[id];
  }, loaded, loaded.exports);
  return { api: loaded.exports as typeof import("../../app/api/[division]/management-policy/route"), calls };
}
const request = (body: unknown) => new NextRequest("http://localhost/api/police/management-policy", { method: "POST", body: JSON.stringify(body) });

test("retired enrollment actions from an old open page cannot write records", async () => {
  for (const role of ["ADMIN", "SUPER_ADMIN"]) {
    const h = load(role);
    for (const action of ["enroll", "end-enrollment"]) {
      const response = await h.api.POST(request({ action, enrollment: { studentId: "s", periodId: "p", dateFrom: "2026-09-15", dateTo: "2026-09-30", weekdays: [2] } }), { params: { division: "police" } });
      assert.equal(response.status, 410);
    }
    assert.deepEqual(h.calls, []);
  }
});

test("enrollment removal retains staff, student and academy access boundaries", async () => {
  for (const role of [undefined, "STUDENT", "ASSISTANT", "ADMIN"]) {
    const h = load(role, "fire");
    const response = await h.api.POST(request({ action: "enroll" }), { params: { division: "police" } });
    assert.equal(response.status, role ? 403 : 401);
    assert.deepEqual(h.calls, []);
  }
});

test("the same endpoint still confirms ordinary period attendance for the authorized academy", async () => {
  const h = load("ADMIN");
  const response = await h.api.POST(request({ action: "confirm-attendance", date: "2026-09-15" }), { params: { division: "police" } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { confirmed: 1 });
  assert.deepEqual(h.calls, [["police", "2026-09-15", "actor"]]);
});
