import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import type { RegularStudentReport } from "../../lib/exam-analysis-types";

const root = path.resolve(__dirname, "../..");
// Render actual report/table markup; replace chart geometry and unrelated portal
// services only. These checks do not claim browser layout verification.
function load(file: string, overrides: Record<string, unknown> = {}, globals: Record<string, unknown> = {}): Record<string, any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const filename = path.resolve(root, file);
  const loaded = { exports: {} };
  const source = fs.readFileSync(filename, "utf8");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText, {
    module: loaded, exports: loaded.exports, URLSearchParams, AbortController, ...globals,
    require(name: string) {
      if (name in overrides) return overrides[name];
      if (name === "react") return React;
      if (name === "react/jsx-runtime") return jsx;
      if (name === "recharts") return new Proxy({}, { get: () => ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children) });
      if (name === "@/components/exams/ExamScoreChart") return { ExamScoreChart: () => React.createElement("p", null, "성적 추이 차트") };
      if (name === "@/components/ui/SlideOver") return { SlideOver: ({ open, children }: { open: boolean; children: React.ReactNode }) => open ? children : null };
      const local = name.startsWith("@/") ? name.slice(2) : path.relative(root, path.resolve(path.dirname(filename), name));
      return load(`${local}.tsx`, overrides, globals);
    },
  });
  return loaded.exports;
}

const report: RegularStudentReport = {
  session: { id: "session", examTypeId: "type", examTypeName: "정기 시험", examDate: "2026-09-08", fullScore: 100, itemCount: 2, externalCohortSize: 12, topic: null },
  subjects: [{ id: "subject", name: "과목 A", fullScore: 100, itemCount: 2, alternateGroup: null }],
  student: { id: "student", name: "관리자에게만 표시", studentNumber: "90***", region: null },
  myScore: { total: 50, subjectScores: { subject: 50 }, isPartial: true },
  ranks: { external: { rank: null, count: 12, topPercent: null, percentile: null }, region: null, internal: { rank: 1, count: 8, topPercent: 12.5, percentile: 90, isReliable: false } },
  stats: { external: { average: null, top10Avg: null, top30Avg: null, max: null, min: null }, internal: { average: 50, max: 50, min: 50 }, subjects: [{ subjectId: "subject", name: "과목 A", my: 50, fullScore: 100, scoreRate: 50, externalAvg: null, regionAvg: null, internalAvg: 50, top10Avg: null, top30Avg: null, externalRank: null, externalTopPercent: null, externalPercentile: null, grade: "취약", gradeBasis: "scoreRate" }], balance: { stdDev: 0, assessment: "매우 균형" }, advice: ["과목 A 집중 학습이 필요합니다."] },
  distribution: { binSize: 10, bins: [{ lo: 50, hi: 60, count: 2, ratio: 100 }], myBinIndex: 0 },
  items: { list: [], easyMissed: [], killerTop5: [], summary: { total: 0, correct: 0, wrong: 0, unanswered: 0, myCorrectRate: 0, killerTotal: 0, killerCorrect: 0, killerConquerRate: 0 } },
  competitors: [{ studentNumber: "90123", rank: 2, total: 40, subjectScores: {} }], trend: [], target: null, flags: [],
};

test("personal report: small cohort, unavailable external values, all prescribed sections and masked neighbours", () => {
  const Component = load("components/exams/analysis/RegularStudentReport.tsx").RegularStudentReport;
  const html = renderToStaticMarkup(React.createElement(Component, { report, mode: "student" }));
  for (const text of ["반 내 지표는 참고용입니다(응시 8명)", "집계 불가", "지역 정보 없음", "과목별 비교", "과목 균형과 학습 조언", "외부 성적 분포", "문항 분석", "나만 틀린 문제", "오답률 TOP5", "전체 채점표", "목표 대비", "내 주변 석차", "일부 과목 미응시", "90***", "내 구간"]) assert.ok(html.includes(text), text);
  assert.ok(!html.includes("관리자에게만 표시"));
  assert.ok(!html.includes("90123"));
  assert.ok(!/<details[^>]*\bopen/.test(html));
  assert.ok(!html.includes("NaN"));
});

test("personal report: n=10 removes low-N warning; admin name and target remain available", () => {
  const Component = load("components/exams/analysis/RegularStudentReport.tsx").RegularStudentReport;
  const data = { ...report, ranks: { ...report.ranks, internal: { ...report.ranks.internal, count: 10, isReliable: true } }, target: { targetScore: 80, gap: 30, gapPercent: 30 } };
  const html = renderToStaticMarkup(React.createElement(Component, { report: data, mode: "admin" }));
  assert.ok(!html.includes("반 내 지표는 참고용"));
  assert.ok(html.includes("관리자에게만 표시"));
  assert.ok(html.includes("목표 80점"));
});

