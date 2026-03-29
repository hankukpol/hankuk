"use client";

import Link from "next/link";
import { PaymentCategory, PaymentMethod, PaymentStatus } from "@prisma/client";
import {
  PAYMENT_CATEGORY_LABEL,
  PAYMENT_METHOD_LABEL,
} from "@/lib/constants";

type RefundItem = {
  amount: number;
  refundType: string;
  processedAt: string;
};

type PaymentItemRow = {
  id: string;
  itemName: string;
  itemType: PaymentCategory;
  amount: number;
  quantity: number;
};

export type StudentPaymentRow = {
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
  items: PaymentItemRow[];
  refunds: RefundItem[];
};

type Props = {
  examNumber: string;
  payments: StudentPaymentRow[];
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

export function StudentPaymentsPanel({ examNumber, payments }: Props) {
  const totalPaid = payments
    .filter((p) => p.status === "APPROVED" || p.status === "PARTIAL_REFUNDED")
    .reduce((sum, p) => sum + p.netAmount, 0);

  const totalRefunded = payments
    .flatMap((p) => p.refunds)
    .reduce((sum, r) => sum + r.amount, 0);

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-[24px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">총 납부액</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{totalPaid.toLocaleString()}원</p>
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">총 환불액</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-ember">
            {totalRefunded.toLocaleString()}원
          </p>
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">수납 건수</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{payments.length}건</p>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate">전체 수납 이력 {payments.length}건</p>
        <Link
          href={`/admin/payments/new?examNumber=${examNumber}`}
          className="inline-flex items-center rounded-full bg-ember px-4 py-2 text-sm font-medium text-white transition hover:bg-ember/90"
        >
          + 수납 등록
        </Link>
      </div>

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
                <th className="px-4 py-3 font-semibold">결제 수단</th>
                <th className="px-4 py-3 font-semibold">금액</th>
                <th className="px-4 py-3 font-semibold">상태</th>
                <th className="px-4 py-3 font-semibold">처리 직원</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10 bg-white">
              {payments.map((p) => {
                const refundTotal = p.refunds.reduce((s, r) => s + r.amount, 0);
                return (
                  <tr key={p.id} className={p.status === "CANCELLED" ? "opacity-50" : ""}>
                    <td className="px-4 py-3 text-xs text-slate whitespace-nowrap">
                      {formatDatetime(p.processedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full border border-ink/10 bg-mist px-2 py-0.5 text-xs font-semibold text-slate">
                        {PAYMENT_CATEGORY_LABEL[p.category]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-0.5">
                        {p.items.map((item) => (
                          <div key={item.id} className="text-xs text-slate">
                            {item.itemName}
                            {item.quantity > 1 ? ` ×${item.quantity}` : ""}
                          </div>
                        ))}
                        {p.items.length === 0 && p.note && (
                          <div className="text-xs text-slate">{p.note}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate">
                      {PAYMENT_METHOD_LABEL[p.method]}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      <div className="font-medium">{p.netAmount.toLocaleString()}원</div>
                      {p.discountAmount > 0 && (
                        <div className="mt-0.5 text-xs text-forest">
                          -{p.discountAmount.toLocaleString()}원
                        </div>
                      )}
                      {refundTotal > 0 && (
                        <div className="mt-0.5 text-xs text-ember">
                          -{refundTotal.toLocaleString()}원 환불
                        </div>
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
