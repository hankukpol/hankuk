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
import {
  applyScoreSessionAcademyScope,
  resolveVisibleScoreSessionAcademyId,
} from "@/lib/scores/session-admin";

export const dynamic = "force-dynamic";

function formatDateKR(date: Date) {
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

function getStatusLabel(rate: number) {
  if (rate >= 100) return "완료";
  if (rate >= 80) return "진행 중";
  return "미완료";
}

function getStatusClass(rate: number) {
  if (rate >= 100) return "bg-forest/10 text-forest";
  if (rate >= 80) return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
}

function isPresentAttendType(type: AttendType) {
  return type === AttendType.NORMAL || type === AttendType.LIVE;
}

function getSessionSubjectLabel(
  subject: string,
  subjectLabelMap: Record<string, string>,
  displaySubjectName?: string | null,
) {
  return displaySubjectName?.trim() ?? subjectLabelMap[subject] ?? subject;
}

export default async function MorningOverviewPage() {
  await requireAdminContext(AdminRole.TEACHER);

  const prisma = getPrisma();
  const academyId = await resolveVisibleScoreSessionAcademyId();

  const now = new Date();
  const rangeStart = new Date(now);
  rangeStart.setDate(rangeStart.getDate() - 30);
  rangeStart.setHours(0, 0, 0, 0);

  const sessionWhere = applyScoreSessionAcademyScope(
    {
      examDate: { gte: rangeStart, lte: now },
      isCancelled: false,
    },
    academyId,
  );

  const scoreWhere = applyAcademyScope(
    {
      attendType: { in: [AttendType.NORMAL, AttendType.LIVE] },
      session: {
        examDate: { gte: rangeStart, lte: now },
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
      orderBy: [{ examDate: "desc" }, { id: "desc" }],
      take: 12,
    }),
    prisma.score.count({ where: scoreWhere }),
    prisma.student.count({ where: studentWhere }),
    prisma.periodEnrollment.count({ where: enrollmentWhere }),
  ]);
  const subjectLabelMap = buildExamSubjectLabelMap(subjectCatalog);

  const sessionRows = sessions.map((session) => {
    const totalStudents = session.scores.length;
    const processedStudents = session.scores.filter(
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
      totalStudents > 0 ? Math.round((processedStudents / totalStudents) * 1000) / 10 : 100;

    return {
      id: session.id,
      examType: session.examType,
      subject: getSessionSubjectLabel(session.subject, subjectLabelMap, session.displaySubjectName),
      examDate: session.examDate,
      periodName: session.period.name,
      periodIsActive: session.period.isActive,
      totalStudents,
      processedStudents,
      averageScore,
      completionRate,
      status: getStatusLabel(completionRate),
    };
  });

  const totalSessions = sessionRows.length;
  const completedSessions = sessionRows.filter((row) => row.completionRate >= 100).length;
  const incompleteSessions = sessionRows.filter((row) => row.completionRate < 80).length;
  const averageCompletion =
    sessionRows.length > 0
      ? Math.round((sessionRows.reduce((sum, row) => sum + row.completionRate, 0) / sessionRows.length) * 10) / 10
      : 0;

  return (
    <div className="p-8 sm:p-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
            아침모의고사 개요
          </div>
          <h1 className="mt-5 text-3xl font-semibold text-ink">아침모의고사 운영 개요</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            현재 지점 기준으로 최근 30일의 회차, 성적 입력, 학생, 수강 등록 현황을 한 번에 요약합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/exams/morning/score-completion"
            className="inline-flex items-center rounded-full border border-ink/10 px-3 py-1.5 text-xs font-semibold text-slate transition hover:border-forest/30 hover:text-forest"
          >
            성적 입력 현황
          </Link>
          <Link
            href="/admin/exams/morning/daily-summary"
            className="inline-flex items-center rounded-full border border-ink/10 px-3 py-1.5 text-xs font-semibold text-slate transition hover:border-forest/30 hover:text-forest"
          >
            일일 요약
          </Link>
          <Link
            href="/admin/exams/morning/weekly-bulletin"
            className="inline-flex items-center rounded-full border border-ink/10 px-3 py-1.5 text-xs font-semibold text-slate transition hover:border-forest/30 hover:text-forest"
          >
            주간 리포트
          </Link>
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">최근 30일 회차</p>
          <p className="mt-3 text-3xl font-bold text-ink">{totalSessions}</p>
          <p className="mt-1 text-xs text-slate">{formatDateKR(rangeStart)} ~ {formatDateKR(now)}</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">입력된 성적 수</p>
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

      <div className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-ink">회차 입력 진행률</h2>
            <p className="mt-1 text-xs text-slate">성적 입력이 끝나지 않은 회차를 우선 확인할 수 있습니다.</p>
          </div>
          <div className="text-sm text-slate">
            완료 <span className="font-semibold text-forest">{completedSessions}</span>건
            <span className="px-2">/</span>
            미완료 <span className="font-semibold text-red-600">{incompleteSessions}</span>건
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

      <div className="mt-8 overflow-hidden rounded-[28px] border border-ink/10 bg-white shadow-panel">
        <div className="border-b border-ink/10 px-6 py-4">
          <h2 className="text-base font-semibold text-ink">최근 회차 요약</h2>
          <p className="text-xs text-slate">현재 지점의 최신 12개 회차를 기준으로 정리합니다.</p>
        </div>
        {sessionRows.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate">
            최근 30일 동안 등록된 아침모의고사 회차가 없습니다.
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
                  <th className="px-4 py-3 text-right font-semibold text-ink/60">입력</th>
                  <th className="px-4 py-3 text-right font-semibold text-ink/60">완료율</th>
                  <th className="px-4 py-3 text-center font-semibold text-ink/60">상태</th>
                  <th className="px-4 py-3 font-semibold text-ink/60" />
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {sessionRows.map((row) => (
                  <tr key={row.id} className="hover:bg-mist/60">
                    <td className="px-4 py-3 font-mono text-slate">{formatDateKR(row.examDate)}</td>
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
                    <td className="px-4 py-3 text-right font-mono text-ink">{row.processedStudents}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-ink">{row.completionRate}%</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${getStatusClass(row.completionRate)}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/exams/morning/${row.id}`}
                        className="inline-flex items-center rounded-full border border-ember/20 bg-ember/5 px-3 py-1 text-xs font-semibold text-ember transition hover:bg-ember/10"
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


