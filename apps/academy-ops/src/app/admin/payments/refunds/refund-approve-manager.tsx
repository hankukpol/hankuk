"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefundType } from "@prisma/client";
import { formatDateTime } from "@/lib/format";
import { toast } from "sonner";

const REFUND_TYPE_LABEL: Record<RefundType, string> = {
  CARD_CANCEL: "카드취소",
  CASH: "현금환불",
  TRANSFER: "계좌이체",
  PARTIAL: "부분환불",
};

export type PendingRefundItem = {
  id: string;
  paymentId: string;
  refundType: RefundType;
  amount: number;
  reason: string;
  processedAt: string;
  processor: { name: string } | null;
  payment: {
    examNumber: string | null;
    student: { name: string } | null;
    grossAmount: number;
    netAmount: number;
    note: string | null;
  };
};

export function RefundApproveManager({ refunds: initial }: { refunds: PendingRefundItem[] }) {
  const router = useRouter();
  const [refunds, setRefunds] = useState(initial);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PendingRefundItem | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectError, setRejectError] = useState<string | null>(null);

  async function handleApprove(refund: PendingRefundItem) {
    setLoadingId(refund.id);
    try {
      const res = await fetch(
        `/api/payments/${refund.paymentId}/refund/${refund.id}/approve`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "APPROVE" }),
        },
      );
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "승인 처리에 실패했습니다.");
        return;
      }
      setRefunds((prev) => prev.filter((r) => r.id !== refund.id));
      router.refresh();
    } finally {
      setLoadingId(null);
    }
  }

  function openRejectModal(refund: PendingRefundItem) {
    setRejectTarget(refund);
    setRejectionReason("");
    setRejectError(null);
  }

  function closeRejectModal() {
    setRejectTarget(null);
    setRejectionReason("");
    setRejectError(null);
  }

  async function handleReject() {
    if (!rejectTarget) return;
    if (!rejectionReason.trim()) {
      setRejectError("거절 사유를 입력하세요.");
      return;
    }
    setLoadingId(rejectTarget.id);
    try {
      const res = await fetch(
        `/api/payments/${rejectTarget.paymentId}/refund/${rejectTarget.id}/approve`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "REJECT", rejectionReason: rejectionReason.trim() }),
        },
      );
      const json = await res.json();
      if (!res.ok) {
        setRejectError(json.error ?? "거절 처리에 실패했습니다.");
        return;
      }
      setRefunds((prev) => prev.filter((r) => r.id !== rejectTarget.id));
      closeRejectModal();
      router.refresh();
    } finally {
      setLoadingId(null);
    }
  }

  if (refunds.length === 0) {
    return (
      <div className="rounded-[28px] border border-ink/10 bg-white p-12 text-center">
        <p className="text-slate text-sm">대기 중인 환불 요청이 없습니다.</p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-[28px] border border-ink/10 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm divide-y divide-ink/10">
            <thead>
              <tr>
                {["요청일시", "학생", "수납 내역", "환불 금액", "환불 유형", "환불 사유", "요청자", "처리", ""].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-medium text-slate uppercase bg-mist/50 whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              {refunds.map((r) => {
                const isLoading = loadingId === r.id;
                return (
                  <tr key={r.id} className="hover:bg-mist/30 transition-colors">
                    <td className="px-4 py-3 text-xs text-slate whitespace-nowrap">
                      {formatDateTime(r.processedAt)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {r.payment.student ? (
                        <div>
                          <a
                            href={`/admin/students/${r.payment.examNumber}`}
                            className="font-medium text-ink hover:text-ember transition-colors"
                          >
                            {r.payment.student.name}
                          </a>
                          {r.payment.examNumber ? (
                            <p className="text-xs text-slate">{r.payment.examNumber}</p>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-slate text-xs">비회원</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate whitespace-nowrap">
                      {r.payment.netAmount.toLocaleString()}원
                      {r.payment.note ? (
                        <p className="text-xs text-slate/70 truncate max-w-[120px]">{r.payment.note}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 font-semibold text-red-600 tabular-nums whitespace-nowrap">
                      -{r.amount.toLocaleString()}원
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                        {REFUND_TYPE_LABEL[r.refundType]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate max-w-[180px] truncate">{r.reason}</td>
                    <td className="px-4 py-3 text-xs text-slate whitespace-nowrap">
                      {r.processor?.name ?? "-"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={isLoading}
                          onClick={() => handleApprove(r)}
                          className="rounded-full border border-forest/30 bg-forest/10 px-3 py-1 text-xs font-semibold text-forest transition hover:bg-forest/20 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                        >
                          {isLoading ? "처리 중..." : "승인"}
                        </button>
                        <button
                          type="button"
                          disabled={isLoading}
                          onClick={() => openRejectModal(r)}
                          className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                        >
                          거절
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={`/admin/payments/refunds/${r.id}`}
                        className="whitespace-nowrap rounded-full border border-ink/10 px-3 py-1 text-xs font-medium text-slate transition hover:border-ink/30 hover:text-ink"
                      >
                        상세보기
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 거절 사유 모달 */}
      {rejectTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-xl">
            <h3 className="text-base font-semibold text-ink mb-1">환불 요청 거절</h3>
            <p className="text-sm text-slate mb-4">
              {rejectTarget.payment.student?.name ?? "비회원"}
              {rejectTarget.payment.examNumber
                ? ` (${rejectTarget.payment.examNumber})`
                : ""}{" "}
              — {rejectTarget.amount.toLocaleString()}원
            </p>

            <div className="mb-4">
              <label className="block text-xs font-medium text-slate mb-1.5">
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
                className="w-full rounded-2xl border border-ink/20 bg-mist/30 px-4 py-3 text-sm text-ink placeholder:text-slate/50 focus:border-ember/50 focus:outline-none focus:ring-2 focus:ring-ember/10 resize-none"
              />
              {rejectError ? (
                <p className="mt-1 text-xs text-red-600">{rejectError}</p>
              ) : null}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={closeRejectModal}
                disabled={loadingId === rejectTarget.id}
                className="flex-1 rounded-full border border-ink/20 py-2.5 text-sm font-medium text-slate transition hover:border-ink/40 hover:text-ink disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={loadingId === rejectTarget.id}
                className="flex-1 rounded-full bg-red-600 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {loadingId === rejectTarget.id ? "처리 중..." : "거절 확정"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
