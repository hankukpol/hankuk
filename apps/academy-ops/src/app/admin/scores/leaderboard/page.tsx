import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole, AttendType, Subject } from "@prisma/client";
import { applyAcademyScope, getAdminAcademyScope, resolveVisibleAcademyId } from "@/lib/academy-scope";
import { requireAdminContext } from "@/lib/auth";
import { EXAM_TYPE_LABEL } from "@/lib/constants";
import {
  buildExamSubjectLabelMap,
  buildFallbackExamSubjectCatalog,
  listExamSubjectCatalogForAcademy,
  type ExamSubjectCatalog,
} from "@/lib/exam-subjects/service";
import { getPrisma } from "@/lib/prisma";
import { applyScoreSessionAcademyScope } from "@/lib/scores/session-admin";
import {
  buildScoreSubjectFilterOptions,
  buildScoreSubjectFilterSourceItems,
} from "@/lib/scores/subject-filter";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type PageProps = {
  searchParams?: SearchParams;
};

function pickFirst(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

type SubjectLabelMap = Record<string, string>;

type SubjectFilterOption = {
  value: string;
  label: string;
};

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  return `${year}.${month}.${day}(${weekdays[date.getDay()]})`;
}

function rankBadgeClass(rank: number): string {
  if (rank === 1) return "bg-amber-400 text-white";
  if (rank === 2) return "bg-slate-300 text-white";
  if (rank === 3) return "bg-amber-600 text-white";
  return "bg-ink/5 text-slate";
}

function getSessionSubjectLabel(
  session: { subject: Subject; displaySubjectName: string | null },
  subjectLabelMap: SubjectLabelMap,
) {
  return session.displaySubjectName?.trim() || subjectLabelMap[session.subject] || session.subject;
}

function buildSubjectOptions(subjectCatalog: ExamSubjectCatalog): SubjectFilterOption[] {
  return [
    { value: "", label: "전체 과목" },
    ...buildScoreSubjectFilterOptions(buildScoreSubjectFilterSourceItems(subjectCatalog), {
      excludeValues: [Subject.CUMULATIVE],
    }),
  ];
}

