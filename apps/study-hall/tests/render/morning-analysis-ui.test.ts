import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as rangeSchema from "../../lib/morning-exam-analysis-schemas";
import { DEFAULT_EXAM_ANALYSIS_SETTINGS } from "../../lib/exam-analysis-settings";
import type { MorningStudentReport, MorningCohortAnalysis } from "../../lib/morning-exam-analysis-types";

const root = path.resolve(__dirname, "../..");
// Actual UI markup with geometry and unrelated portal services stubbed.
// This is behavioural render coverage, not browser layout evidence.
/**
 * exam-analysis-ui.test.ts 와 같은 이유로 모듈을 재사용한다.
 * 캐시가 없으면 같은 모듈이 경로 수만큼 새 VM 컨텍스트에서 다시 실행되고,
 * 단언이 실패했을 때 스택 심볼화 비용이 폭증해 메시지 없이 매달린다.
 */
type LoadCache = { done: Map<string, Record<string, any>>; loading: Map<string, Record<string, any>> }; // eslint-disable-line @typescript-eslint/no-explicit-any

function load(file: string, overrides: Record<string, unknown> = {}, globals: Record<string, unknown> = {}, cache: LoadCache = { done: new Map(), loading: new Map() }): Record<string, any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const filename = path.resolve(root, file);

  const cached = cache.done.get(filename);
  if (cached) return cached;

  // 순환 import 는 채워지는 중인 exports 를 돌려준다(CommonJS 와 같다).
  const partial = cache.loading.get(filename);
  if (partial) return partial;

  const loaded = { exports: {} };
  cache.loading.set(filename, loaded.exports);
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), { fileName: filename, reportDiagnostics: true, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } });
  assert.equal(compiled.diagnostics?.length ?? 0, 0, JSON.stringify(compiled.diagnostics?.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, " "))));
  vm.runInNewContext(compiled.outputText, {
    module: loaded, exports: loaded.exports, URLSearchParams, AbortController, ...globals,
    require(name: string) {
      if (name in overrides) return overrides[name];
      if (name === "@/lib/morning-exam-analysis-schemas") return rangeSchema;
      if (name === "react") return React;
      // 아이콘은 화면 검증 대상이 아니다. 개별 override 가 없으면 빈 요소로 대체한다.
      if (name === "lucide-react") return new Proxy({}, { get: () => () => null });
      if (name === "react/jsx-runtime") return jsx;
      if (name === "recharts") return new Proxy({}, { get: () => ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children) });
      const local = name.startsWith("@/") ? name.slice(2) : path.relative(root, path.resolve(path.dirname(filename), name));
      return load(fs.existsSync(path.resolve(root, `${local}.tsx`)) ? `${local}.tsx` : `${local}.ts`, overrides, globals, cache);
    },
  });
  cache.loading.delete(filename);
  cache.done.set(filename, loaded.exports);
  return loaded.exports;
}

test("trend chart keeps zero scores and missing values distinct, sorts dates and provides a mobile table", () => {
  const Component = load("components/exams/analysis/charts/TrendLines.tsx").TrendLines;
  const html = renderToStaticMarkup(React.createElement(Component, { label: "과목 A 추이", columns: [{ key: "score", label: "내 점수" }], rows: [
    { date: "2026-09-08", values: { score: null } },
    { date: "2026-09-01", values: { score: 0 } },
  ] }));
  assert.ok(html.includes("hidden md:block"));
  assert.ok(html.includes("<table>"));
  assert.ok(html.includes("0점"));
  assert.ok(html.includes("집계 불가"));
  assert.ok(html.indexOf("2026-09-01") < html.indexOf("2026-09-08"));
  assert.ok(!html.includes("NaN"));
  const empty = renderToStaticMarkup(React.createElement(Component, { label: "추이", columns: [], rows: [] }));
  assert.ok(empty.includes("표시할 응시 기록이 없습니다."));
});

test("heatmap mobile table and desktop matrix explain missing exams, zero and unmatched responses", () => {
  const Component = load("components/exams/analysis/charts/SubjectHeatmap.tsx").SubjectHeatmap;
  const html = renderToStaticMarkup(React.createElement(Component, { subjects: [{ id: "a", name: "과목 A" }, { id: "b", name: "과목 B" }], heatmap: [
    { date: "2026-09-08", subjectId: "a", internalAvg: 0, externalAvg: 50, count: 1, topic: "총론" },
    { date: "2026-09-01", subjectId: "b", internalAvg: null, externalAvg: 50, count: 0, topic: null },
  ] }));
  for (const text of ["md:hidden", "hidden md:block", "시험 없음", "0점", "집계 불가", "외부보다 낮음", "비교 불가", "총론", "진도 미등록", "0명"]) assert.ok(html.includes(text), text);
});


