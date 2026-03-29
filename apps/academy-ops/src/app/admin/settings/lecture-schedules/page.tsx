import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { LectureScheduleManager } from "./lecture-schedule-manager";

export const dynamic = "force-dynamic";

export default async function LectureSchedulesSettingsPage() {
  await requireAdminContext(AdminRole.MANAGER);

  // 모든 스케줄 (활성/비활성 포함)
  const rawSchedules = await getPrisma().lectureSchedule.findMany({
    include: {
      cohort: {
        select: { id: true, name: true, examCategory: true, isActive: true },
      },
      sessions: {
        select: { id: true },
        orderBy: { sessionDate: "desc" },
        take: 1,
      },
    },
    orderBy: [{ cohort: { name: "asc" } }, { dayOfWeek: "asc" }, { startTime: "asc" }],
  });

  const schedules = rawSchedules.map((s) => ({
    id: s.id,
    cohortId: s.cohortId,
    subjectName: s.subjectName,
    instructorName: s.instructorName ?? null,
    dayOfWeek: s.dayOfWeek,
    startTime: s.startTime,
    endTime: s.endTime,
    isActive: s.isActive,
    createdAt: s.createdAt.toISOString(),
    cohort: s.cohort,
    sessionCount: s.sessions.length,
  }));

  // 기수 목록 (스케줄 생성 시 선택용)
  const cohorts = await getPrisma().cohort.findMany({
    where: { isActive: true },
    orderBy: [{ startDate: "desc" }],
    select: { id: true, name: true, examCategory: true, startDate: true, endDate: true },
  });

  const cohortsData = cohorts.map((c) => ({
    id: c.id,
    name: c.name,
    examCategory: c.examCategory,
    startDate: c.startDate.toISOString(),
    endDate: c.endDate.toISOString(),
  }));

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        설정 · 강의 스케줄
      </div>
      <h1 className="mt-5 text-3xl font-semibold">강의 스케줄 설정</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        기수별 강의 스케줄을 설정합니다. 스케줄은 요일·시간대·과목으로 구성되며,
        날짜별 강의 세션을 생성할 때 기준이 됩니다.
      </p>
      <div className="mt-8">
        <LectureScheduleManager initialSchedules={schedules} cohorts={cohortsData} />
      </div>
    </div>
  );
}
