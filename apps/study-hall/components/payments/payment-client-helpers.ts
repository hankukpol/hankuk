import { getKstTodayYmd } from "@/lib/date-utils";

import type { PaymentCategoryItem } from "@/lib/services/payment.service";

/** @deprecated 새 코드는 @/lib/date-utils 의 getKstTodayYmd 를 직접 쓴다. */
export function getKstToday() {
  return getKstTodayYmd();
}

export function findDefaultPaymentCategoryId(
  categories: PaymentCategoryItem[],
  preferredNames: string[],
) {
  const preferred = categories.find((category) => preferredNames.includes(category.name));
  return preferred?.id ?? categories[0]?.id ?? "";
}
