import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";

import { AttendanceCalendar } from "@/components/student-view/AttendanceCalendar";
import { StudentArrivals } from "@/components/arrivals/StudentArrivals";
import { StudentPortalFrame } from "@/components/student-view/StudentPortalFrame";
import {
  PortalMetricCard,
  PortalSectionHeader,
  portalMetricGridClass,
} from "@/components/student-view/StudentPortalUi";
import { requireDivisionStudentAccess } from "@/lib/auth";
import { isNotFoundError } from "@/lib/errors";
import { getStudentDashboardData } from "@/lib/services/student-dashboard.service";
import { ATTENDANCE_LEGEND } from "@/lib/student-words";

type StudentAttendancePageProps = {
  params: {
    division: string;
  };
  searchParams?: {
    view?: string;
  };
};

export default async function StudentAttendancePage({
  params,
  searchParams,
}: StudentAttendancePageProps) {
  // 교시 출석과 등원 시각은 서로 다른 기록이라 한 화면에 섞지 않는다(운영자 요청 2026-10-07).
  const arrivalsView = searchParams?.view === "arrivals";
  const base = `/${params.division}/student/attendance`;
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
        pointsEnabled={data.featureFlags.pointManagement}
        examsEnabled={data.featureFlags.examManagement}
        title="출석 상세"
      >
        <section className={portalMetricGridClass}>
          <PortalMetricCard
            label="이번 달 출석률"
            value={`${data.summary.monthlyAttendanceRate}%`}
            caption={`${data.summary.monthlyAttendedCount} / ${data.summary.monthlyExpectedCount}교시 출석`}
          />
          <PortalMetricCard
            label="이번 주 출석"
            value={`${data.summary.weeklyAttendedCount}/${data.summary.weeklyExpectedCount}`}
            caption="끝난 필수 교시만 세요"
          />
        </section>

        <nav className="admin-subtabs" aria-label="출석 기록 종류">
          <Link className="admin-subtab" href={base} prefetch={false} aria-current={!arrivalsView ? "page" : undefined}>
            교시 출석
          </Link>
          <Link className="admin-subtab" href={`${base}?view=arrivals`} prefetch={false} aria-current={arrivalsView ? "page" : undefined}>
            등원 시각
          </Link>
        </nav>

        {arrivalsView ? (
          <StudentArrivals divisionSlug={params.division} />
        ) : (
          /* DESIGN.md 5.2 · 5.8 — 표를 감싼 컨테이너에 테두리를 두지 않는다. */
          <section className="min-w-0">
            <PortalSectionHeader
              title="이번 주 교시별 출석"
              icon={<ClipboardList className="h-5 w-5" />}
            />

            <div className="mt-3 min-w-0">
              <AttendanceCalendar weeklyAttendance={data.weeklyAttendance} />
            </div>

            {/* 표 칸의 짧은 말을 아래에서 풀어 준다. 색은 업무 의미가 있는 출결 상태색 그대로다. */}
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px]" aria-label="출석 표시 뜻">
              {ATTENDANCE_LEGEND.map((item) => (
                <li key={item.short}>
                  <span className={`font-semibold ${item.className}`}>{item.short}</span>
                  <span className="admin-help ml-1">{item.long}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </StudentPortalFrame>
    );
  } catch (error) {
    if (isNotFoundError(error)) {
      notFound();
    }

    throw error;
  }
}
