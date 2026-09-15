import { SettingsPageShell } from "@/components/settings/SettingsPageShell";
import { AcademyTemplateManager } from "@/components/settings/AcademyTemplateManager";
export default function AcademyTemplatesPage({ params }: { params: { division: string } }) {
  return <SettingsPageShell divisionSlug={params.division} activeId="templates" title="학원 운영 템플릿" description="우리 학원 설정을 만들고, 적용할 변경과 날짜를 확인합니다."><AcademyTemplateManager divisionSlug={params.division}/></SettingsPageShell>;
}
