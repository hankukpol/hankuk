import type { ExamAnalysisSettings } from "./exam-analysis-settings";

export type ScoreRow = { id: string; total: number; subjectScores: Record<string, number> };
export type SubjectStat = {
  name: string; my: number; fullScore: number; avg: number; grade: "우수" | "보통" | "취약";
};
export type ItemDiagnosticRow = {
  subjectId: string; itemNo: number; position: number; answerKey: string;
  externalCorrectRatePct: number; internalCorrectRatePct: number | null;
  answer: string | null; isCorrect: boolean; difficulty: "쉬움" | "보통" | "어려움";
};
export type ItemResponseCorrectness = {
  subjectId: string;
  itemNo: number;
  correctness: boolean | null;
};

const roundOne = (value: number): number => Number(value.toFixed(1));

export function rankWithTies(rows: ScoreRow[], key: (r: ScoreRow) => number): Map<string, number> {
  const sorted = rows.map((row) => ({ row, value: key(row) })).sort((a, b) => b.value - a.value);
  const ranks = new Map<string, number>();
  let rank = 0;
  sorted.forEach(({ row, value }, index) => {
    if (index === 0 || value !== sorted[index - 1].value) rank = index + 1;
    ranks.set(row.id, rank);
  });
  return ranks;
}

export function topPercent(rank: number, count: number): number {
  if (count <= 0) return 100;
  return roundOne(Math.max(0, Math.min(100, rank / count * 100)));
}

export function percentileRank(values: number[], mine: number): number {
  if (!values.length) return 0;
  let lower = 0;
  let equal = 0;
  for (const value of values) {
    if (value < mine) lower++;
    else if (value === mine) equal++;
  }
  return roundOne((lower + 0.5 * equal) / values.length * 100);
}

export function gradeSubject(input: { my: number; fullScore: number; topPercent: number; n: number }):
  { grade: SubjectStat["grade"]; basis: "scoreRate" | "percentile"; scoreRate: number } {
  const scoreRate = input.fullScore > 0 ? roundOne(input.my / input.fullScore * 100) : 0;
  if (input.n < 10) return {
    grade: scoreRate >= 80 ? "우수" : scoreRate >= 60 ? "보통" : "취약", basis: "scoreRate", scoreRate,
  };
  return {
    grade: input.topPercent <= 30 ? "우수" : input.topPercent <= 60 ? "보통" : "취약",
    basis: "percentile", scoreRate,
  };
}

export function balanceAssessment(ratios: number[], unbalancedStdDev: number):
  { stdDev: number; assessment: "매우 균형" | "균형" | "보통" | "불균형" } {
  const mean = ratios.length ? ratios.reduce((sum, value) => sum + value, 0) / ratios.length : 0;
  const deviation = Math.sqrt(ratios.length
    ? ratios.reduce((sum, value) => sum + (value - mean) ** 2, 0) / ratios.length : 0);
  // Classify before rounding; the injected threshold takes precedence even below 7/12.
  return { stdDev: roundOne(deviation), assessment: deviation >= unbalancedStdDev ? "불균형"
    : deviation < 7 ? "매우 균형" : deviation < 12 ? "균형" : "보통" };
}

export function buildDistributionBins(totals: number[], fullScore: number, myTotal?: number):
  { binSize: number; bins: Array<{ lo: number; hi: number; count: number; ratio: number }>; myBinIndex: number | null } {
  const binSize = fullScore <= 100 ? 10 : fullScore <= 200 ? 20 : 25;
  // Allocation ceiling, not a scoring threshold: malformed historical settings must not exhaust memory.
  const binCount = Math.ceil(fullScore / binSize);
  if (!Number.isFinite(binCount) || binCount <= 0 || binCount > 10000) return { binSize, bins: [], myBinIndex: null };
  const bins = Array.from({ length: binCount }, (_, index) => ({
    lo: index * binSize, hi: (index + 1) * binSize, count: 0, ratio: 0,
  }));
  const indexOf = (score: number) => Math.min(bins.length - 1, Math.floor(Math.max(0, score) / binSize));
  const validTotals = totals.filter(Number.isFinite);
  for (const total of validTotals) bins[indexOf(total)].count++;
  for (const bin of bins) bin.ratio = validTotals.length ? roundOne(bin.count / validTotals.length * 100) : 0;
  return { binSize, bins, myBinIndex: myTotal === undefined || !Number.isFinite(myTotal) || !bins.length ? null : indexOf(myTotal) };
}

