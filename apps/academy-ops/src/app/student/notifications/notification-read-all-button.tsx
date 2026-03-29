"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

export function NotificationReadAllButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleMarkAllRead() {
    setLoading(true);
    try {
      const res = await fetch("/api/student/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAll: true }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast.error((json as { error?: string }).error ?? "읽음 처리에 실패했습니다.");
        return;
      }

      toast.success("모든 알림을 읽음으로 처리했습니다.");
      router.refresh();
    } catch {
      toast.error("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleMarkAllRead}
      disabled={loading}
      className="inline-flex min-h-9 items-center justify-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading ? "처리 중..." : "모두 읽음"}
    </button>
  );
}
