"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { rewritePromotionFrameNavigation } from "@/lib/promotions/frame-navigation";

const FRAME_BASE_STYLES = `<style>
html, body { margin: 0; min-width: 0; padding: 0; }
/* display:flow-root 로 body 를 BFC 로 만든다.
   이게 없으면 마지막 자식의 margin-bottom 이 body 밖으로 collapse 되어
   높이 계산(getBoundingClientRect)에서 빠지고, 프로모션 아래에 빈 띠가 남는다. */
body { overflow-x: hidden; display: flow-root; }
</style>`;

const FRAME_MOTION_STYLES = `<style data-promotion-frame-motion>
[data-aos], [data-reveal] {
  --promotion-motion-delay: 0ms;
  --promotion-motion-duration: 720ms;
  --promotion-motion-ease: cubic-bezier(0.22, 1, 0.36, 1);
}
[data-promotion-motion-ready="true"] [data-aos],
[data-promotion-motion-ready="true"] [data-reveal] {
  opacity: 0 !important;
  transform: translate3d(0, 40px, 0) !important;
  transition:
    opacity var(--promotion-motion-duration) var(--promotion-motion-ease) var(--promotion-motion-delay),
    transform var(--promotion-motion-duration) var(--promotion-motion-ease) var(--promotion-motion-delay) !important;
  will-change: opacity, transform;
}
[data-promotion-motion-ready="true"] [data-aos="fade-down"] {
  transform: translate3d(0, -40px, 0) !important;
}
[data-promotion-motion-ready="true"] [data-aos="fade-left"],
[data-promotion-motion-ready="true"] [data-reveal="right"] {
  transform: translate3d(40px, 0, 0) !important;
}
[data-promotion-motion-ready="true"] [data-aos="fade-right"],
[data-promotion-motion-ready="true"] [data-reveal="left"] {
  transform: translate3d(-40px, 0, 0) !important;
}
[data-promotion-motion-ready="true"] [data-aos="fade-in"] {
  transform: none !important;
}
[data-promotion-motion-ready="true"] [data-aos="zoom-in"],
[data-promotion-motion-ready="true"] [data-reveal="scale"] {
  transform: scale(0.965) !important;
}
[data-promotion-motion-ready="true"] [data-aos="zoom-out"] {
  transform: scale(1.035) !important;
}
[data-promotion-motion-ready="true"] [data-aos].aos-animate,
[data-promotion-motion-ready="true"] [data-reveal].aos-animate {
  opacity: 1 !important;
  transform: translate3d(0, 0, 0) scale(1) !important;
  will-change: auto;
}
[data-motion~="float"], [data-promotion-float="true"] {
  animation: score-predict-promotion-float 5.8s ease-in-out infinite !important;
  will-change: transform;
}
@keyframes score-predict-promotion-float {
  0%, 100% { transform: translate3d(0, 0, 0); }
  50% { transform: translate3d(0, -12px, 0); }
}
@media (max-width: 767px) {
  @keyframes score-predict-promotion-float {
    0%, 100% { transform: translate3d(0, 0, 0); }
    50% { transform: translate3d(0, -6px, 0); }
  }
}
@media (prefers-reduced-motion: reduce) {
  [data-aos], [data-reveal] {
    opacity: 1 !important;
    transform: none !important;
    transition: none !important;
    will-change: auto !important;
  }
  [data-motion~="float"], [data-promotion-float="true"] {
    animation: none !important;
    transform: none !important;
    will-change: auto !important;
  }
}
</style>`;

