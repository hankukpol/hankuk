import { ExamScheduleManager } from "@/components/exam-schedules/ExamScheduleManager";
import { redirectIfDivisionFeatureDisabled } from "@/lib/division-feature-guard";
import { listExamSchedules } from "@/lib/services/exam-schedule.service";

type ExamScheduleSettingsPageProps = {
  params: {
    division: string;
  };
};


export default async function ExamScheduleSettingsPage({ params }: ExamScheduleSettingsPageProps) {
  await redirectIfDivisionFeatureDisabled(params.division, "examScheduleManagement");

  const schedules = await listExamSchedules(params.division);

  return (
    <div className="admin-flat-page">
      <section className="admin-section">
        <h1 className="admin-page-title">시험 일정</h1>
        <p className="admin-page-description">
          이 직렬의 시험 일정을 등록합니다. 활성화된 일정은 학생 포털 대시보드에 D-Day 카운트다운으로 표시됩니다.
          시험이 아직 확정되지 않은 경우 비활성화해 두세요.
        </p>
      </section>

      <section className="admin-section">
        <ExamScheduleManager
          divisionSlug={params.division}
          initialSchedules={schedules}
        />
      </section>
    </div>
  );
}
