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
    <div className="space-y-6">
      <section className="rounded-[10px] border border-slate-200/80 bg-white px-6 py-6 shadow-[0_16px_40px_rgba(18,32,56,0.06)]">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
          시험
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950">
          시험 성적 관리
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
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
