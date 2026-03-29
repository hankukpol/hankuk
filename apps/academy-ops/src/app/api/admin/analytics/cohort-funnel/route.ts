import { AdminRole } from "@prisma/client";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const yearStr = searchParams.get("year");
  const year = yearStr ? parseInt(yearStr, 10) : new Date().getFullYear();

  const prisma = getPrisma();

  // Get all cohorts, optionally filtered by targetExamYear
  const cohorts = await prisma.cohort.findMany({
    where: yearStr && !isNaN(year) ? { targetExamYear: year } : undefined,
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

  // Build a map: cohortId -> status -> count
  const countMap: Record<string, Record<string, number>> = {};
  for (const group of enrollmentGroups) {
    if (!group.cohortId) continue;
    if (!countMap[group.cohortId]) countMap[group.cohortId] = {};
    countMap[group.cohortId][group.status] = group._count.id;
  }

  // Build result rows
  const rows = cohorts.map((cohort) => {
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
      counts: {
        enrolled,
        active,
        suspended,
        completed,
        cancelled,
        withdrawn,
      },
      retentionRate,
      completionRate,
    };
  });

  // Overall KPIs
  const totalCohorts = rows.length;
  const avgRetentionRate =
    rows.filter((r) => r.retentionRate !== null).length > 0
      ? Math.round(
          rows
            .filter((r) => r.retentionRate !== null)
            .reduce((s, r) => s + (r.retentionRate ?? 0), 0) /
            rows.filter((r) => r.retentionRate !== null).length,
        )
      : null;
  const avgCompletionRate =
    rows.filter((r) => r.completionRate !== null).length > 0
      ? Math.round(
          rows
            .filter((r) => r.completionRate !== null)
            .reduce((s, r) => s + (r.completionRate ?? 0), 0) /
            rows.filter((r) => r.completionRate !== null).length,
        )
      : null;

  // Available years for filter
  const availableYears = await prisma.cohort.groupBy({
    by: ["targetExamYear"],
    where: { targetExamYear: { not: null } },
    orderBy: { targetExamYear: "desc" },
    _count: { id: true },
  });

  return Response.json({
    data: {
      rows,
      kpis: {
        totalCohorts,
        avgRetentionRate,
        avgCompletionRate,
      },
      availableYears: availableYears
        .map((g) => g.targetExamYear)
        .filter(Boolean),
      selectedYear: year,
    },
  });
}
