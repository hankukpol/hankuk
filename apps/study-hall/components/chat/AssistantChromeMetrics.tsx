"use client";

import { useEffect } from "react";

/**
 * 조교 화면의 고정 헤더·하단 탐색 높이를 재서 CSS 변수로 내보낸다.
 * 채팅 작성창이 하단 탐색 위에 정확히 얹히려면 실제 높이가 필요하다.
 * .admin-mobile-header 는 min-height 64px 이지만 지점명 길이에 따라 커지므로
 * 하드코딩하지 않고 측정한다. 화면은 그리지 않는다.
 */
export function AssistantChromeMetrics() {
  useEffect(() => {
    const root = document.documentElement;
    const header = document.querySelector("header.admin-mobile-header");
    const nav = document.querySelector("nav.fixed");

    const apply = () => {
      if (header) {
        root.style.setProperty("--admin-mobile-header-h", `${Math.round(header.getBoundingClientRect().height)}px`);
      }

      if (nav) {
        root.style.setProperty("--assistant-bottom-nav-h", `${Math.round(nav.getBoundingClientRect().height)}px`);
      }
    };

    apply();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", apply);
      return () => window.removeEventListener("resize", apply);
    }

    const observer = new ResizeObserver(apply);

    if (header) {
      observer.observe(header);
    }

    if (nav) {
      observer.observe(nav);
    }

    return () => {
      observer.disconnect();
      root.style.removeProperty("--admin-mobile-header-h");
      root.style.removeProperty("--assistant-bottom-nav-h");
    };
  }, []);

  return null;
}
