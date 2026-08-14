import type { TenantType } from "@/lib/tenant";

export const CUSTOM_HTML_PROMOTION_TEMPLATE_KEY = "custom-html-v1" as const;
export const CUSTOM_HTML_PROMOTION_TEMPLATE_VERSION = 1;

export interface CustomHtmlPromotionContent {
  htmlDocument: string;
}

export type PromotionTemplateContent = CustomHtmlPromotionContent;
export type PromotionTemplateKey = typeof CUSTOM_HTML_PROMOTION_TEMPLATE_KEY;

export interface PromotionTemplateDefinition {
  key: PromotionTemplateKey;
  version: number;
  label: string;
  editorKind: "HTML";
  tenantTypes: TenantType[];
}

const CUSTOM_HTML_STARTER = `<!-- 피그마에서 내보낸 HTML과 CSS를 이곳에 붙여 넣으세요. -->
<style>
  body { margin: 0; font-family: "Noto Sans KR", sans-serif; }
  .landing-preview { min-height: 560px; display: grid; place-items: center; background: #f8fafc; color: #334155; }
</style>
<main class="landing-preview">
  <p>HTML/CSS 코드를 붙여 넣으면 이 영역에 미리보기가 표시됩니다.</p>
</main>`;

export const DEFAULT_CUSTOM_HTML_PROMOTION_CONTENT: CustomHtmlPromotionContent = {
  htmlDocument: CUSTOM_HTML_STARTER,
};

export const PROMOTION_TEMPLATE_DEFINITIONS: PromotionTemplateDefinition[] = [
  {
    key: CUSTOM_HTML_PROMOTION_TEMPLATE_KEY,
    version: CUSTOM_HTML_PROMOTION_TEMPLATE_VERSION,
    label: "HTML/CSS 자유 랜딩",
    editorKind: "HTML",
    tenantTypes: ["police", "fire"],
  },
];

export function getPromotionTemplatesForTenant(tenantType: TenantType) {
  return PROMOTION_TEMPLATE_DEFINITIONS.filter((template) => template.tenantTypes.includes(tenantType));
}

export function getPromotionTemplateDefinition(templateKey: string) {
  return PROMOTION_TEMPLATE_DEFINITIONS.find((template) => template.key === templateKey) ?? null;
}

export function getDefaultPromotionTemplateContent(templateKey: string): PromotionTemplateContent | null {
  if (templateKey === CUSTOM_HTML_PROMOTION_TEMPLATE_KEY) return { ...DEFAULT_CUSTOM_HTML_PROMOTION_CONTENT };
  return null;
}

export function isCustomHtmlPromotionContent(value: unknown): value is CustomHtmlPromotionContent {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      typeof (value as { htmlDocument?: unknown }).htmlDocument === "string",
  );
}
