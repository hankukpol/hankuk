import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import test from "node:test";
import ts from "typescript";
import * as seatLayout from "../../lib/seat-layout";
import * as studyTimeMeta from "../../lib/study-time-meta";
import * as dateUtils from "../../lib/date-utils";
import * as studentMeta from "../../lib/student-meta";
import * as policyMeta from "../../lib/management-policy";
import * as recordIndex from "../../lib/record-index";
import * as chatMeta from "../../lib/chat-meta";
import * as chatSchemas from "../../lib/chat-schemas";
import { mapPolicy } from "../../scripts/restart-police-policy";
import type { StudentListItem } from "../../lib/services/student.service";
import type { ReportDailyPeriodRow, ReportTrendPoint } from "../../lib/services/report.service";

// Execute the actual service with explicit in-memory dependencies. No environment
// file, database client, Next runtime or persisted mock state is ever loaded.
function loadService<T>(name: string, dependencies: Record<string, unknown>, internals: string[] = []): T {
  const source = readFileSync(new URL(`../../lib/services/${name}.service.ts`, import.meta.url), "utf8");
  const code = ts.transpileModule(`${source}\n${internals.length ? `export { ${internals.join(", ")} };` : ""}`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const identity = (fn: unknown) => fn;
  const stubs: Record<string, unknown> = {
    "react": { cache: identity },
    "next/cache": { unstable_cache: identity, revalidateTag() {} },
    "@/lib/mock-data": { isMockMode: () => true },
    "@/lib/seat-layout": seatLayout,
    "@/lib/study-time-meta": studyTimeMeta,
    "@/lib/date-utils": dateUtils,
    "@/lib/student-meta": studentMeta,
    "@/lib/management-policy": policyMeta,
    "@/lib/record-index": recordIndex,
    "@/lib/chat-meta": chatMeta,
    "@/lib/chat-schemas": chatSchemas,
    "@/lib/errors": { notFound: (message: string) => new Error(message), badRequest: (message: string) => new Error(message), conflict: (message: string) => new Error(message), forbidden: (message: string) => new Error(message) },
    ...dependencies,
  };
  const testModule = { exports: {} };
  const isolatedRequire = (id: string) => stubs[id] ?? {};
  new Function("require", "module", "exports", code)(isolatedRequire, testModule, testModule.exports);
  return testModule.exports as T;
}

type SeatService = typeof import("../../lib/services/seat.service");
type ExamService = typeof import("../../lib/services/exam.service");

for (const slug of ["police", "fire"]) {
  test(`seat editor rejects foreign or wrong-room seat IDs before any write (${slug})`, async () => {
    const writes: string[] = [];
    const room = { id: "room", name: "자습실", columns: 2, rows: 1, aisleColumns: [], isActive: true };
    const tx = {
      studyRoom: { findFirst: async () => room, update: async () => { writes.push("room"); } },
      student: { updateMany: async () => { writes.push("unassign"); } },
      seat: {
        findMany: async () => [{ id: "owned-seat", label: "1", positionX: 1, positionY: 1 }],
        deleteMany: async () => { writes.push("delete"); },
        update: async () => { writes.push("foreign-seat-update"); },
      },
    };
    const prisma = {
      division: { findUnique: async () => ({ id: slug }) },
      $transaction: async (fn: (value: typeof tx) => Promise<unknown>) => fn(tx),
    };
    const service = loadService<SeatService>("seat", {
      "@/lib/mock-data": { isMockMode: () => false },
      "@/lib/prisma": { prisma },
    });
    let caught: unknown;
    try {
      await service.saveSeatEditorLayout(slug, {
        roomId: "room",
        seats: [{ id: "foreign-seat", label: "1", positionX: 1, positionY: 1, isActive: true }],
      });
    } catch (error) { caught = error; }
    assert.deepEqual(writes, [], "tenant/room validation must precede unassignment, deletion and updates");
    assert.match(String(caught), /좌석 정보를 찾을 수 없습니다/);
  });
}

test("bulk mock exam summaries preserve date fallback, ties, missing types and divisions in one read", async () => {
  let reads = 0;
  const scores = [
    { id: "old", studentId: "a", examTypeId: "e", examRound: 1, examDate: "2026-09-01", updatedAt: "2026-09-09", totalScore: 0, rankInClass: 3, notes: null },
    { id: "fallback", studentId: "a", examTypeId: "missing", examRound: 2, examDate: null, updatedAt: "2026-09-08", totalScore: null, rankInClass: null, notes: "확인" },
    { id: "tie", studentId: "a", examTypeId: "e", examRound: 3, examDate: "2026-09-08", updatedAt: "2026-09-10", totalScore: 80, rankInClass: 1, notes: null },
    { id: "b", studentId: "b", examTypeId: "e", examRound: 1, examDate: "2026-09-08", updatedAt: "2026-09-08", totalScore: 0, rankInClass: 2, notes: null },
  ];
  const state = { examScoresByDivision: { police: scores, fire: [{ ...scores[0], id: "fire" }] }, examTypesByDivision: { police: [{ id: "e", name: "경찰 시험" }], fire: [] } };
  const service = loadService<ExamService>("exam", { "@/lib/mock-store": { readMockState: async () => { reads++; return state; } } });
  const ids = ["a", "b", "none", "a"];
  const expected = new Map(await Promise.all(ids.map(async id => [id, await service.getLatestExamSummaryForStudent("police", id)] as const)));
  reads = 0;
  assert.deepEqual(await service.getLatestExamSummariesForStudents("police", ids), expected);
  assert.equal(reads, 1, "bulk summaries must read the mock store once, independent of student count");
  assert.equal((await service.getLatestExamSummariesForStudents("fire", ["a"])).get("a")?.id, "fire");
  reads = 0;
  assert.equal((await service.getLatestExamSummariesForStudents("police", [])).size, 0);
  assert.equal(reads, 0);
});

type ReportRecord = { studentId: string; periodId: string; date: string; status: string; reason: null };
type ReportPeriod = { id: string; name: string; label: null; isMandatory: boolean; isActive: boolean; displayOrder: number };
type ReportInternals = {
  buildDailyPeriodRows(date: string, periods: ReportPeriod[], studentCount: number, records: ReportRecord[], expected?: Map<string, number>): ReportDailyPeriodRow[];
  buildTrendForDates(dates: string[], periods: ReportPeriod[], studentCount: number, records: ReportRecord[], expected?: Map<string, number>): ReportTrendPoint[];
};
const statusKeys = { PRESENT: "present", TARDY: "tardy", ABSENT: "absent", EXCUSED: "excused", HOLIDAY: "holiday", HALF_HOLIDAY: "halfHoliday", NOT_APPLICABLE: "notApplicable" } as const;
function legacyCounts(records: ReportRecord[]) {
  const counts = { present: 0, tardy: 0, absent: 0, excused: 0, holiday: 0, halfHoliday: 0, notApplicable: 0, unprocessed: 0 };
  for (const record of records) {
    const key = statusKeys[record.status as keyof typeof statusKeys];
    if (key) counts[key]++;
  }
  return counts;
}
function legacyRate(counts: ReturnType<typeof legacyCounts>, expected: number) {
  // 인정 출석 = ATTENDED_ATTENDANCE_STATUSES (사유결석 포함)
  return expected > 0 ? Number(((counts.present + counts.tardy + counts.excused + counts.holiday + counts.halfHoliday) / expected * 100).toFixed(1)) : 0;
}

test("report aggregation matches legacy scans for all statuses, missing cells and policy expectations", () => {
  const service = loadService<ReportInternals>("report", {}, ["buildDailyPeriodRows", "buildTrendForDates"]);
  const dates = ["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10"];
  const periods: ReportPeriod[] = Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, name: `${i}교시`, label: null, isActive: i !== 3, isMandatory: i < 2, displayOrder: 4 - i }));
  const records: ReportRecord[] = Array.from({ length: 81 }, (_, i) => ({ studentId: `s${i % 9}`, date: dates[i % 3], periodId: `p${i % 4}`, status: [...Object.keys(statusKeys), "UNKNOWN"][i % 8], reason: null }));
  const original = JSON.stringify({ records, periods });
  for (const expected of [undefined, new Map(periods.map(p => [p.id, 0])), new Map(periods.map(p => [p.id, 50]))]) {
    const date = dates[1];
    const legacy = periods.filter(p => p.isActive).sort((a, b) => a.displayOrder - b.displayOrder).map(period => {
      const counts = legacyCounts(records.filter(r => r.date === date && r.periodId === period.id));
      const processed = Object.values(counts).reduce((sum, count) => sum + count, 0);
      counts.unprocessed = Math.max((expected?.get(period.id) ?? 20) - processed, 0);
      return { periodId: period.id, periodName: period.name, label: period.label, attendanceRate: legacyRate(counts, Math.max((expected?.get(period.id) ?? 20) - counts.notApplicable, 0)), counts };
    });
    assert.deepEqual(service.buildDailyPeriodRows(date, periods, 20, records, expected), legacy);
  }
  for (const mandatory of [periods.filter(p => p.isMandatory), periods, []]) {
    for (const expected of [undefined, new Map(dates.map(date => [date, 0])), new Map([[dates[0], 32]])]) {
      const legacy = dates.map(date => {
        const counts = legacyCounts(records.filter(r => r.date === date && mandatory.some(p => p.id === r.periodId)));
        return { label: new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" }).format(new Date(`${date}T00:00:00Z`)), dateKey: date, attendanceRate: legacyRate(counts, (expected?.get(date) ?? 20 * mandatory.length) - counts.notApplicable), tardyCount: counts.tardy, absentCount: counts.absent };
      });
      assert.deepEqual(service.buildTrendForDates(dates, mandatory, 20, records, expected), legacy);
    }
  }
  assert.equal(JSON.stringify({ records, periods }), original);
});

