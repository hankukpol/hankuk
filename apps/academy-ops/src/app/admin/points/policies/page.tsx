import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { PointPoliciesManager } from "./point-policies-manager";

export const dynamic = "force-dynamic";

export type PointPolicyRow = {
  id: number;
  name: string;
  description: string | null;
  defaultAmount: number;
  isActive: boolean;
  createdAt: string;
};

export default async function PointPoliciesAdminPage() {
  await requireAdminContext(AdminRole.ACADEMIC_ADMIN);

  const policies = await getPrisma().pointPolicy.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
  });

  const rows: PointPolicyRow[] = policies.map((p) => ({
    ...p,
    createdAt: p.createdAt.toISOString(),
  }));

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        포인트 설정
      </div>
      <h1 className="mt-5 text-3xl font-semibold">포인트 정책 관리</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        포인트 지급 시 선택할 수 있는 사전 정의 항목을 관리합니다.
        지급 화면에서 정책을 선택하면 사유와 기본 금액이 자동으로 입력됩니다.
      </p>
      <div className="mt-8">
        <PointPoliciesManager initialPolicies={rows} />
      </div>
    </div>
  );
}
