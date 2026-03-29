import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { EXAM_CATEGORY_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { getPrisma } from "@/lib/prisma";
import { CohortOverviewClient } from "./cohort-overview-client";

export const dynamic = "force-dynamic";

export default async function CohortsOverviewPage() {
  await requireAdminContext(AdminRole.TEACHER);

  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const rawCohorts = await getPrisma().cohort.findMany({
    orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
    include: {
      enrollments: {
        select: { status: true, createdAt: true },
      },
    },
  });

  const cohorts = rawCohorts.map(({ enrollments, ...cohort }) => {
    const activeCount = enrollments.filter(
      (e) => e.status === "PENDING" || e.status === "ACTIVE",
    ).length;
    const waitlistCount = enrollments.filter((e) => e.status === "WAITING").length;
    const newThisMonth = enrollments.filter(
      (e) =>
        (e.status === "PENDING" || e.status === "ACTIVE") &&
        new Date(e.createdAt) >= thisMonthStart,
    ).length;
    const availableSeats =
      cohort.maxCapacity != null ? Math.max(0, cohort.maxCapacity - activeCount) : null;
    const capacityPercent =
      cohort.maxCapacity && cohort.maxCapacity > 0
        ? Math.min(100, Math.round((activeCount / cohort.maxCapacity) * 100))
        : null;

    return {
      ...cohort,
      startDate: cohort.startDate.toISOString(),
      endDate: cohort.endDate.toISOString(),
      createdAt: cohort.createdAt.toISOString(),
      updatedAt: cohort.updatedAt.toISOString(),
      activeCount,
      waitlistCount,
      newThisMonth,
      availableSeats,
      capacityPercent,
    };
  });

  const activeCohorts = cohorts.filter((c) => c.isActive);
  const kpi = {
    activeCohortCount: activeCohorts.length,
    totalStudents: activeCohorts.reduce((sum, c) => sum + c.activeCount, 0),
    totalWaiting: activeCohorts.reduce((sum, c) => sum + c.waitlistCount, 0),
    totalNewThisMonth: activeCohorts.reduce((sum, c) => sum + c.newThisMonth, 0),
  };

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            수강 관리 · 기수 현황
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-ink">기수 현황 대시보드</h1>
          <p className="mt-1 text-sm text-slate">전체 기수의 수강생·대기자 현황을 한눈에 확인합니다.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/cohorts/waitlist"
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 transition hover:bg-amber-100"
          >
            대기자 관리
          </Link>
          <Link
            href="/admin/settings/cohorts"
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-mist"
          >
            기수 설정
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate">활성 기수</p>
          <p className="mt-2 text-3xl font-semibold text-ink tabular-nums">{kpi.activeCohortCount}</p>
          <p className="mt-1 text-xs text-slate">진행 중인 기수</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate">총 수강생</p>
          <p className="mt-2 text-3xl font-semibold text-forest tabular-nums">{kpi.totalStudents.toLocaleString()}</p>
          <p className="mt-1 text-xs text-slate">활성 기수 재원생 합계</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate">대기자</p>
          <p className={`mt-2 text-3xl font-semibold tabular-nums ${kpi.totalWaiting > 0 ? "text-amber-600" : "text-ink"}`}>
            {kpi.totalWaiting}
          </p>
          <p className="mt-1 text-xs text-slate">정원 대기 중인 학생</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate">이번 달 신규</p>
          <p className="mt-2 text-3xl font-semibold text-ember tabular-nums">{kpi.totalNewThisMonth}</p>
          <p className="mt-1 text-xs text-slate">이번 달 등록 수강생</p>
        </div>
      </div>

      {/* Cohort Cards */}
      <CohortOverviewClient cohorts={cohorts} />
    </div>
  );
}