test("monthly report visits 48,000 records linearly instead of 30 full scans", (t) => {
  const service = loadService<ReportInternals>("report", {}, ["buildDailyPeriodRows", "buildTrendForDates"]);
  const dates = Array.from({ length: 30 }, (_, i) => `2026-08-${String(i + 1).padStart(2, "0")}`);
  const periods: ReportPeriod[] = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, name: `${i}`, label: null, isMandatory: true, isActive: true, displayOrder: i }));
  let dateReads = 0;
  const records = Array.from({ length: 48_000 }, (_, i) => ({ studentId: `s${i % 200}`, periodId: `p${i % 8}`, get date() { dateReads++; return dates[i % 30]; }, status: "PRESENT", reason: null }));
  service.buildTrendForDates(dates, periods, 200, records);
  assert.ok(dateReads <= records.length * 3, `unexpected repeated scans: ${dateReads}`);
  t.diagnostic(`trend date reads: ${dateReads}; legacy date filter reads: ${dates.length * records.length}`);
  dateReads = 0;
  service.buildDailyPeriodRows(dates[0], periods, 200, records);
  assert.equal(dateReads, records.length);
  t.diagnostic(`daily date reads: ${dateReads}; legacy date filter reads: ${periods.length * records.length}`);
});

function student(id: string, extra: Partial<StudentListItem> = {}): StudentListItem {
  return { id, divisionId: "police", name: `학생${id}`, studentNumber: id, studyTrack: null, phone: null, seatId: null, seatLabel: null, seatDisplay: null, studyRoomId: null, studyRoomName: null, courseStartDate: null, courseEndDate: null, tuitionPlanId: null, tuitionPlanName: null, tuitionAmount: null, tuitionExempt: false, tuitionExemptReason: null, status: "ACTIVE", enrolledAt: "2026-09-01", createdAt: "2026-09-01", updatedAt: "2026-09-01", withdrawnAt: null, withdrawnNote: null, memo: null, netPoints: 0, warningStage: "NORMAL", ...extra };
}

