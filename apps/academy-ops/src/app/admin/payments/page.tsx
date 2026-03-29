import { AdminRole } from '@prisma/client';
import Link from 'next/link';
import { requireAdminContext } from '@/lib/auth';
import { getPrisma } from '@/lib/prisma';
import { PaymentList, type PaymentWithRelations } from '@/components/payments/payment-list';

export const dynamic = 'force-dynamic';

function formatKRW(amount: number) {
  return `${amount.toLocaleString('ko-KR')}원`;
}

export default async function PaymentsPage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

  const prisma = getPrisma();

  const [unpaidCount, overdueCount, payments] = await Promise.all([
    prisma.installment.count({ where: { paidAt: null } }),
    prisma.installment.count({
      where: {
        paidAt: null,
        dueDate: { lt: startOfDay },
      },
    }),
    prisma.payment.findMany({
      where: {
        processedAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      include: {
        student: { select: { name: true, phone: true } },
        processor: { select: { name: true } },
        items: true,
        refunds: { select: { amount: true, refundType: true, processedAt: true } },
      },
      orderBy: { processedAt: 'desc' },
      take: 200,
    }),
  ]);

  const todayGross = payments.reduce((sum, payment) => sum + payment.grossAmount, 0);
  const todayNet = payments.reduce((sum, payment) => sum + payment.netAmount, 0);
  const todayRefunded = payments.reduce(
    (sum, payment) => sum + payment.refunds.reduce((refundSum, refund) => refundSum + refund.amount, 0),
    0,
  );

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        결제 허브
      </div>

      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">오늘 결제 현황</h1>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate">
            당일 수납 이력과 미납 현황을 빠르게 확인하고, 증빙 출력과 분할 납부 관리 화면으로 바로 이동합니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/payments/new"
            className="inline-flex items-center gap-2 rounded-full bg-ember px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-ember/90"
          >
            <span>+</span>
            <span>수납 등록</span>
          </Link>
          <Link
            href="/admin/payments/unpaid"
            className={[
              'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition',
              overdueCount > 0
                ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                : unpaidCount > 0
                  ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                  : 'border-ink/20 bg-white text-ink hover:border-ink/40',
            ].join(' ')}
          >
            <span>미납 현황</span>
            <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs tabular-nums">{unpaidCount.toLocaleString()}건</span>
          </Link>
        </div>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">오늘 결제 건수</p>
          <p className="mt-2 text-3xl font-semibold text-ink">{payments.length.toLocaleString()}</p>
          <p className="mt-1 text-xs text-slate">건</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">오늘 청구 합계</p>
          <p className="mt-2 text-2xl font-semibold text-ink">{formatKRW(todayGross)}</p>
          <p className="mt-1 text-xs text-slate">할인 전 기준</p>
        </div>
        <div className="rounded-[28px] border border-forest/20 bg-forest/5 p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-forest">오늘 실수납 합계</p>
          <p className="mt-2 text-2xl font-semibold text-forest">{formatKRW(todayNet)}</p>
          <p className="mt-1 text-xs text-forest/70">승인 금액 기준</p>
        </div>
        <div className="rounded-[28px] border border-red-200 bg-red-50 p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-red-600">오늘 환불 합계</p>
          <p className="mt-2 text-2xl font-semibold text-red-700">-{formatKRW(todayRefunded)}</p>
          <p className="mt-1 text-xs text-red-500">완료된 환불 반영</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/admin/payments/reconciliation"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/30"
        >
          일일 정산 대조표
        </Link>
        <Link
          href="/admin/payments/installments"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/30"
        >
          분할 납부 관리
        </Link>
        <Link
          href="/admin/payments/receipt-hub"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/30"
        >
          영수증 · 증빙 허브
        </Link>
        <Link
          href="/admin/payments/cash-receipts"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/30"
        >
          현금영수증 관리
        </Link>
        <Link
          href="/admin/payments/invoices"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/30"
        >
          청구 허브
        </Link>
      </div>

      <div className="mt-6">
        <PaymentList initialPayments={payments as unknown as PaymentWithRelations[]} />
      </div>
    </div>
  );
}
