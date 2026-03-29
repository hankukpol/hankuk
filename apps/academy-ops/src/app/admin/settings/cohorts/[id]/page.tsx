import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminContext } from "@/lib/auth";
import { EXAM_CATEGORY_LABEL } from "@/lib/constants";
import { getPrisma } from "@/lib/prisma";
import { getCohortAnalytics } from "@/lib/analytics/cohort-analytics";
import { CohortDetailClient } from "./cohort-detail-client";
import { CohortEditPanel } from "./cohort-edit-panel";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CohortDetailPage({ params, searchParams }: PageProps) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};

  const rawCohort = await getPrisma().cohort.findUnique({
    where: { id },
    include: {
      enrollments: {
        include: {
          student: { select: { name: true, phone: true } },
          staff: { select: { name: true } },
        },
        orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  if (!rawCohort) notFound();

  const activeTab = typeof resolvedSearchParams?.tab === "string" ? resolvedSearchParams.tab : "ACTIVE";
  const analyticsData =
    activeTab === "analytics" ? await getCohortAnalytics(id) : null;

  const activeCount = rawCohort.enrollments.filter(
    (e) => e.status === "PENDING" || e.status === "ACTIVE",
  ).length;
  const waitlistCount = rawCohort.enrollments.filter((e) => e.status === "WAITING").length;
  const availableSeats =
    rawCohort.maxCapacity != null ? Math.max(0, rawCohort.maxCapacity - activeCount) : null;
  const capacityPercent =
    rawCohort.maxCapacity && rawCohort.maxCapacity > 0
      ? Math.min(100, Math.round((activeCount / rawCohort.maxCapacity) * 100))
      : null;

  const cohort = {
    id: rawCohort.id,
    name: rawCohort.name,
    examCategory: rawCohort.examCategory,
    startDate: rawCohort.startDate.toISOString(),
    endDate: rawCohort.endDate.toISOString(),
    targetExamYear: rawCohort.targetExamYear,
    isActive: rawCohort.isActive,
    maxCapacity: rawCohort.maxCapacity,
    activeCount,
    waitlistCount,
    availableSeats,
    capacityPercent,
    enrollments: rawCohort.enrollments.map((e) => ({
      id: e.id,
      examNumber: e.examNumber,
      status: e.status as
        | "PENDING"
        | "ACTIVE"
        | "WAITING"
        | "SUSPENDED"
        | "COMPLETED"
        | "WITHDRAWN"
        | "CANCELLED",
      finalFee: e.finalFee,
      discountAmount: e.discountAmount,
      createdAt: e.createdAt.toISOString(),
      studentName: e.student?.name ?? null,
      studentPhone: e.student?.phone ?? null,
      staffName: e.staff?.name ?? null,
      waitlistOrder: e.waitlistOrder,
    })),
  };

  const examCategoryLabel =
    EXAM_CATEGORY_LABEL[cohort.examCategory as keyof typeof EXAM_CATEGORY_LABEL] ??
    cohort.examCategory;

  return (
    <div className="p-8 sm:p-10">
      {/* Back link */}
      <div className="flex items-center gap-3">
        <Link
          href="/admin/settings/cohorts"
          className="inline-flex items-center gap-1.5 text-sm text-slate transition hover:text-ink"
        >
          <span>&larr;</span>
          <span>기수 목록으로</span>
        </Link>
        <span className="text-slate/40">/</span>
        <Link
          href="/admin/cohorts"
          className="text-sm text-slate transition hover:text-ink"
        >
          기수 현황 대시보드
        </Link>
      </div>

      {/* Header */}
      <div className="mt-4 inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        설정 · 기수 상세
      </div>
      <div className="mt-3 flex flex-wrap items-start gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">{cohort.name}</h1>
          <p className="mt-1 text-sm text-slate">{examCategoryLabel}</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Link
            href={`/admin/settings/cohorts/${cohort.id}/analytics`}
            className="inline-flex items-center gap-1.5 rounded-[20px] border border-forest/30 bg-forest/5 px-4 py-2 text-sm font-medium text-forest transition hover:bg-forest/10"
          >
            통계 분석
          </Link>
          <Link
            href={`/admin/settings/cohorts/${cohort.id}/enrollments`}
            className="inline-flex items-center gap-1.5 rounded-[20px] border border-ink/20 px-4 py-2 text-sm text-slate transition hover:border-ink/40"
          >
            수강생 목록
          </Link>
          <Link
            href={`/admin/settings/cohorts/${cohort.id}/schedule`}
            className="inline-flex items-center gap-1.5 rounded-[20px] border border-ink/20 px-4 py-2 text-sm text-slate transition hover:border-ink/40"
          >
            수업 일정
          </Link>
          <Link
            href={`/admin/settings/cohorts/${cohort.id}/roster`}
            className="inline-flex items-center gap-1.5 rounded-[20px] border border-ink/20 px-4 py-2 text-sm text-slate transition hover:border-ink/40"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            수강생 명단
          </Link>
          <Link
            href="/admin/cohorts/waitlist"
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 transition hover:bg-amber-100"
          >
            전체 대기자 관리 &rarr;
          </Link>
          {/* 기수 종료 처리 버튼: 활성 기수이고 종료일이 14일 이내이거나 지난 경우 */}
          {rawCohort.isActive && (() => {
            const now = new Date();
            const in14 = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
            return rawCohort.endDate <= in14;
          })() && (
            <Link
              href={`/admin/settings/cohorts/${cohort.id}/graduation`}
              className="inline-flex items-center gap-1.5 rounded-full border border-amber-400 bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-600"
            >
              기수 종료 처리 &rarr;
            </Link>
          )}
        </div>
      </div>

      {/* Edit panel */}
      <CohortEditPanel
        cohort={{
          id: cohort.id,
          name: cohort.name,
          examCategory: cohort.examCategory,
          startDate: cohort.startDate,
          endDate: cohort.endDate,
          targetExamYear: cohort.targetExamYear,
          isActive: cohort.isActive,
          maxCapacity: cohort.maxCapacity,
        }}
      />

      {/* Client-side detail (tabs, end date edit) */}
      <CohortDetailClient cohort={cohort} analyticsData={analyticsData} />
    </div>
  );
}
