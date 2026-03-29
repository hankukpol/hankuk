import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole, AttendType, Subject } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { SUBJECT_LABEL, EXAM_TYPE_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function scoreColor(score: number): string {
  if (score >= 80) return "text-forest font-semibold";
  if (score >= 60) return "text-amber-600";
  return "text-ember";
}

/** Build a 10-point bucket histogram label from bucket index */
function bucketLabel(idx: number): string {
  const lo = idx * 10;
  const hi = lo + 9;
  if (lo === 100) return "100점";
  return `${lo}~${hi}`;
}

export default async function PeriodStatsPage({ params }: PageProps) {
  const { id: rawId } = await params;
  const periodId = Number(rawId);
  if (isNaN(periodId)) notFound();

  await requireAdminContext(AdminRole.TEACHER);

  const db = getPrisma();

  // ── 기간 기본 정보 ────────────────────────────────────────────────────────
  const period = await db.examPeriod.findUnique({
    where: { id: periodId },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      totalWeeks: true,
      isActive: true,
      isGongchaeEnabled: true,
      isGyeongchaeEnabled: true,
    },
  });
  if (!period) notFound();

  // ── 전체 회차 + 성적 데이터 ───────────────────────────────────────────────
  const sessions = await db.examSession.findMany({
    where: { periodId, isCancelled: false },
    include: {
      scores: {
        where: {
          attendType: { in: [AttendType.NORMAL, AttendType.LIVE] },
          finalScore: { not: null },
        },
        select: {
          examNumber: true,
          finalScore: true,
          attendType: true,
          student: { select: { examNumber: true, name: true, examType: true, className: true } },
        },
      },
    },
    orderBy: [{ examDate: "asc" }, { examType: "asc" }, { subject: "asc" }],
  });

  // ── 전체 응시 점수 집계 ──────────────────────────────────────────────────
  const allScores = sessions.flatMap((s) =>
    s.scores
      .filter((sc) => sc.finalScore !== null)
      .map((sc) => sc.finalScore as number),
  );

  const totalSessions = sessions.length;
  const totalScoreEntries = allScores.length;
  const overallAvg =
    allScores.length > 0
      ? round1(allScores.reduce((a, b) => a + b, 0) / allScores.length)
      : null;
  const overallMax = allScores.length > 0 ? Math.max(...allScores) : null;
  const overallMin = allScores.length > 0 ? Math.min(...allScores) : null;

  // 과락 (40점 미만)
  const failCount = allScores.filter((s) => s < 40).length;
  const highScoreCount = allScores.filter((s) => s >= 80).length;

  // ── 10점 단위 히스토그램 (0~9, 10~19, ..., 90~99, 100) ─────────────────
  const histBuckets = Array(11).fill(0) as number[]; // idx 0–10 (idx10 = 100점)
  for (const sc of allScores) {
    const idx = sc === 100 ? 10 : Math.floor(sc / 10);
    histBuckets[Math.min(idx, 10)]++;
  }
  const histMax = Math.max(...histBuckets, 1);

  // ── 과목별 성적 통계 ───────────────────────────────────────────────────────
  type SubjectStat = {
    subject: Subject;
    displayLabel: string;
    examType: string;
    count: number;
    avg: number | null;
    max: number | null;
    min: number | null;
    pass80: number; // >= 80
    fail40: number; // < 40
  };

  const subjectMap = new Map<string, { scores: number[]; examType: string; displayLabel: string }>();

  for (const session of sessions) {
    const key = `${session.examType}::${session.subject}`;
    const label =
      session.displaySubjectName?.trim() ||
      SUBJECT_LABEL[session.subject] ||
      session.subject;
    const existing = subjectMap.get(key);
    if (!existing) {
      subjectMap.set(key, {
        scores: session.scores.map((sc) => sc.finalScore as number),
        examType: session.examType,
        displayLabel: label,
      });
    } else {
      existing.scores.push(...session.scores.map((sc) => sc.finalScore as number));
    }
  }

  const subjectStats: SubjectStat[] = Array.from(subjectMap.entries()).map(
    ([key, data]) => {
      const subject = key.split("::")[1] as Subject;
      const scores = data.scores;
      const avg =
        scores.length > 0
          ? round1(scores.reduce((a, b) => a + b, 0) / scores.length)
          : null;
      return {
        subject,
        displayLabel: data.displayLabel,
        examType: data.examType,
        count: scores.length,
        avg,
        max: scores.length > 0 ? Math.max(...scores) : null,
        min: scores.length > 0 ? Math.min(...scores) : null,
        pass80: scores.filter((s) => s >= 80).length,
        fail40: scores.filter((s) => s < 40).length,
      };
    },
  );

  subjectStats.sort((a, b) => {
    if (a.examType !== b.examType) return a.examType.localeCompare(b.examType);
    return a.displayLabel.localeCompare(b.displayLabel, "ko");
  });

  // ── 주차별 평균 추이 ───────────────────────────────────────────────────────
  type WeekStat = {
    week: number;
    examType: string;
    count: number;
    avg: number | null;
  };

  const weekMap = new Map<string, { scores: number[]; examType: string }>();
  for (const session of sessions) {
    const key = `${session.examType}::${session.week}`;
    const existing = weekMap.get(key);
    const scores = session.scores.map((sc) => sc.finalScore as number);
    if (!existing) {
      weekMap.set(key, { scores, examType: session.examType });
    } else {
      existing.scores.push(...scores);
    }
  }

  const weekStats: WeekStat[] = Array.from(weekMap.entries()).map(([key, data]) => {
    const week = Number(key.split("::")[1]);
    const avg =
      data.scores.length > 0
        ? round1(data.scores.reduce((a, b) => a + b, 0) / data.scores.length)
        : null;
    return { week, examType: data.examType, count: data.scores.length, avg };
  });
  weekStats.sort((a, b) => {
    if (a.examType !== b.examType) return a.examType.localeCompare(b.examType);
    return a.week - b.week;
  });

  const weekAvgMax = Math.max(...weekStats.map((w) => w.avg ?? 0), 100);

  // ── 학생별 평균 (상위 20) ─────────────────────────────────────────────────
  const studentScoreMap = new Map<
    string,
    { name: string; examType: string; className: string | null; scores: number[] }
  >();

  for (const session of sessions) {
    for (const sc of session.scores) {
      if (sc.finalScore === null) continue;
      const existing = studentScoreMap.get(sc.examNumber);
      if (!existing) {
        studentScoreMap.set(sc.examNumber, {
          name: sc.student.name,
          examType: sc.student.examType,
          className: sc.student.className,
          scores: [sc.finalScore],
        });
      } else {
        existing.scores.push(sc.finalScore);
      }
    }
  }

  type StudentRankEntry = {
    examNumber: string;
    name: string;
    examType: string;
    className: string | null;
    count: number;
    avg: number;
    max: number;
  };

  const studentRankings: StudentRankEntry[] = Array.from(studentScoreMap.entries())
    .filter(([, data]) => data.scores.length > 0)
    .map(([examNumber, data]) => ({
      examNumber,
      name: data.name,
      examType: data.examType,
      className: data.className,
      count: data.scores.length,
      avg: round1(data.scores.reduce((a, b) => a + b, 0) / data.scores.length),
      max: Math.max(...data.scores),
    }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 20);

  // ── 최근 세션 목록 (진행된 회차) ─────────────────────────────────────────
  const recentSessions = sessions
    .filter((s) => s.scores.length > 0)
    .slice(-10)
    .reverse();

  return (
    <div className="p-8 sm:p-10">
      {/* ── 헤더 ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-sm text-slate">
        <Link href="/admin/periods" className="transition hover:text-ember">
          시험 기간 관리
        </Link>
        <span>/</span>
        <Link href={`/admin/periods/${period.id}`} className="transition hover:text-ember">
          {period.name}
        </Link>
        <span>/</span>
        <span className="font-semibold text-ink">성적 통계</span>
      </div>

      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
            성적 통계
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-ink">{period.name} — 성적 분석</h1>
          <p className="mt-2 text-sm text-slate">
            {formatDate(period.startDate)} ~ {formatDate(period.endDate)} &middot; {period.totalWeeks}주
            {period.isActive && (
              <span className="ml-2 inline-flex rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                활성
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/admin/periods/${period.id}/sessions`}
            className="inline-flex items-center rounded-full border border-ink/20 px-4 py-2 text-sm font-medium text-slate transition hover:border-ink/40 hover:text-ink"
          >
            회차 관리
          </Link>
          <Link
            href={`/admin/periods/${period.id}`}
            className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-medium text-slate transition hover:border-ink/30"
          >
            ← 기간 상세
          </Link>
        </div>
      </div>

      {/* ── KPI 카드 ─────────────────────────────────────────────────────── */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-[28px] border border-ink/10 bg-white px-5 py-5 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">총 회차</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-ink">{totalSessions}</p>
          <p className="mt-1 text-xs text-slate">취소 제외</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white px-5 py-5 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">총 응시 수</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-ink">
            {totalScoreEntries.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">점수 있는 응시</p>
        </div>
        <div className="rounded-[28px] border border-forest/20 bg-forest/5 px-5 py-5 shadow-panel rounded-[28px]">
          <p className="text-xs font-medium uppercase tracking-widest text-forest">전체 평균</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-forest">
            {overallAvg !== null ? `${overallAvg}점` : "—"}
          </p>
          <p className="mt-1 text-xs text-slate">응시자 전체 기준</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white px-5 py-5 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">최고 / 최저</p>
          <p className="mt-2 text-xl font-bold tabular-nums text-ink">
            {overallMax !== null ? `${overallMax}` : "—"}
            <span className="mx-1.5 text-ink/30">/</span>
            {overallMin !== null ? `${overallMin}` : "—"}
          </p>
          <p className="mt-1 text-xs text-slate">전체 기간 기준</p>
        </div>
        <div
          className={`rounded-[28px] px-5 py-5 shadow-panel ${
            highScoreCount > 0
              ? "border border-forest/20 bg-forest/5"
              : "border border-ink/10 bg-white"
          }`}
        >
          <p className="text-xs font-medium uppercase tracking-widest text-forest">80점 이상</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-forest">
            {highScoreCount.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">
            {allScores.length > 0
              ? `${round1((highScoreCount / allScores.length) * 100)}%`
              : "—"}
          </p>
        </div>
        <div
          className={`rounded-[28px] px-5 py-5 shadow-panel ${
            failCount > 0
              ? "border border-amber-200 bg-amber-50/60"
              : "border border-ink/10 bg-white"
          }`}
        >
          <p
            className={`text-xs font-medium uppercase tracking-widest ${
              failCount > 0 ? "text-amber-700" : "text-slate"
            }`}
          >
            40점 미만 (과락)
          </p>
          <p
            className={`mt-2 text-3xl font-bold tabular-nums ${
              failCount > 0 ? "text-amber-700" : "text-ink"
            }`}
          >
            {failCount.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">
            {allScores.length > 0
              ? `${round1((failCount / allScores.length) * 100)}%`
              : "—"}
          </p>
        </div>
      </div>

      {/* ── 점수 분포 히스토그램 ──────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-slate">
          점수 분포 (10점 단위)
        </h2>
        {allScores.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/10 p-10 text-center text-sm text-slate">
            응시 데이터가 없습니다.
          </div>
        ) : (
          <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
            <div className="flex items-end gap-2" style={{ height: "160px" }}>
              {histBuckets.map((count, idx) => {
                const barPct = count === 0 ? 0 : Math.max(4, Math.round((count / histMax) * 130));
                const label = bucketLabel(idx);
                const isHighRange = idx >= 8; // 80점 이상
                const isFailRange = idx < 4; // 40점 미만
                return (
                  <div
                    key={idx}
                    className="group relative flex flex-1 flex-col items-center gap-1"
                  >
                    {/* tooltip */}
                    {count > 0 && (
                      <span className="absolute -top-7 hidden rounded bg-ink px-1.5 py-0.5 text-[10px] text-white group-hover:block">
                        {count}명
                      </span>
                    )}
                    <span className="text-[10px] font-semibold text-ink">
                      {count > 0 ? count : ""}
                    </span>
                    <div
                      className={`w-full rounded-t-[6px] transition-all ${
                        isHighRange
                          ? "bg-forest/70"
                          : isFailRange
                            ? "bg-amber-400"
                            : "bg-ember/50"
                      }`}
                      style={{ height: `${barPct}px` }}
                    />
                    <span className="text-center text-[9px] leading-tight text-slate">
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap gap-4 border-t border-ink/5 pt-4 text-xs text-slate">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-sm bg-forest/70" />
                80점 이상
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-sm bg-ember/50" />
                40~79점
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-sm bg-amber-400" />
                40점 미만 (과락)
              </span>
            </div>
          </div>
        )}
      </section>

      {/* ── 주차별 평균 추이 ─────────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-slate">
          주차별 평균 추이
        </h2>
        {weekStats.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/10 p-10 text-center text-sm text-slate">
            주차 데이터가 없습니다.
          </div>
        ) : (
          <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
            {/* SVG line chart for week averages */}
            {(() => {
              const groups: Record<string, WeekStat[]> = {};
              for (const ws of weekStats) {
                if (!groups[ws.examType]) groups[ws.examType] = [];
                groups[ws.examType].push(ws);
              }

              const chartW = 560;
              const chartH = 140;
              const padL = 36;
              const padR = 16;
              const padT = 12;
              const padB = 28;
              const innerW = chartW - padL - padR;
              const innerH = chartH - padT - padB;
              const yMin = 0;
              const yMax = 100;
              const yScale = (v: number) =>
                padT + innerH - ((v - yMin) / (yMax - yMin)) * innerH;
              const yTicks = [0, 20, 40, 60, 80, 100];

              const examTypeColors: Record<string, string> = {
                GONGCHAE: "#C55A11",
                GYEONGCHAE: "#1F4D3A",
              };

              return (
                <div className="overflow-x-auto">
                  <svg
                    viewBox={`0 0 ${chartW} ${chartH}`}
                    className="w-full min-w-[400px]"
                    aria-label="주차별 평균 추이"
                  >
                    {yTicks.map((tick) => {
                      const y = yScale(tick);
                      return (
                        <g key={tick}>
                          <line
                            x1={padL}
                            y1={y}
                            x2={chartW - padR}
                            y2={y}
                            stroke="#E5E7EB"
                            strokeWidth={0.8}
                          />
                          <text x={padL - 4} y={y + 4} textAnchor="end" fontSize={9} fill="#6B7280">
                            {tick}
                          </text>
                        </g>
                      );
                    })}

                    {/* Reference line at 60 */}
                    <line
                      x1={padL}
                      y1={yScale(60)}
                      x2={chartW - padR}
                      y2={yScale(60)}
                      stroke="#C55A11"
                      strokeWidth={0.8}
                      strokeDasharray="4 3"
                      opacity={0.4}
                    />

                    {Object.entries(groups).map(([examType, stats]) => {
                      const pts = stats.filter((s) => s.avg !== null);
                      if (pts.length < 2) return null;
                      const maxWeek = Math.max(...pts.map((p) => p.week));
                      const minWeek = Math.min(...pts.map((p) => p.week));
                      const xScale = (week: number) =>
                        maxWeek === minWeek
                          ? padL + innerW / 2
                          : padL + ((week - minWeek) / (maxWeek - minWeek)) * innerW;

                      const linePoints = pts
                        .map((p) => `${xScale(p.week).toFixed(1)},${yScale(p.avg ?? 0).toFixed(1)}`)
                        .join(" ");
                      const color = examTypeColors[examType] ?? "#6B7280";

                      return (
                        <g key={examType}>
                          <polyline
                            points={linePoints}
                            fill="none"
                            stroke={color}
                            strokeWidth={2}
                            strokeLinejoin="round"
                            strokeLinecap="round"
                          />
                          {pts.map((p) => (
                            <circle
                              key={p.week}
                              cx={xScale(p.week).toFixed(1)}
                              cy={yScale(p.avg ?? 0).toFixed(1)}
                              r={3.5}
                              fill={color}
                              stroke="white"
                              strokeWidth={1.5}
                            />
                          ))}
                          {pts.map((p, i) => (
                            <text
                              key={`lbl-${p.week}-${i}`}
                              x={xScale(p.week).toFixed(1)}
                              y={chartH - 4}
                              textAnchor="middle"
                              fontSize={8.5}
                              fill="#6B7280"
                            >
                              {p.week}주
                            </text>
                          ))}
                        </g>
                      );
                    })}
                  </svg>
                </div>
              );
            })()}

            {/* Table */}
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink/10">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                      직렬
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                      주차
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                      응시 수
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                      평균
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {weekStats.map((ws, idx) => (
                    <tr key={idx} className="transition hover:bg-mist/40">
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${
                            ws.examType === "GONGCHAE"
                              ? "border-ember/30 bg-ember/10 text-ember"
                              : "border-forest/30 bg-forest/10 text-forest"
                          }`}
                        >
                          {EXAM_TYPE_LABEL[ws.examType as keyof typeof EXAM_TYPE_LABEL] ?? ws.examType}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-sm text-ink">
                        {ws.week}주차
                      </td>
                      <td className="px-4 py-2.5 text-right text-sm text-slate">
                        {ws.count.toLocaleString()}
                      </td>
                      <td className={`px-4 py-2.5 text-right font-mono text-sm ${ws.avg !== null ? scoreColor(ws.avg) : "text-slate"}`}>
                        {ws.avg !== null ? `${ws.avg}점` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ── 과목별 성적 요약 ─────────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-slate">
          과목별 성적 요약
        </h2>
        {subjectStats.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/10 p-10 text-center text-sm text-slate">
            과목 데이터가 없습니다.
          </div>
        ) : (
          <div className="rounded-[28px] border border-ink/10 bg-white shadow-panel">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-ink/10">
                    <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                      직렬
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                      과목
                    </th>
                    <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                      응시 수
                    </th>
                    <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                      평균
                    </th>
                    <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                      최고
                    </th>
                    <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                      최저
                    </th>
                    <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                      80점↑
                    </th>
                    <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                      과락
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {subjectStats.map((ss, idx) => {
                    const highRate =
                      ss.count > 0 ? round1((ss.pass80 / ss.count) * 100) : 0;
                    const failRate =
                      ss.count > 0 ? round1((ss.fail40 / ss.count) * 100) : 0;
                    return (
                      <tr key={idx} className="transition hover:bg-mist/40">
                        <td className="px-5 py-3">
                          <span
                            className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${
                              ss.examType === "GONGCHAE"
                                ? "border-ember/30 bg-ember/10 text-ember"
                                : "border-forest/30 bg-forest/10 text-forest"
                            }`}
                          >
                            {EXAM_TYPE_LABEL[ss.examType as keyof typeof EXAM_TYPE_LABEL] ?? ss.examType}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-ink">{ss.displayLabel}</td>
                        <td className="px-4 py-3 text-right font-mono text-slate">
                          {ss.count.toLocaleString()}
                        </td>
                        <td className={`px-4 py-3 text-right font-mono font-semibold ${ss.avg !== null ? scoreColor(ss.avg) : "text-slate"}`}>
                          {ss.avg !== null ? `${ss.avg}점` : "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-forest">
                          {ss.max !== null ? `${ss.max}점` : "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-ember">
                          {ss.min !== null ? `${ss.min}점` : "—"}
                        </td>
                        <td className="px-4 py-3 text-right text-xs">
                          <span className="text-forest font-semibold">{ss.pass80}</span>
                          <span className="text-slate"> ({highRate}%)</span>
                        </td>
                        <td className="px-4 py-3 text-right text-xs">
                          {ss.fail40 > 0 ? (
                            <span className="font-semibold text-amber-700">
                              {ss.fail40} ({failRate}%)
                            </span>
                          ) : (
                            <span className="text-slate">0</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ── 상위 20명 평균 순위 ──────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-slate">
          기간 평균 상위 20명
        </h2>
        {studentRankings.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/10 p-10 text-center text-sm text-slate">
            학생 데이터가 없습니다.
          </div>
        ) : (
          <div className="rounded-[28px] border border-ink/10 bg-white shadow-panel">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[500px] text-sm">
                <thead>
                  <tr className="border-b border-ink/10">
                    <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                      순위
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                      학번
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                      이름
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                      직렬
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                      반
                    </th>
                    <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                      응시 횟수
                    </th>
                    <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                      평균
                    </th>
                    <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                      최고
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {studentRankings.map((entry, idx) => (
                    <tr key={entry.examNumber} className="transition hover:bg-mist/40">
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                            idx === 0
                              ? "bg-amber-400 text-white"
                              : idx === 1
                                ? "bg-slate-300 text-white"
                                : idx === 2
                                  ? "bg-amber-600 text-white"
                                  : "bg-ink/5 text-slate"
                          }`}
                        >
                          {idx + 1}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate">
                        <Link
                          href={`/admin/students/${entry.examNumber}`}
                          className="transition hover:text-ember hover:underline"
                        >
                          {entry.examNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-medium text-ink">
                        <Link
                          href={`/admin/students/${entry.examNumber}`}
                          className="transition hover:text-ember hover:underline"
                        >
                          {entry.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${
                            entry.examType === "GONGCHAE"
                              ? "border-ember/30 bg-ember/10 text-ember"
                              : "border-forest/30 bg-forest/10 text-forest"
                          }`}
                        >
                          {EXAM_TYPE_LABEL[entry.examType as keyof typeof EXAM_TYPE_LABEL] ?? entry.examType}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate">
                        {entry.className ?? <span className="text-ink/25">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate">
                        {entry.count}회
                      </td>
                      <td className={`px-4 py-3 text-right font-mono font-semibold ${scoreColor(entry.avg)}`}>
                        {entry.avg}점
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-forest font-semibold">
                        {entry.max}점
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ── 최근 회차별 현황 ──────────────────────────────────────────────── */}
      {recentSessions.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-slate">
            최근 회차 현황 (성적 입력된 최근 10회)
          </h2>
          <div className="rounded-[28px] border border-ink/10 bg-white shadow-panel">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-ink/10">
                    <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                      시험일
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                      주차
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                      직렬
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                      과목
                    </th>
                    <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                      응시 수
                    </th>
                    <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                      평균
                    </th>
                    <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                      상세
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {recentSessions.map((session) => {
                    const sessionScores = session.scores.map((sc) => sc.finalScore as number);
                    const avg =
                      sessionScores.length > 0
                        ? round1(sessionScores.reduce((a, b) => a + b, 0) / sessionScores.length)
                        : null;
                    const subjectLabel =
                      session.displaySubjectName?.trim() ||
                      SUBJECT_LABEL[session.subject] ||
                      session.subject;

                    return (
                      <tr key={session.id} className="transition hover:bg-mist/40">
                        <td className="px-5 py-3 font-mono text-xs text-slate">
                          {formatDate(session.examDate)}
                        </td>
                        <td className="px-4 py-3 text-slate">{session.week}주차</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${
                              session.examType === "GONGCHAE"
                                ? "border-ember/30 bg-ember/10 text-ember"
                                : "border-forest/30 bg-forest/10 text-forest"
                            }`}
                          >
                            {EXAM_TYPE_LABEL[session.examType as keyof typeof EXAM_TYPE_LABEL] ?? session.examType}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-ink">{subjectLabel}</td>
                        <td className="px-4 py-3 text-right font-mono text-slate">
                          {sessionScores.length}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-mono font-semibold ${
                            avg !== null ? scoreColor(avg) : "text-slate"
                          }`}
                        >
                          {avg !== null ? `${avg}점` : "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/admin/scores/sessions/${session.id}`}
                            className="inline-flex items-center rounded-full border border-ink/20 px-3 py-1 text-xs font-semibold text-slate transition hover:border-ember/30 hover:text-ember"
                          >
                            상세
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* ── 하단 액션 ──────────────────────────────────────────────────────── */}
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href={`/admin/periods/${period.id}/sessions`}
          className="inline-flex items-center gap-2 rounded-full border border-forest/30 bg-forest/10 px-5 py-2.5 text-sm font-semibold text-forest transition hover:bg-forest/20"
        >
          회차 관리
        </Link>
        <Link
          href={`/admin/scores`}
          className="inline-flex items-center gap-2 rounded-full border border-ink/20 px-5 py-2.5 text-sm font-semibold text-ink transition hover:border-ink/40 hover:bg-ink/5"
        >
          성적 허브
        </Link>
        <Link
          href={`/admin/periods/${period.id}`}
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-5 py-2.5 text-sm font-semibold text-slate transition hover:border-ink/30"
        >
          ← 기간 상세
        </Link>
      </div>
    </div>
  );
}
