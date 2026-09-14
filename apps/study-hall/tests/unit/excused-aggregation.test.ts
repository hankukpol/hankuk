import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

import * as attendanceMeta from "../../lib/attendance-meta";
import * as dateUtils from "../../lib/date-utils";
import { DEFAULT_DIVISION_FEATURE_FLAGS } from "../../lib/division-features";
import * as policyMeta from "../../lib/management-policy";
import * as studentMeta from "../../lib/student-meta";

type AttendanceRecord = {
  id: string;
  studentId: string;
  periodId: string;
  date: string;
  status: string;
  reason: string | null;
  checkInTime: null;
};

type Period = {
  id: string;
  name: string;
  label: null;
  startTime: string;
  endTime: string;
  isMandatory: boolean;
  isActive: boolean;
  displayOrder: number;
};

const date = "2026-09-14";
const period: Period = {
  id: "p1",
  name: "1교시",
  label: null,
  startTime: "09:00",
  endTime: "10:00",
  isMandatory: true,
  isActive: true,
  displayOrder: 1,
};
const records: AttendanceRecord[] = [
  ["present", "PRESENT", null],
  ["class", "EXCUSED", "수업: 형법 기본이론"],
  ["excused", "EXCUSED", "병원 진료"],
  ["tardy", "TARDY", null],
  ["absent", "ABSENT", "무단결석"],
  ["holiday", "HOLIDAY", null],
  ["half", "HALF_HOLIDAY", null],
  ["excluded", "NOT_APPLICABLE", null],
].map(([studentId, status, reason]) => ({
  id: `${studentId}-p1`,
  studentId: studentId!,
  periodId: period.id,
  date,
  status: status!,
  reason,
  checkInTime: null,
}));

const students = records.map((record) => ({
  id: record.studentId,
  divisionId: "police",
  name: record.studentId,
  studentNumber: record.studentId,
  studyTrack: null,
  phone: null,
  seatId: `seat-${record.studentId}`,
  seatLabel: record.studentId,
  seatDisplay: record.studentId,
  studyRoomId: "room",
  studyRoomName: "자습실",
  courseStartDate: "2026-09-01",
  courseEndDate: null,
  tuitionPlanId: null,
  tuitionPlanName: null,
  tuitionAmount: null,
  tuitionExempt: false,
  tuitionExemptReason: null,
  status: "ACTIVE",
  enrolledAt: "2026-09-01T00:00:00Z",
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
  withdrawnAt: null,
  withdrawnNote: null,
  memo: null,
  netPoints: 0,
  meritPoints: 0,
  demeritPoints: 0,
  warningStage: "NORMAL",
  warningStageLabel: "정상",
}));

