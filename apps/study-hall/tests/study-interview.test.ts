import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

import * as dateUtils from "../lib/date-utils";
import { DEFAULT_EXAM_ANALYSIS_SETTINGS, examAnalysisSettingsSchema, normalizeExamAnalysisSettings, type ExamAnalysisSettings } from "../lib/exam-analysis-settings";
import type { PreviewData } from "../lib/exam-preview/types";
import { journalPromises, latestPromiseInterview } from "../lib/interview-journal";
import { interviewSchema } from "../lib/interview-schemas";
import type { MockInterviewRecord, MockInterviewTaskRecord } from "../lib/mock-store";
import { buildStudyDiagnosis, classifyWrongItems, taskScoreChange } from "../lib/study-diagnosis";

type InterviewService = typeof import("../lib/services/interview.service");

// ── 픽스처 ────────────────────────────────────────────────────────────────

const settings = (patch: Partial<{ maxTasks: number; minWrongItems: number; classGapPercent: number }> = {}): ExamAnalysisSettings => {
  const base = structuredClone(DEFAULT_EXAM_ANALYSIS_SETTINGS) as ExamAnalysisSettings;
  base.diagnosis = { maxTasks: patch.maxTasks ?? 3, minWrongItems: patch.minWrongItems ?? 2 };
  if (patch.classGapPercent !== undefined) base.morning.classGapPercent = patch.classGapPercent;
  return base;
};

const comparison = (date: string, subjectId: string, subjectName: string, my: number | null, external: number) => ({
  sessionId: `${date}-${subjectId}`, date, subjectId, subjectName, topic: `${subjectName} 범위`, fullScore: 100, my, internal: 60, external,
  top10: null, top30: null, internalCount: 20, externalCount: 200, externalFileCount: 200, internalRank: 3, externalRank: 30,
});

const item = (date: string, subjectId: string, itemNo: number, externalRate: number, answer: string | null) => ({
  id: `${date}-${subjectId}-${itemNo}`, sessionId: `${date}-${subjectId}`, date, subjectId, subjectName: subjectId, itemNo, answerKey: "2", answer,
  correct: false, points: 5, externalRate, internalRate: null, responseCount: 0, choices: {}, mostCommonWrong: null,
});

function morningData(): PreviewData {
  return {
    kind: "morning", scope: "student", examType: { id: "morning-type", name: "아침 모의고사" }, student: { id: "s1", name: "학생", studentNumber: "1" },
    range: { from: "2026-09-01", to: "2026-09-30" }, dates: [], easyThreshold: 70, failCutoffPercent: 40, records: [],
    subjects: [{ id: "law", name: "형법" }, { id: "con", name: "헌법" }, { id: "pol", name: "경찰학" }],
    comparisons: [
      comparison("2026-09-08", "law", "형법", 35, 70), // 과락 + 크게 낮음
      comparison("2026-09-09", "con", "헌법", 60, 70),
      comparison("2026-09-10", "pol", "경찰학", 90, 70),
      comparison("2026-09-15", "law", "형법", 55, 65),
    ],
    items: [
      // 형법 9/8: 어려운 문제 3개(정답률 30), 쉬운 문제 1개 → 원인은 HARD 였다가 과락이라 CONCEPT
      item("2026-09-08", "law", 1, 30, "1"), item("2026-09-08", "law", 2, 30, "3"), item("2026-09-08", "law", 3, 30, "4"), item("2026-09-08", "law", 4, 90, "1"),
      // 헌법 9/9: 쉬운 문제 오답 2개, 빈 답 1개 → MISTAKE
      item("2026-09-09", "con", 5, 85, "1"), item("2026-09-09", "con", 6, 80, "3"), item("2026-09-09", "con", 7, 50, null),
      // 경찰학: 오답 1개뿐 → 참고
      item("2026-09-10", "pol", 8, 60, "4"),
      // 형법 9/15
      item("2026-09-15", "law", 9, 50, "4"), item("2026-09-15", "law", 10, 50, null),
    ],
    morning: { settings: { morning: { movingAverageSessions: 1, classGapPercent: 15 } }, subjects: [] },
  } as unknown as PreviewData;
}

// ── 진단 규칙 ─────────────────────────────────────────────────────────────

