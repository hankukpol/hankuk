import type { Metadata } from "next";
import Link from "next/link";
import {
  CourseType,
  EnrollmentStatus,
  PaymentStatus,
  RefundStatus,
} from "@prisma/client";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { PaymentTimeline, type TimelineInstallment } from "@/components/student-portal/payment-timeline";
import { PaymentCalendar, type CalendarInstallment } from "@/components/student-portal/payment-calendar";
import { getAcademyRuntimeBranding } from "@/lib/academy-branding";
import { hasDatabaseConfig } from "@/lib/env";
import { formatDate } from "@/lib/format";
import { getPrisma } from "@/lib/prisma";
import { getStudentPortalViewer } from "@/lib/student-portal/service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "납부 일정",
};

// ─── Label maps ────────────────────────────────────────────────────────────────

const COURSE_TYPE_LABEL: Record<CourseType, string> = {
  COMPREHENSIVE: "종합반",
  SPECIAL_LECTURE: "특강",
};


// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatAmount(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

function formatKoreanDate(value: Date | null | undefined): string {
  if (!value) return "-";
  const y = value.getFullYear();
  const m = value.getMonth() + 1;
  const d = value.getDate();
  return `${y}년 ${m}월 ${d}일`;
}

// ─── Data fetching ─────────────────────────────────────────────────────────────

