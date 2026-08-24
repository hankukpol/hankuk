export const POLICE_SHADOW_MODEL_VERSION =
  "police-shadow-propensity-sensitivity-v1" as const;
export const POLICE_SHADOW_MODEL_CALIBRATED: boolean = false;

export type PoliceShadowPredictionStatus =
  | "READY"
  | "CALIBRATION_REQUIRED"
  | "MISSING_APPLICANTS"
  | "INSUFFICIENT_SAMPLE"
  | "INCONSISTENT_INPUT";

export interface PoliceShadowScoreBand {
  score: number;
  count: number;
}

export interface PoliceShadowPredictionResult {
  modelVersion: typeof POLICE_SHADOW_MODEL_VERSION;
  status: PoliceShadowPredictionStatus;
  participantCount: number;
  coverageRate: number | null;
  rawOneMultipleCutScore: number | null;
  rawWrittenPassCutScore: number | null;
  correctedWrittenPassCutScore: number | null;
  sensitivityLowScore: number | null;
  sensitivityHighScore: number | null;
  possibleMinScore: number | null;
  likelyMinScore: number | null;
  sureMinScore: number | null;
  scenarioCount: number;
  assumptions: {
    releaseNumber: number;
    attendanceRates: readonly number[];
    scoreBiasLogOddsSlopes: readonly number[];
    gradeAgreementThresholds: {
      possible: 0.35;
      likely: 0.7;
      sure: 0.9;
    };
  };
}

const ATTENDANCE_RATES = [0.75, 0.82, 0.88, 0.93] as const;

// 점수가 높은 응시자가 먼저 입력하는 MNAR 상황을 민감도 범위로만 다룬다.
// 공식 결과로 캘리브레이션되기 전까지 이 값은 확률 모수가 아니라 관리자 검토용 가정이다.
const SCORE_BIAS_SLOPES_BY_RELEASE = {
  1: [1.75, 2.25, 2.75, 3.25, 3.75],
  2: [1.5, 2, 2.5, 3, 3.5],
  3: [1.25, 1.75, 2.25, 2.75, 3.25],
  4: [1, 1.5, 2, 2.5, 3],
} as const;

const GRADE_AGREEMENT_THRESHOLDS = {
  possible: 0.35,
  likely: 0.7,
  sure: 0.9,
} as const;

function roundNumber(value: number): number {
  return Number(value.toFixed(2));
}

function normalizeReleaseNumber(value: number): 1 | 2 | 3 | 4 {
  if (!Number.isInteger(value) || value < 1 || value > 4) {
    throw new Error("그림자 모델 발표 차수는 1부터 4 사이의 정수여야 합니다.");
  }
  return value as 1 | 2 | 3 | 4;
}

function normalizeScoreBands(scoreBands: PoliceShadowScoreBand[]): PoliceShadowScoreBand[] {
  const counts = new Map<number, number>();
  for (const band of scoreBands) {
    if (!Number.isFinite(band.score)) {
      throw new Error("그림자 모델 점수는 유한한 숫자여야 합니다.");
    }
    if (!Number.isInteger(band.count) || band.count < 1) {
      throw new Error("그림자 모델 점수대 인원은 1 이상의 정수여야 합니다.");
    }
    const score = roundNumber(band.score);
    counts.set(score, (counts.get(score) ?? 0) + band.count);
  }

  return [...counts.entries()]
    .sort(([left], [right]) => right - left)
    .map(([score, count]) => ({ score, count }));
}

function scoreAtObservedRank(
  scoreBands: PoliceShadowScoreBand[],
  rank: number
): number | null {
  if (!Number.isInteger(rank) || rank < 1) return null;
  let cumulative = 0;
  for (const band of scoreBands) {
    cumulative += band.count;
    if (cumulative >= rank) return band.score;
  }
  return null;
}

function sigmoid(value: number): number {
  if (value >= 0) {
    const exp = Math.exp(-value);
    return 1 / (1 + exp);
  }
  const exp = Math.exp(value);
  return exp / (1 + exp);
}

