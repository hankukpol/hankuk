"use client";

export interface MonthlySummaryRow {
  month: string; // "YYYY-MM"
  monthLabel: string;
  sessionCount: number;
  attendedCount: number;
  absentCount: number;
  excusedCount: number;
  studentAverage: number | null;
  cohortAverage: number | null;
  studentRank: number | null;
  totalParticipants: number;
  changeFromPrevMonth: number | null;
  participationRate: number; // 0–100
}

interface Props {
  rows: MonthlySummaryRow[];
}

function scoreColor(score: number | null): string {
  if (score === null) return "bg-ink/10";
  if (score >= 70) return "bg-[#1F4D3A]"; // forest
  if (score >= 60) return "bg-amber-500";
  return "bg-[#C55A11]"; // ember (below 60, danger)
}

function scoreTextColor(score: number | null): string {
  if (score === null) return "text-slate";
  if (score >= 70) return "text-[#1F4D3A]";
  if (score >= 60) return "text-amber-600";
  return "text-[#C55A11]";
}

function CssBar({ value, max }: { value: number | null; max: number }) {
  if (value === null) return <div className="h-5 w-full rounded-sm bg-ink/10" />;
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 overflow-hidden rounded-sm bg-ink/10" style={{ height: 18 }}>
        <div
          className={`h-full rounded-sm transition-all ${scoreColor(value)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`w-12 text-right text-xs font-semibold tabular-nums ${scoreTextColor(value)}`}>
        {value.toFixed(1)}
      </span>
    </div>
  );
}

function changeBadge(change: number | null) {
  if (change === null) return <span className="text-slate">-</span>;
  const positive = change > 0;
  const neutral = change === 0;
  return (
    <span
      className={`font-semibold ${neutral ? "text-slate" : positive ? "text-[#1F4D3A]" : "text-[#C55A11]"}`}
    >
      {positive ? "+" : ""}
      {change.toFixed(1)}
    </span>
  );
}

export function MonthlySummary({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="rounded-[28px] border border-dashed border-ink/10 p-8 text-center text-sm text-slate">
        월별 성적 데이터가 없습니다.
      </div>
    );
  }

  const maxScore = Math.max(
    100,
    ...rows.map((r) => r.studentAverage ?? 0),
    ...rows.map((r) => r.cohortAverage ?? 0),
  );

  return (
    <section className="rounded-[28px] border border-ink/10 bg-white overflow-hidden">
      <div className="p-6 pb-4">
        <h2 className="text-xl font-semibold">월별 성적 요약</h2>
        <p className="mt-1 text-sm text-slate">
          월 단위 성적 추이와 출결 현황을 한눈에 확인합니다.
        </p>
      </div>

      {/* Bar chart area */}
      <div className="border-t border-ink/10 bg-mist/50 px-6 py-5">
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate">
          월별 평균 점수 (막대 차트)
        </h3>
        <div className="space-y-2.5">
          {rows.map((row) => (
            <div key={row.month} className="grid grid-cols-[72px_1fr] items-center gap-3">
              <span className="text-xs font-semibold text-slate tabular-nums">
                {row.monthLabel.replace("년 ", ".").replace("월", "")}
              </span>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="w-14 text-right text-[10px] text-slate">개인</span>
                  <div className="flex-1">
                    <CssBar value={row.studentAverage} max={maxScore} />
                  </div>
                </div>
                {row.cohortAverage !== null && (
                  <div className="flex items-center gap-2">
                    <span className="w-14 text-right text-[10px] text-slate">전체</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 overflow-hidden rounded-sm bg-ink/10" style={{ height: 12 }}>
                          <div
                            className="h-full rounded-sm bg-sky-400/60 transition-all"
                            style={{
                              width: `${maxScore > 0 ? Math.round(((row.cohortAverage ?? 0) / maxScore) * 100) : 0}%`,
                            }}
                          />
                        </div>
                        <span className="w-12 text-right text-xs tabular-nums text-slate">
                          {row.cohortAverage.toFixed(1)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-4 rounded-sm bg-[#1F4D3A]" />
            70점 이상
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-4 rounded-sm bg-amber-500" />
            60-69점
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-4 rounded-sm bg-[#C55A11]" />
            60점 미만
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-4 rounded-sm bg-sky-400/60" />
            전체 평균
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border-t border-ink/10">
        <table className="min-w-full divide-y divide-ink/10 text-sm">
          <thead className="bg-mist/80 text-left">
            <tr>
              <th className="px-4 py-3 font-semibold">월</th>
              <th className="px-4 py-3 font-semibold">응시</th>
              <th className="px-4 py-3 font-semibold">무단결시</th>
              <th className="px-4 py-3 font-semibold">사유결시</th>
              <th className="px-4 py-3 font-semibold">개인평균</th>
              <th className="px-4 py-3 font-semibold">전체평균</th>
              <th className="px-4 py-3 font-semibold">석차</th>
              <th className="px-4 py-3 font-semibold">전월대비</th>
              <th className="px-4 py-3 font-semibold">출석률</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/10">
            {rows.map((row) => (
              <tr key={row.month} className="hover:bg-mist/40 transition-colors">
                <td className="px-4 py-3 font-medium text-ink">{row.monthLabel}</td>
                <td className="px-4 py-3 tabular-nums">
                  {row.attendedCount}/{row.sessionCount}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {row.absentCount > 0 ? (
                    <span className="font-medium text-[#C55A11]">{row.absentCount}회</span>
                  ) : (
                    <span className="text-slate">0회</span>
                  )}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {row.excusedCount > 0 ? (
                    <span className="font-medium text-amber-600">{row.excusedCount}회</span>
                  ) : (
                    <span className="text-slate">0회</span>
                  )}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {row.studentAverage !== null ? (
                    <span className={`font-semibold ${scoreTextColor(row.studentAverage)}`}>
                      {row.studentAverage.toFixed(1)}
                    </span>
                  ) : (
                    <span className="text-slate">-</span>
                  )}
                </td>
                <td className="px-4 py-3 tabular-nums text-slate">
                  {row.cohortAverage !== null ? row.cohortAverage.toFixed(1) : "-"}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {row.studentRank !== null ? (
                    <span className="text-ink">
                      {row.studentRank}위{" "}
                      <span className="text-xs text-slate">/ {row.totalParticipants}명</span>
                    </span>
                  ) : (
                    <span className="text-slate">-</span>
                  )}
                </td>
                <td className="px-4 py-3 tabular-nums">{changeBadge(row.changeFromPrevMonth)}</td>
                <td className="px-4 py-3 tabular-nums">
                  <span
                    className={`${
                      row.participationRate >= 80
                        ? "text-[#1F4D3A]"
                        : row.participationRate >= 60
                          ? "text-amber-600"
                          : "text-[#C55A11]"
                    } font-medium`}
                  >
                    {row.participationRate.toFixed(0)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