const subject = { id: "a", name: "과목 A", fullScore: 100, itemCount: 20, alternateGroup: null };
const report: MorningStudentReport = {
  student: { id: "own", name: "관리자전용이름", studentNumber: "90***" }, examType: { id: "morning", name: "아침 시험" }, subjectDefinitions: [subject],
  range: { from: "2026-06-17", to: "2026-09-08" }, settings: { ...DEFAULT_EXAM_ANALYSIS_SETTINGS, morning: { ...DEFAULT_EXAM_ANALYSIS_SETTINGS.morning, movingAverageSessions: 6, trendWindowSessions: 12 } },
  summary: { average: 50, externalGap: -10, internalGap: -5, attendanceRatePercent: 100, thisWeekRank: null, rankDelta: null, attended: 1, expected: 1 },
  subjects: [{ subjectId: "a", name: "과목 A", average: 50, externalAvg: 60, internalAvg: 55, gap: -5, stdDev: 0, slope: null, consecutiveDrops: 0, flags: [], attended: 1, expected: 1, attendanceRatePercent: 100, insufficientSample: true, requiredSessions: 6, series: [{ date: "2026-09-08", score: 50, ma: 50, classMa: 55, topic: null }] }],
  topics: [], dailyItems: [], cumulativeGap: null, weeklyRanks: [],
};

test("first-month report uses configured attended-session counts and shows every unavailable section", () => {
  const Component = load("components/exams/analysis/MorningStudentReport.tsx").MorningStudentReport;
  const html = renderToStaticMarkup(React.createElement(Component, { report, mode: "student" }));
  for (const text of ["아직 1회만 응시했습니다. 6회부터", "판정에 필요한 응시 회차가 부족합니다", "문항별 응답 자료가 없습니다", "같은 주의 누적 시험과 진도 시험", "주간 석차 기록이 없습니다", "판정 보류"]) assert.ok(html.includes(text), text);
  assert.ok(!html.includes("관리자전용이름"));
  assert.ok(!html.includes("7일 이동평균"));
  assert.ok(!html.includes("감지된 하락 신호가 없습니다"));
  const admin = renderToStaticMarkup(React.createElement(Component, { report, mode: "admin" }));
  assert.ok(admin.includes("관리자전용이름"));
});

test("low participation suppresses decline claims and chart interpretation but preserves scores and marking", () => {
  const Component = load("components/exams/analysis/MorningStudentReport.tsx").MorningStudentReport;
  const data = { ...report, summary: { ...report.summary, attendanceRatePercent: 50 }, subjects: [{ ...report.subjects[0], insufficientSample: false, flags: [{ kind: "consecutiveDrops", detail: "표시하면안되는하락사유" }] }] };
  const html = renderToStaticMarkup(React.createElement(Component, { report: data, mode: "student" }));
  assert.ok(html.includes("추세와 하락을 판단하지 않습니다"));
  assert.ok(!html.includes("설정된 기준은 70%"));
  assert.ok(!html.includes("표시하면안되는하락사유"));
  assert.ok(!html.includes("점수와 이동평균"));
  assert.ok(html.includes("<td>50</td>"));
  const subjectLow = renderToStaticMarkup(React.createElement(Component, { report: { ...data, summary: report.summary, subjects: [{ ...data.subjects[0], attendanceRatePercent: 30 }] }, mode: "student" }));
  assert.ok(subjectLow.includes("이 과목의 응시 기록이 부족"));
  assert.ok(!subjectLow.includes("표시하면안되는하락사유"));
});

