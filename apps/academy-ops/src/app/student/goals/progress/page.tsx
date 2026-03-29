import type { Metadata } from "next";
import Link from "next/link";
import { AttendType, ExamType, Subject } from "@prisma/client";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { EXAM_TYPE_SUBJECTS, SUBJECT_LABEL } from "@/lib/constants";
import { hasDatabaseConfig } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { getStudentPortalViewer } from "@/lib/student-portal/service";
import { parseTargetScores } from "@/lib/analytics/analysis";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "목표 달성 현황",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function avg(arr: number[]): number | null {
  if (arr.length === 0) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdDev(arr: number[], mean: number): number {
  if (arr.length < 2) return 0;
  return Math.sqrt(arr.reduce((s, x) => s + (x - mean) ** 2, 0) / arr.length);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function computeDDay(date: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const t = new Date(date);
  t.setHours(0, 0, 0, 0);
  return Math.ceil((t.getTime() - today.getTime()) / 86400000);
}

function formatDateKR(date: Date): string {
  return `${date.getFullYear()}년 ${String(date.getMonth() + 1).padStart(2, "0")}월 ${String(date.getDate()).padStart(2, "0")}일`;
}

// Progress bar color: green if ≥ target, amber if 80-99%, red if < 80%
function progressBarColor(pct: number): string {
  if (pct >= 100) return "bg-forest";
  if (pct >= 80) return "bg-amber-500";
  return "bg-red-500";
}

// Trend arrow symbol
function trendArrow(trend: "up" | "down" | "flat"): string {
  if (trend === "up") return "↑";
  if (trend === "down") return "↓";
  return "→";
}

function trendColor(trend: "up" | "down" | "flat"): string {
  if (trend === "up") return "text-forest";
  if (trend === "down") return "text-red-500";
  return "text-slate";
}

// Compute trend: compare first 3 vs last 3 sessions averages
function computeTrend(scores: number[]): "up" | "down" | "flat" {
  if (scores.length < 2) return "flat";
  const first = scores.slice(0, Math.min(3, Math.floor(scores.length / 2)));
  const last = scores.slice(-Math.min(3, Math.floor(scores.length / 2)));
  const firstAvg = avg(first) ?? 0;
  const lastAvg = avg(last) ?? 0;
  const diff = lastAvg - firstAvg;
  if (diff > 1) return "up";
  if (diff < -1) return "down";
  return "flat";
}

// Motivational message based on overall progress pct
function motivationalMessage(overallPct: number): string {
  if (overallPct >= 100) return "훌륭합니다! 모든 과목 목표를 달성했습니다. 이 페이스를 유지하세요!";
  if (overallPct >= 90) return "목표에 거의 다 왔습니다! 조금만 더 집중하면 합격선에 도달합니다.";
  if (overallPct >= 75) return "좋은 흐름입니다. 부족한 과목에 집중 학습을 더하면 충분히 달성 가능합니다.";
  if (overallPct >= 50) return "꾸준히 하고 있습니다. 매일 아침 모의고사가 실력 향상의 지름길입니다.";
  return "처음이 어렵습니다. 포기하지 말고 하루하루 꾸준히 임하세요.";
}

// Micro SVG line chart for last 6 sessions (120×40 viewport)
function MicroChart({ scores }: { scores: number[] }) {
  if (scores.length < 2) {
    return (
      <svg viewBox="0 0 120 40" className="h-8 w-20 text-slate/30">
        <line x1="0" y1="20" x2="120" y2="20" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 2" />
      </svg>
    );
  }

  const recent = scores.slice(-6);
  const minScore = Math.max(0, Math.min(...recent) - 5);
  const maxScore = Math.min(100, Math.max(...recent) + 5);
  const range = maxScore - minScore || 1;
  const W = 120;
  const H = 40;

  const pts = recent.map((s, i) => ({
    x: (i / (recent.length - 1)) * W,
    y: H - ((s - minScore) / range) * H * 0.8 - H * 0.1,
  }));

  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-8 w-20">
      <path d={path} fill="none" stroke="#C55A11" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="2.5" fill="#C55A11" />
      ))}
    </svg>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function GoalProgressPage() {
  if (!hasDatabaseConfig()) {
    return (
      <main className="space-y-6 px-0 py-6">
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
            Unavailable
          </div>
          <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
            DB 연결 후 사용할 수 있습니다.
          </h1>
        </section>
      </main>
    );
  }

  const viewer = await getStudentPortalViewer();

  if (!viewer) {
    return (
      <main className="space-y-6 px-0 py-6">
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            Goal Progress Login
          </div>
          <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
            로그인 후 확인할 수 있습니다.
          </h1>
        </section>
        <StudentLookupForm redirectPath="/student/goals/progress" />
      </main>
    );
  }

  const prisma = getPrisma();

  // Fetch recent scores per student (up to 300 rows, ordered by date asc for trend)
  const rawScores = await prisma.score.findMany({
    where: {
      examNumber: viewer.examNumber,
      finalScore: { not: null },
      attendType: { in: [AttendType.NORMAL, AttendType.LIVE] },
      session: { isCancelled: false },
    },
    select: {
      id: true,
      finalScore: true,
      session: {
        select: {
          subject: true,
          examDate: true,
          examType: true,
        },
      },
    },
    orderBy: { session: { examDate: "asc" } },
    take: 300,
  });

  // Fetch next upcoming exam for D-day
  const nextExam = await prisma.civilServiceExam.findFirst({
    where: {
      isActive: true,
      writtenDate: { gte: new Date() },
      examType: viewer.examType === ExamType.GONGCHAE ? ExamType.GONGCHAE : ExamType.GYEONGCHAE,
    },
    orderBy: { writtenDate: "asc" },
    select: { name: true, writtenDate: true },
  });

  // Build per-subject ordered score arrays (asc by date)
  const subjectScores = new Map<Subject, number[]>();
  for (const row of rawScores) {
    if (row.finalScore === null) continue;
    const existing = subjectScores.get(row.session.subject) ?? [];
    existing.push(row.finalScore);
    subjectScores.set(row.session.subject, existing);
  }

  const targetScores = viewer.targetScores ?? {};
  const subjects = EXAM_TYPE_SUBJECTS[viewer.examType];
  const defaultTarget = 80;

  // Compute per-subject stats
  type SubjectStat = {
    subject: Subject;
    scores: number[];
    average: number | null;
    target: number;
    pct: number;
    trend: "up" | "down" | "flat";
    gap: number;
    stddev: number;
    consistency: number | null;
  };

  const subjectStats: SubjectStat[] = subjects.map((subj) => {
    const scores = subjectScores.get(subj) ?? [];
    const mean = avg(scores);
    const target = (targetScores as Record<string, number>)[subj] ?? defaultTarget;
    const pct = mean !== null ? Math.min(100, Math.round((mean / target) * 100)) : 0;
    const trend = computeTrend(scores);
    const gap = mean !== null ? Math.max(0, target - mean) : target;
    const sd = mean !== null ? stdDev(scores, mean) : 0;
    const consistency = mean !== null && mean > 0 ? Math.max(0, Math.round(100 - (sd / mean) * 100)) : null;

    return { subject: subj, scores, average: mean, target, pct, trend, gap, stddev: sd, consistency };
  });

  // Overall progress pct (avg of all subject pcts with data)
  const statsWithData = subjectStats.filter((s) => s.average !== null);
  const overallPct = statsWithData.length > 0
    ? Math.round(statsWithData.reduce((sum, s) => sum + s.pct, 0) / statsWithData.length)
    : 0;

  // Worst gap subject for recommendation
  const worstSubject = [...subjectStats]
    .filter((s) => s.average !== null)
    .sort((a, b) => b.gap - a.gap)[0];

  // D-day
  const ddays = nextExam?.writtenDate ? computeDDay(nextExam.writtenDate) : null;

  return (
    <main className="space-y-6 px-0 py-6">
      {/* Header */}
      <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Link
                href="/student/goals"
                className="inline-flex items-center gap-1 text-sm text-slate transition hover:text-ember"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
                </svg>
                학습 목표
              </Link>
            </div>
            <div className="mt-4 inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
              Goal Progress
            </div>
            <h1 className="mt-4 text-3xl font-semibold leading-tight sm:text-5xl">
              목표 달성 현황
            </h1>
            <p className="mt-4 text-sm leading-7 text-slate sm:text-base">
              {viewer.name}님의 과목별 목표 달성 추이 및 학습 진도를 분석합니다.
            </p>
          </div>

          {/* D-Day badge */}
          {nextExam?.writtenDate && ddays !== null && (
            <div className={`rounded-[24px] border px-5 py-4 text-center ${ddays <= 14 ? "border-red-200 bg-red-50" : ddays <= 30 ? "border-amber-200 bg-amber-50" : "border-forest/20 bg-forest/5"}`}>
              <p className="text-xs font-semibold text-slate">필기시험까지</p>
              <p className={`mt-1 text-3xl font-black ${ddays <= 14 ? "text-red-600" : ddays <= 30 ? "text-amber-700" : "text-forest"}`}>
                {ddays === 0 ? "D-Day!" : `D-${ddays}`}
              </p>
              <p className="mt-1 text-[10px] text-slate">{formatDateKR(nextExam.writtenDate)}</p>
              <p className="mt-0.5 max-w-[140px] truncate text-[10px] font-semibold text-slate">{nextExam.name}</p>
            </div>
          )}
        </div>

        {/* KPI row */}
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
            <p className="text-sm text-slate">전체 평균 달성률</p>
            <p className={`mt-3 text-2xl font-bold ${overallPct >= 100 ? "text-forest" : overallPct >= 80 ? "text-amber-600" : "text-red-600"}`}>
              {statsWithData.length > 0 ? `${overallPct}%` : "-"}
            </p>
          </article>
          <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
            <p className="text-sm text-slate">목표 달성 과목</p>
            <p className="mt-3 text-2xl font-bold text-ink">
              {statsWithData.filter((s) => s.pct >= 100).length}
              <span className="ml-1 text-sm font-normal text-slate">/ {statsWithData.length}개</span>
            </p>
          </article>
          <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
            <p className="text-sm text-slate">총 성적 데이터</p>
            <p className="mt-3 text-2xl font-bold text-ink">
              {rawScores.filter((r) => r.finalScore !== null).length}
              <span className="ml-1 text-sm font-normal text-slate">회</span>
            </p>
          </article>
        </div>
      </section>

      {/* Weekly recommendation */}
      {worstSubject && worstSubject.average !== null && (
        <section className="rounded-[28px] border border-amber-200 bg-amber-50 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-amber-300 bg-white text-amber-600">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-800">이번주 집중 과목</p>
              <p className="mt-1 text-base font-bold text-amber-900">
                {SUBJECT_LABEL[worstSubject.subject]}
              </p>
              <p className="mt-1 text-sm text-amber-700">
                현재 평균 {worstSubject.average !== null ? `${round1(worstSubject.average)}점` : "-"} —
                목표까지 {round1(worstSubject.gap)}점 부족합니다.
                이 과목에 집중 학습이 필요합니다.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Motivational message */}
      {statsWithData.length > 0 && (
        <section className="rounded-[28px] border border-forest/20 bg-forest/5 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-forest/20 bg-white text-forest">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path d="M9.664 1.319a.75.75 0 0 1 .672 0 41.059 41.059 0 0 1 8.198 5.424.75.75 0 0 1-.254 1.285 31.372 31.372 0 0 0-7.86 3.83.75.75 0 0 1-.84 0 31.508 31.508 0 0 0-2.08-1.287V9.137c0 .38.37.8.8 1.091a32.832 32.832 0 0 1 2.31 1.396.75.75 0 0 1-.39 1.307 31.48 31.48 0 0 0-3.34 1.07.75.75 0 0 1-.81-.14L3.5 11.65a.75.75 0 0 1 .158-1.212 29.015 29.015 0 0 1 1.345-.634V9.137a.75.75 0 0 1 .75-.75Z" />
              </svg>
            </div>
            <p className="text-sm leading-7 text-forest">
              {motivationalMessage(overallPct)}
            </p>
          </div>
        </section>
      )}

      {/* Per-subject progress cards */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
        <div className="mb-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">Subject Progress</p>
          <h2 className="mt-1 text-xl font-semibold">과목별 목표 달성 진도</h2>
          <p className="mt-2 text-sm text-slate">
            최근 6회 미니 차트 · 추세 화살표 · 목표 달성률을 한눈에 확인하세요.
          </p>
        </div>

        {statsWithData.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-ink/10 px-5 py-10 text-center">
            <p className="text-sm font-semibold text-ink">아직 성적 데이터가 없습니다</p>
            <p className="mt-2 text-sm text-slate">시험 성적이 입력되면 과목별 달성 현황이 표시됩니다.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {subjectStats.map((stat) => {
              if (stat.average === null) {
                return (
                  <article key={stat.subject} className="rounded-[20px] border border-dashed border-ink/10 bg-mist/40 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-slate">{SUBJECT_LABEL[stat.subject]}</span>
                      <span className="inline-flex rounded-full border border-ink/10 bg-mist px-2 py-0.5 text-[10px] font-semibold text-slate">
                        데이터 없음
                      </span>
                    </div>
                    <div className="mt-3 h-3 rounded-full bg-ink/5 border border-ink/10" />
                  </article>
                );
              }

              return (
                <article key={stat.subject} className="rounded-[20px] border border-ink/10 bg-white p-4 shadow-sm">
                  {/* Row 1: Subject name + trend + micro chart */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-ink">{SUBJECT_LABEL[stat.subject]}</span>
                      <span className={`text-lg font-bold ${trendColor(stat.trend)}`} title="추세">
                        {trendArrow(stat.trend)}
                      </span>
                      {stat.pct >= 100 && (
                        <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-2 py-0.5 text-[10px] font-semibold text-forest">
                          달성
                        </span>
                      )}
                    </div>
                    <MicroChart scores={stat.scores} />
                  </div>

                  {/* Row 2: stats */}
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate">
                    <span>
                      평균 <strong className={`text-sm ${stat.pct >= 100 ? "text-forest" : "text-ink"}`}>{round1(stat.average)}점</strong>
                    </span>
                    <span className="text-ink/20">|</span>
                    <span>
                      목표 <strong className="text-sm text-ember">{stat.target}점</strong>
                    </span>
                    {stat.gap > 0 && (
                      <>
                        <span className="text-ink/20">|</span>
                        <span className="font-semibold text-red-600">부족 {round1(stat.gap)}점</span>
                      </>
                    )}
                    {stat.consistency !== null && (
                      <>
                        <span className="text-ink/20">|</span>
                        <span>일관성 <strong className="text-ink">{stat.consistency}점</strong></span>
                      </>
                    )}
                  </div>

                  {/* Progress bar */}
                  <div className="mt-3 relative h-3 rounded-full bg-mist overflow-hidden border border-ink/10">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${progressBarColor(stat.pct)}`}
                      style={{ width: `${stat.pct}%` }}
                    />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between">
                    <p className="text-[10px] text-slate">{stat.pct}% 달성</p>
                    <p className="text-[10px] text-slate">
                      {stat.scores.length}회 응시
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Links */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
        <h2 className="text-lg font-semibold">관련 페이지</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/student/scores/timeline"
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            성적 타임라인
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
            </svg>
          </Link>
          <Link
            href="/student/scores/benchmark"
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            성적 벤치마크
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
            </svg>
          </Link>
          <Link
            href="/student/goals"
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            목표 점수 설정
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
            </svg>
          </Link>
        </div>
      </section>
    </main>
  );
}
