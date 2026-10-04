import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as React from "react";
import * as ReactDOM from "react-dom";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import type { RegularStudentReport } from "../../lib/exam-analysis-types";
import * as morningSchemas from "../../lib/morning-exam-analysis-schemas";
import { itemDiagnostics } from "../../lib/exam-analysis-meta";
import { DEFAULT_EXAM_ANALYSIS_SETTINGS } from "../../lib/exam-analysis-settings";

test("grading table distinguishes missing responses from explicit unanswered marks", () => {
  const items = itemDiagnostics([1, 2].map(itemNo => ({ subjectId: "a", itemNo, position: itemNo, answerKey: "1", externalCorrectRatePct: 80, internalCorrectRatePct: 50 })), [{ subjectId: "a", itemNo: 2, answer: null, isCorrect: false }], DEFAULT_EXAM_ANALYSIS_SETTINGS.common);
  const Component = load("components/exams/analysis/ItemAnalysisTable.tsx").ItemAnalysisTable;
  const html = renderToStaticMarkup(React.createElement(Component, { items, subjects: [{ id: "a", name: "과목" }] }));
  assert.ok(html.includes('<td>1</td><td>1</td><td>자료 없음</td><td>자료 없음</td>'));
  assert.ok(html.includes('<td>2</td><td>1</td><td>무응답</td><td>X</td>'));
});

