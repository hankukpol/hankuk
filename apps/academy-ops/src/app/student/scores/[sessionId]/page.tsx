import Link from "next/link";
import { notFound } from "next/navigation";
import { RadarScoreChart } from "@/components/student-portal/radar-score-chart";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { formatScore } from "@/lib/analytics/presentation";
import { ATTEND_TYPE_LABEL, SUBJECT_LABEL } from "@/lib/constants";
import { hasDatabaseConfig } from "@/lib/env";
import { formatDateWithWeekday } from "@/lib/format";
import { getStudentPortalViewer } from "@/lib/student-portal/service";
import { getStudentPortalScoreSessionDetail } from "@/student-portal-api-data";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ sessionId: string }>;
};

function changeLabel(change: number | null) {
  if (change === null) return { text: "이전 기록 없음", cls: "text-slate" };
  if (change > 0) return { text: `↑ +${formatScore(change)}점`, cls: "text-green-600 font-semibold" };
  if (change < 0) return { text: `↓ ${formatScore(change)}점`, cls: "text-red-500 font-semibold" };
  return { text: "→ 유지", cls: "text-slate" };
}

function avgDiffLabel(score: number | null, avg: number) {
  if (score === null) return { text: "-", cls: "text-slate" };
  const diff = Math.round((score - avg) * 100) / 100;
  if (diff > 0) return { text: `+${formatScore(diff)}점`, cls: "text-green-600" };
  if (diff < 0) return { text: `${formatScore(diff)}점`, cls: "text-red-500" };
  return { text: "±0", cls: "text-slate" };
}

function scoreColorClass(score: number | null | undefined): string {
  if (score === null || score === undefined) return "text-slate";
  if (score < 60) return "text-red-600 font-semibold";
  if (score < 80) return "text-amber-600 font-semibold";
  return "text-forest font-semibold";
}