test("student full grading and external rank stay in daily details without inferred weak topics or names", () => {
  const Component = load("components/exams/analysis/MorningStudentReport.tsx").MorningStudentReport;
  const item = { subjectId: "a", itemNo: 1, position: 0, answerKey: "3,4", answer: "2,4", isCorrect: false, externalCorrectRatePct: 80, internalCorrectRatePct: 50, difficulty: "쉬움" as const };
  const diagnostics = { list: [item], easyMissed: [item], killerTop5: [item], summary: { total: 1, correct: 0, wrong: 1, unanswered: 0, myCorrectRate: 0, killerTotal: 0, killerCorrect: 0, killerConquerRate: 0 } };
  const day = { date: "2026-09-08", subjectId: "a", subjectName: "과목 A", topic: "기본권", diagnostics, easyMissed: [item], wrongTop5: [item], external: { rank: 3, count: 20, topPercent: 15, percentile: 87.5 } };
  const html = renderToStaticMarkup(React.createElement(Component, { report: { ...report,
    subjects: [{ ...report.subjects[0], insufficientSample: false, attended: 6, expected: 6 }],
    topics: [{ topic: "강점단원", subjectId: "a", count: 1, myAvg: 90, internalAvg: 80, gap: 10 }, { topic: "취약단원", subjectId: "a", count: 2, myAvg: 50, internalAvg: 80, gap: -30 }],
    dailyItems: [{ ...day, date: "2026-09-01" }, day], weeklyRanks: [{ weekYear: 2026, weekNumber: 36, rank: 3, count: 20 }],
  }, mode: "student" }));
  for (const text of ["외부 석차 3등", "상위 15%", "전체 채점표 (1문항)", "3,4", "2,4", "80%", "<td>X</td>", "직전 주 기록이 없어"]) assert.ok(html.includes(text), text);
  assert.ok(!html.includes("(n="));
  assert.ok(!html.includes("취약단원") && !html.includes("강점단원"));
  const itemSection = html.slice(html.indexOf('id="personal-items"'));
  assert.ok(itemSection.indexOf("2026-09-08") >= 0 && itemSection.indexOf("2026-09-08") < itemSection.indexOf("2026-09-01"));
  assert.ok(!/<details[^>]*\bopen/.test(html));
  assert.ok(!html.includes("관리자전용이름"));
});

const analysis: MorningCohortAnalysis = {
  examType: report.examType, subjects: [subject], subjectDefinitions: [subject], range: report.range, settings: report.settings, sessionCount: 1,
  heatmap: [], subjectTrends: [{ subjectId: "a", name: "과목 A", series: [{ date: "2026-09-08", internalAvg: 50, externalAvg: 60 }] }],
  dailyWrongTop: [], declines: [], lowAttendance: [], studentSubjects: [], topics: [], insufficientSample: true,
};

test("cohort has 84-day defaults and distinguishes insufficient samples from no declines", () => {
  const Component = load("components/exams/analysis/MorningCohortAnalysis.tsx", {
    "@/components/ui/SlideOver": { SlideOver: () => null },
    react: { ...React, useState(initial: unknown) {
      const seeded = initial && typeof initial === "object" && "url" in initial ? { ...initial, data: { analysis } } : initial;
      return React.useState(seeded);
    } },
  }).MorningCohortAnalysis;
  const html = renderToStaticMarkup(React.createElement(Component, { divisionSlug: "test", examTypes: [{ id: "morning", name: "아침 시험", category: "MORNING" }], view: "cohort" }));
  const studentsHtml = renderToStaticMarkup(React.createElement(Component, { divisionSlug: "test", examTypes: [{ id: "morning", name: "아침 시험", category: "MORNING" }], view: "students" }));
  for (const text of ["최근 84일", "6회부터 추세", "진도 라벨이 입력된 시험이 없습니다"]) assert.ok(html.includes(text), text);
  assert.ok(studentsHtml.includes("판정에 필요한 응시 회차가 부족합니다"), "판정에 필요한 응시 회차가 부족합니다");
  assert.ok(!studentsHtml.includes("감지된 과목별 하락 신호가 없습니다"));
  analysis.insufficientSample = false;
  const ready = renderToStaticMarkup(React.createElement(Component, { divisionSlug: "test", examTypes: [{ id: "morning", name: "아침 시험", category: "MORNING" }], view: "students" }));
  assert.ok(ready.includes("감지된 과목별 하락 신호가 없습니다"));
  analysis.insufficientSample = true;
});

test("both analysis tabs are enabled and busy import still blocks leaving", () => {
  let items: { id: string; disabled?: boolean }[] = [];
  const empty = () => null;
  const Component = load("components/exams/ExamSecondaryTabs.tsx", {
    "@/components/ui/AdminTabs": { AdminTabs: (props: { items: typeof items }) => { items = props.items; return null; }, AdminTabPanel: empty },
    "@/components/exams/import/ExamImportWizard": { ExamImportWizard: empty },
    "@/components/exams/ExamScoreManager": { ExamScoreManager: empty },
    "@/components/exams/MorningExamScoreManager": { MorningExamScoreManager: empty },
    "@/components/exams/analysis/RegularCohortAnalysis": { RegularCohortAnalysis: empty },
    "@/components/exams/analysis/MorningCohortAnalysis": { MorningCohortAnalysis: empty },
  }).ExamSecondaryTabs;
  for (const category of ["REGULAR", "MORNING"]) {
    renderToStaticMarkup(React.createElement(Component, { divisionSlug: "test", category, examTypes: [] }));
    for (const id of ["cohort", "students"]) assert.equal(items.find((item) => item.id === id)?.disabled, false);
  }
  assert.match(fs.readFileSync(path.join(root, "components/exams/ExamSecondaryTabs.tsx"), "utf8"), /id: "cohort", label: "반 분석", disabled: busy/);
});


