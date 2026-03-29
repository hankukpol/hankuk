"use client";

// ─── Types ────────────────────────────────────────────────────────────────────

export type MonthlyRevenue = {
  yearMonth: string; // "YYYY-MM"
  totalRevenue: number;
  refundTotal: number;
  netRevenue: number;
  enrollmentCount: number;
  momGrowthRate: number | null; // month-over-month %
  isProjected: boolean;
};

export type ForecastKpis = {
  thisMonthNet: number;
  ytdTotal: number;
  avgMonthly: number;
  growthRate: number | null; // MoM % for current month
};

export type ForecastClientProps = {
  months: MonthlyRevenue[];
  kpis: ForecastKpis;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatKRW(n: number): string {
  if (n >= 100_000_000) {
    return `₩${(n / 100_000_000).toFixed(1)}억`;
  }
  if (n >= 10_000) {
    return `₩${Math.round(n / 10_000).toLocaleString("ko-KR")}만`;
  }
  return "₩" + n.toLocaleString("ko-KR");
}

function formatKRWFull(n: number): string {
  return "₩" + n.toLocaleString("ko-KR");
}

function formatMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split("-");
  return `${year?.slice(2)}년 ${month}월`;
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: string;
}) {
  return (
    <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
      <p className="text-xs font-medium uppercase tracking-widest text-slate">{label}</p>
      <p className={["mt-2 text-2xl font-bold tabular-nums", accent ?? "text-ink"].join(" ")}>
        {value}
      </p>
      <p className="mt-1 text-xs text-slate">{sub}</p>
    </div>
  );
}

// ─── Bar Chart ────────────────────────────────────────────────────────────────

