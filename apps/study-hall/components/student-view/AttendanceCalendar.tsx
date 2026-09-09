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
  return isToday ? "text-admin-accent" : "text-admin-text";
}

/** "9. 7. (월)" → "9.7" — 좁은 열에서 요일은 위 줄이 이미 보여준다. */
function getCompactDateLabel(label: string) {
  return label
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/\s+/g, "")
    .replace(/\.$/, "");
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
  return (
    <div className="w-full min-w-0">
      {/* 모바일은 행과 열을 뒤집는다. 날짜를 열로 두면 교시 9개가 열이 되어
          13px 이상을 지키면서는 390px 안에 들어오지 않는다 (DESIGN.md 8절). */}
      <div className="admin-table-frame md:hidden">
        <table className="admin-portal-grid-table">
          <thead>
            <tr>
              <th className="w-[56px]">교시</th>
              {visibleDateRows.map((dateRow) => (
                <th key={dateRow.date.date} data-today={dateRow.date.isToday}>
                  <span className="block">{dateRow.date.shortLabel}</span>
                  <span className="block font-normal">
                    {getCompactDateLabel(dateRow.date.label)}
                  </span>
                  {dateRow.date.isToday ? (
                    <span className="block font-normal">오늘</span>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeklyAttendance.rows.map((periodRow) => (
              <tr key={periodRow.periodId}>
                <th className="admin-table-name">
                  {getCompactPeriodLabel(periodRow.periodName)}
                </th>
                {visibleDateRows.map((dateRow) => {
                  const cell = dateRow.periods.find(
                    (period) => period.periodId === periodRow.periodId,
                  );

                  return (
                    <td key={`${dateRow.date.date}-${periodRow.periodId}`}>
                      <span
                        className={`admin-status-chip font-semibold ${cell ? getStatusClasses(cell.status) : ""}`}
                        title={cell?.reason || `${periodRow.periodName} ${periodRow.startTime}-${periodRow.endTime}`}
                      >
                        {cell?.statusLabel ?? "-"}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="admin-table-frame hidden overflow-x-auto md:block">
        <table className="min-w-[640px] w-full border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 w-[152px] admin-table-name align-bottom">
                <div>
                  <p className="text-[13px] font-medium text-admin-text-muted">
                    날짜
                  </p>
                  <p className="mt-1.5 text-sm font-semibold text-admin-text">
                    주간 출석표
                  </p>
                </div>
              </th>

              {weeklyAttendance.rows.map((row) => (
                <th key={row.periodId} className="min-w-[96px] text-left align-bottom">
                  <div className="min-h-[78px]">
                    <p className="text-[13px] font-medium text-admin-text-muted">
                      {row.label || "교시"}
                    </p>
                    <p className="mt-1.5 text-sm font-semibold text-admin-text">
                      {row.periodName}
                    </p>
                    <p className="mt-1 text-[13px] leading-4 text-admin-text-muted">
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
                <th className="sticky left-0 z-10 admin-table-name align-top">
                  <div className={getDateBadgeClass(row.date.isToday)}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[13px] font-medium">
                          {row.date.shortLabel}
                        </p>
                        <p className="mt-1 text-sm font-semibold">{row.date.label}</p>
                      </div>
                      <span className="text-[13px] font-semibold">
                        {row.date.isToday ? "오늘" : row.date.isOperatingDay ? "운영" : "휴무"}
                      </span>
                    </div>
                  </div>
                </th>

                {row.periods.map((period) => (
                  <td key={`${row.date.date}-${period.periodId}`} className="align-top">
                    <div
                      className={`admin-status-chip text-center ${getStatusClasses(period.status)}`}
                      title={period.reason || `${period.periodName} ${period.startTime}-${period.endTime}`}
                    >
                      <p className="text-[13px] font-medium opacity-75">
                        {period.periodName}
                      </p>
                      <p className="mt-1.5 text-sm font-semibold">{period.statusLabel}</p>
                      <p className="mt-1 text-[13px] leading-4 opacity-80">
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
        <p className="admin-notice mt-2.5">
          {isPreview
            ? "대시보드에서는 일부 날짜만 먼저 보여주고, 전체 표는 출석 상세에서 확인할 수 있습니다."
            : "모바일에서는 교시를 행으로, 날짜를 열로 정리해 한 화면에서 확인할 수 있습니다."}
        </p>
      ) : null}
    </div>
  );
}
