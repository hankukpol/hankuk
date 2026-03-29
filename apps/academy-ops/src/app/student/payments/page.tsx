import type { Metadata } from "next";
import Link from "next/link";
import {
  CourseType,
  EnrollmentStatus,
  LinkStatus,
  PaymentStatus,
  RefundStatus,
} from "@prisma/client";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { getAcademyRuntimeBranding } from "@/lib/academy-branding";
import { hasDatabaseConfig } from "@/lib/env";
import { formatDate } from "@/lib/format";
import { getPrisma } from "@/lib/prisma";
import { getStudentPortalViewer } from "@/lib/student-portal/service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "수납 내역",
};

// ─── Label maps ────────────────────────────────────────────────────────────────

const ENROLLMENT_STATUS_LABEL: Record<EnrollmentStatus, string> = {
  PENDING: "대기 중",
  ACTIVE: "수강 중",
  WAITING: "대기자",
  SUSPENDED: "휴원",
  COMPLETED: "수강 완료",
  WITHDRAWN: "자퇴",
  CANCELLED: "취소",
};

const ENROLLMENT_STATUS_COLOR: Record<EnrollmentStatus, string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-700",
  ACTIVE: "border-forest/20 bg-forest/10 text-forest",
  WAITING: "border-sky-200 bg-sky-50 text-sky-700",
  SUSPENDED: "border-orange-200 bg-orange-50 text-orange-700",
  COMPLETED: "border-ink/10 bg-mist text-slate",
  WITHDRAWN: "border-red-200 bg-red-50 text-red-700",
  CANCELLED: "border-ink/10 bg-mist text-slate",
};

