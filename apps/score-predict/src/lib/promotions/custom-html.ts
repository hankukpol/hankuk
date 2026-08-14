import sanitizeHtml from "sanitize-html";
import {
  DEFAULT_CUSTOM_HTML_PROMOTION_CONTENT,
  type CustomHtmlPromotionContent,
} from "@/lib/promotions/template-registry";

export const CUSTOM_HTML_MAX_LENGTH = 2_000_000;

function resolveUrl(rawValue: string, baseUrl: string | null) {
  const value = rawValue.trim();
  if (!value || value.startsWith("#") || /^(?:mailto|tel):/i.test(value)) return value;
  try {
    const parsed = baseUrl ? new URL(value, baseUrl) : new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return value.startsWith("/") || value.startsWith("./") || value.startsWith("../") ? "" : value;
  }
}

function resolveSrcSet(rawValue: string, baseUrl: string | null) {
  return rawValue
    .split(",")
    .map((candidate) => {
      const [url, ...descriptor] = candidate.trim().split(/\s+/);
      const resolved = resolveUrl(url ?? "", baseUrl);
      return resolved ? [resolved, ...descriptor].join(" ") : "";
    })
    .filter(Boolean)
    .join(", ");
}

function rewriteCssUrls(css: string, baseUrl: string | null) {
  if (!baseUrl) return css;
  return css
    .replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (_full, _quote, rawUrl: string) => {
      const resolved = resolveUrl(rawUrl, baseUrl);
      return resolved ? `url("${resolved.replace(/"/g, "%22")}")` : "none";
    })
    .replace(/@import\s+(["'])([^"']+)\1/gi, (_full, quote: string, rawUrl: string) => {
      const resolved = resolveUrl(rawUrl, baseUrl);
      return resolved ? `@import ${quote}${resolved}${quote}` : "";
    });
}

function readBaseUrl(source: string) {
  const match = source.match(/<base\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/i);
  const value = match?.[1] ?? match?.[2] ?? match?.[3];
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function sanitizeCustomHtmlDocument(input: string) {
  const source = input.slice(0, CUSTOM_HTML_MAX_LENGTH);
  const baseUrl = readBaseUrl(source);
  const sourceWithResolvedStyles = source.replace(/<base\b[^>]*>/gi, "").replace(
    /(<style\b[^>]*>)([\s\S]*?)(<\/style\s*>)/gi,
    (_full, open: string, css: string, close: string) => `${open}${rewriteCssUrls(css, baseUrl)}${close}`,
  );

  return sanitizeHtml(sourceWithResolvedStyles, {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      "article", "aside", "details", "figcaption", "figure", "footer", "header", "main",
      "button", "img", "link", "nav", "picture", "section", "source", "style", "summary", "title",
      "svg", "g", "defs", "symbol", "use", "clipPath", "mask", "linearGradient", "radialGradient",
      "stop", "path", "circle", "ellipse", "line", "polygon", "polyline", "rect",
    ],
    allowVulnerableTags: true,
    allowedAttributes: {
      "*": ["class", "dir", "id", "lang", "role", "style", "title", "data-*", "aria-*"],
      a: ["href", "rel", "target"],
      img: ["alt", "decoding", "height", "loading", "sizes", "src", "srcset", "width"],
      link: ["href", "media", "rel", "type"],
      source: ["media", "sizes", "src", "srcset", "type"],
      button: ["aria-label", "disabled", "type"],
      svg: ["aria-hidden", "fill", "focusable", "height", "preserveAspectRatio", "stroke", "stroke-width", "viewBox", "width", "xmlns"],
      g: ["clip-path", "fill", "mask", "stroke", "transform"],
      path: ["d", "fill", "fill-rule", "stroke", "stroke-linecap", "stroke-linejoin", "stroke-width", "transform"],
      circle: ["cx", "cy", "fill", "r", "stroke", "stroke-width"],
      ellipse: ["cx", "cy", "fill", "rx", "ry", "stroke", "stroke-width"],
      line: ["stroke", "stroke-width", "x1", "x2", "y1", "y2"],
      polygon: ["fill", "points", "stroke", "stroke-width"],
      polyline: ["fill", "points", "stroke", "stroke-width"],
      rect: ["fill", "height", "rx", "ry", "stroke", "stroke-width", "width", "x", "y"],
      use: ["href", "x", "xlink:href", "y"],
      stop: ["offset", "stop-color", "stop-opacity"],
      table: ["cellpadding", "cellspacing"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan", "scope"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesAppliedToAttributes: ["href", "src"],
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          href: resolveUrl(attribs.href ?? "", baseUrl),
          ...(attribs.target === "_blank" ? { rel: "noopener noreferrer" } : {}),
        },
      }),
      img: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          src: resolveUrl(attribs.src ?? "", baseUrl),
          ...(attribs.srcset ? { srcset: resolveSrcSet(attribs.srcset, baseUrl) } : {}),
        },
      }),
      link: (tagName, attribs) => ({
        tagName,
        attribs: attribs.rel?.toLowerCase() === "stylesheet"
          ? { ...attribs, href: resolveUrl(attribs.href ?? "", baseUrl), rel: "stylesheet" }
          : {},
      }),
      source: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          ...(attribs.src ? { src: resolveUrl(attribs.src, baseUrl) } : {}),
          ...(attribs.srcset ? { srcset: resolveSrcSet(attribs.srcset, baseUrl) } : {}),
        },
      }),
      style: (tagName, attribs) => ({ tagName, attribs }),
    },
    exclusiveFilter: (frame) => {
      if (frame.tag === "link") return frame.attribs.rel !== "stylesheet" || !frame.attribs.href;
      if ((frame.tag === "a" || frame.tag === "img") && !(frame.attribs.href || frame.attribs.src)) return false;
      return false;
    },
  }).trim();
}

export function normalizeCustomHtmlPromotionContent(value: unknown): CustomHtmlPromotionContent {
  const htmlDocument = value && typeof value === "object" && !Array.isArray(value)
    ? (value as { htmlDocument?: unknown }).htmlDocument
    : undefined;
  return {
    htmlDocument: sanitizeCustomHtmlDocument(
      typeof htmlDocument === "string"
        ? htmlDocument
        : DEFAULT_CUSTOM_HTML_PROMOTION_CONTENT.htmlDocument,
    ),
  };
}
