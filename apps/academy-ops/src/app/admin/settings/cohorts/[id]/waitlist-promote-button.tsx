"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Props = {
  enrollmentId: string;
};

export function WaitlistPromoteButton({ enrollmentId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handlePromote() {
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/enrollments/${enrollmentId}/promote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "수강 확정에 실패했습니다.");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "수강 확정에 실패했습니다.");
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handlePromote}
        disabled={isPending}
        className="inline-flex items-center rounded-full bg-forest px-3 py-1 text-xs font-semibold text-white transition hover:bg-forest/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? "처리 중..." : "수강 확정"}
      </button>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
