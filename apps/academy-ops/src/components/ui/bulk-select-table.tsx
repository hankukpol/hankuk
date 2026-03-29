"use client";

import { useEffect, useRef, type ReactNode } from "react";

type BulkSelectHeaderCheckboxProps = {
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel?: string;
};

type BulkSelectRowCheckboxProps = {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel: string;
};

type BulkSelectionActionBarProps = {
  selectedCount: number;
  onClear: () => void;
  clearDisabled?: boolean;
  children: ReactNode;
};

export function BulkSelectHeaderCheckbox({
  checked,
  indeterminate = false,
  disabled = false,
  onChange,
  ariaLabel = "현재 페이지 전체 선택",
}: BulkSelectHeaderCheckboxProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!inputRef.current) {
      return;
    }

    inputRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <input
      ref={inputRef}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.checked)}
    />
  );
}

export function BulkSelectRowCheckbox({
  checked,
  disabled = false,
  onChange,
  ariaLabel,
}: BulkSelectRowCheckboxProps) {
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.checked)}
    />
  );
}

export function BulkSelectionActionBar({
  selectedCount,
  onClear,
  clearDisabled = false,
  children,
}: BulkSelectionActionBarProps) {
  if (selectedCount === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-ink/10 bg-white/95 px-4 py-3 shadow-lg backdrop-blur lg:left-[260px] sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-sm font-semibold text-ink">{selectedCount}건 선택됨</span>
        <div className="flex flex-wrap items-center gap-2">
          {children}
          <button
            type="button"
            onClick={onClear}
            disabled={clearDisabled}
            className="rounded-full border border-ink/10 px-4 py-2 text-xs font-semibold transition hover:border-ink/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            선택 해제
          </button>
        </div>
      </div>
    </div>
  );
}
