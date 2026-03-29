import Link from "next/link";
import {
  CourseType,
  EnrollmentStatus,
  LinkStatus,
  PaymentMethod,
  PaymentStatus,
  RefundStatus,
} from "@prisma/client";
import QRCode from "qrcode";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import {
  EnrollmentDetailCard,
  type EnrollmentDetail,
} from "@/components/student-portal/enrollment-detail-card";
import { getAcademyRuntimeBranding } from "@/lib/academy-branding";
import { hasDatabaseConfig } from "@/lib/env";
import { formatDate, formatDateWithWeekday } from "@/lib/format";
import { getPrisma } from "@/lib/prisma";
import { getStudentPortalViewer } from "@/lib/student-portal/service";

export const dynamic = "force-dynamic";

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

const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "현금",
  CARD: "카드",
  TRANSFER: "계좌이체",
  POINT: "포인트",
  MIXED: "혼합",
};

const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  PENDING: "처리 중",
  APPROVED: "승인",
  PARTIAL_REFUNDED: "부분 환불",
  FULLY_REFUNDED: "전액 환불",
  CANCELLED: "취소",
};

const COURSE_TYPE_LABEL: Record<CourseType, string> = {
  COMPREHENSIVE: "종합반",
  SPECIAL_LECTURE: "특강",
};

const REFUND_STATUS_LABEL: Record<RefundStatus, string> = {
  PENDING: "검토 중",
  APPROVED: "승인",
  REJECTED: "거절",
  COMPLETED: "환불 완료",
  CANCELLED: "취소",
};

// ─── Helpers ────────────────────────────────────────────────────────────────────

