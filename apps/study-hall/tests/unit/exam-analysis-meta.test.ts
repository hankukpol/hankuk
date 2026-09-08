import assert from "node:assert/strict";
import test from "node:test";
import {
  rankWithTies, topPercent, percentileRank, gradeSubject, balanceAssessment,
  buildDistributionBins, topGroupAverage, buildAdvice, itemDiagnostics, detectRegularDecline,
  type ScoreRow, type SubjectStat, type ItemDiagnosticRow,
} from "../../lib/exam-analysis-meta";
import { computeFullScore } from "../../lib/exam-analysis-meta";
import { DEFAULT_EXAM_ANALYSIS_SETTINGS } from "../../lib/exam-analysis-settings";

test("Phase1 full score retains choose-one and inactive subject behavior", () => {
  assert.equal(computeFullScore([
    { totalItems: 20, pointsPerItem: 2.5, alternateGroup: "choice" },
    { totalItems: 20, pointsPerItem: 2.5, alternateGroup: "choice" },
    { totalItems: 40, pointsPerItem: 2.5 }, { totalItems: 40, pointsPerItem: 2.5 },
    { totalItems: 10, pointsPerItem: 5, isActive: false },
  ]), 250);
});

test("competition ranks sort by supplied key without mutating input", () => {
  const rows: ScoreRow[] = [80, 90, 90].map((total, id) => ({ id: String(id), total, subjectScores: { a: 100 - total } }));
  const before = structuredClone(rows);
  assert.deepEqual(Array.from(rankWithTies(rows, (row) => row.total)), [["1", 1], ["2", 1], ["0", 3]]);
  assert.deepEqual(Array.from(rankWithTies(rows, (row) => row.subjectScores.a)), [["0", 1], ["1", 2], ["2", 2]]);
  assert.deepEqual(rows, before);
  assert.equal(rankWithTies([], (row) => row.total).size, 0);
});

test("top percent rounds and obeys handoff clamping", () => {
  assert.equal(topPercent(1, 3), 33.3);
  assert.equal(topPercent(0, 3), 0);
  assert.equal(topPercent(-1, 3), 0);
  assert.equal(topPercent(4, 3), 100);
  assert.equal(topPercent(1, 0), 100);
});

for (const fixture of [
  { values: [90, 90, 80], mine: 90, expected: 66.7 },
  { values: [10, 20, 30, 40, 50, 60, 70, 80], mine: 60, expected: 68.8 },
  { values: Array.from({ length: 320 }, (_, index) => index + 1), mine: 240, expected: 74.8 },
]) test(`reference percentile fixture n=${fixture.values.length}`, () => {
  assert.equal(percentileRank(fixture.values, fixture.mine), fixture.expected);
});
test("percentile empty and fully tied cohorts", () => {
  assert.equal(percentileRank([], 10), 0);
  assert.equal(percentileRank([20, 20, 20], 20), 50);
});

test("subject grades at score rate and top percent boundaries", () => {
  for (const n of [8, 9]) for (const [my, grade] of [[80, "우수"], [79.9, "보통"], [60, "보통"], [59.9, "취약"]] as const) {
    assert.deepEqual(gradeSubject({ my, fullScore: 100, topPercent: 1, n }), { grade, basis: "scoreRate", scoreRate: my });
  }
  for (const n of [10, 12]) for (const [top, grade] of [[30, "우수"], [30.1, "보통"], [60, "보통"], [60.1, "취약"]] as const) {
    assert.deepEqual(gradeSubject({ my: 40, fullScore: 50, topPercent: top, n }), { grade, basis: "percentile", scoreRate: 80 });
  }
  assert.equal(gradeSubject({ my: 0, fullScore: 0, topPercent: 100, n: 8 }).scoreRate, 0);
  assert.equal(gradeSubject({ my: 79.96, fullScore: 100, topPercent: 100, n: 8 }).grade, "우수");
});

