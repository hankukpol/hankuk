import Link from "next/link";
import { type Subject } from "@prisma/client";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { SUBJECT_LABEL } from "@/lib/constants";
import { hasDatabaseConfig } from "@/lib/env";
import { formatDate } from "@/lib/format";
import { formatScore } from "@/lib/analytics/presentation";
import { getPrisma } from "@/lib/prisma";
import { getStudentPortalViewer } from "@/lib/student-portal/service";

export const dynamic = "force-dynamic";

function scoreColorClass(score: number | null | undefined): string {
  if (score === null || score === undefined) return "text-slate";
  if (score < 60) return "text-red-600 font-semibold";
  if (score < 80) return "text-amber-600 font-semibold";
  return "text-forest font-semibold";
}

function scoreBgClass(score: number | null | undefined): string {
  if (score === null || score === undefined) return "bg-mist";
  if (score < 60) return "bg-red-50";
  if (score < 80) return "bg-amber-50";
  return "bg-green-50";
}

function attendStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    PRESENT: "출석",
    LATE: "지각",
    ABSENT: "결석",
    EXCUSED: "공결",
  };
  return labels[status] ?? status;
}

export default async function StudentAnalyticsPage() {
  if (!hasDatabaseConfig()) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
              Analytics Unavailable
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              학습 분석은 DB 연결 후 사용할 수 있습니다.
            </h1>
            <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
              현재 환경에는 학습 분석 데이터를 불러올 데이터베이스가 연결되어 있지 않습니다.
            </p>
            <div className="mt-8">
              <Link
                href="/student"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                학생 포털로 돌아가기
              </Link>
            </div>
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
              Analytics Login
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              학습 분석은 로그인 후 확인할 수 있습니다.
            </h1>
            <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
              학생 포털에 로그인하면 최근 성적 추이와 출석 현황을 한눈에 확인할 수 있습니다.
            </p>
          </section>

          <StudentLookupForm redirectPath="/student/analytics" />
        </div>
      </main>
    );
  }

  const prisma = getPrisma();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // 최근 성적 30회 (표시는 10회, 과목별 집계는 전체 사용)
  const [scores, lectureAttendances, wrongNoteBookmarks] = await Promise.all([
    prisma.score.findMany({
      where: { examNumber: viewer.examNumber },
      include: {
        session: {
          select: {
            id: true,
            examDate: true,
            subject: true,
            displaySubjectName: true,
            week: true,
          },
        },
      },
      orderBy: { session: { examDate: "desc" } },
      take: 30,
    }),
    prisma.lectureAttendance.findMany({
      where: {
        studentId: viewer.examNumber,
        session: {
          sessionDate: { gte: thirtyDaysAgo },
        },
      },
      select: { status: true },
    }),
    prisma.wrongNoteBookmark.findMany({
      where: { examNumber: viewer.examNumber },
      include: {
        question: {
          include: {
            questionSession: {
              select: { subject: true },
            },
          },
        },
      },
    }),
  ]);

  // ── 최근 석차 계산 ──
  // Find the most recent score with a finalScore
  const latestScoredRow = scores.find((s) => s.finalScore !== null);
  let latestRank: number | null = null;
  let latestRankTotal: number | null = null;

  if (latestScoredRow) {
    const sessionId = latestScoredRow.session.id;
    const cohortSessionScores = await prisma.score.findMany({
      where: { sessionId, finalScore: { not: null } },
      select: { finalScore: true },
    });
    const allScores = cohortSessionScores.map((s) => s.finalScore as number);
    const myScore = latestScoredRow.finalScore as number;
    latestRank = allScores.filter((s) => s > myScore).length + 1;
    latestRankTotal = allScores.length;
  }

  // ── 성적 KPI ──
  const scoredRows = scores.filter((s) => s.finalScore !== null);
  const recentScores = scores.slice(0, 10);
  const maxScore = scoredRows.length
    ? Math.max(...scoredRows.map((s) => s.finalScore!))
    : null;
  const avgScore = scoredRows.length
    ? scoredRows.reduce((sum, s) => sum + s.finalScore!, 0) / scoredRows.length
    : null;
  const latestScore = scoredRows.length > 0 ? scoredRows[0]!.finalScore : null;

  // ── 과목별 평균 (최근 30회) ──
  const subjectMap = new Map<
    Subject,
    { total: number; count: number; displayName: string }
  >();
  for (const row of scores) {
    if (row.finalScore === null) continue;
    const subject = row.session.subject;
    const existing = subjectMap.get(subject);
    if (existing) {
      existing.total += row.finalScore;
      existing.count += 1;
    } else {
      subjectMap.set(subject, {
        total: row.finalScore,
        count: 1,
        displayName: row.session.displaySubjectName ?? SUBJECT_LABEL[subject],
      });
    }
  }
  const subjectAverages = Array.from(subjectMap.entries())
    .map(([subject, { total, count, displayName }]) => ({
      subject,
      displayName,
      average: total / count,
      count,
    }))
    .sort((a, b) => a.subject.localeCompare(b.subject));

  // ── 강의 출석 현황 (최근 30일) ──
  const attendCounts = { PRESENT: 0, LATE: 0, ABSENT: 0, EXCUSED: 0 };
  for (const att of lectureAttendances) {
    const key = att.status as keyof typeof attendCounts;
    if (key in attendCounts) attendCounts[key]++;
  }
  const totalAttend = lectureAttendances.length;
  const attendRate =
    totalAttend > 0
      ? Math.round(
          ((attendCounts.PRESENT + attendCounts.EXCUSED) / totalAttend) * 100,
        )
      : null;

  // ── 오답 노트 과목별 건수 ──
  const wrongNoteBySubject = new Map<Subject, number>();
  for (const bookmark of wrongNoteBookmarks) {
    const subject = bookmark.question.questionSession.subject;
    wrongNoteBySubject.set(subject, (wrongNoteBySubject.get(subject) ?? 0) + 1);
  }
  const wrongNoteSummary = Array.from(wrongNoteBySubject.entries())
    .map(([subject, count]) => ({ subject, count }))
    .sort((a, b) => b.count - a.count);

  return (
    <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">

        {/* ── 헤더 ── */}
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
                Student Analytics
              </div>
              <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-4xl">
                {viewer.name}의 나의 학습 분석
              </h1>
              <p className="mt-4 text-sm leading-7 text-slate">
                최근 성적 추이와 출석 현황을 한눈에 확인하세요.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/student/analytics/subject-comparison"
                className="inline-flex items-center rounded-full border border-forest/20 bg-forest/10 px-5 py-3 text-sm font-semibold text-forest transition hover:bg-forest/20"
              >
                과목별 비교 분석
              </Link>
              <Link
                href="/student/scores"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                성적 카드 보기
              </Link>
              <Link
                href="/student"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                포털로 돌아가기
              </Link>
            </div>
          </div>

          {/* 성적 KPI 4개 */}
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <article className={`rounded-[24px] border border-ink/10 p-4 ${scoreBgClass(maxScore)}`}>
              <p className="text-sm text-slate">최고 점수</p>
              <p className={`mt-3 text-2xl font-bold ${scoreColorClass(maxScore)}`}>
                {formatScore(maxScore)}
              </p>
              <p className="mt-1 text-xs text-slate">최근 30회</p>
            </article>
            <article className={`rounded-[24px] border border-ink/10 p-4 ${scoreBgClass(avgScore)}`}>
              <p className="text-sm text-slate">평균 점수</p>
              <p className={`mt-3 text-2xl font-bold ${scoreColorClass(avgScore)}`}>
                {formatScore(avgScore)}
              </p>
              <p className="mt-1 text-xs text-slate">최근 30회 응시 기준</p>
            </article>
            <article className={`rounded-[24px] border border-ink/10 p-4 ${scoreBgClass(latestScore)}`}>
              <p className="text-sm text-slate">최근 점수</p>
              <p className={`mt-3 text-2xl font-bold ${scoreColorClass(latestScore)}`}>
                {formatScore(latestScore)}
              </p>
              <p className="mt-1 text-xs text-slate">가장 최근 시험</p>
            </article>
            <article className={`rounded-[24px] border border-ink/10 p-4 ${
              latestRank !== null && latestRankTotal !== null && latestRankTotal > 0
                ? latestRank / latestRankTotal <= 0.1
                  ? "bg-green-50"
                  : latestRank / latestRankTotal <= 0.3
                  ? "bg-amber-50"
                  : "bg-mist"
                : "bg-mist"
            }`}>
              <p className="text-sm text-slate">최근 석차</p>
              {latestRank !== null && latestRankTotal !== null && latestRankTotal > 0 ? (
                <>
                  <p className={`mt-3 text-2xl font-bold ${
                    latestRank / latestRankTotal <= 0.1
                      ? "text-forest"
                      : latestRank / latestRankTotal <= 0.3
                      ? "text-amber-600"
                      : "text-ink"
                  }`}>
                    {latestRank}위
                  </p>
                  <p className="mt-1 text-xs text-slate">
                    {latestRankTotal}명 중 · 상위 {Math.ceil((latestRank / latestRankTotal) * 100)}%
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-3 text-2xl font-bold text-slate">-</p>
                  <p className="mt-1 text-xs text-slate">가장 최근 시험</p>
                </>
              )}
            </article>
          </div>
        </section>

        {/* ── 최근 성적 추이 ── */}
        <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
          <h2 className="mb-1 text-lg font-semibold">최근 성적 추이</h2>
          <p className="mb-4 text-xs text-slate">
            최근 10회 시험 결과 (미응시 포함)
          </p>
          {recentScores.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-ink/10 p-8 text-sm text-slate">
              등록된 성적이 없습니다.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-[20px] border border-ink/10">
              <table className="min-w-full divide-y divide-ink/10 text-sm">
                <thead className="bg-mist/80 text-left">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-slate">시험일</th>
                    <th className="px-4 py-3 font-semibold text-slate">과목</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate">최종 점수</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate">원점수</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate">OX</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/10">
                  {recentScores.map((row) => (
                    <tr key={row.id} className={scoreBgClass(row.finalScore)}>
                      <td className="whitespace-nowrap px-4 py-3">
                        <Link
                          href={`/student/scores/${encodeURIComponent(formatDate(row.session.examDate))}`}
                          className="text-ember underline underline-offset-2 hover:text-ember/80"
                        >
                          {formatDate(row.session.examDate)}
                        </Link>
                        <span className="ml-2 text-xs text-slate">{row.session.week}주차</span>
                      </td>
                      <td className="px-4 py-3">
                        {row.session.displaySubjectName ?? SUBJECT_LABEL[row.session.subject]}
                      </td>
                      <td className={`px-4 py-3 text-right ${scoreColorClass(row.finalScore)}`}>
                        {row.finalScore !== null ? `${formatScore(row.finalScore)}점` : (
                          <span className="text-slate">미응시</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-slate">
                        {formatScore(row.rawScore ?? null)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate">
                        {formatScore(row.oxScore ?? null)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-slate">
            색상: <span className="text-forest font-medium">초록 80+</span>
            {" · "}
            <span className="text-amber-600 font-medium">노랑 60~79</span>
            {" · "}
            <span className="text-red-600 font-medium">빨강 60미만</span>
          </p>
        </section>

        {/* ── 과목별 평균 ── */}
        <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
          <h2 className="mb-1 text-lg font-semibold">과목별 평균</h2>
          <p className="mb-4 text-xs text-slate">
            최근 30회 응시 기준 (미응시 제외)
          </p>
          {subjectAverages.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-ink/10 p-8 text-sm text-slate">
              집계할 성적이 없습니다.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-[20px] border border-ink/10">
              <table className="min-w-full divide-y divide-ink/10 text-sm">
                <thead className="bg-mist/80 text-left">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-slate">과목</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate">내 평균</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate">응시 횟수</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/10">
                  {subjectAverages.map(({ subject, displayName, average, count }) => (
                    <tr key={subject}>
                      <td className="px-4 py-3 font-medium">{displayName}</td>
                      <td className={`px-4 py-3 text-right ${scoreColorClass(average)}`}>
                        {formatScore(average)}점
                      </td>
                      <td className="px-4 py-3 text-right text-slate">{count}회</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── 강의 출석 현황 (최근 30일) ── */}
        <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
          <h2 className="mb-1 text-lg font-semibold">강의 출석 현황</h2>
          <p className="mb-4 text-xs text-slate">최근 30일 기준</p>
          {totalAttend === 0 ? (
            <div className="rounded-[24px] border border-dashed border-ink/10 p-8 text-sm text-slate">
              최근 30일 내 강의 출결 기록이 없습니다.
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <article className="rounded-[20px] border border-forest/20 bg-forest/10 p-4">
                  <p className="text-xs text-slate">출석</p>
                  <p className="mt-2 text-2xl font-bold text-forest">{attendCounts.PRESENT}회</p>
                </article>
                <article className="rounded-[20px] border border-sky-200 bg-sky-50 p-4">
                  <p className="text-xs text-slate">공결</p>
                  <p className="mt-2 text-2xl font-bold text-sky-700">{attendCounts.EXCUSED}회</p>
                </article>
                <article className="rounded-[20px] border border-amber-200 bg-amber-50 p-4">
                  <p className="text-xs text-slate">지각</p>
                  <p className="mt-2 text-2xl font-bold text-amber-700">{attendCounts.LATE}회</p>
                </article>
                <article className="rounded-[20px] border border-red-200 bg-red-50 p-4">
                  <p className="text-xs text-slate">결석</p>
                  <p className="mt-2 text-2xl font-bold text-red-700">{attendCounts.ABSENT}회</p>
                </article>
              </div>
              {attendRate !== null && (
                <div className="mt-4 flex items-center gap-3">
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-mist">
                    <div
                      className="h-full rounded-full bg-forest transition-all"
                      style={{ width: `${attendRate}%` }}
                    />
                  </div>
                  <span className="w-16 text-right text-sm font-semibold text-forest">
                    출석률 {attendRate}%
                  </span>
                </div>
              )}
              <p className="mt-3 text-xs text-slate">
                총 {totalAttend}회 중 출석+공결 {attendCounts.PRESENT + attendCounts.EXCUSED}회
              </p>
            </>
          )}
        </section>

        {/* ── 오답 노트 요약 ── */}
        <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">오답 노트 요약</h2>
              <p className="mt-1 text-xs text-slate">
                과목별 저장된 오답 문항 수
              </p>
            </div>
            <Link
              href="/student/wrong-notes"
              className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
            >
              오답 노트 보기
            </Link>
          </div>
          {wrongNoteBookmarks.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-ink/10 p-8 text-sm text-slate">
              저장된 오답 노트가 없습니다.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-[20px] border border-ink/10">
              <table className="min-w-full divide-y divide-ink/10 text-sm">
                <thead className="bg-mist/80 text-left">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-slate">과목</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate">오답 문항 수</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/10">
                  {wrongNoteSummary.map(({ subject, count }) => (
                    <tr key={subject}>
                      <td className="px-4 py-3 font-medium">{SUBJECT_LABEL[subject]}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="inline-flex rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700">
                          {count}건
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-ink/10 bg-mist/50">
                  <tr>
                    <td className="px-4 py-3 font-semibold">전체</td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {wrongNoteBookmarks.length}건
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>

      </div>
    </main>
  );
}
