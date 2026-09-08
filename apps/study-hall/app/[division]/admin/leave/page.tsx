import { LeaveManager } from "@/components/leave/LeaveManager";
import { redirectIfDivisionFeatureDisabled } from "@/lib/division-feature-guard";
import { getDivisionSettings } from "@/lib/services/settings.service";
import { listLeavePermissions } from "@/lib/services/leave.service";
import { listStudents } from "@/lib/services/student.service";
import { getManagementPolicy } from "@/lib/services/management-policy.service";
import { isPolicyEffective, kstDate } from "@/lib/management-policy";

type AdminLeavePageProps = {
  params: {
    division: string;
  };
};

function getCurrentMonth() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

export default async function AdminLeavePage({ params }: AdminLeavePageProps) {
  await redirectIfDivisionFeatureDisabled(params.division, "leaveManagement");
  const currentMonth = getCurrentMonth();

  const [students, permissions, settings, policy] = await Promise.all([
    listStudents(params.division),
    listLeavePermissions(params.division, { month: currentMonth }),
    getDivisionSettings(params.division),
    getManagementPolicy(params.division),
  ]);

  return (
    <div className="admin-flat-page">
      <section>
        <h1 className="admin-page-title">외출/휴가 관리</h1>
      </section>

      <LeaveManager
        divisionSlug={params.division}
        students={students}
        initialPermissions={permissions}
        settings={{
          holidayLimit: settings.holidayLimit,
          halfDayLimit: settings.halfDayLimit,
          healthLimit: isPolicyEffective(policy, kstDate()) ? null : settings.healthLimit,
          holidayUnusedPts: settings.holidayUnusedPts,
          halfDayUnusedPts: settings.halfDayUnusedPts,
        }}
      />
    </div>
  );
}
