import { AdminRole, ExamCategory } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const sp = request.nextUrl.searchParams;
  const status = sp.get("status"); // "ACTIVE" | null
  const examCategory = sp.get("examCategory") as ExamCategory | null;

  const now = new Date();

  const rawCohorts = await getPrisma().cohort.findMany({
    where: {
      ...(status === "ACTIVE" ? { isActive: true } : {}),
      ...(examCategory ? { examCategory } : {}),
    },
    orderBy: [{ startDate: "desc" }],
    include: {
      enrollments: {
        select: { status: true, createdAt: true },
      },
    },
  });

  // 이번 달 시작
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

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

    return {
      ...cohort,
      activeCount,
      waitlistCount,
      newThisMonth,
      availableSeats,
    };
  });

  // KPI 집계
  const activeCohorts = cohorts.filter((c) => c.isActive);
  const totalStudents = activeCohorts.reduce((sum, c) => sum + c.activeCount, 0);
  const totalWaiting = activeCohorts.reduce((sum, c) => sum + c.waitlistCount, 0);
  const totalNewThisMonth = activeCohorts.reduce((sum, c) => sum + c.newThisMonth, 0);

  return NextResponse.json({
    cohorts,
    kpi: {
      activeCohortCount: activeCohorts.length,
      totalStudents,
      totalWaiting,
      totalNewThisMonth,
    },
  });
}
