import { ExamTypeManager } from "@/components/exams/ExamTypeManager";
import { redirectIfDivisionFeatureDisabled } from "@/lib/division-feature-guard";
import { listExamTypes } from "@/lib/services/exam.service";
import { getDivisionGeneralSettings } from "@/lib/services/settings.service";
import { SettingsPageShell } from "@/components/settings/SettingsPageShell";

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
    <SettingsPageShell
      divisionSlug={params.division}
      activeId="exams"
      title="시험 템플릿 설정"
      description="직렬별 시험 종류와 과목, 문항 수, 배점을 관리합니다. 저장한 템플릿은 성적 입력과 학생 조회 화면에 사용됩니다."
    >
      <ExamTypeManager
        divisionSlug={params.division}
        initialExamTypes={examTypes}
        studyTrackOptions={generalSettings.studyTracks}
      />
    </SettingsPageShell>
  );
}
