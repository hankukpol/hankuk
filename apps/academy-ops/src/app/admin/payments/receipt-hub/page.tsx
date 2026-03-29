import Link from 'next/link';
import { AdminRole } from '@prisma/client';
import { requireAdminContext } from '@/lib/auth';
import { getPrisma } from '@/lib/prisma';
import { ReceiptHubClient, type ReceiptHubRow } from './receipt-hub-client';

export const dynamic = 'force-dynamic';

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function singleParam(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function enrollmentLabelOf(item: {
  cohort?: { name: string } | null;
  product?: { name: string } | null;
  specialLecture?: { name: string } | null;
}) {
  return item.cohort?.name ?? item.product?.name ?? item.specialLecture?.name ?? '연결된 수강 없음';
}

export default async function ReceiptHubPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const prisma = getPrisma();
  const now = new Date();
  const defaultTo = toDateInput(now);
  const defaultFrom = toDateInput(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29));

  const fromParam = singleParam(searchParams?.from) ?? defaultFrom;
  const toParam = singleParam(searchParams?.to) ?? defaultTo;

  const fromDate = new Date(`${fromParam}T00:00:00`);
  const toDate = new Date(`${toParam}T23:59:59.999`);

  const payments = await prisma.payment.findMany({
    where: {
      processedAt: { gte: fromDate, lte: toDate },
      status: { in: ['APPROVED', 'PARTIAL_REFUNDED'] },
    },
    include: {
      student: {
        select: {
          name: true,
          phone: true,
        },
      },
      items: {
        orderBy: { id: 'asc' },
        select: {
          itemName: true,
          itemType: true,
          itemId: true,
        },
      },
    },
    orderBy: { processedAt: 'desc' },
    take: 500,
  });

  const enrollmentIds = Array.from(
    new Set(
      payments.flatMap((payment) => {
        const direct = payment.enrollmentId ? [payment.enrollmentId] : [];
        const fromItems = payment.items
          .filter((item) => item.itemType === 'TUITION' && item.itemId)
          .map((item) => item.itemId as string);
        return [...direct, ...fromItems];
      }),
    ),
  );

  const enrollments =
    enrollmentIds.length > 0
      ? await prisma.courseEnrollment.findMany({
          where: { id: { in: enrollmentIds } },
          select: {
            id: true,
            cohort: { select: { name: true } },
            product: { select: { name: true } },
            specialLecture: { select: { name: true } },
          },
        })
      : [];

  const enrollmentMap = new Map(enrollments.map((enrollment) => [enrollment.id, enrollment]));

  const rows: ReceiptHubRow[] = payments.map((payment) => {
    const enrollmentId =
      payment.enrollmentId ??
      payment.items.find((item) => item.itemType === 'TUITION' && item.itemId)?.itemId ??
      null;
    const enrollment = enrollmentId ? enrollmentMap.get(enrollmentId) : null;

    return {
      id: payment.id,
      examNumber: payment.examNumber ?? null,
      studentName: payment.student?.name ?? null,
      studentMobile: payment.student?.phone ?? null,
      enrollmentSummary: enrollment ? enrollmentLabelOf(enrollment) : '연결된 수강 없음',
      itemNames: payment.items.length > 0 ? payment.items.map((item) => item.itemName).join(', ') : '수납 항목 없음',
      netAmount: payment.netAmount,
      method: payment.method,
      category: payment.category,
      processedAt: payment.processedAt.toISOString(),
      enrollmentId,
    };
  });

  const totalAmount = rows.reduce((sum, row) => sum + row.netAmount, 0);

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        수납 관리
      </div>

      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">영수증 · 납부계획 증빙 허브</h1>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate">
            선택 기간의 결제를 기준으로 학생 기본 정보, 연결된 수강 정보, 영수증 출력과 납부계획표 확인을 한 번에 처리합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/payments"
            className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/30"
          >
            수납 이력
          </Link>
          <Link
            href="/admin/payments/cash-receipts"
            className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/30"
          >
            현금영수증 관리
          </Link>
        </div>
      </div>

      <div className="mt-8">
        <ReceiptHubClient
          payments={rows}
          totalAmount={totalAmount}
          receiptReadyCount={rows.length}
          initialFrom={fromParam}
          initialTo={toParam}
          initialSearch=""
        />
      </div>
    </div>
  );
}