function formatAmount(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function generateQrDataUrl(examNumber: string): Promise<string> {
  return QRCode.toDataURL(`STUDENT:${examNumber}`, {
    width: 180,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#1F4D3A", light: "#FFFFFF" },
  });
}

// ─── Data fetching ──────────────────────────────────────────────────────────────

async function fetchEnrollmentData(examNumber: string) {
  const prisma = getPrisma();

  // Fetch all enrollments for the student, most recent first
  const enrollments = await prisma.courseEnrollment.findMany({
    where: { examNumber },
    orderBy: [{ createdAt: "desc" }],
    include: {
      product: {
        select: { id: true, name: true, examCategory: true, durationMonths: true },
      },
      cohort: {
        select: { id: true, name: true, startDate: true, endDate: true },
      },
      specialLecture: {
        select: { id: true, name: true, startDate: true, endDate: true },
      },
    },
  });

  if (enrollments.length === 0) {
    return null;
  }

  // Pick most recent ACTIVE enrollment, fallback to most recent overall
  const primary =
    enrollments.find((e) => e.status === EnrollmentStatus.ACTIVE) ??
    enrollments[0];

  // Fetch payments + contract + active payment links in parallel
  const now = new Date();
  const [payments, contract, activePaymentLinks] = await Promise.all([
    prisma.payment.findMany({
      where: { examNumber },
      orderBy: [{ processedAt: "desc" }],
      include: {
        items: {
          select: { id: true, itemName: true, unitPrice: true, quantity: true, amount: true },
        },
        installments: {
          orderBy: [{ seq: "asc" }],
          select: { id: true, seq: true, amount: true, dueDate: true, paidAt: true },
        },
        refunds: {
          orderBy: [{ processedAt: "desc" }],
          select: {
            id: true,
            amount: true,
            reason: true,
            status: true,
            processedAt: true,
          },
        },
      },
    }),
    prisma.courseContract.findUnique({
      where: { enrollmentId: primary.id },
      select: { issuedAt: true, printedAt: true },
    }),
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

  return {
    primary,
    allEnrollments: enrollments,
    payments,
    activePaymentLinks,
    contract: contract
      ? {
          issuedAt: contract.issuedAt,
          printedAt: contract.printedAt,
        }
      : null,
  };
}

// ─── Page ───────────────────────────────────────────────────────────────────────

export default async function StudentEnrollmentPage() {
  if (!hasDatabaseConfig()) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
              Student Enrollment Unavailable
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              수강 정보는 DB 연결 후 사용할 수 있습니다.
            </h1>
            <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
              현재 환경에는 수강 데이터를 불러올 데이터베이스가 연결되어 있지 않습니다.
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
              Student Enrollment Login
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              수강 정보는 로그인 후 확인할 수 있습니다.
            </h1>
            <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
              학생 포털에 로그인하면 수강 등록 현황과 납부 내역을 확인할 수 있습니다.
            </p>
          </section>

          <StudentLookupForm redirectPath="/student/enrollment" />
        </div>
      </main>
    );
  }

  const [result, qrDataUrl] = await Promise.all([
    fetchEnrollmentData(viewer.examNumber),
    generateQrDataUrl(viewer.examNumber),
  ]);

  // Compute next upcoming unpaid installment across all payments
  const nextInstallment = result?.payments
    .flatMap((p) => p.installments.filter((inst) => inst.paidAt === null))
    .sort((a, b) => {
      const da = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const db = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      return da - db;
    })[0] ?? null;

  const branding = await getAcademyRuntimeBranding(viewer.academyId ?? undefined);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const nextDueDaysLeft = nextInstallment?.dueDate
    ? Math.ceil(
        (new Date(nextInstallment.dueDate).setHours(0, 0, 0, 0) - today.getTime()) /
          (1000 * 60 * 60 * 24),
      )
    : null;

  return (
    <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* ── Header ── */}
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
                Student Enrollment
              </div>
              <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
                {viewer.name}의 수강 정보
              </h1>
              <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
                현재 수강 중인 과정과 납부 내역을 확인할 수 있습니다.
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
                href="/student/scores"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                성적 카드 보기
              </Link>
              <Link
                href="/student/payment-history"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                납부 이력 전체 보기
              </Link>
              <Link
                href="/student/contract"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                수강계약서 보기
              </Link>
              <Link
                href="/student/enrollment/certificate"
                className="inline-flex items-center rounded-full border border-forest/30 bg-forest/5 px-5 py-3 text-sm font-semibold text-forest transition hover:bg-forest/10"
              >
                수강확인서 출력
              </Link>
            </div>
          </div>

          {/* KPI cards */}
          {result ? (
            <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
                <p className="text-sm text-slate">수강 상태</p>
                <span
                  className={`mt-3 inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${ENROLLMENT_STATUS_COLOR[result.primary.status]}`}
                >
                  {ENROLLMENT_STATUS_LABEL[result.primary.status]}
                </span>
              </article>
              <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
                <p className="text-sm text-slate">과정명</p>
                <p className="mt-3 text-xl font-semibold">
                  {COURSE_TYPE_LABEL[result.primary.courseType]}
                  {result.primary.product
                    ? ` · ${result.primary.product.name}`
                    : result.primary.specialLecture
                      ? ` · ${result.primary.specialLecture.name}`
                      : ""}
                </p>
              </article>
              <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
                <p className="text-sm text-slate">기수</p>
                <p className="mt-3 text-xl font-semibold">
                  {result.primary.cohort?.name ?? "없음"}
                </p>
              </article>
              <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
                <p className="text-sm text-slate">등록일</p>
                <p className="mt-3 text-xl font-semibold">
                  {formatDateWithWeekday(result.primary.createdAt)}
                </p>
              </article>
            </div>
          ) : (
            <div className="mt-8 rounded-[24px] border border-dashed border-ink/10 p-8 text-sm text-slate">
              등록된 수강 정보가 없습니다.
            </div>
          )}
        </section>

        {/* ── 다음 분납 알림 배너 ── */}
        {nextInstallment && (
          <div
            className={`flex items-start gap-4 rounded-[24px] border px-5 py-4 ${
              nextDueDaysLeft !== null && nextDueDaysLeft <= 3
                ? "border-red-200 bg-red-50"
                : nextDueDaysLeft !== null && nextDueDaysLeft <= 7
                  ? "border-amber-200 bg-amber-50"
                  : "border-forest/20 bg-forest/5"
            }`}
          >
            <div
              className={`mt-0.5 flex-shrink-0 ${
                nextDueDaysLeft !== null && nextDueDaysLeft <= 3
                  ? "text-red-600"
                  : nextDueDaysLeft !== null && nextDueDaysLeft <= 7
                    ? "text-amber-600"
                    : "text-forest"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="flex-1 text-sm">
              <p
                className={`font-semibold ${
                  nextDueDaysLeft !== null && nextDueDaysLeft <= 3
                    ? "text-red-700"
                    : nextDueDaysLeft !== null && nextDueDaysLeft <= 7
                      ? "text-amber-700"
                      : "text-forest"
                }`}
              >
                다음 분납 예정
                {nextDueDaysLeft !== null && (
                  <span className="ml-2">
                    {nextDueDaysLeft === 0
                      ? "(오늘 마감)"
                      : nextDueDaysLeft < 0
                        ? `(${Math.abs(nextDueDaysLeft)}일 경과)`
                        : `(${nextDueDaysLeft}일 후)`}
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-slate">
                {formatDate(nextInstallment.dueDate)}까지{" "}
                <strong>{formatAmount(nextInstallment.amount)}</strong>{" "}
                납부 예정 ({nextInstallment.seq}회차)
              </p>
            </div>
          </div>
        )}

        {/* ── 미납 결제 링크 ── */}
        {result && result.activePaymentLinks.length > 0 && (
          <section className="rounded-[28px] border border-ember/20 bg-ember/5 p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-ember/15 text-ember">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                  <path fillRule="evenodd" d="M1 4a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4Zm12 4a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM4 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm13-1a1 1 0 1 0-2 0 1 1 0 0 0 2 0Z" clipRule="evenodd" />
                  <path d="M3 13.5A2.5 2.5 0 0 1 .5 11V9h.757a3.498 3.498 0 0 0 6.486 0h4.514a3.498 3.498 0 0 0 6.486 0H19v2a2.5 2.5 0 0 1-2.5 2.5h-13Z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-ember">미납 결제 링크</h2>
                <p className="text-xs text-ember/70">담당 직원이 발송한 결제 링크입니다. 기한 내 납부해 주세요.</p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {result.activePaymentLinks.map((link) => {
                const msLeft = new Date(link.expiresAt).getTime() - Date.now();
                const hoursLeft = Math.floor(msLeft / (1000 * 60 * 60));
                const daysLeft = Math.floor(hoursLeft / 24);
                const expiryLabel =
                  msLeft <= 0
                    ? "만료됨"
                    : daysLeft >= 2
                    ? `${daysLeft}일 후 만료`
                    : daysLeft === 1
                    ? "내일 만료"
                    : hoursLeft > 0
                    ? `${hoursLeft}시간 후 만료`
                    : "곧 만료";
                const expiryUrgent = daysLeft < 2 && msLeft > 0;

                return (
                  <div
                    key={link.id}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-[20px] border border-ember/20 bg-white px-5 py-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-ink">{link.title}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <span className="text-lg font-bold text-ember">
                          {link.finalAmount.toLocaleString("ko-KR")}원
                        </span>
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${
                            expiryUrgent
                              ? "border-red-200 bg-red-50 text-red-700"
                              : "border-amber-200 bg-amber-50 text-amber-700"
                          }`}
                        >
                          {expiryLabel}
                        </span>
                      </div>
                      {link.note && (
                        <p className="mt-1 text-xs text-slate">{link.note}</p>
                      )}
                    </div>
                    <Link
                      href={`/pay/${link.token}`}
                      className="inline-flex flex-shrink-0 items-center gap-2 rounded-full bg-ember px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-ember/90"
                    >
                      결제하기
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                        <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
                      </svg>
                    </Link>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── 수강증 QR 카드 ── */}
        {result && (
          <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-forest">
                  Enrollment Card
                </p>
                <h2 className="mt-1 text-xl font-semibold">모바일 수강증</h2>
              </div>
            </div>

            <div className="mt-5 flex flex-col items-center gap-5 sm:flex-row sm:items-start">
              {/* QR 코드 */}
              <div className="flex-shrink-0 rounded-[20px] border border-ink/10 bg-mist p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrDataUrl}
                  alt={`${viewer.name} 수강증 QR`}
                  width={140}
                  height={140}
                  className="block"
                />
                <p className="mt-2 text-center text-[11px] text-slate">수강증 확인용 QR</p>
              </div>

              {/* 카드 정보 */}
              <div className="flex-1 min-w-0">
                <div className="overflow-hidden rounded-[20px] border border-forest/20 bg-forest/5">
                  {/* 카드 헤더 */}
                  <div className="bg-forest px-5 py-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/60">
                      {branding.academyName}
                    </p>
                    <p className="mt-0.5 text-lg font-bold text-white">수 강 증</p>
                  </div>
                  {/* 카드 바디 */}
                  <dl className="divide-y divide-forest/10 px-5 text-sm">
                    <div className="flex items-center justify-between gap-4 py-3">
                      <dt className="text-slate">이름</dt>
                      <dd className="font-bold text-ink">{viewer.name}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-4 py-3">
                      <dt className="text-slate">학번</dt>
                      <dd className="font-semibold text-ember">{viewer.examNumber}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-4 py-3">
                      <dt className="text-slate">과정</dt>
                      <dd className="max-w-[160px] text-right font-semibold leading-snug text-ink">
                        {COURSE_TYPE_LABEL[result.primary.courseType]}
                        {result.primary.product
                          ? ` · ${result.primary.product.name}`
                          : result.primary.specialLecture
                            ? ` · ${result.primary.specialLecture.name}`
                            : ""}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-4 py-3">
                      <dt className="text-slate">상태</dt>
                      <dd>
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${ENROLLMENT_STATUS_COLOR[result.primary.status]}`}
                        >
                          {ENROLLMENT_STATUS_LABEL[result.primary.status]}
                        </span>
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-4 py-3">
                      <dt className="text-slate">수강 기간</dt>
                      <dd className="text-right text-xs font-semibold text-ink">
                        {formatDate(result.primary.startDate)}
                        {result.primary.endDate
                          ? ` ~ ${formatDate(result.primary.endDate)}`
                          : ""}
                      </dd>
                    </div>
                  </dl>
                  <div className="px-5 py-3 text-center text-[10px] text-slate/60">
                    본 수강증은 본인만 사용 가능합니다
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {result && (
          <>
            {/* ── Payment summary ── */}
            {(() => {
              const approvedPayments = result.payments.filter(
                (p) => p.status === PaymentStatus.APPROVED || p.status === PaymentStatus.PARTIAL_REFUNDED
              );
              const totalPaid = approvedPayments.reduce((sum, p) => sum + p.netAmount, 0);
              const lastPayment = approvedPayments[0]; // already ordered desc
              const unpaidInstallments = result.payments.flatMap((p) =>
                p.installments.filter((inst) => inst.paidAt === null)
              );
              const outstandingTotal = unpaidInstallments.reduce(
                (sum, inst) => sum + inst.amount,
                0
              );
              return (
                <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
                  <h2 className="text-xl font-semibold">수납 현황 요약</h2>

                  <div className="mt-5 grid gap-4 sm:grid-cols-3">
                    <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
                      <p className="text-sm text-slate">총 납부 금액</p>
                      <p className="mt-3 text-2xl font-bold text-forest">
                        {formatAmount(totalPaid)}
                      </p>
                    </article>
                    <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
                      <p className="text-sm text-slate">잔여 납부 예정</p>
                      <p
                        className={`mt-3 text-2xl font-bold ${outstandingTotal > 0 ? "text-amber-600" : "text-forest"}`}
                      >
                        {formatAmount(outstandingTotal)}
                      </p>
                    </article>
                    <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
                      <p className="text-sm text-slate">최근 납부일</p>
                      <p className="mt-3 text-xl font-semibold">
                        {lastPayment
                          ? formatDateWithWeekday(lastPayment.processedAt)
                          : "—"}
                      </p>
                    </article>
                  </div>

                  {unpaidInstallments.length > 0 ? (
                    <div className="mt-5">
                      <p className="text-sm font-semibold text-slate">미납 분할납부</p>
                      <div className="mt-3 overflow-hidden rounded-[24px] border border-ink/10">
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
                            {unpaidInstallments.map((inst) => (
                              <tr key={inst.id}>
                                <td className="px-4 py-3 font-medium">{inst.seq}회차</td>
                                <td className="px-4 py-3">
                                  {formatDateWithWeekday(inst.dueDate)}
                                </td>
                                <td className="px-4 py-3 font-semibold">
                                  {formatAmount(inst.amount)}
                                </td>
                                <td className="px-4 py-3">
                                  <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                                    미납
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-5 rounded-[24px] border border-forest/20 bg-forest/5 px-5 py-4 text-sm font-medium text-forest">
                      미납 분할납부 없음
                    </div>
                  )}
                </section>
              );
            })()}

            {/* ── Enrollment detail ── */}
            <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
              <h2 className="text-xl font-semibold">수강 등록 상세</h2>
              <p className="mt-2 text-sm leading-7 text-slate">
                현재 수강 중인 과정의 세부 정보와 수강료 내역입니다.
              </p>

              <div className="mt-6 space-y-4">
                <div className="overflow-hidden rounded-[24px] border border-ink/10">
                  <dl className="divide-y divide-ink/10 text-sm">
                    <div className="flex items-start justify-between gap-4 px-5 py-4">
                      <dt className="min-w-[120px] font-medium text-slate">과정 유형</dt>
                      <dd className="text-right font-semibold">
                        {COURSE_TYPE_LABEL[result.primary.courseType]}
                      </dd>
                    </div>
                    {result.primary.product && (
                      <div className="flex items-start justify-between gap-4 px-5 py-4">
                        <dt className="min-w-[120px] font-medium text-slate">상품명</dt>
                        <dd className="text-right font-semibold">{result.primary.product.name}</dd>
                      </div>
                    )}
                    {result.primary.specialLecture && (
                      <div className="flex items-start justify-between gap-4 px-5 py-4">
                        <dt className="min-w-[120px] font-medium text-slate">특강명</dt>
                        <dd className="text-right font-semibold">
                          {result.primary.specialLecture.name}
                        </dd>
                      </div>
                    )}
                    {result.primary.cohort && (
                      <div className="flex items-start justify-between gap-4 px-5 py-4">
                        <dt className="min-w-[120px] font-medium text-slate">기수</dt>
                        <dd className="text-right font-semibold">
                          {result.primary.cohort.name}
                        </dd>
                      </div>
                    )}
                    <div className="flex items-start justify-between gap-4 px-5 py-4">
                      <dt className="min-w-[120px] font-medium text-slate">수강 상태</dt>
                      <dd className="text-right">
                        <span
                          className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${ENROLLMENT_STATUS_COLOR[result.primary.status]}`}
                        >
                          {ENROLLMENT_STATUS_LABEL[result.primary.status]}
                        </span>
                      </dd>
                    </div>
                    <div className="flex items-start justify-between gap-4 px-5 py-4">
                      <dt className="min-w-[120px] font-medium text-slate">등록일</dt>
                      <dd className="text-right font-semibold">
                        {formatDateWithWeekday(result.primary.createdAt)}
                      </dd>
                    </div>
                    {result.contract && (
                      <div className="flex items-start justify-between gap-4 px-5 py-4">
                        <dt className="min-w-[120px] font-medium text-slate">계약서 서명</dt>
                        <dd className="text-right">
                          <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold text-forest">
                            서명 완료 · {formatDateWithWeekday(result.contract.issuedAt)}
                          </span>
                          {result.contract.printedAt && (
                            <p className="mt-1 text-xs text-slate">
                              출력일: {formatDate(result.contract.printedAt)}
                            </p>
                          )}
                        </dd>
                      </div>
                    )}
                    <div className="flex items-start justify-between gap-4 px-5 py-4">
                      <dt className="min-w-[120px] font-medium text-slate">수강 시작일</dt>
                      <dd className="text-right font-semibold">
                        {formatDateWithWeekday(result.primary.startDate)}
                      </dd>
                    </div>
                    {result.primary.endDate && (
                      <div className="flex items-start justify-between gap-4 px-5 py-4">
                        <dt className="min-w-[120px] font-medium text-slate">수강 종료일</dt>
                        <dd className="text-right font-semibold">
                          {formatDateWithWeekday(result.primary.endDate)}
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>

                {/* Fee breakdown */}
                <div className="overflow-hidden rounded-[24px] border border-ink/10">
                  <div className="bg-mist/50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate">
                    수강료 내역
                  </div>
                  <dl className="divide-y divide-ink/10 text-sm">
                    <div className="flex items-start justify-between gap-4 px-5 py-4">
                      <dt className="min-w-[120px] font-medium text-slate">정가</dt>
                      <dd className="text-right font-semibold">
                        {formatAmount(result.primary.regularFee)}
                      </dd>
                    </div>
                    <div className="flex items-start justify-between gap-4 px-5 py-4">
                      <dt className="min-w-[120px] font-medium text-slate">할인액</dt>
                      <dd className="text-right font-semibold text-ember">
                        {result.primary.discountAmount > 0
                          ? `- ${formatAmount(result.primary.discountAmount)}`
                          : "없음"}
                      </dd>
                    </div>
                    <div className="flex items-start justify-between gap-4 bg-forest/5 px-5 py-4">
                      <dt className="min-w-[120px] font-semibold">최종 수강료</dt>
                      <dd className="text-right text-lg font-bold text-forest">
                        {formatAmount(result.primary.finalFee)}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            </section>

            {/* ── Payment section ── */}
            {result.payments.length > 0 && (
              <>
                {/* Installments (if any) */}
                {result.payments.some((p) => p.installments.length > 0) && (
                  <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
                    <h2 className="text-xl font-semibold">분할 납부 일정</h2>
                    <p className="mt-2 text-sm leading-7 text-slate">
                      회차별 납부 예정일과 납부 여부를 확인할 수 있습니다.
                    </p>

                    {result.payments
                      .filter((p) => p.installments.length > 0)
                      .map((payment) => (
                        <div key={payment.id} className="mt-6">
                          <div className="mb-3 flex items-center gap-3">
                            <span className="text-sm font-semibold">
                              {formatDateWithWeekday(payment.processedAt)} 수납
                            </span>
                            <span className="rounded-full border border-ink/10 bg-mist px-2 py-1 text-xs text-slate">
                              {PAYMENT_METHOD_LABEL[payment.method]}
                            </span>
                          </div>
                          <div className="overflow-x-auto rounded-[24px] border border-ink/10">
                            <table className="min-w-full divide-y divide-ink/10 text-sm">
                              <thead className="bg-mist/80 text-left">
                                <tr>
                                  <th className="px-4 py-3 font-semibold">회차</th>
                                  <th className="px-4 py-3 font-semibold">납부 예정일</th>
                                  <th className="px-4 py-3 font-semibold">금액</th>
                                  <th className="px-4 py-3 font-semibold">납부 여부</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-ink/10">
                                {payment.installments.map((inst) => (
                                  <tr key={inst.id}>
                                    <td className="px-4 py-3 font-medium">{inst.seq}회</td>
                                    <td className="px-4 py-3">
                                      {formatDateWithWeekday(inst.dueDate)}
                                    </td>
                                    <td className="px-4 py-3 font-semibold">
                                      {formatAmount(inst.amount)}
                                    </td>
                                    <td className="px-4 py-3">
                                      {inst.paidAt ? (
                                        <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-2 py-1 text-xs font-semibold text-forest">
                                          납부 완료
                                        </span>
                                      ) : (
                                        <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                                          미납
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                  </section>
                )}

                {/* Payment history */}
                <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
                  <h2 className="text-xl font-semibold">납부 내역</h2>
                  <p className="mt-2 text-sm leading-7 text-slate">
                    수납된 결제 내역과 환불 이력을 확인할 수 있습니다.
                  </p>

                  <div className="mt-6 space-y-4">
                    {result.payments.map((payment) => (
                      <article
                        key={payment.id}
                        className="rounded-[24px] border border-ink/10 p-5"
                      >
                        {/* Payment header */}
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold text-slate">
                                {formatDateWithWeekday(payment.processedAt)}
                              </span>
                              <span className="inline-flex rounded-full border border-ink/10 bg-white px-3 py-1 text-xs font-semibold text-slate">
                                {PAYMENT_METHOD_LABEL[payment.method]}
                              </span>
                              <span className="inline-flex rounded-full border border-ink/10 bg-white px-3 py-1 text-xs font-semibold text-slate">
                                {PAYMENT_STATUS_LABEL[payment.status]}
                              </span>
                            </div>
                            <p className="mt-3 text-2xl font-bold">
                              {formatAmount(payment.netAmount)}
                            </p>
                          </div>
                        </div>

                        {/* Payment items */}
                        {payment.items.length > 0 && (
                          <div className="mt-4 overflow-x-auto rounded-[20px] border border-ink/10">
                            <table className="min-w-full divide-y divide-ink/10 text-sm">
                              <thead className="bg-mist/80 text-left">
                                <tr>
                                  <th className="px-4 py-3 font-semibold">항목</th>
                                  <th className="px-4 py-3 font-semibold">단가</th>
                                  <th className="px-4 py-3 font-semibold">수량</th>
                                  <th className="px-4 py-3 font-semibold">금액</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-ink/10">
                                {payment.items.map((item) => (
                                  <tr key={item.id}>
                                    <td className="px-4 py-3">{item.itemName}</td>
                                    <td className="px-4 py-3">{formatAmount(item.unitPrice)}</td>
                                    <td className="px-4 py-3">{item.quantity}</td>
                                    <td className="px-4 py-3 font-semibold">
                                      {formatAmount(item.amount)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* Discount/point summary if applied */}
                        {(payment.discountAmount > 0 ||
                          payment.couponAmount > 0 ||
                          payment.pointAmount > 0) && (
                          <div className="mt-3 grid gap-3 sm:grid-cols-3">
                            {payment.discountAmount > 0 && (
                              <div className="rounded-[20px] border border-ink/10 bg-mist px-4 py-3 text-sm">
                                <div className="text-slate">할인</div>
                                <div className="mt-2 font-semibold text-ember">
                                  - {formatAmount(payment.discountAmount)}
                                </div>
                              </div>
                            )}
                            {payment.couponAmount > 0 && (
                              <div className="rounded-[20px] border border-ink/10 bg-mist px-4 py-3 text-sm">
                                <div className="text-slate">쿠폰</div>
                                <div className="mt-2 font-semibold text-ember">
                                  - {formatAmount(payment.couponAmount)}
                                </div>
                              </div>
                            )}
                            {payment.pointAmount > 0 && (
                              <div className="rounded-[20px] border border-ink/10 bg-mist px-4 py-3 text-sm">
                                <div className="text-slate">포인트</div>
                                <div className="mt-2 font-semibold text-ember">
                                  - {formatAmount(payment.pointAmount)}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Refunds */}
                        {payment.refunds.length > 0 && (
                          <div className="mt-4 space-y-2">
                            <p className="text-sm font-semibold text-slate">환불 내역</p>
                            {payment.refunds.map((refund) => (
                              <div
                                key={refund.id}
                                className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-red-100 bg-red-50/50 px-4 py-3 text-sm"
                              >
                                <div>
                                  <span className="font-semibold text-red-700">
                                    - {formatAmount(refund.amount)}
                                  </span>
                                  <span className="ml-3 text-slate">{refund.reason}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="inline-flex rounded-full border border-red-200 bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">
                                    {REFUND_STATUS_LABEL[refund.status]}
                                  </span>
                                  <span className="text-xs text-slate">
                                    {formatDateWithWeekday(refund.processedAt)}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {payment.note && (
                          <div className="mt-4 rounded-[20px] border border-ink/10 bg-white px-4 py-3 text-sm leading-7 text-slate">
                            메모: {payment.note}
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                </section>
              </>
            )}

            {result.payments.length === 0 && (
              <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
                <h2 className="text-xl font-semibold">납부 내역</h2>
                <div className="mt-6 rounded-[24px] border border-dashed border-ink/10 p-8 text-sm text-slate">
                  납부 내역이 없습니다.
                </div>
              </section>
            )}

            {/* ── Enrollment detail cards ── */}
            {result.allEnrollments.length > 0 && (() => {
              // Build per-enrollment detail objects
              const enrollmentDetails: EnrollmentDetail[] = result.allEnrollments.map((enrollment) => {
                // Payments linked to this enrollment
                const linkedPayments = result.payments.filter(
                  (p) => p.enrollmentId === enrollment.id,
                );
                const approvedPayments = linkedPayments.filter(
                  (p) =>
                    p.status === PaymentStatus.APPROVED ||
                    p.status === PaymentStatus.PARTIAL_REFUNDED,
                );
                const totalPaid = approvedPayments.reduce((sum, p) => sum + p.netAmount, 0);
                const unpaidInst = linkedPayments.flatMap((p) =>
                  p.installments.filter((inst) => inst.paidAt === null),
                );
                const outstandingAmount = unpaidInst.reduce((sum, inst) => sum + inst.amount, 0);
                const lastPayment = approvedPayments[0] ?? null;

                return {
                  id: enrollment.id,
                  courseType: enrollment.courseType,
                  courseTypeLabel: COURSE_TYPE_LABEL[enrollment.courseType],
                  productName: enrollment.product?.name ?? null,
                  specialLectureName: enrollment.specialLecture?.name ?? null,
                  cohortName: enrollment.cohort?.name ?? null,
                  cohortStartDate: enrollment.cohort?.startDate
                    ? enrollment.cohort.startDate instanceof Date
                      ? enrollment.cohort.startDate.toISOString()
                      : String(enrollment.cohort.startDate)
                    : null,
                  cohortEndDate: enrollment.cohort?.endDate
                    ? enrollment.cohort.endDate instanceof Date
                      ? enrollment.cohort.endDate.toISOString()
                      : String(enrollment.cohort.endDate)
                    : null,
                  status: enrollment.status,
                  statusLabel: ENROLLMENT_STATUS_LABEL[enrollment.status],
                  statusColor: ENROLLMENT_STATUS_COLOR[enrollment.status],
                  startDate: enrollment.startDate
                    ? enrollment.startDate instanceof Date
                      ? enrollment.startDate.toISOString()
                      : String(enrollment.startDate)
                    : null,
                  endDate: enrollment.endDate
                    ? enrollment.endDate instanceof Date
                      ? enrollment.endDate.toISOString()
                      : String(enrollment.endDate)
                    : null,
                  regularFee: enrollment.regularFee,
                  discountAmount: enrollment.discountAmount,
                  finalFee: enrollment.finalFee,
                  createdAt: enrollment.createdAt instanceof Date
                    ? enrollment.createdAt.toISOString()
                    : String(enrollment.createdAt),
                  isPrimary: enrollment.id === result.primary.id,
                  totalPaid,
                  outstandingAmount,
                  lastPaymentAt: lastPayment?.processedAt
                    ? lastPayment.processedAt instanceof Date
                      ? lastPayment.processedAt.toISOString()
                      : String(lastPayment.processedAt)
                    : null,
                  unpaidInstallments: unpaidInst.map((inst) => ({
                    id: inst.id,
                    seq: inst.seq,
                    amount: inst.amount,
                    dueDate: inst.dueDate
                      ? inst.dueDate instanceof Date
                        ? inst.dueDate.toISOString()
                        : String(inst.dueDate)
                      : null,
                  })),
                };
              });

              return (
                <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
                  <h2 className="text-xl font-semibold">전체 수강 이력</h2>
                  <p className="mt-2 text-sm leading-7 text-slate">
                    과정을 클릭하면 수강 기간, 수납 요약, 분할납부 일정을 확인할 수 있습니다.
                  </p>

                  <div className="mt-6 space-y-3">
                    {enrollmentDetails.map((detail) => (
                      <EnrollmentDetailCard key={detail.id} enrollment={detail} />
                    ))}
                  </div>
                </section>
              );
            })()}
          </>
        )}
      </div>
    </main>
  );
}

