import assert from "node:assert/strict";
import test from "node:test";
import { movingAverage, trendSlope, consistency, detectMorningDecline, findCumulativeSubject, type SessionPoint } from "../../lib/exam-analysis-meta";
import { DEFAULT_EXAM_ANALYSIS_SETTINGS } from "../../lib/exam-analysis-settings";

const points = (scores: number[]): SessionPoint[] => scores.map((score, index) => ({ date: `2026-${String(index + 1).padStart(2, "0")}-01`, score }));
function input(scores: number[]) {
  return { series: points(scores), classSeries: [] as SessionPoint[], expectedSessions: scores.length,
    fullScore: 200, settings: structuredClone(DEFAULT_EXAM_ANALYSIS_SETTINGS) };
}
const kinds = (value: ReturnType<typeof input>) => detectMorningDecline(value).map(flag => flag.kind);
const near = (actual: number | null, expected: number) => {
  assert.notEqual(actual, null);
  assert.ok(Math.abs(actual! - expected) < 1e-10, `${actual} != ${expected}`);
};

test("empty and single attempt math; absent scores never become zero", () => {
  assert.deepEqual(movingAverage([], 4), []);
  assert.equal(trendSlope([], 4), null);
  assert.equal(consistency([]), null);
  assert.deepEqual(movingAverage(points([7]), 4), [{ date: "2026-01-01", value: 7 }]);
  assert.equal(trendSlope(points([7]), 4), null);
  assert.equal(consistency(points([7])), 0);
  const missing = points([Number.NaN, Infinity, -Infinity]);
  // Defensive runtime input: persisted absence must not count as a zero attempt.
  missing.push({ date: "2026-04-01", score: null as unknown as number });
  assert.deepEqual(movingAverage(missing, 3), []);
  assert.equal(trendSlope(missing, 3), null);
  assert.equal(consistency(missing), null);
  assert.deepEqual(movingAverage([...missing, ...points([0])], 3), points([0]).map(p => ({ date: p.date, value: 0 })));
});

test("moving averages use chronological attempts, short and exact windows, and raw precision", () => {
  const series = points([1, 2, 8, 13]).reverse(), before = structuredClone(series);
  assert.deepEqual(movingAverage(series, 2).map(p => p.value), [1, 1.5, 5, 10.5]);
  assert.deepEqual(movingAverage(series, 1).map(p => p.value), [1, 2, 8, 13]);
  near(movingAverage(series, 9)[2].value, 11 / 3);
  assert.deepEqual(series, before);
});

test("least squares uses session indices and only the requested suffix", () => {
  assert.equal(trendSlope(points([1000, 6, 4, 2]), 3), -2);
  assert.equal(trendSlope(points([2, 4, 6]).reverse(), 3), 2);
  assert.equal(trendSlope(points([7, 7]), 8), 0);
  assert.equal(trendSlope(points([1, 2]), 1), null);
  near(trendSlope(points([1, 2, 4]), 9), 1.5);
  const irregular = [{ date: "2020-01-01", score: 2 }, { date: "2026-01-01", score: 4 }, { date: "2026-01-02", score: 6 }];
  assert.equal(trendSlope(irregular, 3), 2);
});

test("consistency is population deviation with no rounding", () => {
  near(consistency(points([2, 4, 4, 4, 5, 5, 7, 9])), 2);
  near(consistency(points([0, 1])), 0.5);
  near(consistency(points([0, 1, 2])), Math.sqrt(2 / 3));
  assert.equal(consistency(points([0, 0])), 0);
});

for (const window of [0, -1, 1.5, NaN, Infinity]) test(`invalid session window ${window} is rejected`, () => {
  assert.throws(() => movingAverage([], window), RangeError);
  assert.throws(() => trendSlope([], window), RangeError);
});

test("low attendance suppresses every other flag and compares raw percentages", () => {
  const value = input([180, 170, 160, 150, 140, 130]);
  value.classSeries = points([200, 200, 200, 200, 200, 200]);
  value.expectedSessions = 10;
  assert.deepEqual(kinds(value), ["lowAttendance"]);
  value.settings.morning.attendanceRatePercent = 60;
  assert.deepEqual(kinds(value), ["consecutiveDrops", "classGap", "ownAverageDrop"]);
  value.settings.morning.attendanceRatePercent = 60.001;
  assert.deepEqual(kinds(value), ["lowAttendance"]);
  const third = input([1, 1]); third.expectedSessions = 3;
  third.settings.morning.attendanceRatePercent = 66.67;
  assert.deepEqual(kinds(third), ["lowAttendance"]);
});