const COURSE_TYPE_LABEL: Record<CourseType, string> = {
  COMPREHENSIVE: "종합반",
  SPECIAL_LECTURE: "특강",
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatAmount(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

// ─── Data fetching ─────────────────────────────────────────────────────────────

async function fetchPaymentSummary(examNumber: string) {
  const prisma = getPrisma();
  const now = new Date();

  const [enrollments, payments, activePaymentLinks] = await Promise.all([
    // All enrollments to show per-enrollment outstanding
    prisma.courseEnrollment.findMany({
      where: { examNumber },
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        courseType: true,
        finalFee: true,
        status: true,
        startDate: true,
        endDate: true,
        product: {
          select: { id: true, name: true },
        },
        cohort: {
          select: { id: true, name: true },
        },
        specialLecture: {
          select: { id: true, name: true },
        },
      },
    }),
    // All payments (approved / partial refunded / fully refunded)
    prisma.payment.findMany({
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
    }),
    // Active payment links assigned to this student
    prisma.paymentLink.findMany({
      where: {
        examNumber,
        status: LinkStatus.ACTIVE,
        expiresAt: { gt: now },
      },
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        token: true,
        title: true,
        finalAmount: true,
        expiresAt: true,
        note: true,
      },
    }),
  ]);

  // Calculate total paid and total refunded from approved payments
  const approvedPayments = payments.filter(
    (p) =>
      p.status === PaymentStatus.APPROVED ||
      p.status === PaymentStatus.PARTIAL_REFUNDED ||
      p.status === PaymentStatus.FULLY_REFUNDED,
  );

  const totalPaid = approvedPayments.reduce((sum, p) => sum + p.grossAmount, 0);

  const totalRefunded = payments.flatMap((p) => p.refunds).reduce((sum, r) => {
    if (r.status === RefundStatus.COMPLETED || r.status === RefundStatus.APPROVED) {
      return sum + r.amount;
    }
    return sum;
  }, 0);
  // Calculate outstanding installments
  const unpaidInstallments = payments.flatMap((p) =>
    p.installments.filter((inst) => inst.paidAt === null),
  );
  const outstandingInstallmentTotal = unpaidInstallments.reduce(
    (sum, inst) => sum + inst.amount,
    0,
  );

  // Build per-enrollment payment summary
  // Map enrollmentId → paid amount from payments
  const paidByEnrollment: Record<string, number> = {};
  for (const payment of approvedPayments) {
    if (payment.enrollmentId) {
      const refundedForPayment = payment.refunds
        .filter((r) => r.status === RefundStatus.COMPLETED || r.status === RefundStatus.APPROVED)
        .reduce((sum, r) => sum + r.amount, 0);
      paidByEnrollment[payment.enrollmentId] =
        (paidByEnrollment[payment.enrollmentId] ?? 0) + payment.grossAmount - refundedForPayment;
    }
  }

  return {
    enrollments,
    payments,
    activePaymentLinks,
    totalPaid,
    totalRefunded,
    outstandingInstallmentTotal,
    unpaidInstallments,
    paidByEnrollment,
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function StudentPaymentsPage() {
  if (!hasDatabaseConfig()) {
    return (
      <main className="space-y-6 px-0 py-6">
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
            Payments Unavailable
          </div>
          <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
            수납 내역은 DB 연결 후 사용할 수 있습니다.
          </h1>
          <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
            현재 환경에는 수납 데이터를 불러올 데이터베이스가 연결되어 있지 않습니다.
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
      </main>
    );
  }

  const viewer = await getStudentPortalViewer();

  if (!viewer) {
    return (
      <main className="space-y-6 px-0 py-6">
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            수납 내역
          </div>
          <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
            수납 내역은 로그인 후 확인할 수 있습니다.
          </h1>
          <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
            학생 포털에 로그인하면 미납금과 납부 현황을 확인할 수 있습니다.
          </p>
        </section>

        <StudentLookupForm redirectPath="/student/payments" />
      </main>
    );
  }

  const branding = await getAcademyRuntimeBranding(viewer.academyId ?? undefined);

  const {
    enrollments,
    activePaymentLinks,
    totalPaid,
    totalRefunded,
    outstandingInstallmentTotal,
    unpaidInstallments,
    paidByEnrollment,
  } = await fetchPaymentSummary(viewer.examNumber);

  const totalFee = enrollments
    .filter(
      (e) =>
        e.status === EnrollmentStatus.ACTIVE ||
        e.status === EnrollmentStatus.SUSPENDED ||
        e.status === EnrollmentStatus.PENDING,
    )
    .reduce((sum, e) => sum + e.finalFee, 0);

  const netPaid = totalPaid - totalRefunded;

  // Active enrollments for the per-enrollment breakdown
  const activeEnrollments = enrollments.filter(
    (e) =>
      e.status === EnrollmentStatus.ACTIVE ||
      e.status === EnrollmentStatus.SUSPENDED ||
      e.status === EnrollmentStatus.PENDING ||
      e.status === EnrollmentStatus.WAITING,
  );

  const pastEnrollments = enrollments.filter(
    (e) =>
      e.status === EnrollmentStatus.COMPLETED ||
      e.status === EnrollmentStatus.WITHDRAWN ||
      e.status === EnrollmentStatus.CANCELLED,
  );

  return (
    <main className="space-y-6 px-0 py-6">

      {/* ── Header ── */}
      <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
              Payments
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              수납 내역
            </h1>
            <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
              수강료 미납금과 납부 현황을 확인할 수 있습니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/student"
              className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
            >
              포털로 돌아가기
            </Link>
            <Link
              href="/student/payment-schedule"
              className="inline-flex items-center rounded-full border border-ember/20 bg-ember/5 px-5 py-3 text-sm font-semibold text-ember transition hover:bg-ember/10"
            >
              납부 일정
            </Link>
            <Link
              href="/student/payment-history"
              className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
            >
              납부 이력 전체 보기
            </Link>
          </div>
        </div>

        {/* KPI cards */}
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
            <p className="text-sm text-slate">수강료 합계</p>
            <p className="mt-3 text-2xl font-bold text-ink">
              {formatAmount(totalFee)}
            </p>
          </article>
          <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
            <p className="text-sm text-slate">납부 완료</p>
            <p className="mt-3 text-2xl font-bold text-forest">
              {formatAmount(netPaid)}
            </p>
          </article>
          <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
            <p className="text-sm text-slate">미납금</p>
            <p
              className={`mt-3 text-2xl font-bold ${outstandingInstallmentTotal > 0 ? "text-amber-600" : "text-forest"}`}
            >
              {formatAmount(outstandingInstallmentTotal)}
            </p>
          </article>
          <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
            <p className="text-sm text-slate">결제 링크</p>
            <p className="mt-3 text-2xl font-bold text-ember">
              {activePaymentLinks.length}건
            </p>
          </article>
        </div>
      </section>

      {/* ── 미납 분납 알림 ── */}
      {unpaidInstallments.length > 0 && (
        <section className="rounded-[28px] border border-amber-200 bg-amber-50 p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-3">
            <svg className="h-5 w-5 text-amber-600 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <div>
              <p className="text-sm font-semibold text-amber-800">
                미납 분납 {unpaidInstallments.length}건 — 총 {formatAmount(outstandingInstallmentTotal)}
              </p>
              <p className="mt-1 text-xs text-amber-700">
                납부 예정일이 지난 회차가 있을 수 있습니다. 학원에 문의해 주세요.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* ── 결제 링크 ── */}
      {activePaymentLinks.length > 0 && (
        <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">
                Payment Links
              </p>
              <h2 className="mt-1 text-xl font-semibold">결제 링크</h2>
            </div>
            <span className="inline-flex rounded-full border border-ember/30 bg-ember/10 px-3 py-1 text-xs font-semibold text-ember">
              {activePaymentLinks.length}건 활성
            </span>
          </div>

          <div className="flex flex-col gap-3">
            {activePaymentLinks.map((link) => (
              <article
                key={link.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-[20px] border border-ember/20 bg-ember/5 px-5 py-4"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-semibold text-ink">{link.title}</p>
                  <p className="text-xl font-bold text-ember">
                    {formatAmount(link.finalAmount)}
                  </p>
                  {link.note && (
                    <p className="text-xs text-slate">{link.note}</p>
                  )}
                  <p className="text-xs text-slate">
                    만료: {formatDate(link.expiresAt)}
                  </p>
                </div>
                <a
                  href={`/pay/${link.token}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center rounded-xl border border-ember/30 bg-ember px-4 py-2 text-sm font-semibold text-white transition hover:bg-ember/90"
                >
                  결제하기
                </a>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* ── 수강별 납부 현황 (현재 수강) ── */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">
              Enrollment Breakdown
            </p>
            <h2 className="mt-1 text-xl font-semibold">수강별 납부 현황</h2>
          </div>
          <span className="inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold text-slate">
            {activeEnrollments.length}건
          </span>
        </div>

        {activeEnrollments.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-ink/10 px-5 py-8 text-center">
            <p className="text-sm font-semibold text-ink">현재 수강 중인 과정이 없습니다</p>
            <p className="mt-2 text-sm text-slate">
              수강 등록 문의는 학원으로 연락해 주세요.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {activeEnrollments.map((enrollment) => {
              const courseName =
                enrollment.product?.name ??
                enrollment.cohort?.name ??
                enrollment.specialLecture?.name ??
                "강좌";
              const paid = paidByEnrollment[enrollment.id] ?? 0;
              const outstanding = Math.max(0, enrollment.finalFee - paid);

              return (
                <article
                  key={enrollment.id}
                  className="rounded-[20px] border border-ink/10 px-5 py-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-ink">
                          {courseName}
                        </span>
                        <span className="inline-flex rounded-full border border-ink/10 bg-mist px-2 py-0.5 text-[10px] font-semibold text-slate">
                          {COURSE_TYPE_LABEL[enrollment.courseType]}
                        </span>
                      </div>
                      {enrollment.cohort && (
                        <p className="mt-0.5 text-xs text-slate">
                          기수: {enrollment.cohort.name}
                        </p>
                      )}
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${ENROLLMENT_STATUS_COLOR[enrollment.status]}`}
                    >
                      {ENROLLMENT_STATUS_LABEL[enrollment.status]}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-3">
                    <div className="rounded-[16px] border border-ink/10 bg-mist px-3 py-2">
                      <p className="text-[10px] text-slate">수강료</p>
                      <p className="mt-1 text-sm font-semibold text-ink">
                        {formatAmount(enrollment.finalFee)}
                      </p>
                    </div>
                    <div className="rounded-[16px] border border-forest/20 bg-forest/5 px-3 py-2">
                      <p className="text-[10px] text-slate">납부</p>
                      <p className="mt-1 text-sm font-semibold text-forest">
                        {formatAmount(paid)}
                      </p>
                    </div>
                    <div
                      className={`rounded-[16px] border px-3 py-2 ${outstanding > 0 ? "border-amber-200 bg-amber-50" : "border-ink/10 bg-mist"}`}
                    >
                      <p className="text-[10px] text-slate">미납</p>
                      <p
                        className={`mt-1 text-sm font-semibold ${outstanding > 0 ? "text-amber-700" : "text-slate"}`}
                      >
                        {formatAmount(outstanding)}
                      </p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* ── 미납 분납 일정 ── */}
      {unpaidInstallments.length > 0 && (
        <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
          <div className="mb-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">
              Installments
            </p>
            <h2 className="mt-1 text-xl font-semibold">미납 분납 일정</h2>
          </div>
          <div className="overflow-hidden rounded-[24px] border border-ink/10">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <thead className="bg-mist/80 text-left">
                <tr>
                  <th className="px-4 py-3 font-semibold">회차</th>
                  <th className="px-4 py-3 font-semibold">납부 예정일</th>
                  <th className="px-4 py-3 font-semibold">금액</th>
                  <th className="px-4 py-3 font-semibold">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {unpaidInstallments.map((inst) => {
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const isOverdue =
                    inst.dueDate !== null &&
                    new Date(inst.dueDate).setHours(0, 0, 0, 0) < today.getTime();
                  return (
                    <tr key={inst.id}>
                      <td className="px-4 py-3 font-medium">{inst.seq}회차</td>
                      <td className="px-4 py-3">
                        {inst.dueDate ? formatDate(inst.dueDate) : "-"}
                      </td>
                      <td className="px-4 py-3 font-semibold">
                        {formatAmount(inst.amount)}
                      </td>
                      <td className="px-4 py-3">
                        {isOverdue ? (
                          <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">
                            연체
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                            미납
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            {branding.phoneHref ? (
              <a
                href={branding.phoneHref}
                className="inline-flex items-center rounded-full border border-ink/10 bg-mist px-5 py-3 text-sm font-semibold text-ink transition hover:border-ember/30 hover:text-ember"
              >
                납부 문의: {branding.phone}
              </a>
            ) : null}
          </div>
        </section>
      )}

      {/* ── 종료된 수강 ── */}
      {pastEnrollments.length > 0 && (
        <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">
                Past Enrollments
              </p>
              <h2 className="mt-1 text-xl font-semibold">종료된 수강</h2>
            </div>
            <span className="inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold text-slate">
              {pastEnrollments.length}건
            </span>
          </div>

          <div className="flex flex-col gap-2">
            {pastEnrollments.map((enrollment) => {
              const courseName =
                enrollment.product?.name ??
                enrollment.cohort?.name ??
                enrollment.specialLecture?.name ??
                "강좌";
              const paid = paidByEnrollment[enrollment.id] ?? 0;

              return (
                <article
                  key={enrollment.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-ink/10 bg-mist/60 px-5 py-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-ink">{courseName}</span>
                      <span className="inline-flex rounded-full border border-ink/10 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate">
                        {COURSE_TYPE_LABEL[enrollment.courseType]}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate">
                      수강료 {formatAmount(enrollment.finalFee)} · 납부 {formatAmount(paid)}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${ENROLLMENT_STATUS_COLOR[enrollment.status]}`}
                  >
                    {ENROLLMENT_STATUS_LABEL[enrollment.status]}
                  </span>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* ── 문의 ── */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
        <h2 className="text-lg font-semibold">납부 문의</h2>
        <div className="mt-4 space-y-3 text-sm text-slate">
          <p>수강료 납부 및 환불 관련 문의는 학원 직원에게 연락해 주세요.</p>
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
        </div>
      </section>

    </main>
  );
}