test("population balance uses raw deviation boundaries and injected threshold", () => {
  for (const [deviation, assessment] of [[6.99, "매우 균형"], [7, "균형"], [11.99, "균형"], [12, "보통"], [17.99, "보통"], [18, "불균형"]] as const) {
    assert.equal(balanceAssessment([50 - deviation, 50 + deviation], 18).assessment, assessment);
  }
  assert.deepEqual(balanceAssessment([], 18), { stdDev: 0, assessment: "매우 균형" });
  assert.equal(balanceAssessment([40, 60], 9).assessment, "불균형");
  assert.equal(balanceAssessment([48, 52], 2).assessment, "불균형");
  assert.equal(balanceAssessment([30, 70], 25).assessment, "보통");
});

test("distribution sizes, interval boundaries, full marks and overflow", () => {
  for (const [fullScore, size, length] of [[100, 10, 10], [200, 20, 10], [250, 25, 10], [300, 25, 12]]) {
    const result = buildDistributionBins([-1, 0, size, fullScore, fullScore + 10], fullScore, fullScore + 1);
    assert.equal(result.binSize, size);
    assert.equal(result.bins.length, length);
    assert.equal(result.bins[0].count, 2);
    assert.equal(result.bins[1].count, 1);
    assert.equal(result.bins[length - 1].count, 2);
    assert.equal(result.bins[length - 1].ratio, 40);
    assert.equal(result.myBinIndex, length - 1);
  }
  assert.equal(buildDistributionBins([], 100).myBinIndex, null);
  assert.equal(buildDistributionBins([], 100, -1).myBinIndex, 0);
  assert.ok(buildDistributionBins([], 100).bins.every((bin) => bin.ratio === 0));
  assert.deepEqual(buildDistributionBins([], 0, 0), { binSize: 10, bins: [], myBinIndex: null });
});

test("malformed distribution settings cannot allocate unbounded arrays", () => {
  for (const fullScore of [Number.NaN, Infinity, 1e12, -1]) assert.equal(buildDistributionBins([80], fullScore).bins.length, 0);
  const result = buildDistributionBins([80, Number.NaN], 100, Number.NaN);
  assert.equal(result.myBinIndex, null);
  assert.equal(result.bins[8].ratio, 100);
});

test("top group averages use ceiling, rounding, and do not mutate", () => {
  const values = [50, 100, 80, 90, 60, 70, 40, 30, 20, 10, 0];
  assert.equal(topGroupAverage(values, 0.1), 95);
  assert.equal(topGroupAverage(values, 0.3), 85);
  assert.equal(values[0], 50);
  assert.equal(topGroupAverage([1, 2, 2], 1), 1.7);
  assert.equal(topGroupAverage([], 0.1), 0);
});

test("advice follows handoff text, strict gap and five point floor", () => {
  const subject: SubjectStat = { name: "과목A", my: 35, fullScore: 50, avg: 40, grade: "취약" };
  assert.deepEqual(buildAdvice([subject], { assessment: "보통" }), ["과목A이 상대적으로 취약합니다. 집중 학습이 필요합니다."]);
  assert.deepEqual(buildAdvice([{ ...subject, my: 34.9 }], { assessment: "불균형" }), [
    "과목A이 상대적으로 취약합니다. 집중 학습이 필요합니다.", "과목A 점수가 전체 평균보다 낮습니다.",
    "과목 간 점수 편차가 매우 큽니다. 취약 과목 보완이 시급합니다.",
  ]);
  assert.deepEqual(buildAdvice([{ ...subject, grade: "보통", fullScore: 200, my: 30 }], { assessment: "균형" }), []);
});

