import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/format";
import type { PaymentDetailData } from "../payment-detail";
import { buildScopedPaymentWhere, getVisiblePaymentAcademyId } from "../payment-scope";
import { PaymentRefundClient } from "./payment-refund-client";

export const dynamic = "force-dynamic";

export default async function PaymentRefundPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const { id } = await params;
  const academyId = await getVisiblePaymentAcademyId();
  const prisma = getPrisma();

  const payment =
    academyId === null
      ? await prisma.payment.findUnique({
          where: { id },
          select: {
            id: true,
            examNumber: true,
            enrollmentId: true,
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
            cashReceiptType: true,
            cashReceiptIssuedAt: true,
            processedAt: true,
            student: { select: { name: true, phone: true } },
            processor: { select: { name: true } },
            items: { orderBy: { id: "asc" } },
            refunds: {
              select: {
                id: true,
                refundType: true,
                status: true,
                amount: true,
                reason: true,
                rejectionReason: true,
                bankName: true,
                accountNo: true,
                accountHolder: true,
                processedAt: true,
              },
              orderBy: { processedAt: "desc" },
            },
            installments: {
              select: { id: true, seq: true, amount: true, dueDate: true, paidAt: true },
              orderBy: { seq: "asc" },
            },
          },
        })
      : await prisma.payment.findFirst({
          where: buildScopedPaymentWhere(id, academyId),
          select: {
            id: true,
            examNumber: true,
            enrollmentId: true,
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
            cashReceiptType: true,
            cashReceiptIssuedAt: true,
            processedAt: true,
            student: { select: { name: true, phone: true } },
            processor: { select: { name: true } },
            items: { orderBy: { id: "asc" } },
            refunds: {
              select: {
                id: true,
                refundType: true,
                status: true,
                amount: true,
                reason: true,
                rejectionReason: true,
                bankName: true,
                accountNo: true,
                accountHolder: true,
                processedAt: true,
              },
              orderBy: { processedAt: "desc" },
            },
            installments: {
              select: { id: true, seq: true, amount: true, dueDate: true, paidAt: true },
              orderBy: { seq: "asc" },
            },
          },
        });

  if (!payment) notFound();

  const data: PaymentDetailData = {
    ...payment,
    processedAt: payment.processedAt.toISOString(),
    cashReceiptIssuedAt: payment.cashReceiptIssuedAt?.toISOString() ?? null,
    items: payment.items.map((item) => ({
      ...item,
    })),
    refunds: payment.refunds.map((refund) => ({
      ...refund,
      processedAt: refund.processedAt.toISOString(),
    })),
    installments: payment.installments.map((installment) => ({
      ...installment,
      dueDate: installment.dueDate.toISOString(),
      paidAt: installment.paidAt?.toISOString() ?? null,
    })),
  };

  const totalRefunded = data.refunds.reduce((sum, refund) => sum + refund.amount, 0);
  const remaining = data.netAmount - totalRefunded;
  const canRefund = data.status === "APPROVED" || data.status === "PARTIAL_REFUNDED";

  return (
    <div className="p-8 sm:p-10">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/admin/payments" className="text-slate transition hover:text-ink">
          수납 관리
        </Link>
        <span className="text-slate/40">/</span>
        <Link href={`/admin/payments/${data.id}`} className="text-slate transition hover:text-ink">
          결제 상세
        </Link>
        <span className="text-slate/40">/</span>
        <span className="text-ink">환불 전용 페이지</span>
      </div>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
            수납 관리
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-ink">환불 전용 페이지</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate">
            수납 상세에서 바로 들어와 환불 금액을 검토하고, 승인 대기 상태로 등록하는 화면입니다.
            필요 시 아래 계산 도우미로 별도 환불 기준도 함께 확인할 수 있습니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
              canRefund
                ? "border-forest/20 bg-forest/10 text-forest"
                : "border-amber-200 bg-amber-50 text-amber-800"
            }`}
          >
            {canRefund ? "환불 등록 가능" : "환불 제한 상태"}
          </span>
          <span className="inline-flex rounded-full border border-ink/10 bg-white px-3 py-1 text-xs font-semibold text-slate">
            남은 환불 가능액 {remaining.toLocaleString()}원
          </span>
        </div>
      </div>

      <div className="mt-5 rounded-[16px] border border-ink/10 bg-white px-5 py-4 text-sm text-slate shadow-panel">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <SummaryItem label="학번" value={data.examNumber ?? "-"} />
          <SummaryItem label="이름" value={data.student?.name ?? "-"} />
          <SummaryItem label="연락처" value={data.student?.phone ?? "-"} />
          <SummaryItem label="처리 시각" value={formatDateTime(data.processedAt)} />
        </div>
      </div>

      <div className="mt-8">
        <PaymentRefundClient payment={data} />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link
          href={`/admin/payments/${data.id}`}
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-5 py-2.5 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
        >
          결제 상세로
        </Link>
        <Link
          href="/admin/payments/refunds"
          className="inline-flex items-center gap-2 rounded-full border border-ember/20 bg-ember/5 px-5 py-2.5 text-sm font-semibold text-ember transition hover:bg-ember/10"
        >
          환불 대기 목록
        </Link>
        <Link
          href="/admin/payments/refund-calculator"
          className="inline-flex items-center gap-2 rounded-full border border-forest/20 px-5 py-2.5 text-sm font-semibold text-forest transition hover:border-forest/50"
        >
          환불 계산기
        </Link>
      </div>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-mist/50 px-4 py-3">
      <span className="text-xs font-medium uppercase tracking-wide text-slate">{label}</span>
      <span className="text-sm font-semibold text-ink">{value}</span>
    </div>
  );
}
