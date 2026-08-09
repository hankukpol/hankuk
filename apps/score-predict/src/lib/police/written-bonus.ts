import { BonusType } from "@prisma/client";

export type PoliceWrittenBonusStatus = "NONE" | "APPLIED" | "NOT_APPLIED" | "PENDING";

export type PoliceWrittenBonusReason =
  | "NONE"
  | "APPLIED_STANDARD"
  | "APPLIED_APPLICANT_EXCEPTION"
  | "CUTOFF"
  | "BELOW_MIN_RECRUIT_COUNT"
  | "MISSING_APPLICANT_COUNT";

export interface PoliceWrittenBonusDecision {
  status: PoliceWrittenBonusStatus;
  reason: PoliceWrittenBonusReason;
  declaredRate: number;
  effectiveRate: number;
  minRecruitCount: number | null;
  message: string | null;
}

interface PoliceWrittenBonusRule {
  minRecruitCount: number;
  label: string;
}

function getRule(bonusType: BonusType): PoliceWrittenBonusRule | null {
  if (bonusType === BonusType.VETERAN_5 || bonusType === BonusType.VETERAN_10) {
    return { minRecruitCount: 4, label: "취업지원대상자" };
  }
  if (bonusType === BonusType.HERO_3 || bonusType === BonusType.HERO_5) {
    return { minRecruitCount: 10, label: "의사상자" };
  }
  return null;
}

function roundRate(value: number): number {
  return Number(value.toFixed(2));
}

/**
 * 경찰 필기 법정 가산점의 적용 여부만 판정한다.
 *
 * 표본의 합격권 인원으로 법정 가산점 수혜 상한을 추정하거나 제출을 차단하지 않는다.
 * 실제 출원인원이 모집인원 이하인 경우의 공고상 예외만 정확한 출원인원으로 판단한다.
 */
export function resolvePoliceWrittenBonus(params: {
  bonusType: BonusType;
  declaredRate: number;
  recruitCount: number;
  applicantCount: number | null;
  hasCutoff: boolean;
}): PoliceWrittenBonusDecision {
  const declaredRate = Number.isFinite(params.declaredRate)
    ? Math.min(0.1, Math.max(0, roundRate(params.declaredRate)))
    : 0;
  const rule = getRule(params.bonusType);

  if (!rule || declaredRate === 0) {
    return {
      status: "NONE",
      reason: "NONE",
      declaredRate,
      effectiveRate: 0,
      minRecruitCount: null,
      message: null,
    };
  }

  // 경찰 공고: 어느 한 과목이라도 40% 미만이면 필기 가산점 전체를 적용하지 않는다.
  if (params.hasCutoff) {
    return {
      status: "NOT_APPLIED",
      reason: "CUTOFF",
      declaredRate,
      effectiveRate: 0,
      minRecruitCount: rule.minRecruitCount,
      message: "과락 과목이 있어 필기 법정 가산점은 총점에 적용되지 않았습니다.",
    };
  }

  if (params.recruitCount >= rule.minRecruitCount) {
    return {
      status: "APPLIED",
      reason: "APPLIED_STANDARD",
      declaredRate,
      effectiveRate: declaredRate,
      minRecruitCount: rule.minRecruitCount,
      message: `${rule.label} 가산점이 필기 점수에 적용되었습니다.`,
    };
  }

  if (params.applicantCount === null) {
    return {
      status: "PENDING",
      reason: "MISSING_APPLICANT_COUNT",
      declaredRate,
      effectiveRate: 0,
      minRecruitCount: rule.minRecruitCount,
      message: `출원인원 확인 전까지 ${rule.label} 가산점은 잠정 미적용됩니다. 출원인원 확정 후 자동 재채점됩니다.`,
    };
  }

  if (params.applicantCount <= params.recruitCount) {
    return {
      status: "APPLIED",
      reason: "APPLIED_APPLICANT_EXCEPTION",
      declaredRate,
      effectiveRate: declaredRate,
      minRecruitCount: rule.minRecruitCount,
      message: `출원인원이 모집인원 이하인 예외 규정에 따라 ${rule.label} 가산점이 적용되었습니다.`,
    };
  }

  return {
    status: "NOT_APPLIED",
    reason: "BELOW_MIN_RECRUIT_COUNT",
    declaredRate,
    effectiveRate: 0,
    minRecruitCount: rule.minRecruitCount,
    message: `${rule.label} 가산점은 모집인원 ${rule.minRecruitCount}명 미만 지역이어서 적용되지 않았습니다.`,
  };
}