function calculateWeightedMoments(scoreBands: PoliceShadowScoreBand[]): {
  mean: number;
  standardDeviation: number;
} {
  const total = scoreBands.reduce((sum, band) => sum + band.count, 0);
  const mean = scoreBands.reduce((sum, band) => sum + band.score * band.count, 0) / total;
  const variance = scoreBands.reduce(
    (sum, band) => sum + ((band.score - mean) ** 2) * band.count,
    0
  ) / total;
  return {
    mean,
    standardDeviation: Math.sqrt(variance),
  };
}

function estimateScenarioCutScore(params: {
  scoreBands: PoliceShadowScoreBand[];
  targetPopulation: number;
  targetRank: number;
  scoreBiasLogOddsSlope: number;
  mean: number;
  standardDeviation: number;
}): number | null {
  const normalizedScores = params.scoreBands.map((band) => ({
    ...band,
    zScore: (band.score - params.mean) / params.standardDeviation,
  }));

  const estimatedPopulation = (intercept: number) =>
    normalizedScores.reduce((sum, band) => {
      const propensity = Math.max(
        1e-9,
        sigmoid(intercept + params.scoreBiasLogOddsSlope * band.zScore)
      );
      return sum + band.count / propensity;
    }, 0);

  let low = -40;
  let high = 40;
  for (let iteration = 0; iteration < 120; iteration += 1) {
    const midpoint = (low + high) / 2;
    if (estimatedPopulation(midpoint) > params.targetPopulation) {
      low = midpoint;
    } else {
      high = midpoint;
    }
  }
  const intercept = (low + high) / 2;

  let cumulative = 0;
  for (const band of normalizedScores) {
    const propensity = Math.max(
      1e-9,
      sigmoid(intercept + params.scoreBiasLogOddsSlope * band.zScore)
    );
    cumulative += band.count / propensity;
    if (cumulative >= params.targetRank) return band.score;
  }
  return null;
}

function quantile(values: number[], probability: number): number | null {
  if (values.length < 1) return null;
  const ordered = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.min(ordered.length - 1, Math.ceil(probability * ordered.length) - 1));
  return ordered[index];
}

function emptyResult(params: {
  status: Exclude<PoliceShadowPredictionStatus, "READY">;
  participantCount: number;
  coverageRate: number | null;
  rawOneMultipleCutScore: number | null;
  rawWrittenPassCutScore: number | null;
  releaseNumber: 1 | 2 | 3 | 4;
  scoreBiasLogOddsSlopes: readonly number[];
}): PoliceShadowPredictionResult {
  return {
    modelVersion: POLICE_SHADOW_MODEL_VERSION,
    status: params.status,
    participantCount: params.participantCount,
    coverageRate: params.coverageRate,
    rawOneMultipleCutScore: params.rawOneMultipleCutScore,
    rawWrittenPassCutScore: params.rawWrittenPassCutScore,
    correctedWrittenPassCutScore: null,
    sensitivityLowScore: null,
    sensitivityHighScore: null,
    possibleMinScore: null,
    likelyMinScore: null,
    sureMinScore: null,
    scenarioCount: 0,
    assumptions: {
      releaseNumber: params.releaseNumber,
      attendanceRates: ATTENDANCE_RATES,
      scoreBiasLogOddsSlopes: params.scoreBiasLogOddsSlopes,
      gradeAgreementThresholds: GRADE_AGREEMENT_THRESHOLDS,
    },
  };
}