test("RESTART3.1 report preserves pre-effective, weekend and optional enrollment cells without repeated policy evaluation", async () => {
  const manifest = JSON.parse(readFileSync(new URL("../../docs/policies/restart-police-v3.1.json", import.meta.url), "utf8"));
  const periods = manifest.periods.map((p: { startTime: string }) => ({ ...p, id: p.startTime, isActive: true }));
  const base = mapPolicy(manifest, periods);
  const policy = { ...base, optionalEnrollments: [{ studentId: "a", periodId: "18:15", dateFrom: "2026-09-08", dateTo: "2026-09-08", weekdays: [2] }] };
  const students = [student("a"), student("b", { status: "ON_LEAVE", meritPoints: 5, demeritPoints: 20 })];
  const records = [
    { studentId: "a", periodId: "18:15", date: "2026-09-08", status: "TARDY", reason: null },
    { studentId: "b", periodId: "18:15", date: "2026-09-08", status: "ABSENT", reason: null },
    { studentId: "a", periodId: "09:15", date: "2026-09-13", status: "ABSENT", reason: null },
  ];
  const evaluated = new Set<string>();
  const service = loadService<typeof import("../../lib/services/report.service")>("report", {
    "@/lib/services/management-policy.service": { getManagementPolicy: async () => policy },
    "@/lib/management-policy": { ...policyMeta, isControlledPeriod: (p: typeof policy, periodId: string, date: string, id: string) => {
      const key = `${id}:${date}:${periodId}`;
      assert.equal(evaluated.has(key), false, `duplicate policy evaluation: ${key}`);
      evaluated.add(key);
      return policyMeta.isControlledPeriod(p, periodId, date, id);
    } },
    "@/lib/services/settings.service": { getDivisionFeatureSettings: async () => ({ featureFlags: { attendanceManagement: true } }), getDivisionTheme: async () => ({ name: "경찰", fullName: "경찰반", color: "#123456" }) },
    "@/lib/services/student.service": { listStudents: async () => students },
    "@/lib/services/period.service": { getPeriods: async () => periods },
    "@/lib/mock-store": { readMockState: async () => ({ attendanceByDivision: { police: records } }) },
  });
  const result = await service.getReportData("police", { period: "weekly", date: "2026-09-13" }, { forceFresh: true });
  const dates = Array.from({ length: 7 }, (_, i) => `2026-09-${String(i + 7).padStart(2, "0")}`);
  for (const s of students) {
    const row = result.studentRows.find(r => r.studentId === s.id)!;
    const expected = dates.reduce((sum, date) => sum + periods.filter((p: { id: string; isActive: boolean; isMandatory: boolean }) => p.isActive && (policyMeta.isPolicyEffective(policy, date) ? policyMeta.isControlledPeriod(policy, p.id, date, s.id) : p.isMandatory)).length, 0);
    assert.equal(row.expectedCount, expected);
    assert.equal(row.tardyCount, s.id === "a" ? 1 : 0);
    assert.equal(row.absentCount, 0);
    assert.equal(row.meritPoints, s.meritPoints);
    assert.equal(row.demeritPoints, s.demeritPoints);
  }
  assert.equal(result.trend.at(-1)?.absentCount, 0);
});

