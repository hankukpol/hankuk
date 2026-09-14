// Run only against the disposable PostgreSQL container documented in the release note.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PrismaClient, Prisma } from "@prisma/client";
import { z } from "zod";
import ts from "typescript";
import * as policyMeta from "../lib/management-policy";
import * as dates from "../lib/date-utils";
import * as errors from "../lib/errors";
import * as perfectAttendance from "../lib/perfect-attendance";
import { mapPolicy } from "./restart-police-policy";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(url.hostname, "study-hall-fix-postgres", "Only the disposable test database is allowed");
assert.equal(url.pathname, "/fix_review");
assert.equal(process.env.MOCK_MODE, "false");
const prisma = new PrismaClient();
const manifest = JSON.parse(readFileSync("docs/policies/restart-police-v3.1.json", "utf8"));
const suffix = randomUUID().slice(0, 8);
const slug = `review-${suffix}`;
const nextDay = (day: string, offset: number) => new Date(new Date(`${day}T00:00:00Z`).getTime() + offset * 86400000).toISOString().slice(0, 10);
const toDate = (day: string) => new Date(`${day}T00:00:00Z`);
const future = nextDay(policyMeta.kstDate(), 3);
const yesterday = nextDay(policyMeta.kstDate(), -1);
const dependencies: Record<string, unknown> = {
  react: { cache: (fn: unknown) => fn },
  "@prisma/client": { Prisma },
  "node:crypto": { randomUUID },
  "@/lib/perfect-attendance": perfectAttendance,
  zod: { z },
  "@/lib/management-policy": policyMeta,
  "@/lib/date-utils": dates,
  "@/lib/errors": errors,
  "@/lib/mock-data": { isMockMode: () => false },
  "@/lib/mock-store": {},
  "@/lib/service-helpers": { getPrismaClient: async () => prisma, normalizeOptionalText: (text?: string) => text?.trim() || null },
  "@/lib/revalidation": { revalidateDivisionOperationalViews() {} },
  "@/lib/services/attendance.service": { syncAttendanceDerivedPoints: async () => {} },
  "@/lib/services/period.service": {},
  "@/lib/services/settings.service": { getDivisionSettings: async () => ({ holidayLimit: 2, halfDayLimit: 2, healthLimit: 1 }) },
};
function load<T>(name: string): T {
  const code = ts.transpileModule(readFileSync(`lib/services/${name}.service.ts`, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", code)((id: string) => {
    assert.ok(id in dependencies, `Unisolated dependency: ${id}`);
    return dependencies[id];
  }, mod, mod.exports);
  return mod.exports as T;
}