test("numeric presentation rounds means to one decimal without changing zero, negatives, null or source data", () => {
  const Component = load("components/exams/analysis/MorningStudentReport.tsx").MorningStudentReport;
  const data = { ...report, summary: { ...report.summary, average: 66.6666666667, internalGap: -3.3333333333, externalGap: 0 }, cumulativeGap: { cumulativeAvg: 66.6666666667, progressAvg: 70.3333333333, gap: -3.6666666666, pairedWeeks: 2 } };
  const before = JSON.stringify(data);
  const html = renderToStaticMarkup(React.createElement(Component, { report: data, mode: "student" }));
  for (const text of ["66.7점", "-3.3점", "0점", "70.3점", "-3.7점"]) assert.ok(html.includes(text), text);
  assert.ok(!html.includes("666666"));
  assert.equal(JSON.stringify(data), before);
  const Trend = load("components/exams/analysis/charts/TrendLines.tsx").TrendLines;
  const table = renderToStaticMarkup(React.createElement(Trend, { label: "추이", columns: [{ key: "score", label: "점수" }], rows: [
    { date: "2026-09-01", values: { score: 66.6666666667 } }, { date: "2026-09-02", values: { score: -3.33333333 } },
    { date: "2026-09-03", values: { score: 0 } }, { date: "2026-09-04", values: { score: null } }, { date: "2026-09-05", values: { score: Infinity } },
  ] }));
  for (const text of ["66.7점", "-3.3점", "0점", "집계 불가"]) assert.ok(table.includes(text), text);
  assert.ok(!table.includes("Infinity")); assert.ok(!table.includes("666666"));
});

test("student SSR uses authenticated identity, validates period, preserves manual records and selects morning after form submission", async () => {
  const calls: unknown[][] = [];
  let failure: number | null = null;
  let tab: string | undefined;
  const empty = () => null;
  const pass = ({ children }: { children: React.ReactNode }) => children;
  const Component = load("app/[division]/student/exams/page.tsx", {
    "next/dynamic": { default: () => empty },
    "next/navigation": { notFound: () => { throw new Error("page404"); }, redirect: () => { throw new Error("redirect"); } },
    "lucide-react": { ChartNoAxesColumn: empty },
    "@/components/exams/ExamScoreChartLoader": { ExamScoreChartLoader: empty },
    "@/components/exams/ExamTabLayout": { ExamTabLayout: (props: { morningContent: React.ReactNode; regularContent: React.ReactNode; defaultTab: string }) => { tab = props.defaultTab; return React.createElement("main", null, props.morningContent, props.regularContent); } },
    "@/components/exams/MorningExamStudentView": { MorningExamStudentView: () => React.createElement("p", null, "기존 수기 아침 성적") },
    "@/components/exams/analysis/RegularStudentReport": { RegularStudentReport: empty },
    "@/components/student-view/StudentPortalFrame": { StudentPortalFrame: pass },
    "@/components/student-view/StudentPortalUi": { PortalEmptyState: empty, PortalMetricCard: empty, PortalSectionHeader: empty, portalInsetClass: "", portalSectionClass: "" },
    "@/lib/auth": { requireDivisionStudentAccess: async () => ({ studentId: "own-id" }) },
    "@/lib/errors": { isNotFoundError: (error: { status?: number }) => error.status === 404 },
    "@/lib/services/exam.service": { listExamTypes: async () => [{ id: "morning", name: "아침 시험", category: "MORNING", isActive: true }], listStudentExamResults: async () => [] },
    "@/lib/services/exam-analysis.service": { listRegularSessions: async () => [], getRegularStudentReport: async () => { throw new Error("unexpected regular request"); } },
    "@/lib/services/morning-exam-analysis.service": { getMorningStudentReport: async (...args: unknown[]) => { calls.push(args); if (failure) throw Object.assign(new Error(`service-${failure}`), { status: failure }); return report; } },
    "@/lib/services/morning-exam.service": { listStudentMorningExamWeeks: async () => [] },
    "@/lib/services/score-target.service": { listScoreTargets: async () => [] },
    "@/lib/services/settings.service": { getDivisionTheme: async () => ({}), getDivisionFeatureSettings: async () => ({ featureFlags: { examManagement: true } }) },
    "@/lib/services/student.service": { getStudentDetail: async () => ({}) },
  }).default;
  const html = renderToStaticMarkup(await Component({ params: { division: "test" }, searchParams: { morningType: "unknown-type", morningFrom: "2026-06-17", morningTo: "2026-09-08", studentId: "attacker-id" } }));
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), ["test", "morning", "own-id", { from: "2026-06-17", to: "2026-09-08" }, { role: "STUDENT", studentId: "own-id" }]);
  assert.equal(tab, "morning"); assert.ok(html.includes("기존 수기 아침 성적")); assert.ok(!html.includes("관리자전용이름")); assert.ok(!html.includes("attacker-id"));
  calls.length = 0;
  const invalid = renderToStaticMarkup(await Component({ params: { division: "test" }, searchParams: { morningFrom: "2026-02-30", morningTo: "2026-09-08" } }));
  assert.equal(calls.length, 0); assert.ok(invalid.includes("날짜를 확인해 주세요")); assert.ok(invalid.includes("기존 수기 아침 성적"));
  failure = 404;
  const missing = renderToStaticMarkup(await Component({ params: { division: "test" }, searchParams: { morningType: "morning" } }));
  assert.ok(missing.includes("가져온 아침 문항 분석 자료가 없습니다")); assert.ok(missing.includes("기존 수기 아침 성적"));
  const range = calls.at(-1)![3] as { from: string; to: string };
  assert.equal((Date.parse(range.to) - Date.parse(range.from)) / 86400000, 83);
  failure = 403;
  await assert.rejects(Component({ params: { division: "test" } }), /service-403/);
  failure = 500;
  await assert.rejects(Component({ params: { division: "test" } }), /service-500/);
});

