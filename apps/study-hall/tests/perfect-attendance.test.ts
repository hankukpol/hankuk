import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { mapPolicy } from "../scripts/restart-police-policy";
import * as configurationHistory from "../lib/academy-configuration-history";
import * as meta from "../lib/perfect-attendance";
import * as policyMeta from "../lib/management-policy";

const manifest = JSON.parse(readFileSync("docs/policies/restart-police-v3.1.json", "utf8"));
const periods = manifest.periods.map((p: { startTime: string }) => ({ ...p, id: p.startTime, isActive: true }));
const policy = { ...mapPolicy(manifest, periods), effectiveFrom: "2026-08-01" };
const mandatory = ["09:15", "11:00", "13:45", "15:30"];
function records(from: string, to: string, status = "PRESENT", reason: string | null = null): meta.PerfectAttendanceRecord[] {
  const result: meta.PerfectAttendanceRecord[] = [];
  for (const day = new Date(`${from}T00:00:00Z`); day <= new Date(`${to}T00:00:00Z`); day.setUTCDate(day.getUTCDate() + 1)) {
    if (day.getUTCDay() === 0) continue;
    for (const periodId of mandatory) result.push({ studentId: "student", periodId, date: day.toISOString().slice(0, 10), status, reason });
  }
  return result;
}
function awards(rows: meta.PerfectAttendanceRecord[], date = "2026-09-12", now = "2026-09-12T17:00:00+09:00") {
  return meta.buildPerfectAttendanceAwards({ windows: meta.perfectAttendanceWindows(date), policy, periods, studentIds: ["student"], records: rows, weeklyPts: 2, monthlyPts: 2, now: new Date(now) });
}

test("수업 사유결석만 있는 주도 +2, 아침모의·토요일 저녁·일요일 기록은 제외", () => {
  const rows = records("2026-09-07", "2026-09-12", "EXCUSED", "수업: 기본이론");
  for (const [date, periodId] of [["2026-09-07", "08:30"], ["2026-09-12", "18:15"], ["2026-09-13", "09:15"]]) {
    rows.push({ studentId: "student", date, periodId, status: "ABSENT" });
  }
  assert.deepEqual(awards(rows), [{ studentId: "student", points: 2, date: "2026-09-12T00:00:00.000Z", notes: "[자동] 주간 개근 상점 (2026-09-07~2026-09-13)" }]);
});

test("지각 1회·결석·무단중도퇴실 결석·일반 사유·휴일권·미입력은 개근이 아니다", () => {
  for (const [status, reason] of [["TARDY", null], ["ABSENT", null], ["ABSENT", "무단중도퇴실"], ["EXCUSED", "수업 불참"], ["EXCUSED", "병원"], ["HOLIDAY", null], ["NOT_APPLICABLE", null]]) {
    const rows = records("2026-09-07", "2026-09-12");
    rows[0] = { ...rows[0], status: status!, reason };
    assert.deepEqual(awards(rows), [], `${status}: ${reason}`);
  }
  assert.deepEqual(awards(records("2026-09-07", "2026-09-12").slice(1)), []);
});

test("미래 수업 일괄 입력은 마지막 관리 교시가 끝나기 전 지급하지 않는다", () => {
  const rows = records("2026-09-07", "2026-09-12", "EXCUSED", "수업");
  assert.deepEqual(awards(rows, "2026-09-12", "2026-09-12T16:59:59+09:00"), []);
  assert.equal(awards(rows, "2026-09-12", "2026-09-12T17:00:00+09:00").length, 1);
  assert.equal(awards(rows, "2026-09-14", "2026-09-14T09:15:00+09:00").length, 1, "다음 주 저장이 직전 주를 마감한다");
});

test("기존 강좌명 수업 사유도 주간 개근 출석으로 인정한다",()=>{
  assert.equal(awards(records("2026-09-07","2026-09-12","EXCUSED","기본이론 수업 수강")).length,1);
});

