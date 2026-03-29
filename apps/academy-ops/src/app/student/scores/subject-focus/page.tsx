import type { Metadata } from "next";
import Link from "next/link";
import { AttendType, Subject } from "@prisma/client";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { EXAM_TYPE_SUBJECTS, SUBJECT_LABEL } from "@/lib/constants";
import { hasDatabaseConfig } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { getStudentPortalViewer } from "@/lib/student-portal/service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "과목별 집중 분석",
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

function computeTrend(scores: number[]): "up" | "down" | "flat" {
  if (scores.length < 2) return "flat";
  const half = Math.max(1, Math.floor(scores.length / 2));
  const firstHalf = scores.slice(0, half);
  const lastHalf = scores.slice(-half);
  const fa = avg(firstHalf) ?? 0;
  const la = avg(lastHalf) ?? 0;
  const diff = la - fa;
  if (diff > 1.5) return "up";
  if (diff < -1.5) return "down";
  return "flat";
}

function trendLabel(trend: "up" | "down" | "flat"): string {
  if (trend === "up") return "상승 추세";
  if (trend === "down") return "하락 추세";
  return "보합 추세";
}

function trendRecommendation(trend: "up" | "down" | "flat", subjectLabel: string, average: number): string {
  if (trend === "up") return `${subjectLabel} 점수가 꾸준히 오르고 있습니다. 현재 학습 방법을 유지하세요.`;
  if (trend === "down") return `${subjectLabel} 점수가 하락하고 있습니다. 오답 노트를 집중적으로 복습하세요.`;
  if (average < 60) return `${subjectLabel} 평균이 60점 미만입니다. 기본 개념부터 다시 정리해 보세요.`;
  return `${subjectLabel} 점수가 안정적으로 유지되고 있습니다. 꾸준히 이어 나가세요.`;
}

