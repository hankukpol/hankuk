import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function readStringParam(
  sp: Record<string, string | string[] | undefined> | undefined,
  key: string,
): string | undefined {
  const v = sp?.[key];
  return typeof v === "string" ? v : undefined;
}

type CounselorStat = {
  counselorName: string;
  total: number;
  uniqueStudents: number;
  avgPerStudent: number;
  busiestDay: string | null;
  prevTotal: number;
  delta: number | null;
};

type WeekBucket = {
  weekLabel: string;
  weekStart: Date;
  counts: Map<string, number>;
};

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay()); // Sunday as week start
  return d;
}

function formatWeekLabel(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}주`;
}

function getBusiestDay(records: { counseledAt: Date }[]): string | null {
  if (records.length === 0) return null;
  const dayCounts: Record<number, number> = {};
  for (const r of records) {
    const day = r.counseledAt.getDay();
    dayCounts[day] = (dayCounts[day] ?? 0) + 1;
  }
  const maxDay = Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0];
  return maxDay ? `${WEEKDAY_KO[parseInt(maxDay[0])]}요일` : null;
}

export default async function CounselorPerformancePage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.MANAGER);

  const daysParam = readStringParam(searchParams, "days");
  const periodDays = daysParam ? parseInt(daysParam, 10) || 30 : 30;

  const now = new Date();
  const currentPeriodStart = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);
  const prevPeriodStart = new Date(now.getTime() - 2 * periodDays * 24 * 60 * 60 * 1000);

  const prisma = getPrisma();

  // Fetch current and previous period records
  const [currentRecords, prevRecords] = await Promise.all([
    prisma.counselingRecord.findMany({
      where: { counseledAt: { gte: currentPeriodStart } },
      select: {
        id: true,
        examNumber: true,
        counselorName: true,
        counseledAt: true,
      },
      orderBy: { counseledAt: "asc" },
    }),
    prisma.counselingRecord.findMany({
      where: {
        counseledAt: {
          gte: prevPeriodStart,
          lt: currentPeriodStart,
        },
      },
      select: {
        id: true,
        examNumber: true,
        counselorName: true,
        counseledAt: true,
      },
    }),
  ]);

  // Build per-counselor stats for current period
  type CounselorAccum = {
    total: number;
    students: Set<string>;
    records: { counseledAt: Date }[];
  };
  const counselorMap = new Map<string, CounselorAccum>();

  for (const r of currentRecords) {
    if (!counselorMap.has(r.counselorName)) {
      counselorMap.set(r.counselorName, { total: 0, students: new Set(), records: [] });
    }
    const acc = counselorMap.get(r.counselorName)!;
    acc.total += 1;
    acc.students.add(r.examNumber);
    acc.records.push({ counseledAt: r.counseledAt });
  }

  // Build prev period totals per counselor
  const prevMap = new Map<string, number>();
  for (const r of prevRecords) {
    prevMap.set(r.counselorName, (prevMap.get(r.counselorName) ?? 0) + 1);
  }

  const counselorStats: CounselorStat[] = Array.from(counselorMap.entries())
    .map(([counselorName, acc]) => {
      const prevTotal = prevMap.get(counselorName) ?? 0;
      const delta = prevTotal > 0 ? acc.total - prevTotal : null;
      return {
        counselorName,
        total: acc.total,
        uniqueStudents: acc.students.size,
        avgPerStudent:
          acc.students.size > 0
            ? Math.round((acc.total / acc.students.size) * 10) / 10
            : 0,
        busiestDay: getBusiestDay(acc.records),
        prevTotal,
        delta,
      };
    })
    .sort((a, b) => b.total - a.total);

  // Global KPIs
  const totalCounselors = counselorStats.length;
  const totalSessionsCurrent = currentRecords.length;
  const totalSessionsPrev = prevRecords.length;
  const avgPerCounselor =
    totalCounselors > 0
      ? Math.round((totalSessionsCurrent / totalCounselors) * 10) / 10
      : 0;
  const momDelta = totalSessionsPrev > 0 ? totalSessionsCurrent - totalSessionsPrev : null;
  const momDeltaPct =
    totalSessionsPrev > 0
      ? Math.round(((totalSessionsCurrent - totalSessionsPrev) / totalSessionsPrev) * 1000) / 10
      : null;

  // Build weekly timeline buckets (last periodDays)
  // Collect all unique counselor names for chart
  const allCounselorNames = Array.from(new Set(currentRecords.map((r) => r.counselorName)));

  // Group records by week
  const weekMap = new Map<string, WeekBucket>();
  for (const r of currentRecords) {
    const ws = getWeekStart(r.counseledAt);
    const key = ws.toISOString();
    if (!weekMap.has(key)) {
      weekMap.set(key, { weekLabel: formatWeekLabel(ws), weekStart: ws, counts: new Map() });
    }
    const bucket = weekMap.get(key)!;
    bucket.counts.set(r.counselorName, (bucket.counts.get(r.counselorName) ?? 0) + 1);
  }

  const weeks = Array.from(weekMap.values()).sort(
    (a, b) => a.weekStart.getTime() - b.weekStart.getTime(),
  );

  // Compute max count for bar scaling
  let maxWeekCount = 1;
  for (const w of weeks) {
    const total = Array.from(w.counts.values()).reduce((a, b) => a + b, 0);
    if (total > maxWeekCount) maxWeekCount = total;
  }

  // Color palette for counselors (CSS only)
  const CHART_COLORS = [
    "bg-ember",
    "bg-forest",
    "bg-sky-500",
    "bg-violet-500",
    "bg-amber-500",
    "bg-teal-500",
    "bg-pink-500",
    "bg-indigo-500",
  ];

  const PERIOD_OPTIONS = [
    { days: 30, label: "30일" },
    { days: 60, label: "60일" },
    { days: 90, label: "90일" },
  ];

  return (
    <div className="space-y-8 p-8 sm:p-10">
      {/* Header */}
      <div>
        <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
          상담 성과
        </div>
        <h1 className="mt-5 text-3xl font-semibold">상담사 성과 대시보드</h1>
        <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
          기간별 상담사 면담 건수, 담당 학생 수, 전월 대비 성과를 분석합니다.
        </p>
        <div className="mt-4">
          <Link
            prefetch={false}
            href="/admin/counseling"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate transition hover:text-ember"
          >
            <span>←</span>
            <span>상담 목록으로</span>
          </Link>
        </div>
      </div>

      {/* Period selector */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-slate">기간:</span>
        {PERIOD_OPTIONS.map((opt) => (
          <Link
            key={opt.days}
            prefetch={false}
            href={`/admin/counseling/performance?days=${opt.days}`}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
              periodDays === opt.days
                ? "border-ink bg-ink text-white"
                : "border-ink/10 bg-white text-slate hover:border-ink/30 hover:text-ink"
            }`}
          >
            {opt.label}
          </Link>
        ))}
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-[28px] border border-ink/10 bg-white p-6">
          <p className="text-sm text-slate">총 상담 직원</p>
          <p className="mt-3 text-3xl font-semibold">
            {totalCounselors}
            <span className="ml-1 text-base font-normal text-slate">명</span>
          </p>
          <p className="mt-2 text-xs text-slate">이번 기간 활동 상담사</p>
        </article>

        <article className="rounded-[28px] border border-forest/20 bg-forest/5 p-6">
          <p className="text-sm text-slate">이번 기간 총 면담</p>
          <p className="mt-3 text-3xl font-semibold text-forest">
            {totalSessionsCurrent}
            <span className="ml-1 text-base font-normal text-slate">건</span>
          </p>
          <p className="mt-2 text-xs text-slate">최근 {periodDays}일</p>
        </article>

        <article className="rounded-[28px] border border-ink/10 bg-white p-6">
          <p className="text-sm text-slate">1인당 평균</p>
          <p className="mt-3 text-3xl font-semibold">
            {avgPerCounselor}
            <span className="ml-1 text-base font-normal text-slate">건</span>
          </p>
          <p className="mt-2 text-xs text-slate">상담사 1인 평균 면담 건수</p>
        </article>

        <article
          className={`rounded-[28px] border p-6 ${
            momDelta !== null && momDelta > 0
              ? "border-forest/20 bg-forest/5"
              : momDelta !== null && momDelta < 0
              ? "border-red-200 bg-red-50"
              : "border-ink/10 bg-white"
          }`}
        >
          <p className="text-sm text-slate">전월 대비</p>
          <p
            className={`mt-3 text-3xl font-semibold ${
              momDelta !== null && momDelta > 0
                ? "text-forest"
                : momDelta !== null && momDelta < 0
                ? "text-red-600"
                : ""
            }`}
          >
            {momDelta !== null ? (
              <>
                {momDelta > 0 ? "+" : ""}
                {momDelta}
                <span className="ml-1 text-base font-normal text-slate">건</span>
              </>
            ) : (
              <span className="text-slate">-</span>
            )}
          </p>
          <p className="mt-2 text-xs text-slate">
            {momDeltaPct !== null
              ? `${momDeltaPct > 0 ? "+" : ""}${momDeltaPct}% 변화`
              : "이전 기간 데이터 없음"}
          </p>
        </article>
      </div>

      {/* Per-counselor table */}
      <section className="rounded-[28px] border border-ink/10 bg-white">
        <div className="border-b border-ink/10 px-6 py-5">
          <h2 className="text-xl font-semibold">상담사별 성과</h2>
          <p className="mt-1 text-sm text-slate">
            최근 {periodDays}일 기준 · 이전 {periodDays}일 대비 변화 포함
          </p>
        </div>

        {counselorStats.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate">
            해당 기간에 상담 기록이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <thead className="bg-mist/60 text-left">
                <tr>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-slate">
                    상담사
                  </th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-slate">
                    총 면담
                  </th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-slate">
                    담당 학생
                  </th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-slate">
                    1인당 평균
                  </th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-slate">
                    가장 바쁜 요일
                  </th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-slate">
                    전기간 대비
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {counselorStats.map((c) => (
                  <tr key={c.counselorName} className="transition hover:bg-mist/30">
                    <td className="px-6 py-4 font-semibold text-ink">{c.counselorName}</td>
                    <td className="px-6 py-4">{c.total}건</td>
                    <td className="px-6 py-4">{c.uniqueStudents}명</td>
                    <td className="px-6 py-4">{c.avgPerStudent}건</td>
                    <td className="px-6 py-4 text-slate">{c.busiestDay ?? "-"}</td>
                    <td className="px-6 py-4">
                      {c.delta !== null ? (
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                            c.delta > 0
                              ? "border-forest/20 bg-forest/10 text-forest"
                              : c.delta < 0
                              ? "border-red-200 bg-red-50 text-red-600"
                              : "border-slate-200 bg-slate-50 text-slate-600"
                          }`}
                        >
                          {c.delta > 0 ? "+" : ""}
                          {c.delta}건
                        </span>
                      ) : (
                        <span className="text-xs text-slate">신규</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Weekly timeline chart (CSS-only stacked bar) */}
      {weeks.length > 0 && (
        <section className="rounded-[28px] border border-ink/10 bg-white p-6">
          <div className="mb-6">
            <h2 className="text-xl font-semibold">주차별 면담 현황</h2>
            <p className="mt-1 text-sm text-slate">
              상담사별 색상으로 구분된 주차 스택형 막대 차트
            </p>
          </div>

          {/* Legend */}
          {allCounselorNames.length > 0 && (
            <div className="mb-6 flex flex-wrap gap-3">
              {allCounselorNames.map((name, idx) => (
                <div key={name} className="flex items-center gap-1.5">
                  <span
                    className={`inline-block h-3 w-3 rounded-full ${CHART_COLORS[idx % CHART_COLORS.length]}`}
                  />
                  <span className="text-xs text-slate">{name}</span>
                </div>
              ))}
            </div>
          )}

          {/* Bars */}
          <div className="flex items-end gap-2">
            {weeks.map((w) => {
              const weekTotal = Array.from(w.counts.values()).reduce((a, b) => a + b, 0);
              const barHeight = maxWeekCount > 0 ? (weekTotal / maxWeekCount) * 160 : 0;

              return (
                <div key={w.weekStart.toISOString()} className="flex flex-1 flex-col items-center gap-2">
                  {/* Stacked bar */}
                  <div
                    className="relative w-full overflow-hidden rounded-t-lg"
                    style={{ height: `${Math.max(barHeight, 4)}px` }}
                    title={`${w.weekLabel}: ${weekTotal}건`}
                  >
                    {allCounselorNames.map((name, idx) => {
                      const count = w.counts.get(name) ?? 0;
                      if (count === 0) return null;
                      const pct = weekTotal > 0 ? (count / weekTotal) * 100 : 0;
                      return (
                        <div
                          key={name}
                          className={`absolute left-0 right-0 ${CHART_COLORS[idx % CHART_COLORS.length]} opacity-80`}
                          style={{
                            height: `${pct}%`,
                            bottom: `${allCounselorNames
                              .slice(0, idx)
                              .reduce(
                                (acc, n) =>
                                  acc + (weekTotal > 0 ? ((w.counts.get(n) ?? 0) / weekTotal) * 100 : 0),
                                0,
                              )}%`,
                          }}
                          title={`${name}: ${count}건`}
                        />
                      );
                    })}
                  </div>

                  {/* Count label */}
                  <span className="text-xs font-medium text-ink">{weekTotal}</span>

                  {/* Week label */}
                  <span className="text-xs text-slate">{w.weekLabel}</span>
                </div>
              );
            })}
          </div>

          {/* Y-axis hint */}
          <div className="mt-2 text-right text-xs text-slate">건수</div>
        </section>
      )}
    </div>
  );
}
