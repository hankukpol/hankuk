export const POLICE_PREDICTION_MODEL_VERSION = "police-2026-2x-rank-first-v2";
export const POLICE_PREDICTION_MODEL_CALIBRATED = false;
// 모집단 2배수 경계를 입력자 표본 순위에 직접 적용하는 현재 등급 모델은 공개 금지다.
// 실측 매핑을 사용하는 새 모델 버전이 구현되기 전에는 true로 바꾸지 않는다.
export const POLICE_SAMPLE_RANK_GRADE_OUTPUT_ENABLED = false;

export const POLICE_GRADE_MINIMUMS = {
  coverageRate: 30,
  absoluteParticipants: 30,
  participantsPerRecruit: 2,
} as const;

export type PoliceGradeUnavailableReason =
  | "FEATURE_DISABLED"
  | "MISSING_APPLICANTS"
  | "INSUFFICIENT_SAMPLE"
  | "UNCALIBRATED";

export interface PoliceGradeAvailability {
  gradeAvailability: "AVAILABLE" | "UNAVAILABLE";
  unavailableReasons: PoliceGradeUnavailableReason[];
}

export const POLICE_SAMPLE_THRESHOLDS = {
  collecting: 5,
  forming: 15,
  reliable: 30,
} as const;

export type PolicePredictionGrade = "확실권" | "유력권" | "가능권" | "도전권";

export type PoliceSampleStage =
  | "INITIAL"
  | "COLLECTING"
  | "FORMING"
  | "RELIABLE"
  | "ESTIMATED";

export interface PolicePredictionBands {
  modelVersion: typeof POLICE_PREDICTION_MODEL_VERSION;
  sampleStage: PoliceSampleStage;
  coverageRate: number;
  sureMaxRank: number;
  likelyMaxRank: number;
  possibleMaxRank: number;
  sureMultiple: number;
  likelyMultiple: number;
  possibleMultiple: number;
  isReliableSample: boolean;
}

export function resolvePoliceGradeAvailability(params: {
  featureEnabled: boolean;
  calibrated?: boolean;
  participantCount: number;
  recruitCount: number;
  applicantCount: number | null;
}): PoliceGradeAvailability {
  const reasons: PoliceGradeUnavailableReason[] = [];
  const calibrated =
    (params.calibrated ?? POLICE_PREDICTION_MODEL_CALIBRATED) &&
    POLICE_SAMPLE_RANK_GRADE_OUTPUT_ENABLED;

  if (!params.featureEnabled) reasons.push("FEATURE_DISABLED");
  if (params.applicantCount === null || params.applicantCount < 1) {
    reasons.push("MISSING_APPLICANTS");
  }

  const coverageRate = params.applicantCount && params.applicantCount > 0
    ? (params.participantCount / params.applicantCount) * 100
    : 0;
  if (
    params.participantCount < POLICE_GRADE_MINIMUMS.absoluteParticipants ||
    params.participantCount < params.recruitCount * POLICE_GRADE_MINIMUMS.participantsPerRecruit ||
    coverageRate < POLICE_GRADE_MINIMUMS.coverageRate
  ) {
    reasons.push("INSUFFICIENT_SAMPLE");
  }
  if (!calibrated) reasons.push("UNCALIBRATED");

  return {
    gradeAvailability: reasons.length === 0 ? "AVAILABLE" : "UNAVAILABLE",
    unavailableReasons: reasons,
  };
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

function getSampleStage(coverageRate: number, isApplicantCountExact: boolean): PoliceSampleStage {
  if (!isApplicantCountExact) return "ESTIMATED";
  if (coverageRate < POLICE_SAMPLE_THRESHOLDS.collecting) return "INITIAL";
  if (coverageRate < POLICE_SAMPLE_THRESHOLDS.forming) return "COLLECTING";
  if (coverageRate < POLICE_SAMPLE_THRESHOLDS.reliable) return "FORMING";
  return "RELIABLE";
}

function getBandMultiples(stage: PoliceSampleStage, coverageRate: number): {
  sure: number;
  likely: number;
} {
  switch (stage) {
    case "INITIAL":
      return { sure: 0, likely: 0 };
    case "COLLECTING":
    case "ESTIMATED":
      return { sure: 0, likely: 0.8 };
    case "FORMING": {
      const progress = Math.min(
        1,
        Math.max(0, (coverageRate - POLICE_SAMPLE_THRESHOLDS.forming) / 15)
      );
      return {
        sure: roundNumber(0.75 + progress * 0.15),
        likely: 1,
      };
    }
    case "RELIABLE":
      return { sure: 0.9, likely: 1 };
  }
}

export function buildPolicePredictionBands(params: {
  recruitCount: number;
  participantCount: number;
  referenceApplicantCount: number;
  isApplicantCountExact: boolean;
  passMultiple: number;
}): PolicePredictionBands {
  if (!Number.isInteger(params.recruitCount) || params.recruitCount < 1) {
    throw new Error("경찰 모집인원은 1 이상의 정수여야 합니다.");
  }
  if (!Number.isFinite(params.passMultiple) || params.passMultiple <= 0) {
    throw new Error("경찰 필기 합격배수는 0보다 커야 합니다.");
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
    modelVersion: POLICE_PREDICTION_MODEL_VERSION,
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

export function classifyPolicePredictionGrade(
  rank: number,
  bands: PolicePredictionBands
): PolicePredictionGrade {
  if (!Number.isInteger(rank) || rank < 1) {
    throw new Error("경찰 예측 순위는 1 이상의 정수여야 합니다.");
  }
  if (bands.sureMaxRank > 0 && rank <= bands.sureMaxRank) return "확실권";
  if (bands.likelyMaxRank > 0 && rank <= bands.likelyMaxRank) return "유력권";
  if (rank <= bands.possibleMaxRank) return "가능권";
  return "도전권";
}
