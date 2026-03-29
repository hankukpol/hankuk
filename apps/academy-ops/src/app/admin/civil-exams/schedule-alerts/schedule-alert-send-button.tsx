"use client";

import { useState } from "react";

type Props = {
  examCount: number;
};

export function ScheduleAlertSendButton({ examCount }: Props) {
  const [isPending, setIsPending] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  async function handleSend() {
    if (
      !confirm(
        `30일 이내 예정된 시험 ${examCount}건에 대해 알림을 발송하시겠습니까?\n수강 동의한 학생 전체에게 발송됩니다.`,
      )
    ) {
      return;
    }

    setIsPending(true);
    setResult(null);

    try {
      const res = await fetch("/api/civil-exams/schedule-alerts/send", {
        method: "POST",
      });
      const data = (await res.json()) as {
        data?: { count: number; examCount: number };
        error?: string;
      };

      if (!res.ok) {
        setResult({
          success: false,
          message: data.error ?? "알림 발송에 실패했습니다.",
        });
        return;
      }

      const d = data.data!;
      setResult({
        success: true,
        message: `알림 ${d.count}건 생성 완료 (시험 ${d.examCount}건)`,
      });
    } catch {
      setResult({
        success: false,
        message: "네트워크 오류가 발생했습니다.",
      });
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={handleSend}
        disabled={isPending}
        className="inline-flex items-center gap-2 rounded-full bg-ember px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-ember/90 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isPending ? (
          <>
            <svg
              className="h-4 w-4 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
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
            발송 중...
          </>
        ) : (
          "알림 발송"
        )}
      </button>
      {result && (
        <p
          className={`text-xs font-medium ${result.success ? "text-forest" : "text-red-600"}`}
        >
          {result.success ? "✓" : "✗"} {result.message}
        </p>
      )}
    </div>
  );
}
