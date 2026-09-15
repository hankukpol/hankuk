import { SettingsPageShell } from "@/components/settings/SettingsPageShell";
import { RulesSettingsNavigation } from "@/components/settings/RulesSettingsNavigation";
import { AcademyPolicySettings } from "@/components/settings/AcademyPolicySettings";
import { getAcademyPolicySettings } from "@/lib/services/academy-policy-settings.service";
import { RulesSettingsManager } from "@/components/settings/RulesSettingsManager";
import { getManagementPolicy } from "@/lib/services/management-policy.service";
import { listPointRules } from "@/lib/services/point.service";
import { getDivisionRuleSettings } from "@/lib/services/settings.service";
import { listDivisionSettingsHistory } from "@/lib/services/settings-history.service";
import { getPointAggregationInfo } from "@/lib/point-aggregation-mode";

type RulesSettingsPageProps = {
  params: {
    division: string;
  };
  searchParams?: { section?: string };
};


export default async function RulesSettingsPage({ params, searchParams }: RulesSettingsPageProps) {
  const [settings, pointRules, history] = await Promise.all([
    getDivisionRuleSettings(params.division),
    listPointRules(params.division, { activeOnly: true }),
    listDivisionSettingsHistory(params.division, { limit: 10 }),
  ]);
  const policy = await getManagementPolicy(params.division);
  const aggregation = getPointAggregationInfo(policy);
  const isPolicy = searchParams?.section === "policy";
  const policyData = isPolicy ? await getAcademyPolicySettings(params.division) : null;

  return (
    <SettingsPageShell divisionSlug={params.division} activeId="rules" title="운영 규칙 설정" description="출결·휴가·경고·상벌점 기준을 설정하고 적용일을 정합니다.">
      <RulesSettingsNavigation divisionSlug={params.division} active={isPolicy ? "policy" : "rules"} />
      {policyData ? <AcademyPolicySettings divisionSlug={params.division} initial={policyData} /> : <RulesSettingsManager
        divisionSlug={params.division}
        initialSettings={settings}
        pointRules={pointRules}
        policy={policy}
        initialHistory={history}
        aggregationLabel={aggregation.label}
        aggregationDescription={aggregation.description}
      />}
    </SettingsPageShell>
  );
}
