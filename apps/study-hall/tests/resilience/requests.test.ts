import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client/index";
import { toApiErrorResponse } from "../../lib/api-error-response";
import { withApiHandler } from "../../lib/api-handler";
import { badRequest } from "../../lib/errors";
import { loadWithMocks } from "../helpers/module-mocks";

test("unexpected failures expose only a Korean fallback and a trace id, never SQL or secrets", async (t) => {
  const log = t.mock.method(console, "error", () => undefined);
  for (const error of [new Error("postgres://admin:secret@private-db SELECT student_phone"), new TypeError("private-token"), null,
    new Prisma.PrismaClientKnownRequestError("private SQL", { code: "P2024", clientVersion: "test" })]) {
    const response = toApiErrorResponse(error, "저장에 실패했습니다.", 500);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "저장에 실패했습니다." });
    assert.match(response.headers.get("x-error-id") ?? "", /^[a-f0-9-]{36}$/);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  }
  const logs = JSON.stringify(log.mock.calls.map((call) => call.arguments));
  assert.doesNotMatch(logs, /secret|private|student_phone|SELECT|postgres/);
  assert.match(logs, /P2024/);
  assert.equal(log.mock.callCount(), 4);
});

test("expected validation and unique conflicts retain useful messages and status", async (t) => {
  const log = t.mock.method(console, "error", () => undefined);
  const expected = toApiErrorResponse(badRequest("날짜를 확인해주세요."));
  assert.equal(expected.status, 400);
  assert.deepEqual(await expected.json(), { error: "날짜를 확인해주세요." });
  const invalid = z.string().min(1, "필수 입력입니다.").safeParse("");
  assert.equal(invalid.success, false);
  if (!invalid.success) assert.deepEqual(await toApiErrorResponse(invalid.error).json(), { error: "필수 입력입니다." });
  assert.equal(log.mock.callCount(), 0);
  const duplicate = toApiErrorResponse(new Prisma.PrismaClientKnownRequestError("SQL with private data", { code: "P2002", clientVersion: "test" }));
  assert.equal(duplicate.status, 409);
  assert.deepEqual(await duplicate.json(), { error: "이미 등록된 데이터입니다." });
});

test("HTTP boundary preserves successful responses and catches async rejection", async (t) => {
  t.mock.method(console, "error", () => undefined);
  const expected = new Response("saved", { status: 201 });
  assert.equal(await withApiHandler(async () => expected, "오류")(), expected);
  const failed = await withApiHandler(async () => { throw new Error("private"); }, "실패했습니다.")();
  assert.equal(failed.status, 500);
  assert.deepEqual(await failed.json(), { error: "실패했습니다." });
});

test("login and session APIs return JSON if their data source is unavailable", async (t) => {
  t.mock.method(console, "error", () => undefined);
  for (const endpoint of ["login", "me"]) {
    const loaded = loadWithMocks<{ POST?: (r: NextRequest) => Promise<Response>; GET?: () => Promise<Response> }>(`../../app/api/auth/${endpoint}/route`, {
      "../../lib/auth": { getCurrentAdminSession: async () => { throw new Error("secret"); } },
      "../../lib/mock-data": { isMockMode: () => true },
      "../../lib/mock-store": { readMockState: async () => { throw new Error("secret"); } },
    });
    try {
      const response = endpoint === "me" ? await loaded.module.GET!() : await loaded.module.POST!(new NextRequest("http://localhost/api/auth/login", {
        method: "POST", body: JSON.stringify({ email: "test@example.com", password: "test-password" }), headers: { "Content-Type": "application/json" },
      }));
      assert.equal(response.status, 500);
      assert.doesNotMatch(JSON.stringify(await response.json()), /secret/);
    } finally { loaded.restore(); }
  }
});

test("feature lookup failure cannot enable a disabled or unknown feature", async (t) => {
  t.mock.method(console, "error", () => undefined);
  const loaded = loadWithMocks<typeof import("../../lib/division-feature-guard")>("../../lib/division-feature-guard", {
    "../../lib/services/settings.service": { getDivisionFeatureSettings: async () => { throw new Error("private database host"); } },
  });
  t.after(loaded.restore);
  const error = await loaded.module.getDivisionFeatureDisabledError("police", "attendanceManagement");
  assert.equal(typeof error, "string");
  assert.doesNotMatch(error ?? "", /private|database/);
});

test("copy settings validates missing, wrong-type and dangerous slug values before any writes", async () => {
  const { divisionSettingsCopySchema } = await import("../../lib/super-admin-schemas");
  for (const input of [null, {}, { sourceSlug: 12, targetSlug: "police" }, { sourceSlug: [], targetSlug: "fire" }, { sourceSlug: "__proto__", targetSlug: "fire" }, { sourceSlug: "'; DROP TABLE students;--", targetSlug: "fire" }]) {
    assert.equal(divisionSettingsCopySchema.safeParse(input).success, false);
  }
  assert.deepEqual(divisionSettingsCopySchema.parse({ sourceSlug: " police ", targetSlug: "fire" }), { sourceSlug: "police", targetSlug: "fire" });
});
