import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function localDateMidnight(offsetDays = 0): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d;
}

export default async function AdminCheckInPage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  const todayStart = localDateMidnight(0);
  const todayEnd = localDateMidnight(1);

  // Fetch today's attendance logs with student info
  // ClassroomAttendanceLog is the confirmed daily attendance record
  const todayCheckIns = await getPrisma().classroomAttendanceLog.findMany({
    where: {
      createdAt: { gte: todayStart, lt: todayEnd },
    },
    include: {
      student: {
        select: {
          examNumber: true,
          name: true,
          phone: true,
        },
      },
      classroom: {
        select: { name: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  // Fetch last 7 days for daily summary
  const weekAgo = localDateMidnight(-6);

  const weeklyLogs = await getPrisma().classroomAttendanceLog.findMany({
    where: { createdAt: { gte: weekAgo } },
    select: { createdAt: true },
  });

  // Build daily counts for the past 7 days
  const dailyCounts: Record<string, number> = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    dailyCounts[key] = 0;
  }
  for (const log of weeklyLogs) {
    const d = log.createdAt;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (key in dailyCounts) dailyCounts[key]++;
  }

  const uniqueStudentsToday = new Set(todayCheckIns.map((c) => c.examNumber)).size;

  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const weeklyAvg = Math.round(
    Object.values(dailyCounts).reduce((a, b) => a + b, 0) / 7,
  );

  const attendTypeLabel: Record<string, string> = {
    NORMAL: "출석",
    LIVE: "생방",
    EXCUSED: "공결",
    ABSENT: "결석",
  };

  const attendTypeBadge: Record<string, string> = {
    NORMAL: "bg-forest/10 text-forest border-forest/20",
    LIVE: "bg-sky-50 text-sky-700 border-sky-200",
    EXCUSED: "bg-amber-50 text-amber-700 border-amber-200",
    ABSENT: "bg-red-50 text-red-700 border-red-200",
  };

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="inline-flex rounded-full border border-ink/20 bg-ink/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate">
        출입 관리
      </div>
      <h1 className="mt-5 text-3xl font-semibold">출입 체크인 현황</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        학생 출결 확정 기록을 확인합니다.
      </p>

      {/* KPI Cards */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">
            오늘 체크인
          </p>
          <p className="mt-2 text-3xl font-bold text-ink">{todayCheckIns.length}</p>
          <p className="mt-1 text-xs text-slate">총 기록 수</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">
            오늘 방문 학생
          </p>
          <p className="mt-2 text-3xl font-bold text-ink">{uniqueStudentsToday}</p>
          <p className="mt-1 text-xs text-slate">중복 제외</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">
            이번 주 평균
          </p>
          <p className="mt-2 text-3xl font-bold text-ink">{weeklyAvg}</p>
          <p className="mt-1 text-xs text-slate">일일 평균</p>
        </div>
      </div>

      {/* Weekly bar chart - pure CSS */}
      <div className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <h2 className="text-sm font-semibold text-ink">최근 7일 체크인</h2>
        <div className="mt-4 flex h-20 items-end gap-2">
          {Object.entries(dailyCounts)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, count]) => {
              const max = Math.max(...Object.values(dailyCounts), 1);
              const pct = Math.round((count / max) * 100);
              const isToday = date === todayKey;
              const dayLabel = new Date(date + "T00:00:00").toLocaleDateString(
                "ko-KR",
                { weekday: "short" },
              );
              return (
                <div key={date} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-xs text-slate">{count}</span>
                  <div
                    className={`w-full rounded-t-sm ${isToday ? "bg-ember" : "bg-ink/20"}`}
                    style={{ height: `${Math.max(pct, 4)}%` }}
                  />
                  <span
                    className={`text-xs ${isToday ? "font-semibold text-ember" : "text-slate"}`}
                  >
                    {dayLabel}
                  </span>
                </div>
              );
            })}
        </div>
      </div>

      {/* Today's check-in list */}
      <div className="mt-6 overflow-hidden rounded-[28px] border border-ink/10 bg-white shadow-panel">
        <div className="border-b border-ink/5 px-6 py-4">
          <h2 className="text-sm font-semibold text-ink">오늘 체크인 목록</h2>
        </div>
        {todayCheckIns.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate">
            오늘 체크인 기록이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/5 text-left">
                  <th className="px-6 py-3 text-xs font-medium text-slate">시간</th>
                  <th className="px-6 py-3 text-xs font-medium text-slate">학번</th>
                  <th className="px-6 py-3 text-xs font-medium text-slate">이름</th>
                  <th className="px-6 py-3 text-xs font-medium text-slate">연락처</th>
                  <th className="px-6 py-3 text-xs font-medium text-slate">반</th>
                  <th className="px-6 py-3 text-xs font-medium text-slate">출결</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {todayCheckIns.map((record) => {
                  const badge =
                    attendTypeBadge[record.attendType] ?? "bg-ink/5 text-slate border-ink/10";
                  const label = attendTypeLabel[record.attendType] ?? record.attendType;
                  return (
                    <tr key={record.id} className="hover:bg-mist/50">
                      <td className="px-6 py-3 text-slate">
                        {record.createdAt.toLocaleTimeString("ko-KR", {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </td>
                      <td className="px-6 py-3">
                        <Link
                          href={`/admin/students/${record.examNumber}`}
                          className="font-mono text-ember hover:underline"
                        >
                          {record.examNumber}
                        </Link>
                      </td>
                      <td className="px-6 py-3 font-medium text-ink">
                        <Link
                          href={`/admin/students/${record.examNumber}`}
                          className="hover:underline"
                        >
                          {record.student?.name ?? "-"}
                        </Link>
                      </td>
                      <td className="px-6 py-3 text-slate">
                        {record.student?.phone ?? "-"}
                      </td>
                      <td className="px-6 py-3 text-slate">
                        {record.classroom?.name ?? "-"}
                      </td>
                      <td className="px-6 py-3">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${badge}`}
                        >
                          {label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {todayCheckIns.length === 500 && (
          <p className="border-t border-ink/10 px-6 py-3 text-xs text-slate">
            최대 500건만 표시됩니다.{" "}
            <Link href="/admin/attendance" className="text-ember hover:underline">
              출결 관리 전체 보기 →
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
