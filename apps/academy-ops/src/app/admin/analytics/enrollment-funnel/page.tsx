import { AdminRole, EnrollmentStatus } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import Link from "next/link";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";

export const dynamic = "force-dynamic";

function getMonthRange(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  return { start, end };
}

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return "—";
  return ((numerator / denominator) * 100).toFixed(1) + "%";
}

function pctNum(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

type MonthRow = {
  label: string; // "1월"
  visits: number;
  counseling: number;
  enrolled: number;
  completed: number;
  visitToCounseling: string;
  counselingToEnroll: string;
  enrollToComplete: string;
  visitToEnroll: string;
};

type CohortRow = {
  id: string;
  name: string;
  examCategory: string;
  enrolled: number;
  completed: number;
  completionRate: string;
};

export default async function EnrollmentFunnelPage() {
  await requireAdminContext(AdminRole.MANAGER);

  const db = getPrisma();

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // Build 6-month window (most recent 6 months)
  const months: { year: number; month: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    let m = currentMonth - i;
    let y = currentYear;
    while (m <= 0) {
      m += 12;
      y -= 1;
    }
    months.push({ year: y, month: m });
  }

  const sixMonthsAgo = new Date(months[0].year, months[0].month - 1, 1, 0, 0, 0, 0);

  // Fetch all raw counts in parallel
  const [
    prospectsByMonth,
    counselingByMonth,
    enrolledByMonth,
    completedByMonth,
    cohortEnrolled,
    cohortCompleted,
    cohortList,
  ] = await Promise.all([
    db.consultationProspect.groupBy({
      by: ["visitedAt"],
      where: { visitedAt: { gte: sixMonthsAgo } },
      _count: { id: true },
    }),
    db.counselingRecord.findMany({
      where: { counseledAt: { gte: sixMonthsAgo } },
      select: { counseledAt: true },
    }),
    db.courseEnrollment.findMany({
      where: {
        createdAt: { gte: sixMonthsAgo },
        status: { notIn: [EnrollmentStatus.PENDING] },
      },
      select: { createdAt: true, cohortId: true },
    }),
    db.courseEnrollment.findMany({
      where: {
        status: EnrollmentStatus.COMPLETED,
        updatedAt: { gte: sixMonthsAgo },
      },
      select: { updatedAt: true, cohortId: true },
    }),
    db.courseEnrollment.groupBy({
      by: ["cohortId"],
      where: {
        cohortId: { not: null },
        status: { notIn: [EnrollmentStatus.PENDING] },
        createdAt: { gte: sixMonthsAgo },
      },
      _count: { id: true },
    }),
    db.courseEnrollment.groupBy({
      by: ["cohortId"],
      where: {
        cohortId: { not: null },
        status: EnrollmentStatus.COMPLETED,
        updatedAt: { gte: sixMonthsAgo },
      },
      _count: { id: true },
    }),
    db.cohort.findMany({
      where: {
        createdAt: { gte: sixMonthsAgo },
        isActive: true,
      },
      select: { id: true, name: true, examCategory: true },
      orderBy: { startDate: "desc" },
      take: 15,
    }),
  ]);

  // Helper: bucket by month key "YYYY-MM"
  function toMonthKey(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  const visitMap = new Map<string, number>();
  for (const row of prospectsByMonth) {
    const key = toMonthKey(new Date(row.visitedAt));
    visitMap.set(key, (visitMap.get(key) ?? 0) + row._count.id);
  }

  const counselingMap = new Map<string, number>();
  for (const row of counselingByMonth) {
    const key = toMonthKey(new Date(row.counseledAt));
    counselingMap.set(key, (counselingMap.get(key) ?? 0) + 1);
  }

  const enrolledMap = new Map<string, number>();
  for (const row of enrolledByMonth) {
    const key = toMonthKey(new Date(row.createdAt));
    enrolledMap.set(key, (enrolledMap.get(key) ?? 0) + 1);
  }

  const completedMap = new Map<string, number>();
  for (const row of completedByMonth) {
    const key = toMonthKey(new Date(row.updatedAt));
    completedMap.set(key, (completedMap.get(key) ?? 0) + 1);
  }

  // Monthly trend rows
  const monthRows: MonthRow[] = months.map(({ year, month }) => {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    const visits = visitMap.get(key) ?? 0;
    const counseling = counselingMap.get(key) ?? 0;
    const enrolled = enrolledMap.get(key) ?? 0;
    const completed = completedMap.get(key) ?? 0;
    return {
      label: `${month}월`,
      visits,
      counseling,
      enrolled,
      completed,
      visitToCounseling: pct(counseling, visits),
      counselingToEnroll: pct(enrolled, counseling),
      enrollToComplete: pct(completed, enrolled),
      visitToEnroll: pct(enrolled, visits),
    };
  });

  // Current month KPIs
  const thisMonthKey = `${currentYear}-${String(currentMonth).padStart(2, "0")}`;
  const prevMonthDate = new Date(currentYear, currentMonth - 2, 1);
  const prevMonthKey = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, "0")}`;

  const thisEnrolled = enrolledMap.get(thisMonthKey) ?? 0;
  const prevEnrolled = enrolledMap.get(prevMonthKey) ?? 0;
  const thisVisits = visitMap.get(thisMonthKey) ?? 0;
  const thisCounseling = counselingMap.get(thisMonthKey) ?? 0;
  const thisCompleted = completedMap.get(thisMonthKey) ?? 0;

  const momChange =
    prevEnrolled === 0
      ? null
      : Math.round(((thisEnrolled - prevEnrolled) / prevEnrolled) * 100);

  // 6-month totals
  const totalVisits = monthRows.reduce((s, r) => s + r.visits, 0);
  const totalCounseling = monthRows.reduce((s, r) => s + r.counseling, 0);
  const totalEnrolled = monthRows.reduce((s, r) => s + r.enrolled, 0);
  const totalCompleted = monthRows.reduce((s, r) => s + r.completed, 0);

  // Cohort comparison
  const cohortEnrolledMap = new Map<string, number>();
  for (const row of cohortEnrolled) {
    if (row.cohortId) cohortEnrolledMap.set(row.cohortId, row._count.id);
  }
  const cohortCompletedMap = new Map<string, number>();
  for (const row of cohortCompleted) {
    if (row.cohortId) cohortCompletedMap.set(row.cohortId, row._count.id);
  }

  const EXAM_CAT_LABEL: Record<string, string> = {
    GONGCHAE: "공채",
    GYEONGCHAE: "경채",
    SOGANG: "소방",
    CUSTOM: "기타",
  };

  const cohortRows: CohortRow[] = cohortList
    .map((c) => {
      const enrolled = cohortEnrolledMap.get(c.id) ?? 0;
      const completed = cohortCompletedMap.get(c.id) ?? 0;
      return {
        id: c.id,
        name: c.name,
        examCategory: EXAM_CAT_LABEL[c.examCategory] ?? c.examCategory,
        enrolled,
        completed,
        completionRate: pct(completed, enrolled),
      };
    })
    .filter((r) => r.enrolled > 0)
    .sort((a, b) => b.enrolled - a.enrolled);

  // Funnel stages for current 6-month totals
  const funnelStages = [
    { label: "방문 상담", value: totalVisits, color: "bg-sky-500" },
    { label: "상담 기록", value: totalCounseling, color: "bg-blue-500" },
    { label: "수강 등록", value: totalEnrolled, color: "bg-forest" },
    { label: "수강 완료", value: totalCompleted, color: "bg-ember" },
  ];

  const maxFunnelValue = Math.max(...funnelStages.map((s) => s.value), 1);

  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "분석", href: "/admin/analytics" },
          { label: "수강 등록 퍼널" },
        ]}
      />

      <div className="mt-2">
        <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
          분석
        </div>
        <h1 className="mt-4 text-3xl font-semibold text-ink">수강 등록 파이프라인 퍼널</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate">
          최근 6개월 방문 상담 → 상담 기록 → 수강 등록 → 수강 완료 단계별 전환율을 분석합니다.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[20px] border border-forest/20 bg-forest/5 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate">이번달 신규 등록</p>
          <p className="mt-2 text-3xl font-bold text-forest">
            {thisEnrolled}
            <span className="ml-1 text-sm font-normal text-slate">건</span>
          </p>
        </div>
        <div className="rounded-[20px] border border-sky-200 bg-sky-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate">방문→등록 전환율</p>
          <p className="mt-2 text-3xl font-bold text-sky-700">
            {pct(thisEnrolled, thisVisits)}
          </p>
          <p className="mt-1 text-xs text-slate">
            방문 {thisVisits}건 중 등록 {thisEnrolled}건
          </p>
        </div>
        <div className="rounded-[20px] border border-ember/20 bg-ember/5 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate">완료율</p>
          <p className="mt-2 text-3xl font-bold text-ember">
            {pct(thisCompleted, thisEnrolled)}
          </p>
          <p className="mt-1 text-xs text-slate">
            등록 {thisEnrolled}건 중 완료 {thisCompleted}건
          </p>
        </div>
        <div className="rounded-[20px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate">전월 대비</p>
          <p className="mt-2 text-3xl font-bold text-ink">
            {momChange === null ? (
              <span className="text-slate text-xl">데이터 없음</span>
            ) : momChange >= 0 ? (
              <span className="text-forest">+{momChange}%</span>
            ) : (
              <span className="text-red-600">{momChange}%</span>
            )}
          </p>
          <p className="mt-1 text-xs text-slate">
            전월 {prevEnrolled}건 → 이번달 {thisEnrolled}건
          </p>
        </div>
      </div>

      {/* Funnel Visualization */}
      <div className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="text-lg font-semibold text-ink">6개월 누적 퍼널</h2>
        <p className="mt-1 text-xs text-slate">
          최근 6개월 ({months[0].year}년 {months[0].month}월 ~ {months[5].year}년 {months[5].month}월) 기준
        </p>

        <div className="mt-6 space-y-3">
          {funnelStages.map((stage, idx) => {
            const widthPct = maxFunnelValue > 0 ? Math.round((stage.value / maxFunnelValue) * 100) : 0;
            const nextStage = funnelStages[idx + 1];
            const conversionLabel = nextStage ? pct(nextStage.value, stage.value) : null;

            return (
              <div key={stage.label}>
                <div className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-right text-xs font-semibold text-slate">
                    {stage.label}
                  </span>
                  <div className="relative flex-1 rounded-full bg-ink/5 h-10 overflow-hidden">
                    <div
                      className={`absolute inset-y-0 left-0 ${stage.color} rounded-full flex items-center justify-end pr-3 transition-all`}
                      style={{ width: `${Math.max(widthPct, 4)}%` }}
                    >
                      <span className="text-xs font-bold text-white">
                        {stage.value.toLocaleString()}건
                      </span>
                    </div>
                  </div>
                  {conversionLabel && (
                    <div className="w-24 shrink-0 text-center">
                      <span className="inline-flex rounded-full bg-ink/5 px-2 py-0.5 text-xs font-semibold text-slate">
                        ↓ {conversionLabel}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Summary conversion row */}
        <div className="mt-6 flex flex-wrap gap-4 rounded-[16px] bg-mist/70 p-4">
          <div className="text-center">
            <p className="text-xs text-slate">방문→상담</p>
            <p className="mt-1 text-lg font-bold text-sky-700">{pct(totalCounseling, totalVisits)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-slate">상담→등록</p>
            <p className="mt-1 text-lg font-bold text-forest">{pct(totalEnrolled, totalCounseling)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-slate">등록→완료</p>
            <p className="mt-1 text-lg font-bold text-ember">{pct(totalCompleted, totalEnrolled)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-slate">방문→등록 (전체)</p>
            <p className="mt-1 text-lg font-bold text-ink">{pct(totalEnrolled, totalVisits)}</p>
          </div>
        </div>
      </div>

      {/* Monthly Trend Table */}
      <div className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="text-lg font-semibold text-ink">월별 추이</h2>
        <p className="mt-1 text-xs text-slate">최근 6개월 단계별 건수 및 전환율</p>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-left text-xs font-semibold uppercase tracking-wide text-slate">
                <th className="pb-3 pr-4">월</th>
                <th className="pb-3 pr-4 text-right">방문</th>
                <th className="pb-3 pr-4 text-right">상담</th>
                <th className="pb-3 pr-4 text-right">등록</th>
                <th className="pb-3 pr-4 text-right">완료</th>
                <th className="pb-3 pr-4 text-right">방문→상담</th>
                <th className="pb-3 pr-4 text-right">상담→등록</th>
                <th className="pb-3 pr-4 text-right">등록→완료</th>
                <th className="pb-3 text-right">방문→등록</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {monthRows.map((row, idx) => {
                const isThisMonth = idx === monthRows.length - 1;
                return (
                  <tr
                    key={row.label}
                    className={`${isThisMonth ? "bg-forest/5" : "hover:bg-mist/50"}`}
                  >
                    <td className="py-3 pr-4">
                      <span className={`font-semibold ${isThisMonth ? "text-forest" : "text-ink"}`}>
                        {row.label}
                        {isThisMonth && (
                          <span className="ml-1.5 rounded-full bg-forest/20 px-1.5 py-0.5 text-xs">이번달</span>
                        )}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-right text-sky-600 font-medium">{row.visits}</td>
                    <td className="py-3 pr-4 text-right text-blue-600 font-medium">{row.counseling}</td>
                    <td className="py-3 pr-4 text-right text-forest font-medium">{row.enrolled}</td>
                    <td className="py-3 pr-4 text-right text-ember font-medium">{row.completed}</td>
                    <td className="py-3 pr-4 text-right text-xs text-slate">{row.visitToCounseling}</td>
                    <td className="py-3 pr-4 text-right text-xs text-slate">{row.counselingToEnroll}</td>
                    <td className="py-3 pr-4 text-right text-xs text-slate">{row.enrollToComplete}</td>
                    <td className="py-3 text-right text-xs font-semibold text-ink">{row.visitToEnroll}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-ink/20 bg-mist/40 text-xs font-semibold">
                <td className="py-3 pr-4 text-ink">6개월 합계</td>
                <td className="py-3 pr-4 text-right text-sky-600">{totalVisits}</td>
                <td className="py-3 pr-4 text-right text-blue-600">{totalCounseling}</td>
                <td className="py-3 pr-4 text-right text-forest">{totalEnrolled}</td>
                <td className="py-3 pr-4 text-right text-ember">{totalCompleted}</td>
                <td className="py-3 pr-4 text-right text-slate">{pct(totalCounseling, totalVisits)}</td>
                <td className="py-3 pr-4 text-right text-slate">{pct(totalEnrolled, totalCounseling)}</td>
                <td className="py-3 pr-4 text-right text-slate">{pct(totalCompleted, totalEnrolled)}</td>
                <td className="py-3 text-right text-ink">{pct(totalEnrolled, totalVisits)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Cohort Comparison */}
      <div className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="text-lg font-semibold text-ink">기수별 전환 비교</h2>
        <p className="mt-1 text-xs text-slate">최근 6개월 기수별 수강 등록 수 및 완료율 (등록 있는 기수만 표시)</p>

        {cohortRows.length === 0 ? (
          <div className="mt-6 rounded-[16px] border border-dashed border-ink/10 py-10 text-center text-sm text-slate">
            해당 기간에 기수 데이터가 없습니다.
          </div>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 text-left text-xs font-semibold uppercase tracking-wide text-slate">
                  <th className="pb-3 pr-4 w-6 text-center">#</th>
                  <th className="pb-3 pr-4">기수명</th>
                  <th className="pb-3 pr-4">과정</th>
                  <th className="pb-3 pr-4 text-right">등록</th>
                  <th className="pb-3 pr-4 text-right">완료</th>
                  <th className="pb-3 text-right">완료율</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {cohortRows.map((row, i) => {
                  const completionPctNum = pctNum(row.completed, row.enrolled);
                  const barColor =
                    completionPctNum >= 70
                      ? "bg-forest"
                      : completionPctNum >= 40
                      ? "bg-amber-400"
                      : "bg-red-400";
                  return (
                    <tr key={row.id} className="hover:bg-mist/50">
                      <td className="py-3 pr-4 text-center text-xs text-slate">{i + 1}</td>
                      <td className="py-3 pr-4">
                        <Link
                          href={`/admin/cohorts/${row.id}`}
                          className="font-medium text-ink hover:text-ember hover:underline"
                        >
                          {row.name}
                        </Link>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="inline-flex rounded-full border border-ink/10 bg-ink/5 px-2 py-0.5 text-xs text-slate">
                          {row.examCategory}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-right font-semibold text-forest">
                        {row.enrolled}
                      </td>
                      <td className="py-3 pr-4 text-right font-semibold text-ember">
                        {row.completed}
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-20 rounded-full bg-ink/5 h-2 overflow-hidden">
                            <div
                              className={`h-full ${barColor} rounded-full`}
                              style={{ width: `${completionPctNum}%` }}
                            />
                          </div>
                          <span className="text-xs font-semibold text-ink w-12 text-right">
                            {row.completionRate}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/admin/analytics"
          className="inline-flex items-center rounded-full border border-ink/20 bg-white px-4 py-2 text-xs font-semibold text-slate transition hover:border-ink/40 hover:text-ink"
        >
          분석 허브로
        </Link>
        <Link
          href="/admin/analytics/counseling-conversion"
          className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
        >
          상담 전환 분석
        </Link>
        <Link
          href="/admin/analytics/enrollments"
          className="inline-flex items-center rounded-full border border-forest/20 bg-forest/5 px-4 py-2 text-xs font-semibold text-forest transition hover:bg-forest/10"
        >
          수강 분석
        </Link>
      </div>
    </div>
  );
}
