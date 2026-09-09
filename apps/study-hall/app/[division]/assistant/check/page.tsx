import { MobileCheckForm } from "@/components/attendance/MobileCheckForm";
import { redirectIfDivisionFeatureDisabled } from "@/lib/division-feature-guard";
import { getAttendanceSnapshot } from "@/lib/services/attendance.service";
import { getCurrentPeriod } from "@/lib/services/period.service";

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
  const currentPeriod = await getCurrentPeriod(params.division);
  const periodId = periods.find((p) => p.id === currentPeriod?.id)?.id ?? periods[0]?.id ?? null;
  const snapshot = periodId
    ? await getAttendanceSnapshot(params.division, today, periodId)
    : { students: [], records: [] };

  return (
    <div className="admin-flat-page">
      <section className="admin-section">
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
