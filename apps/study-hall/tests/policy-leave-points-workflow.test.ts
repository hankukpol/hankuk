import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { loadWithMocks } from "./helpers/module-mocks";
import { mapPolicy } from "../scripts/restart-police-policy";
import type { MockAttendanceRecord, MockStudentRecord, MockLeavePermissionRecord, MockPointRecordRecord } from "../lib/mock-store";

type MockState = Awaited<ReturnType<typeof import("../lib/mock-store").readMockState>>;

// All service reads/writes use this disposable in-memory fixture. The real mock
// store and Prisma connection are replaced before importing any service.
const manifest = JSON.parse(readFileSync("docs/policies/restart-police-v3.1.json", "utf8"));
const periods = manifest.periods.map((p: { startTime: string }) => ({ ...p, id: p.startTime, isActive: true }));
const basePolicy = mapPolicy(manifest, periods);
const actor = { id: "fixture-admin", name: "검증 관리자", role: "ADMIN" as const };

function student(id: string, extra: Partial<MockStudentRecord> = {}): MockStudentRecord {
  return { id, divisionId: "police", name: id, studentNumber: id, status: "ACTIVE", courseStartDate: "2026-09-01", courseEndDate: null, enrolledAt: "2026-09-01T00:00:00Z", createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z", ...extra } as MockStudentRecord;
}

function permission(studentId: string, date: string, type: MockLeavePermissionRecord["type"] = "HOLIDAY", status: MockLeavePermissionRecord["status"] = "USED"): MockLeavePermissionRecord {
  return { id: `${studentId}-${type}-${date}`, studentId, type, date, status, reason: "관리자 확인", approvedById: actor.id, createdAt: `${date}T00:00:00Z` };
}

function point(studentId: string, date: string, points: number, ruleId: string | null = null): MockPointRecordRecord {
  return { id: `${studentId}-${date}-${points}`, studentId, date: `${date}T00:00:00Z`, points, ruleId, notes: null, recordedById: actor.id, createdAt: `${date}T00:00:00Z` };
}

function attendance(
  id: string,
  studentId: string,
  periodId: string,
  date: string,
  status: MockAttendanceRecord["status"],
  reason: string,
): MockAttendanceRecord {
  return { id, studentId, periodId, date, status, reason, checkInTime: null, recordedById: actor.id, createdAt: `${date}T00:00:00Z`, updatedAt: `${date}T00:00:00Z` };
}

function fixture(t: TestContext, now = "2026-10-01T00:00:00+09:00") {
  t.mock.timers.enable({ apis: ["Date"], now: new Date(now) });
  let state = {
    studentsByDivision: { police: [student("a")], fire: [student("fire", { divisionId: "fire" })] },
    periodsByDivision: { police: periods, fire: [] },
    pointRulesByDivision: { police: manifest.rules.map((r: object) => ({ ...r, isActive: true })), fire: [] },
    divisionSettingsByDivision: { police: { managementPolicy: basePolicy, holidayLimit: 2, holidayUnusedPts: 2, halfDayLimit: 0, halfDayUnusedPts: 0, healthLimit: 1, warnLevel1: 10, warnLevel2: 20, warnInterview: 25, warnWithdraw: 30 }, fire: { holidayLimit: 1, holidayUnusedPts: 5, halfDayLimit: 2, halfDayUnusedPts: 2, healthLimit: 1 } },
    attendanceByDivision: { police: [], fire: [] },
    leavePermissionsByDivision: { police: [], fire: [] },
    pointRecordsByDivision: { police: [], fire: [] },
    phoneSubmissionsByDivision: { police: [], fire: [] },
    seatsByDivision: {}, studyRoomsByDivision: {}, tuitionPlansByDivision: {},
  } as unknown as MockState;
  let queue = Promise.resolve();
  const restores: (() => void)[] = [];
  t.after(() => restores.reverse().forEach((restore) => restore()));
  const attendanceSyncs: string[] = [];
  const dependencies: Record<string, unknown> = {
    react: { cache: <T>(fn: T) => fn },
    "next/cache": { revalidatePath() {}, revalidateTag() {} },
    "@/lib/services/academy-configuration-history.service": {getHistoricalAcademyConfiguration:async()=>null},
    "@/lib/revalidation": { revalidateDivisionOperationalViews() {} },
    "@/lib/mock-data": {
      isMockMode: () => true,
      getMockDivisionBySlug: (slug: string) => ({ id: slug, slug, name: slug }),
      getMockAdminSession: () => actor,
    },
    "@/lib/mock-store": {
      readMockState: async () => structuredClone(state),
      updateMockState: <T>(update: (draft: MockState) => T | Promise<T>) => {
        const next = queue.then(async () => {
          const draft = structuredClone(state);
          const result = await update(draft);
          state = draft;
          return result;
        });
        queue = next.then(() => undefined, () => undefined);
        return next;
      },
    },
    "@/lib/service-helpers": {
      getPrismaClient: () => { throw new Error("Real database access is forbidden in this fixture"); },
      normalizeOptionalText: (value?: string | null) => value?.trim() || null,
    },
    "@/lib/services/settings.service": { getDivisionSettings: async (slug: string) => state.divisionSettingsByDivision[slug] },
    "@/lib/services/period.service": { getPeriods: async (slug: string) => state.periodsByDivision[slug] ?? [] },
    "@/lib/services/attendance.service": { syncAttendanceDerivedPoints: async (slug: string, date: string) => { attendanceSyncs.push(`${slug}:${date}`); } },
  };
  function load<T>(name: string, extra: Record<string, unknown> = {}): T {
    const mocks = { ...dependencies, ...extra };
    delete mocks[`@/lib/services/${name}.service`];
    const loaded = loadWithMocks<T>(require.resolve(`../lib/services/${name}.service`), mocks);
    restores.push(loaded.restore);
    return loaded.module;
  }
  const policy = load<typeof import("../lib/services/management-policy.service")>("management-policy");
  dependencies["@/lib/services/management-policy.service"] = policy;
  const students = load<typeof import("../lib/services/student.service")>("student");
  dependencies["@/lib/services/student.service"] = students;
  return {
    get state() { return state; }, load, students, policy, attendanceSyncs,
    pointDeletionService: () => {
      // Compile dynamic imports to require so the existing closed fixture also
      // intercepts the attendance re-sync instead of Node's ESM module cache.
      const source = readFileSync("lib/services/point.service.ts", "utf8");
      const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
      const module = { exports: {} };
      new Function("require", "module", "exports", code)((id: string) => dependencies[id] ?? require(id), module, module.exports);
      return module.exports as typeof import("../lib/services/point.service");
    },
    leave: load<typeof import("../lib/services/leave.service")>("leave"),
    points: load<typeof import("../lib/services/point.service")>("point"),
    review: load<typeof import("../lib/services/policy-review.service")>("policy-review"),
  };
}

test("휴무 취소는 승인 전에 등록된 수업을 복원한다", async t => {
  const f = fixture(t, "2026-09-08T09:00:00+09:00");
  const original = attendance("original-class", "a", "09:15", "2026-09-09", "EXCUSED", "수업: 기본이론");
  f.state.attendanceByDivision.police.push(original);
  const leave = await f.leave.createLeavePermission("police", actor, {studentId:"a",type:"HOLIDAY",date:"2026-09-09"});
  assert.equal(f.state.attendanceByDivision.police.filter(r=>r.periodId==="09:15").length, 1);
  assert.equal(f.state.attendanceByDivision.police.find(r=>r.periodId==="09:15")!.status, "HOLIDAY");
  f.state.studentsByDivision.police[0].seatId = "fixture-seat";
  t.mock.timers.tick(1000);
  const approvedCell = f.state.attendanceByDivision.police.find(r => r.periodId === "09:15")!;
  const attendanceService = f.load<typeof import("../lib/services/attendance.service")>("attendance");
  await attendanceService.upsertAttendanceBatch("police", actor, {
    date: "2026-09-09", periodId: "09:15",
    records: [{ studentId: "a", status: "HOLIDAY", reason: approvedCell.reason ?? "" }],
  });
  await f.leave.cancelLeavePermission("police", leave!.id, actor);
  const restored = f.state.attendanceByDivision.police.find(r=>r.periodId==="09:15")!;
  assert.equal(restored.status, "EXCUSED"); assert.equal(restored.reason, "수업: 기본이론");
  assert.equal(restored.recordedById, original.recordedById);
});

test("휴무 승인 이후 별도로 수정한 출결은 취소 시 덮어쓰지 않는다", async t => {
  const f = fixture(t, "2026-09-08T09:00:00+09:00");
  f.state.attendanceByDivision.police.push(attendance("original-class", "a", "09:15", "2026-09-09", "EXCUSED", "수업: 기본이론"));
  const leave = await f.leave.createLeavePermission("police", actor, {studentId:"a",type:"HOLIDAY",date:"2026-09-09"});
  const changed=f.state.attendanceByDivision.police.find(r=>r.periodId==="09:15")!;
  changed.status="PRESENT";changed.reason="직접 확인";
  await f.leave.cancelLeavePermission("police", leave!.id, actor);
  assert.equal(f.state.attendanceByDivision.police.find(r=>r.periodId==="09:15")!.status,"PRESENT");
});

test("휴일권은 월 2회, 취소분 제외, 다음 달 한도 독립 (학생규정 170)", async (t) => {
  const f = fixture(t, "2026-09-08T09:00:00+09:00");
  const beforeFire = JSON.stringify(f.state.studentsByDivision.fire);
  const first = await f.leave.createLeavePermission("police", actor, { studentId: "a", type: "HOLIDAY", date: "2026-09-09" });
  t.mock.timers.tick(1);
  await f.leave.createLeavePermission("police", actor, { studentId: "a", type: "HOLIDAY", date: "2026-09-10" });
  await assert.rejects(f.leave.createLeavePermission("police", actor, { studentId: "a", type: "HOLIDAY", date: "2026-09-11" }), /월 한도/);
  await f.leave.cancelLeavePermission("police", first!.id, actor);
  t.mock.timers.tick(1);
  await f.leave.createLeavePermission("police", actor, { studentId: "a", type: "HOLIDAY", date: "2026-09-11" });
  await f.leave.createLeavePermission("police", actor, { studentId: "a", type: "HOLIDAY", date: "2026-10-01" });
  await assert.rejects(f.leave.createLeavePermission("police", actor, { studentId: "fire", type: "HOLIDAY", date: "2026-10-02" }), /학생 정보/);
  assert.equal(JSON.stringify(f.state.studentsByDivision.fire), beforeFire);
  assert.deepEqual(f.state.leavePermissionsByDivision.fire, []);
  assert.ok(f.attendanceSyncs.includes("police:2026-09-09"));
});

test("당일 휴일권·병가의 인정 사유 필수, 인정 병가에 옛 월 1회 한도 미적용 (153–170)", async (t) => {
  const f = fixture(t, "2026-09-08T09:00:00+09:00");
  for (const type of ["HOLIDAY", "HEALTH"] as const) {
    await assert.rejects(f.leave.createLeavePermission("police", actor, { studentId: "a", type, date: "2026-09-08", reason: " " }), /사유/);
  }
  for (const date of ["2026-09-08", "2026-09-09", "2026-09-10"]) {
    await f.leave.createLeavePermission("police", actor, { studentId: "a", type: "HEALTH", date, reason: "통원 진료확인서 확인" });
  }
  assert.equal(f.state.leavePermissionsByDivision.police.length, 3);
  assert.deepEqual(f.state.pointRecordsByDivision.police, []);
});

test("휴가 승인·취소는 선택자습 신청자의 5교시까지 반영하고 자율교시는 건드리지 않는다 (104–107, 170)", async (t) => {
  const f = fixture(t, "2026-09-08T09:00:00+09:00");
  const settings = f.state.divisionSettingsByDivision.police as unknown as { managementPolicy: typeof basePolicy };
  settings.managementPolicy = { ...basePolicy, optionalEnrollments: [{ studentId: "a", periodId: "18:15", dateFrom: "2026-09-09", dateTo: "2026-09-09", weekdays: [3] }] };
  const result = await f.leave.createLeavePermission("police", actor, { studentId: "a", type: "HOLIDAY", date: "2026-09-09" });
  assert.deepEqual(f.state.attendanceByDivision.police.map((r) => r.periodId), ["09:15", "11:00", "13:45", "15:30", "18:15"]);
  await f.leave.cancelLeavePermission("police", result!.id, actor);
  assert.equal(f.state.attendanceByDivision.police.length, 0);
  t.mock.timers.tick(1);
  await f.leave.createLeavePermission("police", actor, { studentId: "a", type: "HEALTH", date: "2026-09-10", reason: "통원 인정" });
  assert.equal(f.state.attendanceByDivision.police.length, 4);
  await f.leave.createLeavePermission("police", actor, { studentId: "a", type: "HEALTH", date: "2026-09-13", reason: "통원 인정" });
  assert.equal(f.state.attendanceByDivision.police.filter((r) => r.date === "2026-09-13").length, 0);
});

test("인정 병가는 미사용 휴일권 상점에서 차감하지 않는다 (153–170, 253–254)", async (t) => {
  const f = fixture(t);
  f.state.leavePermissionsByDivision.police = [permission("a", "2026-09-10", "HEALTH"), permission("a", "2026-09-11", "HEALTH")];
  const preview = await f.leave.previewLeaveSettlement("police", { month: "2026-09" });
  assert.equal(preview.items[0]?.holidayRemaining, 2);
  assert.equal(preview.items[0]?.rewardPoints, 4);
  f.state.leavePermissionsByDivision.police.push(permission("a", "2026-09-30"));
  assert.equal((await f.leave.previewLeaveSettlement("police", { month: "2026-09" })).items[0]?.rewardPoints, 2);
});

test("정산월 재원 기간과 현재 상태를 확인하고, 다음 달 신규등록생에게 전월 상점을 주지 않는다", async (t) => {
  const f = fixture(t);
  f.state.studentsByDivision.police.push(
    student("leave", { status: "ON_LEAVE" }),
    student("withdrawn", { status: "WITHDRAWN" }),
    student("graduated", { status: "GRADUATED" }),
    student("new", { courseStartDate: "2026-10-01" }),
    student("ended", { courseStartDate: "2026-08-01", courseEndDate: "2026-08-31" }),
    student("start-last-day", { courseStartDate: "2026-09-30" }),
  );
  const preview = await f.leave.previewLeaveSettlement("police", { month: "2026-09" });
  assert.deepEqual(preview.items.map((s) => s.studentId).sort(), ["a", "leave", "start-last-day"]);
});

test("정산은 한국시간 월 마감 후 대상 월 말일에 1회 귀속되고 현재 월 상점을 오염시키지 않는다", async (t) => {
  const f = fixture(t, "2026-09-30T14:59:59Z");
  await assert.rejects(f.leave.settleLeaveMonth("police", actor, { month: "2026-09" }), /진행 중인 월/);
  t.mock.timers.tick(1000);
  const first = await f.leave.settleLeaveMonth("police", actor, { month: "2026-09" });
  const second = await f.leave.settleLeaveMonth("police", actor, { month: "2026-09" });
  assert.equal(first.totalRewardPoints, 4);
  assert.equal(second.createdCount, 0);
  assert.equal(f.state.pointRecordsByDivision.police[0].date, "2026-09-30T00:00:00.000Z");
  assert.equal((await f.policy.getPolicyPointTotals("police"))?.size, 0);
});

test("동시에 요청된 같은 월 정산도 학생당 한 번만 지급한다", async (t) => {
  const f = fixture(t);
  const results = await Promise.all([
    f.leave.settleLeaveMonth("police", actor, { month: "2026-09" }),
    f.leave.settleLeaveMonth("police", actor, { month: "2026-09" }),
  ]);
  assert.equal(f.state.pointRecordsByDivision.police.length, 1);
  assert.equal(results.reduce((sum, r) => sum + r.totalRewardPoints, 0), 4);
});

test("소방과 정책 시행 전에는 기존 병가 차감 정산 동작을 보존한다", async (t) => {
  const f = fixture(t);
  f.state.studentsByDivision.fire = [student("fire", { divisionId: "fire" })];
  f.state.leavePermissionsByDivision.fire = [permission("fire", "2026-09-10", "HEALTH")];
  assert.equal((await f.leave.previewLeaveSettlement("fire", { month: "2026-09" })).items[0]?.holidayRemaining, 0);
  f.state.studentsByDivision.police[0].courseStartDate = "2026-08-01";
  f.state.leavePermissionsByDivision.police = [permission("a", "2026-08-10", "HEALTH")];
  assert.equal((await f.leave.previewLeaveSettlement("police", { month: "2026-08" })).items[0]?.holidayRemaining, 1);
});

test("상벌점 날짜 생략 시 한국시간 월초 날짜로 저장한다 (229, 256–257)", async (t) => {
  const f = fixture(t, "2026-09-30T15:00:00Z");
  await f.points.createPointRecord("police", actor, { studentId: "a", points: -10, notes: "확정 기록" });
  assert.equal(f.state.pointRecordsByDivision.police[0].date, "2026-10-01T00:00:00.000Z");
  assert.equal((await f.policy.getPolicyPointTotals("police"))?.get("a")?.demerit, 10);
});

test("주간·월 개근을 이름·마지막 관리일로 표시하고 삭제 시 해당 출석 기간을 재계산한다", async t => {
  const f = fixture(t);
  f.state.pointRecordsByDivision.police = [
    { ...point("a", "2026-09-05", 2), id: "weekly", notes: "[자동] 주간 개근 상점 (2026-08-31~2026-09-06)" },
    { ...point("a", "2026-09-30", 2), id: "monthly", notes: "[자동] 월 개근 상점 (2026-09)" },
  ];
  const listed = await f.points.listPointRecords("police", { dateFrom: "2026-09-01", dateTo: "2026-09-30" });
  assert.deepEqual(listed.map(r => r.ruleName), ["월 개근 상점", "주간 개근 상점"]);
  assert.deepEqual(listed.map(r => r.date.slice(0, 10)), ["2026-09-30", "2026-09-05"]);
  const deletion = f.pointDeletionService();
  await deletion.deletePointRecord("police", "weekly", actor);
  await deletion.deletePointRecord("police", "monthly", actor);
  assert.deepEqual(f.attendanceSyncs, ["police:2026-08-31", "police:2026-09-01"]);
});

test("문서 3절: 아침 결석 10회는 설정 규칙 합계 벌점30, 상계 없이 이용종료 검토이며 자동 퇴실 없음", async t => {
  const f = fixture(t, "2026-09-30T23:59:59+09:00");
  const rules = f.state.pointRulesByDivision.police;
  const morning = rules.find(r => r.id === "restart-v31-police-morning-absence")!;
  const partial = rules.find(r => r.id === basePolicy.partialAbsenceRuleId)!;
  for (let count = 0; count < 10; count++) {
    f.state.pointRecordsByDivision.police.push({ ...point("a", "2026-09-08", morning.points, morning.id), id: `morning-${count}` }, { ...point("a", "2026-09-08", partial.points, partial.id), id: `partial-${count}` });
  }
  f.state.pointRecordsByDivision.police.push(point("a", "2026-09-30", 18));
  const item = (await f.students.listStudents("police"))[0];
  assert.equal(item.demeritPoints, 30);
  assert.equal(item.meritPoints, 18);
  assert.equal((await f.points.listWarningStudents("police"))[0].warningStage, "WITHDRAWAL");
  assert.equal(f.state.studentsByDivision.police[0].status, "ACTIVE");
});

test("상점·벌점 별도 월 합계, 경고 10/20/25/30, 휴일권 미사용 동점 지표 (221–257)", async (t) => {
  const f = fixture(t, "2026-09-30T23:59:59+09:00");
  f.state.studentsByDivision.police = [9, 10, 20, 25, 30].map((n) => student(`s${n}`));
  f.state.studentsByDivision.police.push(student("withdrawn", { status: "WITHDRAWN" }));
  for (const s of f.state.studentsByDivision.police) {
    const n = Number(s.id.slice(1)) || 30;
    f.state.pointRecordsByDivision.police.push(point(s.id, "2026-09-10", -n), point(s.id, "2026-09-11", 100), point(s.id, "2026-08-31", -50));
  }
  f.state.leavePermissionsByDivision.police = [permission("s10", "2026-09-15"), permission("s20", "2026-09-15", "HEALTH"), permission("s25", "2026-09-15", "HOLIDAY", "REJECTED")];
  const snapshot = JSON.stringify(f.state.pointRecordsByDivision);
  const students = await f.students.listStudents("police");
  assert.equal(students.find((s) => s.id === "s20")?.meritPoints, 100);
  assert.equal(students.find((s) => s.id === "s20")?.demeritPoints, 20);
  assert.equal(students.find((s) => s.id === "s10")?.unusedHolidayCount, 1);
  assert.equal(students.find((s) => s.id === "s20")?.unusedHolidayCount, 2);
  assert.equal(students.find((s) => s.id === "s25")?.unusedHolidayCount, 2);
  assert.deepEqual((await f.points.listWarningStudents("police")).map((s) => [s.id, s.warningStage]), [
    ["s30", "WITHDRAWAL"], ["s25", "INTERVIEW"], ["s20", "WARNING_2"], ["s10", "WARNING_1"],
  ]);
  t.mock.timers.tick(1000);
  assert.deepEqual(await f.points.listWarningStudents("police"), []);
  assert.equal(JSON.stringify(f.state.pointRecordsByDivision), snapshot);
});

test("최근 7일 중도퇴실은 월 경계를 넘고 2회 면담·3회 미션, 무단입실은 해당 월만 집계 (126–127)", async (t) => {
  const f = fixture(t, "2026-10-02T09:00:00+09:00");
  f.state.pointRecordsByDivision.police = [
    point("a", "2026-09-25", -1, basePolicy.earlyExit.ruleId),
    point("a", "2026-09-26", -1, basePolicy.earlyExit.ruleId),
    point("a", "2026-10-02", -1, basePolicy.earlyExit.ruleId),
    point("a", "2026-09-30", -2, basePolicy.unauthorizedEntry.ruleId),
    point("a", "2026-10-02", -2, basePolicy.unauthorizedEntry.ruleId),
    point("a", "2026-10-03", -1, basePolicy.earlyExit.ruleId),
  ];
  f.state.leavePermissionsByDivision.police = [permission("a", "2026-10-01", "HEALTH")];
  assert.deepEqual((await f.review.getPolicyReviewSignals("police")).map((s) => s.action), ["면담"]);
  f.state.pointRecordsByDivision.police.push(point("a", "2026-10-01", -1, basePolicy.earlyExit.ruleId), point("a", "2026-10-01", -2, basePolicy.unauthorizedEntry.ruleId));
  assert.deepEqual((await f.review.getPolicyReviewSignals("police")).map((s) => s.action), ["7일 개선미션", "즉시 퇴실심의"]);
  assert.deepEqual(await f.review.getPolicyReviewSignals("fire"), []);
});

test("반복위반 검토는 재원생만 대상이고 퇴실·수료·다른 직렬·삭제된 학생을 포함하지 않는다", async (t) => {
  const f = fixture(t, "2026-10-02T09:00:00+09:00");
  f.state.studentsByDivision.police.push(student("leave", { status: "ON_LEAVE" }), student("withdrawn", { status: "WITHDRAWN" }), student("graduated", { status: "GRADUATED" }));
  for (const id of ["a", "leave", "withdrawn", "graduated", "fire", "missing"]) {
    f.state.pointRecordsByDivision.police.push(point(id, "2026-10-01", -1, basePolicy.earlyExit.ruleId), point(id, "2026-10-02", -1, basePolicy.earlyExit.ruleId));
  }
  assert.deepEqual((await f.review.getPolicyReviewSignals("police")).map((s) => s.studentId).sort(), ["a", "leave"]);
});

test("휴가 잘못된 달력 날짜는 로컬과 DB 분기 모두 저장 전에 거부한다", async (t) => {
  const f = fixture(t, "2026-09-08T09:00:00+09:00");
  await assert.rejects(f.leave.createLeavePermission("police", actor, { studentId: "a", type: "HOLIDAY", date: "2026-09-31" }), /날짜/);
  assert.deepEqual(f.state.leavePermissionsByDivision.police, []);
  const dbLeave = f.load<typeof import("../lib/services/leave.service")>("leave", { "@/lib/mock-data": { isMockMode: () => false } });
  await assert.rejects(dbLeave.createLeavePermission("police", actor, { studentId: "a", type: "HOLIDAY", date: "2026-09-31" }), /날짜/);
});

test("DB 정산 분기도 병가 별도 인정·재원 기간·직렬 필터가 동일하다", async (t) => {
  const f = fixture(t);
  const dbStudent = (id: string, start: string) => ({ ...student(id), courseStartDate: new Date(start), enrolledAt: new Date(start) });
  const calls: Record<string, unknown>[] = [];
  const capture = <T>(result: T) => async (query: Record<string, unknown>) => { calls.push(query); return result; };
  const prisma = {
    division: { findUnique: async () => ({ id: "police" }) },
    student: { findMany: capture([dbStudent("a", "2026-09-01"), dbStudent("new", "2026-10-01")]) },
    leavePermission: { findMany: capture([permission("a", "2026-09-08", "HEALTH")]) },
    pointRecord: { findMany: capture([]) },
  };
  const service = f.load<typeof import("../lib/services/leave.service")>("leave", {
    "@/lib/mock-data": { isMockMode: () => false },
    "@/lib/service-helpers": { getPrismaClient: async () => prisma },
  });
  const result = await service.previewLeaveSettlement("police", { month: "2026-09" });
  assert.deepEqual(result.items.map((s) => [s.studentId, s.holidayRemaining, s.rewardPoints]), [["a", 2, 4]]);
  for (const query of calls) assert.match(JSON.stringify(query.where), /"divisionId":"police"/);
});

test("DB 반복위반 조회가 재원생과 해당 직렬로 제한된다", async (t) => {
  const f = fixture(t, "2026-10-02T09:00:00+09:00");
  const calls: { where: { student: unknown } }[] = [];
  const findMany = async (query: { where: { student: unknown } }) => { calls.push(query); return []; };
  const service = f.load<typeof import("../lib/services/policy-review.service")>("policy-review", {
    "@/lib/mock-data": { isMockMode: () => false },
    "@/lib/service-helpers": { getPrismaClient: async () => ({ pointRecord: { findMany }, phoneSubmission: { findMany } }) },
  });
  assert.deepEqual(await service.getPolicyReviewSignals("police"), []);
  assert.equal(calls.length, 2);
  for (const query of calls) assert.deepEqual(query.where.student, { division: { slug: "police" }, status: { in: ["ACTIVE", "ON_LEAVE"] } });
});

test("반복 인정일정은 월 경계를 넘어 사유·요일·교시를 보존하고 상벌점을 생성하지 않는다 (169)", async (t) => {
  const f = fixture(t, "2026-09-28T09:00:00+09:00");
  f.state.studentsByDivision.police[0].seatId = "fixture-seat";
  const service = f.load<typeof import("../lib/services/attendance.service")>("attendance");
  const input = { studentIds: ["a"], dateFrom: "2026-09-29", dateTo: "2026-10-06", weekdays: [2], startPeriodId: "09:15", endPeriodId: "11:00", status: "EXCUSED" as const, reason: "체력시험 준비 정기수업 사전 확인" };
  await assert.rejects(service.applyRecurringAttendance("police", actor, { ...input, reason: " " }), /사유/);
  assert.equal((await service.applyRecurringAttendance("police", actor, input)).appliedCount, 4);
  assert.equal((await service.applyRecurringAttendance("police", actor, input)).skippedExistingCount, 4);
  assert.deepEqual(Array.from(new Set(f.state.attendanceByDivision.police.map((r) => r.date))), ["2026-09-29", "2026-10-06"]);
  assert.ok(f.state.attendanceByDivision.police.every((r) => r.status === "EXCUSED" && r.reason === input.reason));
  assert.deepEqual(f.state.pointRecordsByDivision.police, []);
  assert.deepEqual(f.state.attendanceByDivision.fire, []);
});

test("수업 선택은 한 달의 선택 학생·요일·교시만 인정 출석으로 저장하고 기존·타 직렬 기록을 보호한다", async (t) => {
  const f = fixture(t, "2026-09-01T09:00:00+09:00");
  f.state.studentsByDivision.police.push(student("b"), student("c"));
  for (const seated of f.state.studentsByDivision.police) seated.seatId = "fixture-seat";

  const protectedPoliceRecords = [
    attendance("existing-target", "a", "09:15", "2026-09-08", "PRESENT", "기존 출석"),
    attendance("outside-range", "a", "09:15", "2026-08-31", "ABSENT", "기간 밖 기록"),
    attendance("unselected-weekday", "a", "09:15", "2026-09-02", "ABSENT", "미선택 요일"),
    attendance("unselected-period", "a", "18:15", "2026-09-01", "ABSENT", "미선택 교시"),
    attendance("unselected-student", "c", "09:15", "2026-09-01", "ABSENT", "미선택 학생"),
  ];
  const protectedFireRecord = attendance("fire-record", "fire", "09:15", "2026-09-01", "ABSENT", "소방 기록");
  f.state.attendanceByDivision.police.push(...protectedPoliceRecords);
  f.state.attendanceByDivision.fire.push(protectedFireRecord);

  const service = f.load<typeof import("../lib/services/attendance.service")>("attendance");
  const classReason = "수업: 형법 기본이론";
  const input = {
    studentIds: ["a", "b"],
    dateFrom: "2026-09-01",
    dateTo: "2026-09-30",
    weekdays: [2, 4],
    startPeriodId: "09:15",
    endPeriodId: "15:30",
    status: "EXCUSED" as const,
    reason: classReason,
  };

  assert.deepEqual(await service.applyRecurringAttendance("police", actor, input), {
    appliedCount: 71,
    updatedExistingCount: 0,
    skippedExistingCount: 1,
    targetDateCount: 9,
    targetStudentCount: 2,
    targetCellCount: 72,
  });
  const attendanceBeforeDuplicate = JSON.stringify(f.state.attendanceByDivision);
  assert.deepEqual(await service.applyRecurringAttendance("police", actor, input), {
    appliedCount: 0,
    updatedExistingCount: 0,
    skippedExistingCount: 72,
    targetDateCount: 9,
    targetStudentCount: 2,
    targetCellCount: 72,
  });
  assert.equal(JSON.stringify(f.state.attendanceByDivision), attendanceBeforeDuplicate);

  const expectedDates = [
    "2026-09-01", "2026-09-03", "2026-09-08", "2026-09-10", "2026-09-15",
    "2026-09-17", "2026-09-22", "2026-09-24", "2026-09-29",
  ];
  const classRows = f.state.attendanceByDivision.police.filter((record) => record.reason === classReason);
  assert.equal(classRows.length, 71);
  assert.deepEqual(Array.from(new Set(classRows.map((record) => record.date))), expectedDates);
  assert.deepEqual(Array.from(new Set(classRows.map((record) => record.studentId))).sort(), ["a", "b"]);
  assert.deepEqual(Array.from(new Set(classRows.map((record) => record.periodId))), ["09:15", "11:00", "13:45", "15:30"]);
  assert.ok(classRows.every((record) => record.status === "EXCUSED"));
  for (const record of protectedPoliceRecords) {
    assert.deepEqual(f.state.attendanceByDivision.police.find((candidate) => candidate.id === record.id), record);
  }
  assert.deepEqual(f.state.attendanceByDivision.fire, [protectedFireRecord]);

  const queriedClassRows = (await service.getAttendanceSnapshots("police", expectedDates))
    .flatMap((snapshot) => snapshot.records)
    .filter((record) => record.reason === classReason);
  assert.equal(queriedClassRows.length, 71);
  assert.ok(queriedClassRows.every((record) => record.status === "EXCUSED" && record.reason === classReason));

  const stats = await service.getAttendanceStats("police", "2026-09-10", "2026-09-10");
  assert.equal(stats.totals.present, 2);
  assert.equal(stats.totals.excused, 0);
  assert.equal(stats.totals.unprocessed, 1);
  assert.equal(stats.attendanceRate, 66.7);
  assert.deepEqual(f.state.pointRecordsByDivision, { police: [], fire: [] });
});

test("강의명 없는 수업 사유도 EXCUSED 상태와 함께 조회된다", async (t) => {
  const f = fixture(t, "2026-09-01T09:00:00+09:00");
  f.state.studentsByDivision.police[0].seatId = "fixture-seat";
  const service = f.load<typeof import("../lib/services/attendance.service")>("attendance");
  await service.applyRecurringAttendance("police", actor, {
    studentIds: ["a"], dateFrom: "2026-09-01", dateTo: "2026-09-01", weekdays: [2],
    startPeriodId: "09:15", endPeriodId: "09:15", status: "EXCUSED", reason: "수업",
  });
  const snapshot = await service.getAttendanceSnapshot("police", "2026-09-01", "09:15");
  assert.deepEqual(snapshot.records.map(({ status, reason }) => ({ status, reason })), [{ status: "EXCUSED", reason: "수업" }]);
});

test("반복 인정일정은 선택한 학생 전원에게 한 번에 적용되고 좌석 없는 학생은 거부된다", async (t) => {
  const f = fixture(t, "2026-09-28T09:00:00+09:00");
  f.state.studentsByDivision.police.push(student("b"), student("c"));
  for (const seated of f.state.studentsByDivision.police) seated.seatId = "fixture-seat";
  const service = f.load<typeof import("../lib/services/attendance.service")>("attendance");
  const input = { dateFrom: "2026-09-29", dateTo: "2026-10-06", weekdays: [2], startPeriodId: "09:15", endPeriodId: "11:00", status: "EXCUSED" as const, reason: "정규 수업 수강" };

  await assert.rejects(service.applyRecurringAttendance("police", actor, { ...input, studentIds: [] }), /한 명 이상/);
  await assert.rejects(
    service.applyRecurringAttendance("police", actor, { ...input, studentIds: ["a", "없는학생"] }),
    /찾을 수 없습니다/,
  );

  // 학생 3명 × 2일(화요일) × 2교시 = 12칸
  const result = await service.applyRecurringAttendance("police", actor, { ...input, studentIds: ["a", "b", "c", "a"] });
  assert.equal(result.targetStudentCount, 3);
  assert.equal(result.targetCellCount, 12);
  assert.equal(result.appliedCount, 12);
  assert.deepEqual(
    Array.from(new Set(f.state.attendanceByDivision.police.map((r) => r.studentId))).sort(),
    ["a", "b", "c"],
  );
  assert.ok(f.state.attendanceByDivision.police.every((r) => r.status === "EXCUSED" && r.reason === input.reason));
  // 사유결석은 벌점 대상이 아니다.
  assert.deepEqual(f.state.pointRecordsByDivision.police, []);
  assert.deepEqual(f.state.attendanceByDivision.fire, []);
});

test("휴대폰 반복 검토는 잘못된 날짜 메모를 무시하고 정책 시행 전 이력을 세지 않는다", async (t) => {
  const f = fixture(t, "2026-09-09T12:00:00+09:00");
  f.state.phoneSubmissionsByDivision.police = [{ id: "phone", studentId: "a", divisionId: "police", periodId: "09:15", date: "2026-09-09", status: "SUBMITTED", recordedById: actor.id, createdAt: "2026-09-09T00:00:00Z", updatedAt: "2026-09-09T00:00:00Z", rentalNote: "[반출 날짜오류]\n[반출 2026-09-07T01:00:00Z]\n[반출 2026-09-08T01:00:00Z]\n[반출 2026-09-09T01:00:00Z]" }];
  assert.deepEqual(await f.review.getPolicyReviewSignals("police"), []);
  f.state.phoneSubmissionsByDivision.police[0].rentalNote += "\n[반출 2026-09-09T02:00:00Z]";
  assert.equal((await f.review.getPolicyReviewSignals("police"))[0]?.action, "관리자 예외 사용 검토");
});

test("DB 정산은 직렬별 지급 여부를 직렬화 트랜잭션 안에서 다시 확인한다", async (t) => {
  const f = fixture(t);
  let creates = 0;
  let transactions = 0;
  const tx = {
    student: { findMany: async () => [{ id: "a" }] },
    pointRecord: {
      findMany: async (query: { where: { student: { divisionId: string }; notes: string } }) => {
        assert.equal(query.where.student.divisionId, "police");
        assert.match(query.where.notes, /휴가정산:2026-09/);
        // Another operator completed settlement after this request's preview.
        return [{ studentId: "a" }];
      },
      createMany: async () => { creates++; },
    },
  };
  const prisma = {
    division: { findUnique: async () => ({ id: "police" }) },
    student: { findMany: async () => [student("a")] },
    leavePermission: { findMany: async () => [] },
    pointRecord: { findMany: async () => [] },
    $transaction: async <T>(run: (client: typeof tx) => Promise<T>, options: { isolationLevel: string }) => {
      transactions++;
      assert.equal(options.isolationLevel, "Serializable");
      return run(tx);
    },
  };
  const service = f.load<typeof import("../lib/services/leave.service")>("leave", {
    "@/lib/mock-data": { isMockMode: () => false },
    "@/lib/service-helpers": { getPrismaClient: async () => prisma },
  });
  assert.deepEqual(await service.settleLeaveMonth("police", actor, { month: "2026-09" }), { month: "2026-09", createdCount: 0, skippedCount: 1, totalRewardPoints: 0 });
  assert.equal(transactions, 1);
  assert.equal(creates, 0);
});


test("past leave approval and legacy cancellation use the old timetable and policy", async t => {
  const f = fixture(t, "2026-09-14T09:00:00+09:00");
  const oldDate = "2026-09-08";
  const oldPeriods = periods.filter((p: {id:string}) => p.id === "09:15");
  const leave = f.load<typeof import("../lib/services/leave.service")>("leave", {
    "@/lib/services/management-policy.service": {getManagementPolicy: async (_slug:string, date?:string) => date === oldDate ? null : basePolicy},
    "@/lib/services/period.service": {getPeriods: async (_slug:string, date?:string) => date === oldDate ? oldPeriods : periods},
  });
  const record = await leave.createLeavePermission("police",actor,{studentId:"a",date:oldDate,type:"HOLIDAY",reason:"기존 승인"});
  assert.deepEqual(f.state.attendanceByDivision.police.map(r=>r.periodId),["09:15"]);
  // Old approvals predate the exact attendance snapshot column.
  delete f.state.leavePermissionsByDivision.police.find(r=>r.id===record!.id)!.attendanceSnapshot;
  await leave.cancelLeavePermission("police",record!.id,actor);
  assert.equal(f.state.attendanceByDivision.police.length,0);
  assert.equal(f.state.leavePermissionsByDivision.police[0].status,"REJECTED");
  assert.deepEqual(f.state.attendanceByDivision.fire,[]);
});


test("academies can change half-day period counts without changing previously approved cells", async t => {
  const f = fixture(t, "2026-09-08T09:00:00+09:00");
  const policy = {...basePolicy, halfDayPeriodCount:2};
  f.state.divisionSettingsByDivision.police.halfDayLimit = 2;
  const leave = f.load<typeof import("../lib/services/leave.service")>("leave", {"@/lib/services/management-policy.service":{getManagementPolicy:async()=>policy}});
  const first = await leave.createLeavePermission("police",actor,{studentId:"a",date:"2026-09-09",type:"HALF_DAY"});
  assert.equal(f.state.attendanceByDivision.police.filter(r=>r.date==="2026-09-09").length,2);
  policy.halfDayPeriodCount=4;
  t.mock.timers.tick(1);
  await leave.createLeavePermission("police",actor,{studentId:"a",date:"2026-09-10",type:"HALF_DAY"});
  assert.equal(f.state.attendanceByDivision.police.filter(r=>r.date==="2026-09-10").length,4);
  await leave.cancelLeavePermission("police",first!.id,actor);
  assert.equal(f.state.attendanceByDivision.police.filter(r=>r.date==="2026-09-09").length,0);
  assert.equal(f.state.attendanceByDivision.police.filter(r=>r.date==="2026-09-10").length,4);
});
