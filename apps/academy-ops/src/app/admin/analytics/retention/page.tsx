import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { ENROLLMENT_STATUS_LABEL } from "@/lib/constants";

export const dynamic = "force-dynamic";

// ─── helpers ─────────────────────────────────────────────────────────────────

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return "0.0%";
  return ((numerator / denominator) * 100).toFixed(1) + "%";
}

function monthLabel(year: number, month: number): string {
  return `${year}년 ${month}월`;
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default async function RetentionAnalyticsPage() {
  await requireAdminContext(AdminRole.MANAGER);

  const prisma = getPrisma();
  const now = new Date();

  // Month boundaries
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  // 6-month window start
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  // ─── 1. Summary KPIs ────────────────────────────────────────────────────────

  const [enrollmentStats, withdrawalCount, completionCount, uniqueStudentData] =
    await Promise.all([
      // Status breakdown (all non-waiting)
      prisma.courseEnrollment.groupBy({
        by: ["status"],
        _count: { status: true },
        where: { status: { not: "WAITING" } },
      }),

      // This month: WITHDRAWN or CANCELLED
      prisma.courseEnrollment.count({
        where: {
          status: { in: ["WITHDRAWN", "CANCELLED"] },
          updatedAt: { gte: monthStart, lte: monthEnd },
        },
      }),

      // This month: COMPLETED
      prisma.courseEnrollment.count({
        where: {
          status: "COMPLETED",
          updatedAt: { gte: monthStart, lte: monthEnd },
        },
      }),

      // Re-enrollment rate: students with 2+ enrollments vs all enrolled students
      prisma.courseEnrollment.groupBy({
        by: ["examNumber"],
        _count: { examNumber: true },
        where: { status: { not: "WAITING" } },
      }),
    ]);

  const totalEnrollments = enrollmentStats.reduce((s, r) => s + r._count.status, 0);
  const activeCount =
    enrollmentStats
      .filter((r) => r.status === "ACTIVE" || r.status === "PENDING" || r.status === "SUSPENDED")
      .reduce((s, r) => s + r._count.status, 0);
  const retentionRate = pct(activeCount, totalEnrollments);

  const totalUniqueStudents = uniqueStudentData.length;
  const reEnrolledStudents = uniqueStudentData.filter((r) => r._count.examNumber >= 2).length;
  const reEnrollmentRate = pct(reEnrolledStudents, totalUniqueStudents);

  // ─── 2. Monthly Trend (last 6 months) ────────────────────────────────────

  // Fetch all enrollments in the last 6 months
  const recentEnrollments = await prisma.courseEnrollment.findMany({
    where: {
      status: { not: "WAITING" },
      createdAt: { gte: sixMonthsAgo },
    },
    select: {
      createdAt: true,
      status: true,
      updatedAt: true,
    },
  });

  // Build month buckets (last 6 months)
  type MonthBucket = {
    year: number;
    month: number;
    newCount: number;
    completedCount: number;
    withdrawnCount: number;
  };

  const monthBuckets: MonthBucket[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthBuckets.push({
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      newCount: 0,
      completedCount: 0,
      withdrawnCount: 0,
    });
  }

  for (const e of recentEnrollments) {
    const created = new Date(e.createdAt);
    const ky = created.getFullYear();
    const km = created.getMonth() + 1;
    const bucket = monthBuckets.find((b) => b.year === ky && b.month === km);
    if (bucket) {
      bucket.newCount++;
    }

    // Completion and withdrawal: track by updatedAt month
    if (e.status === "COMPLETED" || e.status === "WITHDRAWN" || e.status === "CANCELLED") {
      const updated = new Date(e.updatedAt);
      const uy = updated.getFullYear();
      const um = updated.getMonth() + 1;
      const ub = monthBuckets.find((b) => b.year === uy && b.month === um);
      if (ub) {
        if (e.status === "COMPLETED") ub.completedCount++;
        else ub.withdrawnCount++;
      }
    }
  }

  const monthlyTrend = monthBuckets;

  // ─── 3. Cohort Survival (last 6 months) ────────────────────────────────────

  const cohorts = await prisma.cohort.findMany({
    where: {
      startDate: { gte: sixMonthsAgo },
    },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      _count: {
        select: {
          enrollments: true,
        },
      },
    },
    orderBy: { startDate: "desc" },
    take: 12,
  });

  // For each cohort, count active enrollments
  const cohortSurvivalData = await Promise.all(
    cohorts.map(async (c) => {
      const [activeInCohort, nonWaitingCount] = await Promise.all([
        prisma.courseEnrollment.count({
          where: {
            cohortId: c.id,
            status: { in: ["ACTIVE", "PENDING", "SUSPENDED"] },
          },
        }),
        prisma.courseEnrollment.count({
          where: {
            cohortId: c.id,
            status: { not: "WAITING" },
          },
        }),
      ]);
      return {
        id: c.id,
        name: c.name,
        startDate: c.startDate,
        endDate: c.endDate,
        total: nonWaitingCount,
        active: activeInCohort,
        survivalRate:
          nonWaitingCount > 0
            ? ((activeInCohort / nonWaitingCount) * 100).toFixed(1)
            : "—",
      };
    })
  );

  // ─── 4. Re-enrollment section ─────────────────────────────────────────────

  // Students with 3+ enrollments
  const loyalStudents = uniqueStudentData.filter((r) => r._count.examNumber >= 3).length;
  const avgEnrollments =
    totalUniqueStudents > 0
      ? (
          uniqueStudentData.reduce((s, r) => s + r._count.examNumber, 0) /
          totalUniqueStudents
        ).toFixed(2)
      : "0.00";

  // Students with 5+ enrollments
  const dist5plus = uniqueStudentData.filter((r) => r._count.examNumber >= 5).length;

  // ─── render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        분석
      </div>
      <h1 className="mt-5 text-3xl font-semibold">재원율 분석</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        수강생 유지율, 중도탈락, 재등록 현황을 분석합니다.
      </p>

      {/* Summary KPIs */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">현재 재원율</p>
          <p className="mt-2 text-3xl font-semibold text-forest">{retentionRate}</p>
          <p className="mt-1 text-xs text-slate">
            {activeCount.toLocaleString()} / {totalEnrollments.toLocaleString()}건
          </p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">이번 달 중도탈락</p>
          <p className="mt-2 text-3xl font-semibold text-red-600">
            {withdrawalCount.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">퇴원·취소 건</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">이번 달 수료</p>
          <p className="mt-2 text-3xl font-semibold text-ember">
            {completionCount.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">수강 완료 건</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">재등록률</p>
          <p className="mt-2 text-3xl font-semibold text-sky-600">{reEnrollmentRate}</p>
          <p className="mt-1 text-xs text-slate">
            {reEnrolledStudents.toLocaleString()} / {totalUniqueStudents.toLocaleString()}명
          </p>
        </div>
      </div>

      {/* 수강 상태 요약 */}
      <section className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">수강 상태별 현황</h2>
        <p className="mt-1 text-xs text-slate">대기(WAITING) 제외한 전체 등록 건 기준</p>
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
              {enrollmentStats
                .sort((a, b) => b._count.status - a._count.status)
                .map((row) => (
                  <tr key={row.status} className="transition-colors hover:bg-mist/60">
                    <td className="px-5 py-3 font-medium text-ink">
                      {ENROLLMENT_STATUS_LABEL[row.status] ?? row.status}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-sm text-ink">
                      {row._count.status.toLocaleString()}건
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-sm text-slate">
                      {pct(row._count.status, totalEnrollments)}
                    </td>
                  </tr>
                ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-ink/10 bg-mist/80">
                <td className="px-5 py-3 text-xs font-semibold text-slate">합계</td>
                <td className="px-5 py-3 text-right font-mono text-sm font-semibold text-ink">
                  {totalEnrollments.toLocaleString()}건
                </td>
                <td className="px-5 py-3 text-right font-mono text-sm font-semibold text-slate">
                  100.0%
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* 월별 추이 */}
      <section className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">월별 추이</h2>
        <p className="mt-1 text-xs text-slate">최근 6개월 신규 등록·수료·중도탈락 현황</p>
        <div className="mt-6 overflow-x-auto rounded-[20px] border border-ink/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-mist">
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                  월
                </th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                  신규 등록
                </th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                  수료
                </th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                  중도탈락
                </th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                  탈락률
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {monthlyTrend.map((row) => {
                const total = row.newCount;
                const dropRate = total > 0
                  ? ((row.withdrawnCount / total) * 100).toFixed(1) + "%"
                  : "—";
                return (
                  <tr
                    key={monthKey(row.year, row.month)}
                    className="transition-colors hover:bg-mist/60"
                  >
                    <td className="px-5 py-3 font-medium text-ink">
                      {monthLabel(row.year, row.month)}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-sm text-forest">
                      {row.newCount.toLocaleString()}건
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-sm text-slate">
                      {row.completedCount.toLocaleString()}건
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-sm text-red-600">
                      {row.withdrawnCount.toLocaleString()}건
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-sm text-slate">
                      {dropRate}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 기수별 생존율 */}
      <section className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">기수별 생존율</h2>
        <p className="mt-1 text-xs text-slate">
          최근 6개월 이내 시작한 기수의 등록 대비 현재 재원 비율
        </p>
        {cohortSurvivalData.length === 0 ? (
          <div className="mt-6 rounded-[20px] border border-dashed border-ink/10 py-10 text-center text-sm text-slate">
            최근 6개월 이내에 시작한 기수가 없습니다.
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto rounded-[20px] border border-ink/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist">
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    기수명
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                    시작일
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                    종료일
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                    총 등록
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                    현재 재원
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                    생존율
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {cohortSurvivalData.map((c) => (
                  <tr key={c.id} className="transition-colors hover:bg-mist/60">
                    <td className="px-5 py-3 font-medium text-ink">
                      <Link
                        href={`/admin/settings/cohorts/${c.id}`}
                        className="text-forest hover:underline"
                      >
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-sm text-slate">
                      {c.startDate.toLocaleDateString("ko-KR", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                      })}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-sm text-slate">
                      {c.endDate.toLocaleDateString("ko-KR", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                      })}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-sm text-ink">
                      {c.total.toLocaleString()}명
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-sm text-forest">
                      {c.active.toLocaleString()}명
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-sm">
                      <span
                        className={
                          parseFloat(c.survivalRate) >= 70
                            ? "text-forest font-semibold"
                            : parseFloat(c.survivalRate) >= 40
                            ? "text-amber-600 font-semibold"
                            : "text-red-600 font-semibold"
                        }
                      >
                        {c.survivalRate === "—" ? "—" : c.survivalRate + "%"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 재등록 현황 */}
      <section className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">재등록 현황</h2>
        <p className="mt-1 text-xs text-slate">수강 이력이 있는 전체 학생 기준</p>

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-[20px] border border-ink/10 bg-mist p-4">
            <p className="text-xs text-slate">전체 수강 학생</p>
            <p className="mt-2 text-2xl font-semibold text-ink">
              {totalUniqueStudents.toLocaleString()}명
            </p>
          </div>
          <div className="rounded-[20px] border border-ink/10 bg-mist p-4">
            <p className="text-xs text-slate">재등록 경험 (2회 이상)</p>
            <p className="mt-2 text-2xl font-semibold text-sky-600">
              {reEnrolledStudents.toLocaleString()}명
            </p>
          </div>
          <div className="rounded-[20px] border border-ink/10 bg-mist p-4">
            <p className="text-xs text-slate">충성 수강생 (3회 이상)</p>
            <p className="mt-2 text-2xl font-semibold text-forest">
              {loyalStudents.toLocaleString()}명
            </p>
          </div>
          <div className="rounded-[20px] border border-ink/10 bg-mist p-4">
            <p className="text-xs text-slate">1인 평균 등록 횟수</p>
            <p className="mt-2 text-2xl font-semibold text-ember">{avgEnrollments}회</p>
          </div>
        </div>

        {/* 등록 횟수 분포 */}
        <div className="mt-6 overflow-x-auto rounded-[20px] border border-ink/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-mist">
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                  등록 횟수
                </th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                  학생 수
                </th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                  비율
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {[1, 2, 3, 4].map((cnt) => {
                const count = uniqueStudentData.filter(
                  (r) => r._count.examNumber === cnt
                ).length;
                return (
                  <tr key={cnt} className="transition-colors hover:bg-mist/60">
                    <td className="px-5 py-3 font-medium text-ink">{cnt}회</td>
                    <td className="px-5 py-3 text-right font-mono text-sm text-ink">
                      {count.toLocaleString()}명
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-sm text-slate">
                      {pct(count, totalUniqueStudents)}
                    </td>
                  </tr>
                );
              })}
              <tr className="transition-colors hover:bg-mist/60">
                <td className="px-5 py-3 font-medium text-ink">5회 이상</td>
                <td className="px-5 py-3 text-right font-mono text-sm text-ink">
                  {dist5plus.toLocaleString()}명
                </td>
                <td className="px-5 py-3 text-right font-mono text-sm text-slate">
                  {pct(dist5plus, totalUniqueStudents)}
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-ink/10 bg-mist/80">
                <td className="px-5 py-3 text-xs font-semibold text-slate">합계</td>
                <td className="px-5 py-3 text-right font-mono text-sm font-semibold text-ink">
                  {totalUniqueStudents.toLocaleString()}명
                </td>
                <td className="px-5 py-3 text-right font-mono text-sm font-semibold text-slate">
                  100.0%
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* Navigation */}
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/admin/analytics/enrollments"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-forest/40 hover:text-forest"
        >
          ← 수강 등록 통계
        </Link>
        <Link
          href="/admin/enrollments"
          className="inline-flex items-center gap-1.5 rounded-full border border-ember/30 bg-ember/5 px-4 py-2 text-sm font-medium text-ember transition-colors hover:border-ember hover:bg-ember hover:text-white"
        >
          수강 관리 →
        </Link>
        <Link
          href="/admin/payments/unpaid"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-forest/40 hover:text-forest"
        >
          미납 관리 →
        </Link>
      </div>
    </div>
  );
}
