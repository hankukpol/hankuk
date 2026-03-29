import type { Metadata } from "next";
import Link from "next/link";
import { ExamType, Subject, AttendType } from "@prisma/client";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { SUBJECT_LABEL, EXAM_TYPE_SUBJECTS } from "@/lib/constants";
import { hasDatabaseConfig } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { getStudentPortalViewer } from "@/lib/student-portal/service";
import { parseTargetScores } from "@/lib/analytics/analysis";
import { GoalTargetForm } from "./goal-target-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "학습 목표",
};

const PASS_SCORE = 80;

function subjectColor(subject: Subject): string {
  const colors: Partial<Record<Subject, string>> = {
    CONSTITUTIONAL_LAW: "bg-sky-500",
    CRIMINAL_LAW: "bg-violet-500",
    CRIMINAL_PROCEDURE: "bg-amber-500",
    POLICE_SCIENCE: "bg-forest",
    CRIMINOLOGY: "bg-rose-500",
    CUMULATIVE: "bg-ember",
  };
  return colors[subject] ?? "bg-slate-400";
}

function subjectLightBg(subject: Subject): string {
  const colors: Partial<Record<Subject, string>> = {
    CONSTITUTIONAL_LAW: "bg-sky-50 border-sky-200",
    CRIMINAL_LAW: "bg-violet-50 border-violet-200",
    CRIMINAL_PROCEDURE: "bg-amber-50 border-amber-200",
    POLICE_SCIENCE: "bg-green-50 border-green-200",
    CRIMINOLOGY: "bg-rose-50 border-rose-200",
    CUMULATIVE: "bg-orange-50 border-orange-200",
  };
  return colors[subject] ?? "bg-mist border-ink/10";
}

function progressColor(pct: number): string {
  if (pct >= 100) return "bg-forest";
  if (pct >= 75) return "bg-amber-500";
  return "bg-red-500";
}

function formatDateKR(date: Date): string {
  return `${date.getFullYear()}년 ${String(date.getMonth() + 1).padStart(2, "0")}월 ${String(date.getDate()).padStart(2, "0")}일`;
}

function computeDDay(date: Date): { label: string; pillClass: string; days: number } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diff = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return { label: "완료", pillClass: "border-ink/10 bg-mist text-slate", days: diff };
  if (diff === 0) return { label: "D-Day!", pillClass: "border-ember/30 bg-ember/10 text-ember font-bold", days: 0 };
  if (diff <= 14) return { label: `D-${diff}`, pillClass: "border-red-200 bg-red-50 text-red-700", days: diff };
  if (diff <= 30) return { label: `D-${diff}`, pillClass: "border-amber-200 bg-amber-50 text-amber-700", days: diff };
  return { label: `D-${diff}일`, pillClass: "border-forest/20 bg-forest/10 text-forest", days: diff };
}

