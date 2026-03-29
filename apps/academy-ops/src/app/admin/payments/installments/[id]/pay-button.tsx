"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

type Props = {
  installmentId: string;
  amount: number;
  isPaid: boolean;
  paidAt: string | null;
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

function todayISODate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function PayButton({ installmentId, amount, isPaid, paidAt }: Props) {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState<string>(todayISODate());
  const [isPending, startTransition] = useTransition();

  if (isPaid && paidAt) {
    return (
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-forest/20 bg-forest/10 px-4 py-2 text-sm font-semibold text-forest">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          납부완료
        </span>
        <span className="text-sm text-slate">{formatDate(paidAt)}</span>
      </div>
    );
  }

  function handlePay() {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/payments/installments/${installmentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paidAt: new Date(selectedDate).toISOString() }),
          cache: "no-store",
        });
        const payload = await res.json() as { data?: unknown; error?: string };
        if (!res.ok) throw new Error(payload.error ?? "납부 처리 실패");
        toast.success(`${amount.toLocaleString()}원 납부 처리 완료`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "납부 처리 중 오류가 발생했습니다.");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate" htmlFor="paid-date">
          납부일
        </label>
        <input
          id="paid-date"
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          max={todayISODate()}
          disabled={isPending}
          className="rounded-[12px] border border-ink/20 bg-white px-3 py-2 text-sm text-ink focus:border-ember focus:outline-none focus:ring-2 focus:ring-ember/20 disabled:opacity-50"
        />
      </div>
      <button
        type="button"
        onClick={handlePay}
        disabled={isPending || !selectedDate}
        className="inline-flex items-center gap-2 rounded-full bg-ember px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-ember/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? (
          <>
            <svg
              className="h-4 w-4 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
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
            처리 중...
          </>
        ) : (
          `납부 처리 (${amount.toLocaleString()}원)`
        )}
      </button>
    </div>
  );
}