test("틀린 문항을 원인별로 나눈다: 빈 답 = 시간 부족, 쉬운 문제 = 실수, 정답률 낮은 문제 = 어려운 문제, 그 밖 = 개념", () => {
  const { groups } = classifyWrongItems([item("d", "x", 1, 90, "1"), item("d", "x", 2, 30, "1"), item("d", "x", 3, 55, "1"), item("d", "x", 4, 90, null)], settings());
  assert.deepEqual(groups.MISTAKE.map((i) => i.itemNo), [1]);
  assert.deepEqual(groups.HARD.map((i) => i.itemNo), [2]);
  assert.deepEqual(groups.CONCEPT.map((i) => i.itemNo), [3]);
  assert.deepEqual(groups.TIME.map((i) => i.itemNo), [4]);
});

test("학습 진단: 공부할 것 탭과 같은 순서로, 과목이 겹치지 않게 먼저 고르고, 원인·참고를 학원 설정으로 정한다", () => {
  const diagnosis = buildStudyDiagnosis({ morning: morningData(), regular: null, settings: settings(), attendance: { absentCount: 0, tardyCount: 2 } });
  assert.deepEqual(diagnosis.priorities.map((p) => `${p.subjectName}:${p.date}`), ["형법:2026-09-08", "헌법:2026-09-09", "경찰학:2026-09-10"], "과목마다 하나씩, 전체 평균보다 많이 낮은 시험부터");
  const [law, con, pol] = diagnosis.priorities;
  assert.equal(law.cause, "CONCEPT", "과락인데 어려운 문제 탓으로 보이면 개념 부족으로 본다");
  assert.equal(law.belowFailCutoff, true);
  assert.equal(law.baselineMy, 35);
  assert.equal(con.cause, "MISTAKE");
  assert.deepEqual(con.easyItemNos, [5, 6]);
  assert.equal(pol.reference, true, "오답이 학원 기준보다 적으면 참고");
  assert.equal(diagnosis.headline.tone, "danger");
  assert.match(diagnosis.headline.text, /^형법이 가장 먼저예요\./);
  assert.ok(diagnosis.questions.some((q) => q.cause === "CONCEPT"));
  assert.ok(diagnosis.questions.some((q) => q.cause === "ATTENDANCE" && q.text.includes("지각 2번")));
  assert.ok(diagnosis.strengths.some((s) => s.startsWith("경찰학은")), "전체 평균보다 크게 높은 과목은 잘한 점");
  assert.equal(diagnosis.settingsUsed.maxTasks, 3);
});

test("학원 설정이 다르면 진단도 달라진다(제안 개수·최소 오답 수)", () => {
  const strict = buildStudyDiagnosis({ morning: morningData(), regular: null, settings: settings({ maxTasks: 1, minWrongItems: 5 }) });
  assert.equal(strict.priorities.length, 1);
  assert.equal(strict.priorities[0].reference, true, "오답 4개 < 기준 5개 → 참고");
  const roomy = buildStudyDiagnosis({ morning: morningData(), regular: null, settings: settings({ maxTasks: 6, minWrongItems: 1 }) });
  assert.equal(roomy.priorities.length, 4, "과목을 다 고른 뒤 같은 과목의 다음 시험으로 채운다");
  assert.equal(roomy.priorities[3].date, "2026-09-15");
  assert.ok(roomy.priorities.every((p) => !p.reference));
});

test("시험이 없으면 진단할 것이 없다고 말하고, 지난 할 일 결과를 잘한 점·질문에 넣는다", () => {
  const empty = buildStudyDiagnosis({ morning: null, regular: null, settings: settings() });
  assert.equal(empty.priorities.length, 0);
  assert.equal(empty.headline.tone, "info");
  const withPrevious = buildStudyDiagnosis({ morning: morningData(), regular: null, settings: settings(), previousTasks: [{ subjectName: "헌법", status: "DONE" }, { subjectName: "형법", status: "NOT_DONE" }] });
  assert.ok(withPrevious.strengths.includes("지난번 할 일 1개를 해냈어요."));
  assert.ok(withPrevious.questions.some((q) => q.cause === "PREVIOUS" && q.text.includes("형법")));
});

