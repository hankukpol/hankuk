import "server-only";

import { normalizeCustomHtmlPromotionContent } from "@/lib/promotions/custom-html";
import { CUSTOM_HTML_PROMOTION_TEMPLATE_KEY } from "@/lib/promotions/template-registry";

export function normalizePromotionTemplateContent(templateKey: string, value: unknown) {
  if (templateKey === CUSTOM_HTML_PROMOTION_TEMPLATE_KEY) return normalizeCustomHtmlPromotionContent(value);
  throw new Error("UNSUPPORTED_PROMOTION_TEMPLATE");
}