const root = path.resolve(__dirname, "../..");
test("student score targets use unframed rows without changing the default editor", () => {
  const Component = load("components/exams/ScoreTargetPanel.tsx").ScoreTargetPanel;
  const props = { divisionSlug: "test", studentId: "student", initialTargets: [{
    id: "target", examTypeId: "exam", examTypeName: "Target exam", targetScore: 90,
    latestScore: 80, latestExamDate: null, latestExamRound: null, isAchieved: false,
    gapToTarget: 10, studyTrack: null, note: null,
  }] };
  const flat = renderToStaticMarkup(React.createElement(Component, { ...props, variant: "rows" }));
  assert.match(flat, /<article class="admin-section">/);
  assert.match(flat, /grid grid-cols-3 gap-3/);
  const original = renderToStaticMarkup(React.createElement(Component, props));
  assert.doesNotMatch(original, /<article class="admin-section">/);
  assert.doesNotMatch(original, /class="admin-portal-summary /);
});

test("student report anchors retain every analysis section without hidden panels", () => {
  const Component = load("components/exams/analysis/PersonalReportTabs.tsx").PersonalReportTabs;
  const html = renderToStaticMarkup(React.createElement(Component, { navigation: "anchors" },
    React.createElement("div", { "data-report-section": "overview" }, "overview content"),
    React.createElement("div", { "data-report-section": "diagnosis" }, "diagnosis content"),
  ));
  assert.match(html, /aria-label="개인 성적 분석 바로가기"/);
  assert.equal((html.match(/href="#/g) ?? []).length, 2);
  assert.equal((html.match(/data-report-panel/g) ?? []).length, 2);
  assert.doesNotMatch(html, /hidden=|role="tablist"|role="tabpanel"/);
});

test("subject choices preserve hidden print panels without tab semantics", () => {
  const Component = load("components/exams/analysis/LearningActionSummary.tsx").SubjectTabs;
  const html = renderToStaticMarkup(React.createElement(Component, { subjects: [
    { id: "first", name: "first subject", content: "first content" },
    { id: "second", name: "second subject", content: "second content" },
  ] }));
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /aria-pressed="false"/);
  assert.match(html, /hidden="" data-report-panel/);
  assert.doesNotMatch(html, /role="tablist"|role="tabpanel"|aria-labelledby/);
  const css = fs.readFileSync(path.join(root, "app/globals.css"), "utf8");
  assert.match(css, /\[data-report-panel\]\[hidden\]\s*\{\s*display: none !important;/);
  const print = fs.readFileSync(path.join(root, "components/exams/analysis/ReportPrintButton.tsx"), "utf8");
  assert.match(print, /node\.hidden = false/);
});

test("student analysis return link preserves current category and filters instead of entry filters", () => {
  for (const kind of ["morning", "regular"]) {
    let cursor = 0;
    const values = [kind, "current-type", "2026-07-15", { from: "2026-07-01", to: "2026-08-31" }];
    const Component = load("components/exams/analysis/StudentAnalysisPage.tsx", {
      react: { ...React, useEffect() {}, useState(initial: unknown) {
        const index = cursor++;
        return React.useState(index < values.length ? values[index] : initial);
      } },
      "@/components/ui/AdminTabs": { AdminTabs: () => null },
      "./RegularStudentReport": { RegularStudentReport: () => null },
    }).StudentAnalysisPage;
    const html = renderToStaticMarkup(React.createElement(Component, {
      division: "test", studentId: "student", examTypes: [{ id: "current-type", category: kind === "regular" ? "REGULAR" : "MORNING", name: "시험" }],
      initial: { kind: kind === "regular" ? "morning" : "regular", examTypeId: "old-type", examDate: "2026-03-15", from: "2026-01-01", to: "2026-01-31" },
    }));
    const href = html.match(/href="([^"]+)"/)?.[1].replaceAll("&amp;", "&");
    assert.match(html, /class="relative w-full min-w-0"/, "student search must fit its responsive filter field");
    assert.doesNotMatch(html, /sm:w-72/);
    assert.ok(href);
    const query = new URL(href, "http://localhost").searchParams;
    assert.equal(query.get("tab"), kind);
    assert.equal(query.get("view"), "analysis");
    assert.equal(query.get("examTypeId"), "current-type");
    assert.equal(query.get("examDate"), kind === "regular" ? "2026-07-15" : null);
    assert.equal(query.get("from"), kind === "morning" ? "2026-07-01" : null);
    assert.equal(query.get("to"), kind === "morning" ? "2026-08-31" : null);
  }
});
// Render actual report/table markup; replace chart geometry and unrelated portal
// services only. These checks do not claim browser layout verification.
/**
 * 한 번의 load() 호출 트리 안에서 모듈을 재사용한다.
 *
 * 캐시가 없으면 CommonJS 와 달리 같은 모듈이 경로 수만큼 다시 transpile 되고
 * 매번 새 VM 컨텍스트(realm)를 만든다. 이 파일의 학생 화면 테스트에서는
 * 고유 모듈 27개가 394번 로드됐다. realm 이 쌓이면 단언이 실패했을 때
 * node:assert 가 표현식을 복원하려고 스택을 심볼화하는 비용이 폭증해,
 * 실패 메시지도 못 보여준 채 몇 분씩 매달린다.
 */
type LoadCache = { done: Map<string, Record<string, any>>; loading: Map<string, Record<string, any>> }; // eslint-disable-line @typescript-eslint/no-explicit-any

function load(file: string, overrides: Record<string, unknown> = {}, globals: Record<string, unknown> = {}, cache: LoadCache = { done: new Map(), loading: new Map() }): Record<string, any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const filename = path.resolve(root, file);

  const cached = cache.done.get(filename);
  if (cached) return cached;

  // 순환 import 는 아직 채워지는 중인 exports 를 그대로 돌려준다(CommonJS 와 같다).
  // 가드가 없으면 무한 재귀로 스택이 터진다.
  const partial = cache.loading.get(filename);
  if (partial) return partial;

  const loaded = { exports: {} };
  cache.loading.set(filename, loaded.exports);
  const source = fs.readFileSync(filename, "utf8");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText, {
    module: loaded, exports: loaded.exports, URLSearchParams, AbortController, ...globals,
    require(name: string) {
      if (name in overrides) return overrides[name];
      if (name === "react") return React;
      if (name === "react-dom") return ReactDOM;
      // 아이콘은 화면 검증 대상이 아니다. 개별 override 가 없으면 빈 요소로 대체한다.
      if (name === "lucide-react") return new Proxy({}, { get: () => () => null });
      if (name === "react/jsx-runtime") return jsx;
      if (name === "@/lib/morning-exam-analysis-schemas") return morningSchemas;
      if (name === "@/lib/services/morning-exam-analysis.service") return { getMorningStudentReport: async () => null };
      if (name.endsWith("/MorningCohortAnalysis")) return { MorningCohortAnalysis: () => null };
      if (name.endsWith("/MorningStudentReport")) return { MorningStudentReport: () => null };
      if (name === "recharts") return new Proxy({}, { get: () => ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children) });
      if (name === "@/components/exams/ExamScoreChart") return { ExamScoreChart: () => React.createElement("p", null, "성적 추이 차트") };
      if (name === "@/components/ui/SlideOver") return { SlideOver: ({ open, children }: { open: boolean; children: React.ReactNode }) => open ? children : null };
      // node 내장과 외부 패키지는 실제 구현을 그대로 쓴다. 아래 로컬 해석기에 맡기면
      // lib/zod.ts, lib/node:crypto.ts 를 찾다 ENOENT 로 죽는다.
      // (이 require 는 객체 메서드라 자기 이름을 가리지 않으므로 node 의 require 가 잡힌다.)
      if (!name.startsWith("@/") && !name.startsWith(".") && !name.startsWith("/")) return require(name);
      // CSS 모듈에서 읽는 값은 클래스 이름뿐이다. 이름을 그대로 돌려주면 className 검증이 그대로 통한다.
      if (name.endsWith(".css")) return { default: new Proxy({}, { get: (_target, key) => String(key) }) };
      const local = name.startsWith("@/") ? name.slice(2) : path.relative(root, path.resolve(path.dirname(filename), name));
      return load(fs.existsSync(path.resolve(root, `${local}.tsx`)) ? `${local}.tsx` : `${local}.ts`, overrides, globals, cache);
    },
  });
  cache.loading.delete(filename);
  cache.done.set(filename, loaded.exports);
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
  const render = (view: "cohort" | "students") => renderToStaticMarkup(React.createElement(Component, { divisionSlug: "test", examTypes: [{ id: "type", name: "정기 시험" }], view }));
  const cohortHtml = render("cohort");
  const html = render("students");
  for (const text of ["반 내 지표는 참고용입니다(응시 8명)", "집계 불가", "반 오답률 TOP10"]) assert.ok(cohortHtml.includes(text), text);
  for (const text of ["반 석차표", "이 시험에 매칭된 반 학생이 없습니다", "학습 확인 대상", "일부 미응시 학생"]) assert.ok(html.includes(text), text);
  assert.ok(html.includes("비교할 직전 시험이 없습니다."));
  assert.ok(!html.includes("학습 확인 신호가 없습니다."));
  analysis.hasPreviousExam = true;
  const prior = render("students");
  assert.ok(prior.includes("학습 확인 신호가 없습니다."));
  assert.ok(!prior.includes("비교할 직전 시험이 없습니다."));
  analysis.subjects = [
    { ...report.subjects[0], alternateGroup: "choice" },
    { ...report.subjects[0], id: "alternate", name: "과목 B", alternateGroup: "choice" },
    { ...report.subjects[0], id: "required", name: "필수 과목", alternateGroup: null },
  ];
  analysis.ranking = [{ studentId: "student", name: "학생", internalRank: 1, totalScore: 0, subjectScores: { alternate: 0 }, externalTopPercent: null, delta: null, flags: [], isPartial: true }];
  const ranked = render("students");
  assert.ok(ranked.includes("<td>—</td><td>—</td>"));
  assert.ok(!ranked.includes("이직전"));
  assert.match(ranked, /<td>선택 안 함<\/td><td>0<\/td><td>미응시<\/td>/);
});

