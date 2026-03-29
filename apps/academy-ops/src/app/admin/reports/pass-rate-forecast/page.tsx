import { AdminRole, PassType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import Link from "next/link";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";

export const dynamic = "force-dynamic";

function parseYearParam(param: string | undefined): number {
  if (param && /^\d{4}$/.test(param)) {
    const y = parseInt(param, 10);
    if (y >= 2020 && y <= 2099) return y;
  }
  return new Date().getFullYear();
}

// Derive exam category from examName string
function categorizeExam(examName: string): "공채" | "경채" | "소방" | "기타" {
  if (/소방/.test(examName)) return "소방";
  if (/경채/.test(examName)) return "경채";
  if (/공채|공무원|순경/.test(examName)) return "공채";
  return "기타";
}

// Simple linear regression: returns slope and intercept
function linearRegression(points: { x: number; y: number }[]): {
  slope: number;
  intercept: number;
} {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: points[0]?.y ?? 0 };
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n };
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

type YearStats = {
  year: number;
  totalFinalPass: number;
  totalWrittenPass: number;
  enrollments: number;
  passRate: number; // finalPass / enrollments * 100
};

type MonthlyPass = {
  month: number;
  written: number;
  final: number;
};

type CategoryRow = {
  category: string;
  finalPass: number;
  writtenPass: number;
  pct: string;
};

