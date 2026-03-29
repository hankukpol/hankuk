const ALLOWED_TAGS = new Set([
  "a",
  "article",
  "b",
  "blockquote",
  "br",
  "code",
  "del",
  "div",
  "em",
  "figcaption",
  "figure",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "li",
  "ol",
  "p",
  "pre",
  "section",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
]);

const URL_ATTRS = new Set(["href", "src"]);
const GLOBAL_ALLOWED_ATTRS = new Set(["class", "dir", "id", "lang", "role", "style", "title"]);
const PER_TAG_ALLOWED_ATTRS: Record<string, ReadonlySet<string>> = {
  a: new Set(["href", "rel", "target"]),
  img: new Set(["alt", "decoding", "height", "loading", "src", "width"]),
  td: new Set(["colspan", "rowspan"]),
  th: new Set(["colspan", "rowspan", "scope"]),
};

const BLOCK_TAGS_WITH_CONTENT = ["script", "style", "iframe", "object", "embed", "applet", "template", "svg", "math"];
const BLOCK_STANDALONE_TAGS = ["base", "form", "frame", "frameset", "input", "link", "meta", "select", "textarea"];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function sanitizeCss(styleValue: string): string | null {
  const declarations = styleValue.split(";");
  const safeDeclarations: string[] = [];

  for (const declaration of declarations) {
    const separatorIndex = declaration.indexOf(":");
    if (separatorIndex <= 0) continue;

    const property = declaration.slice(0, separatorIndex).trim().toLowerCase();
    if (!property || !/^[a-z-]+$/.test(property)) continue;

    const value = declaration.slice(separatorIndex + 1).replace(/[\u0000-\u001F\u007F]/g, "").trim();
    if (!value) continue;

    const lowered = value.toLowerCase();
    if (
      lowered.includes("expression(") ||
      lowered.includes("javascript:") ||
      lowered.includes("vbscript:") ||
      lowered.includes("behavior:") ||
      lowered.includes("@import") ||
      lowered.includes("url(")
    ) {
      continue;
    }

    safeDeclarations.push(`${property}: ${value}`);
  }

  return safeDeclarations.length > 0 ? safeDeclarations.join("; ") : null;
}

function sanitizeUrl(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  const compact = trimmed.replace(/[\u0000-\u001F\u007F\s]+/g, "");
  if (!compact) return null;

  if (compact.startsWith("//")) return null;

  const lowered = compact.toLowerCase();
  if (lowered.startsWith("javascript:") || lowered.startsWith("data:") || lowered.startsWith("vbscript:")) {
    return null;
  }

  if (compact.startsWith("/") || compact.startsWith("#") || compact.startsWith("./") || compact.startsWith("../")) {
    return trimmed;
  }

  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(compact);
  if (!hasScheme) {
    return trimmed;
  }

  try {
    const parsed = new URL(compact);
    if (parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "mailto:" || parsed.protocol === "tel:") {
      return trimmed;
    }
  } catch {
    return null;
  }

  return null;
}

function sanitizeRelValue(relValue: string): string | null {
  const allowedTokens = new Set(["nofollow", "noopener", "noreferrer", "ugc"]);
  const safeTokens = relValue
    .split(/\s+/)
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length > 0 && allowedTokens.has(token));
  if (safeTokens.length < 1) return null;
  return Array.from(new Set(safeTokens)).join(" ");
}

function isAllowedAttribute(tagName: string, attributeName: string): boolean {
  if (attributeName.startsWith("on")) return false;
  if (attributeName === "srcdoc") return false;
  if (attributeName.startsWith("data-") || attributeName.startsWith("aria-")) return true;
  if (GLOBAL_ALLOWED_ATTRS.has(attributeName)) return true;
  const perTagAllowed = PER_TAG_ALLOWED_ATTRS[tagName];
  return Boolean(perTagAllowed?.has(attributeName));
}

