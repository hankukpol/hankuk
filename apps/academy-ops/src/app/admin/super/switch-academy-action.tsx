"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type SwitchAcademyActionProps = {
  academyId: number;
  href: string;
  label: string;
  className?: string;
};

export function SwitchAcademyAction({
  academyId,
  href,
  label,
  className,
}: SwitchAcademyActionProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      setError(null);

      const response = await fetch("/api/admin/switch-academy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ academyId }),
      });

      const payload = await response.json().catch(() => ({ error: "지점 전환에 실패했습니다." }));
      if (!response.ok) {
        setError(typeof payload?.error === "string" ? payload.error : "지점 전환에 실패했습니다.");
        return;
      }

      router.push(href);
      router.refresh();
    });
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className={
          className ??
          "rounded-full border border-ink/10 px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-forest hover:text-forest disabled:cursor-not-allowed disabled:opacity-50"
        }
      >
        {isPending ? "전환 중..." : label}
      </button>
      {error ? <p className="text-[11px] text-red-600">{error}</p> : null}
    </div>
  );
}
