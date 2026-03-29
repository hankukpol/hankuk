import { MobileCheckForm } from "@/components/attendance/MobileCheckForm";
import { redirectIfDivisionFeatureDisabled } from "@/lib/division-feature-guard";
import { getAttendanceSnapshot } from "@/lib/services/attendance.service";
import { getCurrentPeriod, getPeriods } from "@/lib/services/period.service";

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
  const periods = await getPeriods(params.division);
  const currentPeriod = await getCurrentPeriod(params.division);
  const periodId = currentPeriod?.id ?? periods[0]?.id ?? null;
  const snapshot = periodId
    ? await getAttendanceSnapshot(params.division, today, periodId)
    : { students: [], records: [] };

  return (
    <MobileCheckForm
      divisionSlug={params.division}
      initialDate={today}
      initialPeriods={periods}
      initialPeriodId={periodId}
      initialStudents={snapshot.students}
      initialRecords={snapshot.records}
    />
  );
}
