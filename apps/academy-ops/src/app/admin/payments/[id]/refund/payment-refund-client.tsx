"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PaymentDetailData } from "../payment-detail";
import { RefundCalculatorClient } from "../../refund-calculator/refund-calculator-client";

type Props = {
  payment: PaymentDetailData;
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

export function PaymentRefundClient({ payment }: Props) {
  const router = useRouter();
  const refunded = useMemo(() => payment.refunds.reduce((sum, item) => sum + item.amount, 0), [payment]);
  const remaining = Math.max(0, payment.netAmount - refunded);
  const [refundType, setRefundType] = useState<"CASH" | "TRANSFER" | "PARTIAL">("CASH");
  const [amount, setAmount] = useState(String(Math.max(1, remaining)));
  const [reason, setReason] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNo, setAccountNo] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const inputClass =
    "w-full rounded-2xl border border-ink/10 px-4 py-2.5 text-sm outline-none transition focus:border-ink/30";
  const labelClass = "mb-1 block text-xs font-medium text-slate";
  const canSubmit = remaining > 0 && (payment.status === "APPROVED" || payment.status === "PARTIAL_REFUNDED");

  function reset() {
    setRefundType("CASH");
    setAmount(String(Math.max(1, remaining)));
    setReason("");
    setBankName("");
    setAccountNo("");
    setAccountHolder("");
    setError(null);
  }

  function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await requestJson<{ data: { refund: { id: string } } }>(
          `/api/payments/${payment.id}/refund`,
          {
            method: "POST",
            body: JSON.stringify({
              refundType,
              amount: Number(amount),
              reason,
              bankName: refundType === "TRANSFER" ? bankName : undefined,
              accountNo: refundType === "TRANSFER" ? accountNo : undefined,
              accountHolder: refundType === "TRANSFER" ? accountHolder : undefined,
            }),
          },
        );
        reset();
        router.push(`/admin/payments/refunds/${result.data.refund.id}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "환불 등록에 실패했습니다.");
      }
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
      <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-ink">환불 등록</h2>
            <p className="mt-1 text-sm text-slate">
              결제 상세를 기준으로 환불 금액을 입력하고 승인 대기 상태로 등록합니다.
            </p>
          </div>
          <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
            남은 환불 가능액 {remaining.toLocaleString()}원
          </span>
        </div>

        <div className="mt-5 space-y-5">
          <div>
            <label className={labelClass}>환불 유형</label>
            <div className="flex gap-2">
              {(["CASH", "TRANSFER", "PARTIAL"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setRefundType(type)}
                  className={`flex-1 rounded-full border px-4 py-2 text-sm font-medium transition ${
                    refundType === type
                      ? "border-ember bg-ember text-white"
                      : "border-ink/10 bg-white text-slate hover:border-ink/30"
                  }`}
                >
                  {type === "CASH" ? "현금 환불" : type === "TRANSFER" ? "계좌이체 환불" : "부분 환불"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelClass}>환불 금액</label>
            <input
              type="number"
              min={1}
              max={remaining}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-slate">최대 환불 가능 금액: {remaining.toLocaleString()}원</p>
          </div>

          <div>
            <label className={labelClass}>환불 사유</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="환불 사유를 입력하세요."
              className={`${inputClass} resize-none`}
            />
          </div>

          {refundType === "TRANSFER" ? (
            <div className="space-y-3 rounded-2xl bg-mist p-4">
              <p className="text-xs font-medium text-slate">계좌이체 환불 정보</p>
              <div>
                <label className={labelClass}>은행명</label>
                <input
                  type="text"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>계좌번호</label>
                <input
                  type="text"
                  value={accountNo}
                  onChange={(e) => setAccountNo(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>예금주</label>
                <input
                  type="text"
                  value={accountHolder}
                  onChange={(e) => setAccountHolder(e.target.value)}
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

          {!canSubmit ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              이 결제는 현재 환불 등록이 가능한 상태가 아닙니다.
            </div>
          ) : null}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending || !canSubmit}
            className="w-full rounded-[14px] bg-ember px-5 py-3 text-sm font-semibold text-white transition hover:bg-ember/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "등록 중..." : "환불 등록"}
          </button>
        </div>
      </div>

      <div className="space-y-6">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <h2 className="text-base font-semibold text-ink">결제 요약</h2>
          <div className="mt-4 space-y-2">
            <SummaryRow label="학번" value={payment.examNumber ?? "-"} />
            <SummaryRow label="이름" value={payment.student?.name ?? "-"} />
            <SummaryRow label="연락처" value={payment.student?.phone ?? "-"} />
            <SummaryRow label="결제 상태" value={payment.status} />
            <SummaryRow label="결제 수단" value={payment.method} />
            <SummaryRow label="결제 금액" value={`${payment.grossAmount.toLocaleString()}원`} />
            <SummaryRow label="실수납액" value={`${payment.netAmount.toLocaleString()}원`} />
            <SummaryRow label="기존 환불" value={`${refunded.toLocaleString()}원`} />
            <SummaryRow label="남은 환불 가능액" value={`${remaining.toLocaleString()}원`} />
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <a
              href={`/admin/payments/${payment.id}`}
              className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-4 py-2 text-xs font-medium text-slate transition hover:border-ink/30 hover:text-ink"
            >
              결제 상세
            </a>
            <a
              href="/admin/payments/refunds"
              className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-4 py-2 text-xs font-medium text-slate transition hover:border-ink/30 hover:text-ink"
            >
              환불 대기 목록
            </a>
          </div>
        </div>

        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-ink">환불 계산 도우미</h2>
              <p className="mt-1 text-sm text-slate">기수 기준 환불 계산이 필요한 경우 함께 확인합니다.</p>
            </div>
            <a
              href="/admin/payments/refund-calculator"
              className="inline-flex items-center rounded-full border border-ember/20 bg-ember/5 px-3 py-1.5 text-xs font-semibold text-ember transition hover:bg-ember/10"
            >
              전체 계산기
            </a>
          </div>
          <div className="mt-5">
            <RefundCalculatorClient />
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-ink/5 py-2.5 last:border-0">
      <span className="text-sm text-slate">{label}</span>
      <span className="text-right text-sm font-medium text-ink">{value}</span>
    </div>
  );
}