export function topGroupAverage(values: number[], ratio: number): number {
  if (!values.length) return 0;
  const top = [...values].sort((a, b) => b - a).slice(0, Math.max(1, Math.ceil(values.length * ratio)));
  return roundOne(top.reduce((sum, value) => sum + value, 0) / top.length);
}

export function buildAdvice(subjects: SubjectStat[], balance: { assessment: string }): string[] {
  const advice: string[] = [];
  for (const subject of subjects) {
    if (subject.grade === "취약") advice.push(`${subject.name}이 상대적으로 취약합니다. 집중 학습이 필요합니다.`);
    if (subject.my < subject.avg - Math.max(subject.fullScore * 0.05, 5)) {
      advice.push(`${subject.name} 점수가 전체 평균보다 낮습니다.`);
    }
  }
  if (balance.assessment === "불균형") advice.push("과목 간 점수 편차가 매우 큽니다. 취약 과목 보완이 시급합니다.");
  return advice;
}

export function itemDiagnostics(
  items: Array<{ subjectId: string; itemNo: number; position: number; answerKey: string; externalCorrectRatePct: number; internalCorrectRatePct: number | null }>,
  myResponses: Array<{ subjectId: string; itemNo: number; answer: string | null; isCorrect: boolean }>,
  settings: ExamAnalysisSettings["common"],
): {
  list: ItemDiagnosticRow[];
  responseCorrectness?: ItemResponseCorrectness[];
  summary: { total: number; correct: number; wrong: number; unanswered: number; myCorrectRate: number;
    killerTotal: number; killerCorrect: number; killerConquerRate: number };
  easyMissed: ItemDiagnosticRow[]; killerTop5: ItemDiagnosticRow[];
} {
  const responseKey = (row: { subjectId: string; itemNo: number }) => JSON.stringify([row.subjectId, row.itemNo]);
  const responses = new Map(myResponses.map((row) => [responseKey(row), row]));
  const list: ItemDiagnosticRow[] = [...items].sort((a, b) => a.position - b.position).map((item) => {
    const response = responses.get(responseKey(item));
    return { ...item, answer: response?.answer ?? null, isCorrect: response?.isCorrect ?? false,
      difficulty: item.externalCorrectRatePct >= settings.easyMissedRatePercent ? "쉬움"
        : item.externalCorrectRatePct <= settings.killerRatePercent ? "어려움" : "보통" };
  });
  const recorded = list.filter((row) => responses.has(responseKey(row)));
  const correct = recorded.filter((row) => row.isCorrect).length;
  const responseCorrectness = list.map((row) => ({
    subjectId: row.subjectId,
    itemNo: row.itemNo,
    correctness: responses.get(responseKey(row))?.isCorrect ?? null,
  }));
  // Only imported response rows contribute to response counts. A recorded blank remains unanswered.
  const unanswered = recorded.filter((row) => !row.isCorrect && !row.answer?.trim()).length;
  const killers = recorded.filter((row) => row.externalCorrectRatePct <= settings.killerRatePercent);
  const killerCorrect = killers.filter((row) => row.isCorrect).length;
  return {
    list, responseCorrectness,
    summary: { total: recorded.length, correct, wrong: recorded.length - correct - unanswered, unanswered,
      myCorrectRate: recorded.length ? roundOne(correct / recorded.length * 100) : 0,
      killerTotal: killers.length, killerCorrect,
      killerConquerRate: killers.length ? roundOne(killerCorrect / killers.length * 100) : 0 },
    easyMissed: list.filter((row) => responses.get(responseKey(row))?.isCorrect === false
      && row.externalCorrectRatePct >= settings.easyMissedRatePercent)
      .sort((a, b) => b.externalCorrectRatePct - a.externalCorrectRatePct),
    killerTop5: [...list].sort((a, b) => a.externalCorrectRatePct - b.externalCorrectRatePct).slice(0, 5),
  };
}