function buildFrameDocument(htmlDocument: string, examFunctionsHref: string) {
  const withSafeNavigation = rewritePromotionFrameNavigation(htmlDocument, { examFunctionsHref });
  const withoutScripts = withSafeNavigation
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<(iframe|object)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<embed\b[^>]*\/?\s*>/gi, "")
    .replace(/<\/?form\b[^>]*>/gi, "")
    .replace(/<meta\b[^>]*\/?\s*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  const withPreRegistrationTargets = withoutScripts.replace(/<a\b[^>]*>/gi, (anchorTag) => {
    if (!/\bhref\s*=\s*(["'])#pre-registration\1/i.test(anchorTag)) return anchorTag;
    const withoutTarget = anchorTag.replace(/\s+target\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
    return withoutTarget
      .replace(/\bhref\s*=\s*(["'])#pre-registration\1/i, 'href="/#pre-registration"')
      .replace(/>$/, ' target="_top">');
  });
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${FRAME_BASE_STYLES}</head><body>${withPreRegistrationTargets}${FRAME_MOTION_STYLES}</body></html>`;
}

function readMotionTime(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(10_000, Math.max(0, parsed)) : fallback;
}

function readMotionDelay(element: HTMLElement) {
  const aosDelay = element.getAttribute("data-aos-delay");
  if (aosDelay) return readMotionTime(aosDelay, 0);
  const revealStep = readMotionTime(element.getAttribute("data-reveal-delay"), 0);
  return Math.min(10_000, revealStep * 90);
}

export default function CustomHtmlPromotionFrame({
  htmlDocument,
  examFunctionsHref = "/exam/input",
  onPreRegistration,
  title = "프로모션 랜딩",
}: {
  htmlDocument: string;
  examFunctionsHref?: string;
  onPreRegistration?: () => void;
  title?: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(720);
  const srcDoc = useMemo(
    () => buildFrameDocument(htmlDocument, examFunctionsHref),
    [examFunctionsHref, htmlDocument],
  );

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    let disconnectCurrent: (() => void) | null = null;

    const connect = () => {
      disconnectCurrent?.();
      const document = iframe.contentDocument;
      if (!document) return;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      const resize = () => {
        const bodyHeight = document.body
          ? Math.ceil(document.body.getBoundingClientRect().height)
          : 0;
        const nextHeight = Math.max(
          320,
          bodyHeight,
        );
        setHeight(nextHeight);
      };
      const handleClick = (event: MouseEvent) => {
        const eventTarget = event.target as (EventTarget & { closest?: (selector: string) => Element | null }) | null;
        const target = eventTarget?.closest?.("a[href]") ?? null;
        if (!target || target.tagName !== "A") return;
        const rawHref = target.getAttribute("href")?.trim() ?? "";
        if (!rawHref) return;
        if (rawHref === "#pre-registration" || rawHref === "/#pre-registration") {
          event.preventDefault();
          onPreRegistration?.();
          return;
        }
        if (rawHref.startsWith("#")) {
          const targetId = decodeURIComponent(rawHref.slice(1));
          const anchorTarget = targetId ? document.getElementById(targetId) : null;
          const parentAnchorTarget = targetId ? window.document.getElementById(targetId) : null;
          if (anchorTarget || parentAnchorTarget) {
            event.preventDefault();
          }
          if (anchorTarget) {
            const nextTop =
              window.scrollY +
              iframe.getBoundingClientRect().top +
              anchorTarget.getBoundingClientRect().top;
            window.scrollTo({
              top: nextTop,
              behavior: reduceMotion ? "auto" : "smooth",
            });
            return;
          }
          if (parentAnchorTarget) {
            parentAnchorTarget.scrollIntoView({
              behavior: reduceMotion ? "auto" : "smooth",
              block: "start",
            });
          }
          return;
        }
        event.preventDefault();
        try {
          const resolved = new URL(rawHref, window.location.href);
          if (resolved.origin === window.location.origin) {
            window.location.assign(`${resolved.pathname}${resolved.search}${resolved.hash}`);
          } else {
            window.open(resolved.toString(), "_blank", "noopener,noreferrer");
          }
        } catch {
          // 잘못된 링크는 실행하지 않는다.
        }
      };

      const handlePreRegistrationClick = (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
        onPreRegistration?.();
      };
      const preRegistrationLinks = Array.from(
        document.querySelectorAll<HTMLAnchorElement>(
          'a[href="#pre-registration"], a[href="/#pre-registration"]',
        ),
      );

      document.addEventListener("click", handleClick);
      for (const link of preRegistrationLinks) {
        link.addEventListener("click", handlePreRegistrationClick);
      }
      const resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(document.documentElement);
      if (document.body) resizeObserver.observe(document.body);
      const mutationObserver = new MutationObserver(resize);
      mutationObserver.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
      const motionRoot = document.documentElement;
      const animatedElements = Array.from(
        document.querySelectorAll<HTMLElement>("[data-aos], [data-reveal]"),
      );
      const floatingElements = Array.from(
        document.querySelectorAll<HTMLElement>('[data-motion~="float"], [data-promotion-float]'),
      );
      for (const element of Array.from(document.querySelectorAll<HTMLElement>("[class]"))) {
        if (!Array.from(element.classList).some((className) => className.includes("heroFloat"))) continue;
        if (!floatingElements.includes(element)) floatingElements.push(element);
        element.dataset.promotionFloat = "true";
      }
      for (const element of animatedElements) {
        const delay = readMotionDelay(element);
        const duration = readMotionTime(element.getAttribute("data-aos-duration"), 720);
        element.style.setProperty("--promotion-motion-delay", `${delay}ms`);
        element.style.setProperty("--promotion-motion-duration", `${duration}ms`);
      }
      let revealFrame = 0;
      let prepareFrame = 0;
      const revealVisible = () => {
        revealFrame = 0;
        const frameTop = iframe.getBoundingClientRect().top;
        const viewportLimit = window.innerHeight * 0.92;
        for (const element of animatedElements) {
          if (element.classList.contains("aos-animate")) continue;
          const top = frameTop + element.getBoundingClientRect().top;
          if (top <= viewportLimit) element.classList.add("aos-animate");
        }
      };
      const scheduleReveal = () => {
        if (revealFrame) return;
        revealFrame = window.requestAnimationFrame(revealVisible);
      };
      if (reduceMotion) animatedElements.forEach((element) => element.classList.add("aos-animate"));
      else {
        motionRoot.dataset.promotionMotionReady = "true";
        window.addEventListener("scroll", scheduleReveal, { passive: true });
        window.addEventListener("resize", scheduleReveal);
        // iframe의 숨김 시작 상태가 한 프레임 이상 실제로 그려진 다음
        // 첫 화면 요소를 활성화해야 새로고침에서도 진입 모션이 눈에 보인다.
        prepareFrame = window.requestAnimationFrame(() => {
          prepareFrame = window.requestAnimationFrame(revealVisible);
        });
      }
      for (const image of Array.from(document.images)) image.addEventListener("load", resize, { once: true });
      disconnectCurrent = () => {
        document.removeEventListener("click", handleClick);
        for (const link of preRegistrationLinks) {
          link.removeEventListener("click", handlePreRegistrationClick);
        }
        resizeObserver.disconnect();
        mutationObserver.disconnect();
        window.removeEventListener("scroll", scheduleReveal);
        window.removeEventListener("resize", scheduleReveal);
        if (revealFrame) window.cancelAnimationFrame(revealFrame);
        if (prepareFrame) window.cancelAnimationFrame(prepareFrame);
        delete motionRoot.dataset.promotionMotionReady;
      };
      resize();
    };

    iframe.addEventListener("load", connect);
    if (iframe.contentDocument?.readyState === "complete") connect();
    return () => {
      iframe.removeEventListener("load", connect);
      disconnectCurrent?.();
    };
  }, [onPreRegistration, srcDoc]);

  return (
    <iframe
      ref={iframeRef}
      title={title}
      // HTML/CSS는 위에서 script·form·meta refresh·event handler를 제거한다.
      // Safari는 allow-top-navigation-by-user-activation만으로 srcDoc CTA를
      // 부모 화면으로 보내지 못하는 경우가 있어 안전한 top navigation을 명시한다.
      sandbox="allow-same-origin allow-top-navigation"
      srcDoc={srcDoc}
      className="block w-full border-0 bg-white"
      style={{ height }}
    />
  );
}