async function fetchPaymentScheduleData(examNumber: string) {
  const prisma = getPrisma();
  const now = new Date();
  const sevenDaysLater = new Date(now);
  sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);

  const enrollments = await prisma.courseEnrollment.findMany({
    where: { examNumber },
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      courseType: true,
      finalFee: true,
      status: true,
      startDate: true,
      endDate: true,
      product: { select: { id: true, name: true } },
      cohort: { select: { id: true, name: true } },
      specialLecture: { select: { id: true, name: true } },
    },
  });

  const payments = await prisma.payment.findMany({
    where: { examNumber },
    orderBy: [{ processedAt: "desc" }],
    select: {
      id: true,
      grossAmount: true,
      netAmount: true,
      status: true,
      processedAt: true,
      enrollmentId: true,
      installments: {
        orderBy: [{ seq: "asc" }],
        select: {
          id: true,
          seq: true,
          amount: true,
          dueDate: true,
          paidAt: true,
        },
      },
      refunds: {
        select: {
          id: true,
          amount: true,
          status: true,
        },
      },
    },
  });

  // Compute totals from approved payments
  const approvedPayments = payments.filter(
    (p) =>
      p.status === PaymentStatus.APPROVED ||
      p.status === PaymentStatus.PARTIAL_REFUNDED ||
      p.status === PaymentStatus.FULLY_REFUNDED,
  );

  const totalGrossFee = enrollments
    .filter(
      (e) =>
        e.status === EnrollmentStatus.ACTIVE ||
        e.status === EnrollmentStatus.SUSPENDED ||
        e.status === EnrollmentStatus.PENDING,
    )
    .reduce((sum, e) => sum + e.finalFee, 0);

  const totalPaid = approvedPayments.reduce((sum, p) => sum + p.grossAmount, 0);

  const totalRefunded = payments
    .flatMap((p) => p.refunds)
    .reduce((sum, r) => {
      if (r.status === RefundStatus.COMPLETED || r.status === RefundStatus.APPROVED) {
        return sum + r.amount;
      }
      return sum;
    }, 0);

  const netPaid = totalPaid - totalRefunded;

  // All installments (paid + unpaid) across approved payments, enriched with context
  const allInstallments = approvedPayments
    .flatMap((p) =>
      p.installments.map((inst) => ({
        ...inst,
        paymentId: p.id,
        enrollmentId: p.enrollmentId,
        isOverdue:
          inst.paidAt === null &&
          inst.dueDate !== null &&
          new Date(inst.dueDate).setHours(0, 0, 0, 0) < new Date(now).setHours(0, 0, 0, 0),
        isUpcoming:
          inst.paidAt === null &&
          inst.dueDate !== null &&
          new Date(inst.dueDate).setHours(0, 0, 0, 0) >= new Date(now).setHours(0, 0, 0, 0) &&
          new Date(inst.dueDate).setHours(0, 0, 0, 0) <=
            new Date(sevenDaysLater).setHours(0, 0, 0, 0),
      })),
    )
    .sort((a, b) => {
      // Unpaid first, then by dueDate
      if (a.paidAt === null && b.paidAt !== null) return -1;
      if (a.paidAt !== null && b.paidAt === null) return 1;
      const aTime = a.dueDate ? new Date(a.dueDate).getTime() : 0;
      const bTime = b.dueDate ? new Date(b.dueDate).getTime() : 0;
      return aTime - bTime;
    });

  const unpaidInstallments = allInstallments.filter((inst) => inst.paidAt === null);
  const overdueAmount = unpaidInstallments
    .filter((inst) => inst.isOverdue)
    .reduce((sum, inst) => sum + inst.amount, 0);
  const unpaidTotal = unpaidInstallments.reduce((sum, inst) => sum + inst.amount, 0);

  // Build a map of enrollmentId → course name
  const enrollmentMap = new Map(
    enrollments.map((e) => [
      e.id,
      {
        name:
          e.product?.name ??
          e.cohort?.name ??
          e.specialLecture?.name ??
          "강좌",
        courseType: e.courseType,
        status: e.status,
        cohortName: e.cohort?.name ?? null,
      },
    ]),
  );

  // Next upcoming unpaid installment (earliest dueDate that is not overdue)
  const nextDueInstallment = unpaidInstallments
    .filter((i) => !i.isOverdue && i.dueDate !== null)
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())[0] ?? null;

  const daysUntilNextDue = nextDueInstallment?.dueDate
    ? Math.ceil(
        (new Date(nextDueInstallment.dueDate).setHours(0, 0, 0, 0) -
          new Date(now).setHours(0, 0, 0, 0)) /
          (1000 * 60 * 60 * 24),
      )
    : null;
  // Build timeline items (enrich with courseName)
  const timelineInstallments: TimelineInstallment[] = allInstallments.map((inst) => {
    const enrollment = inst.enrollmentId ? enrollmentMap.get(inst.enrollmentId) : null;
    return {
      id: inst.id,
      seq: inst.seq,
      amount: inst.amount,
      dueDate: inst.dueDate ? inst.dueDate.toISOString() : null,
      paidAt: inst.paidAt ? inst.paidAt.toISOString() : null,
      courseName: enrollment?.name ?? "강좌",
      isOverdue: inst.isOverdue,
      isUpcoming: inst.isUpcoming,
    };
  });

  // Build calendar items
  const calendarInstallments: CalendarInstallment[] = allInstallments.map((inst) => {
    const enrollment = inst.enrollmentId ? enrollmentMap.get(inst.enrollmentId) : null;
    return {
      id: inst.id,
      seq: inst.seq,
      amount: inst.amount,
      dueDate: inst.dueDate ? inst.dueDate.toISOString() : null,
      paidAt: inst.paidAt ? inst.paidAt.toISOString() : null,
      courseName: enrollment?.name ?? "강좌",
      isOverdue: inst.isOverdue,
    };
  });

  return {
    enrollments,
    allInstallments,
    unpaidInstallments,
    overdueAmount,
    unpaidTotal,
    totalGrossFee,
    netPaid,
    enrollmentMap,
    nextDueInstallment,
    daysUntilNextDue,
    timelineInstallments,
    calendarInstallments,
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function StudentPaymentSchedulePage() {
  if (!hasDatabaseConfig()) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
              Payment Schedule Unavailable
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              납부 일정은 DB 연결 후 사용할 수 있습니다.
            </h1>
            <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
              현재 환경에는 납부 데이터를 불러올 데이터베이스가 연결되어 있지 않습니다.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/student"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                학생 포털로 돌아가기
              </Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const viewer = await getStudentPortalViewer();

  if (!viewer) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
              납부 일정
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              납부 일정은 로그인 후 확인할 수 있습니다.
            </h1>
            <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
              학생 포털에 로그인하면 분납 일정과 납부 현황을 확인할 수 있습니다.
            </p>
          </section>

          <StudentLookupForm redirectPath="/student/payment-schedule" />
        </div>
      </main>
    );
  }

  const branding = await getAcademyRuntimeBranding(viewer.academyId ?? undefined);

  const {
    allInstallments,
    unpaidInstallments,
    overdueAmount,
    unpaidTotal,
    totalGrossFee,
    netPaid,
    enrollmentMap,
    daysUntilNextDue,
    nextDueInstallment,
    timelineInstallments,
    calendarInstallments,
  } = await fetchPaymentScheduleData(viewer.examNumber);

  const progressPercent =
    totalGrossFee > 0 ? Math.min(100, Math.round((netPaid / totalGrossFee) * 100)) : 0;

  return (
    <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">

        {/* ── 헤더 ── */}
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
                Payment Schedule
              </div>
              <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
                납부 일정
              </h1>
              <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
                {viewer.name}님의 분할 납부 일정과 납부 현황입니다.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/student/payments"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                수납 내역
              </Link>
              <Link
                href="/student"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                포털 홈으로
              </Link>
            </div>
          </div>

          {/* ── 요약 KPI ── */}
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <p className="text-sm text-slate">총 수강료</p>
              <p className="mt-3 text-2xl font-bold text-ink">
                {formatAmount(totalGrossFee)}
              </p>
            </article>
            <article className="rounded-[24px] border border-forest/20 bg-forest/5 p-4">
              <p className="text-sm text-slate">납입 완료</p>
              <p className="mt-3 text-2xl font-bold text-forest">
                {formatAmount(netPaid)}
              </p>
            </article>
            <article
              className={`rounded-[24px] border p-4 ${
                overdueAmount > 0
                  ? "border-red-200 bg-red-50"
                  : unpaidTotal > 0
                  ? "border-amber-200 bg-amber-50"
                  : "border-ink/10 bg-mist"
              }`}
            >
              <p className="text-sm text-slate">
                {overdueAmount > 0 ? "연체 금액" : "미납액"}
              </p>
              <p
                className={`mt-3 text-2xl font-bold ${
                  overdueAmount > 0
                    ? "text-red-700"
                    : unpaidTotal > 0
                    ? "text-amber-700"
                    : "text-forest"
                }`}
              >
                {overdueAmount > 0 ? formatAmount(overdueAmount) : formatAmount(unpaidTotal)}
              </p>
              {overdueAmount > 0 && (
                <p className="mt-1 text-xs text-red-600">즉시 납부 필요</p>
              )}
            </article>
            <article
              className={`rounded-[24px] border p-4 ${
                daysUntilNextDue !== null && daysUntilNextDue <= 3
                  ? "border-amber-200 bg-amber-50"
                  : "border-ink/10 bg-mist"
              }`}
            >
              <p className="text-sm text-slate">이번 달 납부 예정</p>
              {nextDueInstallment ? (
                <>
                  <p
                    className={`mt-3 text-2xl font-bold ${
                      daysUntilNextDue !== null && daysUntilNextDue <= 3
                        ? "text-amber-700"
                        : "text-ink"
                    }`}
                  >
                    {formatAmount(nextDueInstallment.amount)}
                  </p>
                  {daysUntilNextDue !== null && (
                    <p
                      className={`mt-1 text-xs font-semibold ${
                        daysUntilNextDue <= 3 ? "text-amber-600" : "text-slate"
                      }`}
                    >
                      {daysUntilNextDue === 0
                        ? "오늘 납부일"
                        : `D-${daysUntilNextDue}`}
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-3 text-2xl font-bold text-forest">없음</p>
              )}
            </article>
          </div>

          {/* ── 진행 바 ── */}
          {totalGrossFee > 0 && (
            <div className="mt-6">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate">납부 진행률 (완납까지 남은 금액)</span>
                <span className="font-semibold text-forest">{progressPercent}%</span>
              </div>
              <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-ink/10">
                <div
                  className="h-full rounded-full bg-forest transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="mt-2 flex justify-between text-xs text-slate">
                <span>납부 완료 {formatAmount(netPaid)}</span>
                <span className={unpaidTotal > 0 ? "font-semibold text-amber-600" : ""}>
                  잔액 {formatAmount(Math.max(0, totalGrossFee - netPaid))}
                </span>
              </div>
            </div>
          )}
        </section>

        {/* ── 연체 경고 카드 ── */}
        {overdueAmount > 0 && (
          <section className="rounded-[28px] border border-ember/30 bg-ember/5 p-5 sm:p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-ember/10">
                <svg
                  className="h-5 w-5 text-ember"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                  />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-ember">
                  연체 미납금 {formatAmount(overdueAmount)}
                </p>
                <p className="mt-1 text-sm text-slate">
                  납부 예정일이 지난 회차가 있습니다. 아래에서 확인하고 학원에 문의해 주세요.
                </p>
                {branding.phoneHref ? (
                  <a
                    href={branding.phoneHref}
                    className="mt-3 inline-flex items-center rounded-full border border-ember/30 bg-white px-4 py-2 text-xs font-semibold text-ember transition hover:bg-ember/10"
                  >
                    {branding.phone} 전화하기
                  </a>
                ) : null}
              </div>
            </div>
          </section>
        )}

        {/* ── 납부 진행 타임라인 ── */}
        {timelineInstallments.length > 0 && (
          <PaymentTimeline installments={timelineInstallments} />
        )}

        {/* ── 납부일 달력 ── */}
        {calendarInstallments.some((i) => i.dueDate !== null) && (
          <PaymentCalendar installments={calendarInstallments} />
        )}

        {/* ── 납부 일정 테이블 ── */}
        <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">
                Installment Schedule
              </p>
              <h2 className="mt-1 text-xl font-semibold">분납 일정 전체</h2>
            </div>
            <div className="flex items-center gap-3">
              {unpaidInstallments.length > 0 && (
                <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                  미납 {unpaidInstallments.length}건
                </span>
              )}
              <span className="inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold text-slate">
                전체 {allInstallments.length}건
              </span>
            </div>
          </div>

          {allInstallments.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-ink/10 px-5 py-12 text-center">
              <p className="text-sm font-semibold text-ink">분납 일정이 없습니다</p>
              <p className="mt-2 text-sm text-slate">
                일시납 수납이거나 아직 등록된 납부 일정이 없습니다.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-[24px] border border-ink/10">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-ink/10 text-sm">
                  <thead className="bg-mist/80 text-left">
                    <tr>
                      <th className="whitespace-nowrap px-4 py-3 font-semibold">회차</th>
                      <th className="whitespace-nowrap px-4 py-3 font-semibold">납부 예정일</th>
                      <th className="whitespace-nowrap px-4 py-3 font-semibold">금액</th>
                      <th className="whitespace-nowrap px-4 py-3 font-semibold">강좌</th>
                      <th className="whitespace-nowrap px-4 py-3 font-semibold">상태</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/10">
                    {allInstallments.map((inst) => {
                      const enrollment = inst.enrollmentId
                        ? enrollmentMap.get(inst.enrollmentId)
                        : null;

                      let rowClass = "";
                      if (inst.paidAt !== null) {
                        rowClass = "bg-forest/5";
                      } else if (inst.isOverdue) {
                        rowClass = "bg-red-50/60";
                      } else if (inst.isUpcoming) {
                        rowClass = "bg-amber-50/60";
                      }

                      return (
                        <tr key={inst.id} className={rowClass}>
                          <td className="whitespace-nowrap px-4 py-3 font-medium">
                            {inst.seq}회차
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate">
                            {inst.dueDate ? formatKoreanDate(inst.dueDate) : "-"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 font-semibold">
                            {formatAmount(inst.amount)}
                          </td>
                          <td className="px-4 py-3">
                            {enrollment ? (
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-xs text-ink">{enrollment.name}</span>
                                <span className="inline-flex rounded-full border border-ink/10 bg-mist px-2 py-0.5 text-[10px] font-semibold text-slate">
                                  {COURSE_TYPE_LABEL[enrollment.courseType]}
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-slate">-</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            {inst.paidAt !== null ? (
                              <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-2.5 py-1 text-xs font-semibold text-forest">
                                납부 완료 · {formatDate(inst.paidAt)}
                              </span>
                            ) : inst.isOverdue ? (
                              <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
                                연체
                              </span>
                            ) : inst.isUpcoming ? (
                              <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                                7일 내 납부 예정
                              </span>
                            ) : (
                              <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
                                납부 예정
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* ── 범례 ── */}
        {allInstallments.length > 0 && (
          <div className="flex flex-wrap items-center gap-4 px-1 text-xs text-slate">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-full border border-forest/20 bg-forest/10" />
              납부 완료
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-full border border-red-200 bg-red-50" />
              연체 (예정일 경과)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-full border border-amber-200 bg-amber-50" />
              7일 내 예정
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-full border border-sky-200 bg-sky-50" />
              납부 예정
            </span>
          </div>
        )}

        {/* ── 문의 ── */}
        <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
          <h2 className="text-lg font-semibold">납부 문의</h2>
          <p className="mt-3 text-sm text-slate">
            분납 일정 변경이나 납부 관련 문의는 학원으로 연락해 주세요.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {branding.phoneHref ? (
              <a
                href={branding.phoneHref}
                className="inline-flex items-center rounded-full border border-ink/10 bg-mist px-5 py-3 text-sm font-semibold text-ink transition hover:border-ember/30 hover:text-ember"
              >
                전화: {branding.phone}
              </a>
            ) : null}
            <div className="inline-flex items-center rounded-full border border-ink/10 bg-mist px-5 py-3 text-sm text-slate">
              평일 09:00 ~ 21:00 / 주말 09:00 ~ 18:00
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/student/payments"
              className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
            >
              수납 내역 보기
            </Link>
            <Link
              href="/student/payment-history"
              className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
            >
              납부 이력 전체 보기
            </Link>
          </div>
        </section>

      </div>
    </main>
  );
}