export function detectRegularDecline(input: {
  current: { total: number; internalRank: number; internalCount: number; subjectScoreRates: Record<string, number> };
  previous: { total: number; internalRank: number } | null;
  target: number | null; fullScore: number; settings: ExamAnalysisSettings;
}): Array<{ kind: "totalDrop" | "rankDrop" | "targetGap" | "weakSubject"; detail: string }> {
  const { current, previous, target, fullScore, settings } = input;
  const flags: ReturnType<typeof detectRegularDecline> = [];
  if (previous) {
    const drop = previous.total - current.total;
    if (drop >= fullScore * settings.regular.totalDropPercent / 100) {
      flags.push({ kind: "totalDrop", detail: `직전 시험보다 총점이 ${roundOne(drop)}점 하락했습니다.` });
    }
    const rankDrop = current.internalRank - previous.internalRank;
    if (rankDrop >= Math.ceil(current.internalCount * settings.regular.rankDropPercent / 100)) {
      flags.push({ kind: "rankDrop", detail: `직전 시험보다 반 석차가 ${rankDrop}계단 하락했습니다.` });
    }
  }
  if (target !== null && target - current.total >= fullScore * settings.regular.targetGapPercent / 100) {
    flags.push({ kind: "targetGap", detail: `목표 점수보다 ${roundOne(target - current.total)}점 낮습니다.` });
  }
  for (const [subject, rate] of Object.entries(current.subjectScoreRates)) {
    if (rate < settings.common.weakSubjectRatePercent) {
      flags.push({ kind: "weakSubject", detail: `${subject} 성취율이 ${roundOne(rate)}%로 취약 기준 ${settings.common.weakSubjectRatePercent}% 미만입니다.` });
    }
  }
  return flags;
}

export type FullScoreSubject = {
  totalItems?: number | null;
  pointsPerItem?: number | null;
  alternateGroup?: string | null;
  isActive?: boolean;
};

/** Active mandatory subjects plus the largest full score in each choose-one group. */
export function computeFullScore(subjects: readonly FullScoreSubject[]): number {
  let total = 0;
  const groups = new Map<string, number>();
  for (const subject of subjects) {
    if (subject.isActive === false) continue;
    const score = (subject.totalItems ?? 0) * (subject.pointsPerItem ?? 0);
    if (!Number.isFinite(score) || score < 0) continue;
    const group = subject.alternateGroup?.trim();
    if (group) groups.set(group, Math.max(groups.get(group) ?? 0, score));
    else total += score;
  }
  return total + Array.from(groups.values()).reduce((sum, score) => sum + score, 0);
}

/** One subject, one point per attended date. Missing/non-finite scores are not attempts. */
export type SessionPoint = { date: string; score: number };

function orderedMorningPoints(series: SessionPoint[]): SessionPoint[] {
  return series.filter(point => Number.isFinite(point.score)).sort((a, b) => a.date.localeCompare(b.date));
}

function requireSessionWindow(windowSessions: number): void {
  if (!Number.isInteger(windowSessions) || windowSessions < 1) {
    throw new RangeError("응시 회차 창은 1 이상의 정수여야 합니다.");
  }
}

const morningMean = (series: SessionPoint[]): number =>
  series.reduce((sum, point) => sum + point.score, 0) / series.length;

/** Empty input produces no chart points; short windows use the available attempts. */
export function movingAverage(series: SessionPoint[], windowSessions: number): Array<{ date: string; value: number }> {
  requireSessionWindow(windowSessions);
  const points = orderedMorningPoints(series);
  return points.map((point, index) => ({
    date: point.date, value: morningMean(points.slice(Math.max(0, index + 1 - windowSessions), index + 1)),
  }));
}