export default async function ScoreLeaderboardPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.TEACHER);

  const rawSessionId = pickFirst(searchParams?.["examEventId"]);
  const rawSubject = pickFirst(searchParams?.["subject"]);

  const selectedSessionId: number | null =
    rawSessionId && /^\d+$/.test(rawSessionId) ? Number.parseInt(rawSessionId, 10) : null;

  const academyScope = await getAdminAcademyScope();
  const academyId = resolveVisibleAcademyId(academyScope);
  const prisma = getPrisma();
  const subjectCatalog =
    academyId === null
      ? buildFallbackExamSubjectCatalog()
      : await listExamSubjectCatalogForAcademy(academyId, { includeInactive: true });
  const subjectLabelMap = buildExamSubjectLabelMap(subjectCatalog);
  const subjectOptions = buildSubjectOptions(subjectCatalog);
  const selectedSubject: Subject | null =
    rawSubject && subjectOptions.some((option) => option.value === rawSubject) ? (rawSubject as Subject) : null;

  const recentSessions = await prisma.examSession.findMany({
    where: applyScoreSessionAcademyScope({ isCancelled: false }, academyId),
    orderBy: [{ examDate: "desc" }, { id: "desc" }],
    take: 10,
    select: {
      id: true,
      examType: true,
      week: true,
      subject: true,
      displaySubjectName: true,
      examDate: true,
      period: { select: { name: true, isActive: true } },
    },
  });

  let targetSessionId: number | null = selectedSessionId;
  if (targetSessionId === null && recentSessions.length > 0) {
    const sessionsWithScores = await prisma.examSession.findMany({
      where: applyScoreSessionAcademyScope(
        {
          isCancelled: false,
          scores: { some: {} },
        },
        academyId,
      ),
      orderBy: [{ examDate: "desc" }, { id: "desc" }],
      take: 1,
      select: { id: true },
    });
    targetSessionId = sessionsWithScores[0]?.id ?? recentSessions[0]?.id ?? null;
  }

  const targetSession = targetSessionId
    ? await prisma.examSession.findFirst({
        where: applyScoreSessionAcademyScope({ id: targetSessionId }, academyId),
        select: {
          id: true,
          examType: true,
          week: true,
          subject: true,
          displaySubjectName: true,
          examDate: true,
          period: { select: { name: true, isActive: true } },
        },
      })
    : null;

  type ScoreRow = {
    examNumber: string;
    finalScore: number | null;
    attendType: AttendType;
  };

  const rawScores: ScoreRow[] =
    targetSessionId !== null
      ? await prisma.score.findMany({
          where: {
            sessionId: targetSessionId,
            attendType: { in: [AttendType.NORMAL, AttendType.LIVE] },
          },
          select: {
            examNumber: true,
            finalScore: true,
            attendType: true,
          },
          orderBy: [{ finalScore: "desc" }, { examNumber: "asc" }],
        })
      : [];

  const filteredDropdownSessions = selectedSubject
    ? recentSessions.filter((session) => session.subject === selectedSubject)
    : recentSessions;

  const studentNumbers = rawScores.map((score) => score.examNumber);
  const students =
    studentNumbers.length > 0
      ? await prisma.student.findMany({
          where: applyAcademyScope(
            {
              examNumber: { in: studentNumbers },
            },
            academyId,
          ),
          select: {
            examNumber: true,
            name: true,
            phone: true,
            className: true,
            examType: true,
            courseEnrollments: {
              where: { status: "ACTIVE" },
              select: {
                cohort: { select: { name: true } },
              },
              take: 1,
              orderBy: { createdAt: "desc" },
            },
          },
        })
      : [];

  const studentMap = new Map(students.map((student) => [student.examNumber, student]));

  type LeaderboardEntry = {
    rank: number;
    examNumber: string;
    name: string;
    mobile: string | null;
    cohortName: string | null;
    className: string | null;
    finalScore: number | null;
    attendType: AttendType;
  };

  const sorted = [...rawScores].sort((a, b) => {
    if (a.finalScore === null && b.finalScore === null) return 0;
    if (a.finalScore === null) return 1;
    if (b.finalScore === null) return -1;
    return b.finalScore - a.finalScore;
  });

  let currentRank = 1;
  const leaderboard: LeaderboardEntry[] = sorted.map((score, index) => {
    if (index > 0) {
      const previous = sorted[index - 1];
      if (score.finalScore !== previous.finalScore) {
        currentRank = index + 1;
      }
    }

    const student = studentMap.get(score.examNumber);
    return {
      rank: currentRank,
      examNumber: score.examNumber,
      name: student?.name ?? score.examNumber,
      mobile: student?.phone ?? null,
      cohortName: student?.courseEnrollments[0]?.cohort?.name ?? null,
      className: student?.className ?? null,
      finalScore: score.finalScore,
      attendType: score.attendType,
    };
  });

  const validScores = leaderboard.map((row) => row.finalScore).filter((value): value is number => value !== null);
  const avgScore =
    validScores.length > 0
      ? Math.round((validScores.reduce((sum, value) => sum + value, 0) / validScores.length) * 10) / 10
      : null;
  const maxScore = validScores.length > 0 ? Math.max(...validScores) : null;
  const minScore = validScores.length > 0 ? Math.min(...validScores) : null;

  const sessionSubjectLabel =
    targetSession ? getSessionSubjectLabel(targetSession, subjectLabelMap) : "";

  if (!targetSession && targetSessionId !== null) {
    notFound();
  }

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        성적 순위
      </div>
      <h1 className="mt-5 text-3xl font-semibold text-ink">성적 리더보드</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        현재 지점의 회차별 성적 순위를 확인합니다. 과목 필터로 특정 과목만 골라서 순위를 볼 수 있습니다.
      </p>
      <div className="mt-4">
        <Link
          href="/admin/scores/percentile"
          className="inline-flex items-center rounded-full border border-ink/10 px-3 py-1.5 text-xs font-semibold text-slate transition hover:border-ember/30 hover:text-ember"
        >
          백분위 분석으로 이동
        </Link>
      </div>

      <div className="mt-8 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate">과목 필터</p>
        <div className="flex flex-wrap gap-2">
          {subjectOptions.map((option) => {
            const isActive = (selectedSubject ?? "") === option.value;
            const href =
              option.value === ""
                ? "/admin/scores/leaderboard"
                : `/admin/scores/leaderboard?subject=${option.value}`;
            return (
              <Link
                key={option.value}
                href={href}
                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  isActive
                    ? "border-ember/30 bg-ember/10 text-ember"
                    : "border-ink/10 bg-white text-slate hover:border-ember/20 hover:text-ember"
                }`}
              >
                {option.label}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="mt-6">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate">
          최근 회차 선택 (최대 10개)
        </p>
        {(selectedSubject ? filteredDropdownSessions : recentSessions).length === 0 ? (
          <p className="text-sm text-slate">
            {selectedSubject
              ? `${subjectLabelMap[selectedSubject] ?? selectedSubject} 과목의 회차가 없습니다.`
              : "등록된 회차가 없습니다."}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {(selectedSubject ? filteredDropdownSessions : recentSessions).map((session) => {
              const isActive = targetSessionId === session.id;
              const subjectLabel = getSessionSubjectLabel(session, subjectLabelMap);
              const examTypeLabel =
                EXAM_TYPE_LABEL[session.examType as keyof typeof EXAM_TYPE_LABEL] ?? session.examType;
              const label = `${formatDate(session.examDate)} ${session.period.name} ${examTypeLabel} ${subjectLabel}`;
              const params = new URLSearchParams();
              params.set("examEventId", String(session.id));
              if (selectedSubject) params.set("subject", selectedSubject);

              return (
                <Link
                  key={session.id}
                  href={`/admin/scores/leaderboard?${params.toString()}`}
                  className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    isActive
                      ? "border-forest/30 bg-forest/10 text-forest"
                      : "border-ink/10 bg-white text-slate hover:border-forest/20 hover:text-forest"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {targetSession ? (
        <>
          <section className="mt-8">
            <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate">현재 선택 회차</p>
                  <p className="mt-2 text-xl font-semibold text-ink">
                    {targetSession.period.name} ·{" "}
                    {EXAM_TYPE_LABEL[targetSession.examType as keyof typeof EXAM_TYPE_LABEL] ??
                      targetSession.examType}{" "}
                    {sessionSubjectLabel}
                  </p>
                  <p className="mt-1 text-sm text-slate">
                    {formatDate(targetSession.examDate)} · {targetSession.week}주차
                    {targetSession.period.isActive && (
                      <span className="ml-2 rounded-full bg-forest/10 px-1.5 py-0.5 text-[10px] font-semibold text-forest">
                        현재 기수
                      </span>
                    )}
                  </p>
                </div>
                <Link
                  href={`/admin/scores/sessions/${targetSession.id}`}
                  className="inline-flex items-center rounded-full border border-ink/20 px-4 py-2 text-xs font-semibold text-slate transition hover:border-ember/30 hover:text-ember"
                >
                  회차 상세
                </Link>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-4">
                <div className="rounded-[20px] border border-ink/5 bg-mist p-4">
                  <p className="text-xs text-slate">응시 인원</p>
                  <p className="mt-2 text-2xl font-semibold text-ink">{leaderboard.length}명</p>
                </div>
                <div className="rounded-[20px] border border-ink/5 bg-mist p-4">
                  <p className="text-xs text-slate">평균 점수</p>
                  <p className="mt-2 text-2xl font-semibold text-ink">{avgScore !== null ? `${avgScore}점` : "-"}</p>
                </div>
                <div className="rounded-[20px] border border-forest/10 bg-forest/5 p-4">
                  <p className="text-xs text-forest">최고 점수</p>
                  <p className="mt-2 text-2xl font-semibold text-forest">{maxScore !== null ? `${maxScore}점` : "-"}</p>
                </div>
                <div className="rounded-[20px] border border-ember/10 bg-ember/5 p-4">
                  <p className="text-xs text-ember">최저 점수</p>
                  <p className="mt-2 text-2xl font-semibold text-ember">{minScore !== null ? `${minScore}점` : "-"}</p>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-8">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate">성적 순위</h2>
              <span className="text-xs text-slate">총 {leaderboard.length}명 · {sessionSubjectLabel}</span>
            </div>

            {leaderboard.length === 0 ? (
              <div className="rounded-[28px] border border-dashed border-ink/10 p-10 text-center text-sm text-slate">
                아직 입력된 성적 데이터가 없습니다.
              </div>
            ) : (
              <div className="rounded-[28px] border border-ink/10 bg-white shadow-panel">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead>
                      <tr className="border-b border-ink/10">
                        <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                          순위
                        </th>
                        <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                          학번
                        </th>
                        <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                          이름
                        </th>
                        <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                          소속
                        </th>
                        <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                          점수
                        </th>
                        <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                          응시 유형
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink/5">
                      {leaderboard.map((entry) => {
                        const isTopThree = entry.rank <= 3;
                        return (
                          <tr
                            key={entry.examNumber}
                            className={`transition ${
                              isTopThree ? "bg-amber-50/40 hover:bg-amber-50/80" : "hover:bg-mist/60"
                            }`}
                          >
                            <td className="px-6 py-3">
                              <span
                                className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${rankBadgeClass(entry.rank)}`}
                              >
                                {entry.rank}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-mono text-slate">{entry.examNumber}</td>
                            <td className="px-4 py-3">
                              <Link
                                href={`/admin/students/${entry.examNumber}`}
                                className="font-semibold text-ink transition hover:text-ember hover:underline"
                              >
                                {entry.name}
                              </Link>
                            </td>
                            <td className="px-4 py-3 text-slate">
                              {entry.cohortName ? (
                                <span className="inline-flex items-center rounded-full border border-ink/10 bg-mist px-2.5 py-0.5 text-xs font-semibold text-ink">
                                  {entry.cohortName}
                                </span>
                              ) : entry.className ? (
                                <span className="text-xs">{entry.className}</span>
                              ) : (
                                <span className="text-ink/25">-</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {entry.finalScore !== null ? (
                                <span
                                  className={`font-mono text-base font-bold ${
                                    entry.rank === 1
                                      ? "text-amber-500"
                                      : entry.rank === 2
                                        ? "text-slate-500"
                                        : entry.rank === 3
                                          ? "text-amber-700"
                                          : "text-ink"
                                  }`}
                                >
                                  {entry.finalScore}점
                                </span>
                              ) : (
                                <span className="text-ink/25">미입력</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {entry.attendType === AttendType.LIVE ? (
                                <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-600">
                                  라이브
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded-full border border-forest/20 bg-forest/5 px-2 py-0.5 text-[10px] font-semibold text-forest">
                                  현장
                                </span>
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
        </>
      ) : (
        <section className="mt-10">
          <div className="rounded-[28px] border border-dashed border-ink/10 p-16 text-center">
            <p className="text-sm text-slate">회차를 선택하면 성적 순위가 표시됩니다.</p>
          </div>
        </section>
      )}
    </div>
  );
}

