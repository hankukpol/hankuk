"use client";

import { useEffect } from "react";

const PROMOTION_SELECTOR = '[data-promotion-template="police-2026-second"]';
const REVEAL_SELECTOR = "[data-reveal]";

export default function Police2026SecondPromotionMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(PROMOTION_SELECTOR);
    if (!root) return;

    const targets = Array.from(root.querySelectorAll<HTMLElement>(REVEAL_SELECTOR));
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reducedMotion || !("IntersectionObserver" in window)) {
      targets.forEach((target) => {
        target.dataset.revealState = "visible";
      });
      return;
    }

    root.dataset.motionReady = "true";

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const target = entry.target as HTMLElement;
          target.dataset.revealState = "visible";
          observer.unobserve(target);
        });
      },
      {
        threshold: 0.12,
        rootMargin: "0px 0px -8% 0px",
      },
    );

    targets.forEach((target) => observer.observe(target));

    return () => observer.disconnect();
  }, []);

  return null;
}
