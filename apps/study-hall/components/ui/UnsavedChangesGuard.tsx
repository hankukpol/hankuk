"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CHECK_NAVIGATION_EVENT, CHECK_SAFETY_CHANGED, registerCheckGuard, type CheckNavigationDetail } from "@/lib/check-navigation";

export function UnsavedChangesGuard({ isDirty, isSaving = false, onDiscard, message = "저장하지 않은 변경사항이 있습니다. 머무르기를 눌러 저장한 뒤 이동해 주세요." }: {
  isDirty: boolean; isSaving?: boolean; onDiscard?: () => void; message?: string;
}) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const state = useRef({ isDirty, isSaving, onDiscard });
  state.current = { isDirty, isSaving, onDiscard };
  const pending = useRef<(() => void) | null>(null);
  const bypass = useRef(false);
  const historyGuard = useRef(false);
  const restoringHistory = useRef(false);
  const afterHistory = useRef<(() => void) | null>(null);

  useEffect(() => registerCheckGuard(() => !bypass.current && (state.current.isDirty || state.current.isSaving)), []);
  useEffect(() => { window.dispatchEvent(new Event(CHECK_SAFETY_CHANGED)); }, [isDirty, isSaving]);

  useEffect(() => {
    const blocked = () => !bypass.current && (state.current.isDirty || state.current.isSaving);
    const ask = (action: () => void) => { pending.current = action; setShowModal(true); };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (blocked()) { event.preventDefault(); event.returnValue = ""; }
    };
    const requested = (event: Event) => {
      if (!blocked()) return;
      event.preventDefault();
      ask((event as CustomEvent<CheckNavigationDetail>).detail.action);
    };
    const click = (event: MouseEvent) => {
      if (!blocked() || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a") : null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      const url = new URL(href, window.location.href);
      if (!["http:", "https:"].includes(url.protocol)) return;
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      ask(() => {
        if (url.origin === window.location.origin) router.push(`${url.pathname}${url.search}${url.hash}`);
        else window.location.assign(url.href);
      });
    };
    // Preserve Next's history metadata; restore the source before asking.
    const pop = (event: PopStateEvent) => {
      if (restoringHistory.current) {
        event.stopImmediatePropagation();
        restoringHistory.current = false;
        const action = afterHistory.current;
        afterHistory.current = null;
        action?.();
        return;
      }
      if (!historyGuard.current || !blocked()) return;
      event.stopImmediatePropagation();
      restoringHistory.current = true;
      window.history.go(1);
      ask(() => { window.history.back(); });
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener(CHECK_NAVIGATION_EVENT, requested);
    window.addEventListener("popstate", pop, true);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener(CHECK_NAVIGATION_EVENT, requested);
      window.removeEventListener("popstate", pop, true);
      document.removeEventListener("click", click, true);
    };
  }, [router]);

  useEffect(() => {
    if ((isDirty || isSaving) && !historyGuard.current) {
      // A reload may retain the same sentinel. Reuse it during draft recovery.
      if (!window.history.state?.studyHallCheckGuard) {
        window.history.pushState({ ...window.history.state, studyHallCheckGuard: true }, "", window.location.href);
      }
      historyGuard.current = true;
    } else if (!isDirty && !isSaving && historyGuard.current && !bypass.current) {
      historyGuard.current = false;
      if (window.history.state?.studyHallCheckGuard) {
        restoringHistory.current = true;
        window.history.back();
      }
      setShowModal(false);
    }
  }, [isDirty, isSaving]);

  return <ConfirmDialog open={showModal}
    title={isSaving ? "저장 중입니다" : "저장하지 않은 변경사항"}
    description={isSaving ? "저장 결과를 확인한 뒤 이동할 수 있습니다. 잠시 기다려 주세요." : message}
    confirmLabel="저장하지 않고 떠나기" cancelLabel="머무르기" variant="warning" isLoading={isSaving}
    onCancel={() => { setShowModal(false); pending.current = null; }}
    onConfirm={() => {
      if (state.current.isSaving || restoringHistory.current) return;
      const action = pending.current;
      pending.current = null;
      bypass.current = true;
      const leave = () => {
        state.current.onDiscard?.();
        setShowModal(false);
        action?.();
        queueMicrotask(() => { bypass.current = false; });
      };
      // Remove our duplicate source entry before changing date, route or account.
      if (historyGuard.current && window.history.state?.studyHallCheckGuard) {
        historyGuard.current = false;
        restoringHistory.current = true;
        afterHistory.current = leave;
        window.history.back();
      } else leave();
    }} />;
}
