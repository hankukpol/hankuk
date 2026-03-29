import Link from "next/link";
import { Subject } from "@prisma/client";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { ATTEND_TYPE_LABEL, SUBJECT_LABEL } from "@/lib/constants";
import { hasDatabaseConfig } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { getStudentPortalViewer } from "@/lib/student-portal/service";

export const dynamic = "force-dynamic";

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatShortDate(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${m}/${d}`;
}

// Subject color palette — each subject gets a distinct color
const SUBJECT_COLORS: Record<string, string> = {
  POLICE_SCIENCE: "#C55A11",       // ember
  CONSTITUTIONAL_LAW: "#1F4D3A",   // forest
  CRIMINOLOGY: "#2563EB",          // blue
  KOREAN: "#7C3AED",               // violet
  ENGLISH: "#0891B2",              // cyan
  MATH: "#D97706",                 // amber
  GENERAL_STUDIES: "#059669",      // emerald
  KOREAN_HISTORY: "#DC2626",       // red
  SOCIAL: "#9333EA",               // purple
  SCIENCE: "#0284C7",              // sky
  LAW: "#65A30D",                  // lime
  ADMINISTRATION: "#EA580C",       // orange
};

function subjectColor(subject: string): string {
  return SUBJECT_COLORS[subject] ?? "#6B7280";
}

function scoreColorClass(score: number | null | undefined): string {
  if (score === null || score === undefined) return "text-slate-400";
  if (score < 60) return "text-red-600 font-semibold";
  if (score < 80) return "text-amber-600 font-semibold";
  return "text-[#1F4D3A] font-semibold";
}

function attendBadge(attendType: string): { label: string; cls: string } {
  const map: Record<string, { label: string; cls: string }> = {
    NORMAL: { label: "출석", cls: "border-forest/20 bg-forest/10 text-[#1F4D3A]" },
    LIVE: { label: "라이브", cls: "border-sky-200 bg-sky-50 text-sky-700" },
    EXCUSED: { label: "사유결시", cls: "border-amber-200 bg-amber-50 text-amber-700" },
    ABSENT: { label: "결석", cls: "border-red-200 bg-red-50 text-red-700" },
    LATE: { label: "지각", cls: "border-orange-200 bg-orange-50 text-orange-700" },
  };
  return map[attendType] ?? { label: attendType, cls: "border-ink/10 bg-mist text-slate" };
}

// ─── SVG Line Chart ──────────────────────────────────────────────────────────

interface ChartPoint {
  dateKey: string;
  score: number;
}

interface ChartSeries {
  subject: Subject;
  label: string;
  color: string;
  points: ChartPoint[];
}

function ScoreLineChart({
  series,
  dateKeys,
  overallAvg,
}: {
  series: ChartSeries[];
  dateKeys: string[];
  overallAvg: number | null;
}) {
  const W = 800;
  const H = 300;
  const PAD = { top: 20, right: 20, bottom: 40, left: 48 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const n = dateKeys.length;
  if (n === 0) return null;

  function xOf(i: number) {
    return PAD.left + (n === 1 ? chartW / 2 : (i / (n - 1)) * chartW);
  }

  function yOf(score: number) {
    // 0-100 → chartH (bottom) - 0 (top)
    return PAD.top + chartH - (score / 100) * chartH;
  }

  // Y axis ticks
  const yTicks = [0, 20, 40, 60, 80, 100];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto"
      aria-label="점수 추이 차트"
    >
      {/* Grid lines */}
      {yTicks.map((tick) => (
        <g key={tick}>
          <line
            x1={PAD.left}
            y1={yOf(tick)}
            x2={W - PAD.right}
            y2={yOf(tick)}
            stroke="#E5E7EB"
            strokeWidth="1"
          />
          <text
            x={PAD.left - 6}
            y={yOf(tick) + 4}
            textAnchor="end"
            fontSize="11"
            fill="#6B7280"
          >
            {tick}
          </text>
        </g>
      ))}

      {/* X axis date labels */}
      {dateKeys.map((dk, i) => {
        // Show every label if n<=8, else every 2nd or 4th
        const step = n <= 8 ? 1 : n <= 16 ? 2 : 4;
        if (i % step !== 0 && i !== n - 1) return null;
        return (
          <text
            key={dk}
            x={xOf(i)}
            y={H - PAD.bottom + 14}
            textAnchor="middle"
            fontSize="10"
            fill="#6B7280"
          >
            {dk.substring(5)} {/* MM-DD */}
          </text>
        );
      })}

      {/* Overall average dashed line */}
      {overallAvg !== null && (
        <g>
          <line
            x1={PAD.left}
            y1={yOf(overallAvg)}
            x2={W - PAD.right}
            y2={yOf(overallAvg)}
            stroke="#9CA3AF"
            strokeWidth="1.5"
            strokeDasharray="6 4"
          />
          <text
            x={W - PAD.right + 2}
            y={yOf(overallAvg) + 4}
            fontSize="10"
            fill="#6B7280"
          >
            평균
          </text>
        </g>
      )}

      {/* Series lines */}
      {series.map((s) => {
        const pts = dateKeys
          .map((dk, i) => {
            const p = s.points.find((p) => p.dateKey === dk);
            return p ? { i, score: p.score } : null;
          })
          .filter((p): p is { i: number; score: number } => p !== null);

        if (pts.length === 0) return null;

        const pathD = pts
          .map((p, idx) =>
            idx === 0
              ? `M ${xOf(p.i)} ${yOf(p.score)}`
              : `L ${xOf(p.i)} ${yOf(p.score)}`
          )
          .join(" ");

        return (
          <g key={s.subject}>
            <path
              d={pathD}
              fill="none"
              stroke={s.color}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {pts.map((p) => (
              <g key={p.i}>
                <circle
                  cx={xOf(p.i)}
                  cy={yOf(p.score)}
                  r="4"
                  fill={s.color}
                  stroke="white"
                  strokeWidth="1.5"
                />
                <title>
                  {dateKeys[p.i]} · {s.label} · {p.score.toFixed(1)}점
                </title>
              </g>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function StudentScoreTimelinePage() {
  if (!hasDatabaseConfig()) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
              점수 추이
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              DB 연결 후 사용할 수 있습니다.
            </h1>
          </section>
        </div>
      </main>
    );
  }

  const viewer = await getStudentPortalViewer();

  if (!viewer) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
              점수 추이
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              로그인 후 확인할 수 있습니다.
            </h1>
          </section>
          <StudentLookupForm redirectPath="/student/scores/timeline" />
        </div>
      </main>
    );
  }

  const prisma = getPrisma();

  // Query last 30 sessions with this student's scores
  const scores = await prisma.score.findMany({
    where: {
      examNumber: viewer.examNumber,
      finalScore: { not: null },
      session: { isCancelled: false },
    },
    include: {
      session: {
        select: {
          id: true,
          examDate: true,
          subject: true,
          week: true,
          periodId: true,
        },
      },
    },
    orderBy: [{ session: { examDate: "desc" } }],
    take: 60, // take extra, then deduplicate to 30 unique dates
  });

  // Collect up to 30 unique exam dates (most recent first)
  const datesSeen = new Set<string>();
  const last30DateKeys: string[] = [];
  for (const s of scores) {
    const dk = formatDate(s.session.examDate);
    if (!datesSeen.has(dk)) {
      datesSeen.add(dk);
      last30DateKeys.push(dk);
      if (last30DateKeys.length >= 30) break;
    }
  }

  // Filter scores to only those in the last 30 date range
  const relevantScores = scores.filter((s) =>
    last30DateKeys.includes(formatDate(s.session.examDate))
  );

  // Sort chronologically for chart
  const dateKeysAsc = [...last30DateKeys].sort();

  // Group by subject
  const subjectMap = new Map<Subject, { dateKey: string; score: number }[]>();
  for (const sc of relevantScores) {
    if (sc.finalScore === null) continue;
    const dk = formatDate(sc.session.examDate);
    const existing = subjectMap.get(sc.session.subject) ?? [];
    // Avoid duplicate dateKey for same subject (take first encountered = latest)
    if (!existing.some((e) => e.dateKey === dk)) {
      existing.push({ dateKey: dk, score: sc.finalScore });
    }
    subjectMap.set(sc.session.subject, existing);
  }

  // Build chart series
  const series: ChartSeries[] = Array.from(subjectMap.entries()).map(
    ([subject, points]) => ({
      subject,
      label: SUBJECT_LABEL[subject] ?? subject,
      color: subjectColor(subject),
      points,
    })
  );

  // Overall average
  const allScores = relevantScores
    .map((s) => s.finalScore)
    .filter((v): v is number => v !== null);
  const overallAvg =
    allScores.length > 0
      ? allScores.reduce((a, b) => a + b, 0) / allScores.length
      : null;

  // Build table rows (most recent first)
  interface TableRow {
    id: number;
    dateKey: string;
    shortDate: string;
    week: number;
    subject: Subject;
    subjectLabel: string;
    finalScore: number | null;
    attendType: string;
    note: string | null;
  }

  const tableRows: TableRow[] = relevantScores
    .map((sc) => ({
      id: sc.id,
      dateKey: formatDate(sc.session.examDate),
      shortDate: formatShortDate(sc.session.examDate),
      week: sc.session.week,
      subject: sc.session.subject,
      subjectLabel: SUBJECT_LABEL[sc.session.subject] ?? sc.session.subject,
      finalScore: sc.finalScore,
      attendType: sc.attendType,
      note: sc.note,
    }))
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey));

  return (
    <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Header */}
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-[#1F4D3A]">
                Score Timeline
              </div>
              <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
                점수 추이
              </h1>
              <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
                최근 30회차 시험의 과목별 점수 변화를 한눈에 확인하세요.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/student/scores"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-[#C55A11]"
              >
                성적 카드로 돌아가기
              </Link>
            </div>
          </div>

          {/* KPI cards */}
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <p className="text-sm text-slate">조회 회차</p>
              <p className="mt-3 text-xl font-semibold">{last30DateKeys.length}회</p>
            </article>
            <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <p className="text-sm text-slate">과목 수</p>
              <p className="mt-3 text-xl font-semibold">{series.length}과목</p>
            </article>
            <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <p className="text-sm text-slate">전체 평균</p>
              <p className="mt-3 text-xl font-semibold">
                {overallAvg !== null ? `${overallAvg.toFixed(1)}점` : "-"}
              </p>
            </article>
          </div>
        </section>

        {/* Chart */}
        {series.length > 0 && dateKeysAsc.length > 0 ? (
          <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
            <h2 className="mb-1 text-lg font-semibold">과목별 점수 추이</h2>
            <p className="mb-4 text-xs text-slate">
              각 점에 마우스를 올리면 상세 정보를 볼 수 있습니다.
            </p>
            <div className="overflow-x-auto">
              <ScoreLineChart
                series={series}
                dateKeys={dateKeysAsc}
                overallAvg={overallAvg}
              />
            </div>
            {/* Legend */}
            <div className="mt-4 flex flex-wrap gap-3">
              {series.map((s) => (
                <div key={s.subject} className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
                  <span className="text-xs text-slate">{s.label}</span>
                </div>
              ))}
              <div className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-6 rounded bg-gray-400" style={{ borderTop: "2px dashed #9CA3AF" }} />
                <span className="text-xs text-slate">전체 평균</span>
              </div>
            </div>
          </section>
        ) : (
          <section className="rounded-[28px] border border-ink/10 bg-white p-8">
            <p className="text-sm text-slate">
              표시할 점수 데이터가 없습니다.
            </p>
          </section>
        )}

        {/* Sessions table */}
        {tableRows.length > 0 && (
          <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
            <h2 className="mb-4 text-lg font-semibold">회차별 점수 목록</h2>
            <div className="overflow-x-auto rounded-[20px] border border-ink/10">
              <table className="min-w-full divide-y divide-ink/10 text-sm">
                <thead className="bg-mist/80 text-left">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-slate">날짜</th>
                    <th className="px-4 py-3 font-semibold text-slate">주차</th>
                    <th className="px-4 py-3 font-semibold text-slate">과목</th>
                    <th className="px-4 py-3 font-semibold text-slate">점수</th>
                    <th className="px-4 py-3 font-semibold text-slate">출결</th>
                    <th className="px-4 py-3 font-semibold text-slate">메모</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/10">
                  {tableRows.map((row) => {
                    const badge = attendBadge(row.attendType);
                    return (
                      <tr key={row.id} className="hover:bg-mist/30 transition-colors">
                        <td className="whitespace-nowrap px-4 py-3 font-medium">{row.dateKey}</td>
                        <td className="px-4 py-3 text-slate">{row.week}주차</td>
                        <td className="px-4 py-3">
                          <span
                            className="inline-block rounded-full px-2 py-0.5 text-xs font-semibold text-white"
                            style={{ backgroundColor: subjectColor(row.subject) }}
                          >
                            {row.subjectLabel}
                          </span>
                        </td>
                        <td className={`px-4 py-3 tabular-nums ${scoreColorClass(row.finalScore)}`}>
                          {row.finalScore !== null ? `${row.finalScore.toFixed(1)}점` : "-"}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${badge.cls}`}
                          >
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate">{row.note ?? "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
