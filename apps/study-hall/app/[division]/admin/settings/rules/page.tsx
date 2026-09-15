import { RulesSettingsManager } from "@/components/settings/RulesSettingsManager";
import { getManagementPolicy } from "@/lib/services/management-policy.service";
import { listPointRules } from "@/lib/services/point.service";
import { getDivisionRuleSettings } from "@/lib/services/settings.service";
import { listDivisionSettingsHistory } from "@/lib/services/settings-history.service";
import { getPointAggregationInfo } from "@/lib/point-aggregation-mode";
import { SettingsPageShell } from "@/components/settings/SettingsPageShell";

type RulesSettingsPageProps = {
  params: {
    division: string;
  };
};


export default async function RulesSettingsPage({ params }: RulesSettingsPageProps) {
  const [settings, pointRules, history] = await Promise.all([
    getDivisionRuleSettings(params.division),
    listPointRules(params.division, { activeOnly: true }),
    listDivisionSettingsHistory(params.division, { limit: 10 }),
  ]);
  const policy = await getManagementPolicy(params.division);
  const aggregation = getPointAggregationInfo(policy);

  return (
    <SettingsPageShell
      divisionSlug={params.division}
      activeId="rules"
      title="운영 규칙 설정"
      description={<>지각 기준, 조교 출석 수정 범위, 경고 임계값, 휴가 한도, 경고 문자 템플릿을 지점별로 관리합니다. 저장한 값은 출석 처리와 경고 대상 산정에 사용됩니다.</>}
    >
      <RulesSettingsManager
        divisionSlug={params.division}
        initialSettings={settings}
        pointRules={pointRules}
        policy={policy}
        initialHistory={history}
        aggregationLabel={aggregation.label}
        aggregationDescription={aggregation.description}
      />
    </SettingsPageShell>
  );
}