test("no scheduled sessions and no attempts have defined empty behavior", () => {
  for (const expected of [0, -1, NaN, Infinity]) {
    const value = input([3, 2, 1]); value.expectedSessions = expected;
    assert.deepEqual(kinds(value), []);
  }
  const empty = input([]); empty.expectedSessions = 2;
  assert.deepEqual(kinds(empty), ["lowAttendance"]);
  empty.settings.morning.attendanceRatePercent = 0;
  assert.deepEqual(kinds(empty), []);
  const invalid = input([NaN, Infinity]); invalid.expectedSessions = 2;
  assert.deepEqual(kinds(invalid), ["lowAttendance"]);
});

test("consecutive declines need N+1 points, strict decreases, and the latest suffix", () => {
  for (const [scores, expected] of [
    [[4, 3, 2], false], [[4, 3, 2, 1], true], [[4, 3, 3, 1], false],
    [[4, 2, 3, 1], false], [[5, 4, 3, 2, 3], false], [[1, 5, 4, 3, 2], true],
  ] as const) assert.equal(kinds(input([...scores])).includes("consecutiveDrops"), expected);
  const value = input([3, 2, 1]); value.settings.morning.consecutiveDrops = 2;
  assert.ok(kinds(value).includes("consecutiveDrops"));
  value.settings.morning.consecutiveDrops = 4;
  assert.ok(!kinds(value).includes("consecutiveDrops"));
});

test("class gap matches the student's attended dates, ignoring other class dates", () => {
  const value = input([60, 60]);
  value.classSeries = [...points([90, 90]), { date: "2026-03-01", score: 0 }, { date: "2026-04-01", score: 0 }];
  assert.deepEqual(kinds(value), ["classGap"]);
  value.classSeries = [...points([60, 60]), { date: "2026-03-01", score: 200 }, { date: "2026-04-01", score: 200 }];
  assert.deepEqual(kinds(value), []);
});

test("missing class dates skip gap instead of backfilling or changing the denominator", () => {
  const value = input([60, 60, 60]); value.settings.morning.movingAverageSessions = 2;
  value.classSeries = [points([200])[0], points([0, 200, 200])[2]];
  assert.deepEqual(kinds(value), []);
  value.classSeries.push(points([0, NaN])[1]);
  assert.deepEqual(kinds(value), []);
  value.classSeries = points([0, 90, 90]);
  assert.deepEqual(kinds(value), ["classGap"]);
});

test("acceptance: changing class gap setting from 20 to 15 immediately changes the same input result", () => {
  const value = input([60, 60, 60, 60]);
  value.classSeries = points([90, 90, 90, 90]);
  const originalSeries = structuredClone({ series: value.series, classSeries: value.classSeries });
  value.settings.morning.classGapPercent = 20;
  assert.deepEqual(kinds(value), []);
  value.settings.morning.classGapPercent = 15;
  assert.deepEqual(kinds(value), ["classGap"]);
  value.settings.morning.classGapPercent = 20;
  assert.deepEqual(kinds(value), []);
  assert.deepEqual({ series: value.series, classSeries: value.classSeries }, originalSeries);
});

test("class gap threshold is inclusive, uses supplied full score and unrounded means", () => {
  const value = input([60, 60]); value.classSeries = points([90, 90]);
  assert.deepEqual(kinds(value), ["classGap"]);
  value.classSeries = points([89.999, 89.999]);
  assert.deepEqual(kinds(value), []);
  value.settings.morning.classGapPercent = 14;
  assert.deepEqual(kinds(value), ["classGap"]);
  value.fullScore = 400;
  assert.deepEqual(kinds(value), []);
});

test("class moving window changes dynamically and partial windows use available attempts", () => {
  const value = input([0, 0, 60, 60]); value.classSeries = points([0, 0, 90, 90]);
  value.settings.morning.movingAverageSessions = 4;
  assert.deepEqual(kinds(value), []);
  value.settings.morning.movingAverageSessions = 2;
  assert.deepEqual(kinds(value), ["classGap"]);
  const single = input([60]); single.classSeries = points([90]);
  assert.deepEqual(kinds(single), ["classGap"]);
});

