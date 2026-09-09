"use client";

import { Search, X } from "lucide-react";

type StudentSearchFieldProps = {
  value: string;
  onChange: (next: string) => void;
  /** 화면에 보이지 않는 접근성 이름. 한 화면에 검색이 둘 이상이면 반드시 구분해서 준다. */
  label: string;
  placeholder?: string;
  /** 검색 결과 건수처럼 입력 옆에 붙일 안내. */
  hint?: string;
};

/**
 * DESIGN.md 5.7 — 표를 걸러내는 검색. 최대 320px, 아이콘은 안쪽 왼쪽, 지우기는 오른쪽.
 * 학생 한 명을 고르는 자리에는 StudentSearchCombobox 를 쓴다.
 */
export function StudentSearchField({
  value,
  onChange,
  label,
  placeholder = "이름 · 수험번호 검색",
  hint,
}: StudentSearchFieldProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="relative block w-full md:w-[var(--admin-search-width)] md:shrink-0">
        <span className="sr-only">{label}</span>
        <Search
          className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-text-muted"
          aria-hidden="true"
        />
        <input
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="pl-11 pr-11"
          placeholder={placeholder}
        />
        {value ? (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="검색어 지우기"
            title="검색어 지우기"
            className="admin-icon-button absolute right-3 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </label>
      {hint ? <p className="admin-help">{hint}</p> : null}
    </div>
  );
}
