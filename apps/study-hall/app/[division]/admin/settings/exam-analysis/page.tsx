import { LearningAdmin } from "@/components/exams/preview/LearningAdmin";
import { LearningProvider } from "@/components/exams/preview/LearningProvider";
import { SettingsPageShell } from "@/components/settings/SettingsPageShell";
import { requireDivisionAdminAccess } from "@/lib/auth";
import { redirectIfDivisionFeatureDisabled } from "@/lib/division-feature-guard";

/** 설정 > 성적 분석 기준. 학원별 표준 과목·진도 연결(예전 `시험 성적 › 진도·학습 분석 설정`)을 설정 메뉴로 옮겼다. */
export default async function ExamAnalysisSettingsPage({ params }: { params: { division: string } }) {
  await requireDivisionAdminAccess(params.division, ["ADMIN", "SUPER_ADMIN"]);
  await redirectIfDivisionFeatureDisabled(params.division, "examManagement");

  return (
    <SettingsPageShell
      divisionSlug={params.division}
      activeId="exam-analysis"
      title="성적 분석 기준"
      description="이 학원의 표준 과목과 진도를 연결해 성적 분석의 과목·단원 기준을 정합니다. 바꾸기 전에 미리보기로 확인하며, 기존 점수와 답안은 그대로입니다."
    >
      <LearningProvider division={params.division} preview={false}>
        <LearningAdmin division={params.division} previewOnly={false} embedded />
      </LearningProvider>
    </SettingsPageShell>
  );
}
