import { AdminRole } from "@prisma/client";
import { AbsencePolicyManager } from "@/components/absence-notes/absence-policy-manager";
import { requireAdminContext } from "@/lib/auth";
import { listAbsencePolicies } from "@/lib/absence-policies/service";

export const dynamic = "force-dynamic";

export default async function AdminAbsencePolicySettingsPage() {
  await requireAdminContext(AdminRole.TEACHER);
  const policies = await listAbsencePolicies();

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        Settings
      </div>
      <h1 className="mt-5 text-3xl font-semibold">사유 정책 설정</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        사유 유형별 기본 처리 규칙을 관리합니다. 사유서 관리 화면에서는 정책을 선택해 바로 등록하고,
        정책 자체의 생성·수정·삭제는 이 설정 페이지에서 처리합니다.
      </p>

      <div className="mt-8 rounded-[28px] border border-ink/10 bg-mist p-6 text-sm leading-7 text-slate">
        <p>사유 정책은 등록 화면의 기본값 템플릿 역할을 합니다.</p>
        <p>예비군처럼 항상 출석 포함과 개근 인정이 필요한 예외는 정책에서도 동일하게 유지됩니다.</p>
        <p>사유서 건별로 예외 처리가 필요하면 등록 또는 검토 화면에서 최종 값을 다시 조정할 수 있습니다.</p>
      </div>

      <div className="mt-8">
        <AbsencePolicyManager
          policies={policies.map((policy) => ({
            ...policy,
            createdAt: policy.createdAt.toISOString(),
            updatedAt: policy.updatedAt.toISOString(),
          }))}
        />
      </div>
    </div>
  );
}