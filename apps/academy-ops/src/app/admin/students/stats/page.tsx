import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { StatsCharts } from "./stats-charts";
import type { StatsChartsData } from "./stats-charts";

export const dynamic = "force-dynamic";

export default async function StudentStatsPage() {
  await requireAdminContext(AdminRole.TEACHER);

  const prisma = getPrisma();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1, 0, 0, 0, 0);

  // ── KPI queries ──────────────────────────────────────────────────────────────
  const [totalStudents, activeStudents, newThisMonth, inactiveCount] = await Promise.all([
    prisma.student.count(),
    prisma.student.count({ where: { isActive: true } }),
    prisma.student.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.student.count({ where: { isActive: false } }),
  ]);

  // ── Chart data queries ───────────────────────────────────────────────────────
  const [examTypeRaw, generationRaw, monthlyRaw, latestEnrollments] = await Promise.all([
    prisma.student.groupBy({
      by: ["examType"],
      _count: { examType: true },
    }),
    prisma.student.groupBy({
      by: ["generation"],
      _count: { generation: true },
      where: { generation: { not: null } },
      orderBy: { generation: "asc" },
    }),
    prisma.student.findMany({
      where: { createdAt: { gte: twelveMonthsAgo } },
      select: { createdAt: true },
    }),
    prisma.$queryRaw<{ status: string; cnt: bigint }[]>`
      SELECT ce.status, COUNT(*) AS cnt
      FROM "CourseEnrollment" ce
      INNER JOIN (
        SELECT "examNumber", MAX("createdAt") AS max_created
        FROM "CourseEnrollment"
        GROUP BY "examNumber"
      ) latest ON ce."examNumber" = latest."examNumber"
        AND ce."createdAt" = latest.max_created
      GROUP BY ce.status
    `,
  ]);

  // Build examTypeDistribution
  const examTypeDistribution = examTypeRaw.map((r) => ({
    examType: r.examType as string,
    count: r._count.examType,
  }));

  // Build gradeDistribution
  const gradeDistribution = generationRaw.map((r) => ({
    generation: r.generation !== null ? String(r.generation) : "미정",
    count: r._count.generation,
  }));

  // Build monthlyNewStudents
  const monthlyMap = new Map<string, number>();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthlyMap.set(key, 0);
  }
  for (const s of monthlyRaw) {
    const d = s.createdAt;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (monthlyMap.has(key)) {
      monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + 1);
    }
  }
  const monthlyNewStudents = Array.from(monthlyMap.entries()).map(([month, count]) => ({
    month,
    count,
  }));

  // Build statusDistribution
  const statusDistribution = latestEnrollments.map((r) => ({
    status: r.status,
    count: Number(r.cnt),
  }));

  const chartsData: StatsChartsData = {
    examTypeDistribution,
    statusDistribution,
    monthlyNewStudents,
    gradeDistribution,
  };

  return (
    <div className="space-y-8 p-8 sm:p-10">
      {/* Header */}
      <div>
        <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
          학사 관리
        </div>
        <h1 className="mt-5 text-3xl font-semibold">학생 통계</h1>
        <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
          전체 학생 현황을 시험 유형, 수강 상태, 월별 신규 등록, 기수별 분포로 분석합니다.
        </p>
        <div className="mt-4">
          <Link
            prefetch={false}
            href="/admin/students"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate transition hover:text-ember"
          >
            <span>←</span>
            <span>학생 목록으로</span>
          </Link>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-[28px] border border-ink/10 bg-white p-6">
          <p className="text-sm text-slate">총 학생 수</p>
          <p className="mt-3 text-3xl font-semibold">
            {totalStudents.toLocaleString()}
            <span className="ml-1 text-base font-normal text-slate">명</span>
          </p>
          <p className="mt-2 text-xs text-slate">전체 등록된 학생</p>
        </article>

        <article className="rounded-[28px] border border-forest/20 bg-forest/5 p-6">
          <p className="text-sm text-slate">수강 중</p>
          <p className="mt-3 text-3xl font-semibold text-forest">
            {activeStudents.toLocaleString()}
            <span className="ml-1 text-base font-normal text-slate">명</span>
          </p>
          <p className="mt-2 text-xs text-slate">현재 활성 학생</p>
        </article>

        <article className="rounded-[28px] border border-ember/20 bg-ember/5 p-6">
          <p className="text-sm text-slate">이번 달 신규</p>
          <p className="mt-3 text-3xl font-semibold text-ember">
            {newThisMonth.toLocaleString()}
            <span className="ml-1 text-base font-normal text-slate">명</span>
          </p>
          <p className="mt-2 text-xs text-slate">
            {now.getFullYear()}년 {now.getMonth() + 1}월 신규 등록
          </p>
        </article>

        <article className="rounded-[28px] border border-ink/10 bg-white p-6">
          <p className="text-sm text-slate">비활성</p>
          <p className="mt-3 text-3xl font-semibold text-slate">
            {inactiveCount.toLocaleString()}
            <span className="ml-1 text-base font-normal text-slate">명</span>
          </p>
          <p className="mt-2 text-xs text-slate">비활성 처리된 학생</p>
        </article>
      </div>

      {/* Charts */}
      <StatsCharts data={chartsData} />
    </div>
  );
}