test("할 일 뒤 점수 변화: 면담 다음 날부터 같은 과목 시험의 100점 기준 평균을 기준 점수와 비교한다", () => {
  const exams = { morning: morningData(), regular: null };
  assert.deepEqual(taskScoreChange({ subjectId: "law", examCategory: "MORNING", interviewDate: "2026-09-10", baselineMy: 35 }, exams), { after: 55, change: 20, count: 1 });
  assert.deepEqual(taskScoreChange({ subjectId: "law", examCategory: "MORNING", interviewDate: "2026-09-20", baselineMy: 35 }, exams), { after: null, change: null, count: 0 });
  assert.deepEqual(taskScoreChange({ subjectId: null, examCategory: null, interviewDate: "2026-09-01", baselineMy: null }, exams), { after: null, change: null, count: 0 });
});

// ── 설정·입력 ─────────────────────────────────────────────────────────────

test("진단 설정은 예전에 저장한 설정에 없어도 기본값으로 채워진다", () => {
  const legacy = { morning: DEFAULT_EXAM_ANALYSIS_SETTINGS.morning, regular: DEFAULT_EXAM_ANALYSIS_SETTINGS.regular, common: DEFAULT_EXAM_ANALYSIS_SETTINGS.common };
  assert.deepEqual(examAnalysisSettingsSchema.parse(legacy).diagnosis, { maxTasks: 3, minWrongItems: 3 });
  assert.deepEqual(normalizeExamAnalysisSettings(legacy).diagnosis, { maxTasks: 3, minWrongItems: 3 });
  assert.deepEqual(normalizeExamAnalysisSettings({ ...legacy, diagnosis: { maxTasks: 5, minWrongItems: 99 } }).diagnosis, { maxTasks: 5, minWrongItems: 3 }, "범위를 벗어난 값만 기본값으로");
  assert.equal(examAnalysisSettingsSchema.safeParse({ ...legacy, diagnosis: { maxTasks: 0, minWrongItems: 3 } }).success, false);
});

test("할 일·진단은 학습 면담에서만 받는다", () => {
  const base = { studentId: "s1", date: "2026-10-07", reason: "성적 확인", resultType: "INTERVIEW" };
  const task = { subjectName: "형법", cause: "CONCEPT", title: "형법 다시 풀기" };
  assert.equal(interviewSchema.safeParse({ ...base, tasks: [task] }).success, false, "일반 면담에 할 일을 보내면 거부");
  const study = interviewSchema.parse({ ...base, category: "STUDY", tasks: [task], reviews: [{ taskId: "t1", status: "DONE" }] });
  assert.equal(study.tasks[0].visibleToStudent, true);
  assert.deepEqual(study.tasks[0].itemNos, []);
  assert.equal(interviewSchema.parse(base).category, "GENERAL", "예전 요청은 일반 면담");
});

test("약속 목록: 학습 면담 할 일이 있으면 할 일과 확인 결과를, 없으면 글자 약속을 쓴다", () => {
  assert.deepEqual(journalPromises({ result: "· 23시 취침\n- 아침 8시 입실", tasks: [] }), ["23시 취침", "아침 8시 입실"]);
  assert.deepEqual(journalPromises({ result: "글자 약속", tasks: [
    { subjectName: "형법", title: "형법 9/8 시험 틀린 문제 다시 풀기", status: "DONE" },
    { subjectName: "헌법", title: "기출 2회 풀기", status: "PLANNED" },
    { subjectName: "경찰학", title: "취소한 일", status: "CANCELLED" },
  ] }), ["형법 9/8 시험 틀린 문제 다시 풀기 (했음)", "헌법 · 기출 2회 풀기"]);
  const sorted = [
    { date: "2026-10-07", createdAt: "b", studentId: "s", status: "OPEN", followUpDate: null, result: null, tasks: [{ subjectName: "형법", title: "t", status: "PLANNED" }] },
    { date: "2026-10-01", createdAt: "a", studentId: "s", status: "OPEN", followUpDate: null, result: "옛 약속", tasks: [] },
  ];
  assert.equal(latestPromiseInterview(sorted)?.date, "2026-10-07", "할 일만 있는 학습 면담도 약속이 있는 면담이다");
});

// ── 서비스(목업 저장소) ───────────────────────────────────────────────────

const actor = { id: "admin-1", role: "ADMIN" as const, name: "김관리" };

