import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { ENROLLMENT_STATUS_LABEL, EXAM_TYPE_LABEL } from "@/lib/constants";
import {
  MonthlyTrendChart,
  ExamTypePieChart,
  StatusBarChart,
  type MonthlyTrendPoint,
  type ExamTypePoint,
  type StatusPoint,
} from "./enrollment-charts";

export const dynamic = "force-dynamic";

// ─── page ────────────────────────────────────────────────────────────────────

export default async function EnrollmentAnalyticsPage({
  searchParams,
}: {
  searchParams: { months?: string };
}) {
  await requireAdminContext(AdminRole.VIEWER);

  const months = Math.min(
    Math.max(parseInt(searchParams.months ?? "6", 10), 1),
    24,
  );

  const prisma = getPrisma();

  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);

  // ─── 1. 월별 신규 등록 수 ─────────────────────────────────────────────────
  const recentEnrollments = await prisma.courseEnrollment.findMany({
    where: {
      createdAt: { gte: startDate },
      status: { not: "WAITING" },
    },
    select: { createdAt: true },
  });

  const monthlyMap = new Map<string, number>();
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - months + 1 + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthlyMap.set(key, 0);
  }
  for (const e of recentEnrollments) {
    const d = new Date(e.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (monthlyMap.has(key)) {
      monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + 1);
    }
  }
  const monthlyTrend: MonthlyTrendPoint[] = Array.from(monthlyMap.entries()).map(
    ([month, count]) => ({ month, count }),
  );

  // ─── 2. 시험 유형별 분포 (활성 등록 기준) ────────────────────────────────
  const activeForExamType = await prisma.courseEnrollment.findMany({
    where: { status: { in: ["PENDING", "ACTIVE", "SUSPENDED"] } },
    select: { student: { select: { examType: true } } },
  });

  const examTypeMap = new Map<string, number>();
  for (const e of activeForExamType) {
    const key = e.student.examType;
    examTypeMap.set(key, (examTypeMap.get(key) ?? 0) + 1);
  }
  const examTypeDistribution: ExamTypePoint[] = Array.from(examTypeMap.entries()).map(
    ([examType, count]) => ({
      examType,
      count,
      label: EXAM_TYPE_LABEL[examType as keyof typeof EXAM_TYPE_LABEL] ?? examType,
    }),
  );

  // ─── 3. 수강 상태별 카운트 ────────────────────────────────────────────────
  const statusCounts = await prisma.courseEnrollment.groupBy({
    by: ["status"],
    _count: { status: true },
    orderBy: { _count: { status: "desc" } },
  });
  const statusDistribution: StatusPoint[] = statusCounts.map((row) => ({
    status: row.status,
    count: row._count.status,
    label: ENROLLMENT_STATUS_LABEL[row.status] ?? row.status,
  }));

  // ─── summary stats ────────────────────────────────────────────────────────
  const totalActive =
    statusDistribution.find((s) => s.status === "ACTIVE")?.count ?? 0;
  const totalPending =
    statusDistribution.find((s) => s.status === "PENDING")?.count ?? 0;
  const totalAll = statusDistribution.reduce((s, r) => s + r.count, 0);
  const newThisPeriod = monthlyTrend.reduce((s, r) => s + r.count, 0);

  // ─── render ───────────────────────────────────────────────────────────────
  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        수강 통계
      </div>
      <h1 className="mt-5 text-3xl font-semibold">수강 등록 통계</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        월별 신규 등록 추이, 시험 유형별 분포, 수강 상태별 현황을 한눈에 확인합니다.
      </p>

      {/* Month selector */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-slate">조회 기간:</span>
        {[3, 6, 12].map((m) => (
          <Link
            key={m}
            href={`/admin/analytics/enrollments?months=${m}`}
            className={[
              "rounded-full border px-3 py-1 text-sm font-medium transition-colors",
              months === m
                ? "border-forest bg-forest text-white"
                : "border-ink/20 bg-white text-ink hover:border-forest/40 hover:text-forest",
            ].join(" ")}
          >
            최근 {m}개월
          </Link>
        ))}
      </div>

      {/* Summary KPI cards */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">수강 중</p>
          <p className="mt-2 text-3xl font-semibold text-forest">
            {totalActive.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">명</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">신청(미납)</p>
          <p className="mt-2 text-3xl font-semibold text-amber-600">
            {totalPending.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">명</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">
            최근 {months}개월 신규
          </p>
          <p className="mt-2 text-3xl font-semibold text-ember">
            {newThisPeriod.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">건</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">전체 등록</p>
          <p className="mt-2 text-3xl font-semibold text-ink">
            {totalAll.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">건</p>
        </div>
      </div>

      {/* Charts */}
      <div className="mt-8 grid gap-6 xl:grid-cols-3">
        {/* Monthly trend */}
        <section className="xl:col-span-2 rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">월별 신규 등록 추이</h2>
          <p className="mt-1 text-xs text-slate">
            최근 {months}개월간 신규 수강 등록 건수 (대기 제외)
          </p>
          <div className="mt-6">
            <MonthlyTrendChart data={monthlyTrend} />
          </div>
        </section>

        {/* Exam type distribution */}
        <section className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">시험 유형별 분포</h2>
          <p className="mt-1 text-xs text-slate">
            현재 수강 중·신청·휴원 학생 기준
          </p>
          <div className="mt-6">
            {examTypeDistribution.length === 0 ? (
              <div className="flex h-[260px] items-center justify-center text-sm text-slate">
                데이터 없음
              </div>
            ) : (
              <ExamTypePieChart data={examTypeDistribution} />
            )}
          </div>
        </section>
      </div>

      {/* Status bar chart */}
      <section className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">수강 상태별 현황</h2>
        <p className="mt-1 text-xs text-slate">전체 등록 건수 기준</p>
        <div className="mt-6">
          {statusDistribution.length === 0 ? (
            <div className="flex h-[260px] items-center justify-center text-sm text-slate">
              데이터 없음
            </div>
          ) : (
            <StatusBarChart data={statusDistribution} />
          )}
        </div>

        {/* Status legend table */}
        <div className="mt-6 overflow-x-auto rounded-[20px] border border-ink/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-mist">
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                  수강 상태
                </th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                  건수
                </th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                  비율
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {statusDistribution.map((row) => (
                <tr key={row.status} className="hover:bg-mist/60 transition-colors">
                  <td className="px-5 py-3 font-medium text-ink">{row.label}</td>
                  <td className="px-5 py-3 text-right font-mono text-sm text-ink">
                    {row.count.toLocaleString()}건
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-sm text-slate">
                    {totalAll > 0 ? ((row.count / totalAll) * 100).toFixed(1) : "0.0"}%
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-ink/10 bg-mist/80">
                <td className="px-5 py-3 text-xs font-semibold text-slate">합계</td>
                <td className="px-5 py-3 text-right font-mono text-sm font-semibold text-ink">
                  {totalAll.toLocaleString()}건
                </td>
                <td className="px-5 py-3 text-right font-mono text-sm font-semibold text-slate">
                  100.0%
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* Navigation shortcut */}
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/admin/analytics"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink hover:border-forest/40 hover:text-forest transition-colors"
        >
          ← 성적 분석으로
        </Link>
        <Link
          href="/admin/analytics/retention"
          className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-700 hover:border-sky-400 hover:bg-sky-100 transition-colors"
        >
          재원율 분석 →
        </Link>
        <Link
          href="/admin/payments/unpaid"
          className="inline-flex items-center gap-1.5 rounded-full border border-ember/30 bg-ember/5 px-4 py-2 text-sm font-medium text-ember hover:border-ember hover:bg-ember hover:text-white transition-colors"
        >
          미납 관리 →
        </Link>
      </div>
    </div>
  );
}
