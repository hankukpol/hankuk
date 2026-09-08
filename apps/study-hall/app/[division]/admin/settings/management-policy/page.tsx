import { ManagementPolicyReference } from "@/components/settings/ManagementPolicyReference";
import { getPolicyReviewSignals } from "@/lib/services/policy-review.service";
import { notFound } from "next/navigation";
import { getManagementPolicy } from "@/lib/services/management-policy.service";
import { getPeriods } from "@/lib/services/period.service";
import { listStudents } from "@/lib/services/student.service";
import { ManagementPolicyPanel } from "@/components/settings/ManagementPolicyPanel";

export default async function ManagementPolicyPage({ params }: { params: { division: string } }) {
  const policy = await getManagementPolicy(params.division);
  if (!policy) notFound();
  const [students, periods] = await Promise.all([listStudents(params.division), getPeriods(params.division)]);
  const signals = await getPolicyReviewSignals(params.division);
  return <div className="restart-policy">
    <section><h1 className="admin-page-title">관리규정 · {policy.version}</h1>
      <p className="admin-page-description">학생규정집 기준 · 적용일 {policy.effectiveFrom} · 상점과 벌점을 월별로 따로 집계합니다.</p></section>
    <section className="admin-section"><h2 className="admin-section-title">반복 위반·예외 검토</h2><p className="admin-help">확정된 벌점과 휴대폰 반출 기록을 기준으로 표시합니다. 인정사유·기록 오류를 확인한 뒤 면담 기록에 판단과 조치를 남겨 주세요.</p>
      {signals.length ? <ul>{signals.map((s, i) => <li key={i}>{students.find((st) => st.id === s.studentId)?.name ?? "학생 확인 필요"} · {s.reason} → {s.action}</li>)}</ul> : <p>현재 반복 기준에 해당하는 기록이 없습니다.</p>}
    </section>
    <ManagementPolicyPanel divisionSlug={params.division} initialPolicy={policy} students={students.filter((s) => s.status === "ACTIVE" || s.status === "ON_LEAVE").map((s) => ({ id: s.id, name: s.name, studentNumber: s.studentNumber }))} periods={periods.map((p) => ({ id: p.id, name: p.name, startTime: p.startTime, endTime: p.endTime }))} />
    <ManagementPolicyReference divisionSlug={params.division} />
  </div>;
}
