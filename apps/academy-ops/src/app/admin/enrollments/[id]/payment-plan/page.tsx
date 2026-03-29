import type { ReactNode } from 'react';
import Link from 'next/link';
import { AdminRole, EnrollmentStatus, PaymentStatus, RefundStatus } from '@prisma/client';
import { notFound } from 'next/navigation';
import { requireAdminContext } from '@/lib/auth';
import { applyAcademyScope, getAdminAcademyScope, resolveVisibleAcademyId } from '@/lib/academy-scope';
import { getAcademySettingsByAcademyId } from '@/lib/academy-settings';
import { getPrisma } from '@/lib/prisma';
import {
  COURSE_TYPE_LABEL,
  ENROLLMENT_STATUS_COLOR,
  ENROLLMENT_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_COLOR,
  PAYMENT_STATUS_LABEL,
} from '@/lib/constants';
import { formatDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ id: string }>;
};

type EnrollmentSummary = {
  id: string;
  courseName: string;
  status: EnrollmentStatus;
  courseType: string;
  isCurrent: boolean;
};

function formatKRW(amount: number) {
  return `${amount.toLocaleString('ko-KR')}원`;
}

function formatNullableDate(value: Date | string | null | undefined) {
  if (!value) return '-';
  return formatDate(value);
}

function courseNameOf(item: {
  cohort?: { name: string } | null;
  product?: { name: string } | null;
  specialLecture?: { name: string } | null;
}) {
  return item.cohort?.name ?? item.product?.name ?? item.specialLecture?.name ?? '과정 미지정';
}

function todayStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[24px] border border-gray-200 bg-white p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        {description ? <p className="mt-1 text-sm text-gray-500">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function InfoRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-b border-gray-100 py-2.5 last:border-0">
      <span className="text-gray-500">{label}</span>
      <span className={strong ? 'font-semibold text-gray-900' : 'text-gray-900'}>{value}</span>
    </div>
  );
}

