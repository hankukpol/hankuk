"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface LockButtonProps {
  sessionId: number;
  isLocked: boolean;
}

export function LockButton({ sessionId, isLocked }: LockButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [locked, setLocked] = useState(isLocked);

  async function handleToggle() {
    setLoading(true);
    try {
      const response = await fetch(`/api/exams/sessions/${sessionId}/lock`, {
        method: "PATCH",
      });

      const payload = (await response.json().catch(() => ({}))) as { data?: { isLocked?: boolean }; error?: string };
      if (!response.ok) {
        alert(payload.error ?? "오류가 발생했습니다.");
        return;
      }

      setLocked(Boolean(payload.data?.isLocked));
      router.refresh();
    } catch {
      alert("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      className={`inline-flex items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-semibold transition disabled:opacity-50 ${
        locked
          ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
          : "border-forest/30 bg-forest/10 text-forest hover:bg-forest/20"
      }`}
    >
      {loading ? (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : locked ? (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0110 0v4" />
        </svg>
      ) : (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 019.9-1" />
        </svg>
      )}
      {locked ? "잠금 해제" : "잠금"}
    </button>
  );
}
