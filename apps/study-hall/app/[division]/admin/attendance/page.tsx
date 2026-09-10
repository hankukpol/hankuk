import { AttendancePenaltyReview } from "@/components/attendance/AttendancePenaltyReview";
import { getManagementPolicy } from "@/lib/services/management-policy.service";
import { getDivisionFeatureSettings } from "@/lib/services/settings.service";
import { headers } from "next/headers";

import { ResponsiveAttendanceBoard } from "@/components/attendance/ResponsiveAttendanceBoard";
import { redirectIfDivisionFeatureDisabled } from "@/lib/division-feature-guard";
import {
  getAttendanceSnapshot,
  getAttendanceStats,
  type AttendanceSnapshot,
} from "@/lib/services/attendance.service";
import { getCurrentPeriod } from "@/lib/services/period.service";
import {
  filterOperationalStudyRooms,
  getSeatLayout,
  listStudyRooms,
} from "@/lib/services/seat.service";

function getTodayInKst() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function getInitialModeFromUserAgent(userAgent: string | null): "mobile" | "desktop" {
  if (!userAgent) {
    return "desktop";
  }

  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)
    ? "mobile"
    : "desktop";
}

type AdminAttendancePageProps = {
  params: {
    division: string;
  };
};

type AttendanceRecord = AttendanceSnapshot["records"][number];

export default async function AdminAttendancePage({ params }: AdminAttendancePageProps) {
  await redirectIfDivisionFeatureDisabled(params.division, "attendanceManagement");

  const today = getTodayInKst();
  const [snapshot, stats, currentPeriod, allSeatRooms, policy, featureSettings] = await Promise.all([
    getAttendanceSnapshot(params.division, today),
    getAttendanceStats(params.division, today, today),
    getCurrentPeriod(params.division),
    listStudyRooms(params.division),
    getManagementPolicy(params.division),
    getDivisionFeatureSettings(params.division),
  ]);

  // 비활성 자습실은 운영 화면에서 숨긴다. 배정된 학생이 남아 있으면 그대로 보여준다.
  const seatRooms = filterOperationalStudyRooms(allSeatRooms);
  // 배치도는 이 목록의 첫 강의실로 가져온다. 강의실을 지정하지 않으면 서비스 기본값이
  // 오는데, 그 기본값은 비활성 자습실까지 포함한 순서라 좌석 현황과 다른 방이 나왔다.
  // 두 화면이 같은 좌석을 보여야 한다.
  const initialSeatLayout = await getSeatLayout(params.division, seatRooms[0]?.id);

  const mobilePeriodId = currentPeriod?.id ?? snapshot.periods[0]?.id ?? null;
  const initialMode = getInitialModeFromUserAgent(headers().get("user-agent"));

  return (
    <div className="admin-flat-page">
      <section className="admin-section">
        <h1 className="admin-page-title">관리자 출석부</h1>
        <p className="admin-page-description">
          데스크톱에서는 학생 x 교시 매트릭스로 한 번에 확인하고, 모바일에서는 좌석·학생·출결
          표로 현재 교시를 빠르게 체크할 수 있습니다.
        </p>
      </section>

      <ResponsiveAttendanceBoard
        initialMode={initialMode}
        desktopProps={{
          divisionSlug: params.division,
          initialDate: today,
          initialPeriods: snapshot.periods,
          initialStudents: snapshot.students,
          initialRecords: snapshot.records,
          initialStats: stats,
          seatRooms,
          initialSeatLayout,
        }}
        mobileProps={{
          divisionSlug: params.division,
          initialDate: today,
          initialPeriods: snapshot.periods,
          initialPeriodId: mobilePeriodId,
          initialStudents: snapshot.students,
          initialRecords: mobilePeriodId
            ? snapshot.records.filter((record: AttendanceRecord) => record.periodId === mobilePeriodId)
            : [],
        }}
      />
      {policy && featureSettings.featureFlags.pointManagement && <AttendancePenaltyReview divisionSlug={params.division} effectiveFrom={policy.effectiveFrom} students={snapshot.students} />}
    </div>
  );
}
