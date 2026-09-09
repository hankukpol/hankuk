import assert from "node:assert/strict";
import test from "node:test";
import { defaultMorningAnalysisRange, morningAnalysisQuerySchema, morningAnalysisRangeSchema } from "../../lib/morning-exam-analysis-schemas";

test("morning range defaults to 84 calendar days using Seoul date", () => {
  assert.deepEqual(defaultMorningAnalysisRange(new Date("2026-09-08T16:00:00Z")), { from: "2026-06-18", to: "2026-09-09" });
  assert.ok(morningAnalysisQuerySchema.safeParse({ examTypeId: "type" }).success);
});
test("morning range rejects impossible, reversed and excessive dates", () => {
  for (const range of [{ from: "2026-02-29", to: "2026-03-01" }, { from: "2026-03-01", to: "2026-02-01" }, { from: "2026-01-01", to: "2026-04-04" }]) {
    assert.equal(morningAnalysisRangeSchema.safeParse(range).success, false);
  }
  assert.ok(morningAnalysisRangeSchema.safeParse({ from: "2026-01-01", to: "2026-04-03" }).success);
  assert.equal(morningAnalysisQuerySchema.safeParse({ examTypeId: " " }).success, false);
});
