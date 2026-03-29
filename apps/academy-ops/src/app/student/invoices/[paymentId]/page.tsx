import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { PaymentMethod, PaymentCategory } from "@prisma/client";
import { getAcademyRuntimeBranding } from "@/lib/academy-branding";
import { hasDatabaseConfig } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { getStudentPortalViewer } from "@/lib/student-portal/service";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "영수증",
};

// ─── Labels ───────────────────────────────────────────────────────────────────

const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "현금",
  CARD: "카드",
  TRANSFER: "계좌이체",
  POINT: "포인트",
  MIXED: "혼합",
};

const PAYMENT_CATEGORY_LABEL: Record<PaymentCategory, string> = {
  TUITION: "수강료",
  FACILITY: "시설비",
  TEXTBOOK: "교재",
  MATERIAL: "교구·소모품",
  SINGLE_COURSE: "단과",
  PENALTY: "위약금",
  ETC: "기타",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatAmount(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

function formatDateTimeFull(date: Date): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  return `${y}년 ${mo}월 ${d}일 ${h}:${mi}`;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

async function fetchPayment(paymentId: string, examNumber: string) {
  const payment = await getPrisma().payment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      examNumber: true,
      category: true,
      method: true,
      status: true,
      grossAmount: true,
      discountAmount: true,
      couponAmount: true,
      pointAmount: true,
      netAmount: true,
      note: true,
      cashReceiptNo: true,
      processedAt: true,
      items: {
        select: {
          id: true,
          itemName: true,
          unitPrice: true,
          quantity: true,
          amount: true,
        },
        orderBy: { itemName: "asc" },
      },
      student: {
        select: {
          name: true,
          examNumber: true,
          phone: true,
        },
      },
    },
  });

  if (!payment) return null;
  // Security: only allow the owner to view their receipt
  if (payment.examNumber !== examNumber) return null;

  return payment;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type PageProps = {
  params: Promise<{ paymentId: string }>;
};

