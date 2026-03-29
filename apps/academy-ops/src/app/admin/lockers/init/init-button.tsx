"use client";

import { useState } from "react";

type InitResult = {
  created: number;
  skipped: number;
  total: number;
};

export function LockerInitButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<InitResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleInit() {
    const confirmed = window.confirm(
      "208개 사물함을 초기화합니다.\n이미 존재하는 사물함은 건너뜁니다.\n계속하시겠습니까?",
    );
    if (!confirmed) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/lockers/init", { method: "POST" });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? "초기화 중 오류가 발생했습니다.");
        return;
      }

      setResult(json.data as InitResult);
    } catch {
      setError("네트워크 오류가 발생했습니다. 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Warning notice */}
      <div className="rounded-[20px] border border-amber-200 bg-amber-50 px-5 py-4">
        <div className="flex items-start gap-3">
          <svg
            className="mt-0.5 h-5 w-5 shrink-0 text-amber-600"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
          <div>
            <p className="text-sm font-semibold text-amber-800">주의 사항</p>
            <ul className="mt-1.5 space-y-1 text-xs text-amber-700">
              <li>이미 존재하는 사물함(같은 구역+번호)은 건너뜁니다.</li>
              <li>새로 생성되는 사물함의 초기 상태는 &ldquo;사용 가능&rdquo;입니다.</li>
              <li>한 번 생성된 사물함은 개별 삭제해야 합니다.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Action button */}
      <button
        type="button"
        onClick={handleInit}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-full bg-ember px-6 py-3 text-sm font-semibold text-white transition hover:bg-ember/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? (
          <>
            <svg
              className="h-4 w-4 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            초기화 중...
          </>
        ) : (
          "208 사물함 초기화 실행"
        )}
      </button>

      {/* Success result */}
      {result && (
        <div className="rounded-[20px] border border-forest/20 bg-forest/5 px-5 py-4">
          <div className="flex items-center gap-2">
            <svg
              className="h-5 w-5 text-forest"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-sm font-semibold text-forest">초기화 완료</p>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <div className="rounded-[16px] border border-forest/20 bg-white p-3 text-center">
              <p className="text-xl font-bold text-forest">{result.created}</p>
              <p className="mt-0.5 text-xs text-slate">새로 생성</p>
            </div>
            <div className="rounded-[16px] border border-ink/10 bg-white p-3 text-center">
              <p className="text-xl font-bold text-slate">{result.skipped}</p>
              <p className="mt-0.5 text-xs text-slate">건너뜀</p>
            </div>
            <div className="rounded-[16px] border border-ink/10 bg-white p-3 text-center">
              <p className="text-xl font-bold text-ink">{result.total}</p>
              <p className="mt-0.5 text-xs text-slate">전체 대상</p>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-[20px] border border-red-200 bg-red-50 px-5 py-4">
          <div className="flex items-center gap-2">
            <svg
              className="h-5 w-5 text-red-600"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
            <p className="text-sm font-semibold text-red-700">오류 발생</p>
          </div>
          <p className="mt-1 text-sm text-red-600">{error}</p>
        </div>
      )}
    </div>
  );
}
