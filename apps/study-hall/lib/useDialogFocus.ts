"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const openPanels: HTMLElement[] = [];
let previousBodyOverflow = "";

/**
 * DESIGN.md 5.10 — 모달·드로어 공통 포커스 동작.
 * - 첫 포커스는 패널 자체에 준다. 모바일 키보드가 자동으로 뜨지 않게 한다.
 * - Tab / Shift+Tab 을 패널 안으로 제한한다.
 * - 닫을 때 열었던 trigger 로 포커스를 되돌린다.
 */
export function useDialogFocus<T extends HTMLElement = HTMLElement>(open: boolean, onClose?: () => void) {
  const panelRef = useRef<T | null>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  // 포커스 제한
  useEffect(() => {
    if (!open) return;

    const panel = panelRef.current;
    if (!panel) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (openPanels.length === 0) {
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    openPanels.push(panel);
    const frame = requestAnimationFrame(() => {
      if (openPanels.at(-1) === panel) panel.focus({ preventScroll: true });
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (openPanels.at(-1) !== panel) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeRef.current?.();
        return;
      }
      if (event.key !== "Tab") return;
      event.stopImmediatePropagation();

      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) => element.offsetParent !== null || element === document.activeElement,
      );

      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || active === panel || !panel.contains(active)) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (active === last || !panel.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", handleKeyDown, true);
      const wasTop = openPanels.at(-1) === panel;
      const index = openPanels.indexOf(panel);
      if (index !== -1) openPanels.splice(index, 1);
      if (openPanels.length === 0) document.body.style.overflow = previousBodyOverflow;
      if (wasTop) {
        const parent = openPanels.at(-1);
        const restore = trigger?.isConnected && (!parent || parent.contains(trigger)) ? trigger : parent;
        restore?.focus({ preventScroll: true });
      }
    };
  }, [open]);

  return panelRef;
}
