import { StaffManager } from "@/components/admin/StaffManager";
import { redirectIfDivisionFeatureDisabled } from "@/lib/division-feature-guard";
import { getDivisionBySlug } from "@/lib/services/division.service";
import { listDivisionStaff } from "@/lib/services/division-staff.service";
import { SettingsPageShell } from "@/components/settings/SettingsPageShell";

type StaffPageProps = {
  params: {
    division: string;
  };
};

export default async function StaffPage({ params }: StaffPageProps) {
  await redirectIfDivisionFeatureDisabled(params.division, "staffManagement");

  const division = await getDivisionBySlug(params.division);
  const staff = division ? await listDivisionStaff(division.id, params.division) : [];

  return (
    <SettingsPageShell
      divisionSlug={params.division}
      activeId="staff"
      title="직원 관리"
      description="본 지점의 관리자와 조교 계정을 추가, 수정, 비활성화하고 비밀번호를 재설정합니다."
    >
      <StaffManager divisionSlug={params.division} initialStaff={staff} />
    </SettingsPageShell>
  );
}
