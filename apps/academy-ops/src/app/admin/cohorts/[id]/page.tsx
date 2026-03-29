import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import {
  EXAM_CATEGORY_LABEL,
  ENROLLMENT_STATUS_LABEL,
  ENROLLMENT_STATUS_COLOR,
} from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { MembersClient } from "./members-client";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function CohortDetailPage({ params }: PageProps) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const { id } = await params;

  const rawCohort = await getPrisma().cohort.findUnique({
    where: { id },
    include: {
      enrollments: {
        include: {
          student: {
            select: {
              examNumber: true,
              name: true,
              phone: true,
            },
          },
        },
        orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      },
      _count: {
        select: { enrollments: true },
      },
    },
  });

  if (!rawCohort) notFound();

  const activeCount = rawCohort.enrollments.filter(
    (e) => e.status === "ACTIVE",
  ).length;
  const pendingCount = rawCohort.enrollments.filter(
    (e) => e.status === "PENDING",
  ).length;
  const waitingCount = rawCohort.enrollments.filter(
    (e) => e.status === "WAITING",
  ).length;
  const suspendedCount = rawCohort.enrollments.filter(
    (e) => e.status === "SUSPENDED",
  ).length;
  const completedCount = rawCohort.enrollments.filter(
    (e) => e.status === "COMPLETED",
  ).length;

  const examCategoryLabel =
    EXAM_CATEGORY_LABEL[rawCohort.examCategory as keyof typeof EXAM_CATEGORY_LABEL] ??
    rawCohort.examCategory;

  const enrolledCount = activeCount + pendingCount;
  const capacityPercent =
    rawCohort.maxCapacity && rawCohort.maxCapacity > 0
      ? Math.min(100, Math.round((enrolledCount / rawCohort.maxCapacity) * 100))
      : null;

  const enrollments = rawCohort.enrollments.map((e) => ({
    id: e.id,
    examNumber: e.examNumber,
    studentName: e.student?.name ?? null,
    studentPhone: e.student?.phone ?? null,
    createdAt: e.createdAt.toISOString(),
    finalFee: e.finalFee,
    discountAmount: e.discountAmount,
    status: e.status as
      | "PENDING"
      | "ACTIVE"
      | "WAITING"
      | "SUSPENDED"
      | "COMPLETED"
      | "WITHDRAWN"
      | "CANCELLED",
    waitlistOrder: e.waitlistOrder,
  }));

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate">
        <Link href="/admin/cohorts" className="transition hover:text-ink">
          기수 현황
        </Link>
        <span className="text-slate/40">/</span>
        <span className="text-ink">{rawCohort.name}</span>
      </div>

      {/* Header */}
      <div className="mt-4">
        <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
          수강 관리 · 기수 상세
        </div>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold text-ink">{rawCohort.name}</h1>
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  rawCohort.isActive
                    ? "bg-forest/10 text-forest"
                    : "bg-ink/5 text-slate"
                }`}
              >
                {rawCohort.isActive ? "활성" : "비활성"}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-slate">
              <span className="inline-flex rounded-full bg-mist px-2.5 py-0.5 text-xs font-medium">
                {examCategoryLabel}
              </span>
              <span>
                {formatDate(rawCohort.startDate)} ~ {formatDate(rawCohort.endDate)}
              </span>
              {rawCohort.targetExamYear && (
                <span>{rawCohort.targetExamYear}년 시험</span>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/admin/cohorts/${rawCohort.id}/score-distribution`}
              className="inline-flex items-center gap-1.5 rounded-full border border-forest/20 bg-forest/5 px-4 py-2 text-sm font-medium text-forest transition hover:bg-forest/10"
            >
              성적 분포
            </Link>
            <Link
              href={`/admin/notifications/broadcast?recipientGroup=cohort&cohortId=${rawCohort.id}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-700 transition hover:bg-sky-100"
            >
              기수 전체 발송
            </Link>
            <Link
              href={`/admin/settings/cohorts/${rawCohort.id}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-mist"
            >
              기수 설정
            </Link>
            <Link
              href={`/admin/cohorts/waitlist?cohortId=${rawCohort.id}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 transition hover:bg-amber-100"
            >
              대기자 관리
            </Link>
          </div>
        </div>
      </div>

      {/* Cohort info card */}
      <div className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs font-medium text-slate">수강 기간</p>
            <p className="mt-1 text-sm font-semibold text-ink">
              {formatDate(rawCohort.startDate)} ~ {formatDate(rawCohort.endDate)}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate">정원</p>
            <p className="mt-1 text-sm font-semibold text-ink">
              {rawCohort.maxCapacity != null
                ? `${enrolledCount} / ${rawCohort.maxCapacity}명`
                : `${enrolledCount}명 (무제한)`}
            </p>
            {capacityPercent !== null && (
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-ink/10">
                <div
                  className={`h-1.5 rounded-full transition-all ${
                    capacityPercent >= 100
                      ? "bg-red-500"
                      : capacityPercent >= 80
                        ? "bg-amber-500"
                        : "bg-forest"
                  }`}
                  style={{ width: `${capacityPercent}%` }}
                />
              </div>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-slate">총 등록</p>
            <p className="mt-1 text-sm font-semibold text-ink">
              {rawCohort._count.enrollments}명
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate">여석</p>
            <p className="mt-1 text-sm font-semibold text-ink">
              {rawCohort.maxCapacity != null
                ? `${Math.max(0, rawCohort.maxCapacity - enrolledCount)}석`
                : "-"}
            </p>
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-[20px] border border-forest/20 bg-forest/5 p-4 text-center">
          <p className="text-xs font-medium text-forest">수강 중</p>
          <p className="mt-1 text-2xl font-bold text-forest tabular-nums">{activeCount}</p>
        </div>
        <div className="rounded-[20px] border border-amber-200 bg-amber-50 p-4 text-center">
          <p className="text-xs font-medium text-amber-700">신청</p>
          <p className="mt-1 text-2xl font-bold text-amber-700 tabular-nums">{pendingCount}</p>
        </div>
        <div className="rounded-[20px] border border-sky-200 bg-sky-50 p-4 text-center">
          <p className="text-xs font-medium text-sky-700">대기</p>
          <p className="mt-1 text-2xl font-bold text-sky-700 tabular-nums">{waitingCount}</p>
        </div>
        <div className="rounded-[20px] border border-purple-200 bg-purple-50 p-4 text-center">
          <p className="text-xs font-medium text-purple-700">휴원</p>
          <p className="mt-1 text-2xl font-bold text-purple-700 tabular-nums">{suspendedCount}</p>
        </div>
        <div className="rounded-[20px] border border-ink/10 bg-ink/5 p-4 text-center">
          <p className="text-xs font-medium text-slate">수료</p>
          <p className="mt-1 text-2xl font-bold text-ink tabular-nums">{completedCount}</p>
        </div>
      </div>

      {/* Members section */}
      <div className="mt-8">
        <h2 className="mb-4 text-lg font-semibold text-ink">학생 명단</h2>
        <MembersClient
          enrollments={enrollments}
          cohortId={id}
          enrollmentStatusLabel={ENROLLMENT_STATUS_LABEL}
          enrollmentStatusColor={ENROLLMENT_STATUS_COLOR}
        />
      </div>
    </div>
  );
}
