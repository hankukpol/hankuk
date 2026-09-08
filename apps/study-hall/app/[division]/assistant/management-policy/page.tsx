import { notFound } from "next/navigation";
import { getManagementPolicy } from "@/lib/services/management-policy.service";
import { ManagementPolicyReference } from "@/components/settings/ManagementPolicyReference";
export default async function AssistantPolicyPage({params}: {params:{division:string}}) {
  const policy = await getManagementPolicy(params.division);
  if (!policy) notFound();
  return <div className="restart-policy"><section><h1 className="admin-page-title">관리규정 · {policy.version}</h1><p className="admin-page-description">학생규정집 기준. 사실·시간·학생 설명을 기록하고 벌점은 관리자에게 확정 요청합니다.</p></section><ManagementPolicyReference divisionSlug={params.division}/></div>;
}
