import { MobileCheckForm } from "@/components/attendance/MobileCheckForm";
import { redirectIfDivisionFeatureDisabled } from "@/lib/division-feature-guard";
import { getAttendanceSnapshot } from "@/lib/services/attendance.service";
import { selectPeriodForCheck, kstMinutesOfDay } from "@/lib/attendance-meta";

// 오늘의 출결과 현재 교시를 보여주는 화면이라 캐시하지 않는다. 캐시되면 처음 그려진
// 시각의 교시가 굳는다.
export const dynamic = "force-dynamic";

function getTodayInKst() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

type AssistantCheckPageProps = {
  params: {
    division: string;
  };
};


export default async function AssistantCheckPage({ params }: AssistantCheckPageProps) {
  await redirectIfDivisionFeatureDisabled(
    params.division,
    "attendanceManagement",
    `/${params.division}/assistant`,
  );

  const today = getTodayInKst();
  const initialSnapshot = await getAttendanceSnapshot(params.division, today);
  const periods = initialSnapshot.periods;
  // 쉬는 시간에도 곧 할 교시가 잡혀야 한다. 목록은 이미 관리규정이 거른 출석 교시다.
  const periodId = selectPeriodForCheck(periods, kstMinutesOfDay())?.id ?? null;
  const snapshot = periodId
    ? await getAttendanceSnapshot(params.division, today, periodId)
    : { students: [], records: [] };

  return (
    <div className="admin-flat-page">
      <section className="admin-section max-md:sr-only">
        <h1 className="admin-page-title">출석 체크</h1>
        <p className="admin-page-description">
          교시를 고르고 학생별 출결을 지정한 뒤 저장합니다.
        </p>
      </section>

      <MobileCheckForm
        divisionSlug={params.division}
        initialDate={today}
        initialPeriods={periods}
        initialPeriodId={periodId}
        initialStudents={snapshot.students}
        initialRecords={snapshot.records}
      />
    </div>
  );
}
