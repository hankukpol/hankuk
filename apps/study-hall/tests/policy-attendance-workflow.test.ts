import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import * as policyMeta from "../lib/management-policy";
import * as dateUtils from "../lib/date-utils";
import { mapPolicy } from "../scripts/restart-police-policy";
import type { MockAttendanceRecord, MockPointRecordRecord } from "../lib/mock-store";

type AttendanceService = typeof import("../lib/services/attendance.service");
type PolicyAttendanceService = typeof import("../lib/services/policy-attendance.service");
type PolicyService = typeof import("../lib/services/management-policy.service");
const manifest = JSON.parse(readFileSync("docs/policies/restart-police-v3.1.json", "utf8"));
const date = "2026-09-08";
const admin = { id: "admin", role: "ADMIN" as const };
const assistant = { id: "assistant", role: "ASSISTANT" as const };

// Execute real services against a disposable in-memory fixture. Imports are
// closed: neither the persisted .mock-data store nor a DB client can be loaded.
function loadService<T>(name: string, dependencies: Record<string, unknown>): T {
  const source = readFileSync(`lib/services/${name}.service.ts`, "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const testModule = { exports: {} };
  new Function("require", "module", "exports", code)((id: string) => {
    assert.ok(id in dependencies, `Unisolated service dependency: ${id}`);
    return dependencies[id];
  }, testModule, testModule.exports);
  return testModule.exports as T;
}

function fixture() {
  const periods = manifest.periods.map((p: Record<string, unknown>) => ({ ...p, id: p.startTime, isActive: true }));
  const policy = mapPolicy(manifest, periods);
  const rules = manifest.rules.map((r: Record<string, unknown>) => ({ ...r, isActive: true }));
  const state = {
    admins: [
      { ...admin, isActive: true, divisionSlug: "police" },
      { ...assistant, isActive: true, divisionSlug: "police" },
      { id: "fire-admin", role: "ADMIN", isActive: true, divisionSlug: "fire" },
      { id: "inactive", role: "ADMIN", isActive: false, divisionSlug: "police" },
      { id: "super", role: "SUPER_ADMIN", isActive: true, divisionSlug: null },
    ],
    periodsByDivision: { police: periods, fire: [] },
    divisionSettingsByDivision: { police: { managementPolicy: policy }, fire: {} },
    studentsByDivision: { police: [{ id: "p1", seatId: "seat1" }, { id: "p2", seatId: "seat2" }], fire: [{ id: "f1", seatId: "fire-seat" }] },
    attendanceByDivision: { police: [] as MockAttendanceRecord[], fire: [] as MockAttendanceRecord[] },
    pointRulesByDivision: { police: rules, fire: [] },
    pointRecordsByDivision: { police: [] as MockPointRecordRecord[], fire: [] as MockPointRecordRecord[] },
  };
  const dependencies: Record<string, unknown> = {
    "react": { cache: (fn: unknown) => fn },
    "node:crypto": { randomUUID },
    "@/lib/date-utils": dateUtils,
    "@/lib/management-policy": policyMeta,
    "@/lib/mock-data": { isMockMode: () => true },
    "@/lib/mock-store": {
      readMockState: async () => state,
      updateMockState: async (mutate: (value: typeof state) => unknown) => mutate(state),
    },
    "@/lib/errors": { badRequest: (message: string) => new Error(message), notFound: (message: string) => new Error(message) },
    "@/lib/service-helpers": { getPrismaClient: () => { throw new Error("Database access forbidden in fixture"); } },
    "@/lib/revalidation": { revalidateDivisionOperationalViews() {} },
    "@/lib/server-log": { logServerError: (_scope: string, error: unknown) => { throw error; } },
    "@/lib/services/period.service": { getPeriods: async (slug: "police" | "fire") => state.periodsByDivision[slug] },
    "@/lib/services/student.service": { getDivisionStudents: async (slug: "police" | "fire") => state.studentsByDivision[slug] },
    "@/lib/services/settings.service": { getDivisionSettings: async () => ({ assistantPastEditAllowed: true, assistantPastEditDays: 30 }) },
  };
  const management = loadService<PolicyService>("management-policy", dependencies);
  dependencies["@/lib/services/management-policy.service"] = management;
  const attendance = loadService<AttendanceService>("attendance", dependencies);
  const penalties = loadService<PolicyAttendanceService>("policy-attendance", dependencies);
  function record(periodId: string, status: MockAttendanceRecord["status"], studentId = "p1", day = date) {
    const value: MockAttendanceRecord = { id: randomUUID(), studentId, periodId, date: day, status, reason: null, checkInTime: null, recordedById: assistant.id, createdAt: `${day}T00:00:00Z`, updatedAt: `${day}T00:00:00Z` };
    state.attendanceByDivision.police.push(value);
    return value;
  }
  return { state, policy, periods, rules, management, attendance, penalties, record, dependencies };
}

test("all eight periods retain the published timetable; attendance records expose only periods 1-5", async () => {
  const f = fixture();
  assert.equal(f.periods.length, 8);
  assert.equal(f.periods.find((p: { id: string }) => p.id === "20:10").endTime, "21:50");
  assert.equal(f.policy.closingTime, "22:00");
  const snapshot = await f.attendance.getAttendanceSnapshot("police", date);
  assert.deepEqual(snapshot.periods.map(p => p.startTime), ["09:15", "11:00", "13:45", "15:30", "18:15"]);
  for (const day of [date, "2026-09-12", "2026-09-13"]) {
    const result = await f.attendance.getAttendanceSnapshot("police", day);
    assert.equal(result.periods.filter(p => p.isMandatory).length, day === "2026-09-13" ? 0 : 4);
  }
});

test("assistant records facts without charging; manager confirmation is idempotent and correctable", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date(`${date}T22:00:00+09:00`) });
  const f = fixture();
  const untouched: MockPointRecordRecord = { id: "old", studentId: "p1", ruleId: null, points: 3, date: "2026-08-31T00:00:00Z", notes: "기존 상점", recordedById: admin.id, createdAt: "2026-08-31T00:00:00Z" };
  f.state.pointRecordsByDivision.police.push(untouched);
  f.state.pointRecordsByDivision.fire.push({ ...untouched, id: "fire", studentId: "f1" });
  const fireBefore = JSON.stringify(f.state.pointRecordsByDivision.fire);
  for (const periodId of ["09:15", "11:00", "13:45", "15:30"]) {
    await f.attendance.upsertAttendanceBatch("police", assistant, { date, periodId, records: [{ studentId: "p1", status: "ABSENT", reason: "무단결석" }] });
  }
  assert.deepEqual(f.state.pointRecordsByDivision.police, [untouched]);
  const beforePreview = JSON.stringify(f.state);
  assert.deepEqual((await f.penalties.previewPolicyAttendance("police", date)).map(c => c.points), [-5]);
  assert.equal(JSON.stringify(f.state), beforePreview, "preview must not write");
  for (const actorId of [assistant.id, "fire-admin", "inactive"]) {
    await assert.rejects(f.penalties.confirmPolicyAttendance("police", date, actorId), /관리자만/);
  }
  assert.equal((await f.penalties.confirmPolicyAttendance("police", date, admin.id)).confirmedCount, 1);
  const first = JSON.stringify(f.state.pointRecordsByDivision.police);
  await f.penalties.confirmPolicyAttendance("police", date, "super");
  assert.equal(JSON.stringify(f.state.pointRecordsByDivision.police), first, "keep IDs, creation times and original confirming actor");
  await f.attendance.upsertAttendanceBatch("police", assistant, { date, periodId: "09:15", records: [{ studentId: "p1", status: "EXCUSED", reason: "승인된 병원 일정" }] });
  assert.equal(JSON.stringify(f.state.pointRecordsByDivision.police), first, "assistant correction cannot itself revoke an admin-confirmed point");
  await f.penalties.confirmPolicyAttendance("police", date, admin.id);
  assert.deepEqual(f.state.pointRecordsByDivision.police, [untouched]);
  assert.equal(JSON.stringify(f.state.pointRecordsByDivision.fire), fireBefore);
});

