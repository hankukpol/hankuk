"use client";

import Link from "next/link";
import { Subject, StudentStatus } from "@prisma/client";
import { SUBJECT_LABEL, ATTEND_TYPE_LABEL } from "@/lib/constants";
import { TrendLineChart, BarComparisonChart, RadarComparisonChart, ScoreTimelineChart } from "@/components/analytics/charts";
import { formatScore } from "@/lib/analytics/presentation";
import type { CumulativeAnalysisData } from "@/lib/analytics/analysis";

const STATUS_LABEL: Record<StudentStatus, string> = {
  NORMAL: "정상",
  WARNING_1: "1차 경고",
  WARNING_2: "2차 경고",
  DROPOUT: "탈락",
};

const STATUS_CLASS: Record<StudentStatus, string> = {
  NORMAL: "border-green-200 bg-green-50 text-green-700",
  WARNING_1: "border-yellow-300 bg-yellow-50 text-yellow-700",
  WARNING_2: "border-orange-300 bg-orange-50 text-orange-700",
  DROPOUT: "border-red-300 bg-red-50 text-red-700",
};

const SUBJECT_COLORS: Record<string, string> = {
  CONSTITUTIONAL_LAW: "#EA580C",
  CRIMINAL_LAW: "#2563EB",
  CRIMINAL_PROCEDURE: "#0F766E",
  POLICE_SCIENCE: "#7C3AED",
  CRIMINOLOGY: "#D97706",
  CUMULATIVE: "#64748B",
};

function TrendIcon({ trend }: { trend: "up" | "down" | "flat" }) {
  if (trend === "up") return <span className="text-green-600 font-bold">↑</span>;
  if (trend === "down") return <span className="text-red-500 font-bold">↓</span>;
  return <span className="text-slate-400">—</span>;
}

function historyAttendLabel(attendType: string | null) {
  if (!attendType) {
    return "미응시";
  }

  return ATTEND_TYPE_LABEL[attendType as keyof typeof ATTEND_TYPE_LABEL] ?? attendType;
}

function historyToneClass(attendType: string | null, hasScore: boolean) {
  if (!hasScore && attendType === "ABSENT") {
    return "border-red-200 bg-red-50/60";
  }

  if (!hasScore && attendType === "EXCUSED") {
    return "border-amber-200 bg-amber-50/60";
  }

  if (!hasScore) {
    return "border-ink/10 bg-mist/30";
  }

  return "border-ink/10 bg-white";
}

const TIMELINE_STATUS_COLOR: Record<StudentStatus, string> = {
  NORMAL: "#94A3B8",
  WARNING_1: "#CA8A04",
  WARNING_2: "#EA580C",
  DROPOUT: "#DC2626",
};

const TIMELINE_EVENT_META = [
  { dataKey: "LIVE", name: "라이브", color: "#0EA5E9", shape: "diamond" as const },
  { dataKey: "EXCUSED", name: "사유 결시", color: "#F59E0B", shape: "square" as const },
  { dataKey: "ABSENT", name: "무단 결시", color: "#DC2626", shape: "triangle" as const },
];

function formatTimelineDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("ko-KR", {
    month: "numeric",
    day: "numeric",
  });
}


function formatSignedScoreDelta(delta: number | null) {
  if (delta === null) {
    return "비교 없음";
  }

  return `${delta > 0 ? "+" : ""}${delta.toFixed(1)}점`;
}

function deltaBadgeClass(delta: number | null) {
  if (delta === null) {
    return "border-ink/10 bg-white text-slate";
  }

  if (delta > 0) {
    return "border-green-200 bg-green-50 text-green-700";
  }

  if (delta < 0) {
    return "border-red-200 bg-red-50 text-red-700";
  }

  return "border-slate-200 bg-slate-50 text-slate-700";
}
type Props = {
  data: CumulativeAnalysisData;
};

