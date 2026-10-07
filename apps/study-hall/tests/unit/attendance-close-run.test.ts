import assert from "node:assert/strict";
import test from "node:test";

import * as policy from "../../lib/management-policy";
import { readFileSync } from "node:fs";
import ts from "typescript";

// 출결 자동 마감을 실제로 돌려 본다(목업 저장소). 기존 cron 테스트는 경로의 인증·응답만 본다.
const react = { ...require("react"), cache: <T,>(fn: T) => fn };

// 다른 마감 테스트와 같이 소스를 변환해 require 를 가로챈다(서비스 안의 동적 import 도 가짜로 간다).
function loadService<T>(dependencies: Record<string, unknown>): { module: T; restore: () => void } {
  const code = ts.transpileModule(readFileSync("lib/services/attendance-close.service.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", code)((id: string) => {
    assert.ok(id in dependencies, `가짜로 바꾸지 않은 의존: ${id}`);
    return dependencies[id];
  }, mod, mod.exports);
  return { module: mod.exports as T, restore: () => undefined };
}

function setup(options: { failOn?: string } = {}) {
  const synced: string[] = [];
  const logged: string[] = [];
  const state = {
    divisions: [{ slug: "police", isActive: true }, { slug: "fire", isActive: true }],
    admins: [{ id: "admin", isActive: true, role: "ADMIN", divisionSlug: "police" }, { id: "admin-fire", isActive: true, role: "ADMIN", divisionSlug: "fire" }],
    attendanceByDivision: {
      police: [{ date: "2026-09-20", recordedById: "staff" }, { date: "2026-09-22", recordedById: null }],
      fire: [{ date: "2026-09-21", recordedById: "staff" }],
    },
    attendanceClosedThroughByDivision: {} as Record<string, string>,
  };
  const { module, restore } = loadService<typeof import("../../lib/services/attendance-close.service")>(
    {
      react,
      "@/lib/management-policy": { ...policy, kstDate: () => "2026-09-23" },
      "@/lib/services/management-policy.service": { getManagementPolicy: async () => null },
      "@/lib/services/settings.service": { getDivisionSettings: async () => ({}) },
      "@/lib/mock-data": { isMockMode: () => true },
      "@/lib/mock-store": {
        readMockState: async () => state,
        updateMockState: async <T,>(fn: (s: typeof state) => T) => fn(state),
      },
      "@/lib/revalidation": { revalidateDivisionOperationalViews: () => undefined },
      "@/lib/server-log": { logServerError: (scope: string) => { logged.push(scope); return `err-${logged.length}`; } },
      "@/lib/services/exam-point-close.service": { closeDivisionExamPoints: async () => undefined },
      "@/lib/services/policy-attendance.service": { applyPolicyAttendancePoints: async () => undefined },
      "@/lib/services/perfect-attendance.service": { syncPeriodicPerfectAttendancePoints: async () => ({ grantedCount: 0, revokedCount: 0 }) },
      "@/lib/services/academy-template.service": { applyDueAcademyTemplates: async () => undefined },
      "@/lib/errors": require("../../lib/errors"),
      "@/lib/service-helpers": { getPrismaClient: async () => { throw new Error("목업 경로는 DB 를 쓰지 않는다"); } },
      "@/lib/services/attendance.service": {
        syncPerfectAttendancePoints: async (slug: string, date: string, actorId: string) => {
          if (slug === "police" && date === options.failOn) throw new Error("DB 일시 오류");
          synced.push(`${slug}:${date}:${actorId}`);
          return { grantedCount: 0, revokedCount: 0 };
        },
      },
    },
  );
  return { service: module, restore, state, synced, logged };
}

test("자동 마감: 첫 기록부터 어제까지 하루씩 닫고, 기록이 있는 날만 상벌점을 맞추며, 다시 돌리면 할 일이 없다", async () => {
  const { service, restore, state, synced } = setup();
  try {
    assert.deepEqual(await service.closeDivisionAttendance("police"), { closedDays: 3, pending: false });
    assert.deepEqual(synced, ["police:2026-09-20:staff", "police:2026-09-22:admin"], "기록자가 없으면 그 학원 관리자로 마감한다");
    assert.equal(state.attendanceClosedThroughByDivision.police, "2026-09-22");
    assert.deepEqual(await service.closeDivisionAttendance("police"), { closedDays: 0, pending: false });
  } finally {
    restore();
  }
});

test("자동 마감: 실패한 날은 체크포인트를 넘기지 않고, 전체 마감은 실패를 기록한 뒤 다음 학원을 계속한다", async () => {
  const { service, restore, state, logged } = setup({ failOn: "2026-09-22" });
  try {
    const results = await service.closeAllAttendance();
    assert.equal(state.attendanceClosedThroughByDivision.police, "2026-09-21", "실패한 9/22 전까지만 닫힌다");
    const police = results.find((r) => r.division === "police")!;
    assert.equal(police.failed, true);
    assert.equal(police.errorId, "err-1", "원인을 찾을 오류 번호가 결과에 있다");
    assert.deepEqual(logged, ["cron:attendance-close:police"]);
    assert.deepEqual(results.find((r) => r.division === "fire"), { division: "fire", closedDays: 2, pending: false }, "한 학원이 실패해도 다른 학원은 마감한다(소방은 첫 기록 9/21부터 9/22까지 이틀)");
  } finally {
    restore();
  }
});
