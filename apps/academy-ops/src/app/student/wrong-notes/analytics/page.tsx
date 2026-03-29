import type { Metadata } from "next";
import Link from "next/link";
import { Subject } from "@prisma/client";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { SUBJECT_LABEL } from "@/lib/constants";
import { hasDatabaseConfig } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { getStudentPortalViewer } from "@/lib/student-portal/service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "오답 노트 분석",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

function getWeekStart(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // Monday of the week
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function weekLabel(isoDate: string): string {
  const d = new Date(isoDate);
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${m}/${day}`;
}

// ─── Data fetching ─────────────────────────────────────────────────────────────

async function fetchWrongNoteAnalytics(examNumber: string) {
  const prisma = getPrisma();

  const bookmarks = await prisma.wrongNoteBookmark.findMany({
    where: { examNumber },
    include: {
      question: {
        include: {
          questionSession: {
            select: {
              subject: true,
              examDate: true,
            },
          },
          studentAnswers: {
            where: { examNumber },
            take: 1,
            select: { answer: true },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const now = new Date();
  const oneWeekAgo = new Date(now);
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  // KPI: 총 오답 노트
  const totalNotes = bookmarks.length;

  // KPI: 이번주 추가
  const thisWeekCount = bookmarks.filter(
    (b) => new Date(b.createdAt) >= oneWeekAgo,
  ).length;

  // KPI: 가장 많은 과목
  const subjectCountMap: Partial<Record<Subject, number>> = {};
  for (const b of bookmarks) {
    const subj = b.question.questionSession.subject;
    subjectCountMap[subj] = (subjectCountMap[subj] ?? 0) + 1;
  }
  const topSubjectEntry = Object.entries(subjectCountMap).sort(
    ([, a], [, b]) => (b ?? 0) - (a ?? 0),
  )[0];
  const topSubject = topSubjectEntry
    ? SUBJECT_LABEL[topSubjectEntry[0] as Subject] ?? topSubjectEntry[0]
    : null;

  // KPI: 최근 복습일 (가장 최근 updatedAt이 createdAt과 다른 것)
  const lastReviewedNote = bookmarks.find(
    (b) => b.memo && b.memo.trim().length > 0,
  );
  const lastReviewDate = lastReviewedNote
    ? fmtDate(lastReviewedNote.updatedAt)
    : null;

  // By subject: sorted descending by count
  const subjectStats = Object.entries(subjectCountMap)
    .map(([subject, count]) => ({
      subject: subject as Subject,
      label: SUBJECT_LABEL[subject as Subject] ?? subject,
      count: count ?? 0,
    }))
    .sort((a, b) => b.count - a.count);

  const maxSubjectCount = subjectStats[0]?.count ?? 1;

  // Trend: last 12 weeks (grouped by week start Monday)
  const twelveWeeksAgo = new Date(now);
  twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 12 * 7);

  const recentBookmarks = bookmarks.filter(
    (b) => new Date(b.createdAt) >= twelveWeeksAgo,
  );

  const weekCountMap: Record<string, number> = {};
  for (const b of recentBookmarks) {
    const ws = getWeekStart(new Date(b.createdAt));
    weekCountMap[ws] = (weekCountMap[ws] ?? 0) + 1;
  }

  // Build ordered week slots (last 12 weeks)
  const weekSlots: Array<{ weekStart: string; count: number; label: string }> = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i * 7);
    const ws = getWeekStart(d);
    if (!weekSlots.some((w) => w.weekStart === ws)) {
      weekSlots.push({
        weekStart: ws,
        count: weekCountMap[ws] ?? 0,
        label: weekLabel(ws),
      });
    }
  }
  const maxWeekCount = Math.max(...weekSlots.map((w) => w.count), 1);

  // Difficulty breakdown: count by difficulty tag
  const difficultyMap: Record<string, number> = {};
  for (const b of bookmarks) {
    const diff = b.question.difficulty ?? "UNKNOWN";
    difficultyMap[diff] = (difficultyMap[diff] ?? 0) + 1;
  }

  // Repeat questions (same questionId bookmarked — but since unique constraint exists, just show
  // questions attempted multiple times by checking if the same questionId appears in answers with
  // multiple exam dates — we proxy this as questions with correctRate < 50)
  const lowCorrectRateNotes = bookmarks.filter(
    (b) => b.question.correctRate !== null && b.question.correctRate < 50,
  );

  // Memos
  const notesWithMemo = bookmarks.filter((b) => b.memo && b.memo.trim()).length;

  return {
    totalNotes,
    thisWeekCount,
    topSubject,
    lastReviewDate,
    subjectStats,
    maxSubjectCount,
    weekSlots,
    maxWeekCount,
    difficultyMap,
    lowCorrectRateNotes: lowCorrectRateNotes.length,
    notesWithMemo,
  };
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default async function WrongNotesAnalyticsPage() {
  if (!hasDatabaseConfig()) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
              Analytics Unavailable
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              DB 연결 후 이용 가능합니다.
            </h1>
            <div className="mt-8">
              <Link
                href="/student/wrong-notes"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                ← 오답 노트로 돌아가기
              </Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const student = await getStudentPortalViewer();

  if (!student) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
              오답 노트 분석
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              오답 분석은 로그인 후 확인할 수 있습니다.
            </h1>
          </section>
          <StudentLookupForm redirectPath="/student/wrong-notes/analytics" />
        </div>
      </main>
    );
  }

  const {
    totalNotes,
    thisWeekCount,
    topSubject,
    lastReviewDate,
    subjectStats,
    maxSubjectCount,
    weekSlots,
    maxWeekCount,
    difficultyMap,
    lowCorrectRateNotes,
    notesWithMemo,
  } = await fetchWrongNoteAnalytics(student.examNumber);

  const difficultyLabel: Record<string, string> = {
    EASY: "쉬움",
    MEDIUM: "보통",
    HARD: "어려움",
    UNKNOWN: "미분류",
  };

  const difficultyColor: Record<string, string> = {
    EASY: "bg-green-400",
    MEDIUM: "bg-amber-400",
    HARD: "bg-red-500",
    UNKNOWN: "bg-slate-300",
  };

  return (
    <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">

        {/* ── 헤더 ── */}
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
                Wrong Notes Analytics
              </div>
              <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
                오답 노트 분석
              </h1>
              <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
                {student.name}님의 오답 패턴을 과목별·기간별로 분석합니다.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/student/wrong-notes"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                ← 오답 노트
              </Link>
              <Link
                href="/student/scores"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                성적 조회
              </Link>
            </div>
          </div>

          {/* ── KPI 카드 ── */}
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <p className="text-sm text-slate">총 오답 노트</p>
              <p className="mt-3 text-2xl font-bold text-ink">{totalNotes}문항</p>
            </article>
            <article
              className={`rounded-[24px] border p-4 ${
                thisWeekCount > 0
                  ? "border-forest/20 bg-forest/5"
                  : "border-ink/10 bg-mist"
              }`}
            >
              <p className="text-sm text-slate">이번주 추가</p>
              <p
                className={`mt-3 text-2xl font-bold ${
                  thisWeekCount > 0 ? "text-forest" : "text-ink"
                }`}
              >
                {thisWeekCount}문항
              </p>
            </article>
            <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <p className="text-sm text-slate">가장 많은 과목</p>
              <p className="mt-3 text-xl font-bold text-ember">
                {topSubject ?? "—"}
              </p>
            </article>
            <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <p className="text-sm text-slate">최근 메모 작성일</p>
              <p className="mt-3 text-xl font-bold text-ink">
                {lastReviewDate ?? "—"}
              </p>
            </article>
          </div>
        </section>

        {totalNotes === 0 ? (
          /* ── 빈 상태 ── */
          <section className="rounded-[28px] border border-dashed border-ink/10 py-20 text-center">
            <p className="text-sm font-semibold text-ink">저장된 오답 노트가 없습니다</p>
            <p className="mt-2 text-sm text-slate">
              성적 조회 화면에서 오답 문항을 저장하면 분석 데이터가 표시됩니다.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <Link
                href="/student/scores"
                className="inline-flex items-center rounded-full border border-forest/30 bg-forest/5 px-5 py-3 text-sm font-semibold text-forest transition hover:bg-forest/10"
              >
                성적 조회로 이동
              </Link>
            </div>
          </section>
        ) : (
          <>
            {/* ── 과목별 오답 분포 (수평 바 차트) ── */}
            <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
              <div className="mb-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">
                  Subject Breakdown
                </p>
                <h2 className="mt-1 text-xl font-semibold">과목별 오답 현황</h2>
              </div>

              {subjectStats.length === 0 ? (
                <p className="text-sm text-slate">데이터가 없습니다.</p>
              ) : (
                <div className="space-y-3">
                  {subjectStats.map(({ subject, label, count }) => {
                    const pct = Math.round((count / maxSubjectCount) * 100);
                    return (
                      <div key={subject} className="flex items-center gap-3">
                        <span className="w-24 shrink-0 text-right text-sm font-medium text-ink">
                          {label}
                        </span>
                        <div className="flex-1 overflow-hidden rounded-full bg-ink/8 h-5">
                          <div
                            className="h-full rounded-full bg-ember transition-all duration-500"
                            style={{ width: `${pct}%`, minWidth: count > 0 ? "8px" : "0" }}
                          />
                        </div>
                        <span className="w-12 shrink-0 text-sm font-semibold text-ink">
                          {count}문항
                        </span>
                        <span className="hidden w-10 shrink-0 text-right text-xs text-slate sm:block">
                          {pct}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* ── 주간 추가 추이 (마지막 12주) ── */}
            <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
              <div className="mb-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">
                  Weekly Trend
                </p>
                <h2 className="mt-1 text-xl font-semibold">주간 오답 추가 추이 (최근 12주)</h2>
              </div>

              <div className="flex items-end gap-1.5 h-32">
                {weekSlots.map((week) => {
                  const heightPct =
                    maxWeekCount > 0
                      ? Math.max(4, Math.round((week.count / maxWeekCount) * 100))
                      : 4;
                  const isCurrentWeek =
                    week.weekStart === getWeekStart(new Date());
                  return (
                    <div
                      key={week.weekStart}
                      className="flex flex-1 flex-col items-center gap-1"
                    >
                      {week.count > 0 && (
                        <span className="text-[10px] font-semibold text-slate">
                          {week.count}
                        </span>
                      )}
                      <div className="w-full flex-1 flex items-end">
                        <div
                          className={`w-full rounded-t-sm transition-all duration-300 ${
                            isCurrentWeek ? "bg-ember" : "bg-forest/50"
                          }`}
                          style={{ height: `${heightPct}%` }}
                          title={`${week.weekStart}: ${week.count}문항`}
                        />
                      </div>
                      <span className="text-[9px] text-slate">{week.label}</span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-slate">
                * 주 단위(월~일) 집계 · 현재 주는 ember 색으로 표시
              </p>
            </section>

            {/* ── 난이도 분포 ── */}
            {Object.keys(difficultyMap).length > 0 && (
              <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
                <div className="mb-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">
                    Difficulty Distribution
                  </p>
                  <h2 className="mt-1 text-xl font-semibold">난이도별 오답 분포</h2>
                </div>
                <div className="flex flex-wrap gap-3">
                  {Object.entries(difficultyMap).map(([diff, cnt]) => {
                    const pct =
                      totalNotes > 0 ? Math.round((cnt / totalNotes) * 100) : 0;
                    return (
                      <div
                        key={diff}
                        className="flex min-w-[100px] flex-col items-center rounded-[20px] border border-ink/10 bg-mist p-4"
                      >
                        <span
                          className={`inline-block h-3 w-12 rounded-full ${
                            difficultyColor[diff] ?? "bg-slate-300"
                          }`}
                        />
                        <p className="mt-2 text-sm font-semibold text-ink">
                          {difficultyLabel[diff] ?? diff}
                        </p>
                        <p className="mt-1 text-lg font-bold text-ink">{cnt}문항</p>
                        <p className="text-xs text-slate">{pct}%</p>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ── 추가 인사이트 ── */}
            <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
              <div className="mb-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">
                  Insights
                </p>
                <h2 className="mt-1 text-xl font-semibold">학습 인사이트</h2>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <article className="rounded-[20px] border border-ink/10 bg-mist p-4">
                  <p className="text-sm text-slate">정답률 50% 미만 문항</p>
                  <p className="mt-2 text-2xl font-bold text-red-600">
                    {lowCorrectRateNotes}문항
                  </p>
                  <p className="mt-1 text-xs text-slate">
                    학급 평균 정답률 50% 미만인 어려운 문항
                  </p>
                </article>
                <article className="rounded-[20px] border border-ink/10 bg-mist p-4">
                  <p className="text-sm text-slate">메모 작성 완료</p>
                  <p className="mt-2 text-2xl font-bold text-forest">
                    {notesWithMemo}문항
                  </p>
                  <p className="mt-1 text-xs text-slate">
                    전체의{" "}
                    {totalNotes > 0
                      ? Math.round((notesWithMemo / totalNotes) * 100)
                      : 0}
                    % 메모 작성됨
                  </p>
                </article>
                <article className="rounded-[20px] border border-ink/10 bg-mist p-4">
                  <p className="text-sm text-slate">커버 과목 수</p>
                  <p className="mt-2 text-2xl font-bold text-ink">
                    {subjectStats.length}개 과목
                  </p>
                  <p className="mt-1 text-xs text-slate">
                    오답 노트가 있는 과목
                  </p>
                </article>
              </div>
            </section>

            {/* ── 취약 과목 집중 안내 ── */}
            {subjectStats.length > 0 && (
              <section className="rounded-[28px] border border-amber-200 bg-amber-50/60 p-5 sm:p-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
                    <svg
                      className="h-5 w-5 text-amber-700"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-amber-800">
                      취약 과목 집중 학습 추천
                    </p>
                    <p className="mt-1 text-sm text-amber-700">
                      가장 오답이 많은 과목은{" "}
                      <strong>{subjectStats[0]?.label}</strong>
                      {subjectStats[1] ? (
                        <>
                          {" "}와{" "}
                          <strong>{subjectStats[1].label}</strong>
                        </>
                      ) : null}
                      입니다. 해당 과목의 오답 노트를 우선적으로 복습하세요.
                    </p>
                    <Link
                      href="/student/wrong-notes"
                      className="mt-3 inline-flex items-center rounded-full border border-amber-300 bg-white px-4 py-2 text-xs font-semibold text-amber-800 transition hover:bg-amber-100"
                    >
                      오답 노트 복습하기
                    </Link>
                  </div>
                </div>
              </section>
            )}
          </>
        )}

      </div>
    </main>
  );
}
