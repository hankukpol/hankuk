import { notFound } from "next/navigation";
import { requireDivisionStudentAccess } from "@/lib/auth";
import { getManagementPolicy } from "@/lib/services/management-policy.service";
import { getStudentDetail } from "@/lib/services/student.service";
import { getDivisionFeatureSettings, getDivisionTheme } from "@/lib/services/settings.service";
import { StudentPortalFrame } from "@/components/student-view/StudentPortalFrame";
import { ManagementPolicyReference } from "@/components/settings/ManagementPolicyReference";

export default async function StudentPolicyPage({ params }: { params: { division: string } }) {
  const session = await requireDivisionStudentAccess(params.division);
  const [policy, student, division, settings] = await Promise.all([getManagementPolicy(params.division), getStudentDetail(params.division, session.studentId), getDivisionTheme(params.division), getDivisionFeatureSettings(params.division)]);
  if (!policy) notFound();
  return <StudentPortalFrame division={{slug:params.division,...division}} student={student} current="management-policy" title="관리규정·시간표" description={`학생규정집 ${policy.version} · ${policy.effectiveFrom}부터 적용`} attendanceEnabled={settings.featureFlags.attendanceManagement} announcementsEnabled={settings.featureFlags.announcements} pointsEnabled={settings.featureFlags.pointManagement} examsEnabled={settings.featureFlags.examManagement}>
    <section><h2 className="admin-section-title">관리규정 · {policy.version}</h2><p className="admin-help">{policy.effectiveFrom}부터 적용 · 상점·벌점은 월별로 따로 집계합니다.</p></section>
    <ManagementPolicyReference divisionSlug={params.division} />
  </StudentPortalFrame>;
}
