import type { Metadata } from "next";
import Link from "next/link";
import { PaymentMethod, PaymentStatus } from "@prisma/client";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { getAcademyRuntimeBranding } from "@/lib/academy-branding";
import { hasDatabaseConfig } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { getStudentPortalViewer } from "@/lib/student-portal/service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "납부 영수증 목록",
};

// ─── Label maps ──────────────────────────────────────────────────────────────

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
  APPROVED: "border-forest/20 bg-forest/10 text-[#1F4D3A]",
  PARTIAL_REFUNDED: "border-orange-200 bg-orange-50 text-orange-700",
  FULLY_REFUNDED: "border-red-200 bg-red-50 text-red-700",
  CANCELLED: "border-ink/10 bg-mist text-slate",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDateTime(date: Date): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  return `${y}.${mo}.${d} ${h}:${mi}`;
}

function formatAmount(value: number): string {
  return `${value.toLocaleString("ko-KR")}원`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function StudentPaymentReceiptListPage() {
  if (!hasDatabaseConfig()) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
              서비스 준비 중
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              DB 연결 후 사용할 수 있습니다.
            </h1>
          </section>
        </div>
      </main>
    );
  }

  const viewer = await getStudentPortalViewer();

  if (!viewer) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl space-y-6">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-[#1F4D3A]">
              납부 영수증
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              로그인 후 확인할 수 있습니다.
            </h1>
          </section>
          <StudentLookupForm redirectPath="/student/payments/receipt" />
        </div>
      </main>
    );
  }

  const prisma = getPrisma();
  const branding = await getAcademyRuntimeBranding(viewer.academyId ?? undefined);

  const payments = await prisma.payment.findMany({
    where: {
      examNumber: viewer.examNumber,
    },
    orderBy: { processedAt: "desc" },
    take: 30,
    select: {
      id: true,
      status: true,
      method: true,
      grossAmount: true,
      discountAmount: true,
      couponAmount: true,
      pointAmount: true,
      netAmount: true,
      processedAt: true,
      enrollmentId: true,
    },
  });

  // Resolve enrollment labels for all payments that have an enrollmentId
  const enrollmentIds = payments
    .map((p) => p.enrollmentId)
    .filter((id): id is string => id !== null);

  const enrollmentsMap = new Map<
    string,
    { cohortName: string | null; productName: string | null; specialLectureName: string | null }
  >();

  if (enrollmentIds.length > 0) {
    const enrollments = await prisma.courseEnrollment.findMany({
      where: { id: { in: enrollmentIds } },
      select: {
        id: true,
        cohort: { select: { name: true } },
        product: { select: { name: true } },
        specialLecture: { select: { name: true } },
      },
    });
    for (const e of enrollments) {
      enrollmentsMap.set(e.id, {
        cohortName: e.cohort?.name ?? null,
        productName: e.product?.name ?? null,
        specialLectureName: e.specialLecture?.name ?? null,
      });
    }
  }

  const mostRecent = payments[0] ?? null;

  return (
    <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-slate">
          <Link
            href="/student/payments"
            className="transition hover:text-ember"
          >
            수납 내역
          </Link>
          <span>/</span>
          <span className="font-medium text-ink">영수증 목록</span>
        </nav>

        {/* Header */}
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-[#1F4D3A]">
            Receipts
          </div>
          <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-4xl">
            납부 영수증
          </h1>
          <p className="mt-4 text-sm leading-7 text-slate">
            {viewer.name} ({viewer.examNumber}) 님의 납부 영수증 목록입니다.
            각 항목을 클릭하면 상세 영수증을 확인할 수 있습니다.
          </p>

          {/* Most recent receipt quick-link */}
          {mostRecent && (
            <div className="mt-6 flex items-center justify-between gap-4 rounded-[20px] border border-ember/20 bg-ember/5 p-4">
              <div>
                <p className="text-xs font-semibold text-ember uppercase tracking-widest">
                  최근 납부
                </p>
                <p className="mt-1 text-base font-semibold text-ink">
                  {formatAmount(mostRecent.netAmount)}
                  <span className="ml-2 text-sm font-normal text-slate">
                    {formatDateTime(new Date(mostRecent.processedAt))}
                  </span>
                </p>
              </div>
              <Link
                href={`/student/payments/${mostRecent.id}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-ember px-4 py-2 text-xs font-semibold text-white transition hover:bg-ember/90 active:scale-95"
              >
                영수증 보기
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  className="h-3.5 w-3.5"
                >
                  <path
                    fillRule="evenodd"
                    d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z"
                    clipRule="evenodd"
                  />
                </svg>
              </Link>
            </div>
          )}
        </section>

        {/* Receipt list */}
        {payments.length === 0 ? (
          <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
            <div className="rounded-[20px] border border-dashed border-ink/10 px-5 py-10 text-center">
              <p className="text-sm font-medium text-ink">
                납부 내역이 없습니다.
              </p>
              <p className="mt-2 text-xs text-slate">
                수강료를 납부하면 이곳에서 영수증을 확인할 수 있습니다.
              </p>
              <Link
                href="/student/payments"
                className="mt-4 inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm transition hover:border-ember/30 hover:text-ember"
              >
                수납 내역으로
              </Link>
            </div>
          </section>
        ) : (
          <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
            <h2 className="mb-4 text-base font-semibold text-ink">
              전체 영수증{" "}
              <span className="text-sm font-normal text-slate">
                ({payments.length}건)
              </span>
            </h2>
            <ul className="space-y-2.5">
              {payments.map((payment) => {
                const receiptNo = payment.id.slice(-8).toUpperCase();
                const enrollmentInfo = payment.enrollmentId
                  ? enrollmentsMap.get(payment.enrollmentId)
                  : null;
                const courseName =
                  enrollmentInfo?.cohortName ??
                  enrollmentInfo?.productName ??
                  enrollmentInfo?.specialLectureName ??
                  null;
                const hasDiscount =
                  payment.discountAmount > 0 ||
                  payment.couponAmount > 0 ||
                  payment.pointAmount > 0;

                return (
                  <li key={payment.id}>
                    <Link
                      href={`/student/payments/${payment.id}`}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-ink/10 p-4 transition-colors hover:border-ember/20 hover:bg-mist/40"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-slate">
                            #{receiptNo}
                          </span>
                          <span
                            className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${PAYMENT_STATUS_COLOR[payment.status]}`}
                          >
                            {PAYMENT_STATUS_LABEL[payment.status]}
                          </span>
                          <span className="text-xs text-slate">
                            {PAYMENT_METHOD_LABEL[payment.method]}
                          </span>
                        </div>
                        {courseName && (
                          <p className="mt-0.5 truncate text-xs text-slate">
                            {courseName}
                          </p>
                        )}
                        <p className="mt-0.5 text-[11px] text-slate/60">
                          {formatDateTime(new Date(payment.processedAt))}
                        </p>
                      </div>

                      <div className="flex-shrink-0 text-right">
                        <p className="font-semibold tabular-nums text-ink">
                          {formatAmount(payment.netAmount)}
                        </p>
                        {hasDiscount && (
                          <p className="text-xs tabular-nums text-red-500">
                            할인{" "}
                            -{formatAmount(
                              payment.discountAmount +
                                payment.couponAmount +
                                payment.pointAmount,
                            )}
                          </p>
                        )}
                        <div className="mt-1 flex items-center justify-end gap-1 text-xs text-ember">
                          <span>영수증</span>
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 16 16"
                            fill="currentColor"
                            className="h-3.5 w-3.5"
                          >
                            <path
                              fillRule="evenodd"
                              d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Privacy note */}
        <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate"
            >
              <path
                fillRule="evenodd"
                d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z"
                clipRule="evenodd"
              />
            </svg>
            <div>
              <p className="text-sm font-semibold">개인정보 보호 안내</p>
              <p className="mt-1 text-xs leading-6 text-slate">
                영수증 정보는 본인 확인 후에만 제공됩니다. 영수증이 필요한 경우
                {" "}
                {branding.phone ? `${branding.academyName}(${branding.phone})` : branding.academyName}
                으로 문의해 주세요.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
