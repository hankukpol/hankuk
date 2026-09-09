import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_EXAM_ANALYSIS_SETTINGS } from "../../lib/exam-analysis-settings";
import { itemDiagnostics } from "../../lib/exam-analysis-meta";
import { morningLearningPlan, reviewBuckets } from "../../lib/exam-learning-plan";
import type { MorningStudentReport } from "../../lib/morning-exam-analysis-types";

const items = [1, 2].map((itemNo) => ({
  subjectId: "law",
  itemNo,
  position: itemNo,
  answerKey: "1",
  externalCorrectRatePct: 80,
  internalCorrectRatePct: 50,
}));

test("missing response rows stay unknown while an explicit blank remains unanswered", () => {
  const diagnostics = itemDiagnostics(items, [
    { subjectId: "law", itemNo: 2, answer: null, isCorrect: false },
  ], DEFAULT_EXAM_ANALYSIS_SETTINGS.common);

  assert.deepEqual(diagnostics.responseCorrectness, [
    { subjectId: "law", itemNo: 1, correctness: null },
    { subjectId: "law", itemNo: 2, correctness: false },
  ]);
  assert.deepEqual(diagnostics.summary, {
    total: 1, correct: 0, wrong: 0, unanswered: 1, myCorrectRate: 0,
    killerTotal: 0, killerCorrect: 0, killerConquerRate: 0,
  });
  assert.deepEqual(diagnostics.easyMissed.map((row) => row.itemNo), [2]);
  const buckets = reviewBuckets(diagnostics.list, diagnostics.responseCorrectness);
  assert.deepEqual(buckets.easyWrong.map((row) => row.itemNo), []);
  assert.deepEqual(buckets.unanswered.map((row) => row.itemNo), [2]);
  assert.deepEqual(buckets.otherWrong.map((row) => row.itemNo), []);
});

test("morning review omits days with no response evidence and keeps explicit blanks", () => {
  const missing = itemDiagnostics([items[0]], [], DEFAULT_EXAM_ANALYSIS_SETTINGS.common);
  const blank = itemDiagnostics([items[1]], [
    { subjectId: "law", itemNo: 2, answer: "", isCorrect: false },
  ], DEFAULT_EXAM_ANALYSIS_SETTINGS.common);
  const report = {
    subjects: [{ subjectId: "law", name: "법", insufficientSample: false, attendanceRatePercent: 100 }],
    summary: { attendanceRatePercent: 100 },
    settings: { morning: { attendanceRatePercent: 70 } },
    topics: [],
    dailyItems: [
      { subjectId: "law", date: "2026-09-01", topic: null, diagnostics: missing },
      { subjectId: "law", date: "2026-09-02", topic: null, diagnostics: blank },
    ],
  } as unknown as MorningStudentReport;

  const [plan] = morningLearningPlan(report);
  assert.deepEqual(plan.tasks.map((task) => task.date), ["2026-09-02"]);
  assert.deepEqual(plan.tasks[0].unanswered.map((row) => row.itemNo), [2]);
  assert.equal(plan.unansweredCount, 1);
});