export default async function PassRateForecastPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminContext(AdminRole.DIRECTOR);

  const resolvedParams = searchParams ? await searchParams : {};
  const rawYear = typeof resolvedParams.year === "string" ? resolvedParams.year : undefined;
  const selectedYear = parseYearParam(rawYear);

  const db = getPrisma();
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // Fetch 3 years of graduate records
  const threeYearsAgo = new Date(selectedYear - 2, 0, 1);
  const endOfSelectedYear = new Date(selectedYear, 11, 31, 23, 59, 59);

  const [graduates, enrollmentsByYear] = await Promise.all([
    db.graduateRecord.findMany({
      where: {
        passType: { in: [PassType.FINAL_PASS, PassType.WRITTEN_PASS, PassType.APPOINTED] },
        OR: [
          { finalPassDate: { gte: threeYearsAgo, lte: endOfSelectedYear } },
          { writtenPassDate: { gte: threeYearsAgo, lte: endOfSelectedYear } },
        ],
      },
      select: {
        examName: true,
        passType: true,
        writtenPassDate: true,
        finalPassDate: true,
        createdAt: true,
      },
    }),
    // Enrollments per year for pass rate denominator
    db.courseEnrollment.findMany({
      where: {
        createdAt: { gte: new Date(selectedYear - 2, 0, 1) },
        status: { notIn: ["PENDING", "CANCELLED"] },
      },
      select: { createdAt: true },
    }),
  ]);

  // Count enrollments per year
  const enrollMap = new Map<number, number>();
  for (const e of enrollmentsByYear) {
    const y = new Date(e.createdAt).getFullYear();
    enrollMap.set(y, (enrollMap.get(y) ?? 0) + 1);
  }

  // Build per-year pass stats
  const yearStatsMap = new Map<
    number,
    { finalPass: number; writtenPass: number }
  >();

  // Also monthly data for selected year
  const monthlyMap = new Map<number, { written: number; final: number }>();
  for (let m = 1; m <= 12; m++) {
    monthlyMap.set(m, { written: 0, final: 0 });
  }

  // Category breakdown for selected year
  const categoryMap = new Map<
    string,
    { finalPass: number; writtenPass: number }
  >();

  for (const g of graduates) {
    // Determine year from the relevant pass date
    let passYear: number | null = null;
    let passMonth: number | null = null;

    if (
      g.passType === PassType.FINAL_PASS ||
      g.passType === PassType.APPOINTED
    ) {
      if (g.finalPassDate) {
        const d = new Date(g.finalPassDate);
        passYear = d.getFullYear();
        passMonth = d.getMonth() + 1;
      }
    } else if (g.passType === PassType.WRITTEN_PASS) {
      if (g.writtenPassDate) {
        const d = new Date(g.writtenPassDate);
        passYear = d.getFullYear();
        passMonth = d.getMonth() + 1;
      }
    }

    if (passYear === null) {
      // Fall back to createdAt year
      passYear = new Date(g.createdAt).getFullYear();
      passMonth = new Date(g.createdAt).getMonth() + 1;
    }

    // Year stats
    if (!yearStatsMap.has(passYear)) {
      yearStatsMap.set(passYear, { finalPass: 0, writtenPass: 0 });
    }
    const ys = yearStatsMap.get(passYear)!;
    if (
      g.passType === PassType.FINAL_PASS ||
      g.passType === PassType.APPOINTED
    ) {
      ys.finalPass++;
    } else {
      ys.writtenPass++;
    }

    // Monthly for selected year
    if (passYear === selectedYear && passMonth !== null) {
      const ms = monthlyMap.get(passMonth)!;
      if (
        g.passType === PassType.FINAL_PASS ||
        g.passType === PassType.APPOINTED
      ) {
        ms.final++;
      } else {
        ms.written++;
      }
    }

    // Category for selected year
    if (passYear === selectedYear) {
      const cat = categorizeExam(g.examName);
      if (!categoryMap.has(cat)) categoryMap.set(cat, { finalPass: 0, writtenPass: 0 });
      const cs = categoryMap.get(cat)!;
      if (
        g.passType === PassType.FINAL_PASS ||
        g.passType === PassType.APPOINTED
      ) {
        cs.finalPass++;
      } else {
        cs.writtenPass++;
      }
    }
  }

  // Build 3-year stats array
  const years = [selectedYear - 2, selectedYear - 1, selectedYear].filter(
    (y) => y >= 2020
  );

  const yearStats: YearStats[] = years.map((y) => {
    const ys = yearStatsMap.get(y) ?? { finalPass: 0, writtenPass: 0 };
    const enrollments = enrollMap.get(y) ?? 0;
    const passRate =
      enrollments > 0 ? Math.round((ys.finalPass / enrollments) * 1000) / 10 : 0;
    return {
      year: y,
      totalFinalPass: ys.finalPass,
      totalWrittenPass: ys.writtenPass,
      enrollments,
      passRate,
    };
  });

  // Linear projection: use year stats to project end-of-year pass rate
  // Use ratio of final passes through current month vs. full year pattern
  const thisYearData = yearStatsMap.get(selectedYear) ?? { finalPass: 0, writtenPass: 0 };
  const thisYearEnrollments = enrollMap.get(selectedYear) ?? 0;

  // Compute through-current-month total for selected year
  let throughCurrentMonthFinal = 0;
  if (selectedYear === currentYear) {
    for (let m = 1; m <= currentMonth; m++) {
      throughCurrentMonthFinal += monthlyMap.get(m)?.final ?? 0;
    }
  } else {
    throughCurrentMonthFinal = thisYearData.finalPass;
  }

  // Linear regression on YoY pass rates to project
  const regressionPoints = yearStats
    .filter((s) => s.enrollments > 0)
    .map((s, i) => ({ x: i, y: s.passRate }));

  const { slope, intercept } = linearRegression(regressionPoints);
  const projectedRateRaw = intercept + slope * (regressionPoints.length - 1 + 0.5);
  const projectedRate = Math.max(0, Math.min(100, Math.round(projectedRateRaw * 10) / 10));

  // Monthly trend table
  const monthlyRows: MonthlyPass[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    written: monthlyMap.get(i + 1)?.written ?? 0,
    final: monthlyMap.get(i + 1)?.final ?? 0,
  }));

  // Category rows
  const categoryOrder = ["공채", "경채", "소방", "기타"];
  const selectedYearFinalTotal = thisYearData.finalPass;
  const categoryRows: CategoryRow[] = categoryOrder
    .map((cat) => {
      const cs = categoryMap.get(cat) ?? { finalPass: 0, writtenPass: 0 };
      return {
        category: cat,
        finalPass: cs.finalPass,
        writtenPass: cs.writtenPass,
        pct:
          selectedYearFinalTotal > 0
            ? ((cs.finalPass / selectedYearFinalTotal) * 100).toFixed(1) + "%"
            : "—",
      };
    })
    .filter((r) => r.finalPass > 0 || r.writtenPass > 0);

  // KPIs
  const thisYearStats = yearStats.find((s) => s.year === selectedYear);
  const prevYearStats = yearStats.find((s) => s.year === selectedYear - 1);
  const yoyChange =
    prevYearStats && thisYearStats
      ? thisYearStats.totalFinalPass - prevYearStats.totalFinalPass
      : null;

  const isCurrentYear = selectedYear === currentYear;
  const prevYear = selectedYear - 1;
  const nextYear = selectedYear + 1;

  // Month labels with pass counts for sparkline-like display
  const MONTH_LABELS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
  const maxMonthlyFinal = Math.max(...monthlyRows.map((r) => r.final), 1);

  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "보고서", href: "/admin/reports" },
          { label: "합격률 예측" },
        ]}
      />

      <div className="mt-2">
        <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
          합격 분석
        </div>
        <h1 className="mt-4 text-3xl font-semibold text-ink">합격률 예측 보고서</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate">
          연도별 합격자 추이를 분석하고 단순 선형 추세 기반으로 연말 합격률을 예측합니다.
        </p>
      </div>

      {/* Year Navigation */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link
          href={`/admin/reports/pass-rate-forecast?year=${prevYear}`}
          className="rounded-xl border border-ink/15 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-mist"
        >
          ← {prevYear}년
        </Link>
        <span className="rounded-xl bg-forest/10 px-4 py-2 text-sm font-semibold text-forest">
          {selectedYear}년
          {isCurrentYear && (
            <span className="ml-2 rounded-full bg-ember/20 px-2 py-0.5 text-xs text-ember">올해</span>
          )}
        </span>
        {nextYear <= currentYear && (
          <Link
            href={`/admin/reports/pass-rate-forecast?year=${nextYear}`}
            className="rounded-xl border border-ink/15 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-mist"
          >
            {nextYear}년 →
          </Link>
        )}
        <div className="ml-auto">
          <Link
            href="/admin/reports/annual"
            className="rounded-xl border border-ink/15 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-mist"
          >
            연간 통계
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[20px] border border-forest/20 bg-forest/5 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate">올해 합격자</p>
          <p className="mt-2 text-3xl font-bold text-forest">
            {thisYearStats?.totalFinalPass ?? 0}
            <span className="ml-1 text-sm font-normal text-slate">명</span>
          </p>
          <p className="mt-1 text-xs text-slate">최종합격 기준</p>
        </div>
        <div className="rounded-[20px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate">전년 대비</p>
          <p className="mt-2 text-3xl font-bold text-ink">
            {yoyChange === null ? (
              <span className="text-slate text-xl">—</span>
            ) : yoyChange >= 0 ? (
              <span className="text-forest">+{yoyChange}</span>
            ) : (
              <span className="text-red-600">{yoyChange}</span>
            )}
            <span className="ml-1 text-sm font-normal text-slate">명</span>
          </p>
          {prevYearStats && (
            <p className="mt-1 text-xs text-slate">전년 {prevYearStats.totalFinalPass}명</p>
          )}
        </div>
        <div className="rounded-[20px] border border-ember/20 bg-ember/5 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate">합격률</p>
          <p className="mt-2 text-3xl font-bold text-ember">
            {thisYearStats?.passRate !== undefined && thisYearStats.passRate > 0
              ? `${thisYearStats.passRate}%`
              : "—"}
          </p>
          <p className="mt-1 text-xs text-slate">
            등록 {thisYearStats?.enrollments ?? 0}명 중
          </p>
        </div>
        <div className="rounded-[20px] border border-sky-200 bg-sky-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate">
            {isCurrentYear ? "예상 연말 합격률" : "해당연도 합격률"}
          </p>
          <p className="mt-2 text-3xl font-bold text-sky-700">
            {regressionPoints.length >= 2
              ? `${projectedRate}%`
              : thisYearStats?.passRate !== undefined && thisYearStats.passRate > 0
              ? `${thisYearStats.passRate}%`
              : "—"}
          </p>
          {isCurrentYear && regressionPoints.length >= 2 && (
            <p className="mt-1 text-xs text-slate">선형 추세 기반 예측</p>
          )}
        </div>
      </div>

      {/* YoY Comparison Table */}
      <div className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="text-lg font-semibold text-ink">연도별 합격 추이 (3개년)</h2>
        <p className="mt-1 text-xs text-slate">필기합격 및 최종합격 인원, 합격률 비교</p>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-left text-xs font-semibold uppercase tracking-wide text-slate">
                <th className="pb-3 pr-4">연도</th>
                <th className="pb-3 pr-4 text-right">총 수강 등록</th>
                <th className="pb-3 pr-4 text-right">필기합격</th>
                <th className="pb-3 pr-4 text-right">최종합격</th>
                <th className="pb-3 pr-4 text-right">합격률</th>
                <th className="pb-3 text-right">전년 대비</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {yearStats.map((ys, idx) => {
                const prevYs = idx > 0 ? yearStats[idx - 1] : null;
                const diff =
                  prevYs !== null ? ys.totalFinalPass - prevYs.totalFinalPass : null;
                const isSelected = ys.year === selectedYear;
                return (
                  <tr
                    key={ys.year}
                    className={`${isSelected ? "bg-forest/5" : "hover:bg-mist/50"}`}
                  >
                    <td className="py-3 pr-4">
                      <Link
                        href={`/admin/reports/pass-rate-forecast?year=${ys.year}`}
                        className={`font-semibold transition hover:text-ember ${
                          isSelected ? "text-forest" : "text-ink"
                        }`}
                      >
                        {ys.year}년
                        {isSelected && (
                          <span className="ml-2 rounded-full bg-forest/20 px-1.5 py-0.5 text-xs">
                            선택
                          </span>
                        )}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 text-right text-slate">
                      {ys.enrollments > 0 ? `${ys.enrollments}명` : "—"}
                    </td>
                    <td className="py-3 pr-4 text-right text-sky-700 font-medium">
                      {ys.totalWrittenPass > 0 ? `${ys.totalWrittenPass}명` : "—"}
                    </td>
                    <td className="py-3 pr-4 text-right">
                      <span className="font-bold text-forest">
                        {ys.totalFinalPass > 0 ? `${ys.totalFinalPass}명` : "—"}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-right text-ember font-medium">
                      {ys.passRate > 0 ? `${ys.passRate}%` : "—"}
                    </td>
                    <td className="py-3 text-right">
                      {diff === null ? (
                        <span className="text-slate text-xs">—</span>
                      ) : diff > 0 ? (
                        <span className="text-forest font-semibold text-xs">+{diff}명</span>
                      ) : diff < 0 ? (
                        <span className="text-red-600 font-semibold text-xs">{diff}명</span>
                      ) : (
                        <span className="text-slate text-xs">0명</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Exam Category Breakdown */}
      <div className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="text-lg font-semibold text-ink">시험 유형별 합격 현황 ({selectedYear}년)</h2>
        <p className="mt-1 text-xs text-slate">
          시험명 키워드 기반 분류 — 경찰공채 / 경채 / 소방 / 기타
        </p>

        {categoryRows.length === 0 ? (
          <div className="mt-6 rounded-[16px] border border-dashed border-ink/10 py-10 text-center text-sm text-slate">
            {selectedYear}년 합격자 데이터가 없습니다.
          </div>
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {categoryRows.map((row) => {
              const catColors: Record<string, { bg: string; text: string; border: string }> = {
                공채: { bg: "bg-forest/5", text: "text-forest", border: "border-forest/20" },
                경채: { bg: "bg-sky-50", text: "text-sky-700", border: "border-sky-200" },
                소방: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
                기타: { bg: "bg-ink/5", text: "text-slate", border: "border-ink/10" },
              };
              const c = catColors[row.category] ?? catColors.기타;
              return (
                <div
                  key={row.category}
                  className={`rounded-[16px] border p-4 ${c.bg} ${c.border}`}
                >
                  <p className={`text-xs font-semibold ${c.text}`}>{row.category}</p>
                  <p className={`mt-2 text-3xl font-bold ${c.text}`}>
                    {row.finalPass}
                    <span className="ml-1 text-sm font-normal text-slate">명</span>
                  </p>
                  <p className="mt-1 text-xs text-slate">
                    최종합격 {row.pct} / 필기 {row.writtenPass}명
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Monthly Pass Timing */}
      <div className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="text-lg font-semibold text-ink">월별 합격 시점 분석 ({selectedYear}년)</h2>
        <p className="mt-1 text-xs text-slate">
          언제 합격자가 나오는지 월별 패턴을 확인합니다.
        </p>

        <div className="mt-5 grid grid-cols-12 gap-1 items-end" style={{ height: "120px" }}>
          {monthlyRows.map((row) => {
            const barH = maxMonthlyFinal > 0 ? Math.round((row.final / maxMonthlyFinal) * 96) : 0;
            const isFuture = isCurrentYear && row.month > currentMonth;
            return (
              <div
                key={row.month}
                className="flex flex-col items-center gap-1"
                title={`${row.month}월: 최종합격 ${row.final}명, 필기합격 ${row.written}명`}
              >
                <div className="relative w-full flex justify-center">
                  <div
                    className={`w-full rounded-t-sm ${isFuture ? "bg-ink/10" : "bg-forest"} transition-all`}
                    style={{ height: `${barH}px`, minHeight: barH > 0 ? "4px" : "0" }}
                  />
                </div>
                <span className="text-[9px] text-slate">{MONTH_LABELS[row.month - 1]}</span>
              </div>
            );
          })}
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-ink/10 text-left text-xs font-semibold text-slate">
                <th className="pb-2 pr-3">월</th>
                {monthlyRows.map((r) => (
                  <th key={r.month} className="pb-2 pr-2 text-center">
                    {r.month}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-ink/5">
                <td className="py-2 pr-3 text-slate">필기</td>
                {monthlyRows.map((r) => (
                  <td
                    key={r.month}
                    className={`py-2 pr-2 text-center font-medium ${
                      r.written > 0 ? "text-sky-700" : "text-ink/20"
                    }`}
                  >
                    {r.written > 0 ? r.written : "—"}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-2 pr-3 text-slate">최종</td>
                {monthlyRows.map((r) => (
                  <td
                    key={r.month}
                    className={`py-2 pr-2 text-center font-bold ${
                      r.final > 0 ? "text-forest" : "text-ink/20"
                    }`}
                  >
                    {r.final > 0 ? r.final : "—"}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Projection Note */}
      {isCurrentYear && regressionPoints.length >= 2 && (
        <div className="mt-6 rounded-[28px] border border-sky-200 bg-sky-50 p-6">
          <h2 className="text-lg font-semibold text-sky-800">연말 합격률 예측</h2>
          <p className="mt-3 text-sm text-sky-700 leading-7">
            최근 {regressionPoints.length}개년 합격률 데이터 (
            {yearStats
              .filter((s) => s.enrollments > 0)
              .map((s) => `${s.year}년 ${s.passRate}%`)
              .join(", ")}
            )를 선형 회귀 분석한 결과,
          </p>
          <p className="mt-2 text-2xl font-bold text-sky-800">
            현재 추세라면 {currentYear}년 연말 합격률은{" "}
            <span className="text-ember">{projectedRate}%</span> 예상
          </p>
          <p className="mt-2 text-xs text-sky-600">
            * 단순 선형 추세 예측입니다. 실제 합격률은 시험 난이도, 정원 변화 등에 따라 달라질 수 있습니다.
          </p>
        </div>
      )}

      {/* Navigation */}
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/admin/reports"
          className="inline-flex items-center rounded-full border border-ink/20 bg-white px-4 py-2 text-xs font-semibold text-slate transition hover:border-ink/40 hover:text-ink"
        >
          보고서 목록
        </Link>
        <Link
          href={`/admin/reports/annual?year=${selectedYear}`}
          className="inline-flex items-center rounded-full border border-forest/20 bg-forest/5 px-4 py-2 text-xs font-semibold text-forest transition hover:bg-forest/10"
        >
          {selectedYear}년 연간 통계
        </Link>
        <Link
          href="/admin/graduates"
          className="inline-flex items-center rounded-full border border-ember/20 bg-ember/5 px-4 py-2 text-xs font-semibold text-ember transition hover:bg-ember/10"
        >
          합격자 관리
        </Link>
      </div>
    </div>
  );
}
