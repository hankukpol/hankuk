import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { LectureOverviewClient } from "./lecture-overview-client";

export const dynamic = "force-dynamic";

export default async function LectureAttendanceOverviewPage() {
  await requireAdminContext(AdminRole.TEACHER);

  const prisma = getPrisma();

  // Today's date (midnight)
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayStr =
    today.getFullYear() +
    "-" +
    String(today.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(today.getDate()).padStart(2, "0");

  // Load today's sessions with attendance stats and enrollment count
  const sessions = await prisma.lectureSession.findMany({
    where: { sessionDate: today },
    include: {
      schedule: {
        include: {
          cohort: { select: { id: true, name: true, examCategory: true } },
        },
      },
      attendances: { select: { status: true } },
    },
    orderBy: [{ startTime: "asc" }],
  });

  // Also load upcoming sessions for the next 7 days (for reference)
  const weekAhead = new Date(today);
  weekAhead.setDate(weekAhead.getDate() + 7);
  weekAhead.setHours(23, 59, 59, 999);

  const upcomingSessions = await prisma.lectureSession.findMany({
    where: {
      sessionDate: { gt: today, lte: weekAhead },
      isCancelled: false,
    },
    include: {
      schedule: {
        include: {
          cohort: { select: { id: true, name: true, examCategory: true } },
        },
      },
      attendances: { select: { id: true } },
    },
    orderBy: [{ sessionDate: "asc" }, { startTime: "asc" }],
    take: 20,
  });

  // Serialise today's sessions
  const todaySessions = sessions.map((s) => {
    const total = s.attendances.length;
    const present = s.attendances.filter((a) => a.status === "PRESENT").length;
    const late = s.attendances.filter((a) => a.status === "LATE").length;
    const absent = s.attendances.filter((a) => a.status === "ABSENT").length;
    const excused = s.attendances.filter((a) => a.status === "EXCUSED").length;
    const recorded = total;

    // Input status: "complete" if attendance recorded, "none" if not
    let inputStatus: "complete" | "partial" | "none";
    if (total === 0) {
      inputStatus = "none";
    } else if (present + late + absent + excused >= total && total > 0) {
      inputStatus = "complete";
    } else {
      inputStatus = "partial";
    }

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
      stats: { total, present, late, absent, excused, recorded },
      inputStatus,
    };
  });

  // Serialise upcoming sessions
  const upcomingData = upcomingSessions.map((s) => ({
    id: s.id,
    sessionDate: s.sessionDate.toISOString(),
    startTime: s.startTime,
    endTime: s.endTime,
    subjectName: s.schedule.subjectName,
    instructorName: s.schedule.instructorName ?? null,
    cohortName: s.schedule.cohort.name,
    examCategory: s.schedule.cohort.examCategory,
  }));

  // Summary stats
  const activeToday = todaySessions.filter((s) => !s.isCancelled);
  const completedCount = activeToday.filter((s) => s.inputStatus === "complete").length;
  const partialCount = activeToday.filter((s) => s.inputStatus === "partial").length;
  const noneCount = activeToday.filter((s) => s.inputStatus === "none").length;
  const completionRate =
    activeToday.length > 0
      ? Math.round((completedCount / activeToday.length) * 100)
      : 0;

  return (
    <div className="p-8 sm:p-10">
      {/* Badge */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        강의 출결 · 오늘 현황
      </div>

      {/* Header */}
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">오늘 강의 출결 현황</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate">
            {todayStr} 기준 · 전체 {activeToday.length}개 강의 · 입력완료율{" "}
            <span
              className={
                completionRate === 100
                  ? "font-semibold text-forest"
                  : completionRate >= 50
                  ? "font-semibold text-amber-700"
                  : "font-semibold text-red-600"
              }
            >
              {completionRate}%
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/admin/attendance/lecture?date=${todayStr}`}
            className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-4 py-2 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
          >
            날짜별 보기
          </Link>
          <Link
            href="/admin/attendance/makeups"
            className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-100"
          >
            보강 관리
          </Link>
        </div>
      </div>

      {/* KPI row */}
      <div className="mt-8 grid gap-4 sm:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate">전체 강의</p>
          <p className="mt-3 text-3xl font-bold text-ink">
            {activeToday.length}
            <span className="ml-1 text-base font-normal text-slate">개</span>
          </p>
          <p className="mt-1 text-xs text-slate">오늘 예정된 강의 세션</p>
        </div>

        <div
          className={`rounded-[28px] border p-6 shadow-sm ${
            completedCount === activeToday.length && activeToday.length > 0
              ? "border-forest/30 bg-forest/10"
              : "border-forest/15 bg-forest/5"
          }`}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-forest">입력 완료</p>
          <p className="mt-3 text-3xl font-bold text-forest">
            {completedCount}
            <span className="ml-1 text-base font-normal text-forest/70">개</span>
          </p>
          <p className="mt-1 text-xs text-forest/70">출결 데이터 입력 완료</p>
        </div>

        <div
          className={`rounded-[28px] border p-6 shadow-sm ${
            partialCount > 0 ? "border-amber-300 bg-amber-50" : "border-amber-200 bg-amber-50/60"
          }`}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">부분 입력</p>
          <p className="mt-3 text-3xl font-bold text-amber-700">
            {partialCount}
            <span className="ml-1 text-base font-normal text-amber-600">개</span>
          </p>
          <p className="mt-1 text-xs text-amber-600">일부 학생만 입력됨</p>
        </div>

        <div
          className={`rounded-[28px] border p-6 shadow-sm ${
            noneCount > 0 ? "border-red-300 bg-red-50" : "border-red-200 bg-red-50/60"
          }`}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-red-700">미입력</p>
          <p className="mt-3 text-3xl font-bold text-red-600">
            {noneCount}
            <span className="ml-1 text-base font-normal text-red-500">개</span>
          </p>
          <p className="mt-1 text-xs text-red-500">출결 미처리 강의</p>
        </div>
      </div>

      {/* Client component for interactive filtering */}
      <div className="mt-8">
        <LectureOverviewClient
          todaySessions={todaySessions}
          upcomingSessions={upcomingData}
          todayStr={todayStr}
        />
      </div>
    </div>
  );
}
