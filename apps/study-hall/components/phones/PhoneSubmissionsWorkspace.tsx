import { PhoneLoanApproval } from "@/components/phones/PhoneLoanApproval";
import { OutstandingPhoneReturns } from "@/components/phones/OutstandingPhoneReturns";
import { getManagementPolicy } from "@/lib/services/management-policy.service";
import { getPeriods } from "@/lib/services/period.service";
import { listStudents } from "@/lib/services/student.service";
import { PhoneCheckForm } from "@/components/phones/PhoneCheckForm";
import { PhoneWorkspaceTabs } from "@/components/phones/PhoneWorkspaceTabs";
import { getCurrentPeriod } from "@/lib/services/period.service";
import { getPhoneDaySnapshot, listPhoneRecords } from "@/lib/services/phone-submission.service";
import {
  filterOperationalStudyRooms,
  getSeatLayout,
  listStudyRooms,
} from "@/lib/services/seat.service";
import { getDivisionFeatureSettings } from "@/lib/services/settings.service";

function getKstToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

type PhoneSubmissionsWorkspaceProps = {
  divisionSlug: string;
  showHistory?: boolean;
  mode?: "admin" | "assistant";
};

export async function PhoneSubmissionsWorkspace({
  divisionSlug,
  showHistory = true,
  mode = "admin",
}: PhoneSubmissionsWorkspaceProps) {
  const today = getKstToday();

  const [snapshot, currentPeriod, allSeatRooms, initialSeatLayout, featureSettings, policy] = await Promise.all([
    getPhoneDaySnapshot(divisionSlug, today),
    getCurrentPeriod(divisionSlug),
    listStudyRooms(divisionSlug),
    getSeatLayout(divisionSlug),
    getDivisionFeatureSettings(divisionSlug),
    getManagementPolicy(divisionSlug),
  ]);

  // 비활성 자습실은 운영 화면에서 숨긴다. 배정된 학생이 남아 있으면 그대로 보여준다.
  const seatRooms = filterOperationalStudyRooms(allSeatRooms);

  const [students, periods] = policy && mode === "admin" ? await Promise.all([listStudents(divisionSlug), getPeriods(divisionSlug)]) : [[], []];
  const approval = policy && mode === "admin" ? <PhoneLoanApproval divisionSlug={divisionSlug} policy={policy} students={students.filter((s) => s.status === "ACTIVE" || s.status === "ON_LEAVE")} periods={periods} /> : undefined;
  const outstandingReturns = policy ? (await listPhoneRecords(divisionSlug, { dateFrom: today, dateTo: today })).filter((record) => record.status === "RENTED" && !record.attendanceCheckable) : [];

  const check = (
    <div className="admin-flat-page">
    <PhoneCheckForm
      divisionSlug={divisionSlug}
      initialDate={today}
      initialSnapshot={snapshot}
      initialActivePeriodId={currentPeriod?.id ?? snapshot.periods[0]?.periodId ?? ""}
      seatRooms={seatRooms}
      initialSeatLayout={initialSeatLayout}
      viewTabsVariant={showHistory ? "secondary" : "primary"}
    />
    <OutstandingPhoneReturns divisionSlug={divisionSlug} records={outstandingReturns} />
    </div>
  );

  return (
    <div className="admin-flat-page">
      <section className="admin-section">
        <h1 className="admin-page-title">
          {mode === "assistant" ? "휴대폰 체크" : "휴대폰 관리"}
        </h1>
        <p className="admin-page-description">
          {mode === "assistant"
            ? "교시별 반납·미반납·대여를 체크하고 저장합니다."
            : "교시별 휴대폰 반납, 미반납, 대여 상태를 체크하고 대여 범위를 한 번에 저장합니다."}
          {showHistory ? " 필요한 경우 이력에서 미반납 학생에게 벌점을 부여할 수 있습니다." : ""}
        </p>
      </section>

      {showHistory ? (
        <PhoneWorkspaceTabs check={check} approval={approval} divisionSlug={divisionSlug} pointsEnabled={featureSettings.featureFlags.pointManagement} />
      ) : check}
    </div>
  );
}
