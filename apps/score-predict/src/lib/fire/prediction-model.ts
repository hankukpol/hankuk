export const FIRE_PREDICTION_MODEL_VERSION = "fire-role-gender-sample-v1";

export const FIRE_SAMPLE_THRESHOLDS = {
  collecting: 5,
  forming: 15,
  reliable: 30,
} as const;

export type FirePredictionGrade = "확실권" | "유력권" | "가능권" | "도전권";

export type FireSampleStage =
  | "INITIAL"
  | "COLLECTING"
  | "FORMING"
  | "RELIABLE"
  | "ESTIMATED";

export interface FirePredictionBands {
  modelVersion: typeof FIRE_PREDICTION_MODEL_VERSION;
  sampleStage: FireSampleStage;
  coverageRate: number;
  sureMaxRank: number;
  likelyMaxRank: number;
  possibleMaxRank: number;
  sureMultiple: number;
  likelyMultiple: number;
  possibleMultiple: number;
  isReliableSample: boolean;
}

function roundNumber(value: number): number {
  return Number(value.toFixed(2));
}

function rankAtMultiple(recruitCount: number, multiple: number, mode: "floor" | "ceil"): number {
  if (multiple <= 0) return 0;
  const value = mode === "ceil"
    ? Math.ceil(recruitCount * multiple)
    : Math.floor(recruitCount * multiple);
  return Math.max(1, value);
}

function getSampleStage(coverageRate: number, isApplicantCountExact: boolean): FireSampleStage {
  if (!isApplicantCountExact) return "ESTIMATED";
  if (coverageRate < FIRE_SAMPLE_THRESHOLDS.collecting) return "INITIAL";
  if (coverageRate < FIRE_SAMPLE_THRESHOLDS.forming) return "COLLECTING";
  if (coverageRate < FIRE_SAMPLE_THRESHOLDS.reliable) return "FORMING";
  return "RELIABLE";
}

function getBandMultiples(stage: FireSampleStage, coverageRate: number): {
  sure: number;
  likely: number;
} {
  switch (stage) {
    case "INITIAL":
      return { sure: 0, likely: 0 };
    case "COLLECTING":
    case "ESTIMATED":
      return { sure: 0, likely: 0.75 };
    case "FORMING": {
      const progress = Math.min(
        1,
        Math.max(0, (coverageRate - FIRE_SAMPLE_THRESHOLDS.forming) / 15)
      );
      return {
        sure: roundNumber(0.7 + progress * 0.15),
        likely: 1,
      };
    }
    case "RELIABLE":
      return { sure: 0.85, likely: 1 };
  }
}

export function buildFirePredictionBands(params: {
  recruitCount: number;
  participantCount: number;
  referenceApplicantCount: number;
  isApplicantCountExact: boolean;
  passMultiple: number;
}): FirePredictionBands {
  if (!Number.isInteger(params.recruitCount) || params.recruitCount < 1) {
    throw new Error("소방 모집인원은 1 이상의 정수여야 합니다.");
  }
  if (!Number.isFinite(params.passMultiple) || params.passMultiple < 1) {
    throw new Error("소방 필기 합격배수가 올바르지 않습니다.");
  }

  const participantCount = Math.max(0, Math.floor(params.participantCount));
  const referenceApplicantCount = Math.max(0, Math.floor(params.referenceApplicantCount));
  const coverageRate = referenceApplicantCount > 0
    ? roundNumber(Math.min(100, (participantCount / referenceApplicantCount) * 100))
    : 0;
  const sampleStage = getSampleStage(coverageRate, params.isApplicantCountExact);
  const multiples = getBandMultiples(sampleStage, coverageRate);
  const sureMaxRank = rankAtMultiple(params.recruitCount, multiples.sure, "floor");
  const likelyMaxRank = Math.max(
    sureMaxRank,
    rankAtMultiple(params.recruitCount, multiples.likely, "floor")
  );
  const possibleMaxRank = Math.max(
    likelyMaxRank,
    rankAtMultiple(params.recruitCount, params.passMultiple, "ceil")
  );

  return {
    modelVersion: FIRE_PREDICTION_MODEL_VERSION,
    sampleStage,
    coverageRate,
    sureMaxRank,
    likelyMaxRank,
    possibleMaxRank,
    sureMultiple: sureMaxRank > 0 ? roundNumber(sureMaxRank / params.recruitCount) : 0,
    likelyMultiple: likelyMaxRank > 0 ? roundNumber(likelyMaxRank / params.recruitCount) : 0,
    possibleMultiple: roundNumber(possibleMaxRank / params.recruitCount),
    isReliableSample: sampleStage === "RELIABLE",
  };
}

export function classifyFirePredictionGrade(
  rank: number,
  bands: FirePredictionBands
): FirePredictionGrade {
  if (!Number.isInteger(rank) || rank < 1) {
    throw new Error("소방 예측 순위는 1 이상의 정수여야 합니다.");
  }
  if (bands.sureMaxRank > 0 && rank <= bands.sureMaxRank) return "확실권";
  if (bands.likelyMaxRank > 0 && rank <= bands.likelyMaxRank) return "유력권";
  if (rank <= bands.possibleMaxRank) return "가능권";
  return "도전권";
}
