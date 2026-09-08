"use client";

import type { KeyboardEvent } from "react";

/**
 * DESIGN.md 5.4 · 5.5 — 페이지 안 탭의 키보드 조작.
 * 좌우 방향키로 이동하고 Home / End 로 처음·끝으로 간다.
 * 선택된 탭만 tabIndex 0 을 갖는 roving tabindex 와 함께 쓴다.
 */
export function createTabListKeyHandler<T extends string>(
  ids: readonly T[],
  activeId: T,
  onSelect: (next: T) => void,
) {
  return function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (ids.length === 0) return;

    const current = ids.indexOf(activeId);
    let nextIndex: number | null = null;

    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        nextIndex = current < 0 ? 0 : (current + 1) % ids.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        nextIndex = current < 0 ? 0 : (current - 1 + ids.length) % ids.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = ids.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    const nextId = ids[nextIndex];
    onSelect(nextId);

    // 이동한 탭으로 포커스도 함께 옮긴다.
    const list = event.currentTarget.closest('[role="tablist"]') ?? event.currentTarget;
    const tabs = Array.from(list.querySelectorAll<HTMLElement>('[role="tab"]')).filter(
      (tab) => !tab.matches(':disabled, [aria-disabled="true"]') && tab.closest('[role="tablist"]') === list,
    );
    tabs[nextIndex]?.focus();
  };
}