test("optional enrollee full-day absence waits for fifth-period end and requires every recorded cell", () => {
  const f = fixture();
  f.policy.optionalEnrollments.push({ studentId: "p1", periodId: "18:15", dateFrom: date, dateTo: date, weekdays: [2] });
  for (const id of ["09:15", "11:00", "13:45", "15:30"]) f.record(id, "ABSENT");
  const build = (at: string) => policyMeta.buildPolicyAttendanceCandidates(f.policy, f.periods, f.state.attendanceByDivision.police, f.rules, date, new Date(`${date}T${at}+09:00`));
  assert.deepEqual(build("22:00:00"), []);
  f.record("18:15", "ABSENT");
  assert.deepEqual(build("19:54:59"), []);
  assert.deepEqual(build("19:55:00").map(c => c.points), [-5]);
});

test("approved and unprocessed cells never generate full-day absence; voluntary periods never generate late charges", () => {
  for (const status of ["EXCUSED", "HOLIDAY", "HALF_HOLIDAY", "NOT_APPLICABLE"] as const) {
    const f = fixture();
    for (const id of ["09:15", "11:00", "13:45"]) f.record(id, "ABSENT");
    f.record("15:30", status);
    f.record("18:15", "TARDY");
    assert.deepEqual(policyMeta.buildPolicyAttendanceCandidates(f.policy, f.periods, f.state.attendanceByDivision.police, f.rules, date, new Date(`${date}T22:00:00+09:00`)), []);
  }
});

