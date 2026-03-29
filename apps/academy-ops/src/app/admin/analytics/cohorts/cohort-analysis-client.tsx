"use client";

import { DeltaBadge } from "@/components/ui/delta-badge";

export type CohortStatRow = {
  id: string;
  name: string;
  examCategory: string;
  startDate: string; // ISO string for serialization
  endDate: string;
  enrollmentCount: number;
  activeCount: number;
  suspendedCount: number;
  droppedCount: number;
  dropoutRate: number | null;
  avgScore: number | null;
  attendanceRate: number | null;
  revenue: number;
  sessionCount: number;
};

type CohortAnalysisClientProps = {
  rows: CohortStatRow[];
  totalEnrollments: number;
  totalRevenue: number;
  overallAvgScore: number | null;
  overallAttendanceRate: number | null;
};

function pct(num: number, den: number): string {
  if (den === 0) return "—";
  return ((num / den) * 100).toFixed(1) + "%";
}

function fmt(n: number): string {
  return n.toLocaleString("ko-KR");
}

export function CohortAnalysisClient({
  rows,
  totalEnrollments,
  totalRevenue,
  overallAvgScore,
  overallAttendanceRate,
}: CohortAnalysisClientProps) {
  if (rows.length === 0) {
    return (
      <div className="mt-8 rounded-[28px] border border-dashed border-ink/10 p-12 text-center text-sm text-slate">
        조건에 해당하는 기수가 없습니다.
      </div>
    );
  }

  // Sort rows by dropout rate descending for bar chart
  const sortedByDropout = [...rows].sort(
    (a, b) => (b.dropoutRate ?? 0) - (a.dropoutRate ?? 0),
  );

  const maxDropout = Math.max(...rows.map((r) => r.dropoutRate ?? 0), 1);

  return (
    <div className="space-y-8">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">총 기수</p>
          <p className="mt-2 text-3xl font-semibold text-ink">{rows.length}개</p>
          <p className="mt-1 text-xs text-slate">평균 {rows.length > 0 ? (totalEnrollments / rows.length).toFixed(1) : "—"}명/기수</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">총 등록</p>
          <p className="mt-2 text-3xl font-semibold text-forest">{fmt(totalEnrollments)}명</p>
          <p className="mt-1 text-xs text-slate">전체 수강 신청</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">평균 성적</p>
          <p className="mt-2 text-3xl font-semibold text-ember">
            {overallAvgScore !== null ? overallAvgScore.toFixed(1) : "—"}
          </p>
          <p className="mt-1 text-xs text-slate">전체 기수 평균</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">평균 출석률</p>
          <p className="mt-2 text-3xl font-semibold text-sky-600">
            {overallAttendanceRate !== null ? overallAttendanceRate.toFixed(1) + "%" : "—"}
          </p>
          <p className="mt-1 text-xs text-slate">출석 기록 기준</p>
        </div>
      </div>

      {/* Dropout rate bar chart */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">기수별 탈락률 비교</h2>
        <p className="mt-1 text-xs text-slate">
          휴원(SUSPENDED) 상태 수강생 비율 기준 — 높을수록 관리 필요
        </p>
        <div className="mt-6 space-y-3">
          {sortedByDropout.map((row) => {
            const rate = row.dropoutRate ?? 0;
            const barPct = maxDropout > 0 ? (rate / maxDropout) * 100 : 0;
            const barColor =
              rate >= 15
                ? "bg-red-500"
                : rate >= 8
                ? "bg-amber-400"
                : "bg-forest/70";

            return (
              <div key={row.id} className="flex items-center gap-3">
                <div className="w-24 shrink-0 text-right text-xs font-medium text-ink truncate">
                  {row.name}
                </div>
                <div className="flex-1 rounded-full bg-mist h-5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${barColor}`}
                    style={{ width: `${barPct}%` }}
                  />
                </div>
                <div className="w-14 shrink-0 text-xs font-semibold text-right text-ink">
                  {row.dropoutRate !== null ? row.dropoutRate.toFixed(1) + "%" : "—"}
                </div>
                <div className="w-16 shrink-0 text-xs text-right text-slate">
                  ({row.suspendedCount}/{row.enrollmentCount}명)
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
            15% 이상 (위험)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400" />
            8~15% (주의)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-forest/70" />
            8% 미만 (양호)
          </span>
        </div>
      </section>

      {/* Subject score heatmap — avg score bar */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">기수별 성적·출석 상세 비교</h2>
        <p className="mt-1 text-xs text-slate">
          각 열에서{" "}
          <span className="font-semibold text-green-700">초록색</span>이 최우수,{" "}
          <span className="font-semibold text-red-600">빨간색</span>이 최하위 (휴원율은 낮을수록 좋음)
        </p>
        <div className="mt-4 overflow-x-auto rounded-[20px] border border-ink/10">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-mist text-left">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate">기수명</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">인원</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">활성</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">휴원</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">탈락률</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">평균점수</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">출석률</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">회차수</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">수납액</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {rows.map((row, idx) => {
                // Compute delta from previous cohort (rows are desc by startDate)
                const prevRow = rows[idx + 1];
                return (
                  <tr key={row.id} className="transition-colors hover:bg-mist/60">
                    <td className="px-4 py-3 font-medium text-ink">
                      <a
                        href={`/admin/settings/cohorts/${row.id}`}
                        className="text-forest hover:underline"
                      >
                        {row.name}
                      </a>
                      <div className="mt-0.5 text-xs text-slate">
                        {row.examCategory}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-ink">
                      {fmt(row.enrollmentCount)}명
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-forest font-semibold">
                      {fmt(row.activeCount)}명
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-amber-600">
                      {fmt(row.suspendedCount)}명
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      <div className="flex items-center justify-end gap-1">
                        <span
                          className={
                            row.dropoutRate !== null && row.dropoutRate >= 15
                              ? "font-semibold text-red-600"
                              : row.dropoutRate !== null && row.dropoutRate >= 8
                              ? "font-semibold text-amber-600"
                              : "text-ink"
                          }
                        >
                          {row.dropoutRate !== null ? row.dropoutRate.toFixed(1) + "%" : "—"}
                        </span>
                        <DeltaBadge
                          delta={
                            row.dropoutRate !== null && prevRow?.dropoutRate !== null && prevRow?.dropoutRate !== undefined
                              ? Math.round((row.dropoutRate - prevRow.dropoutRate) * 10) / 10
                              : null
                          }
                          size="sm"
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-ink">
                          {row.avgScore !== null ? row.avgScore.toFixed(1) : "—"}
                        </span>
                        <DeltaBadge
                          delta={
                            row.avgScore !== null && prevRow?.avgScore !== null && prevRow?.avgScore !== undefined
                              ? Math.round((row.avgScore - prevRow.avgScore) * 10) / 10
                              : null
                          }
                          size="sm"
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-ink">
                          {row.attendanceRate !== null ? row.attendanceRate.toFixed(1) + "%" : "—"}
                        </span>
                        <DeltaBadge
                          delta={
                            row.attendanceRate !== null && prevRow?.attendanceRate !== null && prevRow?.attendanceRate !== undefined
                              ? Math.round((row.attendanceRate - prevRow.attendanceRate) * 10) / 10
                              : null
                          }
                          size="sm"
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate">
                      {row.sessionCount > 0 ? `${row.sessionCount}회` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sky-700 font-semibold">
                      {fmt(row.revenue)}원
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-ink/10 bg-mist/80">
                <td className="px-4 py-3 text-xs font-semibold text-slate" colSpan={4}>
                  합계 / 평균
                </td>
                <td className="px-4 py-3 text-right font-mono text-sm text-slate">
                  {rows.filter((r) => r.dropoutRate !== null).length > 0
                    ? pct(
                        rows.reduce((s, r) => s + (r.suspendedCount), 0),
                        totalEnrollments,
                      )
                    : "—"}
                </td>
                <td className="px-4 py-3 text-right font-mono text-sm text-slate">
                  {overallAvgScore !== null ? overallAvgScore.toFixed(1) : "—"}
                </td>
                <td className="px-4 py-3 text-right font-mono text-sm text-slate">
                  {overallAttendanceRate !== null ? overallAttendanceRate.toFixed(1) + "%" : "—"}
                </td>
                <td className="px-4 py-3 text-right font-mono text-sm text-slate">
                  {rows.length > 0 ? (rows.reduce((s, r) => s + r.sessionCount, 0) / rows.length).toFixed(0) + "회" : "—"}
                </td>
                <td className="px-4 py-3 text-right font-mono text-sm font-semibold text-ink">
                  {fmt(totalRevenue)}원
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}
