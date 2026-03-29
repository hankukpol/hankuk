"use client";

import { useState, useTransition } from "react";
import { ActionModal } from "@/components/ui/action-modal";

type Props = {
  open: boolean;
  paymentId: string;
  studentName: string | null;
  netAmount: number;
  alreadyRefunded: number;
  onClose: () => void;
  onSuccess: () => void;
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "요청에 실패했습니다.");
  return data as T;
}

export function RefundModal({
  open,
  paymentId,
  studentName,
  netAmount,
  alreadyRefunded,
  onClose,
  onSuccess,
}: Props) {
  const remaining = netAmount - alreadyRefunded;
  const [refundType, setRefundType] = useState<"CASH" | "TRANSFER">("CASH");
  const [amount, setAmount] = useState(String(remaining));
  const [reason, setReason] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNo, setAccountNo] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setRefundType("CASH");
    setAmount(String(remaining));
    setReason("");
    setBankName("");
    setAccountNo("");
    setAccountHolder("");
    setError(null);
  }

  function handleClose() {
    if (!isPending) {
      reset();
      onClose();
    }
  }

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      try {
        await requestJson(`/api/payments/${paymentId}/refund`, {
          method: "POST",
          body: JSON.stringify({
            refundType,
            amount: Number(amount),
            reason,
            bankName: refundType === "TRANSFER" ? bankName : undefined,
            accountNo: refundType === "TRANSFER" ? accountNo : undefined,
            accountHolder: refundType === "TRANSFER" ? accountHolder : undefined,
          }),
        });
        reset();
        onSuccess();
      } catch (e) {
        setError(e instanceof Error ? e.message : "환불 처리 실패");
      }
    });
  }

  const inputClass =
    "w-full rounded-2xl border border-ink/10 px-4 py-2.5 text-sm outline-none focus:border-ink/30 transition";
  const labelClass = "mb-1 block text-xs font-medium text-slate";

  return (
    <ActionModal
      open={open}
      badgeLabel="환불 처리"
      badgeTone="warning"
      title="환불 처리"
      description={`${studentName ?? "비회원"}의 결제에 대한 환불을 처리합니다.`}
      details={[
        `실납부금액: ${netAmount.toLocaleString()}원`,
        ...(alreadyRefunded > 0 ? [`기환불: ${alreadyRefunded.toLocaleString()}원`] : []),
        `환불 가능: ${remaining.toLocaleString()}원`,
      ]}
      cancelLabel="취소"
      confirmLabel={isPending ? "처리 중..." : "환불 처리"}
      confirmTone="danger"
      isPending={isPending}
      onClose={handleClose}
      onConfirm={handleConfirm}
      panelClassName="max-w-lg"
    >
      <div className="space-y-4">
        {/* 환불 유형 */}
        <div>
          <label className={labelClass}>환불 유형</label>
          <div className="flex gap-2">
            {(["CASH", "TRANSFER"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setRefundType(t)}
                className={`flex-1 rounded-full py-2 text-sm font-medium transition border ${
                  refundType === t
                    ? "border-ember bg-ember text-white"
                    : "border-ink/10 bg-white text-slate hover:border-ink/30"
                }`}
              >
                {t === "CASH" ? "현금 환불" : "계좌이체 환불"}
              </button>
            ))}
          </div>
        </div>

        {/* 환불 금액 */}
        <div>
          <label className={labelClass}>환불금액 (최대 {remaining.toLocaleString()}원)</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min={1}
            max={remaining}
            className={inputClass}
          />
        </div>

        {/* 사유 */}
        <div>
          <label className={labelClass}>환불 사유</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="환불 사유를 입력하세요"
            className={`${inputClass} resize-none`}
          />
        </div>

        {/* 계좌 정보 (계좌이체 환불 시) */}
        {refundType === "TRANSFER" ? (
          <div className="space-y-3 rounded-2xl bg-mist p-4">
            <p className="text-xs font-medium text-slate">계좌이체 환불 정보</p>
            <div>
              <label className={labelClass}>은행명</label>
              <input
                type="text"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="예: 국민은행"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>계좌번호</label>
              <input
                type="text"
                value={accountNo}
                onChange={(e) => setAccountNo(e.target.value)}
                placeholder="계좌번호"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>예금주</label>
              <input
                type="text"
                value={accountHolder}
                onChange={(e) => setAccountHolder(e.target.value)}
                placeholder="예금주 성명"
                className={inputClass}
              />
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}
      </div>
    </ActionModal>
  );
}
