"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";

type Props = {
  logId: number;
  channel: string;
  currentStatus: string;
};

export function RetryButton({ logId, channel: _channel, currentStatus }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<"success" | "failed" | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Only show for FAILED status
  if (currentStatus !== "failed") {
    return null;
  }

  const handleRetry = useCallback(async () => {
    setLoading(true);
    setResult(null);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/notifications/${logId}/retry`, {
        method: "POST",
      });

      const json = (await res.json()) as {
        error?: string;
        data?: { success: boolean; newStatus: string };
      };

      if (!res.ok || json.error) {
        setResult("failed");
        setErrorMessage(json.error ?? "재발송에 실패했습니다.");
        return;
      }

      if (json.data?.success) {
        setResult("success");
        router.refresh();
      } else {
        setResult("failed");
        setErrorMessage(`재발송 실패 (${json.data?.newStatus ?? "알 수 없음"})`);
      }
    } catch {
      setResult("failed");
      setErrorMessage("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [logId, router]);

  return (
    <div className="space-y-1">
      {result === "success" ? (
        <span className="inline-flex items-center rounded-full border border-forest/30 bg-forest/10 px-3 py-1 text-xs font-medium text-forest">
          재발송 성공
        </span>
      ) : (
        <button
          type="button"
          onClick={handleRetry}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-full border border-ember/30 bg-ember/10 px-3 py-1 text-xs font-medium text-ember transition hover:border-ember hover:bg-ember hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <>
              <svg
                className="h-3 w-3 animate-spin"
                xmlns="http://www.w3.org/2000/svg"
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
            "재발송"
          )}
        </button>
      )}
      {result === "failed" && errorMessage && (
        <p className="text-xs text-red-600">{errorMessage}</p>
      )}
    </div>
  );
}
