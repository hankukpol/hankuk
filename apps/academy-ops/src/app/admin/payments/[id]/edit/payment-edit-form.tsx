"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PaymentCategory, PaymentStatus } from "@prisma/client";
import {
  PAYMENT_CATEGORY_LABEL,
  PAYMENT_STATUS_LABEL,
} from "@/lib/constants";

type Props = {
  paymentId: string;
  initialCategory: PaymentCategory;
  initialStatus: PaymentStatus;
  initialGrossAmount: number;
  initialNote: string;
  initialProcessedAt: string;
  isPending: boolean;
};

const ALL_CATEGORIES: PaymentCategory[] = [
  "TUITION",
  "FACILITY",
  "TEXTBOOK",
  "MATERIAL",
  "SINGLE_COURSE",
  "PENALTY",
  "ETC",
];

const ALL_STATUSES: PaymentStatus[] = [
  "PENDING",
  "APPROVED",
  "PARTIAL_REFUNDED",
  "FULLY_REFUNDED",
  "CANCELLED",
];

export function PaymentEditForm({
  paymentId,
  initialCategory,
  initialStatus,
  initialGrossAmount,
  initialNote,
  initialProcessedAt,
  isPending: initialIsPending,
}: Props) {
  const router = useRouter();
  const [submitting, startTransition] = useTransition();

  const [category, setCategory] = useState<PaymentCategory>(initialCategory);
  const [status, setStatus] = useState<PaymentStatus>(initialStatus);
  const [grossAmount, setGrossAmount] = useState<string>(String(initialGrossAmount));
  const [note, setNote] = useState<string>(initialNote);
  const [processedAt, setProcessedAt] = useState<string>(initialProcessedAt);
  const [error, setError] = useState<string | null>(null);

  function handleCancel() {
    router.push(`/admin/payments/${paymentId}`);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (initialIsPending) {
      const grossNum = Number(grossAmount);
      if (isNaN(grossNum) || grossNum < 0) {
        setError("수납 금액은 0 이상의 숫자여야 합니다.");
        return;
      }
    }

    startTransition(async () => {
      const body: Record<string, unknown> = {
        note,
        category,
        processedAt,
      };

      // Only send status if it's changed (allow manager to adjust)
      body.status = status;

      // Only allow amount change on PENDING payments
      if (initialIsPending) {
        body.grossAmount = Number(grossAmount);
      }

      const res = await fetch(`/api/payments/${paymentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "수정 실패");
        return;
      }

      router.push(`/admin/payments/${paymentId}`);
      router.refresh();
    });
  }

  const labelClass = "mb-1.5 block text-xs font-semibold text-slate";
  const inputClass =
    "w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ember/30";
  const selectClass =
    "w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ember/30";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 수납 유형 */}
      <div>
        <label className={labelClass}>수납 유형 *</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as PaymentCategory)}
          className={selectClass}
          required
        >
          {ALL_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {PAYMENT_CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
      </div>

      {/* 수납 상태 */}
      <div>
        <label className={labelClass}>수납 상태 *</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as PaymentStatus)}
          className={selectClass}
          required
        >
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {PAYMENT_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        {status !== initialStatus && (
          <p className="mt-1 text-xs text-amber-700">
            상태 변경은 주의해서 사용하세요. 환불은 별도 환불 처리를 사용해주세요.
          </p>
        )}
      </div>

      {/* 수납 금액 (PENDING 상태만 수정 가능) */}
      <div>
        <label className={labelClass}>
          수납 금액 (원)
          {!initialIsPending && (
            <span className="ml-2 text-xs font-normal text-slate">
              (승인된 수납은 금액 수정 불가)
            </span>
          )}
        </label>
        <input
          type="number"
          min={0}
          step={1000}
          value={grossAmount}
          onChange={(e) => setGrossAmount(e.target.value)}
          disabled={!initialIsPending}
          className={`${inputClass} disabled:cursor-not-allowed disabled:bg-mist/50 disabled:text-slate`}
        />
      </div>

      {/* 처리일시 */}
      <div>
        <label className={labelClass}>처리일시 *</label>
        <input
          type="datetime-local"
          value={processedAt}
          onChange={(e) => setProcessedAt(e.target.value)}
          className={inputClass}
          required
        />
      </div>

      {/* 비고 */}
      <div>
        <label className={labelClass}>비고</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="메모 (선택)"
          className="w-full resize-y rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ember/30"
        />
      </div>

      {/* 버튼 */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center rounded-full bg-ember px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "저장 중..." : "저장"}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={submitting}
          className="inline-flex items-center rounded-full border border-ink/10 px-6 py-2.5 text-sm font-semibold text-slate transition hover:border-ink/30 hover:text-ink disabled:opacity-50"
        >
          취소
        </button>
      </div>
    </form>
  );
}
