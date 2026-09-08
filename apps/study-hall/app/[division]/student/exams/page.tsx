import dynamic from "next/dynamic";
import { notFound, redirect } from "next/navigation";
import { ChartNoAxesColumn } from "lucide-react";

import { ExamScoreChartLoader } from "@/components/exams/ExamScoreChartLoader";
import { ExamTabLayout } from "@/components/exams/ExamTabLayout";
import { MorningExamStudentView } from "@/components/exams/MorningExamStudentView";
import { MorningStudentReport } from "@/components/exams/analysis/MorningStudentReport";
import { RegularStudentReport } from "@/components/exams/analysis/RegularStudentReport";
import { StudentPortalFrame } from "@/components/student-view/StudentPortalFrame";
import {
  PortalEmptyState,
  PortalMetricCard,
  PortalSectionHeader,
  portalInsetClass,
  portalSectionClass,
} from "@/components/student-view/StudentPortalUi";
import { requireDivisionStudentAccess } from "@/lib/auth";
import { isNotFoundError } from "@/lib/errors";
import { listExamTypes, listStudentExamResults } from "@/lib/services/exam.service";
import { getRegularStudentReport, listRegularSessions } from "@/lib/services/exam-analysis.service";
import { listStudentMorningExamWeeks } from "@/lib/services/morning-exam.service";
import { listScoreTargets } from "@/lib/services/score-target.service";
import { getDivisionFeatureSettings, getDivisionTheme } from "@/lib/services/settings.service";
import { getStudentDetail } from "@/lib/services/student.service";
import { getMorningStudentReport } from "@/lib/services/morning-exam-analysis.service";
import { defaultMorningAnalysisRange, morningAnalysisRangeSchema } from "@/lib/morning-exam-analysis-schemas";
import type { MorningStudentReport as MorningReport } from "@/lib/morning-exam-analysis-types";
import type { RegularStudentReport as RegularReport } from "@/lib/exam-analysis-types";

type StudentExamsPageProps = {
  searchParams?: { analysisSession?: string | string[]; morningType?: string | string[]; morningFrom?: string | string[]; morningTo?: string | string[] };
  params: {
    division: string;
  };
};

const panelFallback = (
  <section className={`${portalSectionClass} animate-pulse`}>
    <div className="h-28 rounded-lg bg-admin-surface-soft" />
  </section>
);

const ScoreTargetPanel = dynamic(
  () => import("@/components/exams/ScoreTargetPanel").then((mod) => mod.ScoreTargetPanel),
  { ssr: false, loading: () => panelFallback },
);

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleDateString("ko-KR");
}