function loadService<T>(name: string, dependencies: Record<string, unknown>): T {
  const source = readFileSync(new URL(`../../lib/services/${name}.service.ts`, import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const testModule = { exports: {} };
  const stubs: Record<string, unknown> = {
    "next/cache": { unstable_cache: (fn: unknown) => fn },
    "@/lib/attendance-meta": attendanceMeta,
    "@/lib/date-utils": dateUtils,
    "@/lib/division-features": { DEFAULT_DIVISION_FEATURE_FLAGS },
    "@/lib/management-policy": policyMeta,
    "@/lib/student-meta": studentMeta,
    ...dependencies,
  };
  new Function("require", "module", "exports", code)(
    (id: string) => stubs[id] ?? {},
    testModule,
    testModule.exports,
  );
  return testModule.exports as T;
}

const attendanceOnlyFlags = Object.fromEntries(
  Object.keys(DEFAULT_DIVISION_FEATURE_FLAGS).map((key) => [key, key === "attendanceManagement"]),
) as typeof DEFAULT_DIVISION_FEATURE_FLAGS;

function settings(featureFlags = DEFAULT_DIVISION_FEATURE_FLAGS) {
  return {
    featureFlags,
    warnLevel1: 10,
    warnLevel2: 20,
    warnInterview: 25,
    warnWithdraw: 30,
    expirationWarningDays: 7,
  };
}

function snapshot(day: string, dayRecords: AttendanceRecord[] = []) {
  return { date: day, students, periods: [period], records: dayRecords };
}

test("admin dashboard counts class as present and removes ordinary excused from the rate denominator", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-14T12:00:00+09:00") });
  const service = loadService<{ getAdminDashboardData(slug: string, options: { forceFresh: boolean }): Promise<Record<string, unknown>> }>(
    "admin-dashboard",
    {
      "@/lib/mock-data": { isMockMode: () => true },
      "@/lib/services/settings.service": {
        getDivisionSettings: async () => settings(attendanceOnlyFlags),
        getDivisionTheme: async () => ({ slug: "police", name: "경찰", fullName: "경찰반", color: "#123456" }),
      },
      "@/lib/services/student.service": { listStudents: async () => students },
      "@/lib/services/attendance.service": {
        getAttendanceSnapshots: async (_slug: string, dates: string[]) =>
          dates.map((day) => snapshot(day, day === date ? records : [])),
      },
      "@/lib/services/attendance-pattern.service": {
        detectRepeatedTardy: async () => [],
        detectRepeatedAbsent: async () => [],
      },
    },
  );

  const result = await service.getAdminDashboardData("police", { forceFresh: true }) as {
    summary: { attendedCount: number; expectedCount: number; attendanceRate: number };
    periodRows: Array<{ attendanceRate: number; counts: Record<string, number> }>;
  };
  assert.deepEqual({
    attendedCount: result.summary.attendedCount,
    expectedCount: result.summary.expectedCount,
    attendanceRate: result.summary.attendanceRate,
  }, {
    attendedCount: 5,
    expectedCount: 6,
    attendanceRate: 83.3,
  });
  assert.equal(result.periodRows[0].counts.present, 2);
  assert.equal(result.periodRows[0].counts.excused, 1);
  assert.equal(result.periodRows[0].counts.holiday, 1);
  assert.equal(result.periodRows[0].counts.halfHoliday, 1);
  assert.equal(result.periodRows[0].attendanceRate, 83.3);
});

test("report rows preserve excused counts while excluding them from student, period and trend rates", async () => {
  const service = loadService<{ getReportData(slug: string, selection: object, options: { forceFresh: boolean }): Promise<Record<string, unknown>> }>(
    "report",
    {
      "@/lib/mock-data": { isMockMode: () => true },
      "@/lib/mock-store": { readMockState: async () => ({ attendanceByDivision: { police: records } }) },
      "@/lib/services/management-policy.service": { getManagementPolicy: async () => null },
      "@/lib/services/settings.service": {
        getDivisionFeatureSettings: async () => ({ featureFlags: attendanceOnlyFlags }),
        getDivisionTheme: async () => ({ slug: "police", name: "경찰", fullName: "경찰반", color: "#123456" }),
      },
      "@/lib/services/student.service": { listStudents: async () => students },
      "@/lib/services/period.service": { getPeriods: async () => [period] },
    },
  );

  const result = await service.getReportData("police", { period: "daily", date }, { forceFresh: true }) as {
    studentRows: Array<Record<string, unknown>>;
    dailyPeriodRows: Array<{ attendanceRate: number; counts: Record<string, number> }>;
    trend: Array<{ attendanceRate: number }>;
  };
  const classStudent = result.studentRows.find((row) => row.studentId === "class");
  const excusedStudent = result.studentRows.find((row) => row.studentId === "excused");
  assert.deepEqual(
    { presentCount: classStudent?.presentCount, excusedCount: classStudent?.excusedCount, expectedCount: classStudent?.expectedCount, attendanceRate: classStudent?.attendanceRate },
    { presentCount: 1, excusedCount: 0, expectedCount: 1, attendanceRate: 100 },
  );
  assert.deepEqual(
    { presentCount: excusedStudent?.presentCount, excusedCount: excusedStudent?.excusedCount, expectedCount: excusedStudent?.expectedCount, attendanceRate: excusedStudent?.attendanceRate },
    { presentCount: 0, excusedCount: 1, expectedCount: 0, attendanceRate: 0 },
  );
  assert.equal(result.dailyPeriodRows[0].counts.present, 2);
  assert.equal(result.dailyPeriodRows[0].counts.excused, 1);
  assert.equal(result.dailyPeriodRows[0].attendanceRate, 83.3);
  assert.equal(result.trend[0].attendanceRate, 83.3);
});

async function loadSuperAdminOverview(mockMode: boolean, capturedSelect?: Array<Record<string, boolean>>) {
  const prisma = {
    student: { findMany: async () => students.map(({ id, status, courseEndDate }) => ({ id, status, courseEndDate })) },
    period: { findMany: async () => [{ id: period.id }] },
    pointRecord: { groupBy: async () => [] },
    attendance: {
      findMany: async (query: { select: Record<string, boolean> }) => {
        capturedSelect?.push(query.select);
        return records.map(({ periodId, status, reason }) => ({ periodId, status, reason }));
      },
    },
  };
  const service = loadService<{ getSuperAdminOverview(options: { forceFresh: boolean }): Promise<Array<Record<string, unknown>>> }>(
    "super-admin-overview",
    {
      "@/lib/mock-data": { isMockMode: () => mockMode },
      "@/lib/service-helpers": { getPrismaClient: async () => prisma },
      "@/lib/services/attendance.service": { getAttendanceSnapshot: async () => snapshot(date, records) },
      "@/lib/services/management-policy.service": { getManagementPolicy: async () => null },
      "@/lib/services/settings.service": { getDivisionSettings: async () => settings() },
      "@/lib/services/student.service": { listStudents: async () => students },
      "@/lib/services/super-admin.service": {
        listManagedDivisions: async () => [{ id: "division-police", slug: "police", name: "경찰", fullName: "경찰반", color: "#123456", isActive: true }],
        listManagedAdminAssignments: async () => [],
      },
    },
  );
  return service.getSuperAdminOverview({ forceFresh: true });
}

test("super-admin mock and DB paths use reasons and return the same excluded denominator", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-14T12:00:00+09:00") });
  const capturedSelect: Array<Record<string, boolean>> = [];
  const mockResult = await loadSuperAdminOverview(true);
  const dbResult = await loadSuperAdminOverview(false, capturedSelect);
  const pick = (rows: Array<Record<string, unknown>>) => ({
    attendedCount: rows[0]?.attendedCount,
    expectedCount: rows[0]?.expectedCount,
    attendanceRate: rows[0]?.attendanceRate,
  });
  assert.deepEqual(pick(mockResult), { attendedCount: 5, expectedCount: 6, attendanceRate: 83.3 });
  assert.deepEqual(pick(dbResult), pick(mockResult));
  assert.deepEqual(capturedSelect, [{ periodId: true, status: true, reason: true }]);
});