export default async function StudentInvoiceDetailPage({ params }: PageProps) {
  const { paymentId } = await params;

  if (!hasDatabaseConfig()) {
    redirect("/student/invoices");
  }

  const viewer = await getStudentPortalViewer();
  if (!viewer) {
    redirect("/student/invoices");
  }

  const payment = await fetchPayment(paymentId, viewer.examNumber);
  if (!payment) {
    notFound();
  }

  const hasDiscount =
    payment.discountAmount > 0 || payment.couponAmount > 0 || payment.pointAmount > 0;
  const branding = await getAcademyRuntimeBranding(viewer.academyId ?? undefined);
  const academyContactLine = branding.contactLine ?? branding.academyName;

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          .print\\:hidden { display: none !important; }
          body { background: white !important; }
          @page { size: A4; margin: 20mm; }
        }
      `}</style>

      <main className="space-y-4 px-0 py-6">
        {/* Action bar (hidden on print) */}
        <div className="flex items-center justify-between gap-3 print:hidden">
          <Link
            href="/student/invoices"
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            목록으로
          </Link>
          <PrintButton />
        </div>

        {/* Receipt card — visible on screen and in print */}
        <section className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel print:rounded-none print:border-0 print:shadow-none sm:p-8">
          {/* Academy header */}
          <div className="border-b border-ink/10 pb-5 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ember">
              {branding.academyName}
            </p>
            <h1 className="mt-2 text-2xl font-bold">영수증</h1>
            <p className="mt-1 text-xs text-slate">Receipt</p>
          </div>

          {/* Academy + Receipt info */}
          <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <p className="text-xs text-slate">사업장명</p>
              <p className="font-semibold">{branding.academyName}</p>
            </div>
            <div>
              <p className="text-xs text-slate">영수증 번호</p>
              <p className="font-mono text-xs font-semibold text-slate">{payment.id.slice(-12).toUpperCase()}</p>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-slate">주소</p>
              <p className="font-semibold">{branding.address ?? "학원 주소 미등록"}</p>
            </div>
            <div>
              <p className="text-xs text-slate">전화</p>
              <p className="font-semibold">{branding.phone ?? "학원 연락처 미등록"}</p>
            </div>
            <div>
              <p className="text-xs text-slate">납부일시</p>
              <p className="font-semibold">{formatDateTimeFull(payment.processedAt)}</p>
            </div>
          </div>

          {/* Divider */}
          <div className="my-5 border-t border-dashed border-ink/20" />

          {/* Student info */}
          <div className="space-y-1.5 text-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate">수강생 정보</p>
            <div className="flex justify-between">
              <span className="text-slate">성명</span>
              <span className="font-semibold">{payment.student?.name ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate">학번</span>
              <span className="font-mono font-semibold">{payment.student?.examNumber ?? "—"}</span>
            </div>
          </div>

          {/* Divider */}
          <div className="my-5 border-t border-dashed border-ink/20" />

          {/* Items */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate">납부 내역</p>
            {payment.items.length > 0 ? (
              <table className="mt-2 w-full text-sm">
                <thead>
                  <tr className="border-b border-ink/10 text-xs text-slate">
                    <th className="pb-1.5 text-left font-semibold">항목</th>
                    <th className="pb-1.5 text-right font-semibold">수량</th>
                    <th className="pb-1.5 text-right font-semibold">금액</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {payment.items.map((item) => (
                    <tr key={item.id}>
                      <td className="py-2 pr-2">{item.itemName}</td>
                      <td className="py-2 text-right text-slate">{item.quantity}</td>
                      <td className="py-2 text-right font-semibold">{formatAmount(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="flex justify-between py-1.5 text-sm">
                <span>{PAYMENT_CATEGORY_LABEL[payment.category]}</span>
                <span className="font-semibold">{formatAmount(payment.grossAmount)}</span>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="my-5 border-t border-dashed border-ink/20" />

          {/* Totals */}
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-slate">소계</span>
              <span>{formatAmount(payment.grossAmount)}</span>
            </div>
            {hasDiscount && (
              <>
                {payment.discountAmount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate">할인</span>
                    <span className="text-red-600">-{formatAmount(payment.discountAmount)}</span>
                  </div>
                )}
                {payment.couponAmount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate">쿠폰</span>
                    <span className="text-red-600">-{formatAmount(payment.couponAmount)}</span>
                  </div>
                )}
                {payment.pointAmount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate">포인트</span>
                    <span className="text-red-600">-{formatAmount(payment.pointAmount)}</span>
                  </div>
                )}
              </>
            )}
            <div className="flex justify-between border-t border-ink/10 pt-2 text-base font-bold">
              <span>합계</span>
              <span className="text-ember">{formatAmount(payment.netAmount)}</span>
            </div>
          </div>

          {/* Divider */}
          <div className="my-5 border-t border-dashed border-ink/20" />

          {/* Payment method */}
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-slate">결제 수단</span>
              <span className="font-semibold">{PAYMENT_METHOD_LABEL[payment.method]}</span>
            </div>
            {payment.cashReceiptNo && (
              <div className="flex justify-between">
                <span className="text-slate">현금영수증 승인번호</span>
                <span className="font-mono text-xs font-semibold">{payment.cashReceiptNo}</span>
              </div>
            )}
            {payment.note && (
              <div className="flex justify-between">
                <span className="text-slate">비고</span>
                <span className="max-w-[60%] text-right">{payment.note}</span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="mt-8 border-t border-ink/10 pt-5 text-center">
            <p className="text-xs text-slate">위 금액을 정히 영수합니다.</p>
            <p className="mt-2 text-sm font-semibold">{branding.academyName}</p>
            <p className="mt-0.5 text-xs text-slate">
              {academyContactLine}
            </p>
          </div>
        </section>

        {/* Bottom action (hidden on print) */}
        <div className="flex justify-center print:hidden">
          <PrintButton />
        </div>
      </main>
    </>
  );
}
