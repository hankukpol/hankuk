"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type DeliverySummary = {
  code: string;
  label: string;
  status: "sent" | "failed" | "skipped";
  reason: string | null;
};

type ReceiptResendResponse = {
  paymentId: string;
  receiptNo: string;
  deliveries: DeliverySummary[];
  sentCount: number;
  failedCount: number;
  skippedCount: number;
};

type ReceiptResendButtonProps = {
  paymentId: string;
  label?: string;
  className?: string;
};

function buildStatusMessage(data: ReceiptResendResponse) {
  const sent = data.deliveries.filter((delivery) => delivery.status === "sent");
  const failed = data.deliveries.filter((delivery) => delivery.status === "failed");
  const skipped = data.deliveries.filter((delivery) => delivery.status === "skipped");

  if (sent.length > 0 && failed.length === 0 && skipped.length === 0) {
    return {
      tone: "success" as const,
      text: `${sent.map((delivery) => delivery.label).join(", ")} 재발송 완료 · 영수증 #${data.receiptNo}`,
    };
  }

  if (sent.length > 0) {
    const parts = [
      `발송: ${sent.map((delivery) => delivery.label).join(", ")}`,
      failed.length > 0
        ? `실패: ${failed.map((delivery) => `${delivery.label}${delivery.reason ? `(${delivery.reason})` : ""}`).join(", ")}`
        : null,
      skipped.length > 0
        ? `제외: ${skipped.map((delivery) => `${delivery.label}${delivery.reason ? `(${delivery.reason})` : ""}`).join(", ")}`
        : null,
    ].filter((value): value is string => Boolean(value));

    return {
      tone: "error" as const,
      text: `${parts.join(" / ")} · 영수증 #${data.receiptNo}`,
    };
  }

  const fallback = [...failed, ...skipped]
    .map((delivery) => `${delivery.label}${delivery.reason ? `(${delivery.reason})` : ""}`)
    .join(" / ");

  return {
    tone: "error" as const,
    text: fallback || "영수증 재발송에 실패했습니다.",
  };
}

export function ReceiptResendButton({
  paymentId,
  label = "영수증 재발송",
  className,
}: ReceiptResendButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");

  function handleClick() {
    setMessage(null);
    setMessageTone("success");

    startTransition(async () => {
      try {
        const response = await fetch(`/api/payments/${paymentId}/receipt-resend`, {
          method: "POST",
        });
        const json = (await response.json()) as { data?: ReceiptResendResponse; error?: string };

        if (!response.ok || !json.data) {
          setMessageTone("error");
          setMessage(json.error ?? "영수증 재발송에 실패했습니다.");
          return;
        }

        const summary = buildStatusMessage(json.data);
        setMessageTone(summary.tone);
        setMessage(summary.text);
        router.refresh();
      } catch {
        setMessageTone("error");
        setMessage("네트워크 오류로 영수증을 재발송하지 못했습니다.");
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className={
          className ??
          "inline-flex items-center gap-2 rounded-full border border-forest/20 bg-forest/5 px-5 py-2.5 text-sm font-semibold text-forest transition hover:border-forest/50 hover:bg-forest/10 disabled:cursor-not-allowed disabled:opacity-60"
        }
      >
        {isPending ? "재발송 중..." : label}
      </button>
      {message ? (
        <p className={`text-xs ${messageTone === "success" ? "text-forest" : "text-red-600"}`} aria-live="polite">
          {message}
        </p>
      ) : null}
    </div>
  );
}
