"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefundStatus } from "@prisma/client";
import { toast } from "sonner";

type Props = {
  refundId: string;
  paymentId: string;
  status: RefundStatus;
};

export function RefundActionButtons({ refundId, paymentId, status }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectError, setRejectError] = useState<string | null>(null);

  if (status !== "PENDING") {
    return (
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-5 py-2.5 text-sm font-medium text-slate shadow-sm transition hover:border-ink/30 hover:text-ink"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M3 5V1h8v4M3 9H1V5h12v4h-2M3 9v4h8V9"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
          영수증 인쇄
        </button>
      </div>
    );
  }

  async function handleApprove() {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/payments/${paymentId}/refund/${refundId}/approve`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "APPROVE" }),
        },
      );
      const json = await res.json() as { error?: string };
      if (!res.ok) {
        toast.error(json.error ?? "승인 처리에 실패했습니다.");
        return;
      }
      toast.success("환불이 승인되었습니다.");
      router.refresh();
    } catch {
      toast.error("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function openRejectModal() {
    setRejectionReason("");
    setRejectError(null);
    setShowRejectModal(true);
  }

  function closeRejectModal() {
    setShowRejectModal(false);
    setRejectionReason("");
    setRejectError(null);
  }

  async function handleReject() {
    if (!rejectionReason.trim()) {
      setRejectError("거절 사유를 입력하세요.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/payments/${paymentId}/refund/${refundId}/approve`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "REJECT",
            rejectionReason: rejectionReason.trim(),
          }),
        },
      );
      const json = await res.json() as { error?: string };
      if (!res.ok) {
        setRejectError(json.error ?? "거절 처리에 실패했습니다.");
        return;
      }
      toast.success("환불 요청이 거절되었습니다.");
      closeRejectModal();
      router.refresh();
    } catch {
      setRejectError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={loading}
          onClick={handleApprove}
          className="inline-flex items-center gap-2 rounded-full border border-forest/30 bg-forest/10 px-6 py-2.5 text-sm font-semibold text-forest transition hover:bg-forest/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "처리 중..." : "승인"}
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={openRejectModal}
          className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-6 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          거절
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-5 py-2.5 text-sm font-medium text-slate shadow-sm transition hover:border-ink/30 hover:text-ink"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M3 5V1h8v4M3 9H1V5h12v4h-2M3 9v4h8V9"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
          인쇄
        </button>
      </div>

      {/* Reject Modal */}
      {showRejectModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-xl">
            <h3 className="mb-1 text-base font-semibold text-ink">환불 요청 거절</h3>
            <p className="mb-4 text-sm text-slate">
              거절 사유를 입력하면 요청 상태가 거절됨으로 변경됩니다.
            </p>

            <div className="mb-4">
              <label className="mb-1.5 block text-xs font-medium text-slate">
                거절 사유 <span className="text-red-500">*</span>
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => {
                  setRejectionReason(e.target.value);
                  setRejectError(null);
                }}
                rows={3}
                placeholder="거절 사유를 입력하세요."
                className="w-full resize-none rounded-2xl border border-ink/20 bg-mist/30 px-4 py-3 text-sm text-ink placeholder:text-slate/50 focus:border-ember/50 focus:outline-none focus:ring-2 focus:ring-ember/10"
              />
              {rejectError ? (
                <p className="mt-1 text-xs text-red-600">{rejectError}</p>
              ) : null}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={closeRejectModal}
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
                {loading ? "처리 중..." : "거절 확정"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
