"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { createTabListKeyHandler } from "@/lib/useTabListKeys";

type AdminTabItem<T extends string> = {
  id: T;
  label: ReactNode;
  disabled?: boolean;
};

type AdminTabsProps<T extends string> = {
  items: readonly AdminTabItem<T>[];
  activeId: T;
  onChange: (next: T) => void;
  /** 접근성 이름. 화면에 탭 묶음이 둘 이상이면 반드시 구분해서 준다. */
  label: string;
  /** tabpanel 과 연결할 id 접두사 */
  idPrefix?: string;
  className?: string;
  variant?: "primary" | "secondary";
};

/**
 * DESIGN.md 5.4 — 1차 폴더 탭.
 * 화면·콘텐츠 이동에만 쓴다. 데이터 필터는 .admin-choice-button 을 쓴다.
 * 높이 56px, 직각, 아래 accent 연속선, 활성 탭만 흰 바닥.
 */
export function AdminTabs<T extends string>({
  items,
  activeId,
  onChange,
  label,
  idPrefix = "tab",
  className,
  variant = "primary",
}: AdminTabsProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);
  const enabled = items.filter((item) => !item.disabled).map((item) => item.id);
  const handleKeyDown = createTabListKeyHandler(enabled, activeId, onChange);

  useEffect(() => {
    const list = listRef.current;
    const active = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!list || !active || variant !== "primary") return;
    const frame = list.getBoundingClientRect();
    const tab = active.getBoundingClientRect();
    if (tab.left < frame.left) list.scrollLeft -= frame.left - tab.left;
    else if (tab.right > frame.right) list.scrollLeft += tab.right - frame.right;
  }, [activeId, variant]);

  return (
    <div
      ref={listRef}
      className={`${variant === "secondary" ? "admin-subtabs" : "admin-tabs"}${className ? ` ${className}` : ""}`}
      role="tablist"
      aria-label={label}
    >
      {items.map((item) => {
        const isActive = item.id === activeId;

        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`${idPrefix}-${item.id}`}
            aria-controls={`${idPrefix}-panel-${item.id}`}
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onChange(item.id)}
            onKeyDown={handleKeyDown}
            className={variant === "secondary" ? "admin-subtab" : "admin-tab"}
            data-active={isActive}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

type AdminTabPanelProps<T extends string> = {
  id: T;
  activeId: T;
  idPrefix?: string;
  children: ReactNode;
  className?: string;
};

/** 탭 내용. 숨겨도 마운트를 유지해 입력 중이던 초안을 보존한다. */
export function AdminTabPanel<T extends string>({
  id,
  activeId,
  idPrefix = "tab",
  children,
  className,
}: AdminTabPanelProps<T>) {
  return (
    <div
      role="tabpanel"
      id={`${idPrefix}-panel-${id}`}
      aria-labelledby={`${idPrefix}-${id}`}
      hidden={id !== activeId}
      className={className}
    >
      {children}
    </div>
  );
}
