"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

export type StageCounts = {
  INQUIRY: number;
  VISITING: number;
  DECIDING: number;
  REGISTERED: number;
  DROPPED: number;
};

export type MonthlyTrendEntry = {
  month: string;
  inquiry: number;
  visiting: number;
  deciding: number;
  registered: number;
  dropped: number;
};

export type StaffStat = {
  staffName: string;
  total: number;
  registered: number;
  dropped: number;
  conversionRate: number | null;
};

export type SourceEntry = {
  source: string;
  label: string;
  count: number;
};

export type StatsData = {
  period: { start: string; end: string; month: string };
  totalProspects: number;
  stageCounts: StageCounts;
  conversionRate: number;
  monthlyTrend: MonthlyTrendEntry[];
  staffStats: StaffStat[];
  sourceBreakdown: SourceEntry[];
};

const STAGE_LABELS: Record<keyof StageCounts, string> = {
  INQUIRY: "문의 접수",
  VISITING: "방문 상담",
  DECIDING: "검토 중",
  REGISTERED: "등록 완료",
  DROPPED: "미등록",
};

const STAGE_COLORS: Record<keyof StageCounts, string> = {
  INQUIRY: "#4B5563",
  VISITING: "#2563EB",
  DECIDING: "#D97706",
  REGISTERED: "#1F4D3A",
  DROPPED: "#DC2626",
};

const STAGE_ORDER: (keyof StageCounts)[] = [
  "INQUIRY",
  "VISITING",
  "DECIDING",
  "REGISTERED",
  "DROPPED",
];

function FunnelBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 1000) / 10 : 0;
  const barWidth = `${pct}%`;

  return (
    <div className="flex items-center gap-4">
      <div className="w-24 shrink-0 text-right text-sm font-medium text-ink">{label}</div>
      <div className="flex-1">
        <div className="h-6 overflow-hidden rounded-full bg-ink/5">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: barWidth, backgroundColor: color, minWidth: count > 0 ? "2px" : "0" }}
          />
        </div>
      </div>
      <div className="w-20 shrink-0 text-sm text-slate">
        <span className="font-semibold text-ink">{count}건</span>
        <span className="ml-2 text-xs">{pct}%</span>
      </div>
    </div>
  );
}

function formatMonthLabel(month: string) {
  // "YYYY-MM" → "YY년 M월"
  const [y, m] = month.split("-");
  return `${y.slice(2)}년 ${Number(m)}월`;
}

const PIE_COLORS = [
  STAGE_COLORS.INQUIRY,
  STAGE_COLORS.VISITING,
  STAGE_COLORS.DECIDING,
  STAGE_COLORS.REGISTERED,
  STAGE_COLORS.DROPPED,
];

