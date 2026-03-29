"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import type { RentalRow } from "@/app/admin/facilities/lockers/rental-billing/page";

type HistoryEntry = {
  id: string;
  examNumber: string;
  startDate: string;
  endDate: string | null;
  feeAmount: number;
  feeUnit: string;
  status: string;
  paidAt: string | null;
  note: string | null;
  student?: { name: string; examNumber: string };
};

type Props = {
  rental: RentalRow | null;
  onClose: () => void;
  onMarkPaid: (rentalId: string) => void;
  onCancel: (rentalId: string) => void;
};

const ZONE_LABELS: Record<string, string> = {
  CLASS_ROOM: "1강의실",
  JIDEOK_LEFT: "지덕 좌",
  JIDEOK_RIGHT: "지덕 우",
};

const FEE_UNIT_LABELS: Record<string, string> = {
  MONTHLY: "월정액",
  PER_COHORT: "기수별",
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "대여 중",
  RETURNED: "반납 완료",
  EXPIRED: "기간 만료",
  CANCELLED: "취소",
};

function statusBadgeClass(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "border-forest/20 bg-forest/10 text-forest";
    case "RETURNED":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "EXPIRED":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "CANCELLED":
      return "border-red-200 bg-red-50 text-red-700";
    default:
      return "border-ink/10 bg-mist text-slate";
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  return iso.slice(0, 10).replace(/-/g, ".");
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function getDaysRemaining(endDate: string | null): number | null {
  if (!endDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  return Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function LockerRentalDetailModal({ rental, onClose, onMarkPaid, onCancel }: Props) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  // Fetch locker rental history when modal opens
  useEffect(() => {
    if (!rental) return;

    setHistory([]);
    setHistoryLoading(true);
    setConfirmCancel(false);
    setActionError(null);

    fetch(`/api/lockers/${rental.lockerId}/rentals`)
      .then((res) => res.json())
      .then((data) => {
        const entries: HistoryEntry[] = (data.data ?? [])
          .filter((h: HistoryEntry) => h.id !== rental.id)
          .map((h: HistoryEntry) => ({
            id: h.id,
            examNumber: h.examNumber,
            startDate: new Date(h.startDate).toISOString().slice(0, 10),
            endDate: h.endDate ? new Date(h.endDate).toISOString().slice(0, 10) : null,
            feeAmount: h.feeAmount,
            feeUnit: h.feeUnit,
            status: h.status,
            paidAt: h.paidAt,
            note: h.note,
            student: h.student,
          }));
        setHistory(entries);
      })
      .catch(() => {
        // History is supplementary; ignore errors silently
      })
      .finally(() => setHistoryLoading(false));
  }, [rental]);

  // Escape key + body scroll lock
  useEffect(() => {
    if (!rental) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", handleKey);
    };
  }, [rental, onClose]);

  if (!rental) return null;

  const daysLeft = getDaysRemaining(rental.endDate);
  const isExpired = daysLeft !== null && daysLeft < 0;
  const isExpiringSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 7;

  function handleMarkPaid() {
    setActionError(null);
    startTransition(async () => {
      const res = await fetch(`/api/lockers/rentals/${rental!.id}/pay`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error ?? "납부 처리 실패");
        return;
      }
      onMarkPaid(rental!.id);
      onClose();
    });
  }

  function handleCancel() {
    if (!confirmCancel) {
      setConfirmCancel(true);
      return;
    }
    setActionError(null);
    startTransition(async () => {
      const res = await fetch(`/api/lockers/rentals/${rental!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CANCELLED" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error ?? "해지 처리 실패");
        setConfirmCancel(false);
        return;
      }
      onCancel(rental!.id);
      onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-8"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg overflow-y-auto rounded-[28px] bg-white shadow-xl"
        style={{ maxHeight: "calc(100vh - 4rem)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between rounded-t-[28px] bg-white px-6 pt-6 pb-4">
          <div>
            <div className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-sky-800">
              사물함 임대
            </div>
            <h2 className="mt-3 text-2xl font-semibold text-ink">
              {rental.lockerNumber}호
              <span className="ml-2 text-base font-normal text-slate">
                · {ZONE_LABELS[rental.zone] ?? rental.zone}
              </span>
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-4 mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-slate transition hover:bg-mist hover:text-ink"
            aria-label="닫기"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="px-6 pb-6 space-y-5">
          {/* Student info */}
          <div className="rounded-2xl border border-ink/10 bg-mist/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate mb-3">학생 정보</p>
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <span className="text-slate">이름</span>
              <Link
                href={`/admin/students/${rental.examNumber}`}
                className="font-semibold text-forest hover:underline underline-offset-2"
                onClick={onClose}
              >
                {rental.studentName}
              </Link>
              <span className="text-slate">학번</span>
              <span className="font-mono text-xs text-ink">{rental.examNumber}</span>
            </div>
          </div>

          {/* Rental period + fee */}
          <div className="rounded-2xl border border-ink/10 bg-mist/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate mb-3">임대 정보</p>
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <span className="text-slate">시작일</span>
              <span className="font-medium text-ink">{formatDate(rental.startDate)}</span>

              <span className="text-slate">만료일</span>
              <span>
                <span
                  className={[
                    "font-medium",
                    isExpired ? "text-red-600" : isExpiringSoon ? "text-amber-600" : "text-ink",
                  ].join(" ")}
                >
                  {rental.endDate ? formatDate(rental.endDate) : "계속"}
                </span>
                {daysLeft !== null && rental.status === "ACTIVE" && (
                  <span className="ml-1.5 text-xs text-slate">
                    {isExpired
                      ? `(${Math.abs(daysLeft)}일 초과)`
                      : daysLeft === 0
                      ? "(오늘 만료)"
                      : `(D-${daysLeft})`}
                  </span>
                )}
              </span>

              <span className="text-slate">임대료</span>
              <span className="font-medium text-ink">
                {rental.feeAmount.toLocaleString()}원
                <span className="ml-1 text-xs font-normal text-slate">
                  / {FEE_UNIT_LABELS[rental.feeUnit] ?? rental.feeUnit}
                </span>
              </span>

              <span className="text-slate">상태</span>
              <span>
                <span
                  className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(rental.status)}`}
                >
                  {STATUS_LABELS[rental.status] ?? rental.status}
                </span>
              </span>

              {rental.paidAt && (
                <>
                  <span className="text-slate">납부일시</span>
                  <span className="text-xs font-medium text-forest">{formatDateTime(rental.paidAt)}</span>
                </>
              )}

              {!rental.paidAt && rental.status === "ACTIVE" && (
                <>
                  <span className="text-slate">납부 상태</span>
                  <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700 w-fit">
                    미납
                  </span>
                </>
              )}
            </div>

            {rental.note && (
              <div className="mt-3 border-t border-ink/10 pt-3">
                <p className="text-xs font-semibold text-slate mb-1">메모</p>
                <p className="text-sm text-ink">{rental.note}</p>
              </div>
            )}
          </div>

          {/* Actions */}
          {actionError && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {actionError}
            </div>
          )}

          {rental.status === "ACTIVE" && (
            <div className="flex flex-wrap gap-3">
              {!rental.paidAt && (
                <button
                  type="button"
                  onClick={handleMarkPaid}
                  disabled={isPending}
                  className="inline-flex items-center rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-forest/80 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isPending ? "처리 중..." : "납부 처리"}
                </button>
              )}
              <button
                type="button"
                onClick={handleCancel}
                disabled={isPending}
                className={[
                  "inline-flex items-center rounded-full border px-5 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
                  confirmCancel
                    ? "border-red-300 bg-red-600 text-white hover:bg-red-700"
                    : "border-ink/15 bg-white text-slate hover:border-red-300 hover:text-red-600",
                ].join(" ")}
              >
                {confirmCancel ? "정말 해지하시겠습니까?" : "해지"}
              </button>
              {confirmCancel && (
                <button
                  type="button"
                  onClick={() => setConfirmCancel(false)}
                  disabled={isPending}
                  className="inline-flex items-center rounded-full border border-ink/10 bg-white px-4 py-2.5 text-sm text-slate transition hover:text-ink disabled:opacity-50"
                >
                  취소
                </button>
              )}
            </div>
          )}

          {/* History */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate mb-3">
              이 사물함의 이전 대여 이력
            </p>
            {historyLoading ? (
              <div className="py-4 text-center text-sm text-slate">불러오는 중...</div>
            ) : history.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-ink/10 py-5 text-center text-sm text-slate">
                이전 대여 이력 없음
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-ink/10">
                <table className="min-w-full divide-y divide-ink/10 text-xs">
                  <thead className="bg-mist/60 text-left">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold text-slate">학생</th>
                      <th className="px-4 py-2.5 font-semibold text-slate">기간</th>
                      <th className="px-4 py-2.5 font-semibold text-slate">상태</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/10 bg-white">
                    {history.map((h) => (
                      <tr key={h.id}>
                        <td className="px-4 py-2.5 font-medium text-ink">
                          {h.student?.name ?? h.examNumber}
                        </td>
                        <td className="px-4 py-2.5 text-slate">
                          {formatDate(h.startDate)} ~ {formatDate(h.endDate)}
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusBadgeClass(h.status)}`}
                          >
                            {STATUS_LABELS[h.status] ?? h.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