test("own average requires three recent plus at least three earlier attempts", () => {
  assert.ok(!kinds(input([100, 100, 0, 0, 0])).includes("ownAverageDrop"));
  assert.ok(kinds(input([100, 100, 100, 0, 0, 0])).includes("ownAverageDrop"));
  for (let length = 0; length < 6; length++) {
    const value = input(Array.from({ length }, (_, i) => 100 - i * 10));
    assert.ok(!kinds(value).includes("ownAverageDrop"));
  }
});

test("own average previous window excludes recent three and older outliers", () => {
  const value = input([200, 80, 80, 80, 60, 60, 60]);
  value.settings.morning.trendWindowSessions = 3;
  assert.deepEqual(kinds(value), ["ownAverageDrop"]);
  value.settings.morning.ownAverageDropPercent = 10.001;
  assert.deepEqual(kinds(value), []);
  value.settings.morning.trendWindowSessions = 4;
  assert.deepEqual(kinds(value), ["ownAverageDrop"]);
  value.settings.morning.ownAverageDropPercent = 30;
  assert.deepEqual(kinds(value), []);
});

test("own average threshold and full score are dynamic and evaluated before rounding", () => {
  const value = input([80, 80, 80, 60, 60, 60]);
  assert.deepEqual(kinds(value), ["ownAverageDrop"]);
  value.series = points([80, 80, 80, 60.001, 60.001, 60.001]);
  assert.deepEqual(kinds(value), []);
  value.settings.morning.ownAverageDropPercent = 9;
  assert.deepEqual(kinds(value), ["ownAverageDrop"]);
  value.fullScore = 400;
  assert.deepEqual(kinds(value), []);
});

test("zero percent thresholds follow inclusive handoff comparisons", () => {
  const value = input([40, 40, 40, 40, 40, 40]); value.classSeries = points([40, 40, 40, 40, 40, 40]);
  value.settings.morning.classGapPercent = 0; value.settings.morning.ownAverageDropPercent = 0;
  assert.deepEqual(kinds(value), ["classGap", "ownAverageDrop"]);
  value.series = points([40, 40, 40, 41, 41, 41]);
  assert.deepEqual(kinds(value), []);
});

test("invalid full score suppresses percentage gaps but preserves sequence declines", () => {
  for (const fullScore of [0, -1, NaN, Infinity]) {
    const value = input([6, 5, 4, 3, 2, 1]); value.fullScore = fullScore;
    value.classSeries = points([200, 200, 200, 200, 200, 200]);
    assert.deepEqual(kinds(value), ["consecutiveDrops"]);
  }
});

test("all morning calculations preserve inputs, accept unsorted dates and return Korean details", () => {
  const value = input([180, 170, 160, 150, 140, 130]); value.series.reverse();
  value.classSeries = points([200, 200, 200, 200, 200, 200]).reverse();
  const before = structuredClone(value);
  movingAverage(value.series, 4); trendSlope(value.series, 4); consistency(value.series);
  const result = detectMorningDecline(value);
  assert.deepEqual(result.map(f => f.kind), ["consecutiveDrops", "classGap", "ownAverageDrop"]);
  assert.ok(result.every(f => /[가-힣]/.test(f.detail) && !/NaN|Infinity|\uFFFD/.test(f.detail)));
  assert.deepEqual(value, before);
});

test("cumulative lookup uses only item count, preserves generic identity and first-match order", () => {
  const subjects = [
    { id: "a", name: "임의 과목", totalItems: 99 },
    { id: "b", name: "다른 과목", totalItems: 100 },
    { id: "c", name: "세 번째", totalItems: 101 },
  ] as const;
  assert.equal(findCumulativeSubject(subjects), subjects[1]);
  assert.equal(findCumulativeSubject(subjects.slice(2)), subjects[2]);
  assert.equal(findCumulativeSubject([]), null);
  assert.equal(findCumulativeSubject([{ totalItems: 99 }, { totalItems: null }, {}, { totalItems: Infinity }, { totalItems: NaN }]), null);
});
