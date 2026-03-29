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
    <div className="space-y-6">
      <section className="rounded-[10px] border border-slate-200-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(18,32,56,0.08)]">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
          설정 / 시험 일정
        </p>
        <h1 className="mt-3 text-3xl font-extrabold text-slate-950">시험 일정</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
          이 직렬의 시험 일정을 등록합니다. 활성화된 일정은 학생 포털 대시보드에 D-Day 카운트다운으로 표시됩니다.
          시험이 아직 확정되지 않은 경우 비활성화해 두세요.
        </p>
      </section>

      <section className="rounded-[10px] border border-slate-200-black/5 bg-white p-6 shadow-[0_16px_40px_rgba(18,32,56,0.06)]">
        <ExamScheduleManager
          divisionSlug={params.division}
          initialSchedules={schedules}
        />
      </section>
    </div>
  );
}
