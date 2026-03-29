"use client";

import Link from "next/link";
import { PaymentCategory, PaymentMethod, PaymentStatus } from "@prisma/client";
import { PAYMENT_CATEGORY_LABEL, PAYMENT_METHOD_LABEL } from "@/lib/constants";

export type PaymentHistoryRefund = {
  amount: number;
  refundType: string;
  processedAt: string;
};

export type PaymentHistoryItem = {
  id: string;
  itemName: string;
  itemType: PaymentCategory;
  amount: number;
  quantity: number;
};

export type PaymentHistoryRow = {
  id: string;
  category: PaymentCategory;
  method: PaymentMethod;
  status: PaymentStatus;
  grossAmount: number;
  discountAmount: number;
  couponAmount: number;
  pointAmount: number;
  netAmount: number;
  note: string | null;
  processedAt: string;
  processor: { name: string };
  items: PaymentHistoryItem[];
  refunds: PaymentHistoryRefund[];
};

type Props = {
  examNumber: string;
  payments: PaymentHistoryRow[];
};

const STATUS_LABEL: Record<PaymentStatus, string> = {
  PENDING: "처리중",
  APPROVED: "승인",
  PARTIAL_REFUNDED: "일부환불",
  FULLY_REFUNDED: "전액환불",
  CANCELLED: "취소",
};

const STATUS_COLOR: Record<PaymentStatus, string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-700",
  APPROVED: "border-forest/20 bg-forest/10 text-forest",
  PARTIAL_REFUNDED: "border-blue-200 bg-blue-50 text-blue-700",
  FULLY_REFUNDED: "border-ink/20 bg-mist text-slate",
  CANCELLED: "border-red-200 bg-red-50 text-red-700",
};

function formatDatetime(iso: string) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${y}.${mo}.${day} ${h}:${mi}`;
}

export function StudentPaymentHistory({ examNumber, payments }: Props) {
  const approvedPayments = payments.filter(
    (p) =>
      p.status === "APPROVED" ||
      p.status === "PARTIAL_REFUNDED" ||
      p.status === "FULLY_REFUNDED",
  );

  const totalGross = approvedPayments.reduce((sum, p) => sum + p.grossAmount, 0);
  const totalDiscount = approvedPayments.reduce(
    (sum, p) => sum + p.discountAmount + p.couponAmount + p.pointAmount,
    0,
  );
  const totalNet = approvedPayments.reduce((sum, p) => sum + p.netAmount, 0);
  const totalRefunded = payments
    .flatMap((p) => p.refunds)
    .reduce((sum, r) => sum + r.amount, 0);
  const netReceived = totalNet - totalRefunded;

  return (
    <div className="space-y-6">
      {/* 요약 카드 */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[24px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">총 수납액</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{totalNet.toLocaleString()}원</p>
          {totalDiscount > 0 && (
            <p className="mt-1 text-xs text-forest">
              할인 -{totalDiscount.toLocaleString()}원
            </p>
          )}
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">총 환불액</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-ember">
            {totalRefunded > 0 ? `-${totalRefunded.toLocaleString()}원` : "0원"}
          </p>
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">순 수납액</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-forest">
            {netReceived.toLocaleString()}원
          </p>
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">수납 건수</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{payments.length}건</p>
          {totalGross > totalNet && (
            <p className="mt-1 text-xs text-slate">
              정가 {totalGross.toLocaleString()}원
            </p>
          )}
        </div>
      </div>

      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate">
          전체 수납 이력 <span className="font-semibold text-ink">{payments.length}건</span>
        </p>
        <Link
          href={`/admin/payments/new?examNumber=${examNumber}`}
          className="inline-flex items-center rounded-full bg-ember px-4 py-2 text-sm font-medium text-white transition hover:bg-ember/90"
        >
          + 수납 등록
        </Link>
      </div>

      {/* 목록 테이블 */}
      {payments.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-ink/10 p-10 text-center text-sm text-slate">
          수납 이력이 없습니다.
        </div>
      ) : (
        <div className="overflow-hidden rounded-[28px] border border-ink/10">
          <table className="min-w-full divide-y divide-ink/10 text-sm">
            <thead className="bg-mist/80 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">처리일시</th>
                <th className="px-4 py-3 font-semibold">유형</th>
                <th className="px-4 py-3 font-semibold">수납 내역</th>
                <th className="px-4 py-3 font-semibold">결제수단</th>
                <th className="px-4 py-3 font-semibold text-right">수납액</th>
                <th className="px-4 py-3 font-semibold text-right">환불액</th>
                <th className="px-4 py-3 font-semibold">상태</th>
                <th className="px-4 py-3 font-semibold">처리직원</th>
                <th className="px-4 py-3 font-semibold">상세</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10 bg-white">
              {payments.map((p) => {
                const refundTotal = p.refunds.reduce((s, r) => s + r.amount, 0);
                return (
                  <tr
                    key={p.id}
                    className={`transition hover:bg-mist/40 ${
                      p.status === "CANCELLED" ? "opacity-50" : ""
                    }`}
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate">
                      {formatDatetime(p.processedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full border border-ink/10 bg-mist px-2 py-0.5 text-xs font-semibold text-slate">
                        {PAYMENT_CATEGORY_LABEL[p.category]}
                      </span>
                    </td>
                    <td className="max-w-[200px] px-4 py-3">
                      <div className="space-y-0.5">
                        {p.items.map((item) => (
                          <div key={item.id} className="truncate text-xs text-slate">
                            {item.itemName}
                            {item.quantity > 1 ? ` ×${item.quantity}` : ""}
                          </div>
                        ))}
                        {p.items.length === 0 && p.note && (
                          <div className="truncate text-xs text-slate">{p.note}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate">
                      {PAYMENT_METHOD_LABEL[p.method]}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <div className="font-medium">{p.netAmount.toLocaleString()}원</div>
                      {p.discountAmount > 0 && (
                        <div className="mt-0.5 text-xs text-forest">
                          -{p.discountAmount.toLocaleString()}원
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {refundTotal > 0 ? (
                        <span className="font-medium text-ember">
                          -{refundTotal.toLocaleString()}원
                        </span>
                      ) : (
                        <span className="text-slate">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_COLOR[p.status]}`}
                      >
                        {STATUS_LABEL[p.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate">{p.processor.name}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/payments/${p.id}`}
                        className="text-xs font-medium text-ember hover:underline"
                      >
                        상세보기
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