test("score chart: date-only analysis results sort and label without an undefined round", () => {
  let data: { label: string }[] = [];
  const passthrough = ({ children }: { children: React.ReactNode }) => children;
  const Component = load("components/exams/ExamScoreChart.tsx", {
    recharts: new Proxy({}, { get: (_target, name) => name === "LineChart" ? (props: { data: typeof data; children: React.ReactNode }) => { data = props.data; return props.children; } : passthrough }),
    "@/components/student-view/StudentPortalUi": { PortalEmptyState: () => null, PortalSectionHeader: () => null, portalCardClass: "", portalSectionClass: "" },
  }).ExamScoreChart;
  const base = { examTypeId: "type", examTypeName: "시험", totalScore: 50, rankInClass: 1, subjects: [], notes: null };
  renderToStaticMarkup(React.createElement(Component, { results: [{ ...base, id: "later", examDate: "2026-10-01" }, { ...base, id: "earlier", examDate: "2026-09-08" }] }));
  assert.equal(data.length, 2);
  assert.match(data[0].label, /2026.*9.*8/);
  assert.match(data[1].label, /2026.*10.*1/);
  assert.ok(data.every((entry) => !entry.label.includes("undefined") && !entry.label.includes("회차")));
});

test("personal neighbours: full subject metadata distinguishes an alternate choice from a missing subject, including zero scores", () => {
  const Component = load("components/exams/analysis/RegularStudentReport.tsx").RegularStudentReport;
  const subjects = [
    { ...report.subjects[0], alternateGroup: "choice" },
    { ...report.subjects[0], id: "alternate", name: "과목 B", alternateGroup: "choice" },
    { ...report.subjects[0], id: "required", name: "필수 과목", alternateGroup: null },
  ];
  const html = renderToStaticMarkup(React.createElement(Component, { report: { ...report, subjects, competitors: [{ studentNumber: "90***", rank: 2, total: 0, subjectScores: { alternate: 0 } }] }, mode: "student" }));
  assert.match(html, /<td>선택 안 함<\/td><td>0<\/td><td>미응시<\/td>/);
});

test("item table: blank answer and multiple answers preserved; full marking table stays collapsed", () => {
  const Component = load("components/exams/analysis/ItemAnalysisTable.tsx").ItemAnalysisTable;
  const item = { subjectId: "subject", itemNo: 1, position: 0, answerKey: "3,4", externalCorrectRatePct: 80, internalCorrectRatePct: null, answer: null, isCorrect: false, difficulty: "쉬움" };
  const html = renderToStaticMarkup(React.createElement(Component, { subjects: report.subjects, items: { ...report.items, list: [item], easyMissed: [item], killerTop5: [item] } }));
  assert.ok(html.includes("3,4")); assert.ok(html.includes("무응답")); assert.ok(html.includes("과목 A"));
  assert.ok(!/<details[^>]*\bopen/.test(html));
});

test("cohort selector: no exam types renders honest empty state without requesting analysis", () => {
  const Component = load("components/exams/analysis/RegularCohortAnalysis.tsx").RegularCohortAnalysis;
  assert.match(renderToStaticMarkup(React.createElement(Component, { divisionSlug: "test", examTypes: [] })), /분석할 정기 시험 종류가 없습니다/);
});

