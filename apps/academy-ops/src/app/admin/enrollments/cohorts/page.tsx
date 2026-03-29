import Link from "next/link";
import { AdminRole, ExamCategory } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { CohortCards, type CohortCardData } from "./cohort-cards";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: { examType?: string; showInactive?: string };
}

export default async function CohortEnrollmentDashboardPage({
  searchParams,
}: PageProps) {
  await requireAdminContext(AdminRole.VIEWER);

  const rawExamType = searchParams.examType ?? "";
  const showInactive = searchParams.showInactive === "1";

  // Build examCategory filter
  const validCategories: ExamCategory[] = ["GONGCHAE", "GYEONGCHAE", "SOGANG", "CUSTOM"];
  const examCategoryFilter =
    validCategories.includes(rawExamType as ExamCategory)
      ? (rawExamType as ExamCategory)
      : undefined;

  // Fetch cohorts with enrollment counts
  const rawCohorts = await getPrisma().cohort.findMany({
    where: {
      ...(showInactive ? {} : { isActive: true }),
      ...(examCategoryFilter ? { examCategory: examCategoryFilter } : {}),
    },
    include: {
      enrollments: {
        select: { status: true },
      },
    },
    orderBy: [
      { isActive: "desc" },
      { startDate: "desc" },
      { name: "asc" },
    ],
  });

  // Aggregate counts
  const cohorts: CohortCardData[] = rawCohorts.map(({ enrollments, ...cohort }) => {
    const activeCount = enrollments.filter(
      (e) => e.status === "ACTIVE" || e.status === "PENDING",
    ).length;
    const waitingCount = enrollments.filter((e) => e.status === "WAITING").length;
    return { ...cohort, activeCount, waitingCount };
  });

  // Check if there are any inactive cohorts (for toggle button)
  const hasInactiveCohorts = showInactive
    ? cohorts.some((c) => !c.isActive)
    : await getPrisma().cohort.count({ where: { isActive: false } }).then((n) => n > 0);

  // KPI summary — always over ALL active cohorts regardless of filter
  const allActiveCohorts = await getPrisma().cohort.findMany({
    where: { isActive: true },
    include: {
      enrollments: { select: { status: true } },
    },
  });
  const totalActive = allActiveCohorts.length;
  const totalStudents = allActiveCohorts.reduce(
    (sum, c) =>
      sum +
      c.enrollments.filter(
        (e) => e.status === "ACTIVE" || e.status === "PENDING",
      ).length,
    0,
  );
  const totalWaiting = allActiveCohorts.reduce(
    (sum, c) => sum + c.enrollments.filter((e) => e.status === "WAITING").length,
    0,
  );

  return (
    <div className="space-y-8 p-8 sm:p-10">
      {/* Page header */}
      <div>
        <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
          수강 관리
        </div>
        <h1 className="mt-5 text-3xl font-semibold text-ink">기수별 수강 현황</h1>
        <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
          개설된 기수의 수강인원과 잔여 정원을 확인합니다.
        </p>

        {/* Nav links */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            href="/admin/enrollments"
            className="inline-flex items-center gap-1.5 rounded-xl border border-ink/15 px-4 py-2 text-sm font-medium text-ink hover:bg-ink/5 transition-colors"
          >
            ← 수강 목록
          </Link>
          <Link
            href="/admin/enrollments/new"
            className="inline-flex items-center gap-1.5 rounded-xl bg-ember px-4 py-2 text-sm font-semibold text-white hover:bg-ember/90 transition-colors"
          >
            + 수강 등록 →
          </Link>
        </div>
      </div>

      {/* Cards section (client component handles filters & interactive toggle) */}
      <CohortCards
        cohorts={cohorts}
        examCategoryFilter={rawExamType}
        showInactive={showInactive}
        totalActive={totalActive}
        totalStudents={totalStudents}
        totalWaiting={totalWaiting}
        hasInactiveCohorts={hasInactiveCohorts}
      />
    </div>
  );
}
