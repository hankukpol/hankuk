"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ReturnButtonProps = {
  leaveId: string;
  studentName: string;
};

export function ReturnButton({ leaveId, studentName }: ReturnButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleReturn() {
    if (
      !confirm(
        `${studentName} 학생의 복귀를 오늘 날짜로 처리하시겠습니까?\n\n이 작업은 복귀일을 오늘로 기록합니다.`,
      )
    ) {
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/leave-records/${leaveId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}), // returnDate defaults to today
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "복귀 처리에 실패했습니다.");
        return;
      }

      setDone(true);
      router.refresh();
    } catch {
      alert("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-forest/10 px-3 py-1 text-xs font-semibold text-forest">
        복귀 완료
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={handleReturn}
      disabled={loading}
      className="inline-flex items-center gap-1 rounded-full border border-forest/30 bg-forest/10 px-3 py-1 text-xs font-semibold text-forest transition hover:bg-forest hover:text-white disabled:opacity-50"
    >
      {loading ? "처리 중..." : "복귀 처리"}
    </button>
  );
}
