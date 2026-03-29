"use client";

import { useState } from "react";

type ExtendDuration = "1" | "3" | "6";

const DURATION_OPTIONS: { value: ExtendDuration; label: string }[] = [
  { value: "1", label: "1개월" },
  { value: "3", label: "3개월" },
  { value: "6", label: "6개월" },
];

const MONTHLY_FEE = 10000; // 월 10,000원 기준 (실제 금액은 학원 정책에 따라 조정)

interface LockerExtendFormProps {
  lockerNumber: string;
  zone: string;
  currentEndDate: Date | null;
}

type ExtendResult = {
  endDate: string | null;
  extendedMonths: number;
};

export function LockerExtendForm({ lockerNumber, zone, currentEndDate }: LockerExtendFormProps) {
  const [selected, setSelected] = useState<ExtendDuration>("1");
  const [result, setResult] = useState<ExtendResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const estimatedCost = parseInt(selected, 10) * MONTHLY_FEE;

  const estimatedNewEndDate = (() => {
    const base = currentEndDate ? new Date(currentEndDate) : new Date();
    base.setMonth(base.getMonth() + parseInt(selected, 10));
    const y = base.getFullYear();
    const m = String(base.getMonth() + 1).padStart(2, "0");
    const d = String(base.getDate()).padStart(2, "0");
    return `${y}년 ${m}월 ${d}일`;
  })();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/student/locker-rentals/extend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ months: parseInt(selected, 10) }),
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? "연장 신청 중 오류가 발생했습니다.");
        return;
      }

      setResult({
        endDate: json.data?.endDate ?? null,
        extendedMonths: json.data?.extendedMonths ?? parseInt(selected, 10),
      });
    } catch {
      setError("네트워크 오류가 발생했습니다. 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    const newEndDateLabel = (() => {
      if (!result.endDate) return null;
      const d = new Date(result.endDate);
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      const day = String(d.getUTCDate()).padStart(2, "0");
      return `${y}년 ${m}월 ${day}일`;
    })();

    return (
      <div className="mt-4 rounded-[24px] border border-forest/20 bg-forest/5 p-5 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-forest/10">
          <svg className="h-6 w-6 text-forest" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="mt-3 text-base font-semibold text-forest">연장이 완료되었습니다</p>
        <p className="mt-2 text-sm text-slate">
          {lockerNumber}번 사물함 ({zone}) · {result.extendedMonths}개월 연장
        </p>
        {newEndDateLabel && (
          <p className="mt-1 text-sm font-semibold text-ink">
            새 반납 예정일: {newEndDateLabel}
          </p>
        )}
        <button
          type="button"
          onClick={() => setResult(null)}
          className="mt-4 inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-xs font-semibold text-slate transition hover:border-ember/30 hover:text-ember"
        >
          다시 신청하기
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-4">
      {/* Duration selection */}
      <div>
        <p className="mb-2 text-sm font-semibold text-slate">연장 기간 선택</p>
        <div className="grid grid-cols-3 gap-2">
          {DURATION_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setSelected(option.value)}
              className={`rounded-[16px] border py-3 text-sm font-semibold transition ${
                selected === option.value
                  ? "border-ember bg-ember text-white shadow-sm"
                  : "border-ink/10 bg-mist text-ink hover:border-ember/30 hover:text-ember"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Cost estimate */}
      <div className="rounded-[20px] border border-ink/10 bg-mist px-5 py-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate">예상 비용</p>
          <p className="text-base font-bold text-ember">
            {estimatedCost.toLocaleString("ko-KR")}원
          </p>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <p className="text-sm text-slate">연장 후 만료 예정일</p>
          <p className="text-sm font-semibold text-ink">{estimatedNewEndDate}</p>
        </div>
        <p className="mt-2 text-[10px] text-slate">
          * 실제 비용은 학원 정책에 따라 다를 수 있습니다.
        </p>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-ember px-4 py-3 text-sm font-semibold text-white transition hover:bg-ember/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "처리 중..." : "연장 신청하기"}
      </button>

      {/* Error */}
      {error && (
        <div className="rounded-[16px] border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-semibold text-red-700">오류</p>
          <p className="mt-0.5 text-sm text-red-600">{error}</p>
        </div>
      )}
    </form>
  );
}
