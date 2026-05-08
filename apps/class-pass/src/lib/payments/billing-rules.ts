export const DISCOUNT_WITH_EXEMPT_BILLING_MESSAGE =
  '무료 수강/수납 면제는 할인 금액과 함께 저장할 수 없습니다. 포인트 사용은 무료/면제를 끄고 결제 수단 "포인트"로 입력해 주세요.'

export const POINT_REASON_WITH_EXEMPT_BILLING_MESSAGE =
  '포인트 사용은 무료/면제 사유가 아니라 결제 수단 "포인트"로 입력해 주세요.'

export function hasPointLikeTuitionExemptReason(reason: string | null | undefined) {
  return /포인트|\bpoint\b/i.test(reason ?? '')
}

export function getTuitionExemptBillingRuleError(input: {
  tuitionExempt?: boolean | null
  discountAmount?: number | null
  tuitionExemptReason?: string | null
}) {
  if (!input.tuitionExempt) {
    return null
  }

  if (Number(input.discountAmount ?? 0) > 0) {
    return DISCOUNT_WITH_EXEMPT_BILLING_MESSAGE
  }

  if (hasPointLikeTuitionExemptReason(input.tuitionExemptReason)) {
    return POINT_REASON_WITH_EXEMPT_BILLING_MESSAGE
  }

  return null
}