test("study-time totals, averages and tied ranking preserve cutoff, inactive periods and KST rounding", async () => {
  const periods = [{ id: "p", name: "1교시", endTime: "10:00", isActive: true }, { id: "inactive", name: "이전", endTime: "11:00", isActive: false }];
  const record = (studentId: string, extra: Record<string, unknown> = {}) => ({ studentId, periodId: "p", date: "2026-04-06", status: "PRESENT", checkInTime: "2026-04-06T09:00:01+09:00", ...extra });
  const records = [record("a"), record("b"), record("c"), record("a", { date: "2026-04-05", checkInTime: "2026-04-05T09:00:00+09:00" }), record("a", { periodId: "unknown" }), record("a", { status: "ABSENT" }), record("a", { checkInTime: null }), record("a", { checkInTime: "2026-04-06T11:00:00+09:00" }), record("a", { periodId: "inactive", checkInTime: "2026-04-06T11:00:00+09:00" })];
  const service = loadService<typeof import("../../lib/services/study-time.service")>("study-time", {
    "@/lib/mock-store": { readMockState: async () => ({ attendanceByDivision: { police: records, fire: [] } }) },
    "@/lib/services/period.service": { getPeriods: async () => periods },
    "@/lib/services/student.service": { listStudents: async () => [student("a"), student("b", { status: "ON_LEAVE" }), student("c", { status: "WITHDRAWN" }), student("d")] },
  });
  const stats = await service.getStudentStudyTimeStats("police", "a", "2026-04");
  assert.equal(stats.totalMinutes, 59);
  assert.deepEqual(stats.byDate, [{ date: "2026-04-06", minutes: 59 }]);
  assert.deepEqual(stats.byPeriod, [{ periodId: "p", periodName: "1교시", avgMinutes: 30 }]);
  assert.equal(await service.getStudentMonthlyStudyMinutes("police", "a", "2026-04"), stats.totalMinutes);
  assert.equal(await service.getStudentMonthlyStudyMinutes("fire", "a", "2026-04"), 0);
  assert.equal(await service.getStudentMonthlyStudyMinutes("police", "a", "2026-03"), 0);
  const ranking = await service.getDivisionStudyTimeRanking("police", "2026-04");
  assert.deepEqual(ranking.rows.map(r => [r.studentId, r.rank, r.totalMinutes, r.studyDays]), [["a", 1, 59, 1], ["b", 1, 59, 1], ["d", 3, 0, 0]]);
  assert.equal((await service.getStudentStudyTimeRanking("police", "a", "2026-04")).myRank?.isMe, true);
});

test("study-time end timestamp parsing is once per date/period with legacy numerical parity", (t) => {
  const service = loadService<{ createStudyMinutesCalculator(): (checkIn: string | null, date: string, end: string) => number }>("study-time", {}, ["createStudyMinutesCalculator"]);
  const calculate = service.createStudyMinutesCalculator();
  for (const end of ["00:10", "10:00", "23:59", "invalid"]) {
    for (const checkIn of [null, "2026-09-07T15:00:00Z", "2026-09-08T09:12:59+09:00", "invalid"]) {
      const [hh, mm] = end.split(":").map(Number);
      const legacy = checkIn ? Math.max(0, Math.floor((Date.UTC(2026, 8, 8, hh - 9, mm) - new Date(checkIn).getTime()) / 60_000)) : 0;
      assert.equal(calculate(checkIn, "2026-09-08", end), legacy);
      assert.equal(calculate(checkIn, "2026-09-08", end), legacy);
    }
  }
  const utc = t.mock.method(Date, "UTC");
  const sharedCalculator = service.createStudyMinutesCalculator();
  for (let i = 0; i < 1000; i++) sharedCalculator("2026-09-08T09:00:00+09:00", "2026-09-08", "10:00");
  assert.equal(utc.mock.callCount(), 1);
  utc.mock.restore();
  t.diagnostic("KST end timestamp construction: 1 vs legacy 1,000 for students sharing one date/period");
});

