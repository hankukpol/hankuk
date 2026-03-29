import Link from "next/link";
import { AdminRole, AttendType } from "@prisma/client";
import { applyAcademyScope } from "@/lib/academy-scope";
import { requireAdminContext } from "@/lib/auth";
import { EXAM_TYPE_LABEL } from "@/lib/constants";
import {
  buildExamSubjectLabelMap,
  buildFallbackExamSubjectCatalog,
  listExamSubjectCatalogForAcademy,
} from "@/lib/exam-subjects/service";
import { getPrisma } from "@/lib/prisma";
import { PrintButton } from "./print-button";
import {
  applyScoreSessionAcademyScope,
  resolveVisibleScoreSessionAcademyId,
} from "@/lib/scores/session-admin";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function formatDateKR(date: Date) {
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

function toLocalDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`);
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

export default async function DailySummaryPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.TEACHER);

  const prisma = getPrisma();
  const academyId = await resolveVisibleScoreSessionAcademyId();
  const params = searchParams ? await searchParams : {};
  const dateParam = Array.isArray(params.date) ? params.date[0] : params.date;

  const baseDate = dateParam ? toLocalDate(dateParam) : new Date();
  const selectedDate = Number.isNaN(baseDate.getTime()) ? new Date() : baseDate;

  const dayStart = new Date(selectedDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(selectedDate);
  dayEnd.setHours(23, 59, 59, 999);

  const sessionWhere = applyScoreSessionAcademyScope(
    {
      examDate: { gte: dayStart, lte: dayEnd },
      isCancelled: false,
    },
    academyId,
  );

  const scoreWhere = applyAcademyScope(
    {
      session: {
        examDate: { gte: dayStart, lte: dayEnd },
        isCancelled: false,
        ...(academyId === null ? {} : { period: { academyId } }),
      },
    },
    academyId,
  );

  const studentWhere = applyAcademyScope({ isActive: true }, academyId);
  const enrollmentWhere =
    academyId === null
      ? { period: { isActive: true } }
      : { period: { isActive: true, academyId } };

  const [subjectCatalog, sessions, totalScoreEntries, studentCount, enrollmentCount] = await Promise.all([
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
        week: true,
        period: {
          select: {
            name: true,
            isActive: true,
          },
        },
        scores: {
          where: applyAcademyScope({}, academyId),
          select: {
            finalScore: true,
            rawScore: true,
            attendType: true,
          },
        },
      },
      orderBy: [{ examDate: "asc" }, { id: "asc" }],
    }),
    prisma.score.count({ where: scoreWhere }),
    prisma.student.count({ where: studentWhere }),
    prisma.periodEnrollment.count({ where: enrollmentWhere }),
  ]);
  const subjectLabelMap = buildExamSubjectLabelMap(subjectCatalog);

  const validAttendTypes: AttendType[] = [AttendType.NORMAL, AttendType.LIVE];
  const absentTypes: AttendType[] = [AttendType.ABSENT, AttendType.EXCUSED];

  const rows = sessions.map((session) => {
    const totalStudents = session.scores.length;
    const presentScores = session.scores.filter((score) => validAttendTypes.includes(score.attendType));
    const absentCount = session.scores.filter((score) => absentTypes.includes(score.attendType)).length;
    const completedCount = session.scores.filter(
      (score) =>
        score.finalScore !== null ||
        score.rawScore !== null ||
        absentTypes.includes(score.attendType),
    ).length;
    const scoreValues = presentScores
      .map((score) => score.finalScore ?? score.rawScore)
      .filter((value): value is number => value !== null && value !== undefined);
    const averageScore =
      scoreValues.length > 0
        ? Math.round((scoreValues.reduce((sum, value) => sum + value, 0) / scoreValues.length) * 10) / 10
        : null;
    const completionRate =
      totalStudents > 0 ? Math.round((completedCount / totalStudents) * 1000) / 10 : 100;

    return {
      id: session.id,
      examType: session.examType,
      subject: getSessionSubjectLabel(session.subject, subjectLabelMap, session.displaySubjectName),
      examDate: session.examDate,
      week: session.week,
      periodName: session.period.name,
      periodIsActive: session.period.isActive,
      totalStudents,
      presentCount: presentScores.length,
      absentCount,
      averageScore,
      completionRate,
      status: statusLabel(completionRate),
    };
  });

  const totalSessions = rows.length;
  const totalPresent = rows.reduce((sum, row) => sum + row.presentCount, 0);
  const totalAbsent = rows.reduce((sum, row) => sum + row.absentCount, 0);
  const averageCompletion =
    rows.length > 0 ? Math.round((rows.reduce((sum, row) => sum + row.completionRate, 0) / rows.length) * 10) / 10 : 0;

  return (
    <div className="p-8 sm:p-10">
      <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            일일 요약
          </div>
          <h1 className="mt-5 text-3xl font-semibold text-ink">아침모의고사 일일 요약</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            선택한 날짜의 아침모의고사 회차별 성적 입력과 출결 현황을 정리합니다.
          </p>
        </div>
        <PrintButton />
      </div>

      <form method="get" className="mt-8 print:hidden">
        <div className="flex flex-wrap items-end gap-3 rounded-[28px] border border-ink/10 bg-mist p-6">
          <div>
            <label htmlFor="date" className="mb-2 block text-sm font-medium text-ink">
              날짜 선택
            </label>
            <input
              type="date"
              id="date"
              name="date"
              defaultValue={`${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`}
              className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            />
          </div>
          <button
            type="submit"
            className="inline-flex items-center rounded-full bg-ink px-6 py-3 text-sm font-semibold text-white transition hover:bg-forest"
          >
            조회
          </button>
        </div>
      </form>

      <div className="mt-8 space-y-8">
        <div className="hidden print:block">
          <h2 className="text-2xl font-bold text-ink">아침모의고사 일일 요약 / {formatDateKR(selectedDate)}</h2>
          <p className="mt-1 text-sm text-slate">현재 지점 기준 출력물</p>
          <hr className="mt-4 border-ink/10" />
        </div>

        <div className="flex items-center gap-3 print:hidden">
          <span className="rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-semibold text-ink">
            {formatDateKR(selectedDate)}
          </span>
          {sessions.length === 0 && <span className="text-sm text-slate">선택한 날짜에 등록된 회차가 없습니다.</span>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate">회차 수</p>
            <p className="mt-3 text-3xl font-bold text-ink">{totalSessions}</p>
            <p className="mt-1 text-xs text-slate">선택한 날짜 기준</p>
          </div>
          <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate">성적 건수</p>
            <p className="mt-3 text-3xl font-bold text-forest">{totalScoreEntries}</p>
            <p className="mt-1 text-xs text-slate">현재 지점 성적만 집계</p>
          </div>
          <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate">활성 학생 수</p>
            <p className="mt-3 text-3xl font-bold text-ink">{studentCount}</p>
            <p className="mt-1 text-xs text-slate">현재 지점 기준</p>
          </div>
          <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate">활성 수강 등록</p>
            <p className="mt-3 text-3xl font-bold text-ember">{enrollmentCount}</p>
            <p className="mt-1 text-xs text-slate">활성 기간만 포함</p>
          </div>
        </div>

        {sessions.length > 0 && (
          <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-ink">일일 평균 진행률</h2>
                <p className="mt-1 text-xs text-slate">선택한 날짜 전체 회차의 입력 상태를 한 번에 확인합니다.</p>
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
            <div className="mt-2 flex items-center justify-between text-xs text-slate">
              <span>0%</span>
              <span className="font-semibold text-ink">{averageCompletion}%</span>
              <span>100%</span>
            </div>
          </div>
        )}

        {sessions.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/10 p-10 text-center text-slate">
            선택한 날짜에 등록된 아침모의고사 회차가 없습니다. 다른 날짜를 선택해 주세요.
          </div>
        ) : (
          <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white shadow-panel">
            <div className="border-b border-ink/10 px-6 py-4">
              <h2 className="text-base font-semibold text-ink">회차별 상세</h2>
              <p className="mt-1 text-xs text-slate">출석과 결석, 평균 점수, 입력 진행률을 함께 봅니다.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-mist">
                    <th className="px-4 py-3 text-left font-semibold text-ink/60">시간</th>
                    <th className="px-4 py-3 text-left font-semibold text-ink/60">기수</th>
                    <th className="px-4 py-3 text-left font-semibold text-ink/60">회차</th>
                    <th className="px-4 py-3 text-right font-semibold text-ink/60">대상</th>
                    <th className="px-4 py-3 text-right font-semibold text-ink/60">출석/결석</th>
                    <th className="px-4 py-3 text-right font-semibold text-ink/60">평균 점수</th>
                    <th className="px-4 py-3 text-right font-semibold text-ink/60">완료율</th>
                    <th className="px-4 py-3 text-center font-semibold text-ink/60">상태</th>
                    <th className="px-4 py-3 font-semibold text-ink/60" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {rows.map((row) => {
                    const timeLabel = row.examDate.toLocaleTimeString("ko-KR", {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                      timeZone: "Asia/Seoul",
                    });

                    return (
                      <tr key={row.id} className="hover:bg-mist/60">
                        <td className="px-4 py-3 font-mono text-slate">{timeLabel}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center rounded-full border border-ink/10 bg-mist px-2.5 py-0.5 text-xs font-semibold text-ink">
                            {row.periodName}
                            {row.periodIsActive && <span className="ml-1 text-forest">· 현재</span>}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-ink">
                          {EXAM_TYPE_LABEL[row.examType as keyof typeof EXAM_TYPE_LABEL] ?? row.examType} / {row.subject}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-ink">{row.totalStudents}</td>
                        <td className="px-4 py-3 text-right font-mono text-forest">
                          {row.presentCount} / {row.absentCount}
                        </td>
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
                            className="inline-flex items-center rounded-full border border-forest/20 bg-forest/5 px-3 py-1 text-xs font-semibold text-forest transition hover:bg-forest/10 print:hidden"
                          >
                            조회/입력
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {sessions.length > 0 && (
          <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
            <h2 className="text-base font-semibold text-ink">합계 요약</h2>
            <div className="mt-4 flex flex-wrap gap-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate">총 출석</p>
                <p className="mt-1 text-2xl font-bold text-forest">{totalPresent}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate">총 결석</p>
                <p className="mt-1 text-2xl font-bold text-red-600">{totalAbsent}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate">평균 완료율</p>
                <p className="mt-1 text-2xl font-bold text-ink">{averageCompletion}%</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


