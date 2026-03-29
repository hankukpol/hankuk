import { AdminRole, EnrollmentStatus } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { EXAM_CATEGORY_LABEL, ENROLLMENT_STATUS_LABEL, ENROLLMENT_STATUS_COLOR } from "@/lib/constants";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "-";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

function formatDate(date: Date | string | null): string {
  if (!date) return "-";
  const d = new Date(date);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  PENDING: "처리 중",
  APPROVED: "승인",
  PARTIAL_REFUNDED: "부분환불",
  FULLY_REFUNDED: "전액환불",
  CANCELLED: "취소",
};

const PAYMENT_STATUS_COLOR: Record<string, string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-700",
  APPROVED: "border-forest/30 bg-forest/10 text-forest",
  PARTIAL_REFUNDED: "border-orange-200 bg-orange-50 text-orange-700",
  FULLY_REFUNDED: "border-red-200 bg-red-50 text-red-700",
  CANCELLED: "border-ink/20 bg-ink/5 text-slate",
};

const ALL_STATUSES: EnrollmentStatus[] = [
  "PENDING",
  "ACTIVE",
  "WAITING",
  "SUSPENDED",
  "COMPLETED",
  "WITHDRAWN",
  "CANCELLED",
];

export default async function CohortEnrollmentsPage({
  params,
  searchParams,
}: PageProps) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};

  const rawStatus =
    typeof resolvedSearchParams.status === "string"
      ? resolvedSearchParams.status.toUpperCase()
      : null;

  const statusFilter: EnrollmentStatus | null =
    rawStatus && ALL_STATUSES.includes(rawStatus as EnrollmentStatus)
      ? (rawStatus as EnrollmentStatus)
      : null;

  const cohort = await getPrisma().cohort.findUnique({
    where: { id },
    include: {
      enrollments: {
        where: statusFilter ? { status: statusFilter } : undefined,
        include: {
          student: {
            select: {
              examNumber: true,
              name: true,
              phone: true,
            },
          },
          staff: { select: { name: true } },
        },
        orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  if (!cohort) notFound();

  // Fetch payments linked to these enrollments
  const enrollmentIds = cohort.enrollments.map((e) => e.id);
  const payments =
    enrollmentIds.length > 0
      ? await getPrisma().payment.findMany({
          where: { enrollmentId: { in: enrollmentIds } },
          select: {
            id: true,
            enrollmentId: true,
            status: true,
            netAmount: true,
            processedAt: true,
          },
          orderBy: { processedAt: "desc" },
        })
      : [];

  // Build a map: enrollmentId → latest payment
  const paymentByEnrollmentId = new Map<
    string,
    { id: string; status: string; netAmount: number; processedAt: Date }
  >();
  for (const p of payments) {
    if (p.enrollmentId && !paymentByEnrollmentId.has(p.enrollmentId)) {
      paymentByEnrollmentId.set(p.enrollmentId, {
        id: p.id,
        status: p.status,
        netAmount: p.netAmount,
        processedAt: p.processedAt,
      });
    }
  }

  // Count stats (across all enrollments regardless of filter)
  const allEnrollments = await getPrisma().courseEnrollment.findMany({
    where: { cohortId: id },
    select: { status: true },
  });

  const totalCount = allEnrollments.length;
  const activeCount = allEnrollments.filter(
    (e) => e.status === "ACTIVE" || e.status === "PENDING",
  ).length;
  const waitingCount = allEnrollments.filter(
    (e) => e.status === "WAITING",
  ).length;
  const suspendedCount = allEnrollments.filter(
    (e) => e.status === "SUSPENDED",
  ).length;

  const examCategoryLabel =
    EXAM_CATEGORY_LABEL[cohort.examCategory as keyof typeof EXAM_CATEGORY_LABEL] ??
    cohort.examCategory;

  return (
    <div className="p-8 sm:p-10">
      {/* Back link */}
      <div className="flex flex-wrap items-center gap-2 text-sm text-slate">
        <Link
          href="/admin/settings/cohorts"
          className="transition hover:text-ink"
        >
          기수 목록
        </Link>
        <span className="text-slate/40">/</span>
        <Link
          href={`/admin/settings/cohorts/${id}`}
          className="transition hover:text-ink"
        >
          {cohort.name}
        </Link>
        <span className="text-slate/40">/</span>
        <span className="text-ink">수강생 목록</span>
      </div>

      {/* Header */}
      <div className="mt-4 inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        기수 · 수강생 목록
      </div>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">{cohort.name}</h1>
          <p className="mt-1 text-sm text-slate">
            {examCategoryLabel} &middot; {formatDate(cohort.startDate)} ~{" "}
            {formatDate(cohort.endDate)}
          </p>
        </div>
        <Link
          href={`/admin/settings/cohorts/${id}`}
          className="inline-flex items-center gap-1.5 rounded-[20px] border border-ink/20 px-4 py-2 text-sm text-slate transition hover:border-ink/40"
        >
          &larr; 기수 상세로
        </Link>
      </div>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-[20px] border border-ink/10 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate">
            총 등록
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-ink">
            {totalCount}
            <span className="ml-1 text-sm font-normal text-slate">명</span>
          </p>
        </div>
        <div className="rounded-[20px] border border-ink/10 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate">
            재원 중
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-forest">
            {activeCount}
            <span className="ml-1 text-sm font-normal text-slate">명</span>
          </p>
        </div>
        <div className="rounded-[20px] border border-ink/10 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate">
            대기
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-sky-600">
            {waitingCount}
            <span className="ml-1 text-sm font-normal text-slate">명</span>
          </p>
        </div>
        <div className="rounded-[20px] border border-ink/10 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate">
            휴원
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-purple-600">
            {suspendedCount}
            <span className="ml-1 text-sm font-normal text-slate">명</span>
          </p>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="mt-6 flex flex-wrap gap-2">
        <Link
          href={`/admin/settings/cohorts/${id}/enrollments`}
          className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
            !statusFilter
              ? "border-forest bg-forest text-white"
              : "border-ink/20 text-slate hover:border-ink/40 hover:text-ink"
          }`}
        >
          전체
        </Link>
        {ALL_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/settings/cohorts/${id}/enrollments?status=${s}`}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
              statusFilter === s
                ? "border-forest bg-forest text-white"
                : "border-ink/20 text-slate hover:border-ink/40 hover:text-ink"
            }`}
          >
            {ENROLLMENT_STATUS_LABEL[s]}
          </Link>
        ))}
      </div>

      {/* Enrollments table */}
      <div className="mt-4">
        {cohort.enrollments.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/10 bg-white px-6 py-12 text-center text-sm text-slate">
            {statusFilter
              ? `${ENROLLMENT_STATUS_LABEL[statusFilter]} 상태의 수강생이 없습니다.`
              : "등록된 수강생이 없습니다."}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[28px] border border-ink/10 bg-white">
            <table className="min-w-full divide-y divide-ink/5 text-sm">
              <thead>
                <tr>
                  {[
                    "#",
                    "이름",
                    "학번",
                    "연락처",
                    "수강 상태",
                    "시작일",
                    "종료일",
                    "수강료",
                    "수납 상태",
                    "담당자",
                    "바로가기",
                  ].map((h) => (
                    <th
                      key={h}
                      className="bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {cohort.enrollments.map((enrollment, idx) => {
                  const payment = paymentByEnrollmentId.get(enrollment.id);
                  return (
                    <tr
                      key={enrollment.id}
                      className="transition hover:bg-mist/20"
                    >
                      <td className="px-4 py-3 text-xs text-slate tabular-nums">
                        {idx + 1}
                      </td>
                      <td className="px-4 py-3 font-medium text-ink whitespace-nowrap">
                        <Link
                          href={`/admin/students/${enrollment.student?.examNumber ?? enrollment.examNumber}`}
                          className="hover:text-forest hover:underline"
                        >
                          {enrollment.student?.name ?? "-"}
                        </Link>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate text-xs whitespace-nowrap">
                        <Link
                          href={`/admin/students/${enrollment.student?.examNumber ?? enrollment.examNumber}`}
                          className="hover:text-forest hover:underline"
                        >
                          {enrollment.student?.examNumber ?? enrollment.examNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate whitespace-nowrap">
                        {formatPhone(enrollment.student?.phone)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${
                            ENROLLMENT_STATUS_COLOR[enrollment.status as keyof typeof ENROLLMENT_STATUS_COLOR] ??
                            "border-ink/20 bg-ink/5 text-slate"
                          }`}
                        >
                          {ENROLLMENT_STATUS_LABEL[enrollment.status as keyof typeof ENROLLMENT_STATUS_LABEL] ??
                            enrollment.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate whitespace-nowrap tabular-nums">
                        {formatDate(enrollment.startDate)}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate whitespace-nowrap tabular-nums">
                        {formatDate(enrollment.endDate)}
                      </td>
                      <td className="px-4 py-3 text-xs tabular-nums text-slate whitespace-nowrap">
                        <span className="text-ink font-medium">
                          {enrollment.finalFee.toLocaleString()}원
                        </span>
                        {enrollment.discountAmount > 0 && (
                          <span className="ml-1 text-xs text-slate">
                            (-{enrollment.discountAmount.toLocaleString()})
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {payment ? (
                          <Link
                            href={`/admin/payments/${payment.id}`}
                            className="inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold transition hover:opacity-80"
                            style={{ textDecoration: "none" }}
                          >
                            <span
                              className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${
                                PAYMENT_STATUS_COLOR[payment.status] ??
                                "border-ink/20 bg-ink/5 text-slate"
                              }`}
                            >
                              {PAYMENT_STATUS_LABEL[payment.status] ??
                                payment.status}
                            </span>
                          </Link>
                        ) : (
                          <span className="text-xs text-slate/50">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate whitespace-nowrap">
                        {enrollment.staff?.name ?? "-"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/admin/enrollments/${enrollment.id}`}
                            className="rounded-full border border-ink/10 px-2.5 py-1 text-xs font-medium text-ink transition hover:border-ink/30 whitespace-nowrap"
                          >
                            수강 상세
                          </Link>
                          <Link
                            href={`/admin/students/${enrollment.student?.examNumber ?? enrollment.examNumber}`}
                            className="rounded-full border border-ink/10 px-2.5 py-1 text-xs font-medium text-ink transition hover:border-ink/30 whitespace-nowrap"
                          >
                            학생 정보
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer note */}
      <p className="mt-4 text-xs text-slate">
        총 {cohort.enrollments.length}건 표시
        {statusFilter ? ` (${ENROLLMENT_STATUS_LABEL[statusFilter]} 필터 적용)` : ""}
      </p>
    </div>
  );
}
