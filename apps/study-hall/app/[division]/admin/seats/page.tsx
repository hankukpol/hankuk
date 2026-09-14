import { SeatStatusBoard } from "@/components/seats/SeatStatusBoard";
import { redirectIfDivisionFeatureDisabled } from "@/lib/division-feature-guard";
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

  const [allRooms, students, featureSettings] = await Promise.all([
    listStudyRooms(params.division),
    listStudents(params.division),
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
          좌석별 배정 학생과 공석을 확인하고 좌석을 배정하거나 이동합니다.
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
          paymentEnabled={featureSettings.featureFlags.paymentManagement}
          pointsEnabled={featureSettings.featureFlags.pointManagement}
          studentManagementEnabled={featureSettings.featureFlags.studentManagement}
        />
      )}
    </div>
  );
}