export function StudentCumulativeAnalysis({ data }: Props) {
  const { student, periods, trend, subjectStats, statusHistory, totalSessions, attendedCount, overallAvg, attendanceRate, bestPeriod } = data;

  // Build trend chart data grouped by subject
  const trendBySubject = new Map<Subject, { label: string; score: number | null }[]>();
  for (const entry of trend) {
    const list = trendBySubject.get(entry.subject) ?? [];
    list.push({ label: entry.label, score: entry.finalScore });
    trendBySubject.set(entry.subject, list);
  }

  // Build unique axis keys for the trend chart to avoid merging distinct sessions.
  const trendGroupKeys = Array.from(new Set(trend.map((entry) => `${entry.date}|${entry.periodId}|${entry.week}`)));

  // Build trend chart data: each row has a unique axis key plus one key per subject.
  const trendChartData = trendGroupKeys.map((groupKey) => {
    const entries = trend.filter((entry) => `${entry.date}|${entry.periodId}|${entry.week}` === groupKey);
    const firstEntry = entries[0];
    const row: Record<string, string | number | null> = {
      axisKey: groupKey,
      label: firstEntry?.label ?? groupKey,
    };

    for (const subject of Array.from(trendBySubject.keys())) {
      const entry = entries.find((candidate) => candidate.subject === subject);
      row[subject] = entry?.finalScore ?? null;
    }

    return row;
  });

  const trendLines = Array.from(trendBySubject.keys()).map((subject) => ({
    dataKey: subject,
    color: SUBJECT_COLORS[subject] ?? "#94A3B8",
    name: SUBJECT_LABEL[subject],
  }));

  const timelineGroupKeys = trendGroupKeys;

  const timelinePoints = timelineGroupKeys.map((groupKey) => {
    const entries = trend.filter((entry) => `${entry.date}|${entry.periodId}|${entry.week}` === groupKey);
    const firstEntry = entries[0];
    const scoredEntries = entries.filter((entry) => entry.finalScore !== null);
    const attendSummary = Array.from(new Set(entries.map((entry) => historyAttendLabel(entry.attendType)))).join(" · ");
    const toneAttendType = entries.some((entry) => entry.attendType === "ABSENT")
      ? "ABSENT"
      : entries.some((entry) => entry.attendType === "EXCUSED")
      ? "EXCUSED"
      : entries.some((entry) => entry.attendType === "LIVE")
      ? "LIVE"
      : firstEntry?.attendType ?? null;

    return {
      axisKey: firstEntry ? `${firstEntry.date}-${firstEntry.periodId}-${firstEntry.week}` : groupKey,
      label: firstEntry?.label ?? groupKey,
      date: firstEntry?.date ?? "",
      periodName: firstEntry?.periodName ?? "",
      week: firstEntry?.week ?? 0,
      metaSubtitle: firstEntry ? formatTimelineDate(firstEntry.date) : undefined,
      metaCaption: firstEntry ? `${firstEntry.periodName} · ${firstEntry.week}주차` : undefined,
      subjectSummary: entries.map((entry) => SUBJECT_LABEL[entry.subject]).join(" · "),
      attendSummary,
      averageScore:
        scoredEntries.length > 0
          ? scoredEntries.reduce((sum, entry) => sum + (entry.finalScore ?? 0), 0) / scoredEntries.length
          : null,
      topScore: scoredEntries.length > 0 ? Math.max(...scoredEntries.map((entry) => entry.finalScore ?? 0)) : null,
      hasScore: scoredEntries.length > 0,
      toneAttendType,
      entryCount: entries.length,
      entries,
    };
  });

  const timelineChartData = timelinePoints.map((point) => {
    const row: Record<string, string | number | boolean | null | undefined> = {
      axisKey: point.axisKey,
      displayLabel: point.label,
      metaSubtitle: point.metaSubtitle,
      metaCaption: point.metaCaption,
    };

    for (const subject of Array.from(trendBySubject.keys())) {
      const entry = point.entries.find((candidate) => candidate.subject === subject);
      row[subject] = entry?.finalScore ?? null;
    }

    for (const event of TIMELINE_EVENT_META) {
      row[event.dataKey] = point.entries.some((entry) => entry.attendType === event.dataKey);
    }

    return row;
  });

  const timelineScoreLines = trendLines.map((line) => ({
    ...line,
    connectNulls: false,
  }));

  const timelineAttendanceEvents = TIMELINE_EVENT_META.filter((event) =>
    trend.some((entry) => entry.attendType === event.dataKey),
  );

  const timelineAnchors = timelinePoints
    .filter((point) => point.date)
    .map((point) => ({
      axisKey: point.axisKey,
      time: new Date(point.date).getTime(),
    }));

  const timelineStatusChanges = statusHistory
    .filter((snap) => snap.status !== "NORMAL")
    .map((snap) => {
      const snapTime = new Date(snap.weekStartDate).getTime();
      const anchor =
        timelineAnchors.find((candidate) => candidate.time >= snapTime) ?? timelineAnchors[timelineAnchors.length - 1];

      if (!anchor) {
        return null;
      }

      return {
        xValue: anchor.axisKey,
        name: STATUS_LABEL[snap.status],
        color: TIMELINE_STATUS_COLOR[snap.status],
        lineDash: snap.status === "DROPOUT" ? "3 3" : "6 4",
      };
    })
    .filter(
      (
        item,
        index,
        collection,
      ): item is { xValue: string; name: string; color: string; lineDash: string } =>
        item !== null &&
        collection.findIndex((candidate) => candidate?.xValue === item.xValue && candidate?.name === item.name) === index,
    );

  const recentTimelineHighlights = [...timelinePoints]
    .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
    .slice(0, 6);
  const recentStatusAlerts = [...statusHistory].filter((snap) => snap.status !== "NORMAL").slice(-4).reverse();
  const scoredTimelineCount = trend.filter((entry) => entry.finalScore !== null).length;
  const timelineEventCount = timelinePoints.filter((point) =>
    TIMELINE_EVENT_META.some((event) => point.entries.some((entry) => entry.attendType === event.dataKey)),
  ).length;
  const statusAlertCount = statusHistory.filter((snap) => snap.status !== "NORMAL").length;

  const subjectSignalRows = subjectStats.flatMap((row) => {
    if (row.sessionCount === 0) {
      return [];
    }

    const entries = [...trend]
      .filter((entry) => entry.subject === row.subject)
      .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
    const latestEntry = entries[0];

    if (!latestEntry) {
      return [];
    }

    const latestScoreIndex = entries.findIndex((entry) => entry.finalScore !== null);
    const latestScoreEntry = latestScoreIndex >= 0 ? entries[latestScoreIndex] : null;
    const previousScoreEntry =
      latestScoreIndex >= 0
        ? entries.slice(latestScoreIndex + 1).find((entry) => entry.finalScore !== null) ?? null
        : null;
    const delta =
      latestScoreEntry?.finalScore != null && previousScoreEntry?.finalScore != null
        ? latestScoreEntry.finalScore - previousScoreEntry.finalScore
        : null;
    const targetGap =
      latestScoreEntry?.finalScore != null && row.target !== null
        ? latestScoreEntry.finalScore - row.target
        : null;
    const signalPriority =
      latestEntry.attendType === "ABSENT"
        ? 50
        : latestEntry.attendType === "EXCUSED"
        ? 40
        : latestEntry.attendType === "LIVE"
        ? 30
        : row.isWeak
        ? 20
        : delta !== null
        ? Math.abs(delta)
        : 0;

    return [{
      subject: row.subject,
      latestLabel: latestEntry.label,
      latestDateLabel: formatTimelineDate(latestEntry.date),
      latestAttendLabel: historyAttendLabel(latestEntry.attendType),
      latestAttendType: latestEntry.attendType,
      latestRecordHasScore: latestEntry.finalScore !== null,
      latestScore: latestScoreEntry?.finalScore ?? null,
      delta,
      targetGap,
      trendText: row.trend === "up" ? "상승 추세" : row.trend === "down" ? "하락 추세" : "유지 추세",
      signalPriority,
    }];
  });

  const focusSubjectRows = [...subjectSignalRows]
    .sort((left, right) => right.signalPriority - left.signalPriority)
    .slice(0, 3);

  const latestTimelinePoint = recentTimelineHighlights[0] ?? null;
  const strongestPositiveSnapshot = [...subjectSignalRows]
    .filter((row) => row.delta !== null && row.delta > 0)
    .sort((left, right) => (right.delta ?? 0) - (left.delta ?? 0))[0] ?? null;
  const strongestNegativeSnapshot = [...subjectSignalRows]
    .filter((row) => row.delta !== null && row.delta < 0)
    .sort((left, right) => (left.delta ?? 0) - (right.delta ?? 0))[0] ?? null;
  const recentBestPoint = [...recentTimelineHighlights]
    .filter((point) => point.topScore !== null)
    .sort((left, right) => (right.topScore ?? 0) - (left.topScore ?? 0))[0] ?? null;
  const recentAttendanceSignal = recentTimelineHighlights.find(
    (point) => point.toneAttendType === "ABSENT" || point.toneAttendType === "EXCUSED" || point.toneAttendType === "LIVE",
  );

  const recentHighlightCards: Array<{
    id: string;
    title: string;
    headline: string;
    supporting: string;
    caption: string;
    toneClass: string;
  }> = [];

  if (latestTimelinePoint) {
    recentHighlightCards.push({
      id: "latest",
      title: "최근 시험",
      headline: `${formatScore(latestTimelinePoint.averageScore)}점`,
      supporting: latestTimelinePoint.subjectSummary,
      caption: `${latestTimelinePoint.metaSubtitle} · ${latestTimelinePoint.attendSummary}`,
      toneClass: "border-ink/10 bg-mist/40",
    });
  }

  if (strongestPositiveSnapshot) {
    recentHighlightCards.push({
      id: "rise",
      title: "최근 상승 과목",
      headline: SUBJECT_LABEL[strongestPositiveSnapshot.subject],
      supporting: `직전 대비 ${formatSignedScoreDelta(strongestPositiveSnapshot.delta)}`,
      caption: `현재 ${formatScore(strongestPositiveSnapshot.latestScore)}점 · ${strongestPositiveSnapshot.latestDateLabel}`,
      toneClass: "border-green-200 bg-green-50/70",
    });
  }

  if (recentBestPoint) {
    recentHighlightCards.push({
      id: "best",
      title: "최근 최고점",
      headline: `${formatScore(recentBestPoint.topScore)}점`,
      supporting: recentBestPoint.subjectSummary,
      caption: `${recentBestPoint.metaSubtitle} · ${recentBestPoint.periodName}`,
      toneClass: "border-forest/20 bg-forest/5",
    });
  }

  if (recentAttendanceSignal) {
    recentHighlightCards.push({
      id: "attendance",
      title: "최근 출결 신호",
      headline: recentAttendanceSignal.attendSummary,
      supporting: recentAttendanceSignal.subjectSummary,
      caption: `${recentAttendanceSignal.metaSubtitle} · ${recentAttendanceSignal.periodName}`,
      toneClass:
        recentAttendanceSignal.toneAttendType === "ABSENT"
          ? "border-red-200 bg-red-50/70"
          : recentAttendanceSignal.toneAttendType === "EXCUSED"
          ? "border-amber-200 bg-amber-50/70"
          : "border-sky-200 bg-sky-50/70",
    });
  } else if (strongestNegativeSnapshot) {
    recentHighlightCards.push({
      id: "drop",
      title: "최근 하락 과목",
      headline: SUBJECT_LABEL[strongestNegativeSnapshot.subject],
      supporting: `직전 대비 ${formatSignedScoreDelta(strongestNegativeSnapshot.delta)}`,
      caption: `현재 ${formatScore(strongestNegativeSnapshot.latestScore)}점 · ${strongestNegativeSnapshot.latestDateLabel}`,
      toneClass: "border-red-200 bg-red-50/70",
    });
  }
  // Period comparison bar data
  const periodBarData = periods.map((p) => ({
    label: p.name.length > 6 ? p.name.slice(0, 6) + "…" : p.name,
    평균: p.avg ?? 0,
  }));

  // Radar data (cumulative averages vs targets)
  const radarData = subjectStats
    .filter((s) => s.sessionCount > 0)
    .map((s) => ({
      subject: s.subject,
      studentAverage: s.avg ?? 0,
      cohortAverage: 0,
      targetScore: s.target ?? 0,
    }));

  const weakStats = subjectStats.filter((s) => s.isWeak);

  const goalProgressRows = subjectStats.filter(
    (row) => row.target !== null && row.target > 0 && row.sessionCount > 0,
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            누적 성적 분석
          </div>
          <h2 className="mt-4 text-2xl font-semibold">
            {student.name}
            <span className="ml-2 text-lg font-normal text-slate">({student.examNumber})</span>
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate">
            {student.className && <span>{student.className}</span>}
            {student.generation && <span>{student.generation}기</span>}
            <span
              className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_CLASS[student.currentStatus]}`}
            >
              {STATUS_LABEL[student.currentStatus]}
            </span>
            {!student.isActive && (
              <span className="rounded-full border border-ink/10 bg-mist px-2 py-0.5 text-xs font-semibold text-slate">
                비활성
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
                    prefetch={false}
                    href={`/admin/students/${student.examNumber}?tab=history`}
            className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            성적 이력
          </Link>
          <Link
                    prefetch={false}
                    href={`/admin/students/${student.examNumber}?tab=analysis`}
            className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            기간별 분석
          </Link>
          <Link
                    prefetch={false}
                    href={`/admin/students/${student.examNumber}?tab=counseling`}
            className="inline-flex items-center rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-forest"
          >
            면담
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[24px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate">총 응시 횟수</p>
          <p className="mt-2 text-3xl font-bold">{attendedCount}<span className="ml-1 text-base font-normal text-slate">/ {totalSessions}회</span></p>
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate">전체 평균</p>
          <p className="mt-2 text-3xl font-bold">
            {overallAvg !== null ? overallAvg.toFixed(1) : "-"}
            <span className="ml-1 text-base font-normal text-slate">점</span>
          </p>
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate">출결률</p>
          <p className="mt-2 text-3xl font-bold">
            {attendanceRate.toFixed(1)}
            <span className="ml-1 text-base font-normal text-slate">%</span>
          </p>
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate">최고 성적 기간</p>
          <p className="mt-2 text-xl font-bold leading-tight">
            {bestPeriod ? (
              <>
                {bestPeriod.name}
                <span className="ml-2 text-base font-normal text-slate">
                  ({bestPeriod.avg?.toFixed(1)}점)
                </span>
              </>
            ) : (
              <span className="text-slate text-base font-normal">데이터 없음</span>
            )}
          </p>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-[28px] border border-ink/10 bg-white p-6">
          <h3 className="text-xl font-semibold">전체 성적 추이</h3>
          <p className="mt-1 text-xs text-slate">전체 기간에 걸친 과목별 점수 변화</p>
          <div className="mt-4">
            <TrendLineChart data={trendChartData} xKey="axisKey" xTickKey="label" lines={trendLines} />
          </div>
        </section>

        <section className="rounded-[28px] border border-ink/10 bg-white p-6">
          <h3 className="text-xl font-semibold">기간별 평균 비교</h3>
          <p className="mt-1 text-xs text-slate">각 수강 기간의 평균 점수</p>
          <div className="mt-4">
            <BarComparisonChart
              data={periodBarData}
              xKey="label"
              bars={[{ dataKey: "평균", color: "#C55A11", name: "기간 평균" }]}
            />
          </div>
        </section>
      </div>

      {periods.length > 0 ? (
        <section className="rounded-[28px] border border-ink/10 bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="text-xl font-semibold">기간별 성과 카드</h3>
              <p className="mt-1 text-xs text-slate">어느 기간이 강점이었는지 평균과 응시율로 빠르게 비교합니다.</p>
            </div>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
            {periods.map((period) => {
              const rate = period.sessionCount === 0 ? 0 : Math.round((period.attendedCount / period.sessionCount) * 1000) / 10;
              const isBest = bestPeriod?.id === period.id;

              return (
                <article
                  key={period.id}
                  className={`rounded-[24px] border p-5 ${isBest ? "border-forest/30 bg-forest/5" : "border-ink/10 bg-mist/30"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-ink">{period.name}</p>
                      <p className="mt-1 text-sm text-slate">응시 {period.attendedCount} / {period.sessionCount}회</p>
                    </div>
                    {isBest ? (
                      <span className="rounded-full border border-forest/20 bg-white px-3 py-1 text-xs font-semibold text-forest">
                        최고 구간
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-5 h-2 overflow-hidden rounded-full bg-ink/10">
                    <div className="h-full rounded-full bg-ink" style={{ width: `${Math.max(0, Math.min(rate, 100))}%` }} />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-slate">평균</p>
                      <p className="mt-1 font-semibold text-ink">{formatScore(period.avg)}</p>
                    </div>
                    <div>
                      <p className="text-slate">응시율</p>
                      <p className="mt-1 font-semibold text-ink">{rate.toFixed(1)}%</p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Radar chart */}
      {radarData.length > 0 && (
        <section className="rounded-[28px] border border-ink/10 bg-white p-6">
          <h3 className="text-xl font-semibold">과목별 레이더 (누적 평균)</h3>
          <p className="mt-1 text-xs text-slate">전체 기간 누적 과목별 평균과 목표 점수 비교</p>
          <div className="mt-4">
            <RadarComparisonChart data={radarData} />
          </div>
        </section>
      )}

      {goalProgressRows.length > 0 ? (
        <section className="rounded-[28px] border border-ink/10 bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="text-xl font-semibold">과목별 목표 달성 현황</h3>
              <p className="mt-1 text-xs text-slate">누적 평균과 목표 점수 차이를 함께 확인합니다.</p>
            </div>
            <Link
              prefetch={false}
              href={`/admin/students/${student.examNumber}?tab=counseling`}
              className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
            >
              목표 점수 조정
            </Link>
          </div>
          <div className="mt-6 space-y-4">
            {goalProgressRows.map((row) => {
              const achievementRate = row.avg !== null && row.target ? (row.avg / row.target) * 100 : null;
              const cappedWidth = achievementRate !== null ? Math.max(0, Math.min(achievementRate, 100)) : 0;
              const gap = row.avg !== null && row.target !== null ? row.avg - row.target : null;
              const barClass =
                achievementRate === null
                  ? "bg-slate/20"
                  : achievementRate >= 100
                  ? "bg-forest"
                  : achievementRate >= 80
                  ? "bg-amber-500"
                  : "bg-ember";

              return (
                <article key={row.subject} className="rounded-[24px] border border-ink/10 bg-mist/30 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold">{SUBJECT_LABEL[row.subject]}</p>
                      <p className="mt-2 text-sm text-slate">
                        현재 {formatScore(row.avg)}점 · 목표 {formatScore(row.target)}점
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-slate">달성률</p>
                      <p className="mt-1 text-lg font-semibold">
                        {achievementRate !== null ? `${achievementRate.toFixed(1)}%` : "-"}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 h-3 overflow-hidden rounded-full bg-ink/10">
                    <div className={`h-full rounded-full ${barClass}`} style={{ width: `${cappedWidth}%` }} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className={gap !== null && gap >= 0 ? "font-semibold text-forest" : "font-semibold text-ember"}>
                      {gap === null ? "비교 불가" : `${gap >= 0 ? "+" : ""}${gap.toFixed(1)}점`}
                    </span>
                    <span className="text-slate">
                      {row.trend === "up" ? "상승 추세" : row.trend === "down" ? "하락 추세" : "유지 추세"}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Subject stats table */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h3 className="text-xl font-semibold">과목별 누적 통계</h3>
        <div className="mt-6 overflow-x-auto rounded-[24px] border border-ink/10">
          <table className="min-w-full divide-y divide-ink/10 text-sm">
            <thead className="bg-mist/80 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">과목</th>
                <th className="px-4 py-3 font-semibold">응시</th>
                <th className="px-4 py-3 font-semibold">누적 평균</th>
                <th className="px-4 py-3 font-semibold">목표 점수</th>
                <th className="px-4 py-3 font-semibold">최고점</th>
                <th className="px-4 py-3 font-semibold">최저점</th>
                <th className="px-4 py-3 font-semibold">추이</th>
                <th className="px-4 py-3 font-semibold">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              {subjectStats.map((row) => (
                <tr key={row.subject} className={row.isWeak ? "bg-red-50/40" : undefined}>
                  <td className="px-4 py-3 font-medium">{SUBJECT_LABEL[row.subject]}</td>
                  <td className="px-4 py-3">{row.scoredCount} / {row.sessionCount}회</td>
                  <td className="px-4 py-3 font-semibold">{formatScore(row.avg)}</td>
                  <td className="px-4 py-3">{formatScore(row.target)}</td>
                  <td className="px-4 py-3">{formatScore(row.highest)}</td>
                  <td className="px-4 py-3">{formatScore(row.lowest)}</td>
                  <td className="px-4 py-3"><TrendIcon trend={row.trend} /></td>
                  <td className="px-4 py-3">
                    {row.isWeak ? (
                      <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">
                        목표 미달
                      </span>
                    ) : row.avg !== null ? (
                      <span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700">
                        달성
                      </span>
                    ) : (
                      <span className="text-slate text-xs">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Goal progress section */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <p className="text-sm font-semibold text-ink mb-4">과목별 목표 달성 현황</p>
        {goalProgressRows.length === 0 ? (
          <p className="text-sm text-slate">
            <Link
              prefetch={false}
              href={`/admin/students/${student.examNumber}?tab=counseling`}
              className="underline hover:text-ember"
            >
              면담 탭
            </Link>
            에서 과목별 목표 점수를 설정하면 달성률이 표시됩니다.
          </p>
        ) : (
          <div className="space-y-5">
            {goalProgressRows.map((row) => {
              const achievementRate = row.avg !== null && row.target ? (row.avg / row.target) * 100 : null;
              const cappedWidth = achievementRate !== null ? Math.max(0, Math.min(achievementRate, 100)) : 0;
              const gap = row.avg !== null && row.target !== null ? row.avg - row.target : null;
              const isAchieved = achievementRate !== null && achievementRate >= 100;
              const isNear = achievementRate !== null && achievementRate >= 80 && achievementRate < 100;
              const barClass =
                achievementRate === null
                  ? "bg-slate/20"
                  : isAchieved
                  ? "bg-forest"
                  : isNear
                  ? "bg-amber-500"
                  : "bg-ember";

              return (
                <div key={row.subject}>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-ink">{SUBJECT_LABEL[row.subject]}</span>
                      {isAchieved ? (
                        <span className="rounded-full border border-forest/20 bg-forest/10 px-2 py-0.5 text-[11px] font-semibold text-forest">
                          달성
                        </span>
                      ) : isNear ? (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                          거의
                        </span>
                      ) : (
                        <span className="rounded-full border border-ember/20 bg-ember/10 px-2 py-0.5 text-[11px] font-semibold text-ember">
                          ⚠ 주의
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate">
                      <span>현재 {row.avg !== null ? row.avg.toFixed(1) : "-"}점</span>
                      <span>목표 {row.target !== null ? row.target : "-"}점</span>
                      <span className="font-semibold">
                        {achievementRate !== null ? `${achievementRate.toFixed(1)}%` : "-"}
                      </span>
                      <span className={gap !== null && gap >= 0 ? "font-semibold text-forest" : "font-semibold text-ember"}>
                        {gap === null
                          ? ""
                          : gap >= 0
                          ? `+${gap.toFixed(1)}점 초과`
                          : `-${Math.abs(gap).toFixed(1)}점 부족`}
                      </span>
                    </div>
                  </div>
                  <div className="h-2 w-full rounded-full bg-ink/8">
                    <div
                      className={`h-full rounded-full transition-[width] duration-500 ${barClass}`}
                      style={{ width: `${cappedWidth}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Weak point analysis */}
      {weakStats.length > 0 && (
        <section className="rounded-[28px] border border-red-100 bg-red-50/30 p-6">
          <h3 className="flex items-center gap-2 text-xl font-semibold text-red-700">
            <span>취약점 분석</span>
          </h3>
          <p className="mt-1 text-sm text-red-600/80">목표 점수에 미달하는 과목입니다. 집중 학습이 필요합니다.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {weakStats.map((s) => (
              <div key={s.subject} className="rounded-[20px] border border-red-200 bg-white p-4">
                <p className="font-semibold text-red-700">{SUBJECT_LABEL[s.subject]}</p>
                <div className="mt-2 flex items-center gap-3 text-sm">
                  <div>
                    <span className="text-slate">현재 평균</span>
                    <p className="text-xl font-bold text-red-600">{formatScore(s.avg)}</p>
                  </div>
                  <div className="text-slate/40 text-2xl">→</div>
                  <div>
                    <span className="text-slate">목표</span>
                    <p className="text-xl font-bold">{s.target ?? "-"}</p>
                  </div>
                </div>
                {s.avg !== null && s.target !== null && (
                  <p className="mt-2 text-xs text-red-500">
                    목표까지 {(s.target - s.avg).toFixed(1)}점 부족
                    {s.trend === "up" ? " · 상승 추세" : s.trend === "down" ? " · 하락 추세" : ""}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Status history */}
      {statusHistory.length > 0 && (
        <section className="rounded-[28px] border border-ink/10 bg-white p-6">
          <h3 className="text-xl font-semibold">상태 변화 이력</h3>
          <p className="mt-1 text-xs text-slate">주차별 출결 상태 추적 기록</p>
          <div className="mt-4 overflow-x-auto rounded-[24px] border border-ink/10">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <thead className="bg-mist/80 text-left">
                <tr>
                  <th className="px-4 py-3 font-semibold">주차</th>
                  <th className="px-4 py-3 font-semibold">주간 시작</th>
                  <th className="px-4 py-3 font-semibold">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {statusHistory.map((snap, i) => (
                  <tr
                    key={i}
                    className={
                      snap.status === "DROPOUT"
                        ? "bg-red-50/40"
                        : snap.status === "WARNING_2"
                        ? "bg-orange-50/30"
                        : snap.status === "WARNING_1"
                        ? "bg-yellow-50/30"
                        : undefined
                    }
                  >
                    <td className="px-4 py-3 font-medium">{snap.weekKey}</td>
                    <td className="px-4 py-3">
                      {new Date(snap.weekStartDate).toLocaleDateString("ko-KR", {
                        month: "numeric",
                        day: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_CLASS[snap.status]}`}>
                        {STATUS_LABEL[snap.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold">전체 성적 타임라인</h3>
            <p className="mt-1 text-xs text-slate">
              실선은 과목 점수, 하단 마커는 출결 이벤트, 세로선은 경고와 탈락 변화를 함께 보여줍니다.
            </p>
          </div>
          <Link
            prefetch={false}
            href={`/admin/students/${student.examNumber}?tab=history`}
            className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            상세 이력으로 이동
          </Link>
        </div>
        {trend.length === 0 ? (
          <div className="mt-6 rounded-[24px] border border-dashed border-ink/10 px-5 py-10 text-center text-sm text-slate">
            성적 데이터가 없습니다.
          </div>
        ) : (
          <>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-[20px] border border-ink/10 bg-mist/40 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">누적 기록</p>
                <p className="mt-3 text-3xl font-semibold text-ink">{trend.length}</p>
                <p className="mt-1 text-sm text-slate">과목 단위 시험 이력</p>
              </div>
              <div className="rounded-[20px] border border-ink/10 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">실점수 기록</p>
                <p className="mt-3 text-3xl font-semibold text-ink">{scoredTimelineCount}</p>
                <p className="mt-1 text-sm text-slate">점수까지 남은 기록</p>
              </div>
              <div className="rounded-[20px] border border-ink/10 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">출결 이벤트</p>
                <p className="mt-3 text-3xl font-semibold text-ember">{timelineEventCount}</p>
                <p className="mt-1 text-sm text-slate">차트 기준 출결 이벤트 포인트</p>
              </div>
              <div className="rounded-[20px] border border-ink/10 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">상태 알림</p>
                <p className="mt-3 text-3xl font-semibold text-red-600">{statusAlertCount}</p>
                <p className="mt-1 text-sm text-slate">경고 또는 탈락 전환</p>
              </div>
            </div>

            <div className="mt-6 space-y-6">
              <div className="rounded-[24px] border border-ink/10 bg-mist/20 p-4">
                <div className="flex flex-wrap gap-2 text-xs text-slate">
                  <span className="rounded-full border border-ink/10 bg-white px-3 py-1">실선: 과목별 점수 흐름</span>
                  <span className="rounded-full border border-ink/10 bg-white px-3 py-1">마커: 라이브 · 사유 결시 · 무단 결시</span>
                  <span className="rounded-full border border-ink/10 bg-white px-3 py-1">세로선: 경고 및 탈락 시점</span>
                </div>
                <div className="mt-4 overflow-x-auto pb-2">
                  <div className="min-w-[720px]">
                    <ScoreTimelineChart
                      data={timelineChartData}
                      xKey="axisKey"
                      xTickKey="displayLabel"
                      scoreLines={timelineScoreLines}
                      attendanceEvents={timelineAttendanceEvents}
                      statusChanges={timelineStatusChanges}
                      className="h-[360px] sm:h-[420px]"
                    />
                  </div>
                </div>
                <p className="mt-3 text-xs text-slate">모바일에서는 좌우 스크롤로 전체 기간을 확인할 수 있습니다.</p>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-[24px] border border-ink/10 bg-white p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-base font-semibold text-ink">최근 변화 하이라이트</h4>
                      <p className="mt-1 text-xs text-slate">최근 기록을 모두 나열하지 않고, 의미 있는 변화만 먼저 보여줍니다.</p>
                    </div>
                    <span className="rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold text-slate">
                      핵심 {recentHighlightCards.length}개
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {recentHighlightCards.map((card) => (
                      <article key={card.id} className={`rounded-[20px] border p-4 ${card.toneClass}`}>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate">{card.title}</p>
                        <p className="mt-3 text-2xl font-semibold text-ink">{card.headline}</p>
                        <p className="mt-2 text-sm font-medium text-ink">{card.supporting}</p>
                        <p className="mt-1 text-xs text-slate">{card.caption}</p>
                      </article>
                    ))}
                  </div>
                  <div className="mt-5 border-t border-ink/10 pt-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h5 className="text-sm font-semibold text-ink">핵심 과목 스냅샷</h5>
                        <p className="mt-1 text-xs text-slate">결시, 목표 미달, 최근 변동이 큰 과목을 우선으로 정리했습니다.</p>
                      </div>
                      <span className="rounded-full border border-ink/10 bg-white px-3 py-1 text-xs font-semibold text-slate">
                        우선 {focusSubjectRows.length}과목
                      </span>
                    </div>
                    <div className="mt-4 space-y-3">
                      {focusSubjectRows.length > 0 ? (
                        focusSubjectRows.map((row) => (
                          <article
                            key={row.subject}
                            className={`rounded-[20px] border p-4 ${historyToneClass(row.latestAttendType, row.latestRecordHasScore)}`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-ink">{SUBJECT_LABEL[row.subject]}</p>
                                <p className="mt-1 text-xs text-slate">{row.latestDateLabel} · {row.latestAttendLabel}</p>
                              </div>
                              <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${deltaBadgeClass(row.delta)}`}>
                                {row.delta !== null ? formatSignedScoreDelta(row.delta) : row.trendText}
                              </span>
                            </div>
                            <div className="mt-4 flex items-end justify-between gap-3">
                              <div>
                                <p className="text-[11px] text-slate">최근 채점 점수</p>
                                <p className="mt-1 text-xl font-semibold text-ink">{formatScore(row.latestScore)}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-[11px] text-slate">목표 대비</p>
                                <p
                                  className={`mt-1 text-sm font-semibold ${
                                    row.targetGap === null ? "text-slate" : row.targetGap >= 0 ? "text-forest" : "text-ember"
                                  }`}
                                >
                                  {row.targetGap === null
                                    ? "목표 미설정"
                                    : `${row.targetGap >= 0 ? "+" : ""}${row.targetGap.toFixed(1)}점`}
                                </p>
                              </div>
                            </div>
                            <p className="mt-3 text-[11px] text-slate">{row.latestLabel}</p>
                          </article>
                        ))
                      ) : (
                        <p className="rounded-[18px] border border-dashed border-ink/10 px-4 py-6 text-center text-sm text-slate">
                          강조할 최근 과목 데이터가 없습니다.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-[24px] border border-ink/10 bg-white p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-base font-semibold text-ink">상태 변화 포인트</h4>
                      <p className="mt-1 text-xs text-slate">경고와 탈락 전환만 따로 모아 읽기 쉽게 정리했습니다.</p>
                    </div>
                    <span className="rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold text-slate">
                      {recentStatusAlerts.length}건
                    </span>
                  </div>
                  {recentStatusAlerts.length > 0 ? (
                    <div className="mt-4 space-y-4">
                      {recentStatusAlerts.map((snap, index) => (
                        <div key={`${snap.weekKey}-${snap.status}-${index}`} className="flex gap-4 rounded-[20px] border border-ink/10 bg-mist/30 p-4">
                          <div className={`mt-1 h-3 w-3 shrink-0 rounded-full ${snap.status === "DROPOUT" ? "bg-red-500" : snap.status === "WARNING_2" ? "bg-orange-400" : snap.status === "WARNING_1" ? "bg-yellow-400" : "bg-slate-300"}`} />
                          <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate">{snap.weekKey}</p>
                              <p className="mt-2 text-sm font-medium text-ink">
                                {new Date(snap.weekStartDate).toLocaleDateString("ko-KR", {
                                  month: "numeric",
                                  day: "numeric",
                                })}
                              </p>
                              <p className="mt-1 text-xs text-slate">해당 주차 상태 변화가 타임라인에 세로선으로 표시됩니다.</p>
                            </div>
                            <span className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold ${STATUS_CLASS[snap.status]}`}>
                              {STATUS_LABEL[snap.status]}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-slate">경고나 탈락으로 바뀐 주차는 아직 없습니다.</p>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
