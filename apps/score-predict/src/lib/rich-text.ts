import { sanitizeBannerHtml } from "@/lib/sanitize-banner-html";

export function sanitizeRichTextHtml(input: string): string {
  return sanitizeBannerHtml(input);
}

export function richTextToPlainText(input: string): string {
  return sanitizeRichTextHtml(input)
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|blockquote|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

export function hasMeaningfulRichText(input: string): boolean {
  const sanitized = sanitizeRichTextHtml(input);
  return richTextToPlainText(sanitized).length > 0 || /<(img|hr)\b/i.test(sanitized);
}
