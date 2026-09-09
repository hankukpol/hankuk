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
import type { MorningStudentReport } from "../../lib/morning-exam-analysis-types";

const root = path.resolve(__dirname, "../..");
// Actual UI markup with geometry and unrelated portal services stubbed.
// This is behavioural render coverage, not browser layout evidence.
function load(file: string, overrides: Record<string, unknown> = {}, globals: Record<string, unknown> = {}): Record<string, any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const filename = path.resolve(root, file);
  const loaded = { exports: {} };
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
      return load(fs.existsSync(path.resolve(root, `${local}.tsx`)) ? `${local}.tsx` : `${local}.ts`, overrides, globals);
    },
  });
  return loaded.exports;
}

const subject = { id: "a", name: "과목 A", fullScore: 100, itemCount: 20, alternateGroup: null };
const report: MorningStudentReport = {
  student: { id: "own", name: "관리자전용이름", studentNumber: "90***" }, examType: { id: "morning", name: "아침 시험" }, subjectDefinitions: [subject],
  range: { from: "2026-06-17", to: "2026-09-08" }, settings: { ...DEFAULT_EXAM_ANALYSIS_SETTINGS, morning: { ...DEFAULT_EXAM_ANALYSIS_SETTINGS.morning, movingAverageSessions: 6, trendWindowSessions: 12 } },
  summary: { average: 50, externalGap: -10, internalGap: -5, attendanceRatePercent: 100, thisWeekRank: null, rankDelta: null, attended: 1, expected: 1 },
  subjects: [{ subjectId: "a", name: "과목 A", average: 50, externalAvg: 60, internalAvg: 55, gap: -5, stdDev: 0, slope: null, consecutiveDrops: 0, flags: [], attended: 1, expected: 1, attendanceRatePercent: 100, insufficientSample: true, requiredSessions: 6, series: [{ date: "2026-09-08", score: 50, ma: 50, classMa: 55, topic: null }] }],
  topics: [], dailyItems: [], cumulativeGap: null, weeklyRanks: [],
};


test("paper review uses identical student/admin evidence and excludes inferred topic weaknesses", () => {
 const Component=load("components/exams/analysis/MorningStudentReport.tsx").MorningStudentReport;
 const item={subjectId:"a",itemNo:12,position:1,answerKey:"1",answer:"2",isCorrect:false,externalCorrectRatePct:80,internalCorrectRatePct:60,difficulty:"쉬움"};
 const diagnostics={list:[item],easyMissed:[item],killerTop5:[],summary:{total:1,correct:0,wrong:1,unanswered:0,myCorrectRate:0,killerTotal:0,killerCorrect:0,killerConquerRate:0}};
 const data={...report,topics:[{topic:"추측하면안되는단원",subjectId:"a",count:2,myAvg:20,internalAvg:80,gap:-60}],dailyItems:[{date:"2026-09-08",subjectId:"a",subjectName:"과목 A",topic:null,diagnostics,easyMissed:[item],wrongTop5:[],external:{rank:3,count:20,topPercent:15,percentile:87.5}}]};
 const student=renderToStaticMarkup(React.createElement(Component,{report:data,mode:"student"}));
 const admin=renderToStaticMarkup(React.createElement(Component,{report:data,mode:"admin"}));
 for(const html of [student,admin]){assert.ok(html.includes("먼저 복습할 문항"));assert.ok(html.includes("과목별 복습 기록"));assert.ok(!html.includes("추측하면안되는단원"));assert.ok(!html.includes("단원별 취약"));assert.ok(html.includes("전체 채점표 (1문항)"));}
 const extract=(html:string)=>html.match(/<article[^>]*data-paper-review[\s\S]*?<\/article>/g);
 assert.deepEqual(extract(student),extract(admin));assert.ok(extract(student)?.length);
 assert.ok(!student.includes("A4 인쇄 / PDF 저장"));assert.ok(admin.includes("A4 인쇄 / PDF 저장"));
});
