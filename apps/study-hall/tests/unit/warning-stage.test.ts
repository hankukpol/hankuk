import assert from "node:assert/strict";
import test from "node:test";

import {
  getNextWarningStage,
  getWarningStage,
  type WarningThresholds,
} from "../../lib/student-meta";

const thresholds: WarningThresholds = {
  warnLevel1: 10,
  warnLevel2: 20,
  warnInterview: 25,
  warnWithdraw: 30,
};

test("next warning stage counts down to the first threshold the student has not reached", () => {
  assert.deepEqual(getNextWarningStage(0, thresholds), {
    stage: "WARNING_1",
    label: "1차 경고",
    threshold: 10,
    pointsRemaining: 10,
  });

  assert.deepEqual(getNextWarningStage(21, thresholds), {
    stage: "INTERVIEW",
    label: "면담 대상",
    threshold: 25,
    pointsRemaining: 4,
  });
});

test("a student sitting exactly on a threshold is already in that stage, so the next one is counted", () => {
  // 경계값은 getWarningStage 와 같은 방향으로 읽어야 한다.
  // 10점이면 이미 1차 경고이므로 남은 안내는 2차까지다.
  assert.equal(getWarningStage(10, thresholds), "WARNING_1");
  assert.deepEqual(getNextWarningStage(10, thresholds), {
    stage: "WARNING_2",
    label: "2차 경고",
    threshold: 20,
    pointsRemaining: 10,
  });

  assert.equal(getWarningStage(9, thresholds), "NORMAL");
  assert.equal(getNextWarningStage(9, thresholds)?.stage, "WARNING_1");
});

test("every threshold boundary hands off to the following stage", () => {
  for (const [points, expected] of [
    [10, "WARNING_2"],
    [20, "INTERVIEW"],
    [25, "WITHDRAWAL"],
  ] as const) {
    assert.equal(
      getNextWarningStage(points, thresholds)?.stage,
      expected,
      `${points}점에서 다음 단계`,
    );
  }
});

test("reaching the last stage returns null — there is nothing left to warn about", () => {
  assert.equal(getNextWarningStage(30, thresholds), null);
  assert.equal(getNextWarningStage(45, thresholds), null);
});

test("management policy labels override the default stage names", () => {
  const labels = { WARNING_2: "정식면담", WITHDRAWAL: "이용종료" };

  assert.equal(getNextWarningStage(10, thresholds, labels)?.label, "정식면담");
  // 덮어쓰지 않은 단계는 기본 이름을 그대로 쓴다.
  assert.equal(getNextWarningStage(0, thresholds, labels)?.label, "1차 경고");
});

test("thresholds come from division settings, so a different division counts differently", () => {
  const strict: WarningThresholds = {
    warnLevel1: 3,
    warnLevel2: 6,
    warnInterview: 9,
    warnWithdraw: 12,
  };

  assert.deepEqual(getNextWarningStage(4, strict), {
    stage: "WARNING_2",
    label: "2차 경고",
    threshold: 6,
    pointsRemaining: 2,
  });
});
