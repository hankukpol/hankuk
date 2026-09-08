import assert from "node:assert/strict";
import { test } from "node:test";
import { loadWithMocks } from "../helpers/module-mocks";
import type { AdminSession } from "../../lib/auth";

test("API guards enforce roles, division isolation and fail closed on lookup failure", async (t) => {
  let admin: AdminSession | null = null;
  let unavailable = false;
  let studentDivision: string | null = null;
  const logged: unknown[] = [];
  const loaded = loadWithMocks<typeof import("../../lib/api-auth")>("../../lib/api-auth", {
    "../../lib/auth": {
      getCurrentAdminSession: async () => { if (unavailable) throw new Error("postgres://secret"); return admin; },
      getCurrentStudentSession: async (division: string) => studentDivision === division ? { studentId: "own-student", divisionSlug: division } : null,
    },
    "../../lib/server-log": { logServerError: (...args: unknown[]) => { logged.push(args); return "test-error-id"; } },
  });
  t.after(loaded.restore);
  const { requireApiAuth, requireStudentApiAuth, requireApiSuperAdminAuth } = loaded.module;
  assert.equal((await requireApiAuth("police")).ok, false);
  assert.deepEqual(await requireApiSuperAdminAuth(), { ok: false, status: 401, error: "관리자 로그인이 필요합니다." });
  admin = { id: "a", userId: "u", name: "관리자", role: "ADMIN", divisionId: "p", divisionSlug: "police" };
  assert.equal((await requireApiAuth("police")).ok, true);
  assert.equal((await requireApiAuth("fire")).ok, false);
  assert.equal((await requireApiSuperAdminAuth()).ok, false);
  admin.role = "ASSISTANT";
  assert.equal((await requireApiAuth("police")).ok, false);
  assert.equal((await requireApiAuth("police", ["ASSISTANT", "ADMIN", "SUPER_ADMIN"])).ok, true);
  assert.equal((await requireApiAuth("fire", ["ASSISTANT"])).ok, false);
  admin.role = "SUPER_ADMIN";
  assert.equal((await requireApiAuth("fire")).ok, true);
  assert.equal((await requireApiSuperAdminAuth()).ok, true);
  assert.equal((await requireStudentApiAuth("police")).ok, false);
  studentDivision = "police";
  assert.equal((await requireStudentApiAuth("police")).ok, true);
  assert.equal((await requireStudentApiAuth("fire")).ok, false);
  unavailable = true;
  for (const guard of [() => requireApiAuth("police"), requireApiSuperAdminAuth]) {
    const result = await guard();
    assert.equal(result.ok, false);
    if (!result.ok) { assert.equal(result.status, 503); assert.doesNotMatch(result.error, /secret|postgres/); }
  }
  assert.equal(logged.length, 2);
});