async function main() {
  const division = await prisma.division.create({ data: { slug, name: "검증", fullName: "격리 검증", color: "#123456" } });
  const foreign = await prisma.division.create({ data: { slug: `${slug}-other`, name: "타직렬", fullName: "격리 검증 타직렬", color: "#123456" } });
  const actor = await prisma.admin.create({ data: { userId: randomUUID(), divisionId: division.id, role: "ADMIN", name: "검증 관리자" } });
  const student = await prisma.student.create({ data: { divisionId: division.id, name: "검증 학생", studentNumber: "fixture-1" } });
  const periods = await Promise.all(manifest.periods.map((period: { name: string; displayOrder: number; startTime: string; endTime: string }) =>
    prisma.period.create({ data: { divisionId: division.id, name: period.name, displayOrder: period.displayOrder, startTime: period.startTime, endTime: period.endTime } })));
  const policy = mapPolicy(manifest, periods);
  policy.managerConfirmsAttendance = false;
  const policyDay = nextDay(yesterday, -((toDate(yesterday).getUTCDay() + 6) % 7)); // last Monday, controlled under the manifest
  policy.effectiveFrom = policyDay;
  dependencies["@/lib/services/management-policy.service"] = { getManagementPolicy: async (requested: string) => requested === slug ? policy : null };
  for (const rule of manifest.rules) await prisma.pointRule.create({ data: { id: `${rule.id}-${suffix}`, divisionId: division.id, name: rule.name, category: rule.category, points: rule.points } });
  for (const key of ["tardyRuleId", "fullDayAbsenceRuleId", "partialAbsenceRuleId"] as const) if (policy[key]) policy[key] = `${policy[key]}-${suffix}`;
  const period = periods.find(row => row.startTime === "09:15")!;
  const original = await prisma.attendance.create({ data: { studentId: student.id, periodId: period.id, date: toDate(future), status: "EXCUSED", reason: "수업: 기본이론", recordedById: actor.id } });
  const leave = load<typeof import("../lib/services/leave.service")>("leave");
  const permission = await leave.createLeavePermission(slug, actor, { studentId: student.id, type: "HOLIDAY", date: future });
  assert.ok(permission);
  assert.ok((await prisma.leavePermission.findUniqueOrThrow({ where: { id: permission.id } })).attendanceSnapshot);
  await assert.rejects(leave.cancelLeavePermission(`${slug}-other`, permission.id, actor), /찾을 수 없습니다/);
  assert.equal((await prisma.attendance.findUniqueOrThrow({ where: { id: original.id } })).status, "HOLIDAY");
  // A stale attendance save must not overwrite a newly approved holiday.
  await assert.rejects(prisma.attendance.upsert({
    where: { student: { divisionId: division.id }, status: { notIn: ["HOLIDAY", "HALF_HOLIDAY"] }, studentId_periodId_date: { studentId: student.id, periodId: period.id, date: toDate(future) } },
    create: { studentId: student.id, periodId: period.id, date: toDate(future), status: "PRESENT" },
    update: { status: "PRESENT" },
  }));
  await leave.cancelLeavePermission(slug, permission.id, actor);
  const restored = await prisma.attendance.findUniqueOrThrow({ where: { id: original.id } });
  assert.equal(restored.status, "EXCUSED");
  assert.equal(restored.reason, "수업: 기본이론");
  assert.equal(restored.recordedById, actor.id);
  const another = await leave.createLeavePermission(slug, actor, { studentId: student.id, type: "HOLIDAY", date: future });
  await prisma.attendance.update({ where: { id: original.id }, data: { status: "PRESENT", reason: "승인 이후 별도 확인" } });
  await leave.cancelLeavePermission(slug, another!.id, actor);
  assert.equal((await prisma.attendance.findUniqueOrThrow({ where: { id: original.id } })).status, "PRESENT");
  console.log("PASS PostgreSQL: approval snapshot, cancellation restores class, foreign tenant blocked, later edits preserved, stale write blocked");

  for (const selected of periods.filter(row => policy.attendancePeriodIds.includes(row.id))) {
    await prisma.attendance.create({ data: { studentId: student.id, periodId: selected.id, date: toDate(policyDay), status: "ABSENT", recordedById: null } });
  }
  dependencies["@/lib/services/policy-attendance.service"] = load<typeof import("../lib/services/policy-attendance.service")>("policy-attendance");
  dependencies["@/lib/services/perfect-attendance.service"] = load<typeof import("../lib/services/perfect-attendance.service")>("perfect-attendance");
  const closer = load<typeof import("../lib/services/attendance-close.service")>("attendance-close");
  await closer.closeDivisionAttendance(slug);
  const records = await prisma.pointRecord.findMany({ where: { studentId: student.id } });
  assert.equal(records.length, 1);
  assert.equal(records[0].points, manifest.rules.find((rule: { id: string }) => `${rule.id}-${suffix}` === policy.fullDayAbsenceRuleId).points);
  await closer.closeDivisionAttendance(slug);
  assert.equal(await prisma.pointRecord.count({ where: { studentId: student.id } }), 1);
  assert.equal((await prisma.attendanceCloseState.findUniqueOrThrow({ where: { divisionId: division.id } })).closedThrough.toISOString().slice(0, 10), yesterday);
  assert.equal(await prisma.attendanceCloseState.findUnique({ where: { divisionId: foreign.id } }), null);
  console.log("PASS PostgreSQL: past-day closure, null recorder fallback, idempotency and tenant-scoped checkpoint");

  const meritStudent = await prisma.student.create({ data: { divisionId: division.id, name: "개근 검증", studentNumber: `merit-${suffix}` } });
  const meritService = dependencies["@/lib/services/perfect-attendance.service"] as typeof import("../lib/services/perfect-attendance.service");
  for (let day = policyDay; day <= yesterday; day = nextDay(day, 1)) {
    for (const selected of periods) {
      if (!policyMeta.isControlledPeriod(policy, selected.id, day, meritStudent.id)) continue;
      await prisma.attendance.create({ data: { studentId: meritStudent.id, periodId: selected.id, date: toDate(day), status: "EXCUSED", reason: "수업: 검증", recordedById: actor.id } });
    }
  }
  const awards = { perfectAttendanceWeeklyPts: 2, perfectAttendanceMonthlyPts: 0 };
  await meritService.syncPeriodicPerfectAttendancePoints(slug, yesterday, actor.id, policy, awards);
  const awarded = await prisma.pointRecord.findMany({ where: { studentId: meritStudent.id } });
  const expected = perfectAttendance.buildPerfectAttendanceAwards({ windows: perfectAttendance.perfectAttendanceWindows(yesterday), policy, periods, studentIds: [meritStudent.id], records: (await prisma.attendance.findMany({ where: { studentId: meritStudent.id } })).map(row => ({ ...row, date: row.date.toISOString().slice(0, 10) })), weeklyPts: 2, monthlyPts: 0, now: new Date() });
  assert.equal(awarded.length, expected.length);
  await meritService.syncPeriodicPerfectAttendancePoints(slug, yesterday, actor.id, policy, awards);
  assert.equal(await prisma.pointRecord.count({ where: { studentId: meritStudent.id } }), awarded.length);
  await prisma.student.update({ where: { id: meritStudent.id }, data: { status: "WITHDRAWN" } });
  await meritService.syncPeriodicPerfectAttendancePoints(slug, yesterday, actor.id, policy, { ...awards, perfectAttendanceWeeklyPts: 0 });
  assert.equal(await prisma.pointRecord.count({ where: { studentId: meritStudent.id } }), awarded.length, "inactive history is preserved");
  console.log(`PASS PostgreSQL: class-only weekly merits (${awarded.length}), idempotency, inactive history preservation`);
}

main().finally(() => prisma.$disconnect()).catch(error => { console.error(error); process.exitCode = 1; });
