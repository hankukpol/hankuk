"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type RestoreButtonProps = {
  examNumber: string;
  studentName: string;
};

export function RestoreButton({ examNumber, studentName }: RestoreButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRestore() {
    if (
      !window.confirm(
        `${studentName} 학생을 복교 처리하시겠습니까?\n\n휴원 중인 모든 수강 등록이 수강 중(ACTIVE)으로 변경됩니다.`,
      )
    ) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/students/${examNumber}/suspend`, {
        method: "DELETE",
      });

      const json = (await response.json()) as { success?: boolean; error?: string; restored?: number };

      if (!response.ok || json.error) {
        throw new Error(json.error ?? "복교 처리에 실패했습니다.");
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "복교 처리에 실패했습니다.");
      setLoading(false);
    }
  }

  if (error) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={handleRestore}
          disabled={loading}
          className="rounded-lg border border-forest/30 bg-forest/10 px-3 py-1.5 text-xs font-semibold text-forest hover:bg-forest/20 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          재시도
        </button>
        <span className="text-xs text-red-600">{error}</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleRestore}
      disabled={loading}
      className="rounded-lg border border-forest/30 bg-forest/10 px-3 py-1.5 text-xs font-semibold text-forest hover:bg-forest/20 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading ? "처리 중..." : "복교 처리"}
    </button>
  );
}