function sanitizeAttributeValue(tagName: string, attributeName: string, rawValue: string | null): string | null {
  if (rawValue === null) {
    return null;
  }

  if (URL_ATTRS.has(attributeName)) {
    const safeUrl = sanitizeUrl(rawValue);
    if (!safeUrl) return null;

    if (attributeName === "src" && /^[a-z][a-z0-9+.-]*:/i.test(safeUrl)) {
      try {
        const parsed = new URL(safeUrl);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          return null;
        }
      } catch {
        return null;
      }
    }

    return safeUrl;
  }

  if (attributeName === "style") {
    return sanitizeCss(rawValue);
  }

  if (attributeName === "target" && tagName === "a") {
    const lowered = rawValue.trim().toLowerCase();
    if (lowered === "_blank" || lowered === "_self" || lowered === "_parent" || lowered === "_top") {
      return lowered;
    }
    return null;
  }

  if (attributeName === "rel" && tagName === "a") {
    return sanitizeRelValue(rawValue);
  }

  return rawValue.trim();
}

function sanitizeAttributes(tagName: string, rawAttributes: string): string {
  const attrPattern = /([^\s"'=<>`/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  const safeAttrs: string[] = [];
  let targetValue: string | null = null;
  let relValue: string | null = null;
  let match: RegExpExecArray | null;

  while ((match = attrPattern.exec(rawAttributes)) !== null) {
    const attrName = match[1]?.toLowerCase();
    if (!attrName || !isAllowedAttribute(tagName, attrName)) continue;

    const rawValue = match[2] ?? match[3] ?? match[4] ?? null;
    const safeValue = sanitizeAttributeValue(tagName, attrName, rawValue);
    if (safeValue === null || safeValue.length < 1) continue;

    if (attrName === "target") {
      targetValue = safeValue;
    }
    if (attrName === "rel") {
      relValue = safeValue;
    }

    safeAttrs.push(` ${attrName}="${escapeHtmlAttribute(safeValue)}"`);
  }

  if (tagName === "a" && targetValue === "_blank") {
    const tokens = new Set((relValue ?? "").split(/\s+/).filter((token) => token.length > 0));
    tokens.add("noopener");
    tokens.add("noreferrer");
    const normalizedRel = Array.from(tokens).join(" ").trim();

    const hasRelAttr = safeAttrs.some((attr) => attr.startsWith(" rel="));
    if (hasRelAttr) {
      for (let i = 0; i < safeAttrs.length; i += 1) {
        if (safeAttrs[i].startsWith(" rel=")) {
          safeAttrs[i] = ` rel="${escapeHtmlAttribute(normalizedRel)}"`;
          break;
        }
      }
    } else {
      safeAttrs.push(` rel="${escapeHtmlAttribute(normalizedRel)}"`);
    }
  }

  return safeAttrs.join("");
}

function stripBlockedTags(html: string): string {
  let sanitized = html;

  for (const tagName of BLOCK_TAGS_WITH_CONTENT) {
    const pattern = new RegExp(`<${escapeRegExp(tagName)}\\b[^>]*>[\\s\\S]*?<\\/${escapeRegExp(tagName)}\\s*>`, "gi");
    sanitized = sanitized.replace(pattern, "");
  }

  for (const tagName of BLOCK_STANDALONE_TAGS) {
    const pattern = new RegExp(`<\\/?${escapeRegExp(tagName)}\\b[^>]*>`, "gi");
    sanitized = sanitized.replace(pattern, "");
  }

  return sanitized;
}

export function sanitizeBannerHtml(input: string): string {
  if (!input) return "";

  const withoutComments = input.replace(/<!--[\s\S]*?-->/g, "");
  const blockedRemoved = stripBlockedTags(withoutComments);

  const sanitized = blockedRemoved.replace(/<\/?([a-zA-Z][a-zA-Z0-9:-]*)(\s[^>]*)?\s*\/?>/g, (fullTag, rawTagName, rawAttrs = "") => {
    const tagName = rawTagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tagName)) {
      return "";
    }

    const isClosingTag = fullTag.startsWith("</");
    if (isClosingTag) {
      return `</${tagName}>`;
    }

    const isSelfClosing = /\/>$/.test(fullTag) || tagName === "br" || tagName === "hr" || tagName === "img";
    const safeAttrs = sanitizeAttributes(tagName, rawAttrs);
    return isSelfClosing ? `<${tagName}${safeAttrs} />` : `<${tagName}${safeAttrs}>`;
  });

  return sanitized.trim();
}
