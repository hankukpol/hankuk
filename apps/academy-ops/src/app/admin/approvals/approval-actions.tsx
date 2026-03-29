"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { RefundType } from "@prisma/client";

// ─── Study Room Booking Approval Actions ──────────────────────────────────────

export type PendingBookingRow = {
  id: string;
  examNumber: string;
  studentName: string | null;
  roomId: string;
  roomName: string;
  bookingDate: string; // ISO date string
  startTime: string;
  endTime: string;
  note: string | null;
  createdAt: string;
};

type BookingActionsProps = {
  booking: PendingBookingRow;
};

export function StudyRoomBookingActions({ booking }: BookingActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAction(action: "CONFIRMED" | "CANCELLED") {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/study-room-bookings/${booking.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: action }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "처리에 실패했습니다.");
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={loading}
          onClick={() => handleAction("CONFIRMED")}
          className="rounded-full border border-forest/30 bg-forest/10 px-3 py-1 text-xs font-semibold text-forest transition hover:bg-forest/20 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap"
        >
          승인
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => handleAction("CANCELLED")}
          className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap"
        >
          거절
        </button>
      </div>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

export type PendingRefundRow = {
  id: string;
  paymentId: string;
  refundType: RefundType;
  amount: number;
  reason: string;
  createdAt: string;
  requestedByName: string | null;
  payment: {
    examNumber: string | null;
    student: { name: string } | null;
    grossAmount: number;
    netAmount: number;
    note: string | null;
  };
};

type ApprovalActionsProps = {
  refund: PendingRefundRow;
};

export function ApprovalActions({ refund }: ApprovalActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<"approve" | "reject" | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  function openApprove() {
    setModal("approve");
    setError(null);
  }

  function openReject() {
    setModal("reject");
    setRejectNote("");
    setError(null);
  }

  function closeModal() {
    setModal(null);
    setRejectNote("");
    setError(null);
  }

  async function handleApprove() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/approvals/refunds/${refund.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "APPROVE" }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "승인 처리에 실패했습니다.");
        return;
      }
      closeModal();
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function handleReject() {
    if (!rejectNote.trim()) {
      setError("반려 사유를 입력하세요.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/approvals/refunds/${refund.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "REJECT", note: rejectNote.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "반려 처리에 실패했습니다.");
        return;
      }
      closeModal();
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  const studentLabel = refund.payment.student
    ? `${refund.payment.student.name}${refund.payment.examNumber ? ` (${refund.payment.examNumber})` : ""}`
    : "비회원";

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={loading}
          onClick={openApprove}
          className="rounded-full border border-forest/30 bg-forest/10 px-3 py-1 text-xs font-semibold text-forest transition hover:bg-forest/20 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap"
        >
          승인
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={openReject}
          className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap"
        >
          반려
        </button>
      </div>

      {/* 승인 확인 모달 */}
      {modal === "approve" ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-xl">
            <h3 className="mb-1 text-base font-semibold text-ink">환불 승인</h3>
            <p className="mb-4 text-sm text-slate">
              {studentLabel} — {refund.amount.toLocaleString()}원 환불 요청을 승인하시겠습니까?
            </p>
            {error ? <p className="mb-3 text-xs text-red-600">{error}</p> : null}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={closeModal}
                disabled={loading}
                className="flex-1 rounded-full border border-ink/20 py-2.5 text-sm font-medium text-slate transition hover:border-ink/40 hover:text-ink disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleApprove}
                disabled={loading}
                className="flex-1 rounded-full bg-[#1F4D3A] py-2.5 text-sm font-semibold text-white transition hover:bg-[#1a4232] disabled:opacity-50"
              >
                {loading ? "처리 중..." : "승인 확정"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* 반려 사유 모달 */}
      {modal === "reject" ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-xl">
            <h3 className="mb-1 text-base font-semibold text-ink">환불 반려</h3>
            <p className="mb-4 text-sm text-slate">
              {studentLabel} — {refund.amount.toLocaleString()}원
            </p>
            <div className="mb-4">
              <label className="mb-1.5 block text-xs font-medium text-slate">
                반려 사유 <span className="text-red-500">*</span>
              </label>
              <textarea
                value={rejectNote}
                onChange={(e) => {
                  setRejectNote(e.target.value);
                  setError(null);
                }}
                rows={3}
                placeholder="반려 사유를 입력하세요."
                className="w-full resize-none rounded-2xl border border-ink/20 bg-mist/30 px-4 py-3 text-sm text-ink placeholder:text-slate/50 focus:border-ember/50 focus:outline-none focus:ring-2 focus:ring-ember/10"
              />
              {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={closeModal}
                disabled={loading}
                className="flex-1 rounded-full border border-ink/20 py-2.5 text-sm font-medium text-slate transition hover:border-ink/40 hover:text-ink disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={loading}
                className="flex-1 rounded-full bg-red-600 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {loading ? "처리 중..." : "반려 확정"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
