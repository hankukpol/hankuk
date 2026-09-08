import { SeatStatusBoard } from "@/components/seats/SeatStatusBoard";
import { redirectIfDivisionFeatureDisabled } from "@/lib/division-feature-guard";
import { getAttendanceSnapshot } from "@/lib/services/attendance.service";
import {
  filterOperationalStudyRooms,
  getSeatLayout,
  listStudyRooms,
} from "@/lib/services/seat.service";
import { getDivisionFeatureSettings } from "@/lib/services/settings.service";
import { listStudents } from "@/lib/services/student.service";


type Props = {
  params: { division: string };
};

export default async function SeatStatusPage({ params }: Props) {
  await redirectIfDivisionFeatureDisabled(params.division, "seatManagement");

  const today = new Date()
    .toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" })
    .slice(0, 10);

  const [allRooms, students, todaySnapshot, featureSettings] = await Promise.all([
    listStudyRooms(params.division),
    listStudents(params.division),
    getAttendanceSnapshot(params.division, today),
    getDivisionFeatureSettings(params.division),
  ]);

  const rooms = filterOperationalStudyRooms(allRooms);
  const layout = await getSeatLayout(params.division, rooms[0]?.id);

  return (
    <div className="admin-flat-page">
      {/* 헤더 */}
      <section>
        <h1 className="admin-page-title">좌석 현황</h1>
        <p className="admin-help mt-2">
          오늘({today}) 기준 좌석 배치와 출석 상태를 한눈에 확인합니다.
          좌석을 클릭하면 학생 상세 정보를 확인할 수 있습니다.
        </p>
      </section>

      {rooms.length === 0 ? (
        <div className="admin-help px-8 py-16 text-center">
          <p className="admin-help">자습실이 없습니다.</p>
          <p className="admin-help mt-1">
            설정 &gt; 자습실/좌석에서 자습실을 먼저 추가해주세요.
          </p>
        </div>
      ) : (
        <SeatStatusBoard
          divisionSlug={params.division}
          initialRooms={rooms}
          initialLayout={layout}
          initialStudents={students}
          todaySnapshot={todaySnapshot}
          attendanceEnabled={featureSettings.featureFlags.attendanceManagement}
          paymentEnabled={featureSettings.featureFlags.paymentManagement}
          pointsEnabled={featureSettings.featureFlags.pointManagement}
          studentManagementEnabled={featureSettings.featureFlags.studentManagement}
        />
      )}
    </div>
  );
}