test("seat/student indexes preserve first matches, ambiguous labels, stale IDs and room-local fallback", async () => {
  const room = (id: string, order: number) => ({ id, divisionId: "police", name: id, columns: 3, rows: 1, aisleColumns: [], displayOrder: order, isActive: true, createdAt: "2026-09-01", updatedAt: "2026-09-01" });
  const rooms = [room("r1", 0), room("r2", 1)];
  const seat = (id: string, studyRoomId: string, label: string, x: number, isActive = true) => ({ id, divisionId: "police", studyRoomId, label, positionX: x, positionY: 1, isActive, createdAt: "2026-09-01", updatedAt: "2026-09-01" });
  const seats = [seat("one", "r1", "A", 1), seat("two", "r2", "A", 2), seat("three", "r1", "B", 3, false)];
  const students = [student("first", { seatId: "one", seatLabel: "A" }), student("second", { seatId: "one", seatLabel: "A" }), student("ambiguous", { seatLabel: "A" }), student("unique", { seatLabel: "B" }), student("stale", { seatId: "missing", seatLabel: "B" })];
  const state = { studentsByDivision: { police: students, fire: [] }, seatsByDivision: { police: seats, fire: [] }, studyRoomsByDivision: { police: rooms, fire: [] }, pointRecordsByDivision: { police: [] }, tuitionPlansByDivision: { police: [] } };
  const original = JSON.stringify(state);
  const dependencies = { "@/lib/mock-store": { readMockState: async () => state } };
  const service = loadService<SeatService>("seat", dependencies);
  const options = await service.listSeatOptions("police");
  assert.deepEqual(options.map(s => [s.id, s.assignedStudentId]), [["one", "first"], ["two", null], ["three", "unique"]]);
  assert.equal((await service.listSeatOptions("police", { activeOnly: true })).length, 2);
  assert.deepEqual(await service.listSeatOptions("fire"), []);
  assert.deepEqual((await service.listStudyRooms("police")).map(r => [r.id, r.seatsCount, r.assignedStudentsCount]), [["r1", 2, 3], ["r2", 1, 0]]);
  const layout = await service.getSeatLayout("police", "r2");
  assert.equal(layout.room?.assignedStudentsCount, 1, "legacy label fallback is local to the displayed room");
  assert.equal(layout.seats[0].assignedStudent?.id, "ambiguous");
  const studentService = loadService<{ getMockStudentsWithMetrics(slug: string): Promise<StudentListItem[]> }>("student", {
    ...dependencies,
    "@/lib/services/settings.service": { getDivisionSettings: async () => ({ warnLevel1: 10, warnLevel2: 20, warnInterview: 25, warnWithdraw: 30 }) },
  }, ["getMockStudentsWithMetrics"]);
  const list = await studentService.getMockStudentsWithMetrics("police");
  assert.equal(list.find(s => s.id === "ambiguous")?.studyRoomId, "r1", "student list preserves its first-label match");
  assert.equal(list.find(s => s.id === "stale")?.seatId, "missing");
  assert.equal(list.find(s => s.id === "stale")?.studyRoomId, "r1", "student list preserves stale-ID label fallback");
  assert.equal(JSON.stringify(state), original);
});

test("attendance pattern DB aggregation matches mock scans and retains division/date/status/period filters", async () => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const records = [
    ...Array.from({ length: 3 }, () => ({ studentId: "a", periodId: "mandatory", date: today, status: "TARDY" })),
    ...Array.from({ length: 2 }, () => ({ studentId: "b", periodId: "mandatory", date: today, status: "ABSENT" })),
    { studentId: "a", periodId: "optional", date: today, status: "TARDY" },
    { studentId: "a", periodId: "mandatory", date: "2020-01-01", status: "TARDY" },
  ];
  type Query = { by: string[]; where: { periodId: { in: string[] }; date: { gte: Date; lt: Date }; status: string; student: { division: { slug: string } } }; _count: { _all: boolean } };
  const queries: Query[] = [];
  const shared = {
    "@/lib/services/period.service": { getPeriods: async () => [{ id: "mandatory", isActive: true, isMandatory: true }, { id: "optional", isActive: true, isMandatory: false }] },
    "@/lib/services/student.service": { listStudents: async () => [student("a"), student("b", { status: "ON_LEAVE" }), student("c", { status: "WITHDRAWN" })] },
    "@/lib/mock-store": { readMockState: async () => ({ attendanceByDivision: { police: records, fire: [] } }) },
  };
  type Service = typeof import("../../lib/services/attendance-pattern.service");
  const mock = loadService<Service>("attendance-pattern", shared);
  const db = loadService<Service>("attendance-pattern", {
    ...shared, "@/lib/mock-data": { isMockMode: () => false },
    "@/lib/prisma": { prisma: { attendance: { groupBy: async (query: Query) => {
      queries.push(query);
      const counts = new Map<string, number>();
      for (const r of query.where.student.division.slug === "police" ? records : []) {
        if (r.status !== query.where.status || !query.where.periodId.in.includes(r.periodId) || r.date < query.where.date.gte.toISOString().slice(0, 10) || r.date >= query.where.date.lt.toISOString().slice(0, 10)) continue;
        counts.set(r.studentId, (counts.get(r.studentId) ?? 0) + 1);
      }
      return Array.from(counts, ([studentId, count]) => ({ studentId, _count: { _all: count } }));
    } } } },
  });
  for (const slug of ["police", "fire"]) {
    assert.deepEqual(await db.detectRepeatedTardy(slug), await mock.detectRepeatedTardy(slug));
    assert.deepEqual(await db.detectRepeatedAbsent(slug), await mock.detectRepeatedAbsent(slug));
  }
  assert.equal(queries.length, 4, "one aggregate query per detector");
  for (const query of queries) {
    assert.deepEqual(query.by, ["studentId"]);
    assert.deepEqual(query._count, { _all: true });
    assert.deepEqual(query.where.periodId.in, ["mandatory"]);
    assert.equal(query.where.date.lt.getTime() - query.where.date.gte.getTime(), 7 * 86400000);
  }
});

