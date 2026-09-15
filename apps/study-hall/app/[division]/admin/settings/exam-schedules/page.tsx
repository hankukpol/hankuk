import { ExamScheduleManager } from "@/components/exam-schedules/ExamScheduleManager";
import { redirectIfDivisionFeatureDisabled } from "@/lib/division-feature-guard";
import { listExamSchedules } from "@/lib/services/exam-schedule.service";
import { SettingsPageShell } from "@/components/settings/SettingsPageShell";

type ExamScheduleSettingsPageProps = {
  params: {
    division: string;
  };
};


export default async function ExamScheduleSettingsPage({ params }: ExamScheduleSettingsPageProps) {
  await redirectIfDivisionFeatureDisabled(params.division, "examScheduleManagement");

  const schedules = await listExamSchedules(params.division);

  return (
    <SettingsPageShell
      divisionSlug={params.division}
      activeId="exam-schedules"
      title="시험 일정"
      description="시험 일정을 등록합니다. 활성 일정은 학생 포털에 D-Day로 표시되며, 확정되지 않은 일정은 비활성으로 관리할 수 있습니다."
    >
      <section className="admin-section">
        <ExamScheduleManager
          divisionSlug={params.division}
          initialSchedules={schedules}
        />
      </section>
    </SettingsPageShell>
  );
}
