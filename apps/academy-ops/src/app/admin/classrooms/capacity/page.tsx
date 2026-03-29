import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function utilizationColor(rate: number): string {
  if (rate >= 0.9) return "bg-red-500";
  if (rate >= 0.7) return "bg-amber-500";
  return "bg-forest";
}

function utilizationTextColor(rate: number): string {
  if (rate >= 0.9) return "text-red-600";
  if (rate >= 0.7) return "text-amber-600";
  return "text-forest";
}

function utilizationBadgeBg(rate: number): string {
  if (rate >= 0.9) return "bg-red-50 border-red-200 text-red-700";
  if (rate >= 0.7) return "bg-amber-50 border-amber-200 text-amber-700";
  return "bg-forest/5 border-forest/20 text-forest";
}

function rateLabel(rate: number): string {
  if (rate >= 0.9) return "초과 위험";
  if (rate >= 0.7) return "주의";
  return "여유";
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ClassroomCapacityPage() {
  await requireAdminContext(AdminRole.MANAGER);

  const prisma = getPrisma();
  const today = new Date();
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  // 4-week window for attendance stats
  const fourWeeksAgo = new Date(todayDate);
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

  // Fetch all active classrooms with student counts
  const classrooms = await prisma.classroom.findMany({
    where: { isActive: true },
    include: {
      teacher: { select: { name: true } },
      students: {
        where: { leftAt: null },
        select: { examNumber: true },
      },
    },
    orderBy: [{ generation: "desc" }, { name: "asc" }],
  });

  // Fetch today's attendance logs for all classrooms
  const todayLogs = await prisma.classroomAttendanceLog.findMany({
    where: {
      attendDate: todayDate,
      classroomId: { in: classrooms.map((c) => c.id) },
    },
    select: { classroomId: true, examNumber: true, attendType: true },
  });

  // Fetch last 4 weeks attendance logs for weekly rate calculation
  const weeklyLogs = await prisma.classroomAttendanceLog.findMany({
    where: {
      attendDate: { gte: fourWeeksAgo, lte: todayDate },
      classroomId: { in: classrooms.map((c) => c.id) },
    },
    select: { classroomId: true, attendDate: true, examNumber: true, attendType: true },
  });

  // Group today logs by classroomId
  const todayLogsByRoom = new Map<string, typeof todayLogs>();
  for (const log of todayLogs) {
    const arr = todayLogsByRoom.get(log.classroomId) ?? [];
    arr.push(log);
    todayLogsByRoom.set(log.classroomId, arr);
  }

  // Group weekly logs by classroomId
  const weeklyLogsByRoom = new Map<string, typeof weeklyLogs>();
  for (const log of weeklyLogs) {
    const arr = weeklyLogsByRoom.get(log.classroomId) ?? [];
    arr.push(log);
    weeklyLogsByRoom.set(log.classroomId, arr);
  }

  // Build per-classroom stats
  // Classroom model has no maxCapacity; we use a conventional 40 as default
  const CAPACITY_DEFAULT = 40;

  const classroomStats = classrooms.map((c) => {
    const enrolled = c.students.length;
    const capacity = CAPACITY_DEFAULT; // schema: no maxCapacity on Classroom
    const utilizationRate = capacity > 0 ? enrolled / capacity : 0;

    const todayRoomLogs = todayLogsByRoom.get(c.id) ?? [];
    const todayPresent = todayRoomLogs.filter(
      (l) => l.attendType === "NORMAL" || l.attendType === "LIVE",
    ).length;

    // Weekly attendance rate (last 4 weeks)
    const roomWeeklyLogs = weeklyLogsByRoom.get(c.id) ?? [];
    const totalLogs = roomWeeklyLogs.length;
    const presentLogs = roomWeeklyLogs.filter(
      (l) => l.attendType === "NORMAL" || l.attendType === "LIVE",
    ).length;
    const weeklyAttendanceRate = totalLogs > 0 ? presentLogs / totalLogs : null;

    // Weekly breakdown (last 4 weeks by week label)
    const weekData: Record<string, { total: number; present: number }> = {};
    for (const log of roomWeeklyLogs) {
      const d = new Date(log.attendDate);
      // Week key: Monday-based
      const dayOfWeek = (d.getDay() + 6) % 7; // Mon=0
      const monday = new Date(d);
      monday.setDate(d.getDate() - dayOfWeek);
      const weekKey = monday.toISOString().slice(0, 10);
      if (!weekData[weekKey]) weekData[weekKey] = { total: 0, present: 0 };
      weekData[weekKey].total++;
      if (log.attendType === "NORMAL" || log.attendType === "LIVE") {
        weekData[weekKey].present++;
      }
    }

    return {
      id: c.id,
      name: c.name,
      teacher: c.teacher.name,
      generation: c.generation,
      enrolled,
      capacity,
      utilizationRate,
      todayPresent,
      todayExpected: enrolled,
      weeklyAttendanceRate,
      weekData,
    };
  });

  // KPI aggregates
  const totalClassrooms = classroomStats.length;
  const avgUtilization =
    totalClassrooms > 0
      ? classroomStats.reduce((s, c) => s + c.utilizationRate, 0) / totalClassrooms
      : 0;
  const overCapacityCount = classroomStats.filter((c) => c.utilizationRate >= 0.9).length;
  const todayTotalExpected = classroomStats.reduce((s, c) => s + c.todayExpected, 0);

  // All week keys across all classrooms, sorted
  const allWeekKeys = Array.from(
    new Set(classroomStats.flatMap((c) => Object.keys(c.weekData))),
  ).sort();
  const last4WeekKeys = allWeekKeys.slice(-4);

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        학사 관리
      </div>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">강의실 현황 분석</h1>
          <p className="mt-3 text-sm leading-7 text-slate">
            담임반별 정원 가동률 및 최근 4주 출석률을 분석합니다.
          </p>
        </div>
        <Link
          href="/admin/classrooms"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-5 py-2.5 text-sm font-semibold text-slate transition hover:border-ink/30 hover:text-ink"
        >
          ← 담임반 목록
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard
          label="총 강의실"
          value={totalClassrooms}
          unit="개"
          color="forest"
        />
        <KpiCard
          label="평균 가동률"
          value={Math.round(avgUtilization * 100)}
          unit="%"
          color={avgUtilization >= 0.9 ? "red" : avgUtilization >= 0.7 ? "amber" : "forest"}
        />
        <KpiCard
          label="초과 위험 (90%+)"
          value={overCapacityCount}
          unit="개"
          color={overCapacityCount > 0 ? "red" : "forest"}
        />
        <KpiCard
          label="오늘 총 예정 학생"
          value={todayTotalExpected}
          unit="명"
          color="forest"
        />
      </div>

      {/* Per-classroom capacity cards */}
      {classroomStats.length === 0 ? (
        <div className="mt-10 flex items-center justify-center rounded-[20px] border border-dashed border-ink/10 bg-white py-16 text-center">
          <div>
            <p className="text-sm font-medium text-slate">등록된 활성 반이 없습니다</p>
            <Link
              href="/admin/classrooms"
              className="mt-4 inline-flex items-center rounded-full border border-ember/30 bg-ember/5 px-4 py-2 text-xs font-semibold text-ember hover:bg-ember/10"
            >
              반 편성하기
            </Link>
          </div>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classroomStats.map((c) => (
            <div
              key={c.id}
              className="rounded-[20px] border border-ink/10 bg-white p-5 shadow-sm"
            >
              {/* Room header */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Link
                    href={`/admin/classrooms/${c.id}`}
                    className="text-base font-semibold text-ink hover:text-ember"
                  >
                    {c.name}
                  </Link>
                  <p className="mt-0.5 text-xs text-slate">
                    담임: {c.teacher}
                    {c.generation != null && ` · ${c.generation}기`}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${utilizationBadgeBg(c.utilizationRate)}`}
                >
                  {rateLabel(c.utilizationRate)}
                </span>
              </div>

              {/* Utilization bar */}
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-slate">
                  <span>수강생 현황</span>
                  <span className={`font-semibold ${utilizationTextColor(c.utilizationRate)}`}>
                    {c.enrolled} / {c.capacity}명 ({Math.round(c.utilizationRate * 100)}%)
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-ink/10">
                  <div
                    className={`h-full rounded-full transition-all ${utilizationColor(c.utilizationRate)}`}
                    style={{ width: `${Math.min(c.utilizationRate * 100, 100)}%` }}
                  />
                </div>
              </div>

              {/* Today stats */}
              <div className="mt-4 flex gap-3">
                <StatPill label="오늘 예정" value={c.todayExpected} unit="명" />
                <StatPill label="오늘 출석" value={c.todayPresent} unit="명" />
                {c.weeklyAttendanceRate !== null && (
                  <StatPill
                    label="4주 출석률"
                    value={Math.round(c.weeklyAttendanceRate * 100)}
                    unit="%"
                  />
                )}
              </div>

              {/* Action links */}
              <div className="mt-4 flex flex-wrap gap-1.5">
                <Link
                  href={`/admin/classrooms/${c.id}/sessions`}
                  className="rounded-full border border-ink/10 px-2.5 py-1 text-xs font-medium text-slate transition hover:border-ink/30 hover:text-ink"
                >
                  시험 회차
                </Link>
                <Link
                  href={`/admin/classrooms/${c.id}/attendance`}
                  className="rounded-full border border-ink/10 px-2.5 py-1 text-xs font-medium text-slate transition hover:border-ink/30 hover:text-ink"
                >
                  출결 내역
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Weekly attendance rate table */}
      {classroomStats.length > 0 && last4WeekKeys.length > 0 && (
        <div className="mt-10">
          <h2 className="text-lg font-semibold text-ink">주차별 출석률 (최근 4주)</h2>
          <div className="mt-4 overflow-x-auto rounded-[20px] border border-ink/10 bg-white">
            <table className="min-w-full divide-y divide-ink/5 text-sm">
              <thead className="bg-mist">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate">반</th>
                  {last4WeekKeys.map((wk) => (
                    <th
                      key={wk}
                      className="px-3 py-3 text-center text-xs font-semibold text-slate"
                    >
                      {wk.slice(5)} ~
                    </th>
                  ))}
                  <th className="px-3 py-3 text-center text-xs font-semibold text-slate">4주 평균</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {classroomStats.map((c) => {
                  const weekRates = last4WeekKeys.map((wk) => {
                    const wd = c.weekData[wk];
                    if (!wd || wd.total === 0) return null;
                    return wd.present / wd.total;
                  });
                  return (
                    <tr key={c.id} className="hover:bg-mist/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-ink">
                        <Link
                          href={`/admin/classrooms/${c.id}`}
                          className="hover:text-ember"
                        >
                          {c.name}
                        </Link>
                      </td>
                      {weekRates.map((rate, i) => (
                        <td key={i} className="px-3 py-3 text-center">
                          {rate === null ? (
                            <span className="text-xs text-slate/40">-</span>
                          ) : (
                            <span
                              className={`text-xs font-semibold ${
                                rate >= 0.9
                                  ? "text-forest"
                                  : rate >= 0.7
                                    ? "text-amber-600"
                                    : "text-red-600"
                              }`}
                            >
                              {Math.round(rate * 100)}%
                            </span>
                          )}
                        </td>
                      ))}
                      <td className="px-3 py-3 text-center">
                        {c.weeklyAttendanceRate !== null ? (
                          <span
                            className={`text-xs font-semibold ${
                              c.weeklyAttendanceRate >= 0.9
                                ? "text-forest"
                                : c.weeklyAttendanceRate >= 0.7
                                  ? "text-amber-600"
                                  : "text-red-600"
                            }`}
                          >
                            {Math.round(c.weeklyAttendanceRate * 100)}%
                          </span>
                        ) : (
                          <span className="text-xs text-slate/40">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: number;
  unit: string;
  color: "forest" | "red" | "amber";
}) {
  const colorMap = {
    forest: "text-forest",
    red: "text-red-600",
    amber: "text-amber-600",
  };
  return (
    <div className="rounded-[20px] border border-ink/10 bg-white px-5 py-4">
      <p className="text-xs font-medium text-slate">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${colorMap[color]}`}>
        {value.toLocaleString()}
        <span className="ml-1 text-sm font-normal text-slate">{unit}</span>
      </p>
    </div>
  );
}

function StatPill({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="rounded-full bg-mist px-2.5 py-1 text-center">
      <p className="text-[10px] text-slate">{label}</p>
      <p className="text-xs font-semibold text-ink">
        {value}
        {unit}
      </p>
    </div>
  );
}
