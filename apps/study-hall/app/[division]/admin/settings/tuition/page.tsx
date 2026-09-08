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
    <div className="admin-flat-page">
      <section className="admin-section">
        <h1 className="admin-page-title">등록 기간 / 금액 설정</h1>
        <p className="admin-page-description">
          지점 관리자가 기간별 등록 플랜을 직접 만들고 금액을 관리합니다. 학생 등록 시 시작일, 종료일, 적용 플랜, 실제 적용 금액을 함께 선택할 수 있습니다.
        </p>
      </section>

      <TuitionPlanManager divisionSlug={params.division} initialPlans={plans} />
    </div>
  );
}