test("월 경계를 넘는 주는 마지막 관리일의 달에 귀속하고 월 개근도 마지막 관리일로 기록", () => {
  const rows = records("2026-08-31", "2026-09-30");
  const crossing = awards(rows, "2026-08-31", "2026-10-01T00:00:00+09:00").find(r => r.notes.includes("주간"))!;
  assert.equal(crossing.date, "2026-09-05T00:00:00.000Z");
  assert.equal(crossing.notes, "[자동] 주간 개근 상점 (2026-08-31~2026-09-06)");
  const monthly = awards(rows, "2026-09-30", "2026-10-01T00:00:00+09:00").find(r => r.notes === "[자동] 월 개근 상점 (2026-09)")!;
  assert.equal(monthly.date, "2026-09-30T00:00:00.000Z");
  const feb = awards(records("2027-02-01", "2027-02-27"), "2027-02-28", "2027-03-01T00:00:00+09:00").find(r => r.notes === "[자동] 월 개근 상점 (2027-02)")!;
  assert.equal(feb.date, "2027-02-27T00:00:00.000Z", "월말 일요일은 기록 날짜에서 제외한다");
});

test("선택 통제 교시는 신청 학생에게만 의무이며 규정 적용 전 날짜·비활성 교시는 제외", () => {
  const rows = records("2026-09-08", "2026-09-12");
  const p = { ...policy, effectiveFrom: "2026-09-08", optionalEnrollments: [{ studentId: "student", periodId: "18:15", dateFrom: "2026-09-08", dateTo: "2026-09-08", weekdays: [2] }] };
  const input = { windows: meta.perfectAttendanceWindows("2026-09-12"), policy: p, periods, studentIds: ["student"], records: rows, weeklyPts: 7, monthlyPts: 0, now: new Date("2026-09-13T00:00:00+09:00") };
  assert.deepEqual(meta.buildPerfectAttendanceAwards(input), []);
  rows.push({ studentId: "student", periodId: "18:15", date: "2026-09-08", status: "PRESENT" });
  assert.equal(meta.buildPerfectAttendanceAwards(input)[0]?.points, 7, "설정값을 그대로 사용한다");
  rows.pop();
  assert.equal(meta.buildPerfectAttendanceAwards({ ...input, periods: periods.map((period: meta.PerfectAttendancePeriod) => ({ ...period, isActive: period.id !== "18:15" })) }).length, 1);
});

