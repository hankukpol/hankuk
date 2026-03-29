"use client";

import { useState } from "react";
import { toast } from "sonner";

type Props = {
  installmentId: string;
  studentName: string;
  disabled?: boolean;
};

export function SendReminderButton({ installmentId, studentName, disabled }: Props) {
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSend() {
    if (isSending || sent || disabled) return;

    setIsSending(true);
    try {
      const res = await fetch(`/api/payments/installments/${installmentId}/remind`, {
        method: "POST",
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error ?? "\uBC1C\uC1A1 \uC2E4\uD328");
      }

      setSent(true);
      toast.success(`${studentName}\uC5D0\uAC8C \uBBF8\uB0A9 \uC548\uB0B4\uB97C \uBC1C\uC1A1\uD588\uC2B5\uB2C8\uB2E4.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "\uBBF8\uB0A9 \uC548\uB0B4 \uBC1C\uC1A1\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.");
    } finally {
      setIsSending(false);
    }
  }

  if (sent) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-forest/20 bg-forest/10 px-3 py-1.5 text-xs font-semibold text-forest">
        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
        \uBC1C\uC1A1 \uC644\uB8CC
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={handleSend}
      disabled={isSending || disabled}
      className={[
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
        disabled
          ? "cursor-not-allowed border-slate/20 bg-slate/10 text-slate/50"
          : "border-ember/30 bg-ember/5 text-ember hover:bg-ember/10 active:bg-ember/15",
        isSending ? "cursor-wait opacity-70" : "",
      ].join(" ")}
    >
      {isSending ? (
        <>
          <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
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
          \uBC1C\uC1A1 \uC911
        </>
      ) : (
        <>
          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
            />
          </svg>
          \uBBF8\uB0A9 \uC548\uB0B4
        </>
      )}
    </button>
  );
}