export default async function StudentExamsPage({ params, searchParams }: StudentExamsPageProps) {
  const session = await requireDivisionStudentAccess(params.division);

  try {
    const [division, student, settings] = await Promise.all([
      getDivisionTheme(params.division),
      getStudentDetail(params.division, session.studentId),
      getDivisionFeatureSettings(params.division),
    ]);

    if (!settings.featureFlags.examManagement) {
      redirect(`/${params.division}/student`);
    }

    const [exams, scoreTargets, morningWeeks, allExamTypes] = await Promise.all([
      listStudentExamResults(params.division, session.studentId),
      listScoreTargets(params.division, session.studentId),
      listStudentMorningExamWeeks(params.division, session.studentId),
      listExamTypes(params.division),
    ]);

    const hasMorningTypes = allExamTypes.some((t) => t.category === "MORNING" && t.isActive);
    const hasRegularTypes = allExamTypes.some((t) => t.category === "REGULAR" && t.isActive);
    const regularExams = exams.filter((exam) => {
      const examType = allExamTypes.find((t) => t.id === exam.examTypeId);
      return !examType || examType.category === "REGULAR";
    }).sort((left, right) => (right.examDate ?? "").localeCompare(left.examDate ?? ""));

    const analysisSessions = (await Promise.all(allExamTypes.filter((type) => type.category === "REGULAR").map(async (type) => {
      const sessions = await listRegularSessions(params.division, type.id, session.studentId);
      return sessions.map((entry) => ({ ...entry, examTypeId: type.id, examTypeName: type.name, key: `${type.id}:${entry.examDate}` }));
    }))).flat().sort((left, right) => right.examDate.localeCompare(left.examDate) || left.examTypeId.localeCompare(right.examTypeId));
    const requestedSession = typeof searchParams?.analysisSession === "string" ? searchParams.analysisSession : undefined;
    const selectedSession = analysisSessions.find((entry) => entry.key === requestedSession) ?? analysisSessions[0];
    let regularReport: RegularReport | null = null;
    if (selectedSession) {
      try {
        regularReport = await getRegularStudentReport(
          params.division, selectedSession.examTypeId, selectedSession.examDate, session.studentId,
          { role: "STUDENT", studentId: session.studentId },
        );
      } catch (error) {
        // A session can be replaced after listing. Keep legacy records available;
        // authentication and unexpected errors must still reach the page handler.
        if (!isNotFoundError(error)) throw error;
      }
    }

    const morningTypes = allExamTypes.filter((type) => type.category === "MORNING");
    const requestedMorningType = typeof searchParams?.morningType === "string" ? searchParams.morningType : undefined;
    const selectedMorningType = morningTypes.find((type) => type.id === requestedMorningType) ?? morningTypes.find((type) => type.isActive) ?? morningTypes[0];
    const defaultRange = defaultMorningAnalysisRange();
    const rangeResult = morningAnalysisRangeSchema.safeParse({
      from: searchParams?.morningFrom ?? defaultRange.from,
      to: searchParams?.morningTo ?? defaultRange.to,
    });
    const morningRange = rangeResult.success ? rangeResult.data : defaultRange;
    let morningReport: MorningReport | null = null;
    if (selectedMorningType && rangeResult.success) {
      try {
        morningReport = await getMorningStudentReport(
          params.division, selectedMorningType.id, session.studentId, morningRange,
          { role: "STUDENT", studentId: session.studentId },
        );
      } catch (error) {
        // Missing imported participation must not hide manual scores or cause a 404.
        if (!isNotFoundError(error)) throw error;
      }
    }
    const morningContent = (
      <div className="admin-flat-page">
        <section className="admin-flat-page">
          <h2 className="admin-section-title">아침 성적 분석</h2>
          {selectedMorningType ? <>
            <form className="admin-filter-bar" action={`/${params.division}/student/exams`} method="get">
              <label className="admin-label" htmlFor="student-morning-type">시험 종류</label>
              <select id="student-morning-type" name="morningType" defaultValue={selectedMorningType.id}>{morningTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select>
              <label className="admin-label" htmlFor="student-morning-from">시작일</label>
              <input id="student-morning-from" name="morningFrom" type="date" required defaultValue={morningRange.from} max={morningRange.to} />
              <label className="admin-label" htmlFor="student-morning-to">종료일</label>
              <input id="student-morning-to" name="morningTo" type="date" required defaultValue={morningRange.to} />
              <button type="submit" className="admin-button admin-button-primary">아침 분석 조회</button>
            </form>
            <p className="admin-help">기본 조회 기간은 오늘을 포함한 최근 84일입니다. 분석은 과목별 응시 횟수를 기준으로 합니다.</p>
            {!rangeResult.success ? <p role="alert" className="admin-notice admin-notice-danger">날짜를 확인해 주세요. 시작일부터 종료일까지 날짜 차이 92일 이내로 선택해 주세요.</p> : morningReport ? <MorningStudentReport report={morningReport} mode="student" /> : <p className="admin-empty-state">선택한 기간에 가져온 아침 문항 분석 자료가 없습니다. 기존 성적 기록은 아래에서 확인할 수 있습니다.</p>}
          </> : <p className="admin-empty-state">분석할 아침 시험 종류가 없습니다.</p>}
        </section>
        <MorningExamStudentView weeks={morningWeeks} />
      </div>
    );

    const regularContent = (
      <div className="space-y-5">
        <section className="admin-flat-page">
          <h2 className="admin-section-title">정기 성적 분석</h2>
          {selectedSession ? <>
            <form className="admin-filter-bar" action={`/${params.division}/student/exams`} method="get">
              <label className="admin-label" htmlFor="student-analysis-session">분석 시험일</label>
              <select id="student-analysis-session" name="analysisSession" defaultValue={selectedSession.key}>
                {analysisSessions.map((entry) => <option key={entry.key} value={entry.key}>{entry.examTypeName} {entry.examDate.slice(0, 10)}</option>)}
              </select>
              <button type="submit" className="admin-button admin-button-primary">분석 조회</button>
            </form>
            {regularReport ? <RegularStudentReport report={regularReport} mode="student" /> : <p className="admin-empty-state">선택한 시험일의 문항 분석 자료가 없습니다. 아래에서 기존 성적 기록을 확인할 수 있습니다.</p>}
          </> : <p className="admin-empty-state">가져온 문항 분석 자료가 없습니다. 아래에서 기존 성적 기록을 확인할 수 있습니다.</p>}
        </section>
        <section className="grid grid-cols-2 gap-3 xl:grid-cols-3">
          <PortalMetricCard
            label="응시 횟수"
            value={`${regularExams.length}회`}
            caption="정기모의고사 전체"
          />
          <PortalMetricCard
            label="최신 총점"
            value={regularExams[0]?.totalScore ?? "-"}
            caption="가장 최근 시험 기준"
          />
          <PortalMetricCard
            label="최신 반 석차"
            value={regularExams[0]?.rankInClass ? `${regularExams[0].rankInClass}등` : "-"}
            caption="가장 최근 시험 기준"
          />
        </section>

        <ScoreTargetPanel
          divisionSlug={params.division}
          studentId={session.studentId}
          initialTargets={scoreTargets}
        />

        <ExamScoreChartLoader results={regularExams} />

        <section className={portalSectionClass}>
          <PortalSectionHeader
            title="날짜별 성적 기록"
            description="정기모의고사 날짜별 총점, 석차, 과목 점수를 확인합니다."
            icon={<ChartNoAxesColumn className="h-5 w-5" />}
          />

          {regularExams.length > 0 ? (
            <div className="mt-4 space-y-4">
              {regularExams.map((exam) => (
                <article key={exam.id} className={portalInsetClass}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-[13px] font-medium text-admin-text-muted">
                        {exam.examTypeName}
                      </p>
                      <h3 className="mt-1.5 text-[20px] font-bold tracking-tight text-admin-text">
                        {exam.examDate ? formatDate(exam.examDate) : "시험일 미등록"}
                      </h3>
                      <p className="mt-1.5 text-[13px] text-admin-text-muted">
                        시험일 {formatDate(exam.examDate)}
                      </p>
                    </div>

                    <div className="grid w-full grid-cols-2 gap-3 sm:w-auto sm:min-w-[260px]">
                      <div className="rounded-lg border border-admin-line bg-white px-4 py-3">
                        <p className="text-[13px] font-medium text-admin-text-muted">
                          총점
                        </p>
                        <p className="mt-1.5 text-[20px] font-bold tracking-tight text-admin-text">
                          {exam.totalScore ?? "-"}
                        </p>
                      </div>
                      <div className="rounded-lg border border-admin-line bg-white px-4 py-3">
                        <p className="text-[13px] font-medium text-admin-text-muted">
                          반 석차
                        </p>
                        <p className="mt-1.5 text-[20px] font-bold tracking-tight text-admin-text">
                          {exam.rankInClass ? `${exam.rankInClass}등` : "-"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
                    {exam.subjects.map((subject) => (
                      <div
                        key={`${exam.id}-${subject.subjectId}`}
                        className="rounded-lg border border-admin-line bg-white px-4 py-3"
                      >
                        <p className="text-[13px] font-semibold text-admin-text">{subject.name}</p>
                        <p className="mt-1.5 text-[20px] font-bold tracking-tight text-admin-text">
                          {subject.score ?? "-"}
                        </p>
                        <p className="mt-1.5 text-[13px] text-admin-text-muted">
                          {subject.maxScore ? `만점 ${subject.maxScore}` : "만점 정보 없음"}
                        </p>
                      </div>
                    ))}
                  </div>

                  <p className="mt-4 text-[13px] leading-[1.5] text-admin-text-muted">
                    {exam.notes || "시험 메모가 없습니다."}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-4">
              <PortalEmptyState
                title="정기모의고사 기록이 없습니다."
                description="시험 결과가 등록되면 날짜별 성적 카드가 이 영역에 표시됩니다."
              />
            </div>
          )}
        </section>
      </div>
    );

    const morningRequested = searchParams?.morningType !== undefined || searchParams?.morningFrom !== undefined || searchParams?.morningTo !== undefined;
    const defaultTab = morningRequested ? "morning" : requestedSession ? "regular" : hasMorningTypes && morningWeeks.length > 0 ? "morning" : "regular";

    return (
      <StudentPortalFrame
        division={{ slug: params.division, ...division }}
        student={student}
        current="exams"
        attendanceEnabled={settings.featureFlags.attendanceManagement}
        announcementsEnabled={settings.featureFlags.announcements}
        pointsEnabled={settings.featureFlags.pointManagement}
        examsEnabled={settings.featureFlags.examManagement}
        title="성적 상세"
        description="아침모의고사 주차별 성적과 정기모의고사 날짜별 성적을 확인할 수 있습니다."
      >
        {hasMorningTypes || hasRegularTypes || morningWeeks.length > 0 || regularExams.length > 0 || selectedMorningType || selectedSession ? (
          <ExamTabLayout
            key={morningRequested ? `morning:${selectedMorningType?.id}:${morningRange.from}:${morningRange.to}` : requestedSession ?? "default"}
            morningContent={morningContent}
            regularContent={regularContent}
            defaultTab={defaultTab}
          />
        ) : (
          <PortalEmptyState
            title="시험 기록이 없습니다."
            description="시험 결과가 등록되면 성적이 이 영역에 표시됩니다."
          />
        )}
      </StudentPortalFrame>
    );
  } catch (error) {
    if (isNotFoundError(error)) {
      notFound();
    }

    throw error;
  }
}
