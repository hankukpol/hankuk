import { Fragment } from "react";
import Link from "next/link";
import { AttendType, Subject, StudentStatus, type ExamType } from "@prisma/client";
import { type TuesdayWeekSummary, type WeeklyResultsSheetRow } from "@/lib/analytics/service";
import { STATUS_LABEL, STATUS_ROW_CLASS, formatRank, formatScore } from "@/lib/analytics/presentation";
import { DeltaBadge } from "@/components/ui/delta-badge";
import { getSubjectDisplayLabel } from "@/lib/constants";
import { buildSessionDisplayColumns } from "@/lib/exam-session-rules";
import { formatDateWithWeekday } from "@/lib/format";

type SessionColumn = {
  id: number;
  examType: ExamType;
  subject: Subject;
  displaySubjectName: string | null;
  examDate: Date | string;
};

type WeeklyResultsSheetProps = {
  week: TuesdayWeekSummary;
  sessions: SessionColumn[];
  rows: WeeklyResultsSheetRow[];
  className?: string;
  printTitle?: string;
};

function reviveDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

function formatCellValue(
  attendType: AttendType | null,
  value: number | null,
  mode: "mock" | "ox",
  isPendingInput: boolean,
) {
  if (attendType === AttendType.NORMAL) {
    return value === null ? "" : formatScore(value);
  }

  if (attendType === AttendType.LIVE) {
    if (value !== null && mode === "mock") {
      return `${formatScore(value)}(LIVE)`;
    }

    return "LIVE";
  }

  if (attendType === AttendType.EXCUSED) {
    return "공결";
  }

  if (isPendingInput) {
    return "미입력";
  }

  return "";
}

function weekNoteLabel(row: WeeklyResultsSheetRow) {
  const hasPendingInput = row.cells.some((cell) => cell.isPendingInput);

  if (row.weekStatus === StudentStatus.NORMAL) {
    return !hasPendingInput && row.perfectAttendance ? "개근" : "";
  }

  return STATUS_LABEL[row.weekStatus];
}

function noteClass(row: WeeklyResultsSheetRow) {
  if (row.weekStatus === StudentStatus.DROPOUT) {
    return "bg-red-600 text-white";
  }

  if (row.weekStatus === StudentStatus.WARNING_2) {
    return "bg-amber-200 text-amber-900";
  }

  if (row.weekStatus === StudentStatus.WARNING_1) {
    return "bg-rose-100 text-rose-700";
  }

  if (!row.cells.some((cell) => cell.isPendingInput) && row.perfectAttendance) {
    return "bg-emerald-50 text-emerald-700";
  }

  return "";
}

