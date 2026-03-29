import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import AttendanceAnalyticsClient from "./attendance-analytics-client";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AttendanceAnalyticsPage({
  searchParams,
}: PageProps) {
  await requireAdminContext(AdminRole.TEACHER);

  const sp = searchParams ? await searchParams : {};
  const monthParam = Array.isArray(sp.month) ? sp.month[0] : sp.month;

  const now = new Date();
  let year: number, month: number;
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    [year, month] = monthParam.split("-").map(Number) as [number, number];
  } else {
    year = now.getFullYear();
    month = now.getMonth() + 1;
  }

  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1);
  const prevMonthStr = new Date(year, month - 2, 1).toISOString().slice(0, 7);
  const nextMonthStr =
    month === 12
      ? `${year + 1}-01`
      : `${year}-${String(month + 1).padStart(2, "0")}`;
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const thisMonthStr = `${year}-${String(month).padStart(2, "0")}`;

  // Get this month's classroom attendance logs (legacy view)
  const logs = await getPrisma()
    .classroomAttendanceLog.findMany({
      where: {
        attendDate: { gte: monthStart, lt: monthEnd },
      },
      select: {
        attendType: true,
        attendDate: true,
        classroomId: true,
        classroom: { select: { name: true, generation: true } },
      },
      orderBy: { attendDate: "asc" },
    })
    .catch(() => []);

  // Overall stats
  const total = logs.length;
  const byType = new Map<string, number>();
  for (const log of logs) {
    byType.set(log.attendType, (byType.get(log.attendType) ?? 0) + 1);
  }

  const present = byType.get("NORMAL") ?? 0;
  const live = byType.get("LIVE") ?? 0;
  const excused = byType.get("EXCUSED") ?? 0;
  const absent = byType.get("ABSENT") ?? 0;
  const attendanceRate =
    total > 0 ? Math.round(((present + live + excused) / total) * 100) : 0;

  // Per-classroom breakdown
  const classroomMap = new Map<
    string,
    {
      name: string;
      present: number;
      live: number;
      absent: number;
      excused: number;
      total: number;
    }
  >();
  for (const log of logs) {
    const key = log.classroomId;
    if (!classroomMap.has(key)) {
      classroomMap.set(key, {
        name: log.classroom
          ? `${log.classroom.name}${log.classroom.generation ? ` ${log.classroom.generation}기` : ""}`
          : key,
        present: 0,
        live: 0,
        absent: 0,
        excused: 0,
        total: 0,
      });
    }
    const entry = classroomMap.get(key)!;
    entry.total++;
    if (log.attendType === "ABSENT") entry.absent++;
    else if (log.attendType === "EXCUSED") entry.excused++;
    else if (log.attendType === "LIVE") entry.live++;
    else entry.present++;
  }
  const classroomStats = Array.from(classroomMap.values()).sort(
    (a, b) => b.total - a.total,
  );

  // Daily trend
  const dayMap = new Map<
    string,
    { present: number; absent: number; total: number }
  >();
  for (const log of logs) {
    const day = new Date(log.attendDate).toISOString().slice(0, 10);
    if (!dayMap.has(day)) dayMap.set(day, { present: 0, absent: 0, total: 0 });
    const entry = dayMap.get(day)!;
    entry.total++;
    if (log.attendType === "ABSENT") entry.absent++;
    else entry.present++;
  }
  const dailyTrend = Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, data]) => ({
      day,
      label: new Date(day + "T00:00:00").toLocaleDateString("ko-KR", {
        month: "short",
        day: "numeric",
        weekday: "short",
      }),
      rate: data.total > 0 ? Math.round((data.present / data.total) * 100) : 0,
      ...data,
    }));

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        출결 분석
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">출결 분석 대시보드</h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-slate">
            성적 응시 기준 출석률 추이, 과목별 비교, 요일별 패턴을 한눈에 확인합니다.
            담임반 출결 현황은 월별 섹션에서 확인하세요.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`?month=${prevMonthStr}`}
            className="rounded-lg border border-ink/10 px-3 py-1.5 text-sm text-slate hover:bg-mist"
          >
            ← 이전달
          </Link>
          {thisMonthStr !== currentMonthStr && (
            <Link
              href={`?month=${currentMonthStr}`}
              className="rounded-lg border border-forest/20 bg-forest/5 px-3 py-1.5 text-sm text-forest hover:bg-forest/10"
            >
              이번달
            </Link>
          )}
          {thisMonthStr < currentMonthStr && (
            <Link
              href={`?month=${nextMonthStr}`}
              className="rounded-lg border border-ink/10 px-3 py-1.5 text-sm text-slate hover:bg-mist"
            >
              다음달 →
            </Link>
          )}
        </div>
      </div>

      {/* ── Score-based Analytics (Client Component) ─────────────────────── */}
      <section className="mt-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
          성적 출결 분석 (시험 응시 기준)
        </div>
        <AttendanceAnalyticsClient />
      </section>

      {/* ── Classroom Attendance: Monthly Overview ───────────────────────── */}
      <section className="mt-12">
        <div className="inline-flex items-center gap-2 rounded-full border border-forest/20 bg-forest/5 px-3 py-1 text-xs font-semibold text-forest">
          담임반 출결 — {year}년 {month}월
        </div>

        {/* KPI Cards */}
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-5">
          <div
            className={`rounded-[24px] border p-5 shadow-panel ${
              attendanceRate >= 90
                ? "border-forest/30 bg-forest/5"
                : attendanceRate >= 70
                  ? "border-amber-200 bg-amber-50"
                  : "border-red-200 bg-red-50"
            }`}
          >
            <p className="text-xs font-medium text-slate">출석률</p>
            <p
              className={`mt-2 text-2xl font-bold ${
                attendanceRate >= 90
                  ? "text-forest"
                  : attendanceRate >= 70
                    ? "text-amber-700"
                    : "text-red-700"
              }`}
            >
              {attendanceRate}%
            </p>
            <p className="mt-1 text-xs text-slate">전체 {total}건</p>
          </div>
          <div className="rounded-[24px] border border-ink/10 bg-white p-5 shadow-panel">
            <p className="text-xs font-medium text-slate">정상 출석</p>
            <p className="mt-2 text-2xl font-bold text-forest">{present}건</p>
          </div>
          <div className="rounded-[24px] border border-ink/10 bg-white p-5 shadow-panel">
            <p className="text-xs font-medium text-slate">라이브</p>
            <p className="mt-2 text-2xl font-bold text-sky-600">{live}건</p>
          </div>
          <div className="rounded-[24px] border border-ink/10 bg-white p-5 shadow-panel">
            <p className="text-xs font-medium text-slate">사유 결시</p>
            <p className="mt-2 text-2xl font-bold text-amber-600">{excused}건</p>
          </div>
          <div className="rounded-[24px] border border-ink/10 bg-white p-5 shadow-panel">
            <p className="text-xs font-medium text-slate">무단 결시</p>
            <p className="mt-2 text-2xl font-bold text-red-600">{absent}건</p>
          </div>
        </div>

        {/* Daily trend */}
        {dailyTrend.length > 0 && (
          <div className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
            <h2 className="text-sm font-semibold text-ink">일별 출석률 추이</h2>
            <div className="mt-4 max-h-80 space-y-2 overflow-y-auto">
              {dailyTrend.map((day) => (
                <div key={day.day} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 text-xs text-slate">
                    {day.label}
                  </span>
                  <div className="h-2 flex-1 rounded-full bg-gray-100">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        day.rate >= 90
                          ? "bg-forest"
                          : day.rate >= 70
                            ? "bg-amber-400"
                            : "bg-red-400"
                      }`}
                      style={{ width: `${day.rate}%` }}
                    />
                  </div>
                  <span
                    className={`w-10 text-right text-xs font-semibold ${
                      day.rate >= 90
                        ? "text-forest"
                        : day.rate >= 70
                          ? "text-amber-600"
                          : "text-red-600"
                    }`}
                  >
                    {day.rate}%
                  </span>
                  <span className="w-14 text-right text-xs text-slate">
                    {day.total}명
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Per-classroom */}
        {classroomStats.length > 0 && (
          <div className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
            <h2 className="text-sm font-semibold text-ink">반별 출결 현황</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink/10 text-left text-xs font-medium text-slate">
                    <th className="pb-2">반</th>
                    <th className="pb-2 text-right">총계</th>
                    <th className="pb-2 text-right">정상</th>
                    <th className="pb-2 text-right">라이브</th>
                    <th className="pb-2 text-right">사유결시</th>
                    <th className="pb-2 text-right">무단결시</th>
                    <th className="pb-2 text-right">출석률</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {classroomStats.map((cls) => {
                    const rate =
                      cls.total > 0
                        ? Math.round(
                            ((cls.total - cls.absent) / cls.total) * 100,
                          )
                        : 0;
                    return (
                      <tr key={cls.name}>
                        <td className="py-2 font-medium">{cls.name}</td>
                        <td className="py-2 text-right">{cls.total}</td>
                        <td className="py-2 text-right text-forest">
                          {cls.present}
                        </td>
                        <td className="py-2 text-right text-sky-600">
                          {cls.live}
                        </td>
                        <td className="py-2 text-right text-amber-600">
                          {cls.excused}
                        </td>
                        <td className="py-2 text-right text-red-600">
                          {cls.absent}
                        </td>
                        <td
                          className={`py-2 text-right font-semibold ${
                            rate >= 90
                              ? "text-forest"
                              : rate >= 70
                                ? "text-amber-600"
                                : "text-red-600"
                          }`}
                        >
                          {rate}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {total === 0 && (
          <div className="mt-6 rounded-[24px] border border-ink/10 bg-white p-10 text-center shadow-panel">
            <p className="text-sm text-slate">
              {year}년 {month}월 담임반 출결 데이터가 없습니다.
            </p>
          </div>
        )}
      </section>

      {/* Links */}
      <div className="mt-6 flex flex-wrap gap-3 text-sm">
        <Link
          href="/admin/attendance/calendar"
          className="text-forest hover:underline"
        >
          출결 캘린더 →
        </Link>
        <Link
          href="/admin/attendance/lecture"
          className="text-slate hover:underline"
        >
          강의 출결 →
        </Link>
        <Link
          href="/admin/classrooms"
          className="text-slate hover:underline"
        >
          반 관리 →
        </Link>
      </div>
    </div>
  );
}
