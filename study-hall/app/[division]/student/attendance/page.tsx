import { notFound, redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";

import { AttendanceCalendar } from "@/components/student-view/AttendanceCalendar";
import { StudentPortalFrame } from "@/components/student-view/StudentPortalFrame";
import {
  PortalMetricCard,
  PortalSectionHeader,
  portalSectionClass,
} from "@/components/student-view/StudentPortalUi";
import { requireDivisionStudentAccess } from "@/lib/auth";
import { isNotFoundError } from "@/lib/errors";
import { getStudentDashboardData } from "@/lib/services/student-dashboard.service";

type StudentAttendancePageProps = {
  params: {
    division: string;
  };
};

const legendItems = [
  { label: "출석", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  { label: "지각", className: "border-amber-200 bg-amber-50 text-amber-700" },
  { label: "결석", className: "border-rose-200 bg-rose-50 text-rose-700" },
  { label: "휴무", className: "border-slate-300 bg-slate-100 text-slate-700" },
  { label: "예정/미처리", className: "border-slate-200 bg-slate-50 text-slate-500" },
] as const;

export default async function StudentAttendancePage({
  params,
}: StudentAttendancePageProps) {
  const session = await requireDivisionStudentAccess(params.division);

  try {
    const data = await getStudentDashboardData(params.division, session.studentId);

    if (!data.featureFlags.attendanceManagement) {
      redirect(`/${params.division}/student`);
    }

    return (
      <StudentPortalFrame
        division={data.division}
        student={data.student}
        current="attendance"
        attendanceEnabled={data.featureFlags.attendanceManagement}
        announcementsEnabled={data.featureFlags.announcements}
        pointsEnabled={data.featureFlags.pointManagement}
        examsEnabled={data.featureFlags.examManagement}
        title="출석 상세"
        description="날짜 기준 주간 출석표와 주간 출석 요약을 확인할 수 있습니다."
      >
        <section className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <PortalMetricCard
            label="이번 달 출석률"
            value={`${data.summary.monthlyAttendanceRate}%`}
            caption={`${data.summary.monthlyAttendedCount}/${data.summary.monthlyExpectedCount} 교시 반영`}
          />
          <PortalMetricCard
            label="이번 주 출석"
            value={`${data.summary.weeklyAttendedCount}/${data.summary.weeklyExpectedCount}`}
            caption="필수 교시 종료분 기준"
          />
        </section>

        <section className={portalSectionClass}>
          <PortalSectionHeader
            title="날짜별 주간 출석표"
            description="날짜를 행으로, 교시를 열로 두고 한 번에 확인할 수 있도록 정리했습니다."
            icon={<ClipboardList className="h-5 w-5" />}
            action={
              <div className="flex flex-wrap justify-end gap-1.5">
                {legendItems.map((item) => (
                  <span
                    key={item.label}
                    className={`inline-flex rounded-[10px] border px-2 py-1 text-[11px] font-medium ${item.className}`}
                  >
                    {item.label}
                  </span>
                ))}
              </div>
            }
          />

          <div className="mt-3 min-w-0">
            <AttendanceCalendar weeklyAttendance={data.weeklyAttendance} />
          </div>
        </section>
      </StudentPortalFrame>
    );
  } catch (error) {
    if (isNotFoundError(error)) {
      notFound();
    }

    throw error;
  }
}