test("resaving a tardy attendance preserves the first recorded arrival time", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date(`${date}T09:17:00+09:00`) });
  const f = fixture();
  const input = { date, periodId: "09:15", records: [{ studentId: "p1", status: "TARDY" as const }] };
  await f.attendance.upsertAttendanceBatch("police", assistant, input);
  t.mock.timers.tick(10 * 60_000);
  await f.attendance.upsertAttendanceBatch("police", assistant, input);
  assert.equal(f.state.attendanceByDivision.police[0].checkInTime, "2026-09-08T00:17:00.000Z");
});

test("historical tardy entry does not fabricate today's arrival timestamp", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-09T09:17:00+09:00") });
  const f = fixture();
  await f.attendance.upsertAttendanceBatch("police", admin, { date, periodId: "09:15", records: [{ studentId: "p1", status: "TARDY" }] });
  assert.equal(f.state.attendanceByDivision.police[0].checkInTime, null);
});

test("recurring correction preserves an existing tardy timestamp and leaves unknown historic times empty", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-09T09:17:00+09:00") });
  const f = fixture();
  f.record("09:15", "TARDY").checkInTime = "2026-09-08T00:17:00.000Z";
  await f.attendance.applyRecurringAttendance("police", admin, { studentIds: ["p1"], dateFrom: date, dateTo: date, weekdays: [2], startPeriodId: "09:15", endPeriodId: "11:00", status: "TARDY", overwriteExisting: true });
  assert.deepEqual(f.state.attendanceByDivision.police.map(r => r.checkInTime), ["2026-09-08T00:17:00.000Z", null]);
});

test("policy attendance stats distinguish approved absence and missing records from physical attendance", async () => {
  const f = fixture();
  for (const id of ["09:15", "11:00", "13:45", "15:30"]) f.record(id, "EXCUSED");
  const stats = await f.attendance.getAttendanceStats("police", date, date);
  assert.equal(stats.totals.present, 0);
  assert.equal(stats.totals.excused, 1);
  assert.equal(stats.totals.unprocessed, 1);
  // 사유결석은 인정 출석이므로 출석률에 포함된다. 물리적 출석(present=0)과는 여전히 구분된다.
  assert.equal(stats.attendanceRate, 50);
});

test("inactive policy periods cannot accept new attendance or inflate expected attendance", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date(`${date}T09:17:00+09:00`) });
  const f = fixture();
  f.periods.forEach((p: { isActive: boolean }) => { p.isActive = false; });
  await assert.rejects(f.attendance.upsertAttendanceBatch("police", assistant, { date, periodId: "09:15", records: [{ studentId: "p1", status: "PRESENT" }] }), /비활성/);
  const stats = await f.attendance.getAttendanceStats("police", date, date);
  assert.equal(stats.periods.reduce((sum, p) => sum + p.counts.unprocessed, 0), 0);
});

test("cancelling one optional enrollment preserves another weekday schedule with matching dates", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date(`${date}T09:17:00+09:00`) });
  const f = fixture();
  const first = { studentId: "p1", periodId: "18:15", dateFrom: "2026-09-10", dateTo: "2026-09-30", weekdays: [4] };
  const second = { ...first, weekdays: [5] };
  await f.management.saveOptionalEnrollment("police", first);
  await f.management.saveOptionalEnrollment("police", second);
  await f.management.endOptionalEnrollment("police", first);
  assert.deepEqual((await f.management.getManagementPolicy("police"))?.optionalEnrollments, [second]);
});

