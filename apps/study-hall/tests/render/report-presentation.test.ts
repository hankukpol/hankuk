import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportDocumentProvider, ReportMetrics } from "../../components/exams/analysis/ReportPresentation";
import { SubjectTabs } from "../../components/exams/analysis/LearningActionSummary";

// The CLI JSX transform uses the classic runtime; Next.js uses the automatic runtime.
Object.assign(globalThis, { React });

test("admin metrics are a semantic table and student metrics retain their existing layout", () => {
  const metrics = createElement(ReportMetrics, { entries: [["점수", "0"], ["판정", "집계 불가"]] });
  const admin = renderToStaticMarkup(createElement(ReportDocumentProvider, { value: true }, metrics));
  assert.match(admin, /<table/);
  assert.match(admin, /scope="row">점수/);
  assert.match(admin, />0<\/td>/);
  assert.match(admin, /집계 불가/);
  assert.doesNotMatch(admin, /admin-metric-strip/);
  const student = renderToStaticMarkup(metrics);
  assert.match(student, /admin-metric-strip/);
  assert.doesNotMatch(student, /<table/);
});

test("admin subject dropdown selects exactly one subject without an all-subject option", () => {
  const subjects = createElement(SubjectTabs, { subjects: [{ id: "a", name: "과목 A", content: "결과 A" }, { id: "b", name: "과목 B", content: "결과 B" }] });
  const admin = renderToStaticMarkup(createElement(ReportDocumentProvider, { value: true }, subjects));
  assert.match(admin, /<select/);
  assert.doesNotMatch(admin, /전체 과목|option value=""/);
  assert.match(admin, /hidden=""/);
  assert.doesNotMatch(admin, /aria-pressed/);
  assert.match(admin, /결과 A/);
  assert.match(admin, /결과 B/);
  assert.match(renderToStaticMarkup(subjects), /hidden=""/);
});
