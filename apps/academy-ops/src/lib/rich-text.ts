import DOMPurify from "isomorphic-dompurify";

const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "em",
  "u",
  "s",
  "ul",
  "ol",
  "li",
  "blockquote",
  "h2",
  "h3",
  "a",
];

const ALLOWED_ATTR = ["href", "target", "rel"];

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function readAttribute(tag: string, name: string) {
  const matched = tag.match(new RegExp(`\\b${name}=(["'])(.*?)\\1`, "i"));
  return matched?.[2] ?? null;
}

function isLikelyHtml(value: string) {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

function convertPlainTextToHtml(value: string) {
  return value
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

function normalizeAnchorTag(tag: string) {
  const href = readAttribute(tag, "href");
  const target = readAttribute(tag, "target");
  const rel = readAttribute(tag, "rel");

  if ((target ?? "").toLowerCase() !== "_blank") {
    return tag;
  }

  const relTokens = new Set(
    (rel ?? "")
      .split(/\s+/)
      .map((token) => token.trim().toLowerCase())
      .filter(Boolean),
  );
  relTokens.add("noopener");
  relTokens.add("noreferrer");

  const attributes = [
    href ? `href="${escapeHtml(decodeHtmlEntities(href))}"` : null,
    'target="_blank"',
    `rel="${escapeHtml(Array.from(relTokens).join(" "))}"`,
  ].filter(Boolean);

  return `<a ${attributes.join(" ")}>`;
}

function hardenAnchorTargets(value: string) {
  return value.replace(/<a\b[^>]*>/gi, (tag) => normalizeAnchorTag(tag));
}

function collapsePlainTextWhitespace(value: string) {
  return decodeHtmlEntities(value)
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function inlineRichTextToPlainText(value: string): string {
  const withLinks = value.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (_match, attrs, text) => {
    const href = readAttribute(`<a ${attrs}>`, "href");
    const label = inlineRichTextToPlainText(text).trim();
    const normalizedHref = href ? decodeHtmlEntities(href).trim() : "";

    if (!normalizedHref) {
      return label;
    }

    if (!label) {
      return normalizedHref;
    }

    return label.includes(normalizedHref) ? label : `${label} (${normalizedHref})`;
  });

  const stripped = withLinks
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h2|h3|blockquote)>/gi, "\n\n")
    .replace(/<(p|h2|h3|blockquote)\b[^>]*>/gi, "")
    .replace(/<[^>]+>/g, " ");

  return collapsePlainTextWhitespace(stripped);
}

function listBlockToPlainText(value: string, ordered: boolean) {
  const items = Array.from(value.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi))
    .map((matched) => inlineRichTextToPlainText(matched[1]))
    .filter(Boolean);

  if (items.length === 0) {
    return "";
  }

  return items
    .map((item, index) => `${ordered ? `${index + 1}.` : "-"} ${item}`)
    .join("\n");
}

export function normalizeRichTextHtml(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  return isLikelyHtml(trimmed) ? trimmed : convertPlainTextToHtml(trimmed);
}

export function sanitizeRichTextHtml(value: string) {
  const normalized = normalizeRichTextHtml(value);
  const sanitized = DOMPurify.sanitize(normalized, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ["script", "style"],
    FORBID_ATTR: ["style", "onerror", "onclick"],
  });

  return hardenAnchorTargets(sanitized);
}

export function richTextToPlainText(value: string) {
  const sanitized = sanitizeRichTextHtml(value);
  const withLists = sanitized
    .replace(/<ol\b[^>]*>([\s\S]*?)<\/ol>/gi, (_match, items) => `${listBlockToPlainText(items, true)}\n\n`)
    .replace(/<ul\b[^>]*>([\s\S]*?)<\/ul>/gi, (_match, items) => `${listBlockToPlainText(items, false)}\n\n`);

  return inlineRichTextToPlainText(withLists);
}
