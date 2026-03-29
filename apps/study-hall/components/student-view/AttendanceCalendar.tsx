import {
  portalCardClass,
  portalInsetClass,
} from "@/components/student-view/StudentPortalUi";
import type { StudentDashboardData } from "@/lib/services/student-dashboard.service";

type AttendanceCalendarProps = {
  weeklyAttendance: StudentDashboardData["weeklyAttendance"];
  maxDates?: number;
  showFootnote?: boolean;
};

type DateRow = {
  date: StudentDashboardData["weeklyAttendance"]["dates"][number];
  periods: Array<{
    periodId: string;
    periodName: string;
    label: string | null;
    startTime: string;
    endTime: string;
    status: StudentDashboardData["weeklyAttendance"]["rows"][number]["cells"][number]["status"];
    statusLabel: string;
    reason: string | null;
  }>;
};

function getStatusClasses(
  status: StudentDashboardData["weeklyAttendance"]["rows"][number]["cells"][number]["status"],
) {
  switch (status) {
    case "PRESENT":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "TARDY":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "ABSENT":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "EXCUSED":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "HOLIDAY":
    case "HALF_HOLIDAY":
      return "border-slate-300 bg-slate-100 text-slate-700";
    case "NOT_APPLICABLE":
    case "UPCOMING":
      return "border-slate-200 bg-slate-50 text-slate-500";
    case "OFF":
      return "border-slate-200 bg-slate-100 text-slate-500";
    default:
      return "border-orange-200 bg-orange-50 text-orange-700";
  }
}

function getDateBadgeClass(isToday: boolean) {
  return isToday
    ? "border-transparent"
    : "border-slate-200 bg-white text-slate-700";
}

function getDateStatusLabel(isToday: boolean, isOperatingDay: boolean) {
  if (isToday) {
    return "오늘";
  }

  return isOperatingDay ? "운영" : "휴무";
}

function getDateStatusClass(isToday: boolean, isOperatingDay: boolean) {
  if (isToday) {
    return "border-transparent text-[var(--division-on-accent)]";
  }

  if (isOperatingDay) {
    return "border-slate-200 bg-slate-50 text-slate-600";
  }

  return "border-slate-200 bg-slate-100 text-slate-500";
}

function buildDateRows(
  weeklyAttendance: StudentDashboardData["weeklyAttendance"],
): DateRow[] {
  return weeklyAttendance.dates.map((date, index) => ({
    date,
    periods: weeklyAttendance.rows.map((row) => ({
      periodId: row.periodId,
      periodName: row.periodName,
      label: row.label,
      startTime: row.startTime,
      endTime: row.endTime,
      status: row.cells[index].status,
      statusLabel: row.cells[index].label,
      reason: row.cells[index].reason,
    })),
  }));
}

function getVisibleDateRows(dateRows: DateRow[], maxDates?: number) {
  if (!maxDates || dateRows.length <= maxDates) {
    return dateRows;
  }

  const todayIndex = dateRows.findIndex((row) => row.date.isToday);

  if (todayIndex === -1) {
    return dateRows.slice(0, maxDates);
  }

  const start = Math.max(0, Math.min(todayIndex, dateRows.length - maxDates));
  return dateRows.slice(start, start + maxDates);
}

function getCompactPeriodLabel(periodName: string) {
  const matched = periodName.match(/(\d+)교시?/);

  if (matched) {
    return `${matched[1]}교`;
  }

  return periodName.length > 4 ? periodName.slice(0, 4) : periodName;
}

