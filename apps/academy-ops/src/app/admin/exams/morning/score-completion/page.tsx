import Link from "next/link";
import { AdminRole, AttendType } from "@prisma/client";
import { applyAcademyScope } from "@/lib/academy-scope";
import { requireAdminContext } from "@/lib/auth";
import { buildExamSubjectLabelMap, buildFallbackExamSubjectCatalog, listExamSubjectCatalogForAcademy } from "@/lib/exam-subjects/service";
import { getPrisma } from "@/lib/prisma";
import {
  applyScoreSessionAcademyScope,
  resolveVisibleScoreSessionAcademyId,
} from "@/lib/scores/session-admin";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const DAY_OPTIONS = [7, 14, 30] as const;
type DayOption = (typeof DAY_OPTIONS)[number];

function formatDateKR(date: Date) {
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

function statusLabel(rate: number) {
  if (rate >= 100) return "완료";
  if (rate >= 80) return "진행 중";
  return "미완료";
}

function statusClass(rate: number) {
  if (rate >= 100) return "bg-forest/10 text-forest";
  if (rate >= 80) return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
}

function getSessionSubjectLabel(
  subject: string,
  subjectLabelMap: Record<string, string>,
  displaySubjectName?: string | null,
) {
  return displaySubjectName?.trim() ?? subjectLabelMap[subject] ?? subject;
}

function isPresentAttendType(type: AttendType) {
  return type === AttendType.NORMAL || type === AttendType.LIVE;
}

export default async function ScoreCompletionPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.TEACHER);

  const prisma = getPrisma();
  const academyId = await resolveVisibleScoreSessionAcademyId();
  const params = searchParams ? await searchParams : {};
  const dayParam = Array.isArray(params.days) ? params.days[0] : params.days;
  const days: DayOption = DAY_OPTIONS.includes(Number(dayParam) as DayOption)
    ? (Number(dayParam) as DayOption)
    : 14;

  const now = new Date();
  const rangeStart = new Date(now);
  rangeStart.setDate(rangeStart.getDate() - days);
  rangeStart.setHours(0, 0, 0, 0);

  const sessionWhere = applyScoreSessionAcademyScope(
    {
      examDate: { gte: rangeStart, lte: now },
      isCancelled: false,
    },
    academyId,
  );

  const [subjectCatalog, sessions, totalScoreEntries] = await Promise.all([
    academyId === null
      ? Promise.resolve(buildFallbackExamSubjectCatalog())
      : listExamSubjectCatalogForAcademy(academyId, { includeInactive: true }),
    prisma.examSession.findMany({
      where: sessionWhere,
      select: {
        id: true,
        examType: true,
        subject: true,
        displaySubjectName: true,
        examDate: true,
        period: {
          select: {
            name: true,
            isActive: true,
          },
        },
        scores: {
          where: applyAcademyScope({}, academyId),
          select: {
            examNumber: true,
            finalScore: true,
            rawScore: true,
            attendType: true,
          },
        },
      },
      orderBy: [{ examDate: "asc" }, { id: "asc" }],
    }),
    prisma.score.count({
      where: applyAcademyScope(
        {
          attendType: { in: [AttendType.NORMAL, AttendType.LIVE] },
          session: {
            examDate: { gte: rangeStart, lte: now },
            isCancelled: false,
            ...(academyId === null ? {} : { period: { academyId } }),
          },
        },
        academyId,
      ),
    }),
  ]);
  const subjectLabelMap = buildExamSubjectLabelMap(subjectCatalog);

  const rows = sessions.map((session) => {
    const totalStudents = session.scores.length;
    const completedStudents = session.scores.filter(
      (score) =>
        score.finalScore !== null ||
        score.rawScore !== null ||
        score.attendType === AttendType.ABSENT ||
        score.attendType === AttendType.EXCUSED,
    ).length;
    const presentScores = session.scores.filter((score) => isPresentAttendType(score.attendType));
    const scoreValues = presentScores
      .map((score) => score.finalScore ?? score.rawScore)
      .filter((value): value is number => value !== null && value !== undefined);
    const averageScore =
      scoreValues.length > 0
        ? Math.round((scoreValues.reduce((sum, value) => sum + value, 0) / scoreValues.length) * 10) / 10
        : null;
    const completionRate =
      totalStudents > 0 ? Math.round((completedStudents / totalStudents) * 1000) / 10 : 100;

    return {
      id: session.id,
      examType: session.examType,
      subject: getSessionSubjectLabel(session.subject, subjectLabelMap, session.displaySubjectName),
      examDate: session.examDate,
      periodName: session.period.name,
      periodIsActive: session.period.isActive,
      totalStudents,
      completedStudents,
      averageScore,
      completionRate,
      status: statusLabel(completionRate),
    };
  });

  rows.sort((a, b) => {
    if (a.completionRate !== b.completionRate) {
      return a.completionRate - b.completionRate;
    }
    return a.examDate.getTime() - b.examDate.getTime();
  });

  const totalSessions = rows.length;
  const completeCount = rows.filter((row) => row.completionRate >= 100).length;
  const incompleteCount = rows.filter((row) => row.completionRate < 80).length;
  const averageCompletion =
    rows.length > 0 ? Math.round((rows.reduce((sum, row) => sum + row.completionRate, 0) / rows.length) * 10) / 10 : 0;

  return (
    <div className="p-8 sm:p-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            성적 입력 현황
          </div>
          <h1 className="mt-5 text-3xl font-semibold text-ink">성적 입력 완료 현황</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            현재 지점의 아침모의고사 회차별 성적 입력 진행률을 확인합니다.
          </p>
        </div>
        <Link
          href="/admin/exams/morning/overview"
          className="inline-flex items-center rounded-full border border-ink/10 px-3 py-1.5 text-xs font-semibold text-slate transition hover:border-forest/30 hover:text-forest"
        >
          개요로 이동
        </Link>
      </div>

      <form method="get" className="mt-8">
        <div className="flex flex-wrap items-end gap-3 rounded-[28px] border border-ink/10 bg-mist p-6">
          <div>
            <p className="mb-2 text-sm font-medium text-ink">조회 기간</p>
            <div className="flex flex-wrap gap-2">
              {DAY_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="submit"
                  name="days"
                  value={String(option)}
                  className={`rounded-full border px-5 py-2.5 text-sm font-semibold transition ${
                    days === option
                      ? "border-forest bg-forest text-white"
                      : "border-ink/20 bg-white text-ink hover:bg-mist"
                  }`}
                >
                  최근 {option}일
                </button>
              ))}
            </div>
          </div>
        </div>
      </form>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">회차 수</p>
          <p className="mt-3 text-3xl font-bold text-ink">{totalSessions}</p>
          <p className="mt-1 text-xs text-slate">{formatDateKR(rangeStart)} ~ {formatDateKR(now)}</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">완료 회차</p>
          <p className="mt-3 text-3xl font-bold text-forest">{completeCount}</p>
          <p className="mt-1 text-xs text-slate">100% 입력 완료</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">미완료 회차</p>
          <p className="mt-3 text-3xl font-bold text-red-600">{incompleteCount}</p>
          <p className="mt-1 text-xs text-slate">완료율 80% 미만</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">입력 성적 건수</p>
          <p className="mt-3 text-3xl font-bold text-ember">{totalScoreEntries}</p>
          <p className="mt-1 text-xs text-slate">현재 지점 성적만 집계</p>
        </div>
      </div>

      <div className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-ink">성적 입력 진행률</h2>
            <p className="mt-1 text-xs text-slate">입력이 필요한 회차를 우선 확인할 수 있습니다.</p>
          </div>
          <div className="text-sm text-slate">
            평균 완료율 <span className="font-semibold text-ink">{averageCompletion}%</span>
          </div>
        </div>
        <div className="mt-4 h-4 w-full overflow-hidden rounded-full bg-ink/10">
          <div
            className={`h-full rounded-full ${averageCompletion >= 100 ? "bg-forest" : averageCompletion >= 80 ? "bg-amber-400" : "bg-red-400"}`}
            style={{ width: `${Math.min(averageCompletion, 100)}%` }}
          />
        </div>
      </div>

      <div className="mt-8 overflow-hidden rounded-[28px] border border-ink/10 bg-white shadow-panel">
        <div className="border-b border-ink/10 px-6 py-4">
          <h2 className="text-base font-semibold text-ink">회차별 입력 현황</h2>
          <p className="text-xs text-slate">현재 지점의 최근 회차를 기준으로 정리합니다.</p>
        </div>
        {rows.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate">
            선택한 기간에 등록된 아침모의고사 회차가 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist">
                  <th className="px-4 py-3 text-left font-semibold text-ink/60">일자</th>
                  <th className="px-4 py-3 text-left font-semibold text-ink/60">기수</th>
                  <th className="px-4 py-3 text-left font-semibold text-ink/60">회차</th>
                  <th className="px-4 py-3 text-right font-semibold text-ink/60">대상</th>
                  <th className="px-4 py-3 text-right font-semibold text-ink/60">완료</th>
                  <th className="px-4 py-3 text-right font-semibold text-ink/60">평균 점수</th>
                  <th className="px-4 py-3 text-right font-semibold text-ink/60">완료율</th>
                  <th className="px-4 py-3 text-center font-semibold text-ink/60">상태</th>
                  <th className="px-4 py-3 font-semibold text-ink/60" />
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-mist/60">
                    <td className="px-4 py-3 font-mono text-slate">{formatDateKR(row.examDate)}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full border border-ink/10 bg-mist px-2.5 py-0.5 text-xs font-semibold text-ink">
                        {row.periodName}
                        {row.periodIsActive && <span className="ml-1 text-forest">· 현재</span>}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-ink">{row.subject}</td>
                    <td className="px-4 py-3 text-right font-mono text-ink">{row.totalStudents}</td>
                    <td className="px-4 py-3 text-right font-mono text-ink">{row.completedStudents}</td>
                    <td className="px-4 py-3 text-right font-mono text-ink">
                      {row.averageScore !== null ? `${row.averageScore}점` : "-"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-ink">{row.completionRate}%</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusClass(row.completionRate)}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/exams/morning/${row.id}`}
                        className="inline-flex items-center rounded-full border border-forest/20 bg-forest/5 px-3 py-1 text-xs font-semibold text-forest transition hover:bg-forest/10"
                      >
                        조회/입력
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}


