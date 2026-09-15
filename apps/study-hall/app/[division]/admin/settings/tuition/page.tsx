import { TuitionPlanManager } from "@/components/settings/TuitionPlanManager";
import { redirectIfDivisionFeatureDisabled } from "@/lib/division-feature-guard";
import { listTuitionPlans } from "@/lib/services/tuition-plan.service";
import { SettingsPageShell } from "@/components/settings/SettingsPageShell";

type TuitionSettingsPageProps = {
  params: {
    division: string;
  };
};

export default async function TuitionSettingsPage({ params }: TuitionSettingsPageProps) {
  await redirectIfDivisionFeatureDisabled(params.division, "paymentManagement");

  const plans = await listTuitionPlans(params.division);

  return (
    <SettingsPageShell
      divisionSlug={params.division}
      activeId="tuition"
      title="등록 기간 / 금액 설정"
      description="기간별 등록 플랜과 금액을 관리합니다. 학생 등록 시 적용 플랜과 실제 적용 금액을 함께 선택할 수 있습니다."
    >
      <TuitionPlanManager divisionSlug={params.division} initialPlans={plans} />
    </SettingsPageShell>
  );
}