test("cohort report: low-N warning, unavailable external averages and empty matching students stay visible", () => {
  const analysis = {
    session: report.session, subjects: report.subjects,
    external: { ...report.stats.external, distribution: report.distribution, subjectAverages: { subject: null }, regions: [] },
    internal: { count: 8, average: 50, max: 50, min: 50, stdDev: 0, subjectAverages: { subject: 50 }, weakSubjects: [], isReliable: false },
    hasPreviousExam: false, classWrongTop: [], ranking: [] as Record<string, unknown>[], declines: [], partials: [],
  };
  const Component = load("components/exams/analysis/RegularCohortAnalysis.tsx", {
    react: { ...React, useState(initial: unknown) {
      let seeded = initial;
      if (initial && typeof initial === "object" && "url" in initial) {
        const url = String(initial.url);
        seeded = { url, data: url.includes("/sessions?") ? { sessions: [{ sessionId: "session", examDate: "2026-09-08", participantCount: 8 }] } : { analysis } };
      }
      return React.useState(seeded);
    } },
  }).RegularCohortAnalysis;
  const html = renderToStaticMarkup(React.createElement(Component, { divisionSlug: "test", examTypes: [{ id: "type", name: "정기 시험" }] }));
  for (const text of ["반 내 지표는 참고용입니다(응시 8명)", "집계 불가", "반 오답률 TOP10", "반 석차표", "이 시험에 매칭된 반 학생이 없습니다", "학습 확인 대상", "일부 미응시 학생"]) assert.ok(html.includes(text), text);
  assert.ok(html.includes("비교할 직전 시험이 없습니다."));
  assert.ok(!html.includes("학습 확인 신호가 없습니다."));
  analysis.hasPreviousExam = true;
  const prior = renderToStaticMarkup(React.createElement(Component, { divisionSlug: "test", examTypes: [{ id: "type", name: "정기 시험" }] }));
  assert.ok(prior.includes("학습 확인 신호가 없습니다."));
  assert.ok(!prior.includes("비교할 직전 시험이 없습니다."));
  analysis.subjects = [
    { ...report.subjects[0], alternateGroup: "choice" },
    { ...report.subjects[0], id: "alternate", name: "과목 B", alternateGroup: "choice" },
    { ...report.subjects[0], id: "required", name: "필수 과목", alternateGroup: null },
  ];
  analysis.ranking = [{ studentId: "student", name: "학생", internalRank: 1, totalScore: 0, subjectScores: { alternate: 0 }, externalTopPercent: null, delta: null, flags: [], isPartial: true }];
  const ranked = renderToStaticMarkup(React.createElement(Component, { divisionSlug: "test", examTypes: [{ id: "type", name: "정기 시험" }] }));
  assert.ok(ranked.includes("<td>—</td><td>—</td>"));
  assert.ok(!ranked.includes("이직전"));
  assert.match(ranked, /<td>선택 안 함<\/td><td>0<\/td><td>미응시<\/td>/);
});

test("secondary tabs: only regular analysis is enabled and import busy state still guards navigation", () => {
  const source = fs.readFileSync(path.join(root, "components/exams/ExamSecondaryTabs.tsx"), "utf8");
  let items: { id: string; disabled?: boolean }[] = [];
  const empty = () => null;
  const Component = load("components/exams/ExamSecondaryTabs.tsx", {
    "@/components/ui/AdminTabs": { AdminTabs: (props: { items: typeof items }) => { items = props.items; return null; }, AdminTabPanel: empty },
    "@/components/exams/import/ExamImportWizard": { ExamImportWizard: empty },
    "@/components/exams/ExamScoreManager": { ExamScoreManager: empty },
    "@/components/exams/MorningExamScoreManager": { MorningExamScoreManager: empty },
  }).ExamSecondaryTabs;
  for (const category of ["REGULAR", "MORNING"]) {
    renderToStaticMarkup(React.createElement(Component, { divisionSlug: "test", category, examTypes: [] }));
    assert.equal(items.find((item) => item.id === "analysis")?.disabled, category !== "REGULAR");
  }
  assert.match(source, /disabled: busy \|\| category !== "REGULAR"/);
});