export function AttendanceCalendar({
  weeklyAttendance,
  maxDates,
  showFootnote = true,
}: AttendanceCalendarProps) {
  const allDateRows = buildDateRows(weeklyAttendance);
  const visibleDateRows = getVisibleDateRows(allDateRows, maxDates);
  const isPreview = visibleDateRows.length < allDateRows.length;
  const mobileDateColumnWidth = 96;
  const mobilePeriodColumnWidth = 60;
  const mobileTableMinWidth = Math.max(
    560,
    mobileDateColumnWidth + weeklyAttendance.rows.length * mobilePeriodColumnWidth,
  );

  return (
    <div className="w-full min-w-0">
      <div className="md:hidden">
        <div className="max-w-full overflow-x-auto overscroll-x-contain rounded-[10px] border border-[var(--border)] bg-white [-webkit-overflow-scrolling:touch] [touch-action:pan-x]">
          <table
            className="w-max border-collapse text-[11px]"
            style={{ minWidth: `${mobileTableMinWidth}px` }}
          >
            <thead>
              <tr className="bg-slate-50">
                <th className="sticky left-0 z-20 min-w-[96px] border-b border-r border-slate-100 bg-slate-50 px-2.5 py-2 text-left text-[10px] font-medium text-[var(--muted)]">
                  날짜
                </th>
                {weeklyAttendance.rows.map((row) => (
                  <th
                    key={row.periodId}
                    className="min-w-[60px] border-b border-r border-slate-100 px-1.5 py-2 text-center text-[10px] font-medium text-[var(--muted)] last:border-r-0"
                  >
                    {getCompactPeriodLabel(row.periodName)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleDateRows.map((row) => (
                <tr key={row.date.date}>
                  <th className="sticky left-0 z-10 border-b border-r border-slate-100 bg-white px-2.5 py-2 text-left align-top">
                    <div className="min-w-0">
                      <p className="text-[10px] font-medium text-[var(--muted)]">
                        {row.date.shortLabel}
                      </p>
                      <p
                        className={`mt-0.5 min-w-0 break-keep text-[11px] font-bold leading-[1.35] [overflow-wrap:anywhere] ${
                          row.date.isToday ? "text-[var(--division-color)]" : "text-slate-800"
                        }`}
                      >
                        {row.date.label}
                      </p>
                      <span
                        className={`mt-1 inline-flex rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${getDateStatusClass(
                          row.date.isToday,
                          row.date.isOperatingDay,
                        )}`}
                        style={
                          row.date.isToday
                            ? { backgroundColor: "var(--division-color)" }
                            : undefined
                        }
                      >
                        {getDateStatusLabel(row.date.isToday, row.date.isOperatingDay)}
                      </span>
                    </div>
                  </th>
                  {row.periods.map((period) => (
                    <td
                      key={`${row.date.date}-${period.periodId}`}
                      className="border-b border-r border-slate-100 px-1.5 py-1.5 text-center align-middle last:border-r-0"
                    >
                      <div
                        className={`flex min-h-[30px] min-w-[44px] items-center justify-center rounded-[10px] border px-1 text-[10px] font-semibold leading-tight ${getStatusClasses(period.status)}`}
                        title={period.reason || `${period.periodName} ${period.startTime}-${period.endTime}`}
                      >
                        {period.statusLabel}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-[640px] w-full border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 w-[152px] bg-white pr-3 pb-3 text-left align-bottom">
                <div className={`${portalInsetClass} bg-white`}>
                  <p className="text-[12px] font-medium text-[var(--muted)]">
                    날짜
                  </p>
                  <p className="mt-1.5 text-sm font-semibold text-[var(--foreground)]">
                    주간 출석표
                  </p>
                </div>
              </th>

              {weeklyAttendance.rows.map((row) => (
                <th key={row.periodId} className="min-w-[96px] px-0 pb-3 text-left align-bottom">
                  <div className={`${portalInsetClass} min-h-[78px] bg-white`}>
                    <p className="text-[12px] font-medium text-[var(--muted)]">
                      {row.label || "교시"}
                    </p>
                    <p className="mt-1.5 text-sm font-semibold text-[var(--foreground)]">
                      {row.periodName}
                    </p>
                    <p className="mt-1 text-[11px] leading-4 text-[var(--muted)]">
                      {row.startTime} - {row.endTime}
                    </p>
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {visibleDateRows.map((row) => (
              <tr key={row.date.date}>
                <th className="sticky left-0 z-10 bg-white pr-3 pb-3 text-left align-top">
                  <div
                    className={`rounded-[10px] border px-3 py-2.5 ${getDateBadgeClass(
                      row.date.isToday,
                    )}`}
                    style={
                      row.date.isToday
                        ? {
                            backgroundColor: "var(--division-color)",
                            color: "var(--division-on-accent)",
                          }
                        : undefined
                    }
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[11px] font-medium">
                          {row.date.shortLabel}
                        </p>
                        <p className="mt-1 text-sm font-semibold">{row.date.label}</p>
                      </div>
                      <span
                        className={`rounded-[10px] border px-2 py-0.5 text-[10px] font-medium ${getDateBadgeClass(
                          row.date.isToday,
                        )}`}
                        style={
                          row.date.isToday
                            ? {
                                backgroundColor: "rgb(255 255 255 / 0.16)",
                                color: "var(--division-on-accent)",
                              }
                            : undefined
                        }
                      >
                        {row.date.isToday ? "오늘" : row.date.isOperatingDay ? "운영" : "휴무"}
                      </span>
                    </div>
                  </div>
                </th>

                {row.periods.map((period) => (
                  <td key={`${row.date.date}-${period.periodId}`} className="pb-3 align-top">
                    <div
                      className={`rounded-[10px] border px-2.5 py-2.5 text-center ${getStatusClasses(period.status)}`}
                      title={period.reason || `${period.periodName} ${period.startTime}-${period.endTime}`}
                    >
                      <p className="text-[10px] font-medium opacity-75">
                        {period.periodName}
                      </p>
                      <p className="mt-1.5 text-sm font-semibold">{period.statusLabel}</p>
                      <p className="mt-1 text-[10px] leading-4 opacity-80">
                        {period.reason || `${period.startTime}-${period.endTime}`}
                      </p>
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showFootnote ? (
        <div className={`mt-2.5 ${portalCardClass} p-2.5 text-[11px] leading-5 text-[var(--muted)]`}>
          {isPreview
            ? "대시보드에서는 일부 날짜만 먼저 보여주고, 전체 표는 출석 상세에서 확인할 수 있습니다."
            : "모바일에서는 표를 좌우로 넘겨 날짜별 교시 출석을 확인할 수 있습니다."}
        </div>
      ) : null}
    </div>
  );
}
