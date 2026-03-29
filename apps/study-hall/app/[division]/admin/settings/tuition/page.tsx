import { TuitionPlanManager } from "@/components/settings/TuitionPlanManager";
import { redirectIfDivisionFeatureDisabled } from "@/lib/division-feature-guard";
import { listTuitionPlans } from "@/lib/services/tuition-plan.service";

type TuitionSettingsPageProps = {
  params: {
    division: string;
  };
};

export default async function TuitionSettingsPage({ params }: TuitionSettingsPageProps) {
  await redirectIfDivisionFeatureDisabled(params.division, "paymentManagement");

  const plans = await listTuitionPlans(params.division);

  return (
    <div className="space-y-6">
      <section className="rounded-[10px] border border-slate-200-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(18,32,56,0.08)]">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
          설정 / 등록 플랜
        </p>
        <h1 className="mt-3 text-3xl font-extrabold text-slate-950">등록 기간 / 금액 설정</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
          지점 관리자가 기간별 등록 플랜을 직접 만들고 금액을 관리합니다. 학생 등록 시 시작일, 종료일, 적용 플랜, 실제 적용 금액을 함께 선택할 수 있습니다.
        </p>
      </section>

      <TuitionPlanManager divisionSlug={params.division} initialPlans={plans} />
    </div>
  );
}