test("student SSR: requests own viewer, rejects unknown session selection and preserves morning and legacy results", async () => {
  const calls: unknown[][] = [];
  const sessionCalls: unknown[][] = [];
  let scenario = "participated";
  const empty = () => null;
  const pass = ({ children }: { children: React.ReactNode }) => children;
  const exam = { id: "legacy", examTypeId: "type", examTypeName: "정기 시험", examRound: 1, examDate: "2026-09-08", totalScore: 50, rankInClass: 1, subjects: [], notes: null };
  const Component = load("app/[division]/student/exams/page.tsx", {
    "next/dynamic": { default: () => empty },
    "next/navigation": { notFound: () => { throw new Error("404"); }, redirect: () => { throw new Error("redirect"); } },
    "lucide-react": { ChartNoAxesColumn: empty },
    "@/components/exams/ExamScoreChartLoader": { ExamScoreChartLoader: empty },
    "@/components/exams/ExamTabLayout": { ExamTabLayout: ({ morningContent, regularContent }: { morningContent: React.ReactNode; regularContent: React.ReactNode }) => React.createElement("main", null, morningContent, regularContent) },
    "@/components/exams/MorningExamStudentView": { MorningExamStudentView: () => React.createElement("p", null, "아침 기존 기록") },
    "@/components/student-view/StudentPortalFrame": { StudentPortalFrame: pass },
    "@/components/student-view/StudentPortalUi": { PortalEmptyState: empty, PortalMetricCard: empty, PortalSectionHeader: empty, portalInsetClass: "", portalSectionClass: "" },
    "@/lib/auth": { requireDivisionStudentAccess: async () => ({ studentId: "own-id" }) },
    "@/lib/errors": { isNotFoundError: (error: { status?: number }) => error.status === 404 },
    "@/lib/services/exam.service": { listExamTypes: async () => [{ id: "type", name: "정기 시험", category: "REGULAR", isActive: true }], listStudentExamResults: async () => [exam] },
    "@/lib/services/exam-analysis.service": {
      listRegularSessions: async (...args: unknown[]) => {
        sessionCalls.push(args);
        // A manual score at the same type/date is not participation. Without
        // the student filter this simulates the shared imported session listing.
        return scenario === "manual" && args[2] === "own-id" ? [] : [{ sessionId: "own-session", examDate: "2026-09-08", participantCount: 8 }];
      },
      getRegularStudentReport: async (...args: unknown[]) => {
        calls.push(args);
        if (scenario === "missing" || scenario === "manual") throw Object.assign(new Error("missing analysis"), { status: 404 });
        if (scenario === "forbidden") throw Object.assign(new Error("forbidden"), { status: 403 });
        return report;
      },
    },
    "@/lib/services/morning-exam.service": { listStudentMorningExamWeeks: async () => [] },
    "@/lib/services/score-target.service": { listScoreTargets: async () => [] },
    "@/lib/services/settings.service": { getDivisionTheme: async () => ({}), getDivisionFeatureSettings: async () => ({ featureFlags: { examManagement: true } }) },
    "@/lib/services/student.service": { getStudentDetail: async () => ({}) },
  }).default;
  const html = renderToStaticMarkup(await Component({ params: { division: "test" }, searchParams: { analysisSession: "type:2026-09-09" } }));
  assert.equal(calls.length, 1);
  assert.deepEqual(sessionCalls[0], ["test", "type", "own-id"]);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), ["test", "type", "2026-09-08", "own-id", { role: "STUDENT", studentId: "own-id" }]);
  assert.ok(html.includes("아침 기존 기록")); assert.ok(html.includes("시험 메모가 없습니다"));
  assert.ok(!html.includes('value="type:2026-09-09"'));
  scenario = "manual";
  calls.length = 0;
  const manual = renderToStaticMarkup(await Component({ params: { division: "test" }, searchParams: { analysisSession: "type:2026-09-08" } }));
  assert.equal(calls.length, 0);
  assert.ok(manual.includes("가져온 문항 분석 자료가 없습니다"));
  assert.ok(manual.includes("시험 메모가 없습니다"));
  assert.ok(manual.includes("아침 기존 기록"));
  scenario = "missing";
  const missing = renderToStaticMarkup(await Component({ params: { division: "test" } }));
  assert.ok(missing.includes("선택한 시험일의 문항 분석 자료가 없습니다"));
  assert.ok(missing.includes("시험 메모가 없습니다"));
  scenario = "forbidden";
  await assert.rejects(Component({ params: { division: "test" } }), /forbidden/);
});

test("cohort request: stale reply and unmount are ignored; error has retry and old results are cleared", async () => {
  type Slot = { value: any; deps?: unknown[]; cleanup?: () => void }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const slots: Slot[] = [];
  let cursor = 0, writes = 0;
  const effects: (() => void)[] = [];
  const pending: { signal: AbortSignal; resolve: (reply: unknown) => void }[] = [];
  const hooks = {
    useId: () => "selector",
    useState(initial: unknown) { const i = cursor++; slots[i] ??= { value: initial }; return [slots[i].value, (next: any) => { writes++; slots[i].value = typeof next === "function" ? next(slots[i].value) : next; }]; }, // eslint-disable-line @typescript-eslint/no-explicit-any
    useEffect(effect: () => () => void, deps: unknown[]) {
      const i = cursor++;
      if (!slots[i] || deps.some((dep, index) => !Object.is(dep, slots[i].deps?.[index]))) {
        slots[i]?.cleanup?.(); slots[i] = { value: null, deps }; effects.push(() => { slots[i].cleanup = effect(); });
      }
    },
  };
  const Component = load("components/exams/analysis/RegularCohortAnalysis.tsx", { react: hooks }, {
    fetch: (_url: string, options: { signal: AbortSignal }) => new Promise((resolve) => pending.push({ signal: options.signal, resolve })),
  }).RegularCohortAnalysis;
  const rootNode = Component({ divisionSlug: "test", examTypes: [{ id: "type", name: "시험" }] });
  const selector = rootNode.props.children[1];
  slots.length = 0;
  function render(base = "/api/test/exams/analysis") {
    cursor = 0;
    const tree = selector.type({ ...selector.props, base });
    while (effects.length) effects.shift()!();
    return tree;
  }
  const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
  render(); render("/api/new/exams/analysis");
  assert.equal(pending[0].signal.aborted, true);
  pending[1].resolve({ ok: false }); await settle();
  const failed = render("/api/new/exams/analysis");
  assert.ok(failed.props.error); failed.props.retry(); render("/api/new/exams/analysis");
  assert.equal(pending.length, 3);
  pending[0].resolve({ ok: true, json: async () => ({ sessions: [{ examDate: "2099-01-01" }] }) }); await settle();
  assert.equal(render("/api/new/exams/analysis").props.error, undefined);
  slots.forEach((slot) => slot.cleanup?.()); const before = writes;
  pending[2].resolve({ ok: true, json: async () => ({ sessions: [] }) }); await settle();
  assert.equal(pending[2].signal.aborted, true); assert.equal(writes, before);
});


