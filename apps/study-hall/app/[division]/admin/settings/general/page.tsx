import { GeneralSettingsManager } from "@/components/settings/GeneralSettingsManager";
import { SettingsPageShell } from "@/components/settings/SettingsPageShell";
import { getDivisionGeneralSettings } from "@/lib/services/settings.service";

type GeneralSettingsPageProps = {
  params: {
    division: string;
  };
};


export default async function GeneralSettingsPage({
  params,
}: GeneralSettingsPageProps) {
  const settings = await getDivisionGeneralSettings(params.division);

  return (
    <SettingsPageShell
      divisionSlug={params.division}
      activeId="general"
      title="지점 기본 정보"
      description={<>지점 이름, 학원 전체 이름, 브랜드 색상, 운영 요일, 직렬 목록을 설정합니다. 여러 직렬이 공존하는 지점도 여기서 개별 운영 기준을 관리할 수 있습니다.</>}
    >
      <GeneralSettingsManager divisionSlug={params.division} initialSettings={settings} />
    </SettingsPageShell>
  );
}
