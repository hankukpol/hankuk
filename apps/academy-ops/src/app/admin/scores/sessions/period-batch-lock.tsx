"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  periodId: number;
  periodName: string;
  totalSessions: number;
  lockedCount: number;
};

export function PeriodBatchLock({ periodId, periodName, totalSessions, lockedCount }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const allLocked = lockedCount === totalSessions && totalSessions > 0;
  const noneUnlocked = lockedCount === 0;

  async function batchLock(lock: boolean) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/scores/sessions/batch-lock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ periodId, lock }),
        });
        const payload = (await res.json()) as {
          data?: { updatedCount: number; periodName: string; lock: boolean };
          error?: string;
        };
        if (!res.ok) {
          setError(payload.error ?? "요청을 처리하지 못했습니다.");
          return;
        }
        const count = payload.data?.updatedCount ?? 0;
        setNotice(
          lock
            ? `${periodName} 기수의 회차 ${count}개를 잠갔습니다.`
            : `${periodName} 기수의 회차 ${count}개 잠금을 해제했습니다.`,
        );
        router.refresh();
      } catch {
        setError("네트워크 오류가 발생했습니다.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        {!allLocked && (
          <button
            type="button"
            disabled={isPending || totalSessions === 0}
            onClick={() => batchLock(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg
              className="h-3 w-3"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            {isPending ? "처리 중..." : "전체 잠금"}
          </button>
        )}
        {!noneUnlocked && (
          <button
            type="button"
            disabled={isPending || totalSessions === 0}
            onClick={() => batchLock(false)}
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 bg-ink/5 px-3 py-1 text-xs font-semibold text-slate transition hover:border-ink/30 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg
              className="h-3 w-3"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 9.9-1" />
            </svg>
            {isPending ? "처리 중..." : "전체 잠금 해제"}
          </button>
        )}
      </div>
      {notice && <p className="text-[11px] text-forest">{notice}</p>}
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
}