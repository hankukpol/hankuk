import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { SignJWT } from "jose/jwt/sign";
import { NextRequest } from "next/server";
import { createAdminSessionToken, createStudentSessionToken, verifyAdminSessionToken, verifyStudentSessionToken } from "../../lib/session-tokens";
import { loadWithMocks } from "../helpers/module-mocks";

const secret = "test-only-session-secret-never-used-outside-this-worker";
const admin = { id: "admin", userId: "user", name: "테스트 관리자", role: "ADMIN" as const, divisionId: "p", divisionSlug: "police" };
const student = { studentId: "own", divisionId: "p", divisionSlug: "police", studentNumber: "test-001", name: "테스트 학생" };
const previousSecret = process.env.APP_SESSION_SECRET;
beforeEach(() => {
  process.env.APP_SESSION_SECRET = secret;
});
afterEach(() => {
  if (previousSecret === undefined) delete process.env.APP_SESSION_SECRET;
  else process.env.APP_SESSION_SECRET = previousSecret;
});

test("signed session round trips preserve identity and reject role/kind confusion", async () => {
  const adminToken = await createAdminSessionToken(admin);
  const studentToken = await createStudentSessionToken(student);
  assert.deepEqual(await verifyAdminSessionToken(adminToken), admin);
  assert.deepEqual(await verifyStudentSessionToken(studentToken), student);
  assert.equal(await verifyAdminSessionToken(studentToken), null);
  assert.equal(await verifyStudentSessionToken(adminToken), null);
});

test("expired, tampered, malformed and wrong-key tokens never authenticate", async () => {
  const token = await createAdminSessionToken(admin);
  const segments = token.split(".");
  segments[1] = Buffer.from(JSON.stringify({ ...admin, kind: "admin", role: "SUPER_ADMIN" })).toString("base64url");
  const expired = await new SignJWT({ ...admin, kind: "admin" }).setProtectedHeader({ alg: "HS256" }).setExpirationTime(1).sign(new TextEncoder().encode(secret));
  const foreign = await new SignJWT({ ...admin, kind: "admin" }).setProtectedHeader({ alg: "HS256" }).sign(new TextEncoder().encode("different-signing-secret"));
  for (const bad of ["", "not.jwt", "a.b.c", segments.join("."), expired, foreign]) assert.equal(await verifyAdminSessionToken(bad), null);
  for (const payload of [{ ...admin, role: "STAFF", kind: "admin" }, { ...admin, id: 5, kind: "admin" }, { ...student, name: null, kind: "student" }]) {
    const invalid = await new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).sign(new TextEncoder().encode(secret));
    assert.equal(await verifyAdminSessionToken(invalid), null);
    assert.equal(await verifyStudentSessionToken(invalid), null);
  }
});

test("real-mode missing or development secrets fail closed", async (t) => {
  const mode = process.env.MOCK_MODE;
  process.env.MOCK_MODE = "false";
  t.after(() => { if (mode === undefined) delete process.env.MOCK_MODE; else process.env.MOCK_MODE = mode; });
  for (const value of ["", "local-dev-session-secret"]) {
    process.env.APP_SESSION_SECRET = value;
    await assert.rejects(createAdminSessionToken(admin));
    assert.equal(await verifyAdminSessionToken("invalid"), null);
  }
});

test("middleware checks only the needed token and preserves all redirect boundaries", async (t) => {
  let adminChecks = 0;
  let studentChecks = 0;
  let currentAdmin: typeof admin | null = admin;
  const loaded = loadWithMocks<typeof import("../../middleware")>("../../middleware", {
    "../../lib/session-tokens": {
      verifyAdminSessionToken: async () => { adminChecks++; return currentAdmin; },
      verifyStudentSessionToken: async () => { studentChecks++; return student; },
    },
  });
  t.after(loaded.restore);
  const visit = (url: string) => loaded.module.middleware(new NextRequest(`http://localhost${url}`, { headers: { cookie: "tc_admin_session=admin; tc_student_session=student" } }));
  await visit("/login");
  await visit("/police/student/login");
  assert.equal(adminChecks + studentChecks, 0);
  assert.equal((await visit("/police/admin")).status, 200);
  assert.deepEqual([adminChecks, studentChecks], [1, 0]);
  assert.equal((await visit("/police/student")).status, 200);
  assert.deepEqual([adminChecks, studentChecks], [1, 1]);
  for (const url of ["/fire/admin", "/fire/assistant", "/super-admin"]) assert.equal((await visit(url)).status, 307);
  assert.match((await visit("/fire/student")).headers.get("location") ?? "", /\/fire\/student\/login/);
  currentAdmin = null;
  assert.equal((await visit("/police/admin")).status, 307);
});