export function StatsClient({ data }: { data: StatsData }) {
  const { stageCounts, monthlyTrend, staffStats, sourceBreakdown, totalProspects } = data;

  // Pie chart data
  const pieData = STAGE_ORDER.map((stage) => ({
    name: STAGE_LABELS[stage],
    value: stageCounts[stage],
    color: STAGE_COLORS[stage],
  })).filter((d) => d.value > 0);

  // Monthly trend formatted
  const trendFormatted = monthlyTrend.map((entry) => ({
    ...entry,
    label: formatMonthLabel(entry.month),
  }));

  return (
    <div className="space-y-10">
      {/* Funnel + Pie side by side */}
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)]">
        {/* Funnel */}
        <article className="rounded-[28px] border border-ink/10 bg-white p-6">
          <h2 className="text-xl font-semibold">상담 전환 퍼널</h2>
          <p className="mt-1 text-sm text-slate">선택 기간의 단계별 누적 현황</p>
          <div className="mt-8 space-y-4">
            {STAGE_ORDER.map((stage) => (
              <FunnelBar
                key={stage}
                label={STAGE_LABELS[stage]}
                count={stageCounts[stage]}
                total={totalProspects}
                color={STAGE_COLORS[stage]}
              />
            ))}
          </div>
          {totalProspects === 0 && (
            <p className="mt-6 text-center text-sm text-slate">해당 기간에 상담 데이터가 없습니다.</p>
          )}
        </article>

        {/* Pie chart */}
        <article className="rounded-[28px] border border-ink/10 bg-white p-6">
          <h2 className="text-xl font-semibold">단계 분포</h2>
          <p className="mt-1 text-sm text-slate">선택 기간 내 단계별 비율</p>
          {totalProspects > 0 ? (
            <>
              <div className="mt-4" style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={90}
                      paddingAngle={2}
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => [`${value}건`]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
                {pieData.map((entry) => (
                  <div key={entry.name} className="flex items-center gap-1.5 text-xs text-slate">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: entry.color }}
                    />
                    {entry.name}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="mt-8 text-center text-sm text-slate">데이터 없음</div>
          )}
        </article>
      </section>

      {/* Monthly trend */}
      <article className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="text-xl font-semibold">월별 상담·전환 추이</h2>
        <p className="mt-1 text-sm text-slate">최근 6개월 문의 접수 / 등록 완료 / 미등록 건수</p>
        <div className="mt-6" style={{ height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trendFormatted} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#4B5563" }} />
              <YAxis tick={{ fontSize: 12, fill: "#4B5563" }} allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="inquiry" name="문의 접수" fill={STAGE_COLORS.INQUIRY} radius={[4, 4, 0, 0]} />
              <Bar dataKey="visiting" name="방문 상담" fill={STAGE_COLORS.VISITING} radius={[4, 4, 0, 0]} />
              <Bar dataKey="registered" name="등록 완료" fill={STAGE_COLORS.REGISTERED} radius={[4, 4, 0, 0]} />
              <Bar dataKey="dropped" name="미등록" fill={STAGE_COLORS.DROPPED} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </article>

      {/* Per-staff stats */}
      <article className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="text-xl font-semibold">직원별 전환율</h2>
        <p className="mt-1 text-sm text-slate">선택 기간 내 담당 직원별 상담 성과</p>
        {staffStats.length === 0 ? (
          <p className="mt-6 text-sm text-slate">데이터 없음</p>
        ) : (
          <div className="mt-6 overflow-x-auto rounded-[20px] border border-ink/10">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <thead className="bg-mist/80 text-left">
                <tr>
                  <th className="px-5 py-3 font-semibold text-ink">담당 직원</th>
                  <th className="px-5 py-3 text-right font-semibold text-ink">총 상담</th>
                  <th className="px-5 py-3 text-right font-semibold text-ink">등록 완료</th>
                  <th className="px-5 py-3 text-right font-semibold text-ink">미등록</th>
                  <th className="px-5 py-3 text-right font-semibold text-ink">전환율</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {staffStats.map((s, i) => (
                  <tr key={i} className="transition hover:bg-mist/40">
                    <td className="px-5 py-3 font-medium text-ink">{s.staffName}</td>
                    <td className="px-5 py-3 text-right text-slate">{s.total}건</td>
                    <td className="px-5 py-3 text-right">
                      <span className="font-semibold text-forest">{s.registered}건</span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className="text-red-600">{s.dropped}건</span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {s.conversionRate !== null ? (
                        <span
                          className={`font-semibold ${
                            s.conversionRate >= 60
                              ? "text-forest"
                              : s.conversionRate >= 40
                                ? "text-amber-600"
                                : "text-red-600"
                          }`}
                        >
                          {s.conversionRate}%
                        </span>
                      ) : (
                        <span className="text-slate">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      {/* Source breakdown */}
      {sourceBreakdown.length > 0 && (
        <article className="rounded-[28px] border border-ink/10 bg-white p-6">
          <h2 className="text-xl font-semibold">유입 경로별 분석</h2>
          <p className="mt-1 text-sm text-slate">어떤 경로로 학원을 알게 됐는지 집계</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {sourceBreakdown.map((entry) => {
              const pct = totalProspects > 0 ? Math.round((entry.count / totalProspects) * 1000) / 10 : 0;
              return (
                <div
                  key={entry.source}
                  className="rounded-[20px] border border-ink/10 bg-mist/40 p-4"
                >
                  <div className="flex items-start justify-between">
                    <p className="font-semibold text-ink">{entry.label}</p>
                    <span className="rounded-full border border-ink/10 bg-white px-2.5 py-0.5 text-xs font-semibold text-slate">
                      {pct}%
                    </span>
                  </div>
                  <p className="mt-2 text-2xl font-semibold text-ink">
                    {entry.count}
                    <span className="ml-1 text-base font-normal text-slate">건</span>
                  </p>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/10">
                    <div
                      className="h-full rounded-full bg-ember transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </article>
      )}
    </div>
  );
}
