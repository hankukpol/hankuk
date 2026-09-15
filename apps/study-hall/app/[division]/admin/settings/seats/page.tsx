import { SeatEditor } from "@/components/seats/SeatEditor";
import { redirectIfDivisionFeatureDisabled } from "@/lib/division-feature-guard";
import { getSeatLayout, listStudyRooms } from "@/lib/services/seat.service";
import { getDivisionSettings } from "@/lib/services/settings.service";
import { listStudents } from "@/lib/services/student.service";
import { SettingsPageShell } from "@/components/settings/SettingsPageShell";

type SeatSettingsPageProps = {
  params: {
    division: string;
  };
};

export default async function SeatSettingsPage({ params }: SeatSettingsPageProps) {
  await redirectIfDivisionFeatureDisabled(params.division, "seatManagement");

  const [rooms, students, settings] = await Promise.all([
    listStudyRooms(params.division),
    listStudents(params.division),
    getDivisionSettings(params.division),
  ]);
  const layout = await getSeatLayout(params.division, rooms[0]?.id);

  return (
    <SettingsPageShell
      divisionSlug={params.division}
      activeId="seats"
      title="자습실 / 좌석 배치 설정"
      description="자습실 구성과 좌석 배치, 학생 배정과 좌석 이동을 업무별 탭에서 관리합니다."
    >
      <SeatEditor
        divisionSlug={params.division}
        initialRooms={rooms}
        initialLayout={layout}
        students={students}
        expirationWarningDays={settings.expirationWarningDays}
      />
    </SettingsPageShell>
  );
}