test("cohort request ignores stale responses and unmounted work, clears old output and retries errors", async () => {
  type Slot = { value: any; deps?: unknown[]; cleanup?: () => void }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const slots: Slot[] = [];
  let cursor = 0, writes = 0;
  const effects: (() => void)[] = [];
  const pending: { signal: AbortSignal; resolve: (reply: unknown) => void }[] = [];
  const hooks = {
    useId: () => "filter",
    useState(initial: unknown) { const i = cursor++; slots[i] ??= { value: typeof initial === "function" ? initial() : initial }; return [slots[i].value, (next: any) => { writes++; slots[i].value = typeof next === "function" ? next(slots[i].value) : next; }]; }, // eslint-disable-line @typescript-eslint/no-explicit-any
    useEffect(effect: () => () => void, deps: unknown[]) {
      const i = cursor++;
      if (!slots[i] || deps.some((dep, index) => !Object.is(dep, slots[i].deps?.[index]))) {
        slots[i]?.cleanup?.(); slots[i] = { value: null, deps }; effects.push(() => { slots[i].cleanup = effect(); });
      }
    },
  };
  const Component = load("components/exams/analysis/MorningCohortAnalysis.tsx", { react: hooks, "@/components/ui/SlideOver": { SlideOver: () => null } }, {
    fetch: (_url: string, options: { signal: AbortSignal }) => new Promise((resolve) => pending.push({ signal: options.signal, resolve })),
  }).MorningCohortAnalysis;
  const rootNode = Component({ divisionSlug: "test", examTypes: [{ id: "morning", name: "아침 시험", category: "MORNING" }] });
  const child = rootNode.props.children.at(-1);
  slots.length = 0;
  function render(query = "examTypeId=morning&from=2026-06-17&to=2026-09-08") {
    cursor = 0;
    const tree = child.type({ ...child.props, query });
    while (effects.length) effects.shift()!();
    return tree;
  }
  const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
  render(); render("changed"); assert.equal(pending[0].signal.aborted, true);
  pending[1].resolve({ ok: false }); await settle();
  const failed = render("changed"); assert.ok(failed.props.error); failed.props.retry(); render("changed");
  assert.equal(pending.length, 3);
  pending[0].resolve({ ok: true, json: async () => ({ analysis }) }); await settle();
  assert.equal(render("changed").props.error, undefined);
  slots.forEach((slot) => slot.cleanup?.()); const before = writes;
  pending[2].resolve({ ok: true, json: async () => ({ analysis }) }); await settle();
  assert.equal(pending[2].signal.aborted, true); assert.equal(writes, before);
});
