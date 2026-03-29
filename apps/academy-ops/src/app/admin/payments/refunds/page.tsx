import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { RefundApproveManager, type PendingRefundItem } from "./refund-approve-manager";

export const dynamic = "force-dynamic";

export default async function RefundsPendingPage() {
  await requireAdminContext(AdminRole.MANAGER);

  const refunds = await getPrisma().refund.findMany({
    where: { status: "PENDING" },
    orderBy: { processedAt: "asc" },
    include: {
      payment: {
        select: {
          examNumber: true,
          student: { select: { name: true } },
          grossAmount: true,
          netAmount: true,
          note: true,
        },
      },
    },
  });

  // 서버 Date → 직렬화 가능한 string 변환
  const serialized: PendingRefundItem[] = refunds.map((r) => ({
    id: r.id,
    paymentId: r.paymentId,
    refundType: r.refundType,
    amount: r.amount,
    reason: r.reason,
    processedAt: r.processedAt.toISOString(),
    processor: null,
    payment: {
      examNumber: r.payment.examNumber,
      student: r.payment.student ?? null,
      grossAmount: r.payment.grossAmount,
      netAmount: r.payment.netAmount,
      note: r.payment.note,
    },
  }));

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        수강 관리
      </div>
      <div className="mt-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">환불 대기</h1>
          <p className="mt-1 text-sm text-slate">
            승인 대기 중인 환불 요청을 검토하고 승인 또는 거절하세요.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {serialized.length > 0 ? (
            <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
              {serialized.length}건 대기 중
            </span>
          ) : null}
          <a
            href="/admin/payments/refund-calculator"
            className="inline-flex items-center gap-1.5 rounded-full border border-ember/20 bg-ember/5 px-4 py-1.5 text-xs font-semibold text-ember transition hover:bg-ember/10"
          >
            환불 계산기 →
          </a>
        </div>
      </div>

      <div className="mt-8">
        <RefundApproveManager refunds={serialized} />
      </div>

      <div className="mt-6">
        <a
          href="/admin/payments"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-5 py-2.5 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
        >
          ← 수납 이력으로
        </a>
      </div>
    </div>
  );
}
