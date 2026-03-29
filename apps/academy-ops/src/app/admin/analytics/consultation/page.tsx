import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ─── helpers ──────────────────────────────────────────────────────────────────

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return "0.0%";
  return ((numerator / denominator) * 100).toFixed(1) + "%";
}

function monthLabel(year: number, month: number): string {
  return `${year}년 ${month}월`;
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default async function ConsultationAnalyticsDashboard() {
  await requireAdminContext(AdminRole.MANAGER);

  const prisma = getPrisma();
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);

  // ─── 1. Fetch data in parallel ───────────────────────────────────────────────

  const [
    recentRecords,
    ytdRecords,
    counselorGroupsThisMonth,
    enrolledStudentsThisMonth,
  ] = await Promise.all([
    // Last 6 months records
    prisma.counselingRecord.findMany({
      where: { counseledAt: { gte: sixMonthsAgo } },
      select: {
        id: true,
        examNumber: true,
        counselorName: true,
        content: true,
        counseledAt: true,
      },
    }),

    // Year-to-date count
    prisma.counselingRecord.count({
      where: { counseledAt: { gte: yearStart } },
    }),

    // This month per-counselor counts
    prisma.counselingRecord.groupBy({
      by: ["counselorName"],
      where: { counseledAt: { gte: thisMonthStart } },
      _count: { counselorName: true },
      orderBy: { _count: { counselorName: "desc" } },
    }),

    // Students who had a counseling record AND enrolled this month
    prisma.student.findMany({
      where: {
        counselingRecords: { some: { counseledAt: { gte: thisMonthStart } } },
        courseEnrollments: { some: { createdAt: { gte: thisMonthStart } } },
      },
      select: {
        examNumber: true,
        counselingRecords: {
          where: { counseledAt: { gte: thisMonthStart } },
          select: { counselorName: true },
          take: 1,
        },
      },
    }),
  ]);

  // ─── 2. Monthly trend buckets (6 months) ────────────────────────────────────

  type MonthBucket = {
    year: number;
    month: number;
    label: string;
    count: number;
    uniqueStudents: Set<string>;
  };

  const buckets: MonthBucket[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      label: monthLabel(d.getFullYear(), d.getMonth() + 1),
      count: 0,
      uniqueStudents: new Set(),
    });
  }

  for (const r of recentRecords) {
    const d = new Date(r.counseledAt);
    const b = buckets.find(
      (x) => x.year === d.getFullYear() && x.month === d.getMonth() + 1,
    );
    if (b) {
      b.count++;
      b.uniqueStudents.add(r.examNumber);
    }
  }

  const maxBarCount = Math.max(...buckets.map((b) => b.count), 1);

  // ─── 3. Channel breakdown (infer from content keywords) ──────────────────────

  const thisMonthRecords = recentRecords.filter((r) => {
    const d = new Date(r.counseledAt);
    return d >= thisMonthStart;
  });

  type ChannelKey = "신규방문" | "전화" | "재방문" | "온라인";

  const channelCounts: Record<ChannelKey, number> = {
    신규방문: 0,
    전화: 0,
    재방문: 0,
    온라인: 0,
  };

  for (const r of thisMonthRecords) {
    if (r.content.startsWith("[전화]") || r.content.includes("전화")) {
      channelCounts["전화"]++;
    } else if (
      r.content.startsWith("[온라인]") ||
      r.content.includes("온라인") ||
      r.content.includes("화상")
    ) {
      channelCounts["온라인"]++;
    } else if (r.content.startsWith("[재방문]") || r.content.includes("재방문")) {
      channelCounts["재방문"]++;
    } else {
      channelCounts["신규방문"]++;
    }
  }

  const channelColors: Record<ChannelKey, string> = {
    신규방문: "#1F4D3A",
    전화: "#3B82F6",
    재방문: "#F59E0B",
    온라인: "#8B5CF6",
  };

  const channelTotal = Object.values(channelCounts).reduce((s, n) => s + n, 0);

  // Build CSS conic-gradient segments for donut chart
  let donutGradient = "conic-gradient(";
  let cumulative = 0;
  const channelEntries = Object.entries(channelCounts) as [
    ChannelKey,
    number,
  ][];
  donutGradient += channelEntries
    .map(([key, cnt]) => {
      const start = channelTotal > 0 ? (cumulative / channelTotal) * 360 : 0;
      const end =
        channelTotal > 0 ? ((cumulative + cnt) / channelTotal) * 360 : 0;
      cumulative += cnt;
      return `${channelColors[key]} ${start.toFixed(1)}deg ${end.toFixed(1)}deg`;
    })
    .join(", ");
  donutGradient += ")";

  // ─── 4. Per-staff conversion table ──────────────────────────────────────────

  // Map counselorName -> set of unique counseled students this month
  const counselorStudentMap = new Map<string, Set<string>>();
  for (const r of thisMonthRecords) {
    if (!counselorStudentMap.has(r.counselorName)) {
      counselorStudentMap.set(r.counselorName, new Set());
    }
    counselorStudentMap.get(r.counselorName)!.add(r.examNumber);
  }

  // Build counselor conversions
  type CounselorStat = {
    name: string;
    thisMonthCount: number;
    convertedCount: number;
    conversionRate: string;
    isTopPerformer: boolean;
  };

  // Build a map of examNumber -> counselorName who converted them
  const convertedStudentMap = new Map<string, string>();
  for (const s of enrolledStudentsThisMonth) {
    const counselorName = s.counselingRecords[0]?.counselorName;
    if (counselorName) {
      convertedStudentMap.set(s.examNumber, counselorName);
    }
  }

  const counselorStats: CounselorStat[] = Array.from(
    counselorStudentMap.entries(),
  )
    .map(([name, studentsSet]) => {
      const converted = [...studentsSet].filter((en) => {
        return [...enrolledStudentsThisMonth].some(
          (s) => s.examNumber === en,
        );
      }).length;
      return {
        name,
        thisMonthCount: studentsSet.size,
        convertedCount: converted,
        conversionRate: pct(converted, studentsSet.size),
        isTopPerformer: false,
      };
    })
    .sort((a, b) => b.convertedCount - a.convertedCount);

  // Mark top performer
  if (counselorStats.length > 0) {
    counselorStats[0].isTopPerformer = true;
  }

  // ─── 5. KPIs ─────────────────────────────────────────────────────────────────

  const thisMonthCount = buckets[buckets.length - 1]?.count ?? 0;
  const lastMonthCount = buckets[buckets.length - 2]?.count ?? 0;
  const thisMonthConversions = enrolledStudentsThisMonth.length;
  const thisMonthCounseledStudents = buckets[buckets.length - 1]?.uniqueStudents.size ?? 0;
  const overallConversionRate = pct(thisMonthConversions, thisMonthCounseledStudents);
  const deltaCount = thisMonthCount - lastMonthCount;

  // YTD target (rough: 30 records per month)
  const ytdTarget = (now.getMonth() + 1) * 30;

  // ─── render ───────────────────────────────────────────────────────────────────

  return (
    <div className="p-8 sm:p-10">
      {/* Badge */}
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        상담 분석
      </div>

      {/* Header */}
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">상담 분석 대시보드</h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-slate">
            월별 상담 추이, 채널 분석, 직원별 전환율을 한눈에 확인합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/consultations"
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-forest/40 hover:text-forest"
          >
            상담 목록
          </Link>
          <Link
            href="/admin/analytics/counseling-conversion"
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-forest/40 hover:text-forest"
          >
            전환 퍼널 →
          </Link>
        </div>
      </div>

      {/* Breadcrumb */}
      <nav className="mt-4 flex items-center gap-1.5 text-xs text-slate">
        <Link href="/admin/analytics" className="hover:text-ember hover:underline">
          분석
        </Link>
        <span>/</span>
        <span className="font-medium text-ink">상담 분석 대시보드</span>
      </nav>

      {/* KPI cards */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">
            이번달 상담 건수
          </p>
          <p className="mt-2 text-3xl font-semibold text-forest">
            {thisMonthCount.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">
            {deltaCount > 0 ? (
              <span className="text-green-600">+{deltaCount} 전월 대비</span>
            ) : deltaCount < 0 ? (
              <span className="text-red-500">{deltaCount} 전월 대비</span>
            ) : (
              "전월 동일"
            )}
          </p>
        </div>

        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">
            수강 전환 수
          </p>
          <p className="mt-2 text-3xl font-semibold text-ember">
            {thisMonthConversions.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">이번달 상담 후 등록</p>
        </div>

        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">
            상담→등록 전환율
          </p>
          <p className="mt-2 text-3xl font-semibold text-ink">
            {overallConversionRate}
          </p>
          <p className="mt-1 text-xs text-slate">이번달 기준</p>
        </div>

        <div className="rounded-[28px] border border-forest/20 bg-forest/5 p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">
            연간 누적 상담
          </p>
          <p className="mt-2 text-3xl font-semibold text-forest">
            {ytdRecords.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">
            목표 대비{" "}
            <span
              className={
                ytdRecords >= ytdTarget ? "text-green-600" : "text-red-500"
              }
            >
              {pct(ytdRecords, ytdTarget)}
            </span>
          </p>
        </div>
      </div>

      {/* Two-column section: bar chart + donut */}
      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)]">
        {/* Monthly bar chart */}
        <section className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-ink">
            월별 상담 건수 추이
          </h2>
          <p className="mt-1 text-xs text-slate">최근 6개월</p>

          <div className="mt-6 flex items-end gap-3">
            {buckets.map((b) => {
              const barH =
                maxBarCount > 0
                  ? Math.max(4, Math.round((b.count / maxBarCount) * 160))
                  : 4;
              const isCurrentMonth =
                b.year === now.getFullYear() && b.month === now.getMonth() + 1;

              return (
                <div
                  key={`${b.year}-${b.month}`}
                  className="flex flex-1 flex-col items-center gap-1.5"
                >
                  <span className="text-xs font-semibold text-ink">
                    {b.count > 0 ? b.count : ""}
                  </span>
                  <div
                    className={`w-full rounded-t-lg transition-all ${
                      isCurrentMonth ? "bg-ember" : "bg-forest/40"
                    }`}
                    style={{ height: `${barH}px` }}
                  />
                  <span
                    className={`text-center text-xs ${
                      isCurrentMonth ? "font-semibold text-ember" : "text-slate"
                    }`}
                  >
                    {b.label.replace("년 ", ".").replace("월", "")}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Horizontal gridlines */}
          <div className="mt-4 border-t border-ink/10 pt-3">
            <div className="flex items-center justify-between text-xs text-slate">
              <span>0</span>
              <span>{Math.round(maxBarCount / 2)}</span>
              <span>{maxBarCount}</span>
            </div>
          </div>
        </section>

        {/* Channel donut */}
        <section className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-ink">채널별 상담 비중</h2>
          <p className="mt-1 text-xs text-slate">이번달 기준</p>

          <div className="mt-6 flex flex-col items-center gap-6">
            {/* Donut via CSS */}
            <div
              className="relative flex-shrink-0"
              style={{ width: 140, height: 140 }}
            >
              <div
                className="h-full w-full rounded-full"
                style={{
                  background:
                    channelTotal > 0 ? donutGradient : "#e5e7eb",
                }}
              />
              {/* Center hole */}
              <div
                className="absolute inset-0 m-auto rounded-full bg-white"
                style={{ width: 76, height: 76, top: "50%", left: "50%", transform: "translate(-50%,-50%)" }}
              >
                <div className="flex h-full flex-col items-center justify-center">
                  <span className="text-xl font-bold text-ink">
                    {channelTotal}
                  </span>
                  <span className="text-xs text-slate">건</span>
                </div>
              </div>
            </div>

            {/* Legend */}
            <div className="w-full space-y-2">
              {channelEntries.map(([key, cnt]) => (
                <div key={key} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-3 w-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: channelColors[key] }}
                    />
                    <span className="text-sm text-ink">{key}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-ink">{cnt}건</span>
                    <span className="w-12 text-right text-xs text-slate">
                      {pct(cnt, channelTotal)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* Conversion funnel (visual) */}
      <section className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-ink">
          직원별 전환 퍼널 (이번달)
        </h2>
        <p className="mt-1 text-xs text-slate">
          상담 건수 대비 수강 등록 전환 비율
        </p>

        {thisMonthCount === 0 ? (
          <div className="mt-6 rounded-[20px] border border-dashed border-ink/10 py-10 text-center text-sm text-slate">
            이번달 상담 기록이 없습니다.
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {counselorStats.slice(0, 8).map((row) => {
              const barWidth =
                thisMonthCounseledStudents > 0
                  ? (row.thisMonthCount / thisMonthCounseledStudents) * 100
                  : 0;
              const convertBarWidth =
                row.thisMonthCount > 0
                  ? (row.convertedCount / row.thisMonthCount) * 100
                  : 0;

              return (
                <div key={row.name} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 font-medium text-ink">
                      {row.name}
                      {row.isTopPerformer && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                          Top
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-slate">
                      상담 {row.thisMonthCount}건 · 전환 {row.convertedCount}건 ·{" "}
                      <strong className="text-ember">{row.conversionRate}</strong>
                    </span>
                  </div>
                  <div className="relative h-4 w-full overflow-hidden rounded-full bg-mist">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-forest/30"
                      style={{ width: `${barWidth.toFixed(1)}%` }}
                    />
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-ember"
                      style={{ width: `${convertBarWidth.toFixed(1)}%` }}
                    />
                  </div>
                  <div className="flex gap-4 text-xs text-slate">
                    <span>
                      <span
                        className="mr-1 inline-block h-2 w-2 rounded-full bg-forest/30"
                      />
                      상담 {row.thisMonthCount}건
                    </span>
                    <span>
                      <span
                        className="mr-1 inline-block h-2 w-2 rounded-full bg-ember"
                      />
                      전환 {row.convertedCount}건
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Per-staff table */}
      <section className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-ink">직원별 상담 성과</h2>
        <p className="mt-1 text-xs text-slate">이번달 기준 · 고유 학생 수 기준</p>

        {counselorStats.length === 0 ? (
          <div className="mt-6 rounded-[20px] border border-dashed border-ink/10 py-10 text-center text-sm text-slate">
            이번달 상담 기록이 없습니다.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-[20px] border border-ink/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist">
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    이름
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                    이번달 상담수
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                    전환수
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                    전환율
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    비고
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {counselorStats.map((row, idx) => (
                  <tr
                    key={row.name}
                    className={`transition-colors hover:bg-mist/60 ${
                      row.isTopPerformer ? "bg-amber-50/50" : ""
                    }`}
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold bg-ink/5 text-slate">
                          {idx + 1}
                        </span>
                        <span className="font-medium text-ink">{row.name}</span>
                        {row.isTopPerformer && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                            Top
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums font-semibold text-ink">
                      {row.thisMonthCount}명
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums font-semibold text-forest">
                      {row.convertedCount}명
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums font-bold text-ember">
                      {row.conversionRate}
                    </td>
                    <td className="px-5 py-3">
                      {row.isTopPerformer && (
                        <span className="text-xs text-amber-600">
                          이번달 최다 전환
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-ink/10 bg-mist/80">
                  <td className="px-5 py-3 text-xs font-semibold text-slate">
                    합계
                  </td>
                  <td className="px-5 py-3 text-right text-xs font-semibold tabular-nums text-ink">
                    {counselorStats
                      .reduce((s, r) => s + r.thisMonthCount, 0)
                      .toLocaleString()}
                    명
                  </td>
                  <td className="px-5 py-3 text-right text-xs font-semibold tabular-nums text-forest">
                    {counselorStats
                      .reduce((s, r) => s + r.convertedCount, 0)
                      .toLocaleString()}
                    명
                  </td>
                  <td className="px-5 py-3 text-right text-xs font-semibold tabular-nums text-ember">
                    {overallConversionRate}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* YTD vs Target */}
      <section className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-ink">
          연간 누적 상담 vs 목표
        </h2>
        <p className="mt-1 text-xs text-slate">
          {now.getFullYear()}년 1월 – 현재 (월 30건 기준 목표)
        </p>
        <div className="mt-5 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-ink">
              누적 실적{" "}
              <span className="font-bold text-forest">
                {ytdRecords.toLocaleString()}건
              </span>
            </span>
            <span className="text-xs text-slate">
              목표{" "}
              <span className="font-semibold text-ink">
                {ytdTarget.toLocaleString()}건
              </span>
            </span>
          </div>

          {/* Progress bar */}
          <div className="h-4 w-full overflow-hidden rounded-full bg-mist">
            <div
              className={`h-full rounded-full transition-all ${
                ytdRecords >= ytdTarget ? "bg-forest" : "bg-ember/80"
              }`}
              style={{
                width: `${Math.min(100, (ytdRecords / ytdTarget) * 100).toFixed(1)}%`,
              }}
            />
          </div>

          <div className="flex items-center justify-between text-xs text-slate">
            <span>0</span>
            <span
              className={`font-semibold ${
                ytdRecords >= ytdTarget ? "text-forest" : "text-ember"
              }`}
            >
              {pct(ytdRecords, ytdTarget)} 달성
            </span>
            <span>{ytdTarget.toLocaleString()}건</span>
          </div>
        </div>

        {/* Monthly trend mini table */}
        <div className="mt-6 overflow-x-auto rounded-[20px] border border-ink/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-mist">
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                  월
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                  건수
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                  학생 수
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                  비율 (6개월 내)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {buckets.map((b) => {
                const isCurrentMonth =
                  b.year === now.getFullYear() && b.month === now.getMonth() + 1;
                const totalInWindow = buckets.reduce((s, x) => s + x.count, 0);
                return (
                  <tr
                    key={`${b.year}-${b.month}`}
                    className={`transition-colors hover:bg-mist/60 ${
                      isCurrentMonth ? "bg-forest/5" : ""
                    }`}
                  >
                    <td className="px-4 py-2.5 font-medium text-ink">
                      {b.label}
                      {isCurrentMonth && (
                        <span className="ml-2 rounded-full bg-forest/10 px-1.5 py-0.5 text-xs text-forest">
                          현재
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink">
                      {b.count > 0 ? `${b.count}건` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-forest">
                      {b.uniqueStudents.size > 0
                        ? `${b.uniqueStudents.size}명`
                        : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate">
                      {pct(b.count, totalInWindow)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Navigation */}
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/admin/analytics"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-forest/40 hover:text-forest"
        >
          ← 분석 홈
        </Link>
        <Link
          href="/admin/consultations"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-forest/40 hover:text-forest"
        >
          상담 목록 →
        </Link>
        <Link
          href="/admin/analytics/counseling"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-forest/40 hover:text-forest"
        >
          면담 현황 분석 →
        </Link>
        <Link
          href="/admin/analytics/counseling-conversion"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-forest/40 hover:text-forest"
        >
          전환 퍼널 →
        </Link>
      </div>
    </div>
  );
}