test("partial absence candidates retain ABSENT identity for manager review", () => {
  const f = fixture();
  f.policy.partialAbsenceRuleId = "custom-partial";
  f.rules.push({ id: "custom-partial", points: -3, isActive: true });
  f.record("09:15", "ABSENT");
  f.record("11:00", "PRESENT");
  const result = policyMeta.buildPolicyAttendanceCandidates(f.policy, f.periods, f.state.attendanceByDivision.police, f.rules, date, new Date(`${date}T22:00:00+09:00`));
  assert.equal(result.length, 1);
  assert.match(result[0].notes, /\[09:15\]\[ABSENT\]/);
});

test("DB attendance writes preserve arrival times and carry the division filter", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-09T09:17:00+09:00") });
  const f = fixture();
  const firstArrival = new Date(`${date}T09:17:00+09:00`);
  const existing = { id: "db-attendance", studentId: "p1", periodId: "09:15", date: new Date(`${date}T00:00:00Z`), status: "TARDY", checkInTime: firstArrival };
  const writes: Array<{ checkInTime: Date | null }> = [];
  const prisma = {
    division: { findUnique: async () => ({ id: "division-police" }) },
    attendance: {
      findMany: async (query: { where: { student: { divisionId: string } } }) => {
        assert.equal(query.where.student.divisionId, "division-police");
        return [existing];
      },
      upsert: async (query: { where: { student: { divisionId: string } }; update: { checkInTime: Date | null } }) => {
        assert.equal(query.where.student.divisionId, "division-police");
        writes.push(query.update);
      },
      update: async (query: { where: { student: { divisionId: string } }; data: { checkInTime: Date | null } }) => {
        assert.equal(query.where.student.divisionId, "division-police");
        writes.push(query.data);
      },
      updateMany: async (query: {
        where: { id: { in: string[] }; student: { divisionId: string } };
        data: { checkInTime: Date | null };
      }) => {
        assert.equal(query.where.student.divisionId, "division-police");
        for (let index = 0; index < query.where.id.in.length; index += 1) {
          writes.push(query.data);
        }
      },
    },
    $transaction: async (queries: Promise<unknown>[]) => Promise.all(queries),
  };
  const service = loadService<AttendanceService>("attendance", { ...f.dependencies, "@/lib/mock-data": { isMockMode: () => false }, "@/lib/service-helpers": { getPrismaClient: async () => prisma } });
  await service.upsertAttendanceBatch("police", admin, { date, periodId: "09:15", records: [{ studentId: "p1", status: "TARDY" }] });
  await service.applyRecurringAttendance("police", admin, { studentIds: ["p1"], dateFrom: date, dateTo: date, weekdays: [2], startPeriodId: "09:15", endPeriodId: "09:15", status: "TARDY", overwriteExisting: true });
  assert.deepEqual(writes.map(r => r.checkInTime?.toISOString()), ["2026-09-08T00:17:00.000Z", "2026-09-08T00:17:00.000Z"]);
});

