import { RulesSettingsNavigation } from "@/components/settings/RulesSettingsNavigation";
import { ArrivalSettingsManager } from "@/components/arrivals/ArrivalSettingsManager";
import { SettingsPageShell } from "@/components/settings/SettingsPageShell";
import { requireDivisionAdminAccess } from "@/lib/auth";

export default async function ArrivalSettingsPage({ params }: { params: { division: string } }) {
  await requireDivisionAdminAccess(params.division);
  return <SettingsPageShell divisionSlug={params.division} activeId="rules" title="등원 설정" mobileTitleInShell description="등원 체크 사용, 적용 예약과 공용 기기를 학원별로 관리합니다."><RulesSettingsNavigation divisionSlug={params.division} active="arrivals" /><ArrivalSettingsManager divisionSlug={params.division} /></SettingsPageShell>;
}
