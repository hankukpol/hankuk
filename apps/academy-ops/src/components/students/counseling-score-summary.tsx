import Link from "next/link";
import type { CounselingBriefing } from "@/lib/analytics/analysis";
import { SUBJECT_LABEL } from "@/lib/constants";
import { formatScore, formatRank } from "@/lib/analytics/presentation";

interface Props {
  examNumber: string;
  briefing: CounselingBriefing;
}

export function CounselingScoreSummary({ examNumber, briefing }: Props) {
  // Derive the weakest subject from subjectProgress
  const weakestSubject = briefing.subjectProgress
    .filter((row) => row.currentAverage !== null)
    .sort((a, b) => {
      // Sort weak subjects first, then by ascending current average
      if (a.isWeak !== b.isWeak) return a.isWeak ? -1 : 1;
      return (a.currentAverage ?? 100) - (b.currentAverage ?? 100);
    })[0] ?? null;

  // Recent avg from recentWeeksTrend (last 3 weeks, overall)
  const recentWeeks = briefing.recentWeeksTrend.slice(-3);
  const recentAvg: number | null = (() => {
    const allScores: number[] = [];
    for (const week of recentWeeks) {
      for (const row of week.bySubject) {
        if (row.avgScore !== null) allScores.push(row.avgScore);
      }
    }
    if (allScores.length === 0) return null;
    return Math.round((allScores.reduce((a, b) => a + b, 0) / allScores.length) * 10) / 10;
  })();

  const attendanceColor =
    briefing.participationRate >= 80
      ? "text-[#1F4D3A]"
      : briefing.participationRate >= 60
        ? "text-amber-600"
        : "text-[#C55A11]";

  return (
    <section className="rounded-[28px] border border-ink/10 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-ink/10 px-6 py-4">
        <h2 className="text-sm font-semibold text-ink">성적 &amp; 출결 요약 (상담용)</h2>
        <Link
          href={`/admin/students/${examNumber}?tab=analysis`}
          className="inline-flex items-center gap-1 rounded-full border border-forest/20 bg-forest/5 px-3 py-1 text-xs font-semibold text-forest transition hover:bg-forest/10"
        >
          분석 탭 전체 보기 →
        </Link>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 divide-x divide-ink/10 sm:grid-cols-5">
        {/* 최근 점수 */}
        <div className="flex flex-col gap-0.5 px-5 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate">최근 점수</p>
          <p className="text-xl font-semibold tabular-nums text-ink">
            {recentAvg !== null ? `${recentAvg.toFixed(1)}점` : "-"}
          </p>
          <p className="text-[10px] text-slate">최근 3주 평균</p>
        </div>

        {/* 전체 평균 */}
        <div className="flex flex-col gap-0.5 px-5 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate">전체 평균</p>
          <p className="text-xl font-semibold tabular-nums text-ink">
            {briefing.overallAverage !== null ? `${formatScore(briefing.overallAverage)}점` : "-"}
          </p>
          <p className="text-[10px] text-slate">기간 전체</p>
        </div>

        {/* 석차 */}
        <div className="flex flex-col gap-0.5 px-5 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate">석차</p>
          <p className="text-xl font-semibold tabular-nums text-ink">
            {formatRank(briefing.overallRank)}
          </p>
          <p className="text-[10px] text-slate">현재 기수</p>
        </div>

        {/* 출석률 */}
        <div className="flex flex-col gap-0.5 px-5 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate">출석률</p>
          <p className={`text-xl font-semibold tabular-nums ${attendanceColor}`}>
            {briefing.participationRate.toFixed(0)}%
          </p>
          <p className="text-[10px] text-slate">응시율 기준</p>
        </div>

        {/* 약점 과목 */}
        <div className="col-span-2 flex flex-col gap-0.5 px-5 py-4 sm:col-span-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate">약점 과목</p>
          {weakestSubject ? (
            <>
              <p className="text-base font-semibold text-[#C55A11]">
                {SUBJECT_LABEL[weakestSubject.subject]}
              </p>
              <p className="text-[10px] text-slate">
                {weakestSubject.currentAverage !== null
                  ? `${formatScore(weakestSubject.currentAverage)}점`
                  : "-"}
              </p>
            </>
          ) : (
            <p className="text-base font-semibold text-slate">-</p>
          )}
        </div>
      </div>

      {/* Absence alert if needed */}
      {briefing.absentCount > 0 && (
        <div className="border-t border-ink/10 px-6 py-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-600">
            무단 결시 {briefing.absentCount}회
          </span>
        </div>
      )}
    </section>
  );
}
