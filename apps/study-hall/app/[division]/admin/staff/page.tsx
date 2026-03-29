import { StaffManager } from "@/components/admin/StaffManager";
import { redirectIfDivisionFeatureDisabled } from "@/lib/division-feature-guard";
import { getDivisionBySlug } from "@/lib/services/division.service";
import { listDivisionStaff } from "@/lib/services/division-staff.service";

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
    <div className="space-y-6">
      <section className="rounded-[10px] border border-slate-200 bg-white px-6 py-6 shadow-[0_16px_40px_rgba(18,32,56,0.06)]">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">직원 관리</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950">직원 관리</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
          본 지점의 관리자와 조교 계정을 추가, 수정, 비활성화하고 비밀번호를 재설정합니다.
        </p>
      </section>

      <StaffManager divisionSlug={params.division} initialStaff={staff} />
    </div>
  );
}
