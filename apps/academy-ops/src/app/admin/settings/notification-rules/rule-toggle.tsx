"use client";

import { useState, useTransition } from "react";

type RuleToggleProps = {
  ruleType: string;
  ruleName: string;
  description: string;
  isEnabled: boolean;
  channel: string;
  note?: string;
};

const CHANNEL_BADGE: Record<string, { label: string; className: string }> = {
  "카카오 알림톡": {
    label: "카카오",
    className: "border-yellow-200 bg-yellow-50 text-yellow-700",
  },
  SMS: {
    label: "SMS",
    className: "border-sky-200 bg-sky-50 text-sky-700",
  },
  "앱 내 알림": {
    label: "앱 알림",
    className: "border-purple-200 bg-purple-50 text-purple-700",
  },
};

export function RuleToggle({
  ruleType,
  ruleName,
  description,
  isEnabled: initialEnabled,
  channel,
  note,
}: RuleToggleProps) {
  const [isEnabled, setIsEnabled] = useState(initialEnabled);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const channelBadge = CHANNEL_BADGE[channel] ?? {
    label: channel,
    className: "border-slate-200 bg-slate-50 text-slate-600",
  };

  function handleToggle() {
    const nextValue = !isEnabled;
    // Optimistic update
    setIsEnabled(nextValue);
    setError(null);

    startTransition(async () => {
      try {
        const res = await fetch("/api/settings/notification-rules", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ruleType, enabled: nextValue }),
        });

        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error((json as { error?: string }).error ?? "저장 실패");
        }
      } catch (err) {
        // Rollback on error
        setIsEnabled(!nextValue);
        setError(err instanceof Error ? err.message : "저장 중 오류가 발생했습니다.");
      }
    });
  }

  return (
    <div
      className={`flex items-start gap-4 rounded-[20px] border bg-white p-5 transition-colors ${
        isEnabled ? "border-ink/10" : "border-ink/5 opacity-60"
      }`}
    >
      {/* Toggle switch */}
      <button
        type="button"
        role="switch"
        aria-checked={isEnabled}
        aria-label={`${ruleName} 알림 ${isEnabled ? "비활성화" : "활성화"}`}
        onClick={handleToggle}
        disabled={isPending}
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 transition-colors focus:outline-none focus:ring-2 focus:ring-ember focus:ring-offset-2 disabled:cursor-wait ${
          isEnabled
            ? "border-forest bg-forest"
            : "border-ink/20 bg-ink/10"
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
            isEnabled ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-ink text-sm">{ruleName}</span>
          <span
            className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${channelBadge.className}`}
          >
            {channelBadge.label}
          </span>
          {isPending && (
            <span className="text-xs text-slate animate-pulse">저장 중...</span>
          )}
          {!isPending && (
            <span
              className={`text-xs font-semibold ${isEnabled ? "text-forest" : "text-slate"}`}
            >
              {isEnabled ? "활성" : "비활성"}
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-slate leading-5">{description}</p>
        {note && <p className="mt-0.5 text-xs text-slate/60">{note}</p>}
        {error && (
          <p className="mt-1 text-xs text-red-600 font-medium">{error}</p>
        )}
      </div>
    </div>
  );
}
