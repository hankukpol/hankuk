export const DEFAULT_PAYMENT_CATEGORY_NAMES = ["등록비", "월납부", "교재비", "환불"] as const;

export const PAYMENT_API_MESSAGES = {
  listError: "수납 내역을 불러오는 중 오류가 발생했습니다.",
  paymentSchemaError: "수납 정보를 다시 확인해 주세요.",
  createError: "수납 처리 중 오류가 발생했습니다.",
  updateError: "수납 수정 중 오류가 발생했습니다.",
  deleteError: "수납 삭제 중 오류가 발생했습니다.",
  enrollSchemaError: "신규 등록 수납 정보를 다시 확인해 주세요.",
  enrollError: "신규 등록 수납 처리 중 오류가 발생했습니다.",
  renewSchemaError: "연장 수납 정보를 다시 확인해 주세요.",
  renewError: "연장 수납 처리 중 오류가 발생했습니다.",
  batchSchemaError: "분할 결제 정보를 다시 확인해 주세요.",
  batchError: "분할 결제 처리 중 오류가 발생했습니다.",
  refundSchemaError: "환불 정보를 다시 확인해 주세요.",
  refundError: "환불 처리 중 오류가 발생했습니다.",
  settlementDate: "정산 날짜",
  settlementRangeRequired: "date 또는 dateFrom/dateTo 쿼리가 필요합니다.",
  settlementStartDate: "정산 시작일",
  settlementEndDate: "정산 종료일",
  settlementError: "정산 정보를 불러오는 중 오류가 발생했습니다.",
} as const;

export const REFUND_MODAL_TEXT = {
  refund: "환불",
  refundTitle: "환불 처리",
  refundDescription: "납부 묶음 기준으로 환불을 처리합니다.",
  targetStudent: "대상 학생",
  selectStudent: "학생 선택",
  selectStudentPlaceholder: "학생을 선택해 주세요",
  totalPaid: "총 납부",
  totalRefunded: "기환불",
  remainingRefundable: "잔여 환불 가능액",
  mode: "환불 방식",
  simpleRefund: "일반 환불",
  cardFullCancel: "카드 전체취소 + 재결제",
  paymentGroup: "납부 묶음",
  noPaymentGroup: "납부 묶음 없음",
  selectOriginalPayment: "원결제를 선택해 주세요",
  selectCardOriginalPayment: "카드 원결제를 선택해 주세요",
  groupPayments: "묶음 결제 목록",
  refundAmount: "환불 금액",
  refundMethod: "환불 방법",
  memo: "메모",
  refundMemoPlaceholder: "예: 이용 기간 미사용분 환불",
  rechargeAmount: "재결제 금액",
  rechargePaymentType: "재결제 수납 유형",
  selectPlaceholder: "선택해 주세요",
  refundMemo: "환불 메모",
  refundMemoCardPlaceholder: "예: 중도 해지 전체취소",
  rechargeMemo: "재결제 메모",
  rechargeMemoPlaceholder: "예: 카드 재결제 (공제 후)",
  cancel: "취소",
  submit: "환불 처리 완료",
  validateSelection: "학생, 납부 묶음, 원결제를 확인해 주세요.",
  validateRefundAmountPrefix: "환불 금액은 1원 이상 ",
  validateRefundAmountSuffix: "원 이하로 입력해 주세요.",
  refundFailed: "환불 처리에 실패했습니다.",
  cardOnly: "카드 결제만 전체취소할 수 있습니다.",
  rechargeAmountInvalid: "재결제 금액은 1원 이상이며 원결제 금액보다 작아야 합니다.",
  selectRechargePaymentType: "재결제 수납 유형을 선택해 주세요.",
  cardCancelPrefix: "카드 전체취소 (",
  rechargeDefaultNote: "카드 재결제 (공제 후)",
  cardRefundFailed: "카드 환불 처리에 실패했습니다.",
} as const;

export const PAYMENT_METHODS = [
  { value: "card", label: "카드" },
  { value: "cash", label: "현금" },
  { value: "bank-transfer", label: "계좌이체" },
  { value: "point", label: "포인트" },
  { value: "other", label: "기타" },
] as const;

export type PaymentMethodValue = (typeof PAYMENT_METHODS)[number]["value"];

const PAYMENT_METHOD_LABEL_MAP = new Map<string, string>(
  PAYMENT_METHODS.map((method) => [method.value, method.label]),
);

const PAYMENT_METHOD_ALIAS_MAP = new Map<string, PaymentMethodValue>([
  ["card", "card"],
  ["카드", "card"],
  ["cash", "cash"],
  ["현금", "cash"],
  ["bank-transfer", "bank-transfer"],
  ["bank transfer", "bank-transfer"],
  ["account-transfer", "bank-transfer"],
  ["account transfer", "bank-transfer"],
  ["계좌이체", "bank-transfer"],
  ["point", "point"],
  ["포인트", "point"],
  ["other", "other"],
  ["기타", "other"],
]);

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("ko-KR").format(amount);
}

export function formatPaymentMonth(value: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    return value;
  }

  const [year, month] = value.split("-");
  return `${year}년 ${Number(month)}월`;
}

export function getPaymentMethodLabel(value: PaymentMethodValue) {
  return PAYMENT_METHOD_LABEL_MAP.get(value) ?? value;
}

export function parseStoredPaymentMethod(value: string | null | undefined): {
  value: PaymentMethodValue;
  customLabel: string | null;
} | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed.toLowerCase().startsWith("other:")) {
    const customLabel = trimmed.slice("other:".length).trim();
    return {
      value: "other",
      customLabel: customLabel || null,
    };
  }

  const normalized = PAYMENT_METHOD_ALIAS_MAP.get(trimmed.toLowerCase()) ?? PAYMENT_METHOD_ALIAS_MAP.get(trimmed);

  if (normalized) {
    return {
      value: normalized,
      customLabel: null,
    };
  }

  return {
    value: "other",
    customLabel: trimmed,
  };
}

export function normalizePaymentMethodValue(value: string | null | undefined) {
  return parseStoredPaymentMethod(value)?.value ?? null;
}

export function serializePaymentMethodValue(
  value: string | null | undefined,
  customLabel?: string | null,
) {
  const parsed = parseStoredPaymentMethod(value);
  const methodValue = parsed?.value ?? (value?.trim() ? "other" : null);

  if (!methodValue) {
    return null;
  }

  if (methodValue !== "other") {
    return methodValue;
  }

  const detail = (customLabel ?? parsed?.customLabel ?? "").trim();
  return detail ? `other:${detail}` : "other";
}

export function formatPaymentMethod(value: string | null | undefined) {
  const parsed = parseStoredPaymentMethod(value);

  if (!parsed) {
    return "방법 미기록";
  }

  if (parsed.value === "other" && parsed.customLabel) {
    return `기타 (${parsed.customLabel})`;
  }

  return getPaymentMethodLabel(parsed.value);
}
