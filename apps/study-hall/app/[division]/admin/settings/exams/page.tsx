import { ExamTypeManager } from "@/components/exams/ExamTypeManager";
import { redirectIfDivisionFeatureDisabled } from "@/lib/division-feature-guard";
import { listExamTypes } from "@/lib/services/exam.service";
import { getDivisionGeneralSettings } from "@/lib/services/settings.service";

type ExamSettingsPageProps = {
  params: {
    division: string;
  };
};


export default async function ExamSettingsPage({ params }: ExamSettingsPageProps) {
  await redirectIfDivisionFeatureDisabled(params.division, "examManagement");

  const [examTypes, generalSettings] = await Promise.all([
    listExamTypes(params.division),
    getDivisionGeneralSettings(params.division),
  ]);

  return (
    <div className="space-y-6">
      <section className="rounded-[10px] border border-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(18,32,56,0.08)]">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
          설정 / 시험
        </p>
        <h1 className="mt-3 text-3xl font-extrabold text-slate-950">시험 템플릿 설정</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
          지점별 운영 방식에 맞게 시험 종류를 만들고, 직렬별로 과목명, 과목 수, 문항 수,
          배점까지 따로 관리합니다. 여기서 설정한 템플릿은 성적 입력 화면과 학생 조회 화면에
          그대로 반영됩니다.
        </p>
      </section>

      <ExamTypeManager
        divisionSlug={params.division}
        initialExamTypes={examTypes}
        studyTrackOptions={generalSettings.studyTracks}
      />
    </div>
  );
}
