import dynamic from "next/dynamic";
import { notFound, redirect } from "next/navigation";
import { ChartNoAxesColumn } from "lucide-react";

import { ExamScoreChartLoader } from "@/components/exams/ExamScoreChartLoader";
import { ExamTabLayout } from "@/components/exams/ExamTabLayout";
import { MorningExamStudentView } from "@/components/exams/MorningExamStudentView";
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
import { listStudentMorningExamWeeks } from "@/lib/services/morning-exam.service";
import { listScoreTargets } from "@/lib/services/score-target.service";
import { getDivisionFeatureSettings, getDivisionTheme } from "@/lib/services/settings.service";
import { getStudentDetail } from "@/lib/services/student.service";

type StudentExamsPageProps = {
  params: {
    division: string;
  };
};

const panelFallback = (
  <section className={`${portalSectionClass} animate-pulse`}>
    <div className="h-28 rounded-[10px] bg-[#F4F4F2]" />
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

export default async function StudentExamsPage({ params }: StudentExamsPageProps) {
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
    });

    const morningContent = (
      <MorningExamStudentView weeks={morningWeeks} />
    );

    const regularContent = (
      <div className="space-y-5">
        <section className="grid grid-cols-2 gap-3 xl:grid-cols-3">
          <PortalMetricCard
            label="응시 회차"
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
            title="회차별 성적 기록"
            description="정기모의고사 회차별 총점, 석차, 과목 점수를 확인합니다."
            icon={<ChartNoAxesColumn className="h-5 w-5" />}
          />

          {regularExams.length > 0 ? (
            <div className="mt-4 space-y-4">
              {regularExams.map((exam) => (
                <article key={exam.id} className={portalInsetClass}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-[12px] font-medium text-[var(--muted)]">
                        {exam.examTypeName}
                      </p>
                      <h3 className="mt-1.5 text-[24px] font-bold tracking-tight text-[var(--foreground)]">
                        {exam.examRound}회차
                      </h3>
                      <p className="mt-1.5 text-[13px] text-[var(--muted)]">
                        시험일 {formatDate(exam.examDate)}
                      </p>
                    </div>

                    <div className="grid w-full grid-cols-2 gap-3 sm:w-auto sm:min-w-[260px]">
                      <div className="rounded-[10px] border border-[var(--border)] bg-white px-4 py-3">
                        <p className="text-[12px] font-medium text-[var(--muted)]">
                          총점
                        </p>
                        <p className="mt-1.5 text-[24px] font-bold tracking-tight text-[var(--foreground)]">
                          {exam.totalScore ?? "-"}
                        </p>
                      </div>
                      <div className="rounded-[10px] border border-[var(--border)] bg-white px-4 py-3">
                        <p className="text-[12px] font-medium text-[var(--muted)]">
                          반 석차
                        </p>
                        <p className="mt-1.5 text-[24px] font-bold tracking-tight text-[var(--foreground)]">
                          {exam.rankInClass ? `${exam.rankInClass}등` : "-"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
                    {exam.subjects.map((subject) => (
                      <div
                        key={`${exam.id}-${subject.subjectId}`}
                        className="rounded-[10px] border border-[var(--border)] bg-white px-4 py-3"
                      >
                        <p className="text-[13px] font-semibold text-[var(--foreground)]">{subject.name}</p>
                        <p className="mt-1.5 text-[22px] font-bold tracking-tight text-[var(--foreground)]">
                          {subject.score ?? "-"}
                        </p>
                        <p className="mt-1.5 text-[12px] text-[var(--muted)]">
                          {subject.maxScore ? `만점 ${subject.maxScore}` : "만점 정보 없음"}
                        </p>
                      </div>
                    ))}
                  </div>

                  <p className="mt-4 text-[13px] leading-[1.5] text-[var(--muted)]">
                    {exam.notes || "시험 메모가 없습니다."}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-4">
              <PortalEmptyState
                title="정기모의고사 기록이 없습니다."
                description="시험 결과가 등록되면 회차별 성적 카드가 이 영역에 표시됩니다."
              />
            </div>
          )}
        </section>
      </div>
    );

    const defaultTab = hasMorningTypes && morningWeeks.length > 0 ? "morning" : "regular";

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
        description="아침모의고사 주차별 성적과 정기모의고사 회차별 성적을 확인할 수 있습니다."
      >
        {hasMorningTypes || hasRegularTypes ? (
          <ExamTabLayout
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
