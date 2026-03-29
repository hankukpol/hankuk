import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { FunnelClient, type CohortFunnelRow, type FunnelKpis } from "./funnel-client";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CohortFunnelPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.MANAGER);

  const params = searchParams ? await searchParams : {};
  const yearParam = Array.isArray(params.year) ? params.year[0] : params.year;
  const year = yearParam ? parseInt(yearParam, 10) : null;

  const prisma = getPrisma();

  // Fetch cohorts
  const cohorts = await prisma.cohort.findMany({
    where: year && !isNaN(year) ? { targetExamYear: year } : undefined,
    orderBy: [{ startDate: "desc" }],
    take: 50,
    select: {
      id: true,
      name: true,
      examCategory: true,
      targetExamYear: true,
      startDate: true,
      endDate: true,
      maxCapacity: true,
      isActive: true,
    },
  });

  // For each cohort, count enrollment statuses
  const cohortIds = cohorts.map((c) => c.id);

  const enrollmentGroups = await prisma.courseEnrollment.groupBy({
    by: ["cohortId", "status"],
    where: {
      cohortId: { in: cohortIds },
    },
    _count: { id: true },
  });

  // Build count map: cohortId -> status -> count
  const countMap: Record<string, Record<string, number>> = {};
  for (const group of enrollmentGroups) {
    if (!group.cohortId) continue;
    if (!countMap[group.cohortId]) countMap[group.cohortId] = {};
    countMap[group.cohortId][group.status] = group._count.id;
  }

  // Build result rows
  const rows: CohortFunnelRow[] = cohorts.map((cohort) => {
    const statusMap = countMap[cohort.id] ?? {};
    const enrolled =
      (statusMap["PENDING"] ?? 0) +
      (statusMap["ACTIVE"] ?? 0) +
      (statusMap["WAITING"] ?? 0) +
      (statusMap["SUSPENDED"] ?? 0) +
      (statusMap["COMPLETED"] ?? 0) +
      (statusMap["WITHDRAWN"] ?? 0) +
      (statusMap["CANCELLED"] ?? 0);
    const active = statusMap["ACTIVE"] ?? 0;
    const suspended = statusMap["SUSPENDED"] ?? 0;
    const completed = statusMap["COMPLETED"] ?? 0;
    const cancelled = statusMap["CANCELLED"] ?? 0;
    const withdrawn = statusMap["WITHDRAWN"] ?? 0;

    const retentionRate =
      completed + cancelled + withdrawn > 0
        ? Math.round((completed / (completed + cancelled + withdrawn)) * 100)
        : null;

    const completionRate =
      enrolled > 0 ? Math.round((completed / enrolled) * 100) : null;

    return {
      cohortId: cohort.id,
      cohortName: cohort.name,
      examCategory: cohort.examCategory,
      targetExamYear: cohort.targetExamYear,
      startDate: cohort.startDate.toISOString(),
      endDate: cohort.endDate.toISOString(),
      maxCapacity: cohort.maxCapacity,
      isActive: cohort.isActive,
      counts: { enrolled, active, suspended, completed, cancelled, withdrawn },
      retentionRate,
      completionRate,
    };
  });

  // KPIs
  const kpis: FunnelKpis = {
    totalCohorts: rows.length,
    avgRetentionRate:
      rows.filter((r) => r.retentionRate !== null).length > 0
        ? Math.round(
            rows
              .filter((r) => r.retentionRate !== null)
              .reduce((s, r) => s + (r.retentionRate ?? 0), 0) /
              rows.filter((r) => r.retentionRate !== null).length,
          )
        : null,
    avgCompletionRate:
      rows.filter((r) => r.completionRate !== null).length > 0
        ? Math.round(
            rows
              .filter((r) => r.completionRate !== null)
              .reduce((s, r) => s + (r.completionRate ?? 0), 0) /
              rows.filter((r) => r.completionRate !== null).length,
          )
        : null,
  };

  // Available years for filter
  const yearGroups = await prisma.cohort.groupBy({
    by: ["targetExamYear"],
    where: { targetExamYear: { not: null } },
    orderBy: { targetExamYear: "desc" },
    _count: { id: true },
  });
  const availableYears = yearGroups
    .map((g) => g.targetExamYear)
    .filter((y): y is number => y !== null);

  const currentYear = new Date().getFullYear();
  const selectedYear = year && !isNaN(year) ? year : null;

  return (
    <div className="p-8 sm:p-10">
      {/* Badge */}
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        수강 분석
      </div>

      {/* Header */}
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">기수 라이프사이클 퍼널</h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-slate">
            기수별 수강 등록부터 수료·취소까지의 생애주기를 분석합니다.
            유지율 = 수료 / (수료+취소+자퇴), 수료율 = 수료 / 전체 등록.
          </p>
        </div>

        {/* Quick links */}
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/analytics/retention"
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/40"
          >
            재원율 분석 →
          </Link>
          <Link
            href="/admin/cohorts"
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/40"
          >
            기수 관리 →
          </Link>
        </div>
      </div>

      {/* Breadcrumb */}
      <nav className="mt-4 flex items-center gap-1.5 text-xs text-slate">
        <Link href="/admin/analytics" className="hover:text-ember hover:underline">
          분석
        </Link>
        <span>/</span>
        <span className="font-medium text-ink">기수 라이프사이클 퍼널</span>
      </nav>

      {/* Year filter */}
      <form method="get" className="mt-6 flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium text-ink">시험 연도</label>
        <select
          name="year"
          defaultValue={selectedYear ?? ""}
          className="rounded-2xl border border-ink/10 bg-white px-4 py-2 text-sm"
        >
          <option value="">전체</option>
          {availableYears.map((y) => (
            <option key={y} value={y}>
              {y}년
            </option>
          ))}
          {availableYears.length === 0 && (
            <option value={currentYear}>{currentYear}년</option>
          )}
        </select>
        <button
          type="submit"
          className="inline-flex items-center rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white transition hover:bg-forest"
        >
          조회
        </button>
        {selectedYear && (
          <Link
            href="/admin/analytics/cohort-funnel"
            className="text-sm text-slate hover:text-ember hover:underline"
          >
            초기화
          </Link>
        )}
      </form>

      {/* Client component */}
      <div className="mt-8">
        <FunnelClient rows={rows} kpis={kpis} />
      </div>

      <p className="mt-6 text-xs text-slate/70">
        * 최대 50개 기수를 조회합니다. 시험 연도를 선택하면 해당 연도 기수만 표시됩니다.
      </p>
    </div>
  );
}
