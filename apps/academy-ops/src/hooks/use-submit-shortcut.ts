"use client";

import { type RefObject, useEffect } from "react";

type UseSubmitShortcutOptions = {
  containerRef: RefObject<HTMLElement | null>;
  enabled?: boolean;
  onSubmit: () => void;
};

function isSubmitShortcut(event: KeyboardEvent) {
  return (
    event.key === "Enter" &&
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.repeat
  );
}

function isInsideContainer(container: HTMLElement | null, target: EventTarget | null) {
  if (!container || !(target instanceof Node)) {
    return false;
  }

  return container.contains(target);
}

function isInsideBlockingDialog(target: HTMLElement | null) {
  return Boolean(target?.closest('[role="dialog"][aria-modal="true"]'));
}

export function useSubmitShortcut({
  containerRef,
  enabled = true,
  onSubmit,
}: UseSubmitShortcutOptions) {
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || !isSubmitShortcut(event)) {
        return;
      }

      const container = containerRef.current;
      const eventTarget = event.target instanceof HTMLElement ? event.target : null;
      const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;

      if (
        (!isInsideContainer(container, eventTarget) &&
          !isInsideContainer(container, activeElement)) ||
        isInsideBlockingDialog(eventTarget) ||
        isInsideBlockingDialog(activeElement)
      ) {
        return;
      }

      event.preventDefault();
      onSubmit();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [containerRef, enabled, onSubmit]);
}
