import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

import * as dateUtils from "../lib/date-utils";
import * as errors from "../lib/errors";
import * as pointAggregationMode from "../lib/point-aggregation-mode";
import type {
  MockInterviewRecord,
  MockWarningNoticeRecord,
} from "../lib/mock-store";

type InterviewService = typeof import("../lib/services/interview.service");
type WarningNoticeService = typeof import("../lib/services/warning-notice.service");
type SettingsHistoryService = typeof import("../lib/services/settings-history.service");

const today = "2026-09-08";
const actor = { id: "admin-1", role: "ADMIN" as const, name: "김관리" };

// 실제 서비스 코드를 스텁 의존성 위에서 그대로 돌린다. 영속 목 스토어나
// DB 클라이언트가 끼어들 수 없도록 require 를 화이트리스트로 막는다.
function loadService<T>(name: string, dependencies: Record<string, unknown>): T {
  const source = readFileSync(new URL(`../lib/services/${name}.service.ts`, import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const testModule = { exports: {} };
  new Function("require", "module", "exports", code)(
    (id: string) => {
      assert.ok(id in dependencies, `Unisolated service dependency: ${id}`);
      return dependencies[id];
    },
    testModule,
    testModule.exports,
  );
  return testModule.exports as T;
}

function interview(overrides: Partial<MockInterviewRecord> = {}): MockInterviewRecord {
  return {
    id: "interview-1",
    studentId: "student-1",
    date: "2026-09-01",
    trigger: null,
    reason: "벌점 누적",
    content: null,
    result: null,
    resultType: "INTERVIEW",
    followUpDate: null,
    status: "OPEN",
    guardianContacted: false,
    closedAt: null,
    closedById: null,
    createdById: actor.id,
    createdAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

function interviewFixture(interviews: MockInterviewRecord[]) {
  const state = {
    divisions: [{ id: "division-police", slug: "police" }],
    studentsByDivision: {
      police: [
        { id: "student-1", name: "홍길동", studentNumber: "P-001" },
        { id: "student-2", name: "김철수", studentNumber: "P-002" },
      ],
    },
    interviewsByDivision: { police: interviews },
  };

  const service = loadService<InterviewService>("interview", {
    react: { cache: <T,>(fn: T) => fn },
    "@/lib/mock-data": {
      isMockMode: () => true,
      getMockAdminSession: () => ({ name: actor.name }),
      getMockDivisionBySlug: () => state.divisions[0],
    },
    "@/lib/revalidation": { revalidateDivisionOperationalViews: () => {} },
    "@/lib/date-utils": dateUtils,
    "@/lib/management-policy": { kstDate: () => today },
    "@/lib/mock-store": {
      readMockState: async () => state,
      updateMockState: async (fn: (draft: typeof state) => unknown) => fn(state),
    },
    "@/lib/service-helpers": {
      getPrismaClient: async () => {
        throw new Error("mock mode should not reach the database");
      },
    },
  });

  return { service, state };
}

test("follow-up listing returns only open interviews that are already due, oldest first", async () => {
  const { service } = interviewFixture([
    interview({ id: "due-late", followUpDate: "2026-09-07" }),
    interview({ id: "due-early", followUpDate: "2026-09-02" }),
    interview({ id: "due-today", followUpDate: today }),
    interview({ id: "not-yet", followUpDate: "2026-09-20" }),
    interview({ id: "closed", followUpDate: "2026-09-02", status: "CLOSED" }),
    interview({ id: "no-date" }),
  ]);

  const followUps = await service.listInterviews("police", { followUpDue: true });

  assert.deepEqual(
    followUps.map((item) => item.id),
    ["due-early", "due-late", "due-today"],
  );
  assert.equal(await service.countFollowUpDueInterviews("police"), 3);
});

test("follow-up listing ignores the month filter so overdue items are not lost", async () => {
  const { service } = interviewFixture([
    interview({ id: "old", date: "2026-07-10", followUpDate: "2026-07-20" }),
  ]);

  // 7월 면담은 9월 조회에서는 보이지 않지만 후속 확인에서는 계속 남아야 한다.
  assert.equal((await service.listInterviews("police", { month: "2026-09" })).length, 0);
  assert.equal((await service.listInterviews("police", { followUpDue: true })).length, 1);
});

test("closing an interview stamps who closed it and clears it from the follow-up list", async () => {
  const { service, state } = interviewFixture([
    interview({ id: "open-1", followUpDate: "2026-09-02" }),
  ]);

  const updated = await service.updateInterview("police", "open-1", actor, { status: "CLOSED" });

  assert.equal(updated.status, "CLOSED");
  assert.ok(updated.closedAt);
  assert.equal(state.interviewsByDivision.police[0].closedById, actor.id);
  assert.equal((await service.listInterviews("police", { followUpDue: true })).length, 0);
});

test("reopening an interview drops the closed stamp", async () => {
  const { service, state } = interviewFixture([
    interview({
      id: "closed-1",
      status: "CLOSED",
      closedAt: "2026-09-02T00:00:00.000Z",
      closedById: actor.id,
      followUpDate: "2026-09-02",
    }),
  ]);

  const updated = await service.updateInterview("police", "closed-1", actor, { status: "OPEN" });

  assert.equal(updated.status, "OPEN");
  assert.equal(updated.closedAt, null);
  assert.equal(state.interviewsByDivision.police[0].closedById, null);
  assert.equal((await service.listInterviews("police", { followUpDue: true })).length, 1);
});

test("a created interview without a follow-up date is stored, and an unknown id is rejected", async () => {
  const { service } = interviewFixture([]);

  const created = await service.createInterview("police", actor, {
    studentId: "student-1",
    date: today,
    reason: "벌점 누적",
    resultType: "INTERVIEW",
    followUpDate: null,
    guardianContacted: true,
    status: "CLOSED",
  });

  assert.equal(created?.status, "CLOSED");
  assert.equal(created?.guardianContacted, true);
  assert.equal(created?.followUpDate, null);

  await assert.rejects(
    () => service.updateInterview("police", "missing", actor, { status: "CLOSED" }),
    /면담 기록을 찾을 수 없습니다/,
  );
});

const thresholds = {
  warnLevel1: 10,
  warnLevel2: 20,
  warnInterview: 25,
  warnWithdraw: 30,
};

function warningNoticeFixture(notices: MockWarningNoticeRecord[] = []) {
  const state = {
    divisions: [{ id: "division-police", slug: "police" }],
    warningNoticesByDivision: { police: notices },
  };

  const service = loadService<WarningNoticeService>("warning-notice", {
    "@/lib/mock-data": { isMockMode: () => true },
    "@/lib/management-policy": { kstDate: () => today },
    "@/lib/point-aggregation-mode": pointAggregationMode,
    "@/lib/mock-store": {
      readMockState: async () => state,
      updateMockState: async (fn: (draft: typeof state) => unknown) => fn(state),
    },
    "@/lib/services/management-policy.service": { getManagementPolicy: async () => null },
    "@/lib/services/settings.service": { getDivisionSettings: async () => thresholds },
    "@/lib/services/point.service": {
      listWarningStudents: async () => [
        { id: "student-1", netPoints: 26, warningStage: "INTERVIEW" },
      ],
    },
    "@/lib/service-helpers": {
      getPrismaClient: async () => {
        throw new Error("mock mode should not reach the database");
      },
      getDivisionBySlugOrThrow: async () => state.divisions[0],
    },
    "@/lib/revalidation": { revalidateDivisionOperationalViews: () => {} },
    "@/lib/errors": errors,
  });

  return { service, state };
}

test("a warning notice freezes the score, thresholds and aggregation mode of the moment", async () => {
  const { service } = warningNoticeFixture();

  const notice = await service.createWarningNotice("police", actor, {
    studentId: "student-1",
    stage: "INTERVIEW",
    channel: "SMS",
    noticeBody: "면담 대상 안내",
    memo: null,
  });

  assert.equal(notice.demeritPoints, 26);
  assert.deepEqual(notice.thresholdSnapshot, thresholds);
  // 관리규정이 없으면 과정 시작일 누적 모드다.
  assert.equal(notice.aggregationMode, "COURSE");
  assert.equal(notice.noticedByName, actor.name);
});

test("a warning notice is refused for a student who is not a warning target", async () => {
  const { service } = warningNoticeFixture();

  await assert.rejects(
    () =>
      service.createWarningNotice("police", actor, {
        studentId: "student-9",
        stage: "WARNING_1",
        channel: "SMS",
      }),
    /경고 대상자 목록에서 학생을 찾을 수 없습니다/,
  );
});

test("the latest notice index keeps one row per student and stage", async () => {
  const { service } = warningNoticeFixture();

  const notices = [
    {
      id: "new",
      studentId: "student-1",
      stage: "WARNING_1" as const,
      noticedAt: "2026-09-05T00:00:00.000Z",
    },
    {
      id: "old",
      studentId: "student-1",
      stage: "WARNING_1" as const,
      noticedAt: "2026-09-01T00:00:00.000Z",
    },
    {
      id: "other-stage",
      studentId: "student-1",
      stage: "WARNING_2" as const,
      noticedAt: "2026-09-02T00:00:00.000Z",
    },
  ] as Parameters<typeof service.indexLatestNoticeByStudentStage>[0];

  const index = service.indexLatestNoticeByStudentStage(notices);

  assert.equal(index.size, 2);
  assert.equal(index.get("student-1:WARNING_1")?.id, "new");
  assert.equal(index.get("student-1:WARNING_2")?.id, "other-stage");
});

function settingsHistoryFixture() {
  const state = {
    divisions: [{ id: "division-police", slug: "police" }],
    divisionSettingsHistoryByDivision: { police: [] as unknown[] },
  };

  const service = loadService<SettingsHistoryService>("settings-history", {
    "@prisma/client": {},
    "@/lib/mock-data": { isMockMode: () => true },
    "@/lib/mock-store": {
      readMockState: async () => state,
      updateMockState: async (fn: (draft: typeof state) => unknown) => fn(state),
    },
    "@/lib/service-helpers": {
      getPrismaClient: async () => {
        throw new Error("mock mode should not reach the database");
      },
      getDivisionBySlugOrThrow: async () => state.divisions[0],
    },
  });

  return { service, state };
}

const baseRuleSettings = {
  ...thresholds,
  warnMsgLevel1: "1차",
  warnMsgLevel2: "2차",
  warnMsgInterview: "면담",
  warnMsgWithdraw: "퇴원",
  tardyMinutes: 20,
  assistantPastEditAllowed: false,
  assistantPastEditDays: 0,
  holidayLimit: 1,
  halfDayLimit: 2,
  healthLimit: 1,
  holidayUnusedPts: 5,
  halfDayUnusedPts: 2,
  tardyPointRuleId: null,
  absentPointRuleId: null,
  perfectAttendancePtsEnabled: false,
  perfectAttendancePts: 0,
  expirationWarningDays: 14,
  updatedAt: "2026-09-01T00:00:00.000Z",
} as Parameters<SettingsHistoryService["diffRuleSettings"]>[0];

test("the rule diff reports only changed fields with human-readable labels", () => {
  const { service } = settingsHistoryFixture();

  const changes = service.diffRuleSettings(baseRuleSettings, {
    ...baseRuleSettings,
    tardyMinutes: 30,
    warnLevel1: 12,
  });

  assert.deepEqual(changes, [
    { field: "tardyMinutes", label: "지각 기준(분)", before: 20, after: 30 },
    { field: "warnLevel1", label: "1차 경고 기준", before: 10, after: 12 },
  ]);

  assert.deepEqual(service.diffRuleSettings(baseRuleSettings, baseRuleSettings), []);
  // updatedAt 은 사람이 바꾼 값이 아니므로 이력에 남기지 않는다.
  assert.deepEqual(
    service.diffRuleSettings(baseRuleSettings, { ...baseRuleSettings, updatedAt: "2026-09-09" }),
    [],
  );
  // 빈 문자열과 null 은 모두 "값 없음"이라 변경으로 보지 않는다.
  assert.deepEqual(
    service.diffRuleSettings(baseRuleSettings, { ...baseRuleSettings, tardyPointRuleId: "" }),
    [],
  );
});

test("recording a settings change stores the actor and skips empty diffs", async () => {
  const { service, state } = settingsHistoryFixture();

  await service.recordDivisionSettingsChange("police", actor, []);
  assert.equal(state.divisionSettingsHistoryByDivision.police.length, 0);

  await service.recordDivisionSettingsChange("police", actor, [
    { field: "tardyMinutes", label: "지각 기준(분)", before: 20, after: 30 },
  ]);

  const history = await service.listDivisionSettingsHistory("police");
  assert.equal(history.length, 1);
  assert.equal(history[0].changedByName, actor.name);
  assert.equal(history[0].section, "RULES");
  assert.equal(history[0].changes[0].after, 30);
});
