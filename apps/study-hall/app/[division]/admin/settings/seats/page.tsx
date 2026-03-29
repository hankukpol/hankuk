import { SeatEditor } from "@/components/seats/SeatEditor";
import { redirectIfDivisionFeatureDisabled } from "@/lib/division-feature-guard";
import { getSeatLayout, listStudyRooms } from "@/lib/services/seat.service";
import { getDivisionSettings } from "@/lib/services/settings.service";
import { listStudents } from "@/lib/services/student.service";

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
    <div className="space-y-6">
      <section className="rounded-[10px] border border-slate-200-black/5 bg-white px-6 py-6 shadow-[0_16px_40px_rgba(18,32,56,0.06)]">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-950">
          자습실 / 좌석 배치 설정
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
          자습실을 여러 개 만들고, 자습실마다 행·열·복도 칸을 지정한 뒤 좌석을 직접 그려서 번호를 부여할 수 있습니다.
          학생 배정과 좌석 이동도 같은 화면에서 함께 처리됩니다.
        </p>
      </section>

      <SeatEditor
        divisionSlug={params.division}
        initialRooms={rooms}
        initialLayout={layout}
        students={students}
        expirationWarningDays={settings.expirationWarningDays}
      />
    </div>
  );
}