test("DB latest exam query keeps ordering and tenant scope while excluding score JSON payload", async () => {
  const queries: Array<{ where: { studentId: { in: string[] }; student: { division: { slug: string } } }; select: Record<string, unknown>; orderBy: unknown }> = [];
  const service = loadService<ExamService>("exam", {
    "@/lib/mock-data": { isMockMode: () => false },
    "@/lib/prisma": { prisma: { examScore: { findMany: async (query: typeof queries[number]) => {
      queries.push(query);
      return [{ id: "latest", studentId: "a", examType: { name: "시험" }, examRound: 2, examDate: null, totalScore: 0, rankInClass: 1, notes: null }, { id: "old", studentId: "a", examType: { name: "시험" }, examRound: 1, examDate: new Date("2026-09-01"), totalScore: 50, rankInClass: 2, notes: null }];
    } } } },
  });
  const result = await service.getLatestExamSummariesForStudents("fire", ["a", "missing"]);
  assert.equal(result.get("a")?.id, "latest");
  assert.equal(result.get("missing"), null);
  assert.equal(queries.length, 1);
  assert.deepEqual(queries[0].where, { studentId: { in: ["a", "missing"] }, student: { division: { slug: "fire" } } });
  assert.deepEqual(queries[0].orderBy, [{ examDate: "desc" }, { createdAt: "desc" }]);
  assert.equal("scores" in queries[0].select, false);
});

test("activity service accepts arbitrary strings and preserves invalid-filter normalization", async () => {
  const service = loadService<typeof import("../../lib/services/report.service")>("report", {
    "@/lib/services/settings.service": { getDivisionFeatureSettings: async () => ({ featureFlags: {} }) },
  });
  for (const actionType of [null, "", "bad-type", "POINT", "ATTENDANCE_EDIT", "STUDENT_STATUS", "INTERVIEW"]) {
    const result = await service.getActivityLogData("fire", { dateFrom: "2026-09-08", dateTo: "2026-09-08", actionType });
    assert.equal(result.actionType, ["POINT", "ATTENDANCE_EDIT", "STUDENT_STATUS", "INTERVIEW"].includes(actionType ?? "") ? actionType : null);
  }
});

test("attendance side-effect failures use sanitized logger and remain nonfatal", async (t) => {
  const rawError = new Error("private student details and database password must not be printed");
  const calls: Array<{ scope: string; error: unknown }> = [];
  t.mock.method(console, "error", () => { assert.fail("raw console.error must not be used by the service"); });
  const service = loadService<typeof import("../../lib/services/attendance.service")>("attendance", {
    "@/lib/services/management-policy.service": { getManagementPolicy: async () => null },
    "@/lib/services/settings.service": { getDivisionSettings: async () => { throw rawError; } },
    "@/lib/mock-store": { updateMockState: async () => { throw rawError; } },
    "@/lib/server-log": { logServerError: (scope: string, error: unknown) => { calls.push({ scope, error }); return "correlation-id"; } },
  });
  await service.syncAttendanceDerivedPoints("fire", "2026-09-08", "actor");
  assert.deepEqual(calls.map(call => call.scope), ["PerfectAttendancePoints", "AttendancePenaltyPoints"]);
  assert.ok(calls.every(call => call.error === rawError));
});

test("student dashboard starts independent announcement reads while attendance periods are pending", { timeout: 2000 }, async () => {
  let releasePeriods!: (periods: never[]) => void;
  const pendingPeriods = new Promise<never[]>(resolve => { releasePeriods = resolve; });
  const currentStudent = student("a");
  const service = loadService<typeof import("../../lib/services/student-dashboard.service")>("student-dashboard", {
    "@/lib/services/student.service": { getStudentDetail: async () => currentStudent },
    "@/lib/services/settings.service": { getDivisionSettings: async () => ({ featureFlags: { attendanceManagement: true, announcements: true }, operatingDays: {} }), getDivisionTheme: async () => ({ name: "경찰", fullName: "경찰반", color: "#123456" }) },
    "@/lib/services/study-time.service": { getStudentMonthlyStudyMinutes: async () => 59 },
    "@/lib/services/period.service": { getPeriods: async () => pendingPeriods },
    "@/lib/services/announcement.service": { listAnnouncements: async () => { releasePeriods([]); return []; } },
    "@/lib/mock-store": { readMockState: async () => ({ attendanceByDivision: { police: [] } }) },
  });
  const result = await service.getStudentDashboardData("police", "a");
  assert.deepEqual(result.student, currentStudent);
  assert.equal(result.summary.monthlyStudyMinutes, 59);
  assert.equal(result.summary.monthlyExpectedCount, 0);
  assert.deepEqual(result.recentAnnouncements, []);
  assert.deepEqual(result.weeklyAttendance.rows, []);
});

test("mock seat editor rejects unknown IDs without mutation and retains valid edits", async () => {
  const room = { id: "room", divisionId: "police", name: "자습실", columns: 2, rows: 1, aisleColumns: [], displayOrder: 0, isActive: true, createdAt: "2026-09-01", updatedAt: "2026-09-01" };
  const seat = { id: "seat", divisionId: "police", studyRoomId: "room", label: "A", positionX: 1, positionY: 1, isActive: true, createdAt: "2026-09-01", updatedAt: "2026-09-01" };
  const state = { studentsByDivision: { police: [] }, studyRoomsByDivision: { police: [room] }, seatsByDivision: { police: [seat] } };
  const service = loadService<SeatService>("seat", { "@/lib/mock-store": { readMockState: async () => state, updateMockState: async (fn: (value: typeof state) => Promise<unknown>) => fn(state) } });
  const original = JSON.stringify(state);
  await assert.rejects(service.saveSeatEditorLayout("police", { roomId: "room", seats: [{ ...seat, id: "foreign" }] }), /좌석 정보를 찾을 수 없습니다/);
  assert.equal(JSON.stringify(state), original);
  const saved = await service.saveSeatEditorLayout("police", { roomId: "room", seats: [{ ...seat, label: "B" }] });
  assert.equal(saved.seats[0].id, "seat");
  assert.equal(saved.seats[0].label, "B");
});