export default async function EnrollmentPaymentPlanPage({ params }: PageProps) {
  const context = await requireAdminContext(AdminRole.COUNSELOR);
  const academyScope = await getAdminAcademyScope();
  const academyId = resolveVisibleAcademyId(academyScope);

  const { id } = await params;
  const prisma = getPrisma();

  const [enrollment, payments] = await Promise.all([
    prisma.courseEnrollment.findFirst({
      where: applyAcademyScope({ id }, academyId),
      include: {
        student: {
          select: {
            examNumber: true,
            name: true,
            phone: true,
            courseEnrollments: {
              where: applyAcademyScope({}, academyId),
              orderBy: [{ createdAt: 'desc' }],
              select: {
                id: true,
                status: true,
                courseType: true,
                startDate: true,
                endDate: true,
                finalFee: true,
                cohort: { select: { name: true } },
                product: { select: { name: true } },
                specialLecture: { select: { name: true } },
              },
            },
          },
        },
        cohort: { select: { name: true } },
        product: { select: { name: true } },
        specialLecture: { select: { name: true } },
        staff: { select: { name: true } },
      },
    }),
    prisma.payment.findMany({
      where: applyAcademyScope({
        enrollmentId: id,
        status: { in: [PaymentStatus.APPROVED, PaymentStatus.PARTIAL_REFUNDED, PaymentStatus.FULLY_REFUNDED] },
      }, academyId),
      orderBy: [{ processedAt: 'asc' }],
      include: {
        items: { orderBy: { id: 'asc' } },
        installments: { orderBy: [{ dueDate: 'asc' }, { seq: 'asc' }] },
        refunds: {
          where: { status: { in: [RefundStatus.APPROVED, RefundStatus.COMPLETED] } },
          orderBy: { processedAt: 'asc' },
          select: {
            id: true,
            amount: true,
            processedAt: true,
            status: true,
          },
        },
        processor: { select: { name: true } },
      },
    }),
  ]);

  if (!enrollment) notFound();

  const settings = await getAcademySettingsByAcademyId(
    enrollment.academyId ?? academyId ?? context.activeAcademyId ?? context.academyId,
  );

  const courseName = courseNameOf(enrollment);
  const studentEnrollments: EnrollmentSummary[] = enrollment.student.courseEnrollments.map((item) => ({
    id: item.id,
    courseName: courseNameOf(item),
    status: item.status,
    courseType: COURSE_TYPE_LABEL[item.courseType],
    isCurrent: item.id === enrollment.id,
  }));

  const refundRows = payments.flatMap((payment) =>
    payment.refunds.map((refund) => ({
      ...refund,
      paymentId: payment.id,
    })),
  );

  const installmentRows = payments
    .flatMap((payment) =>
      payment.installments.map((installment) => ({
        ...installment,
        paymentId: payment.id,
        itemName: payment.items[0]?.itemName ?? '수강료',
      })),
    )
    .sort((a, b) => {
      const dateDiff = a.dueDate.getTime() - b.dueDate.getTime();
      if (dateDiff !== 0) return dateDiff;
      return a.seq - b.seq;
    });

  const totalScheduledAmount = payments.reduce((sum, payment) => sum + payment.netAmount, 0);
  const totalRefundedAmount = refundRows.reduce((sum, refund) => sum + refund.amount, 0);
  const unpaidInstallments = installmentRows.filter((item) => item.paidAt === null);
  const unpaidInstallmentAmount = unpaidInstallments.reduce((sum, item) => sum + item.amount, 0);
  const overdueInstallments = unpaidInstallments.filter((item) => item.dueDate < todayStart());
  const paidInstallmentCount = installmentRows.filter((item) => item.paidAt !== null).length;
  const installmentProgressPercent =
    installmentRows.length > 0 ? Math.round((paidInstallmentCount / installmentRows.length) * 100) : 0;

  const unpaidHint =
    overdueInstallments.length > 0
      ? `연체 ${overdueInstallments.length.toLocaleString()}건 포함`
      : unpaidInstallments.length > 0
        ? `미납 ${unpaidInstallments.length.toLocaleString()}건`
        : '분할 일정 없음';

  return (
    <div className="min-h-screen bg-gray-100">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .plan-page {
            width: 210mm !important;
            min-height: 297mm !important;
            margin: 0 !important;
            padding: 12mm !important;
            box-shadow: none !important;
            border-radius: 0 !important;
          }
          @page { size: A4; margin: 0; }
        }
      `}</style>

      <div className="no-print flex items-center justify-between gap-3 border-b bg-white px-6 py-4">
        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
          <Link
            href={`/admin/enrollments/${enrollment.id}`}
            className="inline-flex items-center rounded-full border border-gray-200 px-4 py-2 transition hover:border-gray-400"
          >
            수강 상세
          </Link>
          <Link
            href={`/admin/enrollments/${enrollment.id}/payments`}
            className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-4 py-2 font-medium text-amber-800 transition hover:border-amber-300"
          >
            수납 등록
          </Link>
          <Link
            href={`/admin/members/${enrollment.student.examNumber}/payments`}
            className="inline-flex items-center rounded-full border border-gray-200 px-4 py-2 transition hover:border-gray-400"
          >
            회원 수납 이력
          </Link>
          <Link
            href={`/admin/students/${enrollment.student.examNumber}`}
            className="inline-flex items-center rounded-full border border-forest/20 px-4 py-2 text-forest transition hover:border-forest/40"
          >
            학생 상세
          </Link>
        </div>
        <p className="text-sm text-gray-500">브라우저 인쇄 기능으로 출력하세요. 발행일 {formatDate(new Date())}</p>
      </div>

      <div className="flex justify-center px-4 py-8">
        <div className="plan-page w-full max-w-[920px] rounded-[28px] bg-white p-8 shadow-xl">
          <div className="border-b border-gray-200 pb-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">학원명 미설정 통합 관리 시스템</p>
                <h1 className="mt-3 text-3xl font-semibold text-gray-900">납부 계획표</h1>
                <p className="mt-2 text-sm text-gray-500">
                  수강 등록을 기준으로 납부 이력, 분할 일정, 환불 반영 내역을 한 번에 확인하는 문서입니다.
                </p>
              </div>
              <div className="rounded-[20px] border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                <div>과정: {courseName}</div>
                <div>등록 직원: {enrollment.staff?.name ?? '미지정'}</div>
                <div>원장: {settings?.directorName ?? '학원명 미설정'}</div>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-4">
            <article className="rounded-[20px] border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">최종 수강료</p>
              <p className="mt-3 text-2xl font-bold text-gray-900">{formatKRW(enrollment.finalFee)}</p>
            </article>
            <article className="rounded-[20px] border border-forest/20 bg-forest/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-forest">확정 납부 합계</p>
              <p className="mt-3 text-2xl font-bold text-forest">{formatKRW(totalScheduledAmount)}</p>
            </article>
            <article
              className={`rounded-[20px] border p-4 ${
                overdueInstallments.length > 0
                  ? 'border-red-200 bg-red-50'
                  : unpaidInstallmentAmount > 0
                    ? 'border-amber-200 bg-amber-50'
                    : 'border-gray-200 bg-gray-50'
              }`}
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">미납 분할금</p>
              <p
                className={`mt-3 text-2xl font-bold ${
                  overdueInstallments.length > 0
                    ? 'text-red-700'
                    : unpaidInstallmentAmount > 0
                      ? 'text-amber-700'
                      : 'text-gray-900'
                }`}
              >
                {formatKRW(unpaidInstallmentAmount)}
              </p>
              <p className="mt-1 text-xs text-gray-500">{unpaidHint}</p>
            </article>
            <article className="rounded-[20px] border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">환불 확정액</p>
              <p className="mt-3 text-2xl font-bold text-red-600">{formatKRW(totalRefundedAmount)}</p>
            </article>
          </div>

          {installmentRows.length > 0 ? (
            <div className="mt-4 rounded-[20px] border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">분할 납부 진행률</span>
                <span className="font-semibold text-forest">
                  {paidInstallmentCount} / {installmentRows.length} 완료
                </span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-200">
                <div className="h-full rounded-full bg-forest" style={{ width: `${installmentProgressPercent}%` }} />
              </div>
            </div>
          ) : null}

          <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <Section
              title="학생 기본 정보"
              description="학번, 이름, 연락처, 수강 이력을 공통 규칙에 따라 함께 표시합니다."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">이름</p>
                  <Link href={`/admin/students/${enrollment.student.examNumber}`} className="mt-1 inline-flex text-base font-semibold text-forest hover:underline">
                    {enrollment.student.name}
                  </Link>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">학번</p>
                  <Link href={`/admin/students/${enrollment.student.examNumber}`} className="mt-1 inline-flex text-base font-semibold text-forest hover:underline">
                    {enrollment.student.examNumber}
                  </Link>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">연락처</p>
                  <p className="mt-1 text-base text-gray-900">{enrollment.student.phone ?? '-'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">현재 수강</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-2.5 py-1 text-xs font-semibold text-forest">
                      {COURSE_TYPE_LABEL[enrollment.courseType]}
                    </span>
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${ENROLLMENT_STATUS_COLOR[enrollment.status]}`}>
                      {ENROLLMENT_STATUS_LABEL[enrollment.status]}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">수강 이력</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {studentEnrollments.map((item) => (
                    <Link
                      key={item.id}
                      href={`/admin/enrollments/${item.id}`}
                      className={`rounded-full border px-3 py-1.5 text-xs transition hover:border-gray-400 ${
                        item.isCurrent ? 'border-forest/30 bg-forest/10 text-forest' : 'border-gray-200 bg-white text-gray-700'
                      }`}
                    >
                      {item.courseName} · {item.courseType} · {ENROLLMENT_STATUS_LABEL[item.status]}
                    </Link>
                  ))}
                </div>
              </div>
            </Section>

            <Section title="현재 수강 등록 정보" description="현재 납부계획표가 연결된 수강 등록의 기본 정보입니다.">
              <div className="space-y-3 text-sm">
                <InfoRow label="과정" value={courseName} />
                <InfoRow label="수강 시작" value={formatNullableDate(enrollment.startDate)} />
                <InfoRow label="수강 종료" value={formatNullableDate(enrollment.endDate)} />
                <InfoRow label="등록일" value={formatNullableDate(enrollment.createdAt)} />
                <InfoRow label="정가 / 할인" value={`${formatKRW(enrollment.regularFee)} / ${formatKRW(enrollment.discountAmount)}`} />
                <InfoRow label="최종 수강료" value={formatKRW(enrollment.finalFee)} strong />
              </div>
            </Section>
          </div>

          <div className="mt-6">
            <Section title="수납 등록 이력" description="이 수강 등록과 연결된 수납만 표시합니다.">
              {payments.length === 0 ? (
                <div className="rounded-[20px] border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500">
                  <p>아직 등록된 수납 건이 없습니다.</p>
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                    <Link
                      href={`/admin/enrollments/${enrollment.id}/payments`}
                      className="inline-flex items-center rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-600"
                    >
                      + 수납 등록
                    </Link>
                    <Link
                      href={`/admin/members/${enrollment.student.examNumber}/payments`}
                      className="inline-flex items-center rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-gray-400"
                    >
                      회원 수납 이력
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <caption className="sr-only">수강 등록별 수납 이력</caption>
                    <thead className="bg-gray-50 text-left">
                      <tr>
                        <th className="px-4 py-3 font-semibold text-gray-600">수납일</th>
                        <th className="px-4 py-3 font-semibold text-gray-600">수납번호</th>
                        <th className="px-4 py-3 font-semibold text-gray-600">항목</th>
                        <th className="px-4 py-3 font-semibold text-gray-600">수납수단</th>
                        <th className="px-4 py-3 font-semibold text-gray-600">상태</th>
                        <th className="px-4 py-3 text-right font-semibold text-gray-600">실수납액</th>
                        <th className="px-4 py-3 text-right font-semibold text-gray-600">환불액</th>
                        <th className="px-4 py-3 font-semibold text-gray-600">처리자</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {payments.map((payment) => {
                        const refunded = payment.refunds.reduce((sum, refund) => sum + refund.amount, 0);
                        return (
                          <tr key={payment.id}>
                            <td className="whitespace-nowrap px-4 py-3 text-gray-700">{formatNullableDate(payment.processedAt)}</td>
                            <td className="whitespace-nowrap px-4 py-3">
                              <Link href={`/admin/payments/${payment.id}`} className="font-medium text-forest hover:underline">
                                #{payment.id.slice(-6)}
                              </Link>
                            </td>
                            <td className="px-4 py-3 text-gray-700">{payment.items.map((item) => item.itemName).join(', ')}</td>
                            <td className="whitespace-nowrap px-4 py-3 text-gray-700">{PAYMENT_METHOD_LABEL[payment.method]}</td>
                            <td className="whitespace-nowrap px-4 py-3">
                              <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${PAYMENT_STATUS_COLOR[payment.status]}`}>
                                {PAYMENT_STATUS_LABEL[payment.status]}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-gray-900">{formatKRW(payment.netAmount)}</td>
                            <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-red-600">{refunded > 0 ? formatKRW(refunded) : '-'}</td>
                            <td className="whitespace-nowrap px-4 py-3 text-gray-700">{payment.processor?.name ?? '-'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          </div>

          <div className="mt-6">
            <Section title="분할 일정" description="예정일과 실제 납부 여부를 함께 보여줍니다.">
              <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
                <Link
                  href="/admin/payments/installments"
                  className="inline-flex items-center rounded-full border border-forest/20 px-3 py-1.5 text-forest transition hover:border-forest/40"
                >
                  분할 관리로 이동
                </Link>
                {overdueInstallments.length > 0 ? (
                  <Link
                    href="/admin/payments/installments?status=overdue"
                    className="inline-flex items-center rounded-full border border-red-200 px-3 py-1.5 text-red-700 transition hover:border-red-300"
                  >
                    연체 분할 보기
                  </Link>
                ) : null}
                <span className="text-xs text-gray-500">
                  실제 납부 처리와 분할별 확인은 기존 분할 관리 화면에서 진행합니다.
                </span>
              </div>
              {installmentRows.length === 0 ? (
                <div className="rounded-[20px] border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500">
                  분할 납부 일정이 없습니다. 필요하면 분할 관리 화면에서 현재 상태를 다시 확인하세요.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <caption className="sr-only">분할 납부 일정</caption>
                    <thead className="bg-gray-50 text-left">
                      <tr>
                        <th className="px-4 py-3 font-semibold text-gray-600">회차</th>
                        <th className="px-4 py-3 font-semibold text-gray-600">예정일</th>
                        <th className="px-4 py-3 font-semibold text-gray-600">납부일</th>
                        <th className="px-4 py-3 font-semibold text-gray-600">항목</th>
                        <th className="px-4 py-3 font-semibold text-gray-600">상태</th>
                        <th className="px-4 py-3 text-right font-semibold text-gray-600">금액</th>
                        <th className="px-4 py-3 text-right font-semibold text-gray-600">바로가기</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {installmentRows.map((row) => {
                        const isPaid = row.paidAt !== null;
                        const isOverdue = !isPaid && row.dueDate < todayStart();
                        const statusClass = isPaid
                          ? 'border-forest/20 bg-forest/10 text-forest'
                          : isOverdue
                            ? 'border-red-200 bg-red-50 text-red-700'
                            : 'border-amber-200 bg-amber-50 text-amber-700';
                        const statusLabel = isPaid ? '납부 완료' : isOverdue ? '연체' : '미납';

                        return (
                          <tr key={row.id} className={isPaid ? 'bg-forest/5' : isOverdue ? 'bg-red-50/60' : undefined}>
                            <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">{row.seq}회차</td>
                            <td className="whitespace-nowrap px-4 py-3 text-gray-700">{formatNullableDate(row.dueDate)}</td>
                            <td className="whitespace-nowrap px-4 py-3 text-gray-700">{formatNullableDate(row.paidAt)}</td>
                            <td className="px-4 py-3 text-gray-700">
                              <div className="flex flex-wrap items-center gap-2">
                                <span>{row.itemName}</span>
                                <Link href={`/admin/payments/${row.paymentId}`} className="text-xs text-forest hover:underline">
                                  결제 상세
                                </Link>
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3">
                              <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass}`}>{statusLabel}</span>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-gray-900">{formatKRW(row.amount)}</td>
                            <td className="whitespace-nowrap px-4 py-3 text-right">
                              <Link
                                href={`/admin/payments/installments/${row.id}`}
                                className="text-xs font-medium text-forest hover:underline"
                              >
                                분할 상세
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          </div>

          <div className="mt-6 rounded-[24px] border border-gray-200 bg-gray-50 p-5 text-sm text-gray-600">
            <p className="font-semibold text-gray-900">확인 사항</p>
            <ul className="mt-2 space-y-1">
              <li>확정 납부 합계는 연결된 결제의 실수납액 기준입니다.</li>
              <li>환불액은 승인 또는 완료 처리된 환불만 반영합니다.</li>
              <li>학생명과 학번을 누르면 학생 상세 화면으로 이동합니다.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