test("secondary tabs: both analyses are enabled and import busy state still guards navigation", () => {
  const source = fs.readFileSync(path.join(root, "components/exams/ExamSecondaryTabs.tsx"), "utf8");
  let items: { id: string; disabled?: boolean }[] = [];
  const empty = () => null;
  const Component = load("components/exams/ExamSecondaryTabs.tsx", {
    "@/components/ui/MobileWorkspaceTools": { MobileWorkspaceScope: ({ children }: { children: React.ReactNode }) => children },
    "@/components/ui/AdminTabs": { AdminTabs: (props: { items: typeof items }) => { items = props.items; return null; }, AdminTabPanel: empty },
    "@/components/exams/import/ExamImportWizard": { ExamImportWizard: empty },
    "@/components/exams/ExamScoreManager": { ExamScoreManager: empty },
    "@/components/exams/MorningExamScoreManager": { MorningExamScoreManager: empty },
  }).ExamSecondaryTabs;
  for (const category of ["REGULAR", "MORNING"]) {
    renderToStaticMarkup(React.createElement(Component, { divisionSlug: "test", category, examTypes: [] }));
    for (const id of ["cohort", "students"]) assert.equal(items.find((item) => item.id === id)?.disabled, false);
  }
  assert.match(source, /disabled: busy/);
});