test("item diagnosis preserves inputs and marks, matches composite keys, separates blanks", () => {
  const items = [70, 95, 40, 20, 55, 80, 90].map((rate, index) => ({
    subjectId: index === 1 ? "b" : "a", itemNo: index === 1 ? 1 : index + 1,
    position: index, answerKey: "3,4", externalCorrectRatePct: rate, internalCorrectRatePct: 99,
  }));
  const responses = items.slice(0, 6).map((row, index) => ({ subjectId: row.subjectId, itemNo: row.itemNo,
    answer: index === 4 ? null : "2,4", isCorrect: index === 2 }));
  const before = structuredClone({ items, responses });
  const result = itemDiagnostics([...items].reverse(), responses, DEFAULT_EXAM_ANALYSIS_SETTINGS.common);
  const typed: ItemDiagnosticRow = result.list[2];
  assert.deepEqual(typed, { ...items[2], answer: "2,4", isCorrect: true, difficulty: "어려움" });
  assert.deepEqual(result.summary, { total: 7, correct: 1, wrong: 4, unanswered: 2,
    myCorrectRate: 14.3, killerTotal: 2, killerCorrect: 1, killerConquerRate: 50 });
  assert.deepEqual(result.easyMissed.map((row) => row.externalCorrectRatePct), [95, 90, 80, 70]);
  assert.deepEqual(result.killerTop5.map((row) => row.externalCorrectRatePct), [20, 40, 55, 70, 80]);
  assert.deepEqual({ items, responses }, before);
  const changed = itemDiagnostics(items, responses, { ...DEFAULT_EXAM_ANALYSIS_SETTINGS.common, easyMissedRatePercent: 90, killerRatePercent: 20 });
  assert.equal(changed.summary.killerTotal, 1);
  assert.equal(changed.list[0].difficulty, "보통");
  assert.equal(changed.easyMissed.length, 2);
});

test("empty diagnostics have zero denominators and easy list is not truncated", () => {
  assert.deepEqual(itemDiagnostics([], [], DEFAULT_EXAM_ANALYSIS_SETTINGS.common).summary, {
    total: 0, correct: 0, wrong: 0, unanswered: 0, myCorrectRate: 0,
    killerTotal: 0, killerCorrect: 0, killerConquerRate: 0,
  });
  const items = Array.from({ length: 6 }, (_, position) => ({ subjectId: "a", itemNo: position + 1,
    position, answerKey: "1", externalCorrectRatePct: 90, internalCorrectRatePct: null }));
  assert.equal(itemDiagnostics(items, [], DEFAULT_EXAM_ANALYSIS_SETTINGS.common).easyMissed.length, 6);
});

test("regular flags use inclusive thresholds, strict weakness, and rank ceiling", () => {
  const input = { current: { total: 175, internalRank: 6, internalCount: 21, subjectScoreRates: { a: 59.9, b: 60 } },
    previous: { total: 200, internalRank: 1 }, target: 200, fullScore: 250, settings: structuredClone(DEFAULT_EXAM_ANALYSIS_SETTINGS) };
  assert.deepEqual(detectRegularDecline(input).map((flag) => flag.kind), ["totalDrop", "rankDrop", "targetGap", "weakSubject"]);
  assert.deepEqual(detectRegularDecline({ ...input, current: { ...input.current, total: 175.1, internalRank: 5, subjectScoreRates: { a: 60 } } }), []);
  assert.deepEqual(detectRegularDecline({ ...input, previous: null }).map((flag) => flag.kind), ["targetGap", "weakSubject"]);
  assert.deepEqual(detectRegularDecline({ ...input, previous: null, target: null }).map((flag) => flag.kind), ["weakSubject"]);
  const settings = structuredClone(input.settings);
  settings.regular = { totalDropPercent: 11, rankDropPercent: 25, targetGapPercent: 11 };
  settings.common.weakSubjectRatePercent = 50;
  assert.deepEqual(detectRegularDecline({ ...input, settings }), []);
  settings.regular = { totalDropPercent: 0, rankDropPercent: 0, targetGapPercent: 0 };
  assert.deepEqual(detectRegularDecline({ ...input, current: { ...input.current, total: 200, internalRank: 1 }, settings }).map((flag) => flag.kind), ["totalDrop", "rankDrop", "targetGap"]);
});