function BarChart({ months }: { months: MonthlyRevenue[] }) {
  const maxVal = Math.max(...months.map((m) => m.netRevenue), 1);
  const chartHeight = 200;

  return (
    <div className="overflow-x-auto">
      <div className="flex items-end gap-1.5" style={{ minWidth: `${months.length * 52}px`, height: `${chartHeight + 60}px` }}>
        {months.map((m) => {
          const barH = Math.round((m.netRevenue / maxVal) * chartHeight);
          const barHRefund = Math.round((m.refundTotal / maxVal) * chartHeight);

          return (
            <div
              key={m.yearMonth}
              className="group flex flex-1 flex-col items-center justify-end"
              style={{ height: `${chartHeight + 60}px` }}
            >
              {/* Tooltip on hover */}
              <div className="pointer-events-none mb-1 hidden rounded-lg border border-ink/10 bg-white p-2 text-xs shadow-lg group-hover:block whitespace-nowrap z-10">
                <p className="font-semibold text-ink">{formatMonth(m.yearMonth)}</p>
                <p className="text-slate">총수입 {formatKRWFull(m.totalRevenue)}</p>
                <p className="text-red-600">환불 -{formatKRWFull(m.refundTotal)}</p>
                <p className="font-semibold text-forest">순수입 {formatKRWFull(m.netRevenue)}</p>
                <p className="text-slate">등록 {m.enrollmentCount}건</p>
                {m.momGrowthRate !== null && (
                  <p className={m.momGrowthRate >= 0 ? "text-forest" : "text-red-600"}>
                    MoM {m.momGrowthRate >= 0 ? "+" : ""}{m.momGrowthRate.toFixed(1)}%
                  </p>
                )}
              </div>

              {/* Bar */}
              <div className="relative w-full" style={{ height: `${chartHeight}px` }}>
                {/* Net revenue bar */}
                <div
                  className={[
                    "absolute bottom-0 left-0 right-0 rounded-t-lg transition-all duration-500",
                    m.isProjected
                      ? "bg-forest/30 border border-dashed border-forest/50"
                      : "bg-forest",
                  ].join(" ")}
                  style={{ height: `${Math.max(barH, m.netRevenue > 0 ? 2 : 0)}px` }}
                />
                {/* Refund overlay */}
                {m.refundTotal > 0 && (
                  <div
                    className="absolute bottom-0 left-0 right-0 rounded-t-lg bg-red-400/30"
                    style={{ height: `${Math.max(barHRefund, 1)}px` }}
                  />
                )}
              </div>

              {/* X label */}
              <div className="mt-2 w-full text-center">
                <p className={["text-[10px] leading-tight", m.isProjected ? "text-slate/60 italic" : "text-slate"].join(" ")}>
                  {formatMonth(m.yearMonth)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ForecastClient({ months, kpis }: ForecastClientProps) {
  const actualMonths = months.filter((m) => !m.isProjected);
  const projectedMonths = months.filter((m) => m.isProjected);

  return (
    <div className="space-y-8">
      {/* ── KPI Cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard
          label="이번달 순수입"
          value={formatKRW(kpis.thisMonthNet)}
          sub="환불 차감 후 순수입"
          accent="text-ember"
        />
        <KpiCard
          label="YTD 합계"
          value={formatKRW(kpis.ytdTotal)}
          sub="올해 누적 순수입"
        />
        <KpiCard
          label="월 평균"
          value={formatKRW(kpis.avgMonthly)}
          sub="최근 12개월 평균"
        />
        <KpiCard
          label="MoM 성장률"
          value={
            kpis.growthRate !== null
              ? `${kpis.growthRate >= 0 ? "+" : ""}${kpis.growthRate.toFixed(1)}%`
              : "—"
          }
          sub="전월 대비 성장률"
          accent={
            kpis.growthRate !== null && kpis.growthRate >= 0
              ? "text-forest"
              : kpis.growthRate !== null && kpis.growthRate < 0
                ? "text-red-600"
                : undefined
          }
        />
      </div>

      {/* ── Bar Chart ───────────────────────────────────────────────────────── */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-8 shadow-panel">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-ink">월별 수납 추이</h2>
            <p className="mt-1 text-xs text-slate">
              최근 12개월 실적 + 향후 3개월 예측 (선형 회귀)
            </p>
          </div>
          {/* Legend */}
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-5 rounded-sm bg-forest" />
              <span className="text-slate">실적</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-5 rounded-sm border border-dashed border-forest/50 bg-forest/30" />
              <span className="text-slate">예측</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-5 rounded-sm bg-red-400/30" />
              <span className="text-slate">환불</span>
            </div>
          </div>
        </div>

        {months.length === 0 ? (
          <div className="mt-6 flex items-center justify-center py-20 text-sm text-slate">
            수납 데이터가 없습니다.
          </div>
        ) : (
          <div className="mt-6">
            <BarChart months={months} />
          </div>
        )}
      </div>

      {/* ── Monthly Breakdown Table ──────────────────────────────────────────── */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-8 shadow-panel">
        <h2 className="text-base font-semibold text-ink">월별 상세</h2>
        <p className="mt-1 text-xs text-slate">실적 및 예측 월별 내역</p>

        <div className="mt-6 overflow-hidden rounded-[20px] border border-ink/10">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist">
                  {[
                    "월",
                    "총 수입",
                    "환불",
                    "순수입",
                    "등록 건수",
                    "MoM 성장률",
                    "구분",
                  ].map((h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {[...months].reverse().map((m) => (
                  <tr
                    key={m.yearMonth}
                    className={[
                      "transition-colors hover:bg-mist/60",
                      m.isProjected ? "opacity-70" : "",
                    ].join(" ")}
                  >
                    <td className="px-5 py-4 font-medium text-ink">
                      {formatMonth(m.yearMonth)}
                    </td>
                    <td className="px-5 py-4 font-mono text-sm tabular-nums text-ink">
                      {formatKRWFull(m.totalRevenue)}
                    </td>
                    <td className="px-5 py-4 font-mono text-sm tabular-nums text-red-600">
                      {m.refundTotal > 0 ? `-${formatKRWFull(m.refundTotal)}` : "—"}
                    </td>
                    <td className="px-5 py-4 font-mono text-sm font-semibold tabular-nums text-forest">
                      {formatKRWFull(m.netRevenue)}
                    </td>
                    <td className="px-5 py-4 text-right font-mono text-xs text-slate">
                      {m.isProjected ? "—" : m.enrollmentCount.toLocaleString()}
                    </td>
                    <td className="px-5 py-4">
                      {m.momGrowthRate !== null ? (
                        <span
                          className={[
                            "inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-xs font-semibold",
                            m.momGrowthRate >= 0
                              ? "border-forest/20 bg-forest/10 text-forest"
                              : "border-red-200 bg-red-50 text-red-600",
                          ].join(" ")}
                        >
                          {m.momGrowthRate >= 0 ? "+" : ""}
                          {m.momGrowthRate.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-slate">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {m.isProjected ? (
                        <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-2.5 py-0.5 text-xs font-medium text-forest/70 italic">
                          예측
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full border border-ink/10 bg-ink/5 px-2.5 py-0.5 text-xs font-medium text-slate">
                          실적
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-ink/10 bg-mist/80">
                  <td className="px-5 py-3 text-xs font-semibold text-slate">
                    실적 합계 ({actualMonths.length}개월)
                  </td>
                  <td className="px-5 py-3 font-mono text-sm tabular-nums text-ink">
                    {formatKRWFull(actualMonths.reduce((s, m) => s + m.totalRevenue, 0))}
                  </td>
                  <td className="px-5 py-3 font-mono text-sm tabular-nums text-red-600">
                    -{formatKRWFull(actualMonths.reduce((s, m) => s + m.refundTotal, 0))}
                  </td>
                  <td className="px-5 py-3 font-mono text-sm font-semibold tabular-nums text-forest">
                    {formatKRWFull(actualMonths.reduce((s, m) => s + m.netRevenue, 0))}
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-xs text-slate">
                    {actualMonths.reduce((s, m) => s + m.enrollmentCount, 0).toLocaleString()}
                  </td>
                  <td colSpan={2} />
                </tr>
                {projectedMonths.length > 0 && (
                  <tr className="border-t border-ink/5 bg-forest/5">
                    <td className="px-5 py-3 text-xs font-semibold text-forest/70 italic">
                      예측 합계 ({projectedMonths.length}개월)
                    </td>
                    <td className="px-5 py-3 font-mono text-sm tabular-nums text-forest/70">
                      {formatKRWFull(projectedMonths.reduce((s, m) => s + m.totalRevenue, 0))}
                    </td>
                    <td colSpan={5} />
                  </tr>
                )}
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      <p className="text-xs text-slate/70">
        * 예측값은 최근 6개월 선형 추세 기반 단순 예측입니다. 실제 수납과 차이가 있을 수 있습니다.
      </p>
    </div>
  );
}