test("student SSR: 학생은 세션의 본인만 보고, 주입한 studentId 와 학생 명단은 화면에 닿지 않는다", async () => {
  const pass = ({ children }: { children: React.ReactNode }) => children;
  let workspace: Record<string, any> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
  let guard: unknown[] = [];
  let adminChecks = 0;
  let gate = true;
  // null 이면 호출 자체가 잘못이다. 학생 화면은 명단을 읽어서도 안 된다.
  let roster: { id: string; name: string; studentNumber: string }[] | null = null;
  const { PreviewPage } = load("components/exams/preview/PreviewPage.tsx", {
    "next/navigation": { notFound: () => { throw new Error("page404"); } },
    "@/lib/exam-preview/gate": { isExamPreviewEnabled: () => gate },
    "@/lib/auth": {
      requireDivisionStudentAccess: async () => ({ studentId: "own-id" }),
      requireDivisionAdminAccess: async () => { adminChecks++; },
    },
    "@/lib/division-feature-guard": { redirectIfDivisionFeatureDisabled: async (...args: unknown[]) => { guard = args; } },
    "@/lib/services/exam.service": { listExamTypes: async () => [{ id: "type", name: "정기 시험", category: "REGULAR", isActive: true }] },
    "@/lib/services/student.service": {
      getStudentDetail: async () => ({ id: "own-id", name: "본인" }),
      listStudents: async () => { if (!roster) throw new Error("학생 화면에서 명단을 읽으면 안 된다"); return roster; },
    },
    "@/lib/services/settings.service": {
      getDivisionTheme: async () => ({}),
      getDivisionFeatureSettings: async () => ({ featureFlags: { examManagement: true, attendanceManagement: true, pointManagement: true } }),
    },
    "@/components/student-view/StudentPortalFrame": { StudentPortalFrame: pass },
    "./PreviewWorkspace": { PreviewWorkspace: (props: Record<string, any>) => { workspace = props; return React.createElement("p", null, "분석 작업창"); } }, // eslint-disable-line @typescript-eslint/no-explicit-any
  });

  // params·searchParams 로 남의 studentId 를 넣어도 인증 세션의 학생이 이긴다.
  const html = renderToStaticMarkup(await PreviewPage({
    params: { division: "test", studentId: "attacker-id" },
    searchParams: { studentId: "attacker-id", analysisSession: "type:2026-09-08", morningType: "morning", morningFrom: "2026-06-17" },
    mode: "student", previewOnly: false,
  }));
  assert.equal(workspace.studentId, "own-id");
  assert.ok(!html.includes("attacker-id"));
  assert.deepEqual(JSON.parse(JSON.stringify(workspace.students)), []);
  assert.equal(workspace.preview, false);
  assert.equal(adminChecks, 0);
  assert.deepEqual(guard, ["test", "examManagement"]);
  assert.ok(html.includes("분석 작업창"));
  // searchParams 는 초기 선택으로 정규화되고, morning* 가 있으면 morning 이 이긴다.
  assert.deepEqual(JSON.parse(JSON.stringify(workspace.initial)), { kind: "morning", examTypeId: "morning", examDate: "2026-09-08", from: "2026-06-17" });

  // 관리자 화면은 관리자 인증을 거치고 명단을 받으며, 학생 포털 껍데기를 쓰지 않는다.
  roster = [{ id: "s1", name: "학생 1", studentNumber: "P-2026-001" }];
  const admin = renderToStaticMarkup(await PreviewPage({
    params: { division: "test", studentId: "s1" }, searchParams: {}, mode: "admin", previewOnly: false,
  }));
  assert.equal(adminChecks, 1);
  assert.equal(workspace.studentId, "s1");
  assert.deepEqual(JSON.parse(JSON.stringify(workspace.students)), roster);
  assert.equal(admin, "<p>분석 작업창</p>");

  // 미리보기 전용 화면은 기능이 꺼져 있으면 404 다.
  gate = false;
  await assert.rejects(PreviewPage({ params: { division: "test" }, searchParams: {}, mode: "student", previewOnly: true }), /page404/);
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
  for (const text of ["3등", "25%", "전체 채점표 (1문항)", "3,4", "2,4", "80%", "<td>X</td>"]) assert.ok(html.includes(text), text);
  assert.ok(!html.includes("(n="));
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

test('personal report exposes six monthly slots and explains missing months', () => {
 const Component=load('components/exams/analysis/RegularStudentReport.tsx').RegularStudentReport;
 const history={from:'2026-04-01',to:'2026-09-08',months:['2026-04','2026-05','2026-06','2026-07','2026-08','2026-09'],coveredMonths:1,rows:[{date:'2026-09-08',total:0,fullScore:100,subjectScores:{subject:0},internalRank:1,externalRank:2,externalCount:8,externalTopPercent:25,isPartial:false}]};
 const html=renderToStaticMarkup(React.createElement(Component,{report:{...report,history},mode:'student'}));
 assert.ok(html.includes('최근 6개월 개인 성적'));
 assert.ok(html.includes('1/6개월 기록'));
 assert.equal((html.match(/성적 기록 없음/g)||[]).length,5);
 assert.ok(html.includes('0 / 100'));
 assert.ok(html.includes('25%'));
});

test("print-only text stays hidden across the whole report screen, not only inside wrap cells", () => {
  // 인쇄 팝업은 자체 스타일로 다시 켠다. 화면에서 .wrapCell 밖에 두면 버튼 글자와 두 번 찍힌다.
  const css = fs.readFileSync(path.join(root, "components/exams/preview/preview.module.css"), "utf8");
  assert.match(css, /\.reportTables :global\(\.preview-print-only\)\s*\{\s*display: none;/);
  assert.doesNotMatch(css, /\.wrapCell :global\(\.preview-print-only\)/);
  const print = fs.readFileSync(path.join(root, "components/exams/preview/PreviewPrintButton.tsx"), "utf8");
  assert.match(print, /\.preview-print-only \{ display: inline; \}/);
});

test("report styles never draw a thick left accent bar on rows or callouts", () => {
  // DESIGN.md §5.8: 본인·현재 행은 accent-soft 배경과 문구로만, 안내 상자는 1px accent-line 테두리로 알린다.
  const css = fs.readFileSync(path.join(root, "components/exams/preview/preview.module.css"), "utf8");
  assert.doesNotMatch(css, /box-shadow:\s*inset\s+[2-9]px\s+0/);
  assert.doesNotMatch(css, /border-(left|inline-start):\s*[2-9]px/);
  assert.match(css, /\.currentStudent > :is\(td, th\) \{ background: var\(--admin-accent-soft\)/);
});

test("regular personal report: same question tabs as morning plus peers, headline and fail-cutoff verdicts", () => {
  const stub = () => null;
  const { RegularPersonalReport } = load("components/exams/preview/RegularPersonalReport.tsx", {
    "./LearningViews": { TopicLearning: stub, ReviewWorkbench: stub, ExamTimeEntry: stub, LearningPriorities: stub },
    "./RegularLongitudinal": { RegularLongitudinal: stub },
    "./ReferenceItemTable": { ReferenceItemTable: stub },
    "./PreviewCharts": { PreviewTrend: stub },
    "./PreviewPrintButton": { PreviewPrintButton: () => React.createElement("button", null, "인쇄") },
    "./WrongRateTopFive": { WrongRateTopFive: stub },
    "./ReportPaging": { PagedRows: ({ rows, children }: { rows: unknown[]; children: (rows: unknown[]) => React.ReactNode }) => children(rows) },
    "./LearningProvider": { useLearning: () => null },
    "@/components/ui/SlideOver": { SlideOver: ({ open, children }: { open: boolean; children: React.ReactNode }) => open ? children : null },
    "@/components/ui/AdminTabs": { AdminTabs: ({ items, activeId }: { items: { id: string; label: string }[]; activeId: string }) =>
      React.createElement("div", { role: "tablist" }, items.map(i => React.createElement("button", { key: i.id, role: "tab", "aria-selected": i.id === activeId }, i.label))) },
    "@/components/student-view/StudentPortalUi": { PortalMetricCard: ({ label, value }: { label: string; value: string }) => React.createElement("div", null, `${label} ${value}`) },
  });
  const subject = (subjectId: string, name: string, my: number, grade: "우수" | "보통" | "취약") => ({ ...report.stats.subjects[0], subjectId, name, my, fullScore: 100, scoreRate: my, externalAvg: 60, externalRank: 3, grade });
  const regular = { ...report,
    myScore: { total: 120, subjectScores: { a: 30, b: 90 }, isPartial: false },
    ranks: { ...report.ranks, external: { rank: 3, count: 12, topPercent: 25, percentile: 75 } },
    stats: { ...report.stats, external: { ...report.stats.external, average: 110, top30Avg: 150 }, subjects: [subject("a", "과목 A", 30, "보통"), subject("b", "과목 B", 90, "우수")] },
    session: { ...report.session, fullScore: 200 },
    flags: [{ kind: "targetGap" as const, detail: "목표 점수보다 30점 낮습니다." }] };
  const data = { kind: "regular", scope: "student", examType: { id: "type", name: "정기 시험" }, student: { id: "student", name: "학생", studentNumber: "90***" },
    range: { from: "2026-03-01", to: "2026-09-08" }, dates: ["2026-09-08"], subjects: [{ id: "a", name: "과목 A" }, { id: "b", name: "과목 B" }],
    comparisons: [], items: [], easyThreshold: 70, failCutoffPercent: 40, records: [], regular,
    legacyResults: [{ id: "legacy", date: "2026-08-16", total: 65, rank: null, notes: "수기", scores: {} }] };
  const html = renderToStaticMarkup(React.createElement(RegularPersonalReport, { data, mode: "student" }));
  const tabs = Array.from(html.matchAll(/role="tab"[^>]*>([^<]+)</g)).map(m => m[1]);
  assert.deepEqual(tabs, ["요약", "공부할 것", "석차 비교", "점수 변화", "문항"]);
  assert.doesNotMatch(html, /정기 분석 바로가기/, "학생도 섹션 바로가기 대신 탭을 쓴다");
  const panels = Array.from(html.matchAll(/<section id="regular-(\w+)"[^>]*?(hidden="")?[^>]*>/g)).map(m => ({ id: m[1], hidden: m[0].includes('hidden=""') }));
  assert.deepEqual(panels.filter(p => !p.hidden).map(p => p.id), ["summary"], "처음에는 요약 탭만 보인다");
  assert.equal(panels.length, 5);
  assert.match(html, /class="admin-notice admin-notice-danger" data-headline="true">총점 120\/200점 · 12명 중 3위\(상위 25%\) · 과락 과목 A · 과목 A에서 70점을 가장 많이 잃었습니다\.</);
  assert.match(html, /<td class="text-admin-danger">과락<\/td>/);
  assert.match(html, /<td class="text-admin-success">잘하고 있음<\/td>/);
  assert.match(html, /text-admin-danger">30점 낮음</, "차이는 방향을 붙인다");
  assert.match(html, />전체 평균과 차이 10점 높음</);
  assert.match(html, />석차 3위 \/ 12명</);
  assert.doesNotMatch(html, /<details/, "중요한 정보를 접어 두지 않는다");
  assert.ok(html.indexOf("직접 입력한 성적") > html.indexOf('id="regular-history"'), "옛 수기 기록은 첫 화면이 아니라 점수 변화 탭 안");
  assert.match(html, /<h3 class="admin-section-title">직접 입력한 성적 1건<\/h3>/);
  // 목표 미달만으로는 하락 경고가 아니다(총점·석차 하락만 경고).
  const calm = renderToStaticMarkup(React.createElement(RegularPersonalReport, { data: { ...data, regular: { ...regular, stats: { ...regular.stats, subjects: [subject("b", "과목 B", 90, "우수")] } } }, mode: "student" }));
  assert.match(calm, /class="admin-notice" data-headline="true">/);
  const falling = renderToStaticMarkup(React.createElement(RegularPersonalReport, { data: { ...data, regular: { ...regular, stats: { ...regular.stats, subjects: [subject("b", "과목 B", 90, "우수")] }, flags: [{ kind: "rankDrop" as const, detail: "석차 하락" }] } }, mode: "student" }));
  assert.match(falling, /class="admin-notice admin-notice-warning" data-headline="true">/);
});

test("morning personal report: four question tabs, subject table, study list and counseling link", () => {
  const stub = () => null;
  const { MorningPersonalReport } = load("components/exams/preview/MorningPersonalReport.tsx", {
    "./LearningViews": { TopicLearning: stub, ReviewWorkbench: stub, ExamTimeEntry: stub },
    "./PreviewCharts": { PreviewTrend: stub },
    "./PreviewPrintButton": { PreviewPrintButton: () => React.createElement("button", null, "성적표 인쇄") },
    "./WrongRateTopFive": { WrongRateTopFive: stub },
    "./ReportPaging": { ReferenceItemBrowser: stub },
    "./LearningProvider": { useLearning: () => null },
    "@/components/ui/AdminTabs": { AdminTabs: ({ items, activeId }: { items: { id: string; label: string }[]; activeId: string }) =>
      React.createElement("div", { role: "tablist" }, items.map(i => React.createElement("button", { key: i.id, role: "tab", "aria-selected": i.id === activeId }, i.label))) },
    "@/components/student-view/StudentPortalUi": { PortalMetricCard: ({ label, value, caption }: { label: string; value: string; caption?: string }) => React.createElement("div", null, `${label} ${value} ${caption ?? ""}`) },
  });
  const c = (date: string, subjectId: string, subjectName: string, my: number | null) => ({ sessionId: `${date}-${subjectId}`, date, subjectId, subjectName, topic: "진도", fullScore: 100, my, internal: 60, external: 60, top10: null, top30: null, internalCount: 20, externalCount: 200, externalFileCount: 200, internalRank: 3, externalRank: 30 });
  const item = (itemNo: number, answer: string | null, externalRate: number) => ({ id: `c-${itemNo}`, sessionId: "2026-09-23-c", date: "2026-09-23", subjectId: "c", subjectName: "형법", itemNo, answerKey: "2", answer, correct: false, points: 5, externalRate, internalRate: null, responseCount: 0, choices: {}, mostCommonWrong: null });
  // 템플릿 순서: 헌법 → 형소법 → 형법 → 누적(점수 없음) → 경찰학
  const subjects = [{ id: "a", name: "헌법" }, { id: "b", name: "형소법" }, { id: "c", name: "형법" }, { id: "d", name: "누적" }, { id: "e", name: "경찰학" }];
  const data = { kind: "morning", scope: "student", examType: { id: "m", name: "아침 모의고사" }, student: { id: "s", name: "학생", studentNumber: "90***" },
    range: { from: "2026-08-01", to: "2026-09-25" }, dates: [], subjects, items: [item(3, "1", 90), item(5, null, 90)], easyThreshold: 70, failCutoffPercent: 40, records: [],
    comparisons: [c("2026-09-14", "a", "헌법", 80), c("2026-09-21", "a", "헌법", 90), c("2026-09-22", "b", "형소법", 70), c("2026-09-23", "c", "형법", 35), c("2026-09-25", "e", "경찰학", null)],
    morning: { subjects: [], dailyItems: [], topics: [], summary: {}, weeklyRanks: [{ weekYear: 2026, weekNumber: 38, rank: 8, count: 25 }, { weekYear: 2026, weekNumber: 39, rank: 5, count: 25 }] },
    counseling: { from: "2026-08-27", to: "2026-09-25", present: 50, tardy: 2, absent: 1, other: 0, submitted: 20, notSubmitted: 1, rented: 0 } };
  const html = renderToStaticMarkup(React.createElement(MorningPersonalReport, { data, mode: "student" }));
  assert.deepEqual(Array.from(html.matchAll(/role="tab"[^>]*>([^<]+)</g)).map(m => m[1]), ["요약", "공부할 것", "점수 변화", "문항"]);
  assert.equal((html.match(/role="tablist"/g) ?? []).length, 1, "탭 줄은 하나");
  const panels = Array.from(html.matchAll(/<section id="morning-(\w+)"[^>]*>/g)).map(m => ({ id: m[1], hidden: m[0].includes('hidden=""') }));
  assert.deepEqual(panels.filter(p => !p.hidden).map(p => p.id), ["summary"]);
  assert.doesNotMatch(html, /<details/, "중요한 정보를 접어 두지 않는다");
  assert.match(html, /class="admin-notice admin-notice-danger" data-headline="true">형법에서 과락 점수가 있었습니다\. 헌법은 전체 평균보다 25점 높습니다\. 형법이 전체 평균보다 25점 낮아 가장 먼저 복습해야 합니다\.</);
  assert.match(html, /이번 주 학원 석차 5위 \/ 25명 지난주보다 3계단 올라감/);
  assert.match(html, /응시 4 \/ 5회 결시 1회/);
  const table = html.slice(html.indexOf('aria-label="과목별 성적"'));
  assert.deepEqual(Array.from(table.matchAll(/aria-label="([^"]+) 점수 변화 보기"/g)).map(m => m[1]), ["헌법", "형소법", "형법", "누적", "경찰학"], "템플릿 과목 순서 그대로");
  assert.match(table, />9\/14 주<\/th><th[^>]*>9\/21 주<\/th>/);
  assert.match(table, /text-admin-success">25점 높음</);
  assert.match(table, /text-admin-danger">25점 낮음</);
  assert.match(table, /<div class="text-admin-danger">35<\/div>/, "과락 점수는 빨간 글자");
  assert.match(table, /<div>결시<\/div>/, "시험은 있었고 점수 없음");
  assert.match(table, />과락 1회</);
  assert.match(table, />응시 기록 없음</);
  assert.match(table, />시험 없음</);
  const study = html.slice(html.indexOf('aria-label="공부할 것"'));
  assert.match(study, /class="admin-table-link text-admin-danger font-semibold" aria-label="9\/23 형법 3번 문제 보기"/, "많이 맞힌 문제의 오답은 빨간 번호");
  assert.match(study, /class="admin-table-link" aria-label="9\/23 형법 5번 문제 보기"/, "답을 비운 문항은 그 외");
  assert.doesNotMatch(html, /상담 자료 인쇄|출결 요약/, "학생 화면에는 관리자 상담 자료가 없다");
  data.comparisons.push(c("2026-09-24", "c", "형법", 65));
  const repeatedWeek = renderToStaticMarkup(React.createElement(MorningPersonalReport, {data,mode:"student"}));
  assert.match(repeatedWeek, /<span class="admin-help">9\/23 <\/span>35/);
  assert.match(repeatedWeek, /<span class="admin-help">9\/24 <\/span>65/);
  const admin = renderToStaticMarkup(React.createElement(MorningPersonalReport, { data, mode: "admin", division: "police" }));
  assert.match(admin, /href="\/police\/admin\/students\/s\/report\?from=2026-08-01&amp;to=2026-09-25"[^>]*>.*상담 자료 인쇄</, "관리자는 같은 기간의 A4 상담 자료로 이동");
  assert.match(admin, /aria-label="출결 요약"/);
});

test("admin cohort weakness table: risk order, fail cells, summary and personal links", () => {
  const { CohortWeaknessTable } = load("components/exams/preview/CohortWeaknessTable.tsx");
  const subjects = [{ id: "a", name: "헌법", fullScore: 100, itemCount: 20, alternateGroup: null }, { id: "b", name: "형법", fullScore: 100, itemCount: 20, alternateGroup: null }];
  const row = (studentId: string, a: number, b: number, rank: number, flags: { kind: string; detail: string }[] = []) => ({ studentId, name: `학생${studentId}`, studentNumber: `9000${studentId}`, totalScore: a + b, subjectScores: { a, b }, isPartial: false, externalRank: null, externalTopPercent: null, internalRank: rank, delta: null, flags });
  const data = { kind: "regular", scope: "cohort", failCutoffPercent: 40, isPreview: false,
    regularCohort: { subjects, ranking: [row("1", 95, 90, 1), row("2", 90, 30, 3), row("3", 80, 70, 2, [{ kind: "rankDrop", detail: "석차 하락" }])] } };
  const html = renderToStaticMarkup(React.createElement(CohortWeaknessTable, { data, division: "police", query: "kind=regular" }));
  assert.deepEqual(Array.from(html.matchAll(/aria-label="(학생\d) 개인 분석"/g)).map(m => m[1]), ["학생2", "학생3", "학생1"], "과락 → 하락 → 점수 낮은 순");
  assert.match(html, /3명 · 과락 1명 \(형법 1명\) · 하락 1명/);
  assert.match(html, /class="admin-table-amount text-admin-danger">30</);
  assert.match(html, /text-admin-danger">과락 형법 · 최대 손실 형법 70점</);
  assert.match(html, /text-admin-warning">과락 없음 · 최대 손실 형법 30점 · 석차 하락</);
  assert.match(html, /href="\/police\/admin\/exams\/students\/2\?kind=regular"/);
  assert.match(html, /aria-pressed="true"[^>]*>전체 3</);
  const empty = renderToStaticMarkup(React.createElement(CohortWeaknessTable, { data: { ...data, regularCohort: { subjects, ranking: [] } }, division: "police", query: "" }));
  assert.equal(empty, "", "자료가 없으면 아무것도 그리지 않는다");
});

