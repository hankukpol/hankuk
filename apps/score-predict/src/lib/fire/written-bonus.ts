import { BonusType } from "@prisma/client";

export type FireWrittenBonusStatus = "NONE" | "APPLIED" | "NOT_APPLIED";

export type FireWrittenBonusReason =
  | "NONE"
  | "APPLIED_STANDARD"
  | "CUTOFF"
  | "BELOW_MIN_RECRUIT_COUNT";

export interface FireWrittenBonusDecision {
  status: FireWrittenBonusStatus;
  reason: FireWrittenBonusReason;
  declaredRate: number;
  effectiveRate: number;
  minRecruitCount: number | null;
  message: string | null;
}

interface FireWrittenBonusRule {
  minRecruitCount: number;
  label: string;
}

function getRule(bonusType: BonusType): FireWrittenBonusRule | null {
  if (bonusType === BonusType.VETERAN_5 || bonusType === BonusType.VETERAN_10) {
    return { minRecruitCount: 4, label: "취업지원대상자" };
  }
  if (bonusType === BonusType.HERO_3 || bonusType === BonusType.HERO_5) {
    return { minRecruitCount: 10, label: "의사상자" };
  }
  return null;
}

function normalizeRate(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(0.1, Math.max(0, Number(value.toFixed(2))));
}

/**
 * 2026 소방청 공고의 필기 법정 가산점 적용 자격만 판정한다.
 * 법정 수혜 상한은 실제 시험 결과로 확정할 사항이므로 서비스 입력 표본으로
 * 추정하거나 답안 제출을 차단하지 않는다.
 */
export function resolveFireWrittenBonus(params: {
  bonusType: BonusType;
  declaredRate: number;
  recruitCount: number;
}): FireWrittenBonusDecision {
  const declaredRate = normalizeRate(params.declaredRate);
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

  if (params.recruitCount < rule.minRecruitCount) {
    return {
      status: "NOT_APPLIED",
      reason: "BELOW_MIN_RECRUIT_COUNT",
      declaredRate,
      effectiveRate: 0,
      minRecruitCount: rule.minRecruitCount,
      message: `${rule.label} 가산점은 모집인원 ${rule.minRecruitCount}명 미만 모집단이어서 적용되지 않았습니다. 답안과 성적은 정상 접수되었습니다.`,
    };
  }

  return {
    status: "APPLIED",
    reason: "APPLIED_STANDARD",
    declaredRate,
    effectiveRate: declaredRate,
    minRecruitCount: rule.minRecruitCount,
    message: `${rule.label} 가산점은 필기시험 과목별 40% 이상 득점에 적용되었습니다.`,
  };
}

export function finalizeFireWrittenBonus(
  decision: FireWrittenBonusDecision,
  appliedBonusScore: number
): FireWrittenBonusDecision {
  if (decision.status !== "APPLIED" || appliedBonusScore > 0) {
    return decision;
  }

  return {
    ...decision,
    status: "NOT_APPLIED",
    reason: "CUTOFF",
    message: "필기 과락 기준으로 법정 가산점이 총점에 적용되지 않았습니다.",
  };
}
