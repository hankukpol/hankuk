import { Subject } from "@prisma/client";
import type { CounselingBriefing } from "@/lib/analytics/analysis";
import { formatRank, formatScore, STATUS_BADGE_CLASS, STATUS_LABEL } from "@/lib/analytics/presentation";
import { SUBJECT_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/format";

type Props = {
  briefing: CounselingBriefing;
};

function trendDirection(values: Array<number | null>) {
  const filtered = values.filter((value): value is number => value !== null);

  if (filtered.length < 2) {
    return "flat" as const;
  }

  const delta = filtered[filtered.length - 1] - filtered[0];

  if (delta >= 3) {
    return "up" as const;
  }

  if (delta <= -3) {
    return "down" as const;
  }

  return "flat" as const;
}

function trendLabel(direction: ReturnType<typeof trendDirection>) {
  if (direction === "up") return "상승";
  if (direction === "down") return "하락";
  return "유지";
}

function trendSymbol(direction: ReturnType<typeof trendDirection>) {
  if (direction === "up") return "▲";
  if (direction === "down") return "▼";
  return "■";
}

function buildSubjectSeries(weeks: CounselingBriefing["recentWeeksTrend"]) {
  const series = new Map<Subject, Array<number | null>>();

  for (const week of weeks) {
    for (const row of week.bySubject) {
      const current = series.get(row.subject) ?? Array.from({ length: weeks.length }, () => null);
      current[weeks.indexOf(week)] = row.avgScore;
      series.set(row.subject, current);
    }
  }

  return Array.from(series.entries())
    .map(([subject, values]) => ({
      subject,
      values,
      direction: trendDirection(values),
    }))
    .sort((left, right) => {
      const leftCount = left.values.filter((value) => value !== null).length;
      const rightCount = right.values.filter((value) => value !== null).length;
      return rightCount - leftCount;
    });
}

export function CounselingBriefingCard({ briefing }: Props) {
  const subjectSeries = buildSubjectSeries(briefing.recentWeeksTrend).slice(0, 4);
  const highlightedProgress = [...briefing.subjectProgress]
    .filter((row) => row.currentAverage !== null || row.targetScore !== null)
    .sort((left, right) => {
      if (left.isWeak !== right.isWeak) {
        return left.isWeak ? -1 : 1;
      }

      return (left.gap ?? Number.POSITIVE_INFINITY) - (right.gap ?? Number.POSITIVE_INFINITY);
    })
    .slice(0, 4);

  return (
    <section className="rounded-[28px] border border-ink/10 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            Counseling Briefing
          </div>
          <h2 className="mt-4 text-2xl font-semibold">면담 브리핑</h2>
          <p className="mt-2 text-sm text-slate">면담 전에 빠르게 확인할 수 있는 핵심 요약입니다.</p>
        </div>
        <span
          className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_BADGE_CLASS[briefing.currentStatus]}`}
        >
          {STATUS_LABEL[briefing.currentStatus]}
        </span>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">전체 평균</p>
          <p className="mt-2 text-2xl font-semibold">{formatScore(briefing.overallAverage)}</p>
        </article>
        <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">전체 석차</p>
          <p className="mt-2 text-2xl font-semibold">{formatRank(briefing.overallRank)}</p>
        </article>
        <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">응시율</p>
          <p className="mt-2 text-2xl font-semibold">{briefing.participationRate.toFixed(1)}%</p>
        </article>
        <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">무단 결시</p>
          <p className="mt-2 text-2xl font-semibold">{briefing.absentCount}회</p>
        </article>
        <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">현재 상태</p>
          <p className="mt-2 text-2xl font-semibold">{STATUS_LABEL[briefing.currentStatus]}</p>
        </article>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <section className="rounded-[24px] border border-ink/10 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">최근 4주 추이</h3>
              <p className="mt-1 text-sm text-slate">
                {briefing.recentWeeksTrend.length > 0
                  ? briefing.recentWeeksTrend.map((row) => row.weekLabel).join(" · ")
                  : "최근 4주 기록이 없습니다."}
              </p>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {subjectSeries.length === 0 ? (
              <div className="rounded-[20px] border border-dashed border-ink/10 px-4 py-6 text-sm text-slate">
                최근 추이 데이터가 없습니다.
              </div>
            ) : null}
            {subjectSeries.map((row) => (
              <div key={row.subject} className="rounded-[20px] border border-ink/10 bg-mist px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink">{SUBJECT_LABEL[row.subject]}</p>
                    <p className="mt-1 text-sm text-slate">
                      {row.values.map((value) => (value === null ? "-" : formatScore(value))).join(" · ")}
                    </p>
                  </div>
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                      row.direction === "up"
                        ? "border-forest/20 bg-forest/10 text-forest"
                        : row.direction === "down"
                          ? "border-red-200 bg-red-50 text-red-600"
                          : "border-ink/10 bg-white text-slate"
                    }`}
                  >
                    {trendSymbol(row.direction)} {trendLabel(row.direction)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[24px] border border-ink/10 p-5">
          <h3 className="text-lg font-semibold">목표 대비 진행</h3>
          <div className="mt-4 space-y-3">
            {highlightedProgress.length === 0 ? (
              <div className="rounded-[20px] border border-dashed border-ink/10 px-4 py-6 text-sm text-slate">
                목표 점수 또는 현재 평균 데이터가 없습니다.
              </div>
            ) : null}
            {highlightedProgress.map((row) => (
              <div key={row.subject} className="rounded-[20px] border border-ink/10 bg-mist px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-ink">{SUBJECT_LABEL[row.subject]}</p>
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                      row.isWeak
                        ? "border-red-200 bg-red-50 text-red-600"
                        : row.gap !== null && row.gap >= 0
                          ? "border-forest/20 bg-forest/10 text-forest"
                          : "border-amber-200 bg-amber-50 text-amber-700"
                    }`}
                  >
                    {row.gap === null
                      ? "목표 미설정"
                      : row.gap >= 0
                        ? `+${formatScore(row.gap)}점`
                        : `${formatScore(row.gap)}점`}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate">
                  <span>현재 {formatScore(row.currentAverage)}</span>
                  <span>목표 {formatScore(row.targetScore)}</span>
                  <span>
                    추이 {trendSymbol(row.trend)} {trendLabel(row.trend)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-[24px] border border-ink/10 bg-mist p-5">
        <h3 className="text-lg font-semibold">직전 면담 이후 변화</h3>
        {!briefing.sinceLastCounseling ? (
          <p className="mt-2 text-sm text-slate">비교할 이전 면담 기록이 없습니다.</p>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate">
            <span>최근 면담 {briefing.sinceLastCounseling.lastCounseledAt ? formatDate(briefing.sinceLastCounseling.lastCounseledAt) : "-"}</span>
            <span>이전 평균 {formatScore(briefing.sinceLastCounseling.avgBefore)}</span>
            <span>이후 평균 {formatScore(briefing.sinceLastCounseling.avgAfter)}</span>
            <span
              className={
                briefing.sinceLastCounseling.change !== null && briefing.sinceLastCounseling.change > 0
                  ? "font-semibold text-forest"
                  : briefing.sinceLastCounseling.change !== null && briefing.sinceLastCounseling.change < 0
                    ? "font-semibold text-ember"
                    : "font-semibold text-slate"
              }
            >
              변화
              {briefing.sinceLastCounseling.change === null
                ? " -"
                : ` ${briefing.sinceLastCounseling.change > 0 ? "+" : ""}${formatScore(briefing.sinceLastCounseling.change)}점`}
            </span>
          </div>
        )}
      </section>
    </section>
  );
}