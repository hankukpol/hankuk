import { PointRuleManager } from "@/components/points/PointRuleManager";
import { redirectIfDivisionFeatureDisabled } from "@/lib/division-feature-guard";
import { SettingsPageShell } from "@/components/settings/SettingsPageShell";

type PointRulePageProps = {
  params: {
    division: string;
  };
};

export default async function PointRulePage({ params }: PointRulePageProps) {
  await redirectIfDivisionFeatureDisabled(params.division, "pointManagement");

  return (
    <SettingsPageShell
      divisionSlug={params.division}
      activeId="point-rules"
      title="상벌점 규칙 설정"
      description="직렬별 상벌점 규칙을 추가, 수정, 비활성화합니다. 경고 단계 기준은 운영 규칙 탭의 설정값을 따릅니다."
    >
      <PointRuleManager divisionSlug={params.division} />
    </SettingsPageShell>
  );
}