type Service = typeof import("../lib/services/perfect-attendance.service");
type Point = { id: string; studentId: string; ruleId: string | null; points: number; date: string; notes: string; recordedById?: string };
function serviceFixture(mock = true) {
  const state = {
    studentsByDivision: { police: [{ id: "student", status: "ACTIVE", seatId: "seat" }] },
    periodsByDivision: { police: periods },
    attendanceByDivision: { police: records("2026-09-01", "2026-09-30", "EXCUSED", "수업") },
    pointRecordsByDivision: { police: [] as Point[], fire: [{ id: "fire", studentId: "fire", ruleId: null, date: "2026-09-12T00:00:00.000Z", notes: "[자동] 주간 개근 상점 (2026-09-07~2026-09-13)", points: 2 }] as Point[] },
  };
  let locked = false;
  const check = (query: { where: { student?: { divisionId: string }; divisionId?: string } }) => {
    assert.equal(locked, true, "원본은 잠금 이후에 읽는다");
    assert.equal(query.where.divisionId ?? query.where.student?.divisionId, "police");
  };
  const tx = {
    division: { findUniqueOrThrow: async ({ where }: { where: { slug: string } }) => ({ id: where.slug }) },
    $executeRaw: async (_query: TemplateStringsArray, lock: string) => { assert.equal(lock, "perfect-attendance:police"); locked = true; },
    academyConfigurationApplication: { findMany: async (q: Parameters<typeof check>[0]) => { check(q); return []; } },
    period: { findMany: async (q: Parameters<typeof check>[0]) => { check(q); return periods; } },
    student: { findMany: async (q: Parameters<typeof check>[0]) => { check(q); return state.studentsByDivision.police.filter(student => student.status === "ACTIVE"); } },
    attendance: { findMany: async (q: Parameters<typeof check>[0]) => { check(q); return state.attendanceByDivision.police.map(r => ({ ...r, date: new Date(r.date) })); } },
    pointRecord: {
      findMany: async (q: Parameters<typeof check>[0] & { where: { ruleId: null; notes: { in: string[] } } }) => { check(q); return state.pointRecordsByDivision.police.filter(r => state.studentsByDivision.police.some(student => student.id === r.studentId && student.status === "ACTIVE") && r.ruleId === q.where.ruleId && q.where.notes.in.includes(r.notes)).map(r => ({ ...r, date: new Date(r.date) })); },
      deleteMany: async (q: Parameters<typeof check>[0] & { where: { id: { in: string[] } } }) => { check(q); state.pointRecordsByDivision.police = state.pointRecordsByDivision.police.filter(r => !q.where.id.in.includes(r.id)); },
      createMany: async ({ data }: { data: Array<Omit<Point, "id" | "date"> & { date: Date }> }) => { state.pointRecordsByDivision.police.push(...data.map(r => ({ ...r, id: randomUUID(), date: r.date.toISOString() }))); },
    },
  };
  const dependencies: Record<string, unknown> = {
    "@/lib/academy-configuration-history": configurationHistory,
    "node:crypto": { randomUUID }, "@/lib/perfect-attendance": meta, "@/lib/management-policy": policyMeta,
    "@/lib/mock-data": { isMockMode: () => mock },
    "@/lib/mock-store": { updateMockState: async (mutate: (s: typeof state) => unknown) => mutate(state) },
    "@/lib/service-helpers": { getPrismaClient: async () => ({ $transaction: async (run: (db: typeof tx) => unknown) => { locked = false; return run(tx); } }) },
  };
  const code = ts.transpileModule(readFileSync("lib/services/perfect-attendance.service.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", code)((id: string) => { assert.ok(id in dependencies, id); return dependencies[id]; }, module, module.exports);
  return { state, service: module.exports as Service };
}

for (const mode of ["mock", "DB"] as const) {
  test(`${mode}: 휴원·퇴실 학생에게 신규 개근 상점을 지급하지 않는다`, async t => {
    t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-05T22:00:00+09:00") });
    for (const status of ["WITHDRAWN", "ON_LEAVE"]) {
      const { state, service } = serviceFixture(mode === "mock");
      state.studentsByDivision.police[0].status = status;
      await service.syncPeriodicPerfectAttendancePoints("police", "2026-09-12", "assistant", policy, { perfectAttendanceWeeklyPts: 2, perfectAttendanceMonthlyPts: 2 });
      assert.deepEqual(state.pointRecordsByDivision.police, []);
    }
  });
  test(`${mode}: 출석 수정 시 주·월 회수, 재지급·재호출 멱등, 수동·다른 직렬 보존, 기본0`, async t => {
    t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-05T22:00:00+09:00") });
    const { state, service } = serviceFixture(mode === "mock");
    const settings = { perfectAttendanceWeeklyPts: 2, perfectAttendanceMonthlyPts: 2 };
    const sync = () => service.syncPeriodicPerfectAttendancePoints("police", "2026-09-12", "assistant", policy, settings);
    const manual: Point = { id: "manual", studentId: "student", ruleId: "manual-rule", points: 8, notes: "[자동] 주간 개근 상점 (2026-09-07~2026-09-13)", date: "2026-09-12T00:00:00.000Z" };
    state.pointRecordsByDivision.police.push(manual);
    const fire = JSON.stringify(state.pointRecordsByDivision.fire);
    await sync();
    const first = JSON.stringify(state.pointRecordsByDivision.police);
    assert.equal(state.pointRecordsByDivision.police.length, 3);
    assert.deepEqual(await sync(), { grantedCount: 0, revokedCount: 0 });
    assert.equal(JSON.stringify(state.pointRecordsByDivision.police), first);
    state.studentsByDivision.police[0].status = "WITHDRAWN";
    state.studentsByDivision.police[0].seatId = "";
    assert.deepEqual(await sync(), { grantedCount: 0, revokedCount: 0 }, "현재 퇴실·좌석 해제는 과거 개근을 취소하지 않는다");
    assert.equal(JSON.stringify(state.pointRecordsByDivision.police), first);
    state.studentsByDivision.police[0].status = "ACTIVE";
    const cell = state.attendanceByDivision.police.find(r => r.date === "2026-09-08")!;
    cell.status = "TARDY";
    assert.deepEqual(await sync(), { grantedCount: 0, revokedCount: 2 });
    assert.deepEqual(state.pointRecordsByDivision.police, [manual]);
    cell.status = "EXCUSED";
    assert.equal((await sync()).grantedCount, 2);
    settings.perfectAttendanceWeeklyPts = 0;
    settings.perfectAttendanceMonthlyPts = 0;
    assert.equal((await sync()).revokedCount, 2);
    assert.deepEqual(state.pointRecordsByDivision.police, [manual]);
    assert.equal(JSON.stringify(state.pointRecordsByDivision.fire), fire);
  });
}
