"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

// ── types ─────────────────────────────────────────────────────────────────────

type PosPaymentItem = {
  itemName: string;
  amount: number;
};

type PosPayment = {
  id: string;
  netAmount: number;
  method: string;
  status: string;
  note: string | null;
  processedAt: string;
  examNumber: string | null;
  student: { name: string; examNumber: string } | null;
  items: PosPaymentItem[];
  refunds: { amount: number; status: string }[];
};

type RefundFormData = {
  refundType: string;
  amount: string;
  reason: string;
};

const REASON_OPTIONS = [
  "고객 변심",
  "강좌 일정 변경",
  "수강 취소",
  "중복 결제",
  "기타",
];

const METHOD_LABEL: Record<string, string> = {
  CASH: "현금",
  CARD: "카드",
  TRANSFER: "계좌이체",
  POINT: "포인트",
  MIXED: "혼합",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "처리 중",
  APPROVED: "완납",
  PARTIAL_REFUNDED: "부분환불",
  FULLY_REFUNDED: "전액환불",
  CANCELLED: "취소",
};

const STATUS_COLOR: Record<string, string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-800",
  APPROVED: "border-forest/30 bg-forest/10 text-forest",
  PARTIAL_REFUNDED: "border-orange-200 bg-orange-50 text-orange-700",
  FULLY_REFUNDED: "border-red-200 bg-red-50 text-red-700",
  CANCELLED: "border-ink/20 bg-ink/5 text-slate",
};

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function fmtAmt(n: number) {
  return n.toLocaleString("ko-KR") + "원";
}

// ── component ─────────────────────────────────────────────────────────────────

