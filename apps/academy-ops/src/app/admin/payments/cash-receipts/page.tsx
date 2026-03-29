import Link from 'next/link';
import { AdminRole } from '@prisma/client';
import { requireAdminContext } from '@/lib/auth';
import { getPrisma } from '@/lib/prisma';
import { formatDateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthRange(value: string) {
  const [year, month] = value.split('-').map(Number);
  const from = new Date(year, month - 1, 1);
  const to = new Date(year, month, 0, 23, 59, 59, 999);
  return { from, to };
}

function typeLabel(type: string | null) {
  if (type === 'INCOME_DEDUCTION') return '소득공제';
  if (type === 'EXPENSE_PROOF') return '지출증빙';
  return '미발급';
}

function typeBadgeClass(type: string | null) {
  if (type === 'INCOME_DEDUCTION') return 'border-amber-300 bg-amber-100 text-amber-800';
  if (type === 'EXPENSE_PROOF') return 'border-sky-200 bg-sky-50 text-sky-700';
  return 'border-ink/20 bg-ink/5 text-slate';
}

function formatKRW(amount: number) {
  return `${amount.toLocaleString('ko-KR')}원`;
}

function enrollmentLabelOf(enrollment: {
  courseType: 'COMPREHENSIVE' | 'SPECIAL_LECTURE';
  cohort: { name: string } | null;
  product: { name: string } | null;
  specialLecture: { name: string } | null;
}) {
  return (
    enrollment.cohort?.name ??
    enrollment.product?.name ??
    enrollment.specialLecture?.name ??
    (enrollment.courseType === 'SPECIAL_LECTURE' ? '특강' : '종합반')
  );
}

export default async function CashReceiptsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const monthValue = (Array.isArray(searchParams?.month) ? searchParams.month[0] : searchParams?.month) ?? currentMonthValue();
  const typeValue = (Array.isArray(searchParams?.type) ? searchParams.type[0] : searchParams?.type) ?? 'all';
  const { from, to } = getMonthRange(monthValue);

  const prisma = getPrisma();

  const receipts = await prisma.payment.findMany({
    where: {
      cashReceiptNo: { not: null },
      cashReceiptIssuedAt: { gte: from, lte: to },
      ...(typeValue !== 'all' ? { cashReceiptType: typeValue } : {}),
    },
    orderBy: { cashReceiptIssuedAt: 'desc' },
    select: {
      id: true,
      examNumber: true,
      netAmount: true,
      cashReceiptNo: true,
      cashReceiptType: true,
      cashReceiptIssuedAt: true,
      student: {
        select: {
          name: true,
          phone: true,
          courseEnrollments: {
            select: {
              id: true,
              status: true,
              courseType: true,
              cohort: { select: { name: true } },
              product: { select: { name: true } },
              specialLecture: { select: { name: true } },
            },
            orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
            take: 3,
          },
        },
      },
    },
  });

  const allThisMonth = await prisma.payment.findMany({
    where: {
      cashReceiptNo: { not: null },
      cashReceiptIssuedAt: { gte: from, lte: to },
    },
    select: {
      netAmount: true,
      cashReceiptType: true,
      examNumber: true,
      student: {
        select: {
          courseEnrollments: {
            select: { id: true },
            take: 1,
          },
        },
      },
    },
  });

  const totalCount = allThisMonth.length;
  const totalAmount = allThisMonth.reduce((sum, item) => sum + item.netAmount, 0);
  const incomeDeductionCount = allThisMonth.filter((item) => item.cashReceiptType === 'INCOME_DEDUCTION').length;
  const expenseProofCount = allThisMonth.filter((item) => item.cashReceiptType === 'EXPENSE_PROOF').length;
  const linkedStudentCount = allThisMonth.filter((item) => item.examNumber).length;
  const missingEnrollmentCount = allThisMonth.filter(
    (item) => item.examNumber !== null && (item.student?.courseEnrollments.length ?? 0) === 0,
  ).length;

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        수납 관리
      </div>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">현금영수증 발급 이력</h1>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate">
            월별 발급 이력을 확인하고 학생 기본 정보, 연결된 수강 요약, 발급 유형을 함께 점검합니다.
          </p>
        </div>
        <Link
          href="/admin/payments"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-5 py-2.5 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
        >
          수납 목록으로
        </Link>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <div className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate">월 발급 건수</p>
          <p className="mt-2 text-2xl font-bold text-ink tabular-nums">{totalCount.toLocaleString()}건</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate">월 발급 금액</p>
          <p className="mt-2 text-2xl font-bold text-ember tabular-nums">{formatKRW(totalAmount)}</p>
        </div>
        <div className="rounded-[28px] border border-amber-200 bg-amber-50/60 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">소득공제</p>
          <p className="mt-2 text-2xl font-bold text-amber-800 tabular-nums">{incomeDeductionCount.toLocaleString()}건</p>
        </div>
        <div className="rounded-[28px] border border-sky-200 bg-sky-50/60 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-sky-700">지출증빙</p>
          <p className="mt-2 text-2xl font-bold text-sky-800 tabular-nums">{expenseProofCount.toLocaleString()}건</p>
        </div>
        <div className="rounded-[28px] border border-forest/20 bg-forest/5 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-forest">학생 연결</p>
          <p className="mt-2 text-2xl font-bold text-forest tabular-nums">{linkedStudentCount.toLocaleString()}건</p>
        </div>
        <div className="rounded-[28px] border border-red-200 bg-red-50/70 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-red-700">수강 확인 필요</p>
          <p className="mt-2 text-2xl font-bold text-red-700 tabular-nums">{missingEnrollmentCount.toLocaleString()}건</p>
        </div>
      </div>

      <form method="get" className="mt-8 flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate" htmlFor="month-input">
            발급 월
          </label>
          <input
            id="month-input"
            type="month"
            name="month"
            defaultValue={monthValue}
            className="rounded-2xl border border-ink/10 px-4 py-2.5 text-sm outline-none focus:border-ember/40"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate" htmlFor="type-select">
            발급 유형
          </label>
          <select
            id="type-select"
            name="type"
            defaultValue={typeValue}
            className="rounded-2xl border border-ink/10 px-4 py-2.5 text-sm outline-none focus:border-ember/40"
          >
            <option value="all">전체</option>
            <option value="INCOME_DEDUCTION">소득공제</option>
            <option value="EXPENSE_PROOF">지출증빙</option>
          </select>
        </div>
        <button
          type="submit"
          className="rounded-full bg-ember px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-ember/90"
        >
          조회
        </button>
      </form>

      <div className="mt-6 overflow-hidden rounded-[20px] border border-ink/10 bg-white shadow-sm">
        {receipts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-lg font-medium text-ink">발급 이력이 없습니다</p>
            <p className="mt-2 text-sm text-slate">선택한 조건에 해당하는 현금영수증 발급 내역이 없습니다.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <caption className="sr-only">현금영수증 발급 내역</caption>
              <thead>
                <tr className="border-b border-ink/10 bg-mist">
                  {['발급일시', '학생 정보', '수강 요약', '실수납액', '승인번호', '발급 유형', '상세'].map((header) => (
                    <th
                      key={header}
                      className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate whitespace-nowrap"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {receipts.map((receipt) => (
                  <tr key={receipt.id} className="transition-colors hover:bg-mist/60">
                    <td className="px-5 py-4 font-mono text-xs text-slate whitespace-nowrap">
                      {receipt.cashReceiptIssuedAt ? formatDateTime(receipt.cashReceiptIssuedAt.toISOString()) : '-'}
                    </td>
                    <td className="px-5 py-4">
                      {receipt.examNumber ? (
                        <div className="space-y-1">
                          <Link
                            href={`/admin/students/${receipt.examNumber}`}
                            className="font-medium text-ink hover:text-forest hover:underline"
                          >
                            {receipt.student?.name ?? '학생'}
                          </Link>
                          <div className="font-mono text-xs text-slate">{receipt.examNumber}</div>
                          <div className="text-xs text-slate">연락처 {receipt.student?.phone?.trim() ? receipt.student.phone : '미등록'}</div>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <span className="font-medium text-slate">{receipt.student?.name ?? '비회원'}</span>
                          <div className="text-xs text-slate">학번 미연결</div>
                          <div className="text-xs text-slate">연락처 {receipt.student?.phone?.trim() ? receipt.student.phone : '미등록'}</div>
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {receipt.student?.courseEnrollments.length ? (
                        <div className="flex flex-wrap gap-1.5">
                          {receipt.student.courseEnrollments.map((enrollment) => (
                            <span
                              key={enrollment.id}
                              className="inline-flex rounded-full border border-forest/15 bg-forest/5 px-2.5 py-1 text-xs font-medium text-forest"
                            >
                              {enrollmentLabelOf(enrollment)}
                              <span className="ml-1 text-forest/60">· {enrollment.status}</span>
                            </span>
                          ))}
                        </div>
                      ) : receipt.examNumber ? (
                        <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
                          수강내역 없음
                        </span>
                      ) : (
                        <span className="text-xs text-slate">비회원 발급</span>
                      )}
                    </td>
                    <td className="px-5 py-4 font-mono text-sm font-semibold text-ink tabular-nums">{formatKRW(receipt.netAmount)}</td>
                    <td className="px-5 py-4 font-mono text-sm text-slate">{receipt.cashReceiptNo ?? '-'}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${typeBadgeClass(receipt.cashReceiptType)}`}>
                        {typeLabel(receipt.cashReceiptType)}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <Link
                        href={`/admin/payments/${receipt.id}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-ink/20 px-3 py-1.5 text-xs font-medium text-slate transition hover:border-forest/40 hover:text-forest"
                      >
                        상세 보기
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-ink/10 bg-mist/80">
                  <td colSpan={3} className="px-5 py-3 text-xs font-semibold text-slate">
                    합계 ({receipts.length.toLocaleString()}건)
                  </td>
                  <td className="px-5 py-3 font-mono text-sm font-semibold text-ember tabular-nums">
                    {formatKRW(receipts.reduce((sum, receipt) => sum + receipt.netAmount, 0))}
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