export function buildPoliceShadowPrediction(params: {
  scoreBands: PoliceShadowScoreBand[];
  recruitCount: number;
  writtenPassCount: number;
  applicantCount: number | null;
  releaseNumber: number;
}): PoliceShadowPredictionResult {
  if (!Number.isInteger(params.recruitCount) || params.recruitCount < 1) {
    throw new Error("그림자 모델 모집인원은 1 이상의 정수여야 합니다.");
  }
  if (!Number.isInteger(params.writtenPassCount) || params.writtenPassCount < 1) {
    throw new Error("그림자 모델 필기 선발인원은 1 이상의 정수여야 합니다.");
  }

  const releaseNumber = normalizeReleaseNumber(params.releaseNumber);
  const scoreBiasLogOddsSlopes = SCORE_BIAS_SLOPES_BY_RELEASE[releaseNumber];
  const scoreBands = normalizeScoreBands(params.scoreBands);
  const participantCount = scoreBands.reduce((sum, band) => sum + band.count, 0);
  const rawOneMultipleCutScore = scoreAtObservedRank(scoreBands, params.recruitCount);
  const rawWrittenPassCutScore = scoreAtObservedRank(scoreBands, params.writtenPassCount);
  const coverageRate = params.applicantCount && params.applicantCount > 0
    ? roundNumber((participantCount / params.applicantCount) * 100)
    : null;

  if (params.applicantCount === null || params.applicantCount < 1) {
    return emptyResult({
      status: "MISSING_APPLICANTS",
      participantCount,
      coverageRate,
      rawOneMultipleCutScore,
      rawWrittenPassCutScore,
      releaseNumber,
      scoreBiasLogOddsSlopes,
    });
  }
  if (
    params.applicantCount < participantCount ||
    params.applicantCount < params.writtenPassCount
  ) {
    return emptyResult({
      status: "INCONSISTENT_INPUT",
      participantCount,
      coverageRate,
      rawOneMultipleCutScore,
      rawWrittenPassCutScore,
      releaseNumber,
      scoreBiasLogOddsSlopes,
    });
  }
  if (
    participantCount < params.writtenPassCount ||
    participantCount < 30 ||
    scoreBands.length < 3 ||
    coverageRate === null ||
    coverageRate < 2
  ) {
    return emptyResult({
      status: "INSUFFICIENT_SAMPLE",
      participantCount,
      coverageRate,
      rawOneMultipleCutScore,
      rawWrittenPassCutScore,
      releaseNumber,
      scoreBiasLogOddsSlopes,
    });
  }

  const moments = calculateWeightedMoments(scoreBands);
  if (!Number.isFinite(moments.standardDeviation) || moments.standardDeviation <= 0) {
    return emptyResult({
      status: "INSUFFICIENT_SAMPLE",
      participantCount,
      coverageRate,
      rawOneMultipleCutScore,
      rawWrittenPassCutScore,
      releaseNumber,
      scoreBiasLogOddsSlopes,
    });
  }

  if (!POLICE_SHADOW_MODEL_CALIBRATED) {
    return emptyResult({
      status: "CALIBRATION_REQUIRED",
      participantCount,
      coverageRate,
      rawOneMultipleCutScore,
      rawWrittenPassCutScore,
      releaseNumber,
      scoreBiasLogOddsSlopes,
    });
  }

  const scenarioScores: number[] = [];
  for (const attendanceRate of ATTENDANCE_RATES) {
    const targetPopulation = Math.max(
      participantCount,
      Math.round(params.applicantCount * attendanceRate)
    );
    for (const scoreBiasLogOddsSlope of scoreBiasLogOddsSlopes) {
      const score = estimateScenarioCutScore({
        scoreBands,
        targetPopulation,
        targetRank: params.writtenPassCount,
        scoreBiasLogOddsSlope,
        mean: moments.mean,
        standardDeviation: moments.standardDeviation,
      });
      if (score !== null) scenarioScores.push(score);
    }
  }

  if (scenarioScores.length < 1) {
    return emptyResult({
      status: "INCONSISTENT_INPUT",
      participantCount,
      coverageRate,
      rawOneMultipleCutScore,
      rawWrittenPassCutScore,
      releaseNumber,
      scoreBiasLogOddsSlopes,
    });
  }

  return {
    modelVersion: POLICE_SHADOW_MODEL_VERSION,
    status: "READY",
    participantCount,
    coverageRate,
    rawOneMultipleCutScore,
    rawWrittenPassCutScore,
    correctedWrittenPassCutScore: quantile(scenarioScores, 0.5),
    sensitivityLowScore: quantile(scenarioScores, 0.1),
    sensitivityHighScore: quantile(scenarioScores, 0.9),
    possibleMinScore: quantile(scenarioScores, GRADE_AGREEMENT_THRESHOLDS.possible),
    likelyMinScore: quantile(scenarioScores, GRADE_AGREEMENT_THRESHOLDS.likely),
    sureMinScore: quantile(scenarioScores, GRADE_AGREEMENT_THRESHOLDS.sure),
    scenarioCount: scenarioScores.length,
    assumptions: {
      releaseNumber,
      attendanceRates: ATTENDANCE_RATES,
      scoreBiasLogOddsSlopes,
      gradeAgreementThresholds: GRADE_AGREEMENT_THRESHOLDS,
    },
  };
}