export default function PosRefundManagementPage() {
  const [dateFilter, setDateFilter] = useState(todayString());
  const [payments, setPayments] = useState<PosPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [modalPaymentId, setModalPaymentId] = useState<string | null>(null);
  const [form, setForm] = useState<RefundFormData>({ refundType: "CASH", amount: "", reason: "" });
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const from = dateFilter;
      const to = dateFilter;
      const res = await fetch(
        `/api/payments?category=SINGLE_COURSE&from=${from}&to=${to}&limit=200`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error("데이터 조회 실패");
      const data = await res.json();
      setPayments((data.payments ?? []) as PosPayment[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류 발생");
    } finally {
      setLoading(false);
    }
  }, [dateFilter]);

  useEffect(() => {
    void fetchPayments();
  }, [fetchPayments]);

  // KPI
  const totalCount = payments.length;
  const totalAmount = payments.reduce((s, p) => s + p.netAmount, 0);
  const refundedCount = payments.filter(
    (p) => p.status === "FULLY_REFUNDED" || p.status === "PARTIAL_REFUNDED",
  ).length;
  const totalRefundAmount = payments.reduce(
    (s, p) =>
      s +
      p.refunds
        .filter((r) => r.status === "COMPLETED" || r.status === "APPROVED")
        .reduce((rs, r) => rs + r.amount, 0),
    0,
  );
  const netRevenue = totalAmount - totalRefundAmount;

  const modalPayment = modalPaymentId ? payments.find((p) => p.id === modalPaymentId) : null;

  function openModal(paymentId: string) {
    const p = payments.find((pp) => pp.id === paymentId);
    if (!p) return;
    setModalPaymentId(paymentId);
    setForm({ refundType: p.method === "CARD" ? "CARD_CANCEL" : "CASH", amount: String(p.netAmount), reason: "" });
    setModalError(null);
    setSuccessMsg(null);
  }

  function closeModal() {
    setModalPaymentId(null);
    setModalError(null);
    setSuccessMsg(null);
  }

  async function handleRefundSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!modalPaymentId) return;
    setSubmitting(true);
    setModalError(null);
    try {
      const res = await fetch(`/api/payments/${modalPaymentId}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          refundType: form.refundType,
          amount: Number(form.amount),
          reason: form.reason,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "환불 처리 실패");
      setSuccessMsg("환불 신청이 완료되었습니다.");
      await fetchPayments();
      setTimeout(() => closeModal(), 1500);
    } catch (e) {
      setModalError(e instanceof Error ? e.message : "오류 발생");
    } finally {
      setSubmitting(false);
    }
  }

  function canRefund(p: PosPayment): boolean {
    return p.status === "APPROVED" || p.status === "PARTIAL_REFUNDED";
  }

  return (
    <div className="p-8 sm:p-10">
      {/* Badge */}
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        단과 POS
      </div>

      {/* Header */}
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">환불 / 취소 관리</h1>
          <p className="mt-2 text-sm leading-7 text-slate">
            단과 POS 결제 건에 대한 환불 및 취소를 처리합니다.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/pos"
            className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-5 py-2.5 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
          >
            ← POS 홈
          </Link>
          <Link
            href="/admin/pos/new"
            className="inline-flex items-center gap-2 rounded-full bg-ember px-6 py-3 text-sm font-semibold text-white transition hover:bg-ember/90"
          >
            + 새 결제
          </Link>
        </div>
      </div>

      {/* Date filter */}
      <div className="mt-6 flex items-center gap-3">
        <label htmlFor="date-filter" className="text-sm font-medium text-slate">
          날짜 선택
        </label>
        <input
          id="date-filter"
          type="date"
          value={dateFilter}
          max={todayString()}
          onChange={(e) => setDateFilter(e.target.value)}
          className="rounded-xl border border-ink/20 bg-white px-3 py-2 text-sm focus:border-ember focus:outline-none focus:ring-2 focus:ring-ember/20"
        />
        <button
          type="button"
          onClick={() => setDateFilter(todayString())}
          className="rounded-xl border border-ink/10 bg-white px-4 py-2 text-sm text-slate transition hover:border-ink/30 hover:text-ink"
        >
          오늘
        </button>
      </div>

      {/* KPI */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[24px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-medium text-slate">결제 건수</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-ink">
            {totalCount.toLocaleString()}
          </p>
          <p className="mt-0.5 text-xs text-slate">건</p>
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-medium text-slate">결제 합계</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-ember">
            {totalAmount.toLocaleString()}
          </p>
          <p className="mt-0.5 text-xs text-slate">원</p>
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-medium text-slate">취소 건수</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-red-600">
            {refundedCount.toLocaleString()}
          </p>
          <p className="mt-0.5 text-xs text-slate">건</p>
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-medium text-slate">순 매출</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-forest">
            {netRevenue.toLocaleString()}
          </p>
          <p className="mt-0.5 text-xs text-slate">원</p>
        </div>
      </div>

      {/* Transactions table */}
      <div className="mt-8">
        <h2 className="mb-3 text-base font-semibold text-ink">
          {dateFilter === todayString() ? "오늘" : dateFilter} 결제 내역
        </h2>

        {loading ? (
          <div className="rounded-[24px] border border-ink/10 bg-white px-6 py-12 text-center text-sm text-slate">
            불러오는 중...
          </div>
        ) : error ? (
          <div className="rounded-[24px] border border-red-200 bg-red-50 px-6 py-8 text-center text-sm text-red-700">
            {error}
          </div>
        ) : payments.length === 0 ? (
          <div className="rounded-[24px] border border-ink/10 bg-white px-6 py-12 text-center text-sm text-slate">
            해당 날짜에 단과 결제 내역이 없습니다.
          </div>
        ) : (
          <div className="overflow-hidden rounded-[24px] border border-ink/10 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-mist/60">
                    {["시각", "학생", "상품", "금액", "결제수단", "상태", "액션"].map((h) => (
                      <th
                        key={h}
                        className={`whitespace-nowrap px-5 py-3 text-xs font-semibold text-slate ${h === "금액" ? "text-right" : h === "액션" ? "text-center" : "text-left"}`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {payments.map((p) => {
                    const itemDisplay =
                      p.items.length > 0
                        ? p.items.map((i) => i.itemName).join(", ")
                        : (p.note ?? "단과");
                    const eligible = canRefund(p);
                    return (
                      <tr key={p.id} className="transition-colors hover:bg-mist/30">
                        <td className="whitespace-nowrap px-5 py-3.5 tabular-nums text-slate">
                          {fmtTime(p.processedAt)}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3.5">
                          {p.student ? (
                            <Link
                              href={`/admin/students/${p.student.examNumber}`}
                              className="font-medium text-ink transition-colors hover:text-ember"
                            >
                              {p.student.name}
                              <span className="ml-1.5 text-xs text-slate">
                                {p.student.examNumber}
                              </span>
                            </Link>
                          ) : (
                            <span className="text-slate">비회원</span>
                          )}
                        </td>
                        <td className="max-w-[200px] truncate px-5 py-3.5 text-slate">
                          {itemDisplay}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3.5 text-right font-semibold tabular-nums text-ink">
                          {fmtAmt(p.netAmount)}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3.5">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                              p.method === "CASH"
                                ? "border-forest/30 bg-forest/10 text-forest"
                                : p.method === "CARD"
                                  ? "border-ember/30 bg-ember/10 text-ember"
                                  : "border-sky-200 bg-sky-50 text-sky-800"
                            }`}
                          >
                            {METHOD_LABEL[p.method] ?? p.method}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-5 py-3.5">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLOR[p.status] ?? "border-ink/20 bg-ink/5 text-slate"}`}
                          >
                            {STATUS_LABEL[p.status] ?? p.status}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          {eligible ? (
                            <button
                              type="button"
                              onClick={() => openModal(p.id)}
                              className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-100"
                            >
                              환불/취소
                            </button>
                          ) : (
                            <span className="text-xs text-slate">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="border-t border-ink/10 bg-mist/40 px-5 py-3 text-right text-sm">
              <span className="text-slate">합계 </span>
              <span className="font-bold tabular-nums text-ink">{fmtAmt(totalAmount)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Refund Modal */}
      {modalPaymentId && modalPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[28px] border border-ink/10 bg-white p-8 shadow-2xl">
            <h3 className="text-lg font-bold text-ink">환불 / 취소 처리</h3>
            <p className="mt-1 text-sm text-slate">
              {modalPayment.student?.name ?? "비회원"} ·{" "}
              {fmtAmt(modalPayment.netAmount)}
            </p>

            {successMsg ? (
              <div className="mt-6 rounded-2xl border border-forest/20 bg-forest/5 px-4 py-4 text-sm font-semibold text-forest">
                {successMsg}
              </div>
            ) : (
              <form onSubmit={(e) => void handleRefundSubmit(e)} className="mt-6 space-y-4">
                {/* Refund type */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-ink">환불 유형</label>
                  <select
                    value={form.refundType}
                    onChange={(e) => setForm((f) => ({ ...f, refundType: e.target.value }))}
                    className="w-full rounded-xl border border-ink/20 bg-white px-3 py-2.5 text-sm focus:border-ember focus:outline-none focus:ring-2 focus:ring-ember/20"
                  >
                    <option value="CASH">현금 환불</option>
                    <option value="CARD_CANCEL">카드 취소</option>
                    <option value="TRANSFER">계좌이체 환불</option>
                    <option value="PARTIAL">부분 환불</option>
                  </select>
                </div>

                {/* Amount */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-ink">환불 금액</label>
                  <div className="relative">
                    <input
                      type="number"
                      min={1}
                      max={modalPayment.netAmount}
                      value={form.amount}
                      onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                      required
                      className="w-full rounded-xl border border-ink/20 bg-white px-3 py-2.5 pr-8 text-sm focus:border-ember focus:outline-none focus:ring-2 focus:ring-ember/20"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate">
                      원
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate">
                    최대: {fmtAmt(modalPayment.netAmount)}
                  </p>
                </div>

                {/* Reason */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-ink">환불 사유</label>
                  <select
                    value={form.reason}
                    onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                    required
                    className="w-full rounded-xl border border-ink/20 bg-white px-3 py-2.5 text-sm focus:border-ember focus:outline-none focus:ring-2 focus:ring-ember/20"
                  >
                    <option value="">사유 선택</option>
                    {REASON_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                {modalError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {modalError}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={closeModal}
                    disabled={submitting}
                    className="flex-1 rounded-full border border-ink/10 py-2.5 text-sm font-medium text-slate transition hover:border-ink/30"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 rounded-full bg-red-600 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
                  >
                    {submitting ? "처리 중..." : "환불 신청"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