// Inline SVG line chart for last 12 sessions
function SubjectLineChart({ scores, dates }: { scores: number[]; dates: string[] }) {
  const recent12 = scores.slice(-12);
  const dates12 = dates.slice(-12);

  if (recent12.length < 2) {
    return (
      <div className="flex h-40 items-center justify-center rounded-[16px] border border-dashed border-ink/10 bg-mist/50 text-sm text-slate">
        데이터가 2회 이상 필요합니다.
      </div>
    );
  }

  const W = 400;
  const H = 120;
  const PAD_X = 24;
  const PAD_Y = 12;
  const chartW = W - PAD_X * 2;
  const chartH = H - PAD_Y * 2;

  const minVal = Math.max(0, Math.min(...recent12) - 5);
  const maxVal = Math.min(100, Math.max(...recent12) + 5);
  const range = maxVal - minVal || 1;

  const pts = recent12.map((s, i) => ({
    x: PAD_X + (i / (recent12.length - 1)) * chartW,
    y: PAD_Y + chartH - ((s - minVal) / range) * chartH,
    score: s,
    date: dates12[i] ?? "",
  }));

  const linePath = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");

  // Y-axis gridlines at 40, 60, 80, 100
  const gridLines = [40, 60, 80, 100].filter((v) => v >= minVal && v <= maxVal).map((v) => ({
    y: PAD_Y + chartH - ((v - minVal) / range) * chartH,
    label: v,
  }));

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ minWidth: "320px", height: "140px" }}
        aria-label="과목별 성적 추이 차트"
      >
        {/* Grid lines */}
        {gridLines.map((g) => (
          <g key={g.label}>
            <line
              x1={PAD_X}
              y1={g.y}
              x2={W - PAD_X}
              y2={g.y}
              stroke="#E5E7EB"
              strokeWidth="1"
              strokeDasharray="4 3"
            />
            <text
              x={PAD_X - 4}
              y={g.y + 4}
              textAnchor="end"
              fontSize="9"
              fill="#9CA3AF"
            >
              {g.label}
            </text>
          </g>
        ))}

        {/* Line path */}
        <path
          d={linePath}
          fill="none"
          stroke="#C55A11"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Dots */}
        {pts.map((p, i) => (
          <g key={i}>
            <circle
              cx={p.x}
              cy={p.y}
              r="4"
              fill="white"
              stroke="#C55A11"
              strokeWidth="2"
            />
            {/* Score label above dot */}
            <text
              x={p.x}
              y={p.y - 8}
              textAnchor="middle"
              fontSize="9"
              fontWeight="600"
              fill="#C55A11"
            >
              {p.score}
            </text>
            {/* Date label below */}
            {dates12[i] && (
              <text
                x={p.x}
                y={H - 1}
                textAnchor="middle"
                fontSize="8"
                fill="#9CA3AF"
              >
                {dates12[i]?.slice(5) ?? ""}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default async function SubjectFocusPage({ searchParams }: PageProps) {
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
            Subject Focus Login
          </div>
          <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
            로그인 후 확인할 수 있습니다.
          </h1>
        </section>
        <StudentLookupForm redirectPath="/student/scores/subject-focus" />
      </main>
    );
  }

  const prisma = getPrisma();

  // Parse selected subject from searchParams
  const rawSubject = Array.isArray(searchParams?.subject)
    ? searchParams?.subject[0]
    : searchParams?.subject;
  const allSubjects = EXAM_TYPE_SUBJECTS[viewer.examType];
  const selectedSubject: Subject =
    rawSubject && (allSubjects as string[]).includes(rawSubject)
      ? (rawSubject as Subject)
      : allSubjects[0]!;

  // Fetch all scores for this student, ordered by date asc
  const rawScores = await prisma.score.findMany({
    where: {
      examNumber: viewer.examNumber,
      finalScore: { not: null },
      attendType: { in: [AttendType.NORMAL, AttendType.LIVE] },
      session: {
        isCancelled: false,
        subject: selectedSubject,
      },
    },
    select: {
      id: true,
      finalScore: true,
      sessionId: true,
      session: {
        select: {
          id: true,
          subject: true,
          examDate: true,
        },
      },
    },
    orderBy: { session: { examDate: "asc" } },
    take: 200,
  });

  // Also get cohort scores for this subject to compute percentile
  const activeEnrollment = await prisma.courseEnrollment.findFirst({
    where: { examNumber: viewer.examNumber, status: { in: ["ACTIVE", "COMPLETED"] } },
    select: { cohortId: true },
    orderBy: { createdAt: "desc" },
  });

  type CohortScore = { finalScore: number | null; examNumber: string };
  let cohortScores: CohortScore[] = [];
  if (activeEnrollment?.cohortId) {
    cohortScores = await prisma.score.findMany({
      where: {
        session: { subject: selectedSubject, isCancelled: false },
        finalScore: { not: null },
        attendType: { in: [AttendType.NORMAL, AttendType.LIVE] },
        student: {
          courseEnrollments: { some: { cohortId: activeEnrollment.cohortId } },
        },
      },
      select: { finalScore: true, examNumber: true },
    });
  }

  // Compute per-student averages for cohort percentile
  const cohortStudentAvgs = new Map<string, number[]>();
  for (const s of cohortScores) {
    if (s.finalScore === null) continue;
    const arr = cohortStudentAvgs.get(s.examNumber) ?? [];
    arr.push(s.finalScore);
    cohortStudentAvgs.set(s.examNumber, arr);
  }
  const cohortAvgList = Array.from(cohortStudentAvgs.entries())
    .map(([en, arr]) => ({ examNumber: en, avg: avg(arr) ?? 0 }))
    .sort((a, b) => b.avg - a.avg);

  // My scores for selected subject
  const myScores = rawScores.map((r) => r.finalScore!).filter((s): s is number => s !== null);
  const myDates = rawScores.map((r) => {
    const d = r.session.examDate;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });

  // Stats
  const myAvg = avg(myScores);
  const myStdDev = myAvg !== null ? stdDev(myScores, myAvg) : 0;
  const consistency = myAvg !== null && myAvg > 0
    ? Math.max(0, Math.round(100 - (myStdDev / myAvg) * 100))
    : null;
  const best = myScores.length > 0 ? Math.max(...myScores) : null;
  const worst = myScores.length > 0 ? Math.min(...myScores) : null;
  const trend = computeTrend(myScores);
  const subjectLabel = SUBJECT_LABEL[selectedSubject];

  // Cohort percentile for this student (by avg)
  const myEntry = cohortAvgList.findIndex((e) => e.examNumber === viewer.examNumber);
  const cohortTotal = cohortAvgList.length;
  const myRank = myEntry >= 0 ? myEntry + 1 : null;
  const myPercentile =
    cohortTotal > 0 && myRank !== null
      ? Math.round((1 - (myRank - 1) / cohortTotal) * 100)
      : null;

  // Best/worst session info
  const bestIdx = myScores.indexOf(best ?? -1);
  const worstIdx = myScores.indexOf(worst ?? 101);
  const bestDate = bestIdx >= 0 ? myDates[bestIdx] : null;
  const worstDate = worstIdx >= 0 ? myDates[worstIdx] : null;

  // Needs attention banner?
  const needsAttention = myAvg !== null && (myAvg < 60 || trend === "down");

  // Check for wrong note bookmarks in this subject
  const subjectSessionIds = rawScores.map((r) => r.sessionId);
  const wrongNoteCount = subjectSessionIds.length > 0
    ? await prisma.wrongNoteBookmark.count({
        where: {
          examNumber: viewer.examNumber,
          question: { sessionId: { in: subjectSessionIds } },
        },
      }).catch(() => 0)
    : 0;

  return (
    <main className="space-y-6 px-0 py-6">
      {/* Header */}
      <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
        <div>
          <Link
            href="/student/scores"
            className="inline-flex items-center gap-1 text-sm text-slate transition hover:text-ember"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
            </svg>
            성적 카드
          </Link>
          <div className="mt-4 inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
            Subject Focus
          </div>
          <h1 className="mt-4 text-3xl font-semibold leading-tight sm:text-5xl">
            과목별 집중 분석
          </h1>
          <p className="mt-4 text-sm leading-7 text-slate sm:text-base">
            {viewer.name}님의 과목별 심층 분석입니다. 최근 12회 추이, 통계, 동기 비교를 확인하세요.
          </p>
        </div>
      </section>

      {/* Subject selector tabs */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">과목 선택</p>
        <div className="flex flex-wrap gap-2">
          {allSubjects.map((subj) => (
            <Link
              key={subj}
              href={`/student/scores/subject-focus?subject=${subj}`}
              className={`inline-flex items-center rounded-full border px-4 py-2 text-sm font-semibold transition ${
                subj === selectedSubject
                  ? "border-ember/30 bg-ember/10 text-ember"
                  : "border-ink/10 bg-white text-ink hover:border-ember/30 hover:text-ember"
              }`}
            >
              {SUBJECT_LABEL[subj]}
            </Link>
          ))}
        </div>
      </section>

      {/* Needs attention banner */}
      {needsAttention && (
        <section className="rounded-[28px] border border-amber-200 bg-amber-50 p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 shrink-0 text-amber-600">
              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
            </svg>
            <p className="text-sm font-semibold text-amber-800">
              이 과목 중점 연습 필요 — {subjectLabel}
              {myAvg !== null && myAvg < 60 ? ` 평균 ${round1(myAvg)}점 (60점 미만)` : " 하락 추세 감지"}
            </p>
          </div>
        </section>
      )}

      {/* Stats grid */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
        <div className="mb-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">Statistics</p>
          <h2 className="mt-1 text-xl font-semibold">{subjectLabel} 통계</h2>
        </div>

        {myScores.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-ink/10 px-5 py-10 text-center">
            <p className="text-sm font-semibold text-ink">이 과목의 성적 데이터가 없습니다</p>
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <article className="rounded-[20px] border border-ink/10 bg-mist p-4">
                <p className="text-xs text-slate">평균 점수</p>
                <p className={`mt-2 text-2xl font-bold ${myAvg !== null && myAvg >= 80 ? "text-forest" : myAvg !== null && myAvg >= 60 ? "text-amber-600" : "text-red-600"}`}>
                  {myAvg !== null ? `${round1(myAvg)}점` : "-"}
                </p>
              </article>
              <article className="rounded-[20px] border border-ink/10 bg-mist p-4">
                <p className="text-xs text-slate">최고 / 최저</p>
                <p className="mt-2 text-2xl font-bold text-ink">
                  {best !== null ? best : "-"}
                  <span className="text-sm text-slate"> / {worst !== null ? worst : "-"}</span>
                </p>
                {bestDate && <p className="mt-1 text-[10px] text-slate">최고: {bestDate?.slice(5) ?? ""}</p>}
              </article>
              <article className="rounded-[20px] border border-ink/10 bg-mist p-4">
                <p className="text-xs text-slate">표준편차 / 일관성</p>
                <p className="mt-2 text-2xl font-bold text-ink">
                  {round1(myStdDev)}
                  <span className="text-sm text-slate"> / {consistency ?? "-"}점</span>
                </p>
                <p className="mt-1 text-[10px] text-slate">높을수록 안정적</p>
              </article>
              <article className="rounded-[20px] border border-ink/10 bg-mist p-4">
                <p className="text-xs text-slate">동기 내 백분위</p>
                <p className={`mt-2 text-2xl font-bold ${myPercentile !== null && myPercentile >= 70 ? "text-forest" : "text-ink"}`}>
                  {myPercentile !== null ? `상위 ${100 - myPercentile}%` : "-"}
                </p>
                {myRank !== null && cohortTotal > 0 && (
                  <p className="mt-1 text-[10px] text-slate">{myRank}위 / {cohortTotal}명</p>
                )}
              </article>
            </div>

            {/* Trend */}
            <div className="mt-4 rounded-[20px] border border-ink/10 bg-mist/50 p-4">
              <div className="flex items-center gap-2">
                <span className={`text-xl font-bold ${trend === "up" ? "text-forest" : trend === "down" ? "text-red-500" : "text-slate"}`}>
                  {trend === "up" ? "↑" : trend === "down" ? "↓" : "→"}
                </span>
                <span className="text-sm font-semibold text-ink">{trendLabel(trend)}</span>
                <span className="ml-auto inline-flex rounded-full border border-ink/10 bg-white px-3 py-0.5 text-xs text-slate">
                  {myScores.length}회 응시
                </span>
              </div>
              <p className="mt-2 text-sm text-slate">
                {trendRecommendation(trend, subjectLabel, myAvg ?? 0)}
              </p>
            </div>

            {/* Wrong notes quick link */}
            {wrongNoteCount > 0 && (
              <div className="mt-4 flex items-center justify-between rounded-[20px] border border-ink/10 bg-mist/50 p-4">
                <p className="text-sm text-slate">
                  이 과목 오답노트 <strong className="text-ink">{wrongNoteCount}개</strong>
                </p>
                <Link
                  href={`/student/scores/wrong-questions?subject=${selectedSubject}`}
                  className="inline-flex items-center gap-1 text-sm font-semibold text-ember transition hover:text-ember/80"
                >
                  오답노트 보기
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                    <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
                  </svg>
                </Link>
              </div>
            )}
          </>
        )}
      </section>

      {/* Line chart */}
      {myScores.length >= 2 && (
        <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
          <div className="mb-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">Trend Chart</p>
            <h2 className="mt-1 text-xl font-semibold">{subjectLabel} 최근 12회 추이</h2>
          </div>
          <SubjectLineChart scores={myScores} dates={myDates} />
          <div className="mt-2 flex items-center justify-between">
            <p className="text-xs text-slate">최근 {Math.min(12, myScores.length)}회 기준</p>
            {bestDate && worstDate && (
              <p className="text-xs text-slate">
                최고 {best}점 ({bestDate?.slice(5) ?? ""}) / 최저 {worst}점 ({worstDate?.slice(5) ?? ""})
              </p>
            )}
          </div>
        </section>
      )}

      {/* Links */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
        <h2 className="text-lg font-semibold">관련 페이지</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/student/scores/benchmark"
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            동기 대비 분석
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
            </svg>
          </Link>
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
            href="/student/goals/progress"
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            목표 달성 현황
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
            </svg>
          </Link>
        </div>
      </section>
    </main>
  );
}
