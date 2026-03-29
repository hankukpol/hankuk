import Link from "next/link";
import { AttendStatus } from "@prisma/client";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { hasDatabaseConfig } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { getStudentPortalViewer } from "@/lib/student-portal/service";

export const dynamic = "force-dynamic";

const STATUS_COLOR: Record<AttendStatus, string> = {
  PRESENT: "bg-forest",
  LATE: "bg-amber-400",
  ABSENT: "bg-red-400",
  EXCUSED: "bg-slate-400",
};

const STATUS_LABEL: Record<AttendStatus, string> = {
  PRESENT: "출석",
  LATE: "지각",
  ABSENT: "결석",
  EXCUSED: "공결",
};

const STATUS_DOT_TITLE: Record<AttendStatus, string> = {
  PRESENT: "출석",
  LATE: "지각",
  ABSENT: "결석",
  EXCUSED: "공결",
};

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function readIntParam(
  sp: PageProps["searchParams"],
  key: string,
  fallback: number,
): number {
  const v = sp?.[key];
  const raw = Array.isArray(v) ? v[0] : v;
  const n = raw ? parseInt(raw, 10) : NaN;
  return isNaN(n) ? fallback : n;
}

export default async function AttendanceCalendarPage({
  searchParams,
}: PageProps) {
  const now = new Date();
  const year = readIntParam(searchParams, "year", now.getFullYear());
  const month = readIntParam(searchParams, "month", now.getMonth() + 1);

  if (!hasDatabaseConfig()) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <h1 className="text-2xl font-semibold">출석 달력</h1>
            <p className="mt-2 text-sm text-slate">
              DB 연결 후 사용할 수 있습니다.
            </p>
          </section>
        </div>
      </main>
    );
  }

  const viewer = await getStudentPortalViewer();

  if (!viewer) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <StudentLookupForm redirectPath="/student/attendance/calendar" />
          </section>
        </div>
      </main>
    );
  }

  // Clamp month to 1-12
  const safeMonth = Math.max(1, Math.min(12, month));
  const safeYear = Math.max(2020, Math.min(2099, year));

  const monthStart = new Date(safeYear, safeMonth - 1, 1);
  const monthEnd = new Date(safeYear, safeMonth, 1);

  // Fetch attendance records for this month.
  // LectureAttendance fields: id, sessionId, studentId, status, note, checkedAt, checkedBy
  // session (LectureSession): sessionDate (Date), schedule (LectureSchedule): subjectName
  const records = await getPrisma().lectureAttendance.findMany({
    where: {
      studentId: viewer.examNumber,
      session: {
        sessionDate: {
          gte: monthStart,
          lt: monthEnd,
        },
      },
    },
    include: {
      session: {
        select: {
          sessionDate: true,
          schedule: {
            select: { subjectName: true },
          },
        },
      },
    },
    orderBy: { checkedAt: "asc" },
  });

  // Group by day-of-month using session.sessionDate
  type DayRecord = { status: AttendStatus; subjectName: string | null };
  const dayMap: Record<number, DayRecord[]> = {};
  for (const r of records) {
    const day = r.session.sessionDate.getDate();
    if (!dayMap[day]) dayMap[day] = [];
    dayMap[day].push({
      status: r.status,
      subjectName: r.session.schedule?.subjectName ?? null,
    });
  }

  // Monthly stats
  const statusCounts: Record<AttendStatus, number> = {
    PRESENT: 0,
    LATE: 0,
    ABSENT: 0,
    EXCUSED: 0,
  };
  for (const r of records) {
    statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
  }
  const total = records.length;
  const attended =
    statusCounts.PRESENT + statusCounts.LATE + statusCounts.EXCUSED;
  const rate = total > 0 ? Math.round((attended / total) * 100) : 0;

  // Build calendar grid (Mon–Sun columns)
  const daysInMonth = new Date(safeYear, safeMonth, 0).getDate();
  const firstDayOfWeek = new Date(safeYear, safeMonth - 1, 1).getDay(); // 0=Sun
  const mondayOffset = (firstDayOfWeek + 6) % 7; // Convert to Monday-start

  const cells: (number | null)[] = [];
  for (let i = 0; i < mondayOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  // Prev/next month navigation links
  const prevMonth =
    safeMonth === 1
      ? `?year=${safeYear - 1}&month=12`
      : `?year=${safeYear}&month=${safeMonth - 1}`;
  const nextMonth =
    safeMonth === 12
      ? `?year=${safeYear + 1}&month=1`
      : `?year=${safeYear}&month=${safeMonth + 1}`;
  const isCurrentMonth =
    safeYear === now.getFullYear() && safeMonth === now.getMonth() + 1;

  const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

  return (
    <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="flex items-center gap-3">
            <Link
              href="/student/attendance"
              className="text-sm text-slate hover:text-ink"
            >
              ← 출결 현황
            </Link>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
                Attendance Calendar
              </div>
              <h1 className="mt-3 text-2xl font-semibold sm:text-3xl">
                출석 달력
              </h1>
              <p className="mt-1 text-sm text-slate">
                {safeYear}년 {safeMonth}월
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={`/student/attendance/calendar${prevMonth}`}
                className="rounded-lg border border-ink/10 px-3 py-1.5 text-sm hover:bg-mist"
                aria-label="이전 달"
              >
                ‹
              </Link>
              {!isCurrentMonth && (
                <Link
                  href="/student/attendance/calendar"
                  className="rounded-lg border border-ink/10 px-3 py-1.5 text-xs hover:bg-mist"
                >
                  오늘
                </Link>
              )}
              <Link
                href={`/student/attendance/calendar${nextMonth}`}
                className="rounded-lg border border-ink/10 px-3 py-1.5 text-sm hover:bg-mist"
                aria-label="다음 달"
              >
                ›
              </Link>
            </div>
          </div>
        </section>

        {/* Monthly stats */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(["PRESENT", "LATE", "ABSENT", "EXCUSED"] as AttendStatus[]).map(
            (s) => (
              <div
                key={s}
                className="rounded-[28px] border border-ink/10 bg-white p-4 shadow-panel"
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`h-2.5 w-2.5 rounded-full ${STATUS_COLOR[s]}`}
                  />
                  <p className="text-xs text-slate">{STATUS_LABEL[s]}</p>
                </div>
                <p className="mt-2 text-2xl font-bold text-ink">
                  {statusCounts[s]}
                </p>
              </div>
            ),
          )}
        </section>

        {/* Attendance rate banner */}
        <section className="rounded-[28px] border border-ink/10 bg-white p-4 shadow-panel sm:p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm text-slate">
              이번 달 수업 <span className="font-medium text-ink">{total}회</span>{" "}
              중 출결 확인 완료
            </div>
            <div className="text-right">
              <span className="text-2xl font-bold text-forest">{rate}%</span>
              <p className="text-xs text-slate">출석률</p>
            </div>
          </div>
          {total > 0 && (
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-mist">
              <div
                className="h-full rounded-full bg-forest transition-all"
                style={{ width: `${rate}%` }}
              />
            </div>
          )}
        </section>

        {/* Calendar grid */}
        <section className="rounded-[32px] border border-ink/10 bg-white p-4 shadow-panel sm:p-6">
          {/* Day-of-week header */}
          <div className="mb-2 grid grid-cols-7">
            {DAY_LABELS.map((d, i) => (
              <div
                key={d}
                className={`py-1 text-center text-xs font-medium ${
                  i === 5
                    ? "text-blue-400"
                    : i === 6
                      ? "text-red-400"
                      : "text-slate"
                }`}
              >
                {d}
              </div>
            ))}
          </div>

          {/* Weeks */}
          <div className="space-y-1">
            {weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 gap-1">
                {week.map((day, di) => {
                  if (!day) return <div key={di} className="aspect-square" />;
                  const dayRecords = dayMap[day] ?? [];
                  const isToday =
                    isCurrentMonth && day === now.getDate();
                  // Day background: today → ember tint, has records → subtle mist
                  const cellBg = isToday
                    ? "bg-ember/10 ring-1 ring-ember"
                    : dayRecords.length > 0
                      ? "bg-mist/50"
                      : "";
                  const dayTextColor = isToday
                    ? "font-bold text-ember"
                    : di === 5
                      ? "text-blue-400"
                      : di === 6
                        ? "text-red-400"
                        : "text-ink";

                  return (
                    <div
                      key={di}
                      className={`aspect-square rounded-xl p-1 flex flex-col items-center ${cellBg}`}
                    >
                      <span
                        className={`text-xs leading-none ${dayTextColor}`}
                      >
                        {day}
                      </span>
                      {/* Status dots — up to 4 visible */}
                      <div className="mt-0.5 flex flex-wrap justify-center gap-0.5">
                        {dayRecords.slice(0, 4).map((r, ri) => (
                          <div
                            key={ri}
                            title={`${STATUS_DOT_TITLE[r.status]}${r.subjectName ? ` — ${r.subjectName}` : ""}`}
                            className={`h-1.5 w-1.5 rounded-full ${STATUS_COLOR[r.status]}`}
                          />
                        ))}
                        {dayRecords.length > 4 && (
                          <div
                            className="h-1.5 w-1.5 rounded-full bg-slate-300"
                            title={`+${dayRecords.length - 4}개 더`}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-ink/5 pt-4">
            {(["PRESENT", "LATE", "ABSENT", "EXCUSED"] as AttendStatus[]).map(
              (s) => (
                <div
                  key={s}
                  className="flex items-center gap-1.5 text-xs text-slate"
                >
                  <div
                    className={`h-2 w-2 rounded-full ${STATUS_COLOR[s]}`}
                  />
                  {STATUS_LABEL[s]}
                </div>
              ),
            )}
            <div className="ml-auto text-xs text-slate">
              출석률{" "}
              <span className="font-semibold text-ink">{rate}%</span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
