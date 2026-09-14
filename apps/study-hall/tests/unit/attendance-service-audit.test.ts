import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

import * as attendanceMeta from "../../lib/attendance-meta";
import * as dateUtils from "../../lib/date-utils";
import * as policyMeta from "../../lib/management-policy";

type AttendanceService = typeof import("../../lib/services/attendance.service");

const date = "2026-09-14";
const period = {
  id: "p1",
  name: "1교시",
  label: null,
  startTime: "09:00",
  endTime: "10:00",
  isMandatory: true,
  isActive: true,
  displayOrder: 1,
};

function loadAttendanceService(state: Record<string, unknown>) {
  const source = readFileSync(
    new URL("../../lib/services/attendance.service.ts", import.meta.url),
    "utf8",
  );
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const testModule = { exports: {} };
  const settings = {
    perfectAttendancePtsEnabled: true,
    perfectAttendancePts: 3,
    tardyPointRuleId: null,
    absentPointRuleId: null,
  };
  const dependencies: Record<string, unknown> = {
    react: { cache: (fn: unknown) => fn },
    "node:crypto": { randomUUID },
    "@/lib/attendance-meta": attendanceMeta,
    "@/lib/date-utils": dateUtils,
    "@/lib/management-policy": policyMeta,
    "@/lib/mock-data": { isMockMode: () => true },
    "@/lib/mock-store": {
      readMockState: async () => state,
      updateMockState: async (mutate: (value: Record<string, unknown>) => unknown) => mutate(state),
    },
    "@/lib/errors": {
      badRequest: (message: string) => new Error(message),
      notFound: (message: string) => new Error(message),
    },
    "@/lib/revalidation": { revalidateDivisionOperationalViews() {} },
    "@/lib/server-log": {
      logServerError: (_scope: string, error: unknown) => {
        throw error;
      },
    },
    "@/lib/service-helpers": {
      getPrismaClient: () => {
        throw new Error("DB access is forbidden in this fixture");
      },
    },
    "@/lib/services/management-policy.service": { getManagementPolicy: async () => null },
    "@/lib/services/period.service": { getPeriods: async () => [period] },
    "@/lib/services/settings.service": { getDivisionSettings: async () => settings },
    "@/lib/services/student.service": {
      getDivisionStudents: async () => [
        { id: "class", seatId: "seat-class" },
        { id: "excused", seatId: "seat-excused" },
      ],
    },
  };
  new Function("require", "module", "exports", code)(
    (id: string) => dependencies[id] ?? {},
    testModule,
    testModule.exports,
  );
  return testModule.exports as AttendanceService;
}

test("legacy 일일 개근은 수업을 출석으로 인정하고 일반 사유결석은 인정하지 않는다", async () => {
  const state = {
    attendanceByDivision: {
      police: [
        {
          id: "class-p1",
          studentId: "class",
          periodId: period.id,
          date,
          status: "EXCUSED",
          reason: "수업: 형법 기본이론",
          checkInTime: null,
          recordedById: "assistant",
          createdAt: `${date}T00:00:00.000Z`,
          updatedAt: `${date}T00:00:00.000Z`,
        },
        {
          id: "excused-p1",
          studentId: "excused",
          periodId: period.id,
          date,
          status: "EXCUSED",
          reason: "병원 진료",
          checkInTime: null,
          recordedById: "assistant",
          createdAt: `${date}T00:00:00.000Z`,
          updatedAt: `${date}T00:00:00.000Z`,
        },
      ],
    },
    periodsByDivision: { police: [period] },
    divisionSettingsByDivision: {
      police: {
        perfectAttendancePtsEnabled: true,
        perfectAttendancePts: 3,
        tardyPointRuleId: null,
        absentPointRuleId: null,
      },
    },
    pointRulesByDivision: { police: [] },
    pointRecordsByDivision: { police: [] as Array<{ studentId: string; points: number }> },
  };
  const attendance = loadAttendanceService(state);

  await attendance.syncAttendanceDerivedPoints("police", date, "assistant");

  assert.deepEqual(
    state.pointRecordsByDivision.police.map((record) => [record.studentId, record.points]),
    [["class", 3]],
  );
});
