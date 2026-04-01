import type { PaymentCategoryItem } from "@/lib/services/payment.service";

export function getKstToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function findDefaultPaymentCategoryId(
  categories: PaymentCategoryItem[],
  preferredNames: string[],
) {
  const preferred = categories.find((category) => preferredNames.includes(category.name));
  return preferred?.id ?? categories[0]?.id ?? "";
}