export default async function StudentGoalsPage() {
  if (!hasDatabaseConfig()) {
    return (
      <main className="space-y-6 px-0 py-6">
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
            Goals Unavailable
          </div>
          <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
            학습 목표는 DB 연결 후 사용할 수 있습니다.
          </h1>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/student"
              className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
            >
              학생 포털로 돌아가기
            </Link>
          </div>
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
            Goals Login
          </div>
          <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
            학습 목표는 로그인 후 확인할 수 있습니다.
          </h1>
          <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
            학번과 생년월일 6자리로 로그인하면 목표 점수와 학습 현황을 확인할 수 있습니다.
          </p>
        </section>
        <StudentLookupForm redirectPath="/student/goals" />
      </main>
    );
  }

  const prisma = getPrisma();

  // Fetch latest scores per subject for this student (last 10 sessions per subject)
  const recentScores = await prisma.score.findMany({
    where: {
      examNumber: viewer.examNumber,
      finalScore: { not: null },
      attendType: { in: [AttendType.NORMAL, AttendType.LIVE] },
      session: { isCancelled: false },
    },
    select: {
      finalScore: true,
      session: { select: { subject: true, examDate: true, examType: true } },
    },
    orderBy: { session: { examDate: "desc" } },
    take: 200,
  });

  // Group scores by subject: compute average per subject
  type SubjectStats = { scores: number[]; avg: number | null; latest: number | null };
  const subjectStats = new Map<Subject, SubjectStats>();

  for (const score of recentScores) {
    if (score.finalScore === null) continue;
    const subj = score.session.subject;
    const existing = subjectStats.get(subj) ?? { scores: [], avg: null, latest: null };
    existing.scores.push(score.finalScore);
    subjectStats.set(subj, existing);
  }

  // Compute averages
  for (const [subj, stats] of subjectStats.entries()) {
    if (stats.scores.length > 0) {
      const sum = stats.scores.reduce((s, v) => s + v, 0);
      stats.avg = Math.round((sum / stats.scores.length) * 10) / 10;
      stats.latest = stats.scores[0] ?? null;
    }
  }

  // Target scores from viewer
  const targetScores = viewer.targetScores ?? {};
  const subjects = EXAM_TYPE_SUBJECTS[viewer.examType];

  // Next upcoming civil exam for D-day
  const nextExam = await prisma.civilServiceExam.findFirst({
    where: {
      isActive: true,
      writtenDate: { gte: new Date() },
      examType: viewer.examType === ExamType.GONGCHAE ? ExamType.GONGCHAE : ExamType.GYEONGCHAE,
    },
    orderBy: { writtenDate: "asc" },
    select: { id: true, name: true, writtenDate: true, examType: true },
  });

  const heroExamDday = nextExam?.writtenDate ? computeDDay(nextExam.writtenDate) : null;

  // Overall averages
  const allFinals = [...subjectStats.values()].flatMap((s) => s.scores);
  const overallAvg = allFinals.length > 0
    ? Math.round((allFinals.reduce((s, v) => s + v, 0) / allFinals.length) * 10) / 10
    : null;

  // Default target score: 80 if not set
  const defaultTarget = PASS_SCORE;

  // Subjects with actual data
  const subjectsWithData = subjects.filter((s) => subjectStats.has(s));
  const subjectsNoData = subjects.filter((s) => !subjectStats.has(s));

  const EXAM_TYPE_LABEL: Record<ExamType, string> = {
    GONGCHAE: "공채",
    GYEONGCHAE: "경채",
  };

  return (
    <main className="space-y-6 px-0 py-6">
      {/* Header */}
      <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              href="/student"
              className="inline-flex items-center gap-1 text-sm text-slate transition hover:text-ember"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
              </svg>
              홈으로
            </Link>
            <div className="mt-4 inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
              Study Goals
            </div>
            <h1 className="mt-4 text-3xl font-semibold leading-tight sm:text-5xl">
              학습 목표
            </h1>
            <p className="mt-4 text-sm leading-7 text-slate sm:text-base">
              {viewer.name}님의 과목별 목표 점수 달성 현황을 확인하세요
            </p>
          </div>

          {/* D-Day badge */}
          {heroExamDday && nextExam?.writtenDate && (
            <div className={`rounded-[24px] border px-5 py-4 text-center ${heroExamDday.days <= 14 ? "border-red-200 bg-red-50" : heroExamDday.days <= 30 ? "border-amber-200 bg-amber-50" : "border-forest/20 bg-forest/5"}`}>
              <p className="text-xs font-semibold text-slate">필기시험까지</p>
              <p className={`mt-1 text-3xl font-black ${heroExamDday.days <= 14 ? "text-red-600" : heroExamDday.days <= 30 ? "text-amber-700" : "text-forest"}`}>
                {heroExamDday.days === 0 ? "D-Day!" : `D-${heroExamDday.days}`}
              </p>
              <p className="mt-1 text-[10px] text-slate">{formatDateKR(nextExam.writtenDate)}</p>
              <p className="mt-0.5 text-[10px] font-semibold text-slate truncate max-w-[140px]">{nextExam.name}</p>
            </div>
          )}
        </div>

        {/* KPI cards */}
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
            <p className="text-sm text-slate">현재 전체 평균</p>
            <p className={`mt-3 text-2xl font-bold ${overallAvg === null ? "text-slate" : overallAvg >= 80 ? "text-forest" : overallAvg >= 60 ? "text-amber-600" : "text-red-600"}`}>
              {overallAvg !== null ? `${overallAvg}점` : "기록 없음"}
            </p>
          </article>
          <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
            <p className="text-sm text-slate">목표 달성 과목</p>
            <p className="mt-3 text-2xl font-bold text-ink">
              {subjectsWithData.filter((s) => {
                const avg = subjectStats.get(s)?.avg;
                const target = targetScores[s] ?? defaultTarget;
                return avg !== null && avg !== undefined && avg >= target;
              }).length}
              <span className="ml-1 text-sm font-normal text-slate">/ {subjectsWithData.length}개</span>
            </p>
          </article>
          <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
            <p className="text-sm text-slate">시험 직렬</p>
            <p className="mt-3 text-lg font-bold text-ink">
              {EXAM_TYPE_LABEL[viewer.examType]}
            </p>
          </article>
        </div>
      </section>

      {/* Subject progress bars */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
        <div className="mb-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">Progress</p>
          <h2 className="mt-1 text-xl font-semibold">과목별 목표 달성 현황</h2>
        </div>

        {subjectsWithData.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-ink/10 px-5 py-10 text-center">
            <p className="text-sm font-semibold text-ink">아직 성적 데이터가 없습니다</p>
            <p className="mt-2 text-sm text-slate">시험 성적이 입력되면 과목별 목표 달성 현황이 표시됩니다.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {subjectsWithData.map((subj) => {
              const stats = subjectStats.get(subj)!;
              const target = targetScores[subj] ?? defaultTarget;
              const avg = stats.avg ?? 0;
              const latest = stats.latest ?? 0;
              const pct = Math.min(100, Math.round((avg / target) * 100));
              const achieved = avg >= target;
              const gap = Math.max(0, target - avg);

              return (
                <article key={subj} className={`rounded-[20px] border p-4 ${subjectLightBg(subj)}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`h-3 w-3 rounded-full ${subjectColor(subj)}`} />
                      <span className="text-sm font-semibold text-ink">{SUBJECT_LABEL[subj]}</span>
                      {achieved && (
                        <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-2 py-0.5 text-[10px] font-semibold text-forest">
                          달성
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate">
                      <span>평균 <strong className={`text-sm ${achieved ? "text-forest" : "text-ink"}`}>{avg}점</strong></span>
                      <span className="text-ink/20">|</span>
                      <span>최근 <strong className="text-sm text-ink">{latest}점</strong></span>
                      <span className="text-ink/20">|</span>
                      <span>목표 <strong className="text-sm text-ember">{target}점</strong></span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="relative h-3 rounded-full bg-white/60 overflow-hidden border border-ink/10">
                    <div
                      className={`h-full rounded-full transition-all ${progressColor(pct)}`}
                      style={{ width: `${pct}%` }}
                    />
                    {/* Target marker */}
                    <div
                      className="absolute top-0 h-full w-0.5 bg-ember/60"
                      style={{ left: "100%" }}
                    />
                  </div>

                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-[10px] text-slate">{pct}% 달성</p>
                    {gap > 0 && (
                      <p className="text-[10px] font-semibold text-red-600">
                        목표까지 {gap.toFixed(1)}점 부족
                      </p>
                    )}
                  </div>

                  {/* "현재 X점 → 목표 Ypct → 부족 Zpct" summary line */}
                  <p className="mt-2 text-[11px] text-slate">
                    현재 평균 {avg}점 → 목표 {target}점
                    {gap > 0
                      ? ` → 부족 ${gap.toFixed(1)}점`
                      : " → 목표 달성!"}
                  </p>
                </article>
              );
            })}

            {/* Subjects with no data yet */}
            {subjectsNoData.map((subj) => {
              const target = targetScores[subj] ?? defaultTarget;
              return (
                <article key={subj} className="rounded-[20px] border border-dashed border-ink/10 bg-mist/40 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-slate-300" />
                      <span className="text-sm font-semibold text-slate">{SUBJECT_LABEL[subj]}</span>
                      <span className="inline-flex rounded-full border border-ink/10 bg-mist px-2 py-0.5 text-[10px] font-semibold text-slate">
                        데이터 없음
                      </span>
                    </div>
                    <span className="text-xs text-slate">목표 <strong className="text-ember">{target}점</strong></span>
                  </div>
                  <div className="h-3 rounded-full bg-ink/5 border border-ink/10" />
                  <p className="mt-2 text-[11px] text-slate">아직 이 과목의 성적이 없습니다.</p>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Target score edit form */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">Target</p>
            <h2 className="mt-1 text-xl font-semibold">목표 점수 설정</h2>
          </div>
        </div>
        <p className="mb-4 text-sm text-slate">
          과목별 목표 점수를 설정하면 달성 현황이 위 그래프에 반영됩니다.
          기본 목표 점수는 {defaultTarget}점입니다.
        </p>
        <GoalTargetForm
          subjects={subjects}
          subjectLabels={SUBJECT_LABEL}
          initialTargetScores={
            Object.fromEntries(
              subjects.map((s) => [s, targetScores[s] ?? defaultTarget])
            ) as Record<Subject, number>
          }
        />
      </section>

      {/* D-day and exam info */}
      {nextExam && heroExamDday && (
        <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
          <div className="mb-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">Exam D-Day</p>
            <h2 className="mt-1 text-xl font-semibold">다가오는 시험</h2>
          </div>
          <div className={`rounded-[20px] border p-5 ${heroExamDday.days <= 14 ? "border-red-200 bg-red-50" : heroExamDday.days <= 30 ? "border-amber-200 bg-amber-50" : "border-forest/20 bg-forest/5"}`}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-ink">{nextExam.name}</p>
                {nextExam.writtenDate && (
                  <p className="mt-1 text-xs text-slate">
                    필기시험: {formatDateKR(nextExam.writtenDate)}
                  </p>
                )}
              </div>
              <div className="text-center">
                <p className={`text-3xl font-black ${heroExamDday.days <= 14 ? "text-red-600" : heroExamDday.days <= 30 ? "text-amber-700" : "text-forest"}`}>
                  {heroExamDday.label}
                </p>
              </div>
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <Link
              href="/student/civil-exams"
              className="inline-flex items-center gap-1.5 text-sm text-slate transition hover:text-ember"
            >
              시험 일정 전체 보기
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
              </svg>
            </Link>
          </div>
        </section>
      )}

      {/* Tips section */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
        <h2 className="text-lg font-semibold">합격 전략 가이드</h2>
        <div className="mt-4 space-y-3 text-sm text-slate">
          <div className="flex items-start gap-3 rounded-[16px] border border-ink/10 bg-mist/50 px-4 py-3">
            <span className="mt-0.5 shrink-0 text-base">1</span>
            <p>매일 아침 모의고사에 참석하고 오답 노트를 꾸준히 작성하세요.</p>
          </div>
          <div className="flex items-start gap-3 rounded-[16px] border border-ink/10 bg-mist/50 px-4 py-3">
            <span className="mt-0.5 shrink-0 text-base">2</span>
            <p>목표 점수 대비 가장 부족한 과목부터 집중 학습하세요.</p>
          </div>
          <div className="flex items-start gap-3 rounded-[16px] border border-ink/10 bg-mist/50 px-4 py-3">
            <span className="mt-0.5 shrink-0 text-base">3</span>
            <p>학습 상담이 필요하면 학원 직원에게 언제든 문의해 주세요.</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/student/analytics"
            className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            학습 분석 보기
          </Link>
          <Link
            href="/student/counseling"
            className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            상담 예약하기
          </Link>
        </div>
      </section>
    </main>
  );
}
