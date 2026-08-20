export interface KnownFinalScoreResult {
  writtenScore: number;
  written50: number;
  fitnessBase: number;
  martialBonusPoint: number;
  fitnessTotal: number;
  fitnessBonus25: number;
  fitness25: number;
  score75: number | null;
}

export function getAppliedPoliceWrittenBonusRate(params: {
  rawWrittenScore: number;
  finalWrittenScore: number;
  writtenMaxScore?: number;
}): number {
  const writtenMaxScore = Math.max(0, params.writtenMaxScore ?? 250);
  if (writtenMaxScore === 0) return 0;
  const appliedBonusScore = Math.max(0, params.finalWrittenScore - params.rawWrittenScore);
  return Math.min(0.1, roundPoliceFinalScore(appliedBonusScore / writtenMaxScore));
}

export function roundPoliceFinalScore(value: number): number {
  return Number(value.toFixed(2));
}

export function getMartialBonusPoint(danLevel: number): number {
  if (!Number.isFinite(danLevel)) return 0;
  if (danLevel >= 4) return 2;
  if (danLevel >= 2) return 1;
  return 0;
}

export function calculateKnownFinalScore(params: {
  writtenScore: number;
  fitnessPassed: boolean;
  martialDanLevel: number;
  appliedWrittenBonusRate: number;
}): KnownFinalScoreResult {
  const writtenScore = Math.max(0, params.writtenScore);
  const written50 = roundPoliceFinalScore((writtenScore / 250) * 100 * 0.5);
  const martialBonusPoint = getMartialBonusPoint(params.martialDanLevel);
  const fitnessBase = 48;
  const fitnessTotal = fitnessBase + martialBonusPoint;
  // 취업지원대상자 등의 법정 가점은 점수화된 각 시험 단계마다 적용한다.
  // 다만 선언값이 아니라 필기 finalScore에 실제 반영된 비율만 사용한다.
  const appliedWrittenBonusRate = Math.min(0.1, Math.max(0, params.appliedWrittenBonusRate));
  const fitnessBonus25 = roundPoliceFinalScore(25 * appliedWrittenBonusRate);
  const fitness25 = roundPoliceFinalScore(fitnessTotal * 0.5 + fitnessBonus25);

  return {
    writtenScore,
    written50,
    fitnessBase,
    martialBonusPoint,
    fitnessTotal,
    fitnessBonus25,
    fitness25,
    score75: params.fitnessPassed
      ? roundPoliceFinalScore(written50 + fitness25)
      : null,
  };
}
