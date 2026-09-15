import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { loadWithMocks } from "../tests/helpers/module-mocks";
import { mapPolicy } from "./restart-police-policy";
import { examPointAutomationSchema } from "../lib/exam-point-automation";

// Opt-in only. Never inherit the application's DATABASE_URL or production env.
const target = process.env.QA_DATABASE_URL;
if (!target) throw new Error("QA_DATABASE_URL must identify a disposable local qa_ database");
const url = new URL(target);
if (!["127.0.0.1", "localhost"].includes(url.hostname) || !/^\/qa_[a-z0-9_]+$/.test(url.pathname)) {
  throw new Error("Only a local, explicitly named qa_ database is permitted");
}
const prisma = new PrismaClient({ datasources: { db: { url: target } } });
const run = `qa-${randomUUID()}`;
const august = "2026-08";
const note = `[자동정산][휴가정산:${august}] ${august} 미사용 휴가/반차 정산`;

async function main() {
  const academy = await prisma.division.create({ data: { slug: `${run}-a`, name: "QA A", fullName: "QA A", color: "#000000" } });
  const other = await prisma.division.create({ data: { slug: `${run}-b`, name: "QA B", fullName: "QA B", color: "#000000" } });
  await prisma.divisionSettings.create({ data: { divisionId: academy.id, holidayLimit: 2, holidayUnusedPts: 2, halfDayLimit: 0, halfDayUnusedPts: 0 } });
  await prisma.divisionSettings.create({ data: { divisionId: other.id, holidayLimit: 1, holidayUnusedPts: 9, halfDayLimit: 0, halfDayUnusedPts: 0 } });
  const admin = await prisma.admin.create({ data: { userId: `${run}-admin`, name: "QA", role: "ADMIN", divisionId: academy.id } });
  const actor = { id: admin.id, role: "ADMIN" as const };
  const a = await prisma.student.create({ data: { divisionId: academy.id, name: "QA A", studentNumber: "1" } });
  const b = await prisma.student.create({ data: { divisionId: other.id, name: "QA B", studentNumber: "1" } });
  const award = await prisma.pointRecord.create({ data: { studentId: a.id, points: 4, notes: note, date: new Date("2026-08-31T00:00:00Z"), recordedById: admin.id } });
  const manual = await prisma.pointRecord.create({ data: { studentId: a.id, points: 7, notes: "manual", recordedById: admin.id } });
  const otherAward = await prisma.pointRecord.create({ data: { studentId: b.id, points: 9, notes: note, recordedById: admin.id } });
  const loaded = loadWithMocks<typeof import("../lib/services/leave.service")>(require.resolve("../lib/services/leave.service"), {
    react: { cache: <T>(fn: T) => fn },
    "@/lib/mock-data": { isMockMode: () => false },
    "@/lib/service-helpers": { getPrismaClient: async () => prisma, normalizeOptionalText: (value?: string) => value?.trim() || null },
    "@/lib/services/settings.service": { getDivisionSettings: async (slug: string) => prisma.divisionSettings.findFirstOrThrow({ where: { division: { slug } } }) },
    "@/lib/services/management-policy.service": { getManagementPolicy: async () => null },
    "@/lib/services/period.service": { getPeriods: async () => [] },
    "@/lib/services/attendance.service": { syncAttendanceDerivedPoints: async () => [] },
    "@/lib/revalidation": { revalidateDivisionOperationalViews() {} },
  });
  try {
    const service = loaded.module;
    const create = (date: string) => service.createLeavePermission(academy.slug, actor, { studentId: a.id, type: "HOLIDAY", date, reason: "QA" });
    const results = await Promise.allSettled([create("2026-08-10"), create("2026-08-10")]);
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(await prisma.leavePermission.count({ where: { studentId: a.id } }), 1);
    assert.equal((await prisma.pointRecord.findUniqueOrThrow({ where: { id: award.id } })).points, 2);
    const permission = await prisma.leavePermission.findFirstOrThrow({ where: { studentId: a.id } });
    await assert.rejects(service.cancelLeavePermission(other.slug, permission.id, actor), /찾을 수 없습니다/);

    // Database constraint forces a real write failure after cancellation has begun.
    // The constraint exists only in the disposable database and is removed in finally.
    await prisma.$executeRawUnsafe(`ALTER TABLE point_records ADD CONSTRAINT qa_block_restore CHECK (id <> '${award.id}' OR points <> 4)`);
    try {
      await assert.rejects(service.cancelLeavePermission(academy.slug, permission.id, actor), /qa_block_restore/);
      assert.notEqual((await prisma.leavePermission.findUniqueOrThrow({ where: { id: permission.id } })).status, "REJECTED");
      assert.equal((await prisma.pointRecord.findUniqueOrThrow({ where: { id: award.id } })).points, 2);
    } finally {
      await prisma.$executeRawUnsafe("ALTER TABLE point_records DROP CONSTRAINT qa_block_restore");
    }
    await service.cancelLeavePermission(academy.slug, permission.id, actor);
    assert.equal((await prisma.pointRecord.findUniqueOrThrow({ where: { id: award.id } })).points, 4);
    const updated = await prisma.leavePermission.findUniqueOrThrow({ where: { id: permission.id } });
    assert.equal(updated.status, "REJECTED");
    const history = updated.attendanceSnapshot as { settlementCorrections: Array<{ changes: unknown[] }> };
    assert.equal(history.settlementCorrections.length, 2);
    assert.equal((await prisma.pointRecord.findUniqueOrThrow({ where: { id: manual.id } })).points, 7);
    assert.equal((await prisma.pointRecord.findUniqueOrThrow({ where: { id: otherAward.id } })).points, 9);
    const otherAdmin = await prisma.admin.create({ data: { userId: `${run}-other-admin`, name: "QA B", role: "ADMIN", divisionId: other.id } });
    const otherActor = { id: otherAdmin.id, role: "ADMIN" as const };
    const otherLeave = await service.createLeavePermission(other.slug, otherActor, { studentId: b.id, type: "HOLIDAY", date: "2026-08-11", reason: "QA B" });
    assert.equal((await prisma.pointRecord.findUniqueOrThrow({ where: { id: otherAward.id } })).points, 0);
    await service.cancelLeavePermission(other.slug, otherLeave!.id, otherActor);
    assert.equal((await prisma.pointRecord.findUniqueOrThrow({ where: { id: otherAward.id } })).points, 9);
    assert.equal((await prisma.pointRecord.findUniqueOrThrow({ where: { id: award.id } })).points, 4);
    const period = await prisma.period.create({ data: { divisionId: academy.id, name: "QA period", displayOrder: 1, startTime: "09:00", endTime: "10:00" } });
    const manifest = JSON.parse(readFileSync("docs/policies/restart-police-v3.1.json", "utf8"));
    const policy = mapPolicy(manifest, manifest.periods.map((item: { startTime: string }) => ({ ...item, id: item.startTime })));
    policy.effectiveFrom = "2026-08-01";
    policy.controlledPeriods = [{ periodId: period.id, weekdays: [1, 2, 3, 4, 5], optional: false }];
    policy.attendancePeriodIds = [period.id];
    policy.morningExam.periodId = "no-morning-period";
    await prisma.attendance.createMany({ data: Array.from({ length: 31 }, (_, index) => ({ studentId: a.id, periodId: period.id, date: new Date(Date.UTC(2026, 7, index + 1)), status: "PRESENT" as const, recordedById: admin.id })) });
    const perfect = loadWithMocks<typeof import("../lib/services/perfect-attendance.service")>(require.resolve("../lib/services/perfect-attendance.service"), {
      "@/lib/mock-data": { isMockMode: () => false },
      "@/lib/service-helpers": { getPrismaClient: async () => prisma },
    });
    try {
      const sync = () => perfect.module.syncPeriodicPerfectAttendancePoints(academy.slug, "2026-08-31", admin.id, policy, { perfectAttendanceWeeklyPts: 2, perfectAttendanceMonthlyPts: 3 });
      const automated = () => prisma.pointRecord.findMany({ where: { studentId: a.id, notes: { startsWith: "[자동]" } }, orderBy: { notes: "asc" } });
      await Promise.all([sync(), sync(), sync()]);
      assert.deepEqual((await automated()).map(record => record.points).sort(), [2, 3]);
      const ids = (await automated()).map(record => record.id);
      await sync();
      assert.deepEqual((await automated()).map(record => record.id), ids);
      await prisma.attendance.updateMany({ where: { studentId: a.id, date: new Date("2026-08-25T00:00:00Z") }, data: { status: "HOLIDAY" } });
      await sync();
      assert.equal((await automated()).length, 0);
      await prisma.attendance.updateMany({ where: { studentId: a.id, date: new Date("2026-08-25T00:00:00Z") }, data: { status: "PRESENT" } });
      await sync();
      assert.deepEqual((await automated()).map(record => record.points).sort(), [2, 3]);
    } finally { perfect.restore(); }
    // Execute the real exam source queries and point reconciliation as well.
    await prisma.student.update({ where: { id: a.id }, data: { courseStartDate: new Date("2026-08-01T00:00:00Z") } });
    const absenceRule = await prisma.pointRule.create({ data: { divisionId: academy.id, name: "QA missed exam", category: "DEMERIT", points: -1 } });
    const config = examPointAutomationSchema.parse({ enabled: true, effectiveFrom: "2026-08-01", morningStartDate: "2026-08-01", morningWeekdays: [1], morningAbsenceRuleId: absenceRule.id });
    await prisma.divisionSettings.update({ where: { divisionId: academy.id }, data: { examPointAutomation: config } });
    const examType = await prisma.examType.create({ data: { divisionId: academy.id, name: "QA morning", category: "MORNING" } });
    const session = await prisma.examSession.create({ data: { divisionId: academy.id, examTypeId: examType.id, identityKey: run, examDate: new Date("2026-08-24T00:00:00Z"), itemCount: 1, fullScore: 100, externalCohortSize: 1, externalStats: {}, sourceFileName: "QA", importedById: admin.id } });
    await prisma.leavePermission.create({ data: { studentId: a.id, type: "OUTING", status: "APPROVED", date: session.examDate, approvedById: admin.id } });
    const exams = loadWithMocks<typeof import("../lib/services/exam-point.service")>(require.resolve("../lib/services/exam-point.service"), {
      "@/lib/mock-data": { isMockMode: () => false },
      "@/lib/service-helpers": { getPrismaClient: async () => prisma },
      "@/lib/revalidation": { revalidateDivisionOperationalViews() {} },
    });
    try {
      const sync = () => prisma.$transaction(tx => exams.module.syncDbExamPoints(tx, academy.id, "2026-08", admin.id), { timeout: 30000 });
      const penalties = () => prisma.pointRecord.findMany({ where: { studentId: a.id, ruleId: absenceRule.id } });
      await Promise.all([sync(), sync(), sync()]);
      assert.deepEqual((await penalties()).map(record => record.points), [-1], "outing is not exam exemption; concurrent runs must not duplicate");
      const penaltyId = (await penalties())[0].id;
      await sync();
      assert.equal((await penalties())[0].id, penaltyId);
      await prisma.attendance.updateMany({ where: { studentId: a.id, date: session.examDate }, data: { status: "EXCUSED", reason: "시험 사유 승인" } });
      await sync();
      assert.equal((await penalties()).length, 0, "approved absence revokes automatic penalty");
      await prisma.attendance.updateMany({ where: { studentId: a.id, date: session.examDate }, data: { status: "PRESENT", reason: null } });
      await sync();
      assert.equal((await penalties()).length, 1, "normal study attendance alone is not an exam result");
      await prisma.examSessionParticipant.create({ data: { divisionId: academy.id, sessionId: session.id, studentId: a.id, subjectScores: {}, totalScore: 0, isPartial: false } });
      await sync();
      assert.equal((await penalties()).length, 0, "a graded zero score still counts as participation");
      const morning = await prisma.period.create({ data: { divisionId: academy.id, name: "QA morning", displayOrder: 0, startTime: "08:30", endTime: "09:00" } });
      policy.morningExam = { periodId: morning.id, weekdays: [1], syncAttendance: true };
      await prisma.divisionSettings.update({ where: { divisionId: academy.id }, data: { managementPolicy: policy } });
      await sync();
      const morningRecords = () => prisma.attendance.findMany({ where: { studentId: a.id, periodId: morning.id, date: session.examDate } });
      assert.equal((await morningRecords())[0]?.status, "PRESENT", "graded result creates morning attendance");
      await prisma.examSessionParticipant.deleteMany({ where: { divisionId: academy.id, sessionId: session.id, studentId: a.id } });
      await sync();
      assert.equal((await morningRecords()).length, 0, "removed result clears only generated attendance");
      assert.deepEqual((await penalties()).map(record => record.points), [-1]);
      await prisma.attendance.create({ data: { studentId: a.id, periodId: morning.id, date: session.examDate, status: "EXCUSED", reason: "승인된 미응시", recordedById: admin.id } });
      await sync();
      assert.equal((await penalties()).length, 0);
      assert.equal((await morningRecords())[0]?.status, "EXCUSED", "manual exemption survives automatic sync");
    } finally { exams.restore(); }
    // Existing policy reader uses the deployment's study_hall namespace.
    // Read-only views bridge the isolated Prisma schema for this service test.
    await prisma.$executeRawUnsafe("CREATE SCHEMA IF NOT EXISTS study_hall");
    await prisma.$executeRawUnsafe("CREATE OR REPLACE VIEW study_hall.divisions AS SELECT * FROM public.divisions");
    await prisma.$executeRawUnsafe("CREATE OR REPLACE VIEW study_hall.division_settings AS SELECT * FROM public.division_settings");
    const policies = loadWithMocks<typeof import("../lib/services/management-policy.service")>(require.resolve("../lib/services/management-policy.service"), {
      react: { cache: <T>(fn: T) => fn },
      "@/lib/mock-data": { isMockMode: () => false },
      "@/lib/service-helpers": { getPrismaClient: async () => prisma },
      "@/lib/services/academy-configuration-history.service": { getHistoricalAcademyConfiguration: async () => null },
      "@/lib/revalidation": { revalidateDivisionOperationalViews() {} },
    });
    try {
      policy.monthlyPoints = false;
      await prisma.divisionSettings.update({ where: { divisionId: academy.id }, data: { managementPolicy: policy } });
      await prisma.pointRecord.create({ data: { studentId: a.id, points: -99, date: new Date("2026-07-31T00:00:00Z"), recordedById: admin.id } });
      assert.deepEqual((await policies.module.getPolicyPointTotals(academy.slug))?.get(a.id), { merit: 16, demerit: 0 });
      assert.deepEqual((await policies.module.getPolicyPointTotals(academy.slug, { dateFrom: "2026-08-01", dateTo: "2026-08-31" }))?.get(a.id), { merit: 9, demerit: 0 });
    } finally { policies.restore(); }
    console.log(JSON.stringify({ passed: true, simultaneousDuplicate: "one accepted", rollback: "atomic", restoration: "4 -> 2 -> 4", manualAndOtherAcademy: "preserved", perfectAttendance: "concurrent grant, idempotent retry, revoke and restore", exams: "no-show -1, outing distinction, excuse revocation, zero score attendance, score removal", run }));
  } finally { loaded.restore(); }
}
main().finally(() => prisma.$disconnect()).catch(error => { console.error(error); process.exitCode = 1; });
