import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportDocumentProvider } from "../../components/exams/analysis/ReportPresentation";
import { SubjectScoreComparison, AnswerBreakdown } from "../../components/exams/analysis/charts/SubjectInsightCharts";

Object.assign(globalThis, { React });
const render = (child: React.ReactNode) => renderToStaticMarkup(React.createElement(ReportDocumentProvider, { value: true }, child));

test("comparison distinguishes a zero score from unavailable averages", () => {
  const html = render(React.createElement(SubjectScoreComparison, { name: "헌법", mine: 0, external: null, internal: 30, maximum: 50 }));
  assert.match(html, /내 점수 0점/);
  assert.match(html, /외부 평균 자료 없음/);
  assert.match(html, /외부 평균과 비교할 자료가 부족/);
  assert.doesNotMatch(html, /낮습니다/);
});

test("answer chart has explicit numbers, percentages and an empty state", () => {
  const html = render(React.createElement(AnswerBreakdown, { correct: 7, wrong: 2, unanswered: 1 }));
  assert.match(html, /정답 7개, 오답 2개, 무응답 1개/);
  assert.match(html, /70/);
  assert.match(render(React.createElement(AnswerBreakdown, { correct: 0, wrong: 0, unanswered: 0 })), /문항 결과가 없어/);
});
