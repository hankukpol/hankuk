import { headers } from "next/headers";

import { ResponsiveAttendanceBoard } from "@/components/attendance/ResponsiveAttendanceBoard";
import { redirectIfDivisionFeatureDisabled } from "@/lib/division-feature-guard";
import {
  getAttendanceSnapshot,
  getAttendanceStats,
  type AttendanceSnapshot,
} from "@/lib/services/attendance.service";
import { getCurrentPeriod } from "@/lib/services/period.service";
import { getSeatLayout, listStudyRooms } from "@/lib/services/seat.service";

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
  const [snapshot, stats, currentPeriod, seatRooms, initialSeatLayout] = await Promise.all([
    getAttendanceSnapshot(params.division, today),
    getAttendanceStats(params.division, today, today),
    getCurrentPeriod(params.division),
    listStudyRooms(params.division),
    getSeatLayout(params.division),
  ]);

  const mobilePeriodId = currentPeriod?.id ?? snapshot.periods[0]?.id ?? null;
  const initialMode = getInitialModeFromUserAgent(headers().get("user-agent"));

  return (
    <div className="space-y-6">
      <section className="rounded-[10px] border border-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(18,32,56,0.08)]">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">출결 관리</p>
        <h1 className="mt-3 text-3xl font-extrabold text-slate-950">관리자 출석부</h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
          데스크톱에서는 학생 x 교시 매트릭스로 한 번에 확인하고, 모바일에서는 스크롤 카드
          형태로 현재 교시를 빠르게 체크할 수 있습니다.
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
    </div>
  );
}
