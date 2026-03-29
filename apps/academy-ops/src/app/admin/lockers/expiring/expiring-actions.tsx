"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type Props = {
  rentalId: string;
  lockerNumber: string;
  studentName: string;
  examNumber: string;
};

function addMonths(date: Date, months: number): string {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function ExpiringActions({
  rentalId,
  lockerNumber,
  studentName,
  examNumber,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<"extend" | "return" | "notify" | null>(null);
  const [showExtend, setShowExtend] = useState(false);
  const [newEndDate, setNewEndDate] = useState<string>(() => {
    return addMonths(new Date(), 1);
  });

  async function handleReturn() {
    if (
      !confirm(
        `사물함 ${lockerNumber}을(를) ${studentName} 학생으로부터 반납 처리할까요?`,
      )
    )
      return;
    setBusy("return");
    try {
      const res = await fetch(`/api/lockers/rentals/${rentalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "RETURNED" }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? "반납 처리 실패");
      } else {
        toast.success("반납 처리 완료");
        router.refresh();
      }
    } catch {
      toast.error("네트워크 오류");
    } finally {
      setBusy(null);
    }
  }

  async function handleExtend() {
    if (!newEndDate) {
      toast.error("연장 종료일을 선택해주세요.");
      return;
    }
    setBusy("extend");
    try {
      const res = await fetch(`/api/lockers/rentals/${rentalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endDate: newEndDate }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? "연장 처리 실패");
      } else {
        toast.success("연장 처리 완료");
        setShowExtend(false);
        router.refresh();
      }
    } catch {
      toast.error("네트워크 오류");
    } finally {
      setBusy(null);
    }
  }

  async function handleNotify() {
    if (
      !confirm(
        `${studentName} 학생에게 사물함 ${lockerNumber} 만료 안내 알림을 발송할까요?`,
      )
    )
      return;
    setBusy("notify");
    try {
      const res = await fetch("/api/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: "student",
          examNumbers: [examNumber],
          message: `[사물함 만료 안내] ${lockerNumber}번 사물함 대여 기간이 곧 만료됩니다. 연장 또는 반납 처리를 해주세요.`,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? "알림 발송 실패");
      } else {
        toast.success("알림 발송 완료");
      }
    } catch {
      toast.error("네트워크 오류");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {showExtend ? (
        <>
          <input
            type="date"
            value={newEndDate}
            onChange={(e) => setNewEndDate(e.target.value)}
            className="rounded-lg border border-ink/20 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ember/30"
          />
          <button
            onClick={handleExtend}
            disabled={busy === "extend"}
            className="rounded-lg bg-forest px-3 py-1.5 text-xs font-medium text-white transition hover:bg-forest/90 disabled:opacity-50"
          >
            {busy === "extend" ? "처리 중..." : "확인"}
          </button>
          <button
            onClick={() => setShowExtend(false)}
            disabled={busy !== null}
            className="rounded-lg border border-ink/20 px-3 py-1.5 text-xs font-medium text-slate transition hover:border-ink/40 disabled:opacity-50"
          >
            취소
          </button>
        </>
      ) : (
        <>
          <button
            onClick={() => setShowExtend(true)}
            disabled={busy !== null}
            className="rounded-lg bg-forest/10 px-3 py-1.5 text-xs font-medium text-forest transition hover:bg-forest/20 disabled:opacity-50"
          >
            연장
          </button>
          <button
            onClick={handleReturn}
            disabled={busy !== null}
            className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-100 disabled:opacity-50"
          >
            {busy === "return" ? "처리 중..." : "반납"}
          </button>
          <button
            onClick={handleNotify}
            disabled={busy !== null}
            className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
            title="카카오 알림톡 발송"
          >
            {busy === "notify" ? "발송 중..." : "알림 발송"}
          </button>
        </>
      )}
    </div>
  );
}