type ChatService = typeof import("../../lib/services/chat.service");

/** chat.service 의 DB 경로를 실제 코드 그대로 돌린다. mock 경로는 타지 않는다. */
function loadChatService(prisma: unknown): ChatService {
  return loadService<ChatService>("chat", {
    "@/lib/mock-data": { isMockMode: () => false },
    "@/lib/service-helpers": {
      getPrismaClient: async () => prisma,
      getDivisionBySlugOrThrow: async () => ({ id: "div-police" }),
    },
  });
}

const ACTOR_ADMIN = { id: "admin-1", role: "ADMIN" as const, name: "관리자" };
const ACTOR_ASSISTANT = { id: "assistant-1", role: "ASSISTANT" as const, name: "조교" };

test("chat unread counts messages whose author account was deleted", async () => {
  // 회귀: NOT: { authorId } 로 쓰면 author_id 가 NULL 인 행에서
  // NOT (NULL = x) 가 NULL 이 되어 통째로 빠진다. 퇴사자가 남긴 메시지가 영원히 안읽음에서 사라진다.
  let countWhere: Record<string, unknown> = {};
  const chat = loadChatService({
    chatReadState: { findUnique: async () => ({ lastReadAt: new Date(0) }) },
    chatMessage: {
      count: async ({ where }: { where: Record<string, unknown> }) => {
        countWhere = where;
        return 0;
      },
      findFirst: async () => null,
    },
  });

  await chat.getChatUnreadSummary("police", ACTOR_ADMIN);

  assert.equal(countWhere.divisionId, "div-police", "직렬 필터가 빠지면 안 된다");
  assert.equal(countWhere.NOT, undefined, "NOT 은 NULL 작성자를 삼킨다");
  assert.deepEqual(
    countWhere.OR,
    [{ authorId: null }, { authorId: { not: ACTOR_ADMIN.id } }],
    "작성자가 없는 메시지도 안읽음에 포함되어야 한다",
  );
});

test("chat read pointer only ever moves forward", async () => {
  // 회귀: upsert 의 update 로 바로 쓰면 오래된 메시지 id 를 보냈을 때 값이 뒤로 가고
  // 이미 읽은 메시지가 다시 안읽음으로 살아난다.
  const calls: Array<{ op: string; payload: Record<string, unknown> }> = [];
  const anchor = new Date("2026-09-09T00:00:00.000Z");
  const chat = loadChatService({
    chatMessage: {
      findFirst: async () => ({ createdAt: anchor }),
      count: async () => 0,
    },
    chatReadState: {
      findUnique: async () => ({ lastReadAt: anchor }),
      upsert: async (payload: Record<string, unknown>) => {
        calls.push({ op: "upsert", payload });
      },
      updateMany: async (payload: Record<string, unknown>) => {
        calls.push({ op: "updateMany", payload });
      },
    },
  });

  await chat.markChatRead("police", ACTOR_ADMIN, { lastReadMessageId: "m1" });

  const upsert = calls.find((call) => call.op === "upsert");
  const updateMany = calls.find((call) => call.op === "updateMany");

  assert.deepEqual(upsert?.payload.update, {}, "upsert 는 기존 값을 덮어쓰지 않는다");
  assert.deepEqual(
    (updateMany?.payload.where as Record<string, unknown>).lastReadAt,
    { lt: anchor },
    "더 오래된 값일 때만 전진시킨다",
  );
});

test("chat delete refuses an assistant touching someone else's message without writing", async () => {
  const writes: string[] = [];
  const target = { id: "m1", divisionId: "div-police", authorId: "admin-1", authorName: "관리자", body: "x", createdAt: new Date(), updatedAt: new Date(), deletedAt: null, deletedById: null, author: null, deletedBy: null };
  const chat = loadChatService({
    chatMessage: {
      findFirst: async () => target,
      update: async () => {
        writes.push("update");
        return target;
      },
    },
  });

  await assert.rejects(() => chat.deleteChatMessage("police", ACTOR_ASSISTANT, "m1"));
  assert.deepEqual(writes, [], "거부된 삭제는 쓰기를 남기지 않는다");
});

