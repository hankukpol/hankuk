import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { AttendanceLectureClient } from "./attendance-lecture-client";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: { date?: string };
};

export default async function LectureAttendancePage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.TEACHER);

  const { date: dateParam } = searchParams;

  // 날짜 결정 (기본값: 오늘)
  const targetDate = dateParam ? new Date(dateParam) : new Date();
  const dateOnly = new Date(
    targetDate.getFullYear(),
    targetDate.getMonth(),
    targetDate.getDate(),
  );
  const dateStr =
    dateOnly.getFullYear() +
    "-" +
    String(dateOnly.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(dateOnly.getDate()).padStart(2, "0");

  // 해당 날짜의 세션 목록 조회
  const sessions = await getPrisma().lectureSession.findMany({
    where: { sessionDate: dateOnly },
    include: {
      schedule: {
        include: {
          cohort: {
            select: { id: true, name: true, examCategory: true },
          },
        },
      },
      attendances: { select: { status: true } },
    },
    orderBy: [{ startTime: "asc" }],
  });

  // 통계 포함 직렬화
  const sessionsData = sessions.map((s) => {
    const total = s.attendances.length;
    const present = s.attendances.filter((a) => a.status === "PRESENT").length;
    const late = s.attendances.filter((a) => a.status === "LATE").length;
    const absent = s.attendances.filter((a) => a.status === "ABSENT").length;
    const excused = s.attendances.filter((a) => a.status === "EXCUSED").length;
    return {
      id: s.id,
      scheduleId: s.scheduleId,
      sessionDate: s.sessionDate.toISOString(),
      startTime: s.startTime,
      endTime: s.endTime,
      isCancelled: s.isCancelled,
      note: s.note ?? null,
      schedule: {
        id: s.schedule.id,
        cohortId: s.schedule.cohortId,
        subjectName: s.schedule.subjectName,
        instructorName: s.schedule.instructorName ?? null,
        dayOfWeek: s.schedule.dayOfWeek,
        cohort: s.schedule.cohort,
      },
      stats: { total, present, late, absent, excused },
      hasAttendance: total > 0,
    };
  });

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        강의 출결 관리
      </div>
      <h1 className="mt-5 text-3xl font-semibold">강의 출결 현황</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        날짜별 강의 세션 출결 현황을 조회하고 출결을 입력합니다.
      </p>
      <div className="mt-8">
        <AttendanceLectureClient initialSessions={sessionsData} initialDate={dateStr} />
      </div>
    </div>
  );
}