export function WeeklyResultsSheet({
  week,
  sessions,
  rows,
  className,
  printTitle,
}: WeeklyResultsSheetProps) {
  const headCellClass = "border border-slate-200 bg-slate-50 px-3 py-3 font-semibold";
  const headNameCellClass = "border border-slate-200 bg-slate-50 px-4 py-3 font-semibold";
  const subHeadCellClass = "border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold";
  const sortedSessions = [...sessions].sort(
    (left, right) =>
      reviveDate(left.examDate).getTime() - reviveDate(right.examDate).getTime() || left.id - right.id,
  );
  const displayColumns = buildSessionDisplayColumns(sortedSessions);
  const averages = displayColumns.map((column) => {
    const mockValues = column.mainSession
      ? rows
          .map((row) => row.cells.find((cell) => cell.sessionId === column.mainSession?.id))
          .filter((cell) => cell?.attendType === AttendType.NORMAL && cell.mockScore !== null)
          .map((cell) => cell?.mockScore as number)
      : [];
    const oxValues = column.oxSession
      ? rows
          .map((row) => row.cells.find((cell) => cell.sessionId === column.oxSession?.id))
          .filter((cell) => cell?.attendType === AttendType.NORMAL && cell.policeOxScore !== null)
          .map((cell) => cell?.policeOxScore as number)
      : [];

    return {
      mock:
        mockValues.length === 0
          ? null
          : mockValues.reduce((sum, value) => sum + value, 0) / mockValues.length,
      ox:
        oxValues.length === 0
          ? null
          : oxValues.reduce((sum, value) => sum + value, 0) / oxValues.length,
    };
  });

  return (
    <div
      className={`${className ? `${className} ` : ""}overflow-x-auto rounded-[28px] border border-ink/10 bg-white`}
      data-print-title={printTitle ?? undefined}
    >
      <div className="min-w-[1280px]">
        <div className="print-sheet-heading border-b border-ink/10 px-6 py-5 text-center">
          <h2 className="text-2xl font-semibold">주간 성적표</h2>
          <p className="mt-2 text-sm text-slate">
            {week.label}
            {week.legacyWeeks.length > 0 ? ` / 기존 week ${week.legacyWeeks.join(", ")}` : ""}
          </p>
        </div>

        <table className="min-w-full border-collapse text-center text-sm">
          <thead>
            <tr>
              <th rowSpan={2} className={headCellClass}>순번</th>
              <th rowSpan={2} className={headNameCellClass}>이름</th>
              {displayColumns.map((column) => (
                <th key={column.key} colSpan={column.oxSession ? 2 : 1} className={headCellClass}>
                  <div>{formatDateWithWeekday(column.examDate)}</div>
                  <div className="mt-1 text-xs font-medium text-slate">
                    {getSubjectDisplayLabel(column.subject, column.displaySubjectName)}
                  </div>
                </th>
              ))}
              <th rowSpan={2} className={headCellClass}>모의고사 평균</th>
              <th rowSpan={2} className={headCellClass}>모의고사 석차</th>
              <th rowSpan={2} className={headCellClass}>경찰학 OX 평균</th>
              <th rowSpan={2} className={headCellClass}>경찰학 OX 석차</th>
              <th rowSpan={2} className={headCellClass}>출석률</th>
              <th rowSpan={2} className={headCellClass}>비고</th>
            </tr>
            <tr>
              {displayColumns.map((column) =>
                column.oxSession ? (
                  <Fragment key={`${column.key}-sub`}>
                    <th className={subHeadCellClass}>모의고사</th>
                    <th className={subHeadCellClass}>경찰학 OX</th>
                  </Fragment>
                ) : (
                  <th key={`${column.key}-mock`} className={subHeadCellClass}>모의고사</th>
                ),
              )}
            </tr>
            <tr className="bg-slate-50">
              <th colSpan={2} className="border border-slate-200 px-3 py-3 font-semibold">전체 평균</th>
              {averages.map((average, index) =>
                displayColumns[index]?.oxSession ? (
                  <Fragment key={`avg-${displayColumns[index].key}`}>
                    <th className="border border-slate-200 px-3 py-2 font-semibold text-ember">
                      {formatScore(average.mock)}
                    </th>
                    <th className="border border-slate-200 px-3 py-2 font-semibold text-ember">
                      {formatScore(average.ox)}
                    </th>
                  </Fragment>
                ) : (
                  <th
                    key={`avg-${displayColumns[index].key}-mock`}
                    className="border border-slate-200 px-3 py-2 font-semibold text-ember"
                  >
                    {formatScore(average.mock)}
                  </th>
                ),
              )}
              <th className="border border-slate-200 px-3 py-2" />
              <th className="border border-slate-200 px-3 py-2" />
              <th className="border border-slate-200 px-3 py-2" />
              <th className="border border-slate-200 px-3 py-2" />
              <th className="border border-slate-200 px-3 py-2" />
              <th className="border border-slate-200 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={row.examNumber}
                className={row.isActive ? STATUS_ROW_CLASS[row.weekStatus] : "bg-slate-50/80 text-slate"}
              >
                <td className="border border-ink/10 px-3 py-3 font-semibold">{index + 1}</td>
                <td className="border border-ink/10 px-4 py-3 text-left">
                  <Link
                    prefetch={false}
                    href={`/admin/students/${row.examNumber}/history`}
                    className="font-semibold underline-offset-4 hover:text-forest hover:underline"
                  >
                    {row.name}
                  </Link>
                </td>
                {displayColumns.map((column) => {
                  const mainCell = column.mainSession
                    ? row.cells.find((item) => item.sessionId === column.mainSession?.id) ?? null
                    : null;
                  const oxCell = column.oxSession
                    ? row.cells.find((item) => item.sessionId === column.oxSession?.id) ?? null
                    : null;
                  const mockDisplay = formatCellValue(
                    mainCell?.attendType ?? null,
                    mainCell?.mockScore ?? null,
                    "mock",
                    mainCell?.isPendingInput ?? false,
                  );

                  if (column.oxSession) {
                    const oxDisplay = formatCellValue(
                      oxCell?.attendType ?? mainCell?.attendType ?? null,
                      oxCell?.policeOxScore ?? null,
                      "ox",
                      oxCell?.isPendingInput ?? mainCell?.isPendingInput ?? false,
                    );

                    return (
                      <Fragment key={`${row.examNumber}-${column.key}`}>
                        <td className="border border-ink/10 px-3 py-3">{mockDisplay}</td>
                        <td className="border border-ink/10 px-3 py-3">{oxDisplay}</td>
                      </Fragment>
                    );
                  }

                  return (
                    <td key={`${row.examNumber}-${column.key}-mock`} className="border border-ink/10 px-3 py-3">
                      {mockDisplay}
                    </td>
                  );
                })}
                <td className="border border-ink/10 px-3 py-3 font-semibold">
                  <span>{Math.round(row.mockAverage)}</span>
                  {row.mockAverageDelta !== undefined && row.mockAverageDelta !== null && (
                    <span className="ml-1 no-print">
                      <DeltaBadge delta={row.mockAverageDelta} size="sm" />
                    </span>
                  )}
                </td>
                <td className="border border-ink/10 px-3 py-3 font-semibold text-red-500">{formatRank(row.mockRank)}</td>
                <td className="border border-ink/10 px-3 py-3 font-semibold">
                  {row.policeOxAverage === null ? "-" : Math.round(row.policeOxAverage)}
                </td>
                <td className="border border-ink/10 px-3 py-3 font-semibold text-red-500">{formatRank(row.policeOxRank)}</td>
                <td className="border border-ink/10 px-3 py-3 font-semibold">{Math.round(row.attendanceRate)}%</td>
                <td className={`border border-ink/10 px-3 py-3 font-semibold ${noteClass(row)}`}>
                  {weekNoteLabel(row)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
