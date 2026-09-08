import { RulesSettingsManager } from "@/components/settings/RulesSettingsManager";
import { getManagementPolicy } from "@/lib/services/management-policy.service";
import { listPointRules } from "@/lib/services/point.service";
import { getDivisionRuleSettings } from "@/lib/services/settings.service";

type RulesSettingsPageProps = {
  params: {
    division: string;
  };
};


export default async function RulesSettingsPage({ params }: RulesSettingsPageProps) {
  const [settings, pointRules] = await Promise.all([
    getDivisionRuleSettings(params.division),
    listPointRules(params.division, { activeOnly: true }),
  ]);
  const policy = await getManagementPolicy(params.division);

  return (
    <div className="admin-flat-page">
      <section className="admin-section">
        <h1 className="admin-page-title">운영 규칙 설정</h1>
        <p className="admin-page-description">
          지각 기준, 조교 출석 수정 범위, 경고 임계값, 휴가 한도, 경고 문자 템플릿을 지점별로 관리합니다.
          이 값은 출석 처리와 경고 대상 산정, 문자 초안 생성에 즉시 사용됩니다.
        </p>
      </section>

      <RulesSettingsManager
        divisionSlug={params.division}
        initialSettings={settings}
        pointRules={pointRules}
        policy={policy}
      />
    </div>
  );
}
