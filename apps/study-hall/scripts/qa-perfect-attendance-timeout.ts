import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PrismaClient, type Prisma } from "@prisma/client";
import { loadWithMocks } from "../tests/helpers/module-mocks";
import { mapPolicy } from "./restart-police-policy";

const target = process.env.QA_DATABASE_URL;
if (!target) throw new Error("Set QA_DATABASE_URL to a disposable local qa_ database");
const url = new URL(target);
if (!["localhost", "127.0.0.1"].includes(url.hostname) || !/^\/qa_[a-z0-9_]+$/.test(url.pathname)) {
  throw new Error("Only disposable local qa_ databases are allowed");
}
const prisma = new PrismaClient({ datasources: { db: { url: target } } });

async function main() {
  const run = `perfect-timeout-${randomUUID()}`;
  const division = await prisma.division.create({ data: { slug: run, name: "QA", fullName: "QA", color: "#000000" } });
  const admin = await prisma.admin.create({ data: { userId: run, name: "QA", role: "ASSISTANT", divisionId: division.id } });
  const student = await prisma.student.create({ data: { divisionId: division.id, name: "QA", studentNumber: "1" } });
  const period = await prisma.period.create({ data: { divisionId: division.id, name: "QA", displayOrder: 1, startTime: "09:00", endTime: "10:00" } });
  const manifest = JSON.parse(readFileSync("docs/policies/restart-police-v3.1.json", "utf8"));
  const policy = mapPolicy(manifest, manifest.periods.map((p: { startTime: string }) => ({ ...p, id: p.startTime })));
  policy.effectiveFrom = "2026-08-01";
  policy.controlledPeriods = [{ periodId: period.id, weekdays: [1, 2, 3, 4, 5], optional: false }];
  policy.attendancePeriodIds = [period.id];
  policy.morningExam.periodId = "no-exam";
  await prisma.attendance.createMany({ data: Array.from({ length: 31 }, (_, i) => ({ studentId: student.id, periodId: period.id, date: new Date(Date.UTC(2026, 7, i + 1)), status: "PRESENT" as const, recordedById: admin.id })) });
  // Simulate real database/lock latency beyond Prisma's default 5-second deadline.
  let injectDelay = true;
  const delayed = {
    $transaction: (fn: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: { maxWait?: number; timeout?: number }) =>
      prisma.$transaction(async tx => {
        if (injectDelay) await tx.$executeRaw`SELECT pg_sleep(6)`;
        return fn(tx);
      }, options),
  };
  const loaded = loadWithMocks<typeof import("../lib/services/perfect-attendance.service")>(require.resolve("../lib/services/perfect-attendance.service"), {
    "@/lib/mock-data": { isMockMode: () => false },
    "@/lib/service-helpers": { getPrismaClient: async () => delayed },
  });
  try {
    const sync = () => loaded.module.syncPeriodicPerfectAttendancePoints(run, "2026-08-31", admin.id, policy, { perfectAttendanceWeeklyPts: 2, perfectAttendanceMonthlyPts: 3 });
    const started = performance.now();
    assert.deepEqual(await sync(), { grantedCount: 2, revokedCount: 0 });
    const saved = await prisma.pointRecord.findMany({ where: { studentId: student.id }, orderBy: { id: "asc" } });
    assert.deepEqual(saved.map(r => r.points).sort(), [2, 3]);
    assert.deepEqual(await sync(), { grantedCount: 0, revokedCount: 0 });
    assert.deepEqual(await prisma.pointRecord.findMany({ where: { studentId: student.id }, orderBy: { id: "asc" } }), saved);
    assert.equal(await prisma.attendance.count({ where: { studentId: student.id } }), 31);
    injectDelay = false;
    const concurrent = await Promise.all([sync(), sync(), sync()]);
    assert.ok(concurrent.every(r => r.grantedCount === 0 && r.revokedCount === 0));
    const manual = await prisma.pointRecord.create({ data: { studentId: student.id, points: 7, notes: "manual", recordedById: admin.id } });
    // An invalid actor forces createMany to fail after obsolete awards are removed.
    await assert.rejects(loaded.module.syncPeriodicPerfectAttendancePoints(run, "2026-08-31", "missing-admin", policy, { perfectAttendanceWeeklyPts: 4, perfectAttendanceMonthlyPts: 6 }));
    assert.deepEqual(await prisma.pointRecord.findMany({ where: { studentId: student.id, id: { not: manual.id } }, orderBy: { id: "asc" } }), saved, "failed recalculation rolls back award deletion");
    const cell = await prisma.attendance.findFirstOrThrow({ where: { studentId: student.id, date: new Date("2026-08-25T00:00:00Z") } });
    await prisma.attendance.update({ where: { id: cell.id }, data: { status: "TARDY" } });
    assert.deepEqual(await sync(), { grantedCount: 0, revokedCount: 2 });
    assert.deepEqual(await prisma.pointRecord.findMany({ where: { studentId: student.id } }), [manual]);
    await prisma.attendance.update({ where: { id: cell.id }, data: { status: "PRESENT" } });
    assert.deepEqual(await sync(), { grantedCount: 2, revokedCount: 0 });
    console.log(JSON.stringify({ passed: true, delayedSeconds: 6, elapsedMs: Math.round(performance.now() - started), weeklyMonthly: [2, 3], retry: "same IDs", attendance: "31 preserved" }));
  } finally { loaded.restore(); }
}
main().finally(() => prisma.$disconnect()).catch(error => { console.error(error); process.exitCode = 1; });
