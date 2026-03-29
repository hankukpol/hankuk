"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ProspectStage } from "@prisma/client";

type Props = {
  prospectId: string;
  prospectName: string;
  currentStage: ProspectStage;
  nextStage: ProspectStage;
  nextStageLabel: string;
  variant?: "default" | "danger";
};

export function FollowUpActions({
  prospectId,
  prospectName,
  nextStage,
  nextStageLabel,
  variant = "default",
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isDanger = variant === "danger";

  async function handleClick() {
    if (isDanger) {
      const confirmed = window.confirm(
        `"${prospectName}"를 이탈 처리하시겠습니까? 이 작업은 되돌리기 어렵습니다.`,
      );
      if (!confirmed) return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/prospects/${prospectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stage: nextStage }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? "처리에 실패했습니다.");
          return;
        }
        router.refresh();
      } catch {
        setError("서버 오류가 발생했습니다.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
          isDanger
            ? "border-red-200 bg-white text-red-600 hover:border-red-400 hover:bg-red-50"
            : "border-forest/20 bg-white text-forest hover:border-forest/40 hover:bg-forest/5"
        }`}
      >
        {isPending ? "처리 중…" : nextStageLabel}
      </button>
      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}
