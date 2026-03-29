import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { SuspensionClient } from "./suspension-client";

export const dynamic = "force-dynamic";

function formatYearMonth(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export default async function SuspensionAnalysisPage() {
  await requireAdminContext(AdminRole.MANAGER);

  const db = getPrisma();
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;
  const currentMonthStr = formatYearMonth(currentYear, currentMonth);

  // ── 1. Currently suspended enrollments ──────────────────────────────────
  const suspendedEnrollments = await db.courseEnrollment.findMany({
    where: { status: "SUSPENDED" },
    select: {
      id: true,
      examNumber: true,
      cohortId: true,
      createdAt: true,
      updatedAt: true,
      student: { select: { name: true } },
      cohort: { select: { id: true, name: true } },
      leaveRecords: {
        orderBy: { leaveDate: "desc" },
        take: 1,
        select: {
          leaveDate: true,
          returnDate: true,
          reason: true,
        },
      },
    },
    orderBy: { updatedAt: "asc" },
  });

  // Build current suspended students list
  const currentSuspendedStudents = suspendedEnrollments.map((e) => {
    const latestLeave = e.leaveRecords[0];
    const suspendedDate = latestLeave?.leaveDate ?? e.updatedAt;
    const expectedReturn = latestLeave?.returnDate ?? null;
    const daysSuspended = Math.floor(
      (today.getTime() - suspendedDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    return {
      enrollmentId: e.id,
      examNumber: e.examNumber,
      studentName: e.student.name,
      cohortName: e.cohort?.name ?? null,
      cohortId: e.cohortId ?? null,
      suspendedDate: suspendedDate.toISOString(),
      expectedReturn: expectedReturn?.toISOString() ?? null,
      daysSuspended,
      reason: latestLeave?.reason ?? null,
    };
  });

  const totalCurrentSuspended = currentSuspendedStudents.length;

  // ── 2. New suspensions this month ───────────────────────────────────────
  const thisMonthStart = new Date(currentYear, currentMonth - 1, 1);
  const thisMonthEnd = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);

  const newThisMonthLeaves = await db.leaveRecord.count({
    where: {
      leaveDate: { gte: thisMonthStart, lte: thisMonthEnd },
    },
  });
  const newThisMonth = newThisMonthLeaves;

  // ── 3. Monthly data for last 12 months ──────────────────────────────────
  const months: { year: number; month: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    let y = currentYear;
    let m = currentMonth - i;
    while (m <= 0) {
      m += 12;
      y -= 1;
    }
    months.push({ year: y, month: m });
  }

  const rangeStart = new Date(months[0].year, months[0].month - 1, 1);

  const [allLeaveRecords, allReturnRecords] = await Promise.all([
    db.leaveRecord.findMany({
      where: { leaveDate: { gte: rangeStart, lte: thisMonthEnd } },
      select: { leaveDate: true },
    }),
    db.leaveRecord.findMany({
      where: {
        returnDate: { gte: rangeStart, lte: thisMonthEnd },
      },
      select: { returnDate: true },
    }),
  ]);

  const monthlyData = months.map(({ year, month }) => {
    const key = formatYearMonth(year, month);
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);

    const suspensions = allLeaveRecords.filter(
      (r) => r.leaveDate >= monthStart && r.leaveDate <= monthEnd
    ).length;

    const reinstatements = allReturnRecords.filter(
      (r) => r.returnDate! >= monthStart && r.returnDate! <= monthEnd
    ).length;

    return { month: key, suspensions, reinstatements };
  });

  // ── 4. Reinstatement rate ───────────────────────────────────────────────
  const totalSuspensionCount = await db.leaveRecord.count();
  const totalReinstatementCount = await db.leaveRecord.count({
    where: { returnDate: { not: null } },
  });
  const reinstatementRate =
    totalSuspensionCount > 0
      ? (totalReinstatementCount / totalSuspensionCount) * 100
      : 0;

  // ── 5. Average suspension duration (completed suspensions) ──────────────
  const completedLeaves = await db.leaveRecord.findMany({
    where: { returnDate: { not: null } },
    select: { leaveDate: true, returnDate: true },
  });
  const avgSuspensionDays =
    completedLeaves.length > 0
      ? completedLeaves.reduce((sum, r) => {
          const days = Math.floor(
            (r.returnDate!.getTime() - r.leaveDate.getTime()) /
              (1000 * 60 * 60 * 24)
          );
          return sum + days;
        }, 0) / completedLeaves.length
      : 0;

  // ── 6. Cohort comparison ─────────────────────────────────────────────────
  const cohortsWithEnrollments = await db.cohort.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      enrollments: {
        select: {
          status: true,
          leaveRecords: {
            select: { id: true },
          },
        },
      },
    },
    orderBy: { startDate: "desc" },
    take: 20,
  });

  const cohortData = cohortsWithEnrollments.map((c) => {
    const totalEnrollments = c.enrollments.length;
    const suspendedCount = c.enrollments.filter(
      (e) => e.leaveRecords.length > 0
    ).length;
    const suspensionRate =
      totalEnrollments > 0 ? (suspendedCount / totalEnrollments) * 100 : 0;
    return {
      cohortId: c.id,
      cohortName: c.name,
      totalEnrollments,
      suspendedCount,
      suspensionRate,
    };
  }).filter((c) => c.totalEnrollments > 0)
    .sort((a, b) => b.suspensionRate - a.suspensionRate);

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate">
        <Link href="/admin/reports" className="hover:text-forest hover:underline underline-offset-2">
          보고서
        </Link>
        <span>/</span>
        <span className="text-ink">휴원 분석</span>
      </div>

      {/* Page tag */}
      <div className="mt-4 inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-800">
        보고서
      </div>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">휴원 분석</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            수강생 휴원 및 복귀 패턴을 분석합니다. 장기 휴원 학생을 파악하고
            기수별 휴원율을 비교합니다.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/reports"
            className="inline-flex items-center gap-1.5 rounded-[28px] border border-ink/15 bg-white px-4 py-2 text-xs font-medium text-slate transition hover:border-forest/30 hover:text-forest"
          >
            보고서 센터
          </Link>
          <Link
            href={`/admin/reports/enrollment-status`}
            className="inline-flex items-center gap-1.5 rounded-[28px] border border-ink/15 bg-white px-4 py-2 text-xs font-medium text-slate transition hover:border-forest/30 hover:text-forest"
          >
            수강 현황
          </Link>
        </div>
      </div>

      {/* Period badge */}
      <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800">
        기준일: {today.getFullYear()}년 {today.getMonth() + 1}월{" "}
        {today.getDate()}일
      </div>

      <SuspensionClient
        currentSuspendedStudents={currentSuspendedStudents}
        monthlyData={monthlyData}
        cohortData={cohortData}
        totalCurrentSuspended={totalCurrentSuspended}
        newThisMonth={newThisMonth}
        reinstatementRate={reinstatementRate}
        avgSuspensionDays={avgSuspensionDays}
      />
    </div>
  );
}
