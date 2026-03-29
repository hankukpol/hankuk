import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { PassRateClient } from "./pass-rate-client";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function GraduatePassRatePage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.DIRECTOR);

  const sp = await searchParams;
  const rawExamCat = Array.isArray(sp.examCategory) ? sp.examCategory[0] : sp.examCategory;
  const rawYear = Array.isArray(sp.year) ? sp.year[0] : sp.year;

  const filterExamCategory = rawExamCat && ["GONGCHAE", "GYEONGCHAE", "SOGANG", "CUSTOM"].includes(rawExamCat)
    ? rawExamCat
    : "ALL";
  const filterYear = rawYear && /^\d{4}$/.test(rawYear) ? rawYear : "ALL";

  const db = getPrisma();

  // Fetch all cohorts
  const cohortsWhere = filterExamCategory !== "ALL"
    ? { examCategory: filterExamCategory as "GONGCHAE" | "GYEONGCHAE" | "SOGANG" | "CUSTOM" }
    : {};

  const cohorts = await db.cohort.findMany({
    where: {
      ...cohortsWhere,
      ...(filterYear !== "ALL" ? { targetExamYear: parseInt(filterYear) } : {}),
    },
    select: {
      id: true,
      name: true,
      examCategory: true,
      targetExamYear: true,
      startDate: true,
      endDate: true,
      enrollments: {
        where: { status: { in: ["ACTIVE", "COMPLETED"] } },
        select: {
          examNumber: true,
          student: {
            select: {
              graduateRecords: {
                select: {
                  passType: true,
                  writtenPassDate: true,
                  finalPassDate: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: [{ targetExamYear: "desc" }, { startDate: "desc" }],
  });

  // Available years from cohorts
  const allYears = Array.from(
    new Set(cohorts.map((c) => c.targetExamYear).filter((y): y is number => y !== null))
  ).sort((a, b) => b - a);

  // Build cohort rows
  const cohortRows = cohorts.map((cohort) => {
    const enrollments = cohort.enrollments;
    const totalGraduates = enrollments.length;

    let testTakers = 0;
    let passCount = 0;
    let finalPassCount = 0;

    for (const enrollment of enrollments) {
      const records = enrollment.student.graduateRecords;
      const hasTestRecord = records.some(
        (r) => r.passType === "WRITTEN_PASS" || r.passType === "WRITTEN_FAIL"
      );
      const hasPass = records.some(
        (r) =>
          r.passType === "WRITTEN_PASS" ||
          r.passType === "FINAL_PASS" ||
          r.passType === "APPOINTED"
      );
      const hasFinalPass = records.some(
        (r) => r.passType === "FINAL_PASS" || r.passType === "APPOINTED"
      );

      if (hasTestRecord) testTakers++;
      if (hasPass) passCount++;
      if (hasFinalPass) finalPassCount++;
    }

    const passRate = testTakers > 0 ? (passCount / testTakers) * 100 : 0;
    const finalPassRate = testTakers > 0 ? (finalPassCount / testTakers) * 100 : 0;

    return {
      cohortId: cohort.id,
      cohortName: cohort.name,
      examCategory: cohort.examCategory as string,
      targetExamYear: cohort.targetExamYear,
      totalGraduates,
      testTakers,
      passCount,
      finalPassCount,
      passRate,
      finalPassRate,
      vsAvg: 0, // will be computed below
    };
  });

  // Compute overall pass rate for vsAvg
  const totalTestTakers = cohortRows.reduce((s, r) => s + r.testTakers, 0);
  const totalPasses = cohortRows.reduce((s, r) => s + r.passCount, 0);
  const totalGraduates = cohortRows.reduce((s, r) => s + r.totalGraduates, 0);
  const overallPassRate = totalTestTakers > 0 ? (totalPasses / totalTestTakers) * 100 : 0;

  // Fill vsAvg
  for (const row of cohortRows) {
    row.vsAvg = row.passRate - overallPassRate;
  }

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb-style back */}
      <div className="flex items-center gap-2 text-sm text-slate">
        <Link href="/admin/graduates" className="hover:text-forest hover:underline underline-offset-2">
          합격자 관리
        </Link>
        <span>/</span>
        <span className="text-ink">합격률 분석</span>
      </div>

      {/* Page tag */}
      <div className="mt-4 inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-800">
        합격자 관리
      </div>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">합격률 분석</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            기수별 합격률 통계 및 트렌드를 분석합니다. 응시자 기준 합격률로
            기수 간 성과를 비교할 수 있습니다.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/graduates"
            className="inline-flex items-center gap-1.5 rounded-[28px] border border-ink/15 bg-white px-4 py-2 text-xs font-medium text-slate transition hover:border-forest/30 hover:text-forest"
          >
            합격자 현황
          </Link>
          <Link
            href="/admin/graduates/stats"
            className="inline-flex items-center gap-1.5 rounded-[28px] border border-ink/15 bg-white px-4 py-2 text-xs font-medium text-slate transition hover:border-forest/30 hover:text-forest"
          >
            합격자 통계
          </Link>
          <Link
            href="/admin/graduates/benchmark"
            className="inline-flex items-center gap-1.5 rounded-[28px] border border-ink/15 bg-white px-4 py-2 text-xs font-medium text-slate transition hover:border-forest/30 hover:text-forest"
          >
            합격자 벤치마크
          </Link>
        </div>
      </div>

      {/* Active filter badge */}
      {(filterExamCategory !== "ALL" || filterYear !== "ALL") && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate">적용된 필터:</span>
          {filterExamCategory !== "ALL" && (
            <span className="inline-flex items-center gap-1 rounded-full border border-forest/20 bg-forest/5 px-3 py-1 text-xs font-medium text-forest">
              {filterExamCategory === "GONGCHAE" ? "공채" : filterExamCategory === "GYEONGCHAE" ? "경채" : filterExamCategory}
              <Link href={`/admin/graduates/pass-rates${filterYear !== "ALL" ? `?year=${filterYear}` : ""}`} className="ml-1 hover:text-ember">
                ×
              </Link>
            </span>
          )}
          {filterYear !== "ALL" && (
            <span className="inline-flex items-center gap-1 rounded-full border border-forest/20 bg-forest/5 px-3 py-1 text-xs font-medium text-forest">
              {filterYear}년
              <Link href={`/admin/graduates/pass-rates${filterExamCategory !== "ALL" ? `?examCategory=${filterExamCategory}` : ""}`} className="ml-1 hover:text-ember">
                ×
              </Link>
            </span>
          )}
          <Link
            href="/admin/graduates/pass-rates"
            className="text-xs text-slate underline hover:text-ember"
          >
            초기화
          </Link>
        </div>
      )}

      <PassRateClient
        cohortRows={cohortRows}
        filterExamCategory={filterExamCategory}
        filterYear={filterYear}
        availableYears={allYears}
        overallPassRate={overallPassRate}
        totalGraduates={totalGraduates}
        totalTestTakers={totalTestTakers}
        totalPasses={totalPasses}
      />
    </div>
  );
}
