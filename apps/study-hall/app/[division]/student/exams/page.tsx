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
  portalMetricGrid3Class,
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
  <section className="admin-section">
    <div className="admin-empty-state">성적 목표를 불러오는 중입니다.</div>
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

    // 회차마다 과목 구성이 다를 수 있으므로 표 열은 등장한 과목의 합집합으로 만든다.
    const subjectColumns = Array.from(
      new Map(
        regularExams
          .flatMap((exam) => exam.subjects)
          .map((subject) => [subject.subjectId, subject]),
      ).values(),
    );

    const morningContent = (
      <MorningExamStudentView weeks={morningWeeks} />
    );

    const regularContent = (
      <div className="space-y-5">
        <section className={portalMetricGrid3Class}>
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

        {/* DESIGN.md 8절 — 학생 목록은 폭에 상관없이 표다. 바깥에 카드를 덧대지 않는다. */}
        <section>
          <PortalSectionHeader
            title="회차별 성적 기록"
            description="정기모의고사 회차별 총점, 석차, 과목 점수를 확인합니다."
            icon={<ChartNoAxesColumn className="h-5 w-5" />}
          />

          {regularExams.length > 0 ? (
            <div className="admin-table-frame mt-4">
              <table>
                <thead>
                  <tr>
                    <th>회차</th>
                    <th>시험 종류</th>
                    <th>시험일</th>
                    <th>총점</th>
                    <th>반 석차</th>
                    {subjectColumns.map((subject) => (
                      <th key={subject.subjectId}>{subject.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {regularExams.map((exam) => (
                    <tr key={exam.id}>
                      <td>{exam.examRound}회차</td>
                      <td className="admin-table-name">{exam.examTypeName}</td>
                      <td>{formatDate(exam.examDate)}</td>
                      <td className="admin-table-amount">{exam.totalScore ?? "-"}</td>
                      <td>{exam.rankInClass ? `${exam.rankInClass}등` : "-"}</td>
                      {subjectColumns.map((column) => {
                        const subject = exam.subjects.find(
                          (item) => item.subjectId === column.subjectId,
                        );

                        return (
                          <td key={`${exam.id}-${column.subjectId}`} className="admin-table-amount">
                            {subject?.score ?? "-"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-4">
              <PortalEmptyState
                title="정기모의고사 기록이 없습니다."
                description="시험 결과가 등록되면 회차별 성적이 이 영역에 표시됩니다."
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
