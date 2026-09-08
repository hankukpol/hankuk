import assert from "node:assert/strict";
import test from "node:test";
import { formatExamDateLabel } from "../../lib/exam-date-label";

test("date-backed legacy labels show an actual date, preserving ordinary manual labels", () => {
  assert.equal(formatExamDateLabel("시험 A 20260815회"), "시험 A 2026-08-15");
  assert.equal(formatExamDateLabel("시험 A 20240229회"), "시험 A 2024-02-29");
  for (const label of ["", "시험 A 3회", "시험 A 20260229회", "시험 A 20261301회", "시험 A 2026-08-15"]) assert.equal(formatExamDateLabel(label), label);
});
