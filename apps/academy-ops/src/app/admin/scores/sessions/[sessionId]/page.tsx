import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole, AttendType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { ATTEND_TYPE_LABEL, EXAM_TYPE_LABEL } from "@/lib/constants";
import {
  buildExamSubjectLabelMap,
  buildFallbackExamSubjectCatalog,
  listExamSubjectCatalogForAcademy,
} from "@/lib/exam-subjects/service";
import { getPrisma } from "@/lib/prisma";
import {
  applyScoreSessionAcademyScope,
  resolveVisibleScoreSessionAcademyId,
} from "@/lib/scores/session-admin";
import { getScoreSubjectLabel } from "@/lib/scores/subject-filter";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ sessionId: string }> };

function formatDate(date: Date) {
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
}

function scoreColorClass(score: number, top10Threshold: number, bottom20Threshold: number) {
  if (score >= top10Threshold) return "font-semibold text-forest";
  if (score <= bottom20Threshold) return "font-semibold text-amber-600";
  return "text-ink";
}

export default async function ScoreSessionDetailPage({ params }: PageProps) {
  const { sessionId } = await params;
  await requireAdminContext(AdminRole.TEACHER);

  const id = Number(sessionId);
  if (!Number.isFinite(id) || id <= 0) notFound();

  const academyId = await resolveVisibleScoreSessionAcademyId();
  const [session, subjectCatalog] = await Promise.all([
    getPrisma().examSession.findFirst({
      where: applyScoreSessionAcademyScope({ id }, academyId),
      include: {
        period: true,
        scores: {
          include: {
            student: {
              select: {
                examNumber: true,
                name: true,
                phone: true,
                examType: true,
              },
            },
          },
          orderBy: { examNumber: "asc" },
        },
      },
    }),
    academyId === null
      ? Promise.resolve(buildFallbackExamSubjectCatalog())
      : listExamSubjectCatalogForAcademy(academyId, { includeInactive: true }),
  ]);

  if (!session) notFound();

  const presentScores = session.scores.filter(
    (score) => score.attendType === AttendType.NORMAL || score.attendType === AttendType.LIVE,
  );

  const scoreValues = presentScores
    .map((score) => score.finalScore)
    .filter((value): value is number => value !== null && value !== undefined);

  const totalParticipants = session.scores.length;
  const presentCount = presentScores.length;
  const averageScore =
    scoreValues.length > 0
      ? Math.round((scoreValues.reduce((sum, value) => sum + value, 0) / scoreValues.length) * 10) / 10
      : null;
  const highestScore = scoreValues.length > 0 ? Math.max(...scoreValues) : null;
  const lowestScore = scoreValues.length > 0 ? Math.min(...scoreValues) : null;
  const failCount = scoreValues.filter((value) => value < 40).length;

  const sortedScores = [...scoreValues].sort((left, right) => right - left);
  const top10Index = Math.max(0, Math.ceil(sortedScores.length * 0.1) - 1);
  const bottom20Index = Math.max(0, Math.floor(sortedScores.length * 0.8));
  const top10Threshold = sortedScores.length > 0 ? sortedScores[top10Index] : Number.POSITIVE_INFINITY;
  const bottom20Threshold = sortedScores.length > 0 ? sortedScores[bottom20Index] : Number.NEGATIVE_INFINITY;

  const rankedScores = session.scores
    .map((score) => ({
      ...score,
      rank: null as number | null,
      computedScore: score.finalScore ?? null,
    }))
    .sort((left, right) => {
      if (left.computedScore === null && right.computedScore === null) return 0;
      if (left.computedScore === null) return 1;
      if (right.computedScore === null) return -1;
      return right.computedScore - left.computedScore;
    });

  let currentRank = 0;
  let previousScore: number | null = null;
  for (const row of rankedScores) {
    if (row.attendType !== AttendType.NORMAL && row.attendType !== AttendType.LIVE) {
      continue;
    }

    if (row.computedScore !== previousScore) {
      currentRank += 1;
      previousScore = row.computedScore;
    }
    row.rank = currentRank;
  }

  const subjectLabelMap = buildExamSubjectLabelMap(subjectCatalog);
  const subjectLabel = getScoreSubjectLabel(
    session.subject,
    session.displaySubjectName,
    subjectLabelMap,
  );
  const examTypeLabel = EXAM_TYPE_LABEL[session.examType] ?? session.examType;

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        성적 관리
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <Link href="/admin/scores" className="text-sm text-slate transition hover:text-ember">
          성적 허브
        </Link>
        <Link
          href={`/admin/scores/sessions/${session.id}/edit`}
          className="inline-flex items-center rounded-full border border-ink/20 px-4 py-1.5 text-xs font-semibold text-slate transition hover:border-ember/30 hover:text-ember"
        >
          회차 수정
        </Link>
      </div>

      <h1 className="mt-3 text-2xl font-semibold text-ink sm:text-3xl">
        {formatDate(session.examDate)} · {examTypeLabel}
      </h1>
      <p className="mt-1 text-sm text-slate">
        {session.period.name} · {session.week}주차 · {subjectLabel}
        {session.isLocked && (
          <span className="ml-2 inline-flex items-center rounded-full border border-ink/10 bg-ink/5 px-2 py-0.5 text-[10px] font-semibold text-slate">
            잠금
          </span>
        )}
        {session.isCancelled && (
          <span className="ml-2 inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600">
            취소됨
          </span>
        )}
      </p>

      <section className="mt-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <article className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">응시 인원</p>
            <p className="mt-3 text-3xl font-semibold text-ink">{presentCount}</p>
            <p className="mt-1 text-xs text-slate">전체 등록 {totalParticipants}명</p>
          </article>

          <article className="rounded-[28px] border border-forest/20 bg-forest/5 p-6 shadow-panel">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-forest">평균 점수</p>
            <p className="mt-3 text-3xl font-semibold text-forest">
              {averageScore !== null ? `${averageScore}점` : "-"}
            </p>
            <p className="mt-1 text-xs text-slate">정상 응시 기준</p>
          </article>

          <article className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">최고점 / 최저점</p>
            <p className="mt-3 text-xl font-semibold text-ink">
              {highestScore !== null ? `${highestScore}점` : "-"}
              <span className="mx-1.5 text-ink/30">/</span>
              {lowestScore !== null ? `${lowestScore}점` : "-"}
            </p>
            <p className="mt-1 text-xs text-slate">정상 응시 기준</p>
          </article>

          <article
            className={`rounded-[28px] border p-6 shadow-panel ${
              failCount > 0 ? "border-amber-200 bg-amber-50/60" : "border-ink/10 bg-white"
            }`}
          >
            <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${failCount > 0 ? "text-amber-700" : "text-slate"}`}>
              과락 인원
            </p>
            <p className={`mt-3 text-3xl font-semibold ${failCount > 0 ? "text-amber-700" : "text-ink"}`}>
              {failCount}명
            </p>
            <p className="mt-1 text-xs text-slate">최종점수 40점 미만</p>
          </article>
        </div>
      </section>

      <section className="mt-10">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate">
            성적 목록 ({rankedScores.length}명)
          </h2>
          <div className="flex items-center gap-2">
            <Link
              href={`/admin/scores/sessions/${session.id}/print`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-full border border-ink/20 px-4 py-1.5 text-xs font-semibold text-slate transition hover:border-ink/40 hover:bg-ink/5"
            >
              성적표 인쇄
            </Link>
            <Link
              href={`/admin/scores/edit?sessionId=${session.id}`}
              className="inline-flex items-center rounded-full border border-forest/30 px-4 py-1.5 text-xs font-semibold text-forest transition hover:bg-forest/10"
            >
              수정
            </Link>
            <Link
              href={`/admin/scores/input?sessionId=${session.id}`}
              className="inline-flex items-center rounded-full border border-ember/30 bg-ember/10 px-4 py-1.5 text-xs font-semibold text-ember transition hover:bg-ember/20"
            >
              성적 입력
            </Link>
          </div>
        </div>

        {rankedScores.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/10 p-10 text-center text-sm text-slate">
            등록된 성적이 없습니다. <Link href={`/admin/scores/input?sessionId=${session.id}`} className="font-semibold text-ember hover:underline">성적 입력</Link>
          </div>
        ) : (
          <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white shadow-panel">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <thead className="bg-mist/50">
                <tr>
                  {['순위', '학번', '이름', '연락처', '응시', '원점수', 'OX', '최종점수'].map((header) => (
                    <th key={header} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {rankedScores.map((row) => (
                  <tr key={row.id} className="transition hover:bg-mist/30">
                    <td className="px-4 py-3 font-mono text-slate">{row.rank ?? '-'}</td>
                    <td className="px-4 py-3 font-mono text-slate">{row.student.examNumber}</td>
                    <td className="px-4 py-3 font-medium text-ink">{row.student.name}</td>
                    <td className="px-4 py-3 text-slate">{row.student.phone ?? '-'}</td>
                    <td className="px-4 py-3 text-slate">{ATTEND_TYPE_LABEL[row.attendType] ?? row.attendType}</td>
                    <td className="px-4 py-3 font-mono text-slate">{row.rawScore ?? '-'}</td>
                    <td className="px-4 py-3 font-mono text-slate">{row.oxScore ?? '-'}</td>
                    <td className={`px-4 py-3 font-mono ${row.finalScore !== null && row.finalScore !== undefined ? scoreColorClass(row.finalScore, top10Threshold, bottom20Threshold) : 'text-slate'}`}>
                      {row.finalScore ?? '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