test("personal trend: first exam, undated results, same-date duplicates and other types do not imply prior history", () => {
  const Component = load("components/exams/analysis/RegularStudentReport.tsx").RegularStudentReport;
  const point = { id: "one", examTypeId: "type", examTypeName: "정기 시험", examDate: "2026-09-08", totalScore: 50, rankInClass: 1, subjects: [], notes: null };
  const previous = { ...point, id: "previous", examDate: "2026-08-08" };
  const render = (extra: Partial<RegularStudentReport>) => renderToStaticMarkup(React.createElement(Component, { report: { ...report, ...extra }, mode: "student" }));
  for (const extra of [
    { hasPreviousExam: false, trend: [previous, point] },
    { hasPreviousExam: true, trend: [point] },
    { trend: [] },
    { trend: [point, { ...previous, examDate: null }] },
    { trend: [point, { ...point, id: "duplicate" }] },
    { trend: [point, { ...previous, examTypeId: "other" }] },
  ]) {
    const html = render(extra);
    assert.ok(html.includes('class="admin-empty-state">직전 시험이 없어 비교할 수 없습니다. 다음 시험부터 표시됩니다.'));
    assert.ok(!html.includes("성적 추이 차트"));
  }
  for (const hasPreviousExam of [true, undefined]) {
    const html = render({ hasPreviousExam, trend: [previous, point] });
    assert.ok(html.includes("성적 추이 차트"));
    assert.ok(!html.includes("직전 시험이 없어 비교할 수 없습니다."));
  }
});

test("student report exposes external rank and top percentage and full marking without names", () => {
  const Component = load("components/exams/analysis/RegularStudentReport.tsx").RegularStudentReport;
  const item = { subjectId: "subject", itemNo: 1, position: 0, answerKey: "3,4", answer: "2,4", isCorrect: false, externalCorrectRatePct: 80, internalCorrectRatePct: 50, difficulty: "쉬움" as const };
  const html = renderToStaticMarkup(React.createElement(Component, { mode: "student", report: { ...report,
    ranks: { ...report.ranks, external: { rank: 3, count: 12, topPercent: 25, percentile: 79.2 } },
    items: { ...report.items, list: [item] },
    competitors: [{ ...report.competitors[0], name: "다른학생실명" }],
  } }));
  for (const text of ["3등 (n=12)", "25%", "전체 채점표 (1문항)", "3,4", "2,4", "80%", "<td>X</td>"]) assert.ok(html.includes(text), text);
  for (const text of ["관리자에게만 표시", "다른학생실명", "90123"]) assert.ok(!html.includes(text), text);
});


test("cohort selector defaults to newest exam date even when sessions arrive oldest first", () => {
  const requested: string[] = [];
  const Component = load("components/exams/analysis/RegularCohortAnalysis.tsx", {
    react: { ...React, useState(initial: unknown) {
      let seeded = initial;
      if (initial && typeof initial === "object" && "url" in initial) {
        const url = String(initial.url);
        requested.push(url);
        if (url.includes("/sessions?")) seeded = { url, data: { sessions: [
          { sessionId: "old", examDate: "2026-08-08", participantCount: 8 },
          { sessionId: "new", examDate: "2026-09-08", participantCount: 8 },
        ] } };
      }
      return React.useState(seeded);
    } },
  }).RegularCohortAnalysis;
  const html = renderToStaticMarkup(React.createElement(Component, { divisionSlug: "test", examTypes: [{ id: "type", name: "정기 시험" }] }));
  assert.match(html, /value="2026-09-08" selected=""/);
  assert.ok(html.indexOf('value="2026-09-08"') < html.indexOf('value="2026-08-08"'));
  assert.ok(requested.some((url) => url.endsWith("examTypeId=type&examDate=2026-09-08")));
});
