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
import { ScorePrintButton } from "./print-button";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ sessionId: string }> };

function formatDate(date: Date) {
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  return `${date.getFullYear()}년 ${String(date.getMonth() + 1).padStart(2, "0")}월 ${String(date.getDate()).padStart(2, "0")}일 (${weekdays[date.getDay()]})`;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }

  return result;
}

export default async function ScoreSessionPrintPage({ params }: PageProps) {
  const { sessionId } = await params;
  await requireAdminContext(AdminRole.TEACHER);

  const sessionIdNum = Number(sessionId);
  if (!Number.isFinite(sessionIdNum) || sessionIdNum <= 0) notFound();

  const academyId = await resolveVisibleScoreSessionAcademyId();
  const [session, subjectCatalog] = await Promise.all([
    getPrisma().examSession.findFirst({
      where: applyScoreSessionAcademyScope({ id: sessionIdNum }, academyId),
      include: {
        scores: {
          include: {
            student: {
              select: { name: true, examNumber: true },
            },
          },
          orderBy: [{ finalScore: "desc" }, { examNumber: "asc" }],
        },
        period: { select: { name: true } },
      },
    }),
    academyId === null
      ? Promise.resolve(buildFallbackExamSubjectCatalog())
      : listExamSubjectCatalogForAcademy(academyId, { includeInactive: true }),
  ]);

  if (!session) notFound();

  const subjectLabelMap = buildExamSubjectLabelMap(subjectCatalog);

  type ScoreWithRank = (typeof session.scores)[number] & { rank: number | null };

  let currentRank = 0;
  let previousScore: number | null = null;
  const rankedScores: ScoreWithRank[] = session.scores.map((score) => {
    let rank: number | null = null;

    if (
      score.finalScore !== null &&
      score.finalScore !== undefined &&
      (score.attendType === AttendType.NORMAL || score.attendType === AttendType.LIVE)
    ) {
      if (score.finalScore !== previousScore) {
        currentRank += 1;
        previousScore = score.finalScore;
      }
      rank = currentRank;
    }

    return { ...score, rank };
  });

  const subjectLabel = getScoreSubjectLabel(
    session.subject,
    session.displaySubjectName,
    subjectLabelMap,
  );
  const examTypeLabel = EXAM_TYPE_LABEL[session.examType] ?? session.examType;
  const chunks = chunkArray(rankedScores, 50);
  const printDate = new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="min-h-screen bg-gray-100">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; margin: 0; padding: 0; }
          .print-root { background: white !important; padding: 0 !important; }
          .print-sheet {
            box-shadow: none !important;
            border-radius: 0 !important;
            margin: 0 !important;
          }
          .page-break { page-break-before: always; }
          @page { size: A4; margin: 12mm 10mm; }
        }
      `}</style>

      <div className="no-print flex items-center justify-between gap-4 border-b bg-white px-6 py-4 shadow-sm">
        <Link
          href={`/admin/scores/sessions/${sessionId}`}
          className="inline-flex items-center gap-2 rounded-full border border-ink/20 px-4 py-2 text-sm font-semibold text-slate transition hover:border-ink/40 hover:text-ink"
        >
          성적 상세로 돌아가기
        </Link>
        <span className="text-sm text-slate">
          {session.period.name} &middot; {subjectLabel} &middot; {formatDate(session.examDate)}
        </span>
        <ScorePrintButton />
      </div>

      <div className="print-root p-8">
        {chunks.map((chunk, chunkIndex) => (
          <div
            key={chunkIndex}
            className={`print-sheet mx-auto mb-8 w-full max-w-4xl rounded-[12px] bg-white px-10 py-8 shadow-xl ${
              chunkIndex > 0 ? "page-break" : ""
            }`}
            style={{
              fontFamily: "'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif",
            }}
          >
            <div className="mb-6 border-b-2 border-ink pb-5 text-center">
              <div className="text-xl font-bold tracking-tight text-ink">학원명 미설정</div>
              <div className="mt-1 text-lg font-semibold text-ink">{subjectLabel} 성적표</div>
              <div className="mt-1 text-sm text-slate">
                {session.period.name} &nbsp;|&nbsp; {examTypeLabel} &nbsp;|&nbsp; {formatDate(session.examDate)} &nbsp;|&nbsp; 총 {rankedScores.length}명
                {chunks.length > 1 && (
                  <span className="ml-2 text-xs text-slate/60">
                    ({chunkIndex + 1}/{chunks.length} 페이지)
                  </span>
                )}
              </div>
            </div>

            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-ink text-white">
                  <th className="border border-ink/20 px-3 py-2 text-center text-xs font-semibold tracking-wide">순위</th>
                  <th className="border border-ink/20 px-3 py-2 text-left text-xs font-semibold tracking-wide">학번</th>
                  <th className="border border-ink/20 px-3 py-2 text-left text-xs font-semibold tracking-wide">이름</th>
                  <th className="border border-ink/20 px-3 py-2 text-right text-xs font-semibold tracking-wide">원점수</th>
                  <th className="border border-ink/20 px-3 py-2 text-right text-xs font-semibold tracking-wide">OX 점수</th>
                  <th className="border border-ink/20 px-3 py-2 text-right text-xs font-semibold tracking-wide">최종점수</th>
                  <th className="border border-ink/20 px-3 py-2 text-center text-xs font-semibold tracking-wide">출결</th>
                </tr>
              </thead>
              <tbody>
                {chunk.map((row, rowIndex) => {
                  const isAbsent =
                    row.attendType === AttendType.ABSENT ||
                    row.attendType === AttendType.EXCUSED;

                  return (
                    <tr
                      key={row.id}
                      className={`${(chunkIndex * 50 + rowIndex) % 2 === 0 ? "bg-white" : "bg-gray-50/60"} ${
                        isAbsent ? "opacity-60" : ""
                      }`}
                    >
                      <td className="border border-ink/10 px-3 py-2 text-center font-mono font-semibold text-slate">
                        {row.rank !== null ? `${row.rank}등` : "-"}
                      </td>
                      <td className="border border-ink/10 px-3 py-2 font-mono text-xs text-slate">
                        {row.student.examNumber}
                      </td>
                      <td className="border border-ink/10 px-3 py-2 font-medium text-ink">
                        {row.student.name}
                      </td>
                      <td className="border border-ink/10 px-3 py-2 text-right font-mono text-slate">
                        {row.rawScore !== null && row.rawScore !== undefined ? row.rawScore : "-"}
                      </td>
                      <td className="border border-ink/10 px-3 py-2 text-right font-mono text-slate">
                        {row.oxScore !== null && row.oxScore !== undefined ? row.oxScore : "-"}
                      </td>
                      <td className="border border-ink/10 px-3 py-2 text-right font-mono font-bold text-ink">
                        {row.finalScore !== null && row.finalScore !== undefined ? row.finalScore : "-"}
                      </td>
                      <td className="border border-ink/10 px-3 py-2 text-center text-xs text-slate">
                        {ATTEND_TYPE_LABEL[row.attendType] ?? row.attendType}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="mt-4 flex items-center justify-between text-xs text-slate/60">
              <span>학원명 미설정 · 학원 주소는 관리자 설정을 확인하세요 · Tel: 연락처는 관리자 설정을 확인하세요</span>
              <span>인쇄일: {printDate}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