export default async function ScoreSessionDetailPage({ params }: PageProps) {
  if (!hasDatabaseConfig()) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <p className="text-sm text-slate">DB 연결 후 사용할 수 있습니다.</p>
            <div className="mt-6">
              <Link
                href="/student/scores"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                성적 목록으로
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
              Student Scores Login
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight">
              로그인 후 확인할 수 있습니다.
            </h1>
          </section>
          <StudentLookupForm redirectPath="/student/scores" />
        </div>
      </main>
    );
  }

  const { sessionId } = await params;

  // sessionId = date string "YYYY-MM-DD"
  const dateKey = decodeURIComponent(sessionId);

  const data = await getStudentPortalScoreSessionDetail({
    examNumber: viewer.examNumber,
    dateKey,
  });

  if (!data) {
    notFound();
  }

  // 방사형 차트 데이터: SUBJECT_LABEL로 변환
  const radarData = data.radarData.map((point) => ({
    ...point,
    subject: SUBJECT_LABEL[point.subject] ?? point.subject,
  }));

  const hasAnyScore = data.subjectScores.some((s) => s.finalScore !== null);

  return (
    <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">

        {/* 헤더 카드 */}
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
                Score Detail
              </div>
              <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-4xl">
                {data.examDate ? formatDateWithWeekday(data.examDate) : dateKey} 성적
              </h1>
              {data.week !== null && (
                <p className="mt-2 text-sm text-slate">{data.week}주차 시험</p>
              )}
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/student/scores"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                성적 목록으로
              </Link>
              {data.prevDateKey && (
                <Link
                  href={`/student/scores/${encodeURIComponent(data.prevDateKey)}`}
                  className="inline-flex items-center gap-1 rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  이전 시험
                </Link>
              )}
              {data.nextDateKey && (
                <Link
                  href={`/student/scores/${encodeURIComponent(data.nextDateKey)}`}
                  className="inline-flex items-center gap-1 rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
                >
                  다음 시험
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              )}
            </div>
          </div>

          {/* 총점 + 전체 석차 KPI */}
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <p className="text-sm text-slate">총점</p>
              <p className="mt-3 text-2xl font-bold text-ember">
                {hasAnyScore ? `${formatScore(data.totalScore)}점` : "-"}
              </p>
            </article>
            <article className={`rounded-[24px] border border-ink/10 p-4 ${
              data.overallRank !== null && data.overallTotal > 0
                ? data.overallRank / data.overallTotal <= 0.1
                  ? "bg-green-50"
                  : data.overallRank / data.overallTotal <= 0.3
                  ? "bg-amber-50"
                  : "bg-mist"
                : "bg-mist"
            }`}>
              <p className="text-sm text-slate">내 석차</p>
              {data.overallRank !== null && data.overallTotal > 0 ? (
                <>
                  <p className={`mt-3 text-2xl font-bold ${
                    data.overallRank / data.overallTotal <= 0.1
                      ? "text-forest"
                      : data.overallRank / data.overallTotal <= 0.3
                      ? "text-amber-600"
                      : "text-ink"
                  }`}>
                    {data.overallRank}위 / {data.overallTotal}명 중
                  </p>
                  <p className="mt-1 text-xs text-slate">
                    상위 {Math.ceil((data.overallRank / data.overallTotal) * 100)}%
                  </p>
                </>
              ) : (
                <p className="mt-3 text-2xl font-bold text-slate">-</p>
              )}
            </article>
            <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <p className="text-sm text-slate">과목 수</p>
              <p className="mt-3 text-2xl font-bold text-ink">
                {data.subjectScores.filter((s) => s.finalScore !== null).length}
                <span className="text-base font-normal text-slate"> / {data.subjectScores.length}과목</span>
              </p>
            </article>
          </div>
        </section>

        {/* 과목별 성적 테이블 */}
        <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
          <h2 className="mb-1 text-lg font-semibold">과목별 성적</h2>
          <p className="mb-4 text-xs text-slate">평균 대비 = 내 점수 − 전체 평균 / 변화 = 전회차 대비</p>

          <div className="overflow-x-auto rounded-[20px] border border-ink/10">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <thead className="bg-mist/80 text-left">
                <tr>
                  <th className="px-4 py-3 font-semibold">과목</th>
                  <th className="px-4 py-3 font-semibold text-center">점수</th>
                  <th className="px-4 py-3 font-semibold text-center">전체평균</th>
                  <th className="px-4 py-3 font-semibold text-center">평균 대비</th>
                  <th className="px-4 py-3 font-semibold text-center">전회차 대비</th>
                  <th className="px-4 py-3 font-semibold text-center">과목 석차</th>
                  <th className="px-4 py-3 font-semibold text-center">출결</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {data.subjectScores.map((row) => {
                  const diff = avgDiffLabel(row.finalScore, row.cohortAvg);
                  const chg = changeLabel(row.change);
                  return (
                    <tr key={row.subject} className="hover:bg-mist/40 transition-colors">
                      <td className="px-4 py-3 font-medium">
                        {SUBJECT_LABEL[row.subject] ?? row.subject}
                      </td>
                      <td className={`px-4 py-3 text-center text-base ${scoreColorClass(row.finalScore)}`}>
                        {row.finalScore !== null ? `${formatScore(row.finalScore)}점` : (
                          <span className="inline-flex rounded-full border border-slate/20 bg-slate/10 px-2 py-0.5 text-xs font-semibold text-slate">
                            미응시
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-slate">
                        {row.cohortAvg > 0 ? `${formatScore(row.cohortAvg)}점` : "-"}
                      </td>
                      <td className={`px-4 py-3 text-center text-xs ${diff.cls}`}>
                        {diff.text}
                      </td>
                      <td className={`px-4 py-3 text-center text-xs ${chg.cls}`}>
                        {chg.text}
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-slate">
                        {row.rank && row.total > 0
                          ? `${row.rank}위 / ${row.total}명`
                          : "-"}
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-slate">
                        {row.attendType ? (ATTEND_TYPE_LABEL[row.attendType] ?? row.attendType) : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* 방사형 차트 */}
        {radarData.length > 0 && hasAnyScore && (
          <RadarScoreChart data={radarData} />
        )}

        {/* 하단 네비게이션 */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-6">
          <div className="flex flex-wrap gap-3">
            {data.prevDateKey ? (
              <Link
                href={`/student/scores/${encodeURIComponent(data.prevDateKey)}`}
                className="inline-flex items-center gap-1 rounded-full border border-ink/10 bg-white px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                이전 시험 ({data.prevDateKey})
              </Link>
            ) : (
              <span className="inline-flex items-center rounded-full border border-ink/10 bg-mist px-5 py-3 text-sm text-slate">
                첫 번째 시험
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/student/scores"
              className="inline-flex items-center rounded-full border border-ink/10 bg-white px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
            >
              목록
            </Link>
            <Link
              href="/student"
              className="inline-flex items-center rounded-full border border-ink/10 bg-white px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
            >
              포털 홈
            </Link>
          </div>
          <div className="flex flex-wrap gap-3">
            {data.nextDateKey ? (
              <Link
                href={`/student/scores/${encodeURIComponent(data.nextDateKey)}`}
                className="inline-flex items-center gap-1 rounded-full border border-ink/10 bg-white px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                다음 시험 ({data.nextDateKey})
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ) : (
              <span className="inline-flex items-center rounded-full border border-ink/10 bg-mist px-5 py-3 text-sm text-slate">
                마지막 시험
              </span>
            )}
          </div>
        </div>

      </div>
    </main>
  );
}
