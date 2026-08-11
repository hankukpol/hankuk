import assert from "node:assert/strict";
import { validateAnswerPattern } from "../src/lib/answer-validation";

const balancedAnswers = Array.from({ length: 100 }, (_, index) => ((index * 3 + Math.floor(index / 7)) % 4) + 1);

const clear = validateAnswerPattern({
  answers: balancedAnswers,
  totalScore: 180,
  maxScore: 250,
  submitDurationMs: 120_000,
});
assert.equal(clear.status, "CLEAR");
assert.equal(clear.isSuspicious, false);

const fastBoundary = validateAnswerPattern({
  answers: balancedAnswers,
  totalScore: 180,
  maxScore: 250,
  submitDurationMs: 119_999,
});
assert.equal(fastBoundary.status, "REVIEW");
assert.equal(fastBoundary.isSuspicious, false);
assert.match(fastBoundary.reviewReasons.join(" "), /119초/);

const editWithoutTiming = validateAnswerPattern({
  answers: balancedAnswers,
  totalScore: 180,
  maxScore: 250,
  submitDurationMs: null,
});
assert.equal(editWithoutTiming.status, "CLEAR");

const lowScore = validateAnswerPattern({
  answers: balancedAnswers,
  totalScore: 20,
  maxScore: 250,
  submitDurationMs: 180_000,
});
assert.equal(lowScore.status, "REVIEW");
assert.equal(lowScore.isSuspicious, false);

const repeated = validateAnswerPattern({
  answers: Array.from({ length: 100 }, (_, index) => (index % 2) + 1),
  totalScore: null,
  maxScore: 250,
  submitDurationMs: 180_000,
});
assert.equal(repeated.status, "EXCLUDED");
assert.equal(repeated.isSuspicious, true);

const pendingFast = validateAnswerPattern({
  answers: balancedAnswers,
  totalScore: null,
  maxScore: 250,
  submitDurationMs: 60_000,
});
assert.equal(pendingFast.status, "REVIEW");

const fireMinimum = validateAnswerPattern({
  answers: balancedAnswers.slice(0, 75),
  totalScore: 210,
  maxScore: 300,
  submitDurationMs: 90_000,
});
assert.equal(fireMinimum.status, "CLEAR");

console.log("submission-suspicion-test: passed");