function loadService<T>(name: string, dependencies: Record<string, unknown>): T {
  const source = readFileSync(new URL(`../lib/services/${name}.service.ts`, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
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

function fixture(interviews: MockInterviewRecord[] = [], tasks: MockInterviewTaskRecord[] = []) {
  const state = {
    divisions: [{ id: "division-police", slug: "police" }],
    studentsByDivision: { police: [{ id: "s1", name: "홍길동", studentNumber: "P-001" }, { id: "s2", name: "김철수", studentNumber: "P-002" }] },
    interviewsByDivision: { police: interviews },
    interviewTasksByDivision: { police: tasks },
  };
  const service = loadService<InterviewService>("interview", {
    react: { cache: <T,>(fn: T) => fn },
    "@/lib/mock-data": { isMockMode: () => true, getMockAdminSession: () => ({ name: actor.name }), getMockDivisionBySlug: () => state.divisions[0] },
    "@/lib/revalidation": { revalidateDivisionOperationalViews: () => {} },
    "@/lib/date-utils": dateUtils,
    "@/lib/management-policy": { kstDate: () => "2026-10-07" },
    "@/lib/mock-store": { readMockState: async () => state, updateMockState: async (fn: (draft: typeof state) => unknown) => fn(state) },
    "@/lib/service-helpers": {
      getPrismaClient: async () => { throw new Error("mock mode should not reach the database"); },
      isPrismaSchemaMismatchError: () => false,
    },
  });
  return { service, state };
}

const studyContext = () => {
  const diagnosis = buildStudyDiagnosis({ morning: morningData(), regular: null, settings: settings() });
  return { diagnosis, allowedSubjectIds: new Set(["law", "con", "pol"]), allowedSessionIds: new Set(["2026-09-08-law", "2026-09-09-con"]) };
};

const studyInput = {
  studentId: "s1", date: "2026-10-07", reason: "성적 확인", resultType: "WARNING_1" as const, guardianContacted: false, status: "OPEN" as const,
  category: "STUDY" as const,
  tasks: [
    { examCategory: "MORNING" as const, examTypeId: "morning-type", subjectId: "law", sessionId: "2026-09-08-law", subjectName: "형법", examDate: "2026-09-08", itemNos: [3, 1, 3], cause: "CONCEPT" as const, title: "형법 다시 풀기", method: "교재 다시 읽기", dueDate: "2026-10-14", visibleToStudent: true },
    { subjectName: "생활", cause: "OTHER" as const, title: "23시 취침", itemNos: [], visibleToStudent: false },
  ],
  reviews: [],
};

test("학습 면담 저장: 할 일과 진단을 함께 남기고, 기준 점수는 서버 진단에서 채운다", async () => {
  const { service, state } = fixture();
  const saved = await service.createInterview("police", actor, studyInput, studyContext());
  assert.ok(saved);
  assert.equal(saved.category, "STUDY");
  assert.equal(saved.resultType, "INTERVIEW", "학습 면담은 경고 단계와 상관이 없다");
  assert.ok(saved.diagnosis?.headline.text);
  assert.deepEqual(saved.tasks.map((t) => [t.title, t.position, t.status]), [["형법 다시 풀기", 0, "PLANNED"], ["23시 취침", 1, "PLANNED"]]);
  assert.deepEqual(saved.tasks[0].itemNos, [1, 3], "문항 번호는 중복 없이 정렬");
  assert.equal(saved.tasks[0].baselineMy, 35, "기준 점수는 진단의 같은 시험에서");
  assert.equal(saved.tasks[1].baselineMy, null);
  assert.equal(state.interviewTasksByDivision.police.length, 2);
});

test("다른 학원 과목·학생이 보지 않은 시험은 할 일로 저장하지 않는다", async () => {
  const { service } = fixture();
  await assert.rejects(service.createInterview("police", actor, { ...studyInput, tasks: [{ ...studyInput.tasks[0], subjectId: "fire-subject" }] }, studyContext()), /이 학원의 시험 과목이 아닙니다/);
  await assert.rejects(service.createInterview("police", actor, { ...studyInput, tasks: [{ ...studyInput.tasks[0], sessionId: "other-session" }] }, studyContext()), /이 학생이 본 시험이 아닙니다/);
  await assert.rejects(service.createInterview("police", actor, studyInput), /학습 면담 진단을 계산하지 못했습니다/, "진단 없이 학습 면담을 저장하지 않는다");
});

test("지난 할 일 확인은 같은 학생의 할 일만 바꾸고, 학생 화면에는 공개한 확인 전 할 일만 좁은 모양으로 내려간다", async () => {
  const { service, state } = fixture();
  const first = await service.createInterview("police", actor, studyInput, studyContext());
  const [lawTask] = first!.tasks;

  // 다른 학생(s2)의 면담에서 s1 의 할 일을 확인하려 하면 거부
  await assert.rejects(service.createInterview("police", actor, { ...studyInput, studentId: "s2", tasks: [], reviews: [{ taskId: lawTask.id, status: "DONE" }] }, studyContext()), /지난 할 일을 찾을 수 없습니다/);

  const visibleBefore = await service.listStudentVisibleTasks("police", "s1");
  assert.deepEqual(visibleBefore.map((t) => t.title), ["형법 다시 풀기"], "공개하지 않은 할 일은 학생에게 안 보인다");
  assert.deepEqual(Object.keys(visibleBefore[0]).sort(), ["dueDate", "examCategory", "examDate", "id", "interviewDate", "itemNos", "method", "scope", "subjectName", "title"].sort(), "면담 내용·원인·진단은 내려가지 않는다");

  await new Promise((resolve) => setTimeout(resolve, 2));
  const second = await service.createInterview("police", actor, { ...studyInput, date: "2026-10-14", tasks: [], reviews: [{ taskId: lawTask.id, status: "DONE", note: "다 풀었음" }] }, studyContext());
  const reviewed = state.interviewTasksByDivision.police.find((t) => t.id === lawTask.id)!;
  assert.equal(reviewed.status, "DONE");
  assert.equal(reviewed.reviewNote, "다 풀었음");
  assert.equal(reviewed.reviewedInInterviewId, second!.id);
  assert.deepEqual(await service.listStudentVisibleTasks("police", "s1"), [], "확인한 할 일은 학생 화면에서 내려간다");
});

test("예전 면담 기록은 일반 면담으로 읽히고 할 일이 없다", async () => {
  const legacy = {
    id: "old", studentId: "s1", date: "2026-09-01", trigger: null, reason: "벌점", content: null, result: "약속", resultType: "INTERVIEW",
    followUpDate: null, status: "CLOSED", guardianContacted: false, closedAt: null, closedById: null, createdById: actor.id, createdAt: "2026-09-01T00:00:00.000Z",
  } as MockInterviewRecord;
  const { service } = fixture([legacy]);
  const [item] = await service.listInterviews("police");
  assert.equal(item.category, "GENERAL");
  assert.equal(item.diagnosis, null);
  assert.deepEqual(item.tasks, []);
  // 학습 면담 칸이 없는 예전 목업 파일에서도 일반 면담 저장이 된다.
  const { service: bare, state } = fixture();
  delete (state as Partial<typeof state>).interviewTasksByDivision;
  const created = await bare.createInterview("police", actor, { studentId: "s1", date: "2026-10-07", reason: "생활", resultType: "INTERVIEW", guardianContacted: false, status: "CLOSED" });
  assert.equal(created?.category, "GENERAL");
});

test("할 일 하나의 상태·공개 여부는 따로 바꿀 수 있다", async () => {
  const { service } = fixture();
  const saved = await service.createInterview("police", actor, studyInput, studyContext());
  const updated = await service.updateInterviewTask("police", saved!.tasks[0].id, actor, { status: "PARTIAL", visibleToStudent: false });
  assert.equal(updated.status, "PARTIAL");
  assert.equal(updated.visibleToStudent, false);
  await assert.rejects(service.updateInterviewTask("police", "missing", actor, { status: "DONE" }), /할 일을 찾을 수 없습니다/);
});

test("학습 면담·성적 요약·권장 신호 API 는 관리자만 쓴다(학생·조교 거부)", () => {
  for (const route of [
    "app/api/[division]/interviews/study-context/route.ts",
    "app/api/[division]/interviews/score-signals/route.ts",
    "app/api/[division]/interviews/tasks/[taskId]/route.ts",
    "app/api/[division]/interviews/route.ts",
  ]) {
    const source = readFileSync(new URL(`../${route}`, import.meta.url), "utf8");
    const guards = Array.from(source.matchAll(/requireApiAuth\(params\.division, (\[[^\]]*\])\)/g)).map((m) => m[1]);
    assert.ok(guards.length > 0, `${route}: 권한 확인이 있어야 한다`);
    for (const roles of guards) assert.equal(roles, '["ADMIN", "SUPER_ADMIN"]', `${route}: 관리자만`);
    assert.match(source, /getDivisionFeatureDisabledError\(\s*params\.division,\s*"interviewManagement"/, `${route}: 면담 기능이 꺼진 학원은 막는다`);
  }
});
