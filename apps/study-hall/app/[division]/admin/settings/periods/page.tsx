import { OptionalStudyEnrollment } from "@/components/periods/OptionalStudyEnrollment";
import { getManagementPolicy } from "@/lib/services/management-policy.service";
import { listStudents } from "@/lib/services/student.service";
import { PeriodSettingsManager } from "@/components/periods/PeriodSettingsManager";
import { getPeriods } from "@/lib/services/period.service";

type PeriodSettingsPageProps = {
  params: {
    division: string;
  };
};


export default async function PeriodSettingsPage({ params }: PeriodSettingsPageProps) {
  const [periods, policy] = await Promise.all([getPeriods(params.division), getManagementPolicy(params.division)]);
  const students = policy ? await listStudents(params.division) : [];

  return (
    <div className="admin-flat-page">
      <section className="admin-section">
        <h1 className="admin-page-title">교시 설정</h1>
        <p className="admin-page-description">
          교시명, 시간, 필수 여부, 활성 상태를 직렬별로 관리합니다. 이후 조교 출석체크와
          관리자 출석부는 이 설정을 기준으로 동작합니다.
        </p>
      </section>

      <PeriodSettingsManager divisionSlug={params.division} initialPeriods={periods} />
      {policy && <OptionalStudyEnrollment divisionSlug={params.division} policy={policy} periods={periods} students={students.filter((s) => s.status === "ACTIVE" || s.status === "ON_LEAVE")} />}
    </div>
  );
}
