import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";

import { DEFAULT_EXAM_ANALYSIS_SETTINGS } from "../../lib/exam-analysis-settings";
import { itemDiagnostics } from "../../lib/exam-analysis-meta";
import type { MorningStudentReport } from "../../lib/morning-exam-analysis-types";

const root = path.resolve(__dirname, "../..");
function load(file: string, overrides: Record<string, unknown> = {}): Record<string, any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const filename = path.resolve(root, file);
  const loaded = { exports: {} };
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  });
  assert.equal(compiled.diagnostics?.length ?? 0, 0);
  vm.runInNewContext(compiled.outputText, {
    module: loaded,
    exports: loaded.exports,
    require(name: string) {
      if (name in overrides) return overrides[name];
      if (name === "react") return React;
      if (name === "react/jsx-runtime") return jsx;
      if (name === "recharts") return new Proxy({}, { get: () => ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children) });
      const local = name.startsWith("@/") ? name.slice(2) : path.relative(root, path.resolve(path.dirname(filename), name));
      return load(fs.existsSync(path.resolve(root, `${local}.tsx`)) ? `${local}.tsx` : `${local}.ts`, overrides);
    },
  });
  return loaded.exports;
}

const subject = { id: "law", name: "법", fullScore: 100, itemCount: 2, alternateGroup: null };
const diagnosticItems = [1, 2].map((itemNo) => ({
  subjectId: "law", itemNo, position: itemNo, answerKey: "1", externalCorrectRatePct: 80, internalCorrectRatePct: 50,
}));

function report(overrides: Partial<MorningStudentReport> = {}): MorningStudentReport {
  return {
    student: { id: "student", name: null, studentNumber: "12***" },
    examType: { id: "morning", name: "아침 시험" },
    subjectDefinitions: [subject],
    range: { from: "2026-09-01", to: "2026-09-02" },
    settings: DEFAULT_EXAM_ANALYSIS_SETTINGS,
    summary: { average: 50, externalGap: 0, internalGap: 0, attendanceRatePercent: 50, thisWeekRank: null, rankDelta: null, attended: 1, expected: 2 },
    subjects: [{ subjectId: "law", name: "법", average: 50, externalAvg: 50, internalAvg: 50, gap: 0, stdDev: 0, slope: 0, consecutiveDrops: 0, flags: [], attended: 2, expected: 2, attendanceRatePercent: 100, insufficientSample: false, requiredSessions: 2, series: [] }],
    topics: [], dailyItems: [], cumulativeGap: null, weeklyRanks: [],
    ...overrides,
  };
}

test("paper review excludes missing rows but retains an explicit blank answer", () => {
  const diagnostics = itemDiagnostics(diagnosticItems, [
    { subjectId: "law", itemNo: 2, answer: null, isCorrect: false },
  ], DEFAULT_EXAM_ANALYSIS_SETTINGS.common);
  const data = report({
    dailyItems: [{ date: "2026-09-02", subjectId: "law", subjectName: "법", topic: null, diagnostics, easyMissed: diagnostics.easyMissed, wrongTop5: diagnostics.killerTop5, external: { rank: null, count: 0, topPercent: null, percentile: null } }],
  });
  const Component = load("components/exams/analysis/MorningStudentReport.tsx").MorningStudentReport;
  const html = renderToStaticMarkup(React.createElement(Component, { report: data, mode: "student" }));
  const paper = html.match(/<article[^>]*data-paper-review[\s\S]*?<\/article>/)?.[0] ?? "";

  assert.ok(paper.includes("무응답 번호"));
  assert.ok(paper.includes("<dd>2</dd>"));
  assert.ok(!paper.includes("1, 2"));
  assert.ok(html.includes("<th scope=\"row\">2026-09-02</th><td>0%</td><td>0개</td><td>1개</td><td>0개</td>"));
});

test("trend withholding names the overall and subject attendance causes separately", () => {
  const Component = load("components/exams/analysis/MorningStudentReport.tsx").MorningStudentReport;
  const overall = renderToStaticMarkup(React.createElement(Component, { report: report(), mode: "student" }));
  assert.ok(overall.includes("전체 응시 기록이 부족하여 추세와 하락을 판단하지 않습니다."));
  assert.ok(!overall.includes("기준 70%"));

  const subjectLow = report({
    summary: { ...report().summary, attendanceRatePercent: 100 },
    subjects: [{ ...report().subjects[0], attended: 1, expected: 2, attendanceRatePercent: 50 }],
  });
  const subjectHtml = renderToStaticMarkup(React.createElement(Component, { report: subjectLow, mode: "student" }));
  assert.ok(subjectHtml.includes("이 과목의 응시 기록이 부족하여 추세와 하락을 판단하지 않습니다."));
  assert.ok(!subjectHtml.includes("기준 70%"));
});
