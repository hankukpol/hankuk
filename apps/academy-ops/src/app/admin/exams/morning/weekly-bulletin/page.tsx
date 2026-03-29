import Link from "next/link";
import { AdminRole, AttendType } from "@prisma/client";
import { applyAcademyScope } from "@/lib/academy-scope";
import { requireAdminContext } from "@/lib/auth";
import { buildExamSubjectLabelMap, buildFallbackExamSubjectCatalog, listExamSubjectCatalogForAcademy } from "@/lib/exam-subjects/service";
import { getPrisma } from "@/lib/prisma";
import { PrintButton } from "./print-button";
import {
  applyScoreSessionAcademyScope,
  resolveVisibleScoreSessionAcademyId,
} from "@/lib/scores/session-admin";
import {
  buildScoreSubjectFilterSourceItems,
  buildScoreSubjectOrderMap,
} from "@/lib/scores/subject-filter";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getWeekStart(date: Date) {
  const result = new Date(date);
  const day = result.getDay();
  const diff = result.getDate() - day + (day === 0 ? -6 : 1);
  result.setDate(diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

function formatDateKR(date: Date) {
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

function isoDate(date: Date) {
  return date.toISOString().split("T")[0];
}

function isPresentAttendType(type: AttendType) {
  return type === AttendType.NORMAL || type === AttendType.LIVE;
}

function isAbsentAttendType(type: AttendType) {
  return type === AttendType.ABSENT || type === AttendType.EXCUSED;
}

function getSessionSubjectLabel(
  subject: string,
  subjectLabelMap: Record<string, string>,
  displaySubjectName?: string | null,
) {
  return displaySubjectName?.trim() ?? subjectLabelMap[subject] ?? subject;
}

export default async function WeeklyBulletinPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.TEACHER);

  const prisma = getPrisma();
  const academyId = await resolveVisibleScoreSessionAcademyId();
  const params = searchParams ? await searchParams : {};
  const weekParam = Array.isArray(params.weekStart) ? params.weekStart[0] : params.weekStart;

  let weekStartDate: Date;
  if (weekParam) {
    const parsed = new Date(`${weekParam}T00:00:00`);
    weekStartDate = Number.isNaN(parsed.getTime()) ? getWeekStart(new Date()) : parsed;
  } else {
    const latestSession = await prisma.examSession.findFirst({
      where: applyScoreSessionAcademyScope({ isCancelled: false }, academyId),
      orderBy: { examDate: "desc" },
      select: { examDate: true },
    });
    weekStartDate = latestSession ? getWeekStart(latestSession.examDate) : getWeekStart(new Date());
  }

  const weekEndDate = new Date(weekStartDate);
  weekEndDate.setDate(weekEndDate.getDate() + 6);
  weekEndDate.setHours(23, 59, 59, 999);

  const sessionWhere = applyScoreSessionAcademyScope(
    {
      examDate: { gte: weekStartDate, lte: weekEndDate },
      isCancelled: false,
    },
    academyId,
  );

  const scoreWhere = applyAcademyScope(
    {
      attendType: { in: [AttendType.NORMAL, AttendType.LIVE] },
      session: {
        examDate: { gte: weekStartDate, lte: weekEndDate },
        isCancelled: false,
        ...(academyId === null ? {} : { period: { academyId } }),
      },
    },
    academyId,
  );

  const enrollmentWhere =
    academyId === null
      ? { period: { isActive: true } }
      : { period: { isActive: true, academyId } };

  const [subjectCatalog, sessions, totalScoreEntries, activeEnrollmentCount] = await Promise.all([
    academyId === null
      ? Promise.resolve(buildFallbackExamSubjectCatalog())
      : listExamSubjectCatalogForAcademy(academyId, { includeInactive: true }),
    prisma.examSession.findMany({
      where: sessionWhere,
      select: {
        id: true,
        subject: true,
        displaySubjectName: true,
        examDate: true,
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
    prisma.score.count({ where: scoreWhere }),
    prisma.periodEnrollment.count({ where: enrollmentWhere }),
  ]);
  const subjectLabelMap = buildExamSubjectLabelMap(subjectCatalog);
  const subjectSourceItems = buildScoreSubjectFilterSourceItems(subjectCatalog);
  const subjectOrderMap = buildScoreSubjectOrderMap(subjectSourceItems);

  let totalPresent = 0;
  let totalAbsent = 0;
  const weeklyScorePairs: { examNumber: string; score: number }[] = [];
  const subjectMap = new Map<string, { label: string; displayOrder: number; scores: number[]; present: number; absent: number }>();

  for (const session of sessions) {
    const label = getSessionSubjectLabel(session.subject, subjectLabelMap, session.displaySubjectName);
    const subjectEntry = subjectMap.get(session.subject) ?? {
      label,
      displayOrder: subjectOrderMap.get(session.subject) ?? Number.MAX_SAFE_INTEGER,
      scores: [],
      present: 0,
      absent: 0,
    };

    for (const score of session.scores) {
      if (isPresentAttendType(score.attendType)) {
        totalPresent += 1;
        const value = score.finalScore ?? score.rawScore;
        if (value !== null && value !== undefined) {
          subjectEntry.scores.push(value);
          subjectEntry.present += 1;
          weeklyScorePairs.push({ examNumber: score.examNumber, score: value });
        }
      } else if (isAbsentAttendType(score.attendType)) {
        totalAbsent += 1;
        subjectEntry.absent += 1;
      }
    }

    subjectMap.set(session.subject, subjectEntry);
  }

  const subjectRows = [...subjectMap.entries()].map(([subject, data]) => {
    const average =
      data.scores.length > 0
        ? Math.round((data.scores.reduce((sum, value) => sum + value, 0) / data.scores.length) * 10) / 10
        : null;

    return {
      subject,
      label: data.label,
      displayOrder: data.displayOrder,
      average,
      present: data.present,
      absent: data.absent,
      total: data.scores.length,
    };
  });

  subjectRows.sort(
    (left, right) =>
      left.displayOrder - right.displayOrder || left.label.localeCompare(right.label, "ko-KR"),
  );

  const scoreValues = weeklyScorePairs.map((row) => row.score);
  const overallAvg =
    scoreValues.length > 0
      ? Math.round((scoreValues.reduce((sum, value) => sum + value, 0) / scoreValues.length) * 10) / 10
      : null;

  const scoreMap = new Map<string, number[]>();
  for (const pair of weeklyScorePairs) {
    const values = scoreMap.get(pair.examNumber) ?? [];
    values.push(pair.score);
    scoreMap.set(pair.examNumber, values);
  }

  const studentAverages = [...scoreMap.entries()]
    .map(([examNumber, values]) => ({
      examNumber,
      avg: Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10,
    }))
    .sort((a, b) => b.avg - a.avg);

  const topExamNumbers = studentAverages.slice(0, 5).map((student) => student.examNumber);
  const atRiskExamNumbers = studentAverages.filter((student) => student.avg < 60).map((student) => student.examNumber);
  const lookupExamNumbers = [...new Set([...topExamNumbers, ...atRiskExamNumbers])];

  const studentDetails =
    lookupExamNumbers.length > 0
      ? await prisma.student.findMany({
          where: applyAcademyScope({ examNumber: { in: lookupExamNumbers } }, academyId),
          select: {
            examNumber: true,
            name: true,
          },
        })
      : [];

  const studentNameMap = new Map(studentDetails.map((student) => [student.examNumber, student.name]));

  const top5 = studentAverages.slice(0, 5).map((student, index) => ({
    rank: index + 1,
    examNumber: student.examNumber,
    name: studentNameMap.get(student.examNumber) ?? student.examNumber,
    avg: student.avg,
  }));

  const atRisk = studentAverages
    .filter((student) => student.avg < 60)
    .map((student) => ({
      examNumber: student.examNumber,
      name: studentNameMap.get(student.examNumber) ?? student.examNumber,
      avg: student.avg,
    }));

  const weekLabel = `${formatDateKR(weekStartDate)} ~ ${formatDateKR(weekEndDate)}`;
  const attendanceRate =
    totalPresent + totalAbsent > 0 ? Math.round((totalPresent / (totalPresent + totalAbsent)) * 1000) / 10 : 0;

  return (
    <div className="p-8 sm:p-10">
      <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div>
          <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
            주간 리포트
          </div>
          <h1 className="mt-5 text-3xl font-semibold text-ink">아침모의고사 주간 리포트</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            현재 지점 기준으로 한 주의 성적, 출결, 학생 경향을 한 화면에서 요약합니다.
          </p>
        </div>
        <PrintButton />
      </div>

      <form method="get" className="mt-8 print:hidden">
        <div className="flex flex-wrap items-end gap-3 rounded-[28px] border border-ink/10 bg-mist p-6">
          <div>
            <label htmlFor="weekStart" className="mb-2 block text-sm font-medium text-ink">
              주 시작일
            </label>
            <input
              type="date"
              id="weekStart"
              name="weekStart"
              defaultValue={isoDate(weekStartDate)}
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
          <h2 className="text-2xl font-bold text-ink">아침모의고사 주간 리포트 / {weekLabel}</h2>
          <p className="mt-1 text-sm text-slate">현재 지점 기준 출력물</p>
          <hr className="mt-4 border-ink/10" />
        </div>

        <div className="flex items-center gap-3 print:hidden">
          <span className="rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-semibold text-ink">
            {weekLabel}
          </span>
          {sessions.length === 0 && <span className="text-sm text-slate">선택한 주에 등록된 회차가 없습니다.</span>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate">회차 수</p>
            <p className="mt-3 text-3xl font-bold text-ink">{sessions.length}</p>
            <p className="mt-1 text-xs text-slate">선택한 주 기준</p>
          </div>
          <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate">성적 건수</p>
            <p className="mt-3 text-3xl font-bold text-forest">{totalScoreEntries}</p>
            <p className="mt-1 text-xs text-slate">현재 지점 성적만 집계</p>
          </div>
          <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate">활성 수강 등록</p>
            <p className="mt-3 text-3xl font-bold text-ember">{activeEnrollmentCount}</p>
            <p className="mt-1 text-xs text-slate">활성 기간만 포함</p>
          </div>
          <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate">평균 점수</p>
            <p className="mt-3 text-3xl font-bold text-ink">{overallAvg !== null ? `${overallAvg}점` : "-"}</p>
            <p className="mt-1 text-xs text-slate">주간 평균</p>
          </div>
        </div>

        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-ink">주간 출결 요약</h2>
              <p className="mt-1 text-xs text-slate">주간 출결 비율과 과목별 평균 흐름을 함께 보여줍니다.</p>
            </div>
            <div className="text-sm text-slate">
              출결률 <span className="font-semibold text-ink">{attendanceRate}%</span>
            </div>
          </div>
          <div className="mt-4 h-4 w-full overflow-hidden rounded-full bg-ink/10">
            <div className="h-full rounded-full bg-forest" style={{ width: `${attendanceRate}%` }} />
          </div>
          <div className="mt-4 flex flex-wrap gap-4 border-t border-ink/5 pt-4">
            <div className="flex items-center gap-2">
              <div className="h-3 w-8 rounded-full bg-forest/60" />
              <span className="text-xs text-slate">출석</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-8 rounded-full bg-red-400" />
              <span className="text-xs text-slate">결석</span>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white shadow-panel">
          <div className="border-b border-ink/10 px-6 py-4">
            <h2 className="text-base font-semibold text-ink">과목별 주간 현황</h2>
          </div>
          {subjectRows.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate">
              선택한 주의 성적 데이터가 없습니다.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-mist">
                    <th className="px-4 py-3 text-left font-semibold text-ink/60">과목</th>
                    <th className="px-4 py-3 text-right font-semibold text-ink/60">출석</th>
                    <th className="px-4 py-3 text-right font-semibold text-ink/60">결석</th>
                    <th className="px-4 py-3 text-right font-semibold text-ink/60">평균</th>
                    <th className="px-4 py-3 text-right font-semibold text-ink/60">성적 수</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {subjectRows.map((row) => (
                    <tr key={row.subject} className="hover:bg-mist/60">
                      <td className="px-4 py-3 font-medium text-ink">{row.label}</td>
                      <td className="px-4 py-3 text-right font-mono text-forest">{row.present}</td>
                      <td className="px-4 py-3 text-right font-mono text-red-500">{row.absent}</td>
                      <td className="px-4 py-3 text-right font-mono text-ink">
                        {row.average !== null ? `${row.average}점` : "-"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-ink">{row.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white shadow-panel">
          <div className="border-b border-ink/10 px-6 py-4">
            <h2 className="text-base font-semibold text-ink">주간 성적 상위 5명</h2>
          </div>
          {top5.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-slate">
              주간 성적 데이터가 없습니다.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist">
                  <th className="px-4 py-3 text-left font-semibold text-ink/60">순위</th>
                  <th className="px-4 py-3 text-left font-semibold text-ink/60">학번</th>
                  <th className="px-4 py-3 text-left font-semibold text-ink/60">이름</th>
                  <th className="px-4 py-3 text-right font-semibold text-ink/60">주간 평균</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {top5.map((student) => (
                  <tr key={student.examNumber} className="hover:bg-mist/60">
                    <td className="px-4 py-3 font-bold text-ember">{student.rank}</td>
                    <td className="px-4 py-3 font-mono text-forest">{student.examNumber}</td>
                    <td className="px-4 py-3 font-medium text-ink">
                      <Link href={`/admin/students/${student.examNumber}`} className="hover:underline">
                        {student.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-forest">{student.avg}점</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {atRisk.length > 0 && (
          <div className="overflow-hidden rounded-[28px] border border-red-100 bg-white shadow-panel">
            <div className="border-b border-red-100 bg-red-50 px-6 py-4">
              <h2 className="text-base font-semibold text-red-700">주의 필요 학생</h2>
              <p className="text-xs text-red-500">주간 평균 60점 미만</p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-red-100 bg-red-50/50">
                  <th className="px-4 py-3 text-left font-semibold text-red-700/60">학번</th>
                  <th className="px-4 py-3 text-left font-semibold text-red-700/60">이름</th>
                  <th className="px-4 py-3 text-right font-semibold text-red-700/60">주간 평균</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-red-50">
                {atRisk.map((student) => (
                  <tr key={student.examNumber} className="hover:bg-red-50/50">
                    <td className="px-4 py-3 font-mono text-slate">{student.examNumber}</td>
                    <td className="px-4 py-3 font-medium text-ink">{student.name}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-red-600">{student.avg}점</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <h2 className="text-base font-semibold text-ink">주간 요약</h2>
          <div className="mt-4 flex flex-wrap gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate">총 출석</p>
              <p className="mt-1 text-2xl font-bold text-forest">{totalPresent}건</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate">총 결석</p>
              <p className="mt-1 text-2xl font-bold text-red-600">{totalAbsent}건</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate">출결률</p>
              <p className="mt-1 text-2xl font-bold text-ink">{attendanceRate}%</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


