export const DEFAULT_PAYMENT_CATEGORY_NAMES = ["등록비", "월납부", "교재비", "환불"] as const;

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
