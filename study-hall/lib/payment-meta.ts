export const DEFAULT_PAYMENT_CATEGORY_NAMES = ["등록비", "월납부", "교재비"] as const;

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

export function formatPaymentMethod(value: string | null | undefined) {
  if (!value) {
    return "방법 미기록";
  }

  const normalized = value.trim().toLowerCase();

  switch (normalized) {
    case "bank-transfer":
    case "bank transfer":
    case "account-transfer":
    case "account transfer":
      return "계좌이체";
    case "card":
      return "카드";
    case "cash":
      return "현금";
    default:
      return value;
  }
}
