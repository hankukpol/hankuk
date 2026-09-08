import { ExamTabLayout } from "@/components/exams/ExamTabLayout";
import { ExamSecondaryTabs } from "@/components/exams/ExamSecondaryTabs";
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
          직접 입력하거나 채점표와 문항분석표를 함께 가져올 수 있습니다.
        </p>
      </section>

      <ExamTabLayout
        morningContent={
          <ExamSecondaryTabs
            key={`${params.division}-morning`}
            divisionSlug={params.division}
            category="MORNING"
            examTypes={morningTypes}
          />
        }
        regularContent={
          <ExamSecondaryTabs
            key={`${params.division}-regular`}
            divisionSlug={params.division}
            category="REGULAR"
            examTypes={regularTypes}
          />
        }
      />
    </div>
  );
}
