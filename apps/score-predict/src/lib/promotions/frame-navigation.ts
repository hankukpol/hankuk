function escapeHtmlAttribute(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function replaceAnchorTarget(anchorTag: string, fromHash: string, toHref: string) {
  const escapedHash = fromHash.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const hrefPattern = new RegExp(`\\bhref\\s*=\\s*(["'])\\/?${escapedHash}\\1`, "i");
  if (!hrefPattern.test(anchorTag)) return anchorTag;

  const withoutTarget = anchorTag.replace(
    /\s+target\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,
    "",
  );
  return withoutTarget
    .replace(hrefPattern, `href="${escapeHtmlAttribute(toHref)}"`)
    .replace(/>$/, ' target="_top">');
}

/**
 * srcDoc iframe 안의 주요 CTA를 부모 페이지의 안전한 경로로 변환한다.
 * Safari에서는 sandbox iframe의 DOM을 부모가 읽지 못할 수 있으므로,
 * 클릭 이벤트 브리지에 의존하지 않고 브라우저 기본 top-navigation을 사용한다.
 */
export function rewritePromotionFrameNavigation(
  htmlDocument: string,
  { examFunctionsHref }: { examFunctionsHref: string },
) {
  return htmlDocument.replace(/<a\b[^>]*>/gi, (anchorTag) =>
    replaceAnchorTarget(anchorTag, "#exam-functions", examFunctionsHref),
  );
}
