"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type PeriodData = {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  totalWeeks: number;
  isActive: boolean;
  isGongchaeEnabled: boolean;
  isGyeongchaeEnabled: boolean;
};

type FormState = {
  name: string;
  startDate: string;
  endDate: string;
  totalWeeks: string;
  isGongchaeEnabled: boolean;
  isGyeongchaeEnabled: boolean;
};

type PeriodEditFormProps = {
  period: PeriodData;
};

export function PeriodEditForm({ period }: PeriodEditFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>({
    name: period.name,
    startDate: period.startDate.slice(0, 10),
    endDate: period.endDate.slice(0, 10),
    totalWeeks: String(period.totalWeeks),
    isGongchaeEnabled: period.isGongchaeEnabled,
    isGyeongchaeEnabled: period.isGyeongchaeEnabled,
  });

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    startTransition(async () => {
      try {
        const body = {
          name: form.name.trim(),
          startDate: form.startDate,
          endDate: form.endDate,
          totalWeeks: Number(form.totalWeeks),
          isGongchaeEnabled: form.isGongchaeEnabled,
          isGyeongchaeEnabled: form.isGyeongchaeEnabled,
        };

        const response = await fetch(`/api/periods/${period.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          cache: "no-store",
        });

        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error ?? "기간 수정에 실패했습니다.");
        }

        toast.success("기간 정보를 수정했습니다.");
        router.push(`/admin/periods/${period.id}`);
        router.refresh();
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "수정에 실패했습니다.",
        );
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 max-w-2xl space-y-6">
      {errorMessage && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      {/* 기간명 */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-ink">
          기간명 <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setField("name", e.target.value)}
          placeholder="예: 2026년 1기"
          required
          className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
        />
      </div>

      {/* 날짜 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink">
            시작일 <span className="text-red-500">*</span>
            <span className="ml-1 text-xs font-normal text-slate">(화요일)</span>
          </label>
          <input
            type="date"
            value={form.startDate}
            onChange={(e) => setField("startDate", e.target.value)}
            required
            className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink">
            종료일 <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={form.endDate}
            onChange={(e) => setField("endDate", e.target.value)}
            required
            className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
          />
        </div>
      </div>

      {/* 총 주차 */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-ink">
          총 주차 <span className="text-red-500">*</span>
          <span className="ml-1 text-xs font-normal text-slate">(1~12주)</span>
        </label>
        <input
          type="number"
          min={1}
          max={12}
          value={form.totalWeeks}
          onChange={(e) => setField("totalWeeks", e.target.value)}
          required
          className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
        />
      </div>

      {/* 직렬 활성화 */}
      <div>
        <label className="mb-2 block text-sm font-medium text-ink">직렬 활성화</label>
        <div className="flex gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isGongchaeEnabled}
              onChange={(e) => setField("isGongchaeEnabled", e.target.checked)}
              className="accent-ember"
            />
            <span>공채</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isGyeongchaeEnabled}
              onChange={(e) => setField("isGyeongchaeEnabled", e.target.checked)}
              className="accent-ember"
            />
            <span>경채</span>
          </label>
        </div>
        <p className="mt-1 text-xs text-slate">최소 한 개 이상 활성화해야 합니다.</p>
      </div>

      {/* 안내 메시지 */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <p className="font-semibold">주의</p>
        <p className="mt-1">
          기간 정보를 수정해도 이미 생성된 회차(ExamSession)는 변경되지 않습니다.
          회차 일정을 변경하려면 개별 회차를 직접 수정하거나 기간 관리 페이지에서 회차를 재생성하세요.
        </p>
      </div>

      {/* 버튼 */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center rounded-full bg-ember px-6 py-2.5 text-sm font-medium text-white transition hover:bg-ember/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "저장 중..." : "저장"}
        </button>
        <a
          href={`/admin/periods/${period.id}`}
          className="inline-flex items-center rounded-full border border-ink/10 px-6 py-2.5 text-sm font-medium text-ink transition hover:border-ink/30"
        >
          취소
        </a>
      </div>
    </form>
  );
}
