import { ExamScoreManager } from "@/components/exams/ExamScoreManager";
import { MorningExamScoreManager } from "@/components/exams/MorningExamScoreManager";
import { ExamTabLayout } from "@/components/exams/ExamTabLayout";
import { redirectIfDivisionFeatureDisabled } from "@/lib/division-feature-guard";
import { listExamTypes } from "@/lib/services/exam.service";

type AdminExamsPageProps = {
  params: {
    division: string;
  };
};

export default async function AdminExamsPage({ params }: AdminExamsPageProps) {
  await redirectIfDivisionFeatureDisabled(params.division, "examManagement");
  const examTypes = (await listExamTypes(params.division)).filter((examType) => examType.isActive);
  const morningTypes = examTypes.filter((t) => t.category === "MORNING");
  const regularTypes = examTypes.filter((t) => t.category === "REGULAR");

  return (
    <div className="admin-flat-page">
      <section className="admin-section">
        <h1 className="admin-page-title">
          시험 성적 관리
        </h1>
        <p className="admin-page-description">
          아침모의고사는 매일 1과목씩, 정기모의고사는 전과목을 한번에 입력합니다.
          엑셀 붙여넣기와 CSV 업로드/다운로드를 지원합니다.
        </p>
      </section>

      <ExamTabLayout
        morningContent={
          <MorningExamScoreManager
            divisionSlug={params.division}
            morningExamTypes={morningTypes}
          />
        }
        regularContent={
          <ExamScoreManager
            divisionSlug={params.division}
            initialExamTypes={regularTypes}
          />
        }
      />
    </div>
  );
}