test("DB confirmation locks the division/date, preserves IDs, and only removes corrected policy points", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date(`${date}T22:00:00+09:00`) });
  const f = fixture();
  for (const id of ["09:15", "11:00", "13:45", "15:30"]) f.record(id, "ABSENT");
  type DbPoint = { id: string; studentId: string; ruleId: string | null; points: number; date: Date; notes: string; recordedById: string };
  const untouched: DbPoint = { id: "manual", studentId: "p1", ruleId: null, points: 3, date: new Date(`${date}T00:00:00Z`), notes: "기존 관리자 상점", recordedById: admin.id };
  let points: DbPoint[] = [untouched];
  let locked = false;
  const checkDivision = (query: { where: { student?: { divisionId: string }; divisionId?: string } }) => {
    assert.equal(locked, true, "read attendance/points only after locking this confirmation");
    assert.equal(query.where.student?.divisionId ?? query.where.divisionId, "division-police");
  };
  const tx = {
    division: { findUniqueOrThrow: async (query: { where: { slug: string } }) => { assert.equal(query.where.slug, "police"); return { id: "division-police" }; } },
    admin: { findFirst: async (query: { where: { id: string; isActive: boolean; OR: unknown } }) => {
      assert.equal(query.where.isActive, true);
      assert.deepEqual(query.where.OR, [{ role: "SUPER_ADMIN" }, { role: "ADMIN", divisionId: "division-police" }]);
      return query.where.id === admin.id ? admin : null;
    } },
    $executeRaw: async (_query: TemplateStringsArray, key: string) => { assert.equal(key, `policy-attendance:division-police:${date}`); locked = true; },
    attendance: { findMany: async (query: Parameters<typeof checkDivision>[0]) => { checkDivision(query); return f.state.attendanceByDivision.police; } },
    period: { findMany: async (query: Parameters<typeof checkDivision>[0]) => { checkDivision(query); return f.periods; } },
    pointRule: { findMany: async (query: Parameters<typeof checkDivision>[0]) => { checkDivision(query); return f.rules; } },
    pointRecord: {
      findMany: async (query: Parameters<typeof checkDivision>[0]) => { checkDivision(query); return points.slice(); },
      create: async ({ data }: { data: Omit<DbPoint, "id"> }) => { points.push({ ...data, id: randomUUID() }); },
      deleteMany: async (query: { where: { student: { divisionId: string }; id: { in: string[] } } }) => {
        checkDivision(query);
        points = points.filter(p => !query.where.id.in.includes(p.id));
      },
    },
  };
  const prisma = { $transaction: async (run: (client: typeof tx) => Promise<unknown>) => { locked = false; return run(tx); } };
  const service = loadService<PolicyAttendanceService>("policy-attendance", { ...f.dependencies, "@/lib/mock-data": { isMockMode: () => false }, "@/lib/service-helpers": { getPrismaClient: async () => prisma } });
  await assert.rejects(service.confirmPolicyAttendance("police", date, assistant.id), /관리자만/);
  assert.equal(locked, false);
  await service.confirmPolicyAttendance("police", date, admin.id);
  assert.deepEqual(points.map(p => p.points), [3, -5]);
  const first = JSON.stringify(points);
  await service.confirmPolicyAttendance("police", date, admin.id);
  assert.equal(JSON.stringify(points), first);
  f.state.attendanceByDivision.police[0].status = "PRESENT";
  await service.confirmPolicyAttendance("police", date, admin.id);
  assert.deepEqual(points, [untouched]);
});

test("future, pre-effective and other-division confirmations cannot write policy penalties", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date(`${date}T22:00:00+09:00`) });
  const f = fixture();
  const before = JSON.stringify(f.state);
  await assert.rejects(f.penalties.confirmPolicyAttendance("police", "2026-09-09", admin.id), /미래/);
  await assert.rejects(f.penalties.confirmPolicyAttendance("police", "2026-09-07", admin.id), /적용일/);
  await assert.rejects(f.penalties.confirmPolicyAttendance("fire", date, "super"), /적용일/);
  assert.deepEqual(await f.penalties.previewPolicyAttendance("fire", date), []);
  assert.equal(JSON.stringify(f.state), before);
});

test("late candidate uses the configured -2 immediately after start without the obsolete twenty-minute grace", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date(`${date}T09:15:01+09:00`) });
  const f = fixture();
  await f.attendance.upsertAttendanceBatch("police", assistant, { date, periodId: "09:15", records: [{ studentId: "p1", status: "TARDY" }] });
  const candidates = await f.penalties.previewPolicyAttendance("police", date);
  assert.deepEqual(candidates.map(c => c.points), [-2]);
  assert.deepEqual(f.state.pointRecordsByDivision.police, []);
});

test("Sunday and non-enrolled fifth-period attendance are recorded without controlled attendance expectations", async () => {
  const f = fixture();
  f.record("18:15", "TARDY", "p1");
  for (const id of ["09:15", "11:00", "13:45", "15:30", "18:15"]) f.record(id, "ABSENT", "p1", "2026-09-13");
  const weekday = await f.attendance.getAttendanceStats("police", date, date);
  assert.equal(weekday.totals.tardy, 0);
  assert.equal(weekday.periods.find(p => p.periodId === "18:15")?.counts.unprocessed, 0);
  const sunday = await f.attendance.getAttendanceStats("police", "2026-09-13", "2026-09-13");
  assert.equal(Object.values(sunday.totals).reduce((sum, count) => sum + count, 0), 0);
});
