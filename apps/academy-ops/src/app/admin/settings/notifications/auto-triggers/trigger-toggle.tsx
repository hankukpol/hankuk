"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

type Props = {
  triggerKey: string;
  enabled: boolean;
};

export function TriggerToggle({ triggerKey, enabled: initialEnabled }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    const next = !enabled;
    setEnabled(next);

    startTransition(async () => {
      try {
        const res = await fetch("/api/settings/system", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            notificationTriggers: {
              [triggerKey]: next,
            },
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error ?? "저장 실패");
        }

        toast.success(next ? "트리거를 활성화했습니다." : "트리거를 비활성화했습니다.");
      } catch (err) {
        // rollback
        setEnabled(!next);
        toast.error(err instanceof Error ? err.message : "저장에 실패했습니다.");
      }
    });
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={handleToggle}
      disabled={isPending}
      className={[
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200",
        "focus:outline-none focus:ring-2 focus:ring-ember/50 focus:ring-offset-2",
        enabled ? "bg-forest" : "bg-slate/30",
        isPending ? "opacity-60 cursor-not-allowed" : "",
      ].join(" ")}
    >
      <span className="sr-only">{enabled ? "활성" : "비활성"}</span>
      <span
        className={[
          "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200",
          enabled ? "translate-x-5" : "translate-x-0",
        ].join(" ")}
      />
    </button>
  );
}
