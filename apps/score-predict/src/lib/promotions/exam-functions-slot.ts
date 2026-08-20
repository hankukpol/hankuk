export const PROMOTION_EXAM_FUNCTIONS_SLOT =
  '<div data-promotion-exam-functions-slot="true"></div>';

export function splitPromotionAtExamFunctionsSlot(htmlDocument: string) {
  const slotIndex = htmlDocument.indexOf(PROMOTION_EXAM_FUNCTIONS_SLOT);
  if (slotIndex < 0) return null;

  const styleDocument = Array.from(htmlDocument.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi))
    .map((match) => match[0])
    .join("\n");
  const mainStart = htmlDocument.match(/<main\b[^>]*>/i)?.[0];
  if (!styleDocument || !mainStart) return null;

  const beforeSlot = htmlDocument.slice(0, slotIndex);
  const afterSlot = htmlDocument.slice(
    slotIndex + PROMOTION_EXAM_FUNCTIONS_SLOT.length,
  );

  return {
    beforeHtmlDocument: `${beforeSlot}</main>`,
    afterHtmlDocument: `${styleDocument}\n${mainStart}${afterSlot}`,
  };
}
