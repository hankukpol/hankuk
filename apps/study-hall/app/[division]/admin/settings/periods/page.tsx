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
          교시명, 시간, 순서, 활성 상태가 관리자 출석부와 조교 출석체크에 반영됩니다.
          비활성 교시는 입력 목록에서 제외되며 기존 출결 기록은 보존됩니다.
          {policy && " 의무 출석·출석률·자동 벌점은 관리규정의 요일과 신청 조건을 따릅니다. 아침모의고사 출결을 기록해도 시험 응시·성적 기록은 별도로 관리됩니다."}
        </p>
      </section>

      <PeriodSettingsManager divisionSlug={params.division} initialPeriods={periods} policyEnabled={Boolean(policy)} />
      {policy && <OptionalStudyEnrollment divisionSlug={params.division} policy={policy} periods={periods} students={students.filter((s) => s.status === "ACTIVE" || s.status === "ON_LEAVE")} />}
    </div>
  );
}
