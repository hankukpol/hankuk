import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PaymentMethod, PaymentStatus, RefundStatus } from "@prisma/client";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { getAcademyRuntimeBranding } from "@/lib/academy-branding";
import { hasDatabaseConfig } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { getStudentPortalViewer } from "@/lib/student-portal/service";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "수납 영수증",
};

// ─── Label maps ────────────────────────────────────────────────────────────────

const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "현금",
  CARD: "카드",
  TRANSFER: "계좌이체",
  POINT: "포인트",
  MIXED: "혼합",
};

const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  PENDING: "처리 중",
  APPROVED: "납부 완료",
  PARTIAL_REFUNDED: "부분 환불",
  FULLY_REFUNDED: "전액 환불",
  CANCELLED: "취소",
};

const PAYMENT_STATUS_COLOR: Record<PaymentStatus, string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-700",
  APPROVED: "border-forest/20 bg-forest/10 text-forest",
  PARTIAL_REFUNDED: "border-orange-200 bg-orange-50 text-orange-700",
  FULLY_REFUNDED: "border-red-200 bg-red-50 text-red-700",
  CANCELLED: "border-ink/10 bg-mist text-slate",
};

const REFUND_STATUS_LABEL: Record<RefundStatus, string> = {
  PENDING: "검토 중",
  APPROVED: "승인",
  REJECTED: "거절",
  COMPLETED: "환불 완료",
  CANCELLED: "취소",
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatReceiptDate(date: Date): string {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function formatReceiptDateTime(date: Date): string {
  const h = date.getHours().toString().padStart(2, "0");
  const m = date.getMinutes().toString().padStart(2, "0");
  return `${formatReceiptDate(date)} ${h}:${m}`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function StudentPaymentReceiptPage({
  params,
}: {
  params: Promise<{ paymentId: string }>;
}) {
  // No DB — show fallback
  if (!hasDatabaseConfig()) {
    return (
      <main className="space-y-6 px-0 py-6">
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
            영수증 조회 불가
          </div>
          <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
            DB 연결 후 사용할 수 있습니다.
          </h1>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/student/payments"
              className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
            >
              ← 수납 내역으로
            </Link>
          </div>
        </section>
      </main>
    );
  }

  // Auth check
  const viewer = await getStudentPortalViewer();

  if (!viewer) {
    return (
      <main className="space-y-6 px-0 py-6">
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            수납 영수증
          </div>
          <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
            로그인 후 확인할 수 있습니다.
          </h1>
          <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
            학생 포털에 로그인하면 수납 영수증을 확인할 수 있습니다.
          </p>
        </section>
        <StudentLookupForm redirectPath="/student/payments" />
      </main>
    );
  }

  const { paymentId } = await params;

  // Fetch payment — must belong to this student
  const payment = await getPrisma().payment.findUnique({
    where: { id: paymentId },
    include: {
      student: { select: { examNumber: true, name: true, phone: true } },
      processor: { select: { name: true } },
      items: {
        select: {
          id: true,
          itemType: true,
          itemName: true,
          unitPrice: true,
          quantity: true,
          amount: true,
        },
        orderBy: { id: "asc" },
      },
      refunds: {
        orderBy: { processedAt: "asc" },
        select: {
          id: true,
          amount: true,
          reason: true,
          status: true,
          processedAt: true,
        },
      },
      installments: {
        orderBy: { seq: "asc" },
        select: {
          id: true,
          seq: true,
          amount: true,
          dueDate: true,
          paidAt: true,
        },
      },
    },
  });

  // Not found or belongs to different student
  if (!payment) notFound();
  if (payment.examNumber !== viewer.examNumber) notFound();

  // Enrollment label
  let enrollmentLabel: string | null = null;
  if (payment.enrollmentId) {
    const enrollment = await getPrisma().courseEnrollment.findUnique({
      where: { id: payment.enrollmentId },
      include: {
        cohort: { select: { name: true } },
        specialLecture: { select: { name: true } },
        product: { select: { name: true } },
      },
    });
    if (enrollment) {
      enrollmentLabel =
        enrollment.cohort?.name ??
        enrollment.specialLecture?.name ??
        enrollment.product?.name ??
        null;
    }
  }

  const receiptNo = paymentId.slice(-8).toUpperCase();
  const paidAt = new Date(payment.processedAt);

  const hasDiscount =
    payment.discountAmount > 0 ||
    payment.couponAmount > 0 ||
    payment.pointAmount > 0;

  const completedRefunds = payment.refunds.filter(
    (r) => r.status === RefundStatus.COMPLETED || r.status === RefundStatus.APPROVED,
  );
  const totalRefunded = completedRefunds.reduce((sum, r) => sum + r.amount, 0);
  const branding = await getAcademyRuntimeBranding(
    payment.academyId ?? viewer.academyId ?? undefined,
  );
  const academyContactLine =
    branding.contactLine ?? "학원 연락처는 관리자에게 문의해 주세요.";

  return (
    <div className="min-h-screen bg-mist">
      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; margin: 0; padding: 0; }
          @page {
            size: A4 portrait;
            margin: 15mm;
          }
          .receipt-wrapper {
            padding: 0 !important;
            background: white !important;
            display: flex !important;
            justify-content: center !important;
          }
          .receipt-paper {
            width: 100% !important;
            max-width: none !important;
            box-shadow: none !important;
            border: 1px solid #ccc !important;
            border-radius: 0 !important;
            margin: 0 !important;
          }
        }
      `}</style>

      {/* Top bar — hidden when printing */}
      <div className="no-print flex items-center justify-between gap-4 border-b border-ink/10 bg-white px-6 py-4">
        <Link
          href="/student/payments"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-4 py-2 text-sm text-slate transition hover:border-ink/30 hover:text-ink"
        >
          ← 수납 내역
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate">영수증 #{receiptNo}</span>
          <PrintButton />
        </div>
      </div>

      {/* Receipt preview area */}
      <div className="receipt-wrapper flex justify-center p-6 sm:p-8">
        <div
          className="receipt-paper w-full max-w-[620px] overflow-hidden rounded-[16px] border border-ink/15 bg-white shadow-xl"
          style={{
            fontFamily:
              "'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif",
          }}
        >
          {/* ── Header ── */}
          <div className="px-10 pb-6 pt-8" style={{ backgroundColor: "#1F4D3A" }}>
            <div className="flex items-start justify-between">
              <div>
                <p
                  className="text-[11px] font-semibold uppercase tracking-[0.22em]"
                  style={{ color: "rgba(255,255,255,0.6)" }}
                >
                  {branding.englishBrandName}
                </p>
                <p className="mt-1.5 text-3xl font-bold tracking-wide text-white">
                  수납 영수증
                </p>
                <p
                  className="mt-1 text-xs"
                  style={{ color: "rgba(255,255,255,0.5)" }}
                >
                  PAYMENT RECEIPT
                </p>
              </div>
              <div className="text-right">
                <p
                  className="text-[11px]"
                  style={{ color: "rgba(255,255,255,0.6)" }}
                >
                  영수증 번호
                </p>
                <p className="mt-1 text-lg font-bold tracking-widest text-white">
                  #{receiptNo}
                </p>
              </div>
            </div>
          </div>

          {/* ── Academy info band ── */}
          <div
            className="flex flex-wrap items-center justify-between gap-2 px-10 py-2.5 text-[11px]"
            style={{ backgroundColor: branding.themeColor, color: "white" }}
          >
            <span className="font-semibold">{branding.academyName}</span>
            <span>{academyContactLine}</span>
          </div>

          {/* ── Issue date & status ── */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-10 pt-5 text-sm">
            <div>
              <span className="text-slate">수납일시&nbsp;</span>
              <span className="font-semibold text-ink">
                {formatReceiptDateTime(paidAt)}
              </span>
            </div>
            <span
              className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${PAYMENT_STATUS_COLOR[payment.status]}`}
            >
              {PAYMENT_STATUS_LABEL[payment.status]}
            </span>
          </div>

          {/* ── Divider ── */}
          <div className="mx-10 my-4 border-t border-dashed border-ink/15" />

          {/* ── Student info ── */}
          <div className="px-10">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate">
              수납자 정보
            </p>
            <div className="space-y-0 divide-y divide-ink/6 text-sm">
              <div className="flex justify-between py-2.5">
                <span className="text-slate">학생명</span>
                <span className="font-medium text-ink">{viewer.name}</span>
              </div>
              <div className="flex justify-between py-2.5">
                <span className="text-slate">학번</span>
                <span className="font-medium tabular-nums text-ink">
                  {viewer.examNumber}
                </span>
              </div>
              {payment.student?.phone ? (
                <div className="flex justify-between py-2.5">
                  <span className="text-slate">연락처</span>
                  <span className="font-medium tabular-nums text-ink">
                    {payment.student.phone}
                  </span>
                </div>
              ) : null}
              {enrollmentLabel ? (
                <div className="flex justify-between py-2.5">
                  <span className="text-slate">수강 강좌</span>
                  <span className="max-w-[280px] text-right font-medium leading-snug text-ink">
                    {enrollmentLabel}
                  </span>
                </div>
              ) : null}
              <div className="flex justify-between py-2.5">
                <span className="text-slate">결제 수단</span>
                <span className="font-medium text-ink">
                  {PAYMENT_METHOD_LABEL[payment.method]}
                </span>
              </div>
            </div>
          </div>

          {/* ── Divider ── */}
          <div className="mx-10 my-4 border-t border-dashed border-ink/15" />

          {/* ── Payment items table ── */}
          <div className="px-10">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate">
              결제 내역
            </p>
            {payment.items.length === 0 ? (
              <p className="text-xs text-slate">항목 없음</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-ink/10 text-[11px] text-slate">
                    <th className="py-2 text-left font-medium">항목</th>
                    <th className="py-2 text-center font-medium">단가</th>
                    <th className="py-2 text-center font-medium">수량</th>
                    <th className="py-2 text-right font-medium">금액</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/6">
                  {payment.items.map((item) => (
                    <tr key={item.id}>
                      <td className="py-2.5 text-ink">{item.itemName}</td>
                      <td className="py-2.5 text-center tabular-nums text-slate">
                        {item.unitPrice.toLocaleString("ko-KR")}원
                      </td>
                      <td className="py-2.5 text-center tabular-nums text-slate">
                        {item.quantity}
                      </td>
                      <td className="py-2.5 text-right font-medium tabular-nums text-ink">
                        {item.amount.toLocaleString("ko-KR")}원
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* ── Totals ── */}
          <div className="mx-10 mt-3 space-y-0 divide-y divide-ink/6 border-t border-ink/15 text-sm">
            {hasDiscount ? (
              <>
                <div className="flex justify-between py-2">
                  <span className="text-slate">소계</span>
                  <span className="tabular-nums text-ink">
                    {payment.grossAmount.toLocaleString("ko-KR")}원
                  </span>
                </div>
                {payment.discountAmount > 0 ? (
                  <div className="flex justify-between py-2">
                    <span className="text-slate">할인금액</span>
                    <span className="tabular-nums text-red-600">
                      -{payment.discountAmount.toLocaleString("ko-KR")}원
                    </span>
                  </div>
                ) : null}
                {payment.couponAmount > 0 ? (
                  <div className="flex justify-between py-2">
                    <span className="text-slate">쿠폰 할인</span>
                    <span className="tabular-nums text-red-600">
                      -{payment.couponAmount.toLocaleString("ko-KR")}원
                    </span>
                  </div>
                ) : null}
                {payment.pointAmount > 0 ? (
                  <div className="flex justify-between py-2">
                    <span className="text-slate">포인트 사용</span>
                    <span className="tabular-nums text-red-600">
                      -{payment.pointAmount.toLocaleString("ko-KR")}원
                    </span>
                  </div>
                ) : null}
              </>
            ) : null}
            <div className="flex justify-between py-3">
              <span className="font-bold text-ink">합계 (실수납액)</span>
              <span className="text-xl font-bold tabular-nums text-forest">
                {payment.netAmount.toLocaleString("ko-KR")}원
              </span>
            </div>
          </div>

          {/* ── Installments ── */}
          {payment.installments.length > 0 ? (
            <>
              <div className="mx-10 my-4 border-t border-dashed border-ink/15" />
              <div className="px-10">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate">
                  분납 일정
                </p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-y border-ink/10 text-[11px] text-slate">
                      <th className="py-1.5 text-left font-medium">회차</th>
                      <th className="py-1.5 text-left font-medium">납부 예정일</th>
                      <th className="py-1.5 text-right font-medium">금액</th>
                      <th className="py-1.5 text-right font-medium">상태</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/6">
                    {payment.installments.map((inst) => (
                      <tr key={inst.id}>
                        <td className="py-2 text-ink">{inst.seq}회차</td>
                        <td className="py-2 text-slate">
                          {inst.dueDate
                            ? `${new Date(inst.dueDate).getFullYear()}년 ${new Date(inst.dueDate).getMonth() + 1}월 ${new Date(inst.dueDate).getDate()}일`
                            : "-"}
                        </td>
                        <td className="py-2 text-right tabular-nums font-medium text-ink">
                          {inst.amount.toLocaleString("ko-KR")}원
                        </td>
                        <td className="py-2 text-right">
                          {inst.paidAt ? (
                            <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-2 py-0.5 text-[10px] font-semibold text-forest">
                              납부 완료
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                              미납
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}

          {/* ── Refunds ── */}
          {payment.refunds.length > 0 ? (
            <>
              <div className="mx-10 my-4 border-t border-dashed border-red-200" />
              <div className="px-10">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-red-600">
                  환불 내역
                </p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-y border-red-100 text-[11px] text-red-500">
                      <th className="py-1.5 text-left font-medium">환불 상태</th>
                      <th className="py-1.5 text-left font-medium">사유</th>
                      <th className="py-1.5 text-right font-medium">금액</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-red-50">
                    {payment.refunds.map((r) => (
                      <tr key={r.id}>
                        <td className="py-2 text-slate">
                          {REFUND_STATUS_LABEL[r.status]}
                          {r.processedAt ? (
                            <span className="ml-1 text-[10px]">
                              ({formatReceiptDate(new Date(r.processedAt))})
                            </span>
                          ) : null}
                        </td>
                        <td className="py-2 text-slate">{r.reason ?? "-"}</td>
                        <td className="py-2 text-right tabular-nums font-semibold text-red-600">
                          -{r.amount.toLocaleString("ko-KR")}원
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {completedRefunds.length > 0 ? (
                  <div className="flex justify-between border-t border-red-100 pt-2 text-sm">
                    <span className="font-bold text-red-700">환불 합계</span>
                    <span className="tabular-nums font-bold text-red-700">
                      -{totalRefunded.toLocaleString("ko-KR")}원
                    </span>
                  </div>
                ) : null}
              </div>
            </>
          ) : null}

          {/* ── Footer ── */}
          <div className="mx-10 mb-8 mt-6">
            <div className="border-t-2 border-ink/20" />
            <p className="mt-5 text-center text-lg font-bold text-ink">
              위 금액을 정히 영수함
            </p>
            <div className="mt-5 flex items-end justify-between">
              <div className="text-sm text-slate">
                <p>{formatReceiptDate(paidAt)}</p>
                <p className="mt-1 font-semibold text-ink">{branding.academyName}</p>
                {branding.address ? (
                  <p className="text-xs text-slate">{branding.address}</p>
                ) : null}
                {branding.phone ? (
                  <p className="text-xs text-slate">{branding.phone}</p>
                ) : null}
              </div>
              <div className="flex flex-col items-center gap-1">
                <div
                  className="flex h-20 w-20 flex-col items-center justify-center rounded-full border-[2.5px] text-center"
                  style={{ borderColor: branding.themeColor, color: branding.themeColor }}
                >
                  <span className="text-[11px] font-bold leading-tight">학원</span>
                  <span className="text-[11px] font-bold leading-tight">직인</span>
                  <span className="mt-0.5 text-[10px]">(인)</span>
                </div>
                <span className="text-xs text-slate">원장</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Helper text — screen only */}
      <p className="no-print mt-2 pb-8 text-center text-xs text-slate/60">
        인쇄 대화상자에서 용지 크기를 A4로 선택하고 여백을 15mm로 설정하세요.
      </p>
    </div>
  );
}