test("chat delete is idempotent and keeps the first deleter", async () => {
  const writes: string[] = [];
  const deletedAt = new Date("2026-09-09T00:00:00.000Z");
  const tombstone = { id: "m1", divisionId: "div-police", authorId: "someone", authorName: "작성자", body: "숨겨져야 한다", createdAt: deletedAt, updatedAt: deletedAt, deletedAt, deletedById: "first-deleter", author: null, deletedBy: { name: "처음 지운 사람" } };
  const chat = loadChatService({
    chatMessage: {
      findFirst: async () => tombstone,
      update: async () => {
        writes.push("update");
        return tombstone;
      },
    },
  });

  const result = await chat.deleteChatMessage("police", ACTOR_ADMIN, "m1");

  assert.deepEqual(writes, [], "이미 삭제된 메시지를 다시 쓰지 않는다");
  assert.equal(result.deletedByName, "처음 지운 사람");
  assert.equal(result.body, "", "삭제된 메시지 본문은 내려보내지 않는다");
  assert.equal(result.isDeleted, true);
});

test("chat since-sync scopes to the division and carries tombstones", async () => {
  // 소프트 삭제는 updatedAt 만 올린다. createdAt 기준으로 동기화하면 삭제를 영영 못 받는다.
  let where: Record<string, unknown> = {};
  const deletedAt = new Date("2026-09-09T01:00:00.000Z");
  const chat = loadChatService({
    chatMessage: {
      findMany: async (args: { where: Record<string, unknown> }) => {
        where = args.where;
        return [{ id: "m1", divisionId: "div-police", authorId: null, authorName: "퇴사자", body: "삭제됨", createdAt: deletedAt, updatedAt: deletedAt, deletedAt, deletedById: null, author: null, deletedBy: null }];
      },
    },
  });

  const page = await chat.listChatMessages("police", ACTOR_ADMIN, { since: "2026-09-09T00:00:00.000Z" });

  assert.equal(where.divisionId, "div-police", "직렬 필터가 빠지면 안 된다");
  assert.ok(where.updatedAt, "동기화 커서는 updatedAt 이어야 한다");
  assert.equal(where.createdAt, undefined, "createdAt 기준이면 자리표시를 놓친다");
  assert.equal(page.chatMessages[0].isDeleted, true);
  assert.equal(page.syncedAt, deletedAt.toISOString());
});

test("bulk student registration skips taken numbers, survives failed rows and reports every row", async () => {
  const state = {
    studentsByDivision: {
      police: [
        { id: "existing", divisionId: "police", name: "기존학생", studentNumber: "20550", status: "ACTIVE", createdAt: "2026-09-01", updatedAt: "2026-09-01" },
      ],
      fire: [],
    },
    seatsByDivision: { police: [] },
    studyRoomsByDivision: { police: [] },
    pointRecordsByDivision: { police: [] },
    tuitionPlansByDivision: { police: [] },
  };
  type StudentService = typeof import("../../lib/services/student.service");
  const service = loadService<StudentService>("student", {
    "@/lib/mock-data": { isMockMode: () => true, getMockDivisionBySlug: () => ({ id: "police" }) },
    "@/lib/service-helpers": { normalizeOptionalText: (value?: string | null) => (value?.trim() ? value.trim() : null) },
    "node:crypto": { randomUUID },
    "@/lib/mock-store": {
      readMockState: async () => state,
      updateMockState: async (fn: (draft: typeof state) => unknown) => fn(state),
    },
    "@/lib/revalidation": { revalidateDivisionOperationalViews() {} },
    "@/lib/services/settings.service": { getDivisionSettings: async () => ({ warnLevel1: 10, warnLevel2: 20, warnInterview: 25, warnWithdraw: 30 }) },
    "@/lib/services/management-policy.service": { getPolicyPointTotals: async () => null, getManagementPolicy: async () => null, getPolicyHolidayUsage: async () => null },
  });

  const result = await service.createStudentsBulk("police", [
    { studentNumber: "20550", name: "기존학생" },   // 이미 등록된 번호
    { studentNumber: "20563", name: "이건영" },
    { studentNumber: "21809", name: "전한나" },
    { studentNumber: "20563", name: "중복행" },     // 같은 요청 안에서 중복
  ], "경찰");

  assert.equal(result.createdCount, 2);
  assert.equal(result.duplicateCount, 2);
  assert.equal(result.failedCount, 0);
  assert.deepEqual(result.items.map((item) => item.result), ["DUPLICATE", "CREATED", "CREATED", "DUPLICATE"]);
  assert.deepEqual(result.items.map((item) => item.rowNumber), [1, 2, 3, 4]);

  const police = state.studentsByDivision.police;
  assert.deepEqual(police.map((s) => s.studentNumber), ["20550", "20563", "21809"]);
  assert.equal(new Set(police.map((s) => s.id)).size, police.length, "같은 밀리초에 만들어도 ID가 겹치면 안 된다");
  assert.deepEqual(state.studentsByDivision.fire, [], "다른 직렬은 건드리지 않는다");
  // 시험 템플릿이 직렬로 응시 대상자를 고르므로 등록 시 직렬이 반드시 붙어야 한다.
  assert.deepEqual(
    police.filter((s) => s.id !== "existing").map((s) => (s as { studyTrack?: string | null }).studyTrack),
    ["경찰", "경찰"],
  );

  await assert.rejects(service.createStudentsBulk("police", []), /등록할 학생이 없습니다/);
  await assert.rejects(
    service.createStudentsBulk("police", Array.from({ length: 501 }, (_, i) => ({ studentNumber: `n${i}`, name: "학생" }))),
    /500명까지/,
  );
});