/** Least-squares slope in points per attempt, independent of calendar gaps. */
export function trendSlope(series: SessionPoint[], windowSessions: number): number | null {
  requireSessionWindow(windowSessions);
  const points = orderedMorningPoints(series).slice(-windowSessions);
  if (points.length < 2) return null;
  const xMean = (points.length - 1) / 2, yMean = morningMean(points);
  let numerator = 0, denominator = 0;
  points.forEach((point, index) => {
    numerator += (index - xMean) * (point.score - yMean);
    denominator += (index - xMean) ** 2;
  });
  return numerator / denominator;
}

/** Population standard deviation, without rounding before subsequent calculations. */
export function consistency(series: SessionPoint[]): number | null {
  const points = orderedMorningPoints(series);
  if (!points.length) return null;
  const average = morningMean(points);
  return Math.sqrt(points.reduce((sum, point) => sum + (point.score - average) ** 2, 0) / points.length);
}

export function detectMorningDecline(input: {
  series: SessionPoint[];
  classSeries: SessionPoint[];
  expectedSessions: number;
  fullScore: number;
  settings: ExamAnalysisSettings;
}): Array<{ kind: "lowAttendance" | "consecutiveDrops" | "classGap" | "ownAverageDrop"; detail: string }> {
  const points = orderedMorningPoints(input.series), settings = input.settings.morning;
  const flags: ReturnType<typeof detectMorningDecline> = [];
  // No scheduled sessions means no attendance denominator and no decline assessment.
  if (!Number.isFinite(input.expectedSessions) || input.expectedSessions <= 0) return flags;
  const rate = points.length / input.expectedSessions * 100;
  if (rate < settings.attendanceRatePercent) return [{
    kind: "lowAttendance", detail: `응시율이 ${roundOne(rate)}%로 기준 ${settings.attendanceRatePercent}% 미만이라 추세를 판단하지 않습니다.`,
  }];
  if (!points.length) return flags;

  const recentDrops = points.slice(-(settings.consecutiveDrops + 1));
  if (recentDrops.length === settings.consecutiveDrops + 1
    && recentDrops.every((point, index) => index === 0 || point.score < recentDrops[index - 1].score)) {
    flags.push({ kind: "consecutiveDrops", detail: `최근 ${settings.consecutiveDrops}회 연속으로 점수가 하락했습니다.` });
  }

  // Percentage point gaps cannot be assessed without a valid subject full score.
  if (!Number.isFinite(input.fullScore) || input.fullScore <= 0) return flags;
  const recent = points.slice(-settings.movingAverageSessions);
  const classByDate = new Map(orderedMorningPoints(input.classSeries).map(point => [point.date, point]));
  const aligned = recent.flatMap(point => {
    const peer = classByDate.get(point.date);
    return peer ? [peer] : [];
  });
  // Never substitute another date or compare averages with different denominators.
  if (aligned.length === recent.length) {
    const gap = morningMean(aligned) - morningMean(recent);
    if (gap >= input.fullScore * settings.classGapPercent / 100) {
      flags.push({ kind: "classGap", detail: `최근 ${recent.length}회 평균이 같은 응시일의 반 평균보다 ${roundOne(gap)}점 낮습니다.` });
    }
  }

  const recentThree = points.slice(-3);
  const previous = points.slice(Math.max(0, points.length - 3 - settings.trendWindowSessions), Math.max(0, points.length - 3));
  if (recentThree.length === 3 && previous.length >= 3) {
    const drop = morningMean(previous) - morningMean(recentThree);
    if (drop >= input.fullScore * settings.ownAverageDropPercent / 100) {
      flags.push({ kind: "ownAverageDrop", detail: `최근 3회 평균이 이전 ${previous.length}회 평균보다 ${roundOne(drop)}점 하락했습니다.` });
    }
  }
  return flags;
}

/** Handoff structural rule: identify by item count, never operational subject names. */
export function findCumulativeSubject<T extends { totalItems?: number | null }>(subjects: readonly T[]): T | null {
  return subjects.find(subject => Number.isFinite(subject.totalItems) && (subject.totalItems ?? 0) >= 100) ?? null;
}
