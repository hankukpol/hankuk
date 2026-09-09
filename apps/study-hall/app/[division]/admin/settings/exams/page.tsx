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
    <div className="admin-flat-page">
      {/* DESIGN.md 5.2 — 페이지 제목은 평면 페이지 직속이다. 제목만 담은 섹션을 따로 두지 않는다. */}
      <h1 className="admin-page-title">시험 템플릿 설정</h1>
      <p className="admin-page-description">
        직렬별로 시험 종류와 과목·문항 수·배점을 관리합니다. 여기서 정한 템플릿이 성적 입력
        화면과 학생 조회 화면에 그대로 쓰입니다.
      </p>

      <ExamTypeManager
        divisionSlug={params.division}
        initialExamTypes={examTypes}
        studyTrackOptions={generalSettings.studyTracks}
      />
    </div>
  );
}
