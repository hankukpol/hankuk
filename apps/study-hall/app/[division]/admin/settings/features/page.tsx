import { FeatureSettingsManager } from "@/components/settings/FeatureSettingsManager";
import { SettingsPageShell } from "@/components/settings/SettingsPageShell";
import { getDivisionFeatureSettings } from "@/lib/services/settings.service";

type FeatureSettingsPageProps = {
  params: {
    division: string;
  };
};

export default async function FeatureSettingsPage({
  params,
}: FeatureSettingsPageProps) {
  const settings = await getDivisionFeatureSettings(params.division);

  return (
    <SettingsPageShell
      divisionSlug={params.division}
      activeId="features"
      title="지점 기능 설정"
      description={<>공지, 휴대폰 관리, 상벌점, 수납, 면담, 좌석, 시험 관련 기능을 지점 단위로 켜고 끕니다. 비활성 기능은 관리자 메뉴와 주요 진입 화면에서 함께 정리됩니다.</>}
    >
      <FeatureSettingsManager divisionSlug={params.division} initialSettings={settings} />
    </SettingsPageShell>
  );
}
