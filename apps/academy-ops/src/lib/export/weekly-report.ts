import { AttendType, ExamType, StudentStatus } from "@prisma/client";
import { formatScore, STATUS_LABEL, formatRank } from "@/lib/analytics/presentation";
import {
  getWeeklyResults,
  getWeeklyStatusHistory,
  type TuesdayWeekSummary,
  type WeeklyResultsSheetRow,
} from "@/lib/analytics/service";
import { getTuesdayWeekKey } from "@/lib/analytics/week";
import { EXAM_TYPE_LABEL, getSubjectDisplayLabel } from "@/lib/constants";
import { buildSessionDisplayColumns } from "@/lib/exam-session-rules";
import { formatDateWithWeekday, formatFileDate } from "@/lib/format";
import { getEnabledExamTypes } from "@/lib/periods/exam-types";
import { getPrisma } from "@/lib/prisma";

type ExcelAlignment = import("exceljs").Alignment;
type ExcelBorders = import("exceljs").Borders;
type ExcelCell = import("exceljs").Cell;
type ExcelFill = import("exceljs").Fill;
type ExcelWorkbook = import("exceljs").Workbook;
type ExcelWorksheet = import("exceljs").Worksheet;

type WeeklyResultsData = Awaited<ReturnType<typeof getWeeklyResults>>;
type WeeklyStatusHistoryData = Awaited<ReturnType<typeof getWeeklyStatusHistory>>;

type WeeklyReportScope = {
  examType: ExamType;
  week: TuesdayWeekSummary;
  previousWeekKey: string | null;
  previousWeekLabel: string | null;
  results: WeeklyResultsData;
  previousResults: WeeklyResultsData | null;
  riskRows: WeeklyStatusHistoryData["rows"];
  sheetNames: {
    summary: string;
    risk: string;
    scores: string;
  };
};

export type WeeklyReportGenerationResult = {
  buffer: Buffer;
  generatedAt: Date;
  fileName: string;
  periodId: number;
  periodName: string;
  scopes: Array<{
    examType: ExamType;
    weekKey: string;
    weekLabel: string;
    previousWeekKey: string | null;
    previousWeekLabel: string | null;
    studentCount: number;
    riskCount: number;
    sheetNames: {
      summary: string;
      risk: string;
      scores: string;
    };
  }>;
};

const EXAM_TYPE_SHORT_LABEL: Record<ExamType, string> = {
  GONGCHAE: "공채",
  GYEONGCHAE: "경채",
};

const BASE_FONT = { name: "Malgun Gothic", size: 10 };
const BASE_ALIGNMENT: Partial<ExcelAlignment> = {
  horizontal: "center",
  vertical: "middle",
  wrapText: true,
};
const GRID_BORDER: Partial<ExcelBorders> = {
  top: { style: "thin", color: { argb: "FFCCCCCC" } },
  left: { style: "thin", color: { argb: "FFCCCCCC" } },
  bottom: { style: "thin", color: { argb: "FFCCCCCC" } },
  right: { style: "thin", color: { argb: "FFCCCCCC" } },
};
const HEADER_FILL: ExcelFill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF4F4F5" },
};
const SUBTLE_FILL: ExcelFill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFAFAFA" },
};
const WARNING_FILL: Record<StudentStatus, ExcelFill | undefined> = {
  NORMAL: undefined,
  WARNING_1: {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFFF1D6" },
  },
  WARNING_2: {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFFE0C2" },
  },
  DROPOUT: {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFAD1D1" },
  },
};

function endOfToday() {
  const value = new Date();
  value.setHours(23, 59, 59, 999);
  return value;
}

async function createWorkbook() {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "OpenAI Codex";
  workbook.lastModifiedBy = "OpenAI Codex";
  workbook.created = new Date();
  workbook.modified = new Date();
  return workbook;
}

async function workbookToBuffer(workbook: ExcelWorkbook) {
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatMetricValue(value: number | null, kind: "score" | "percent" | "count") {
  if (value === null) {
    return "-";
  }

  if (kind === "score") {
    return formatScore(value);
  }

  if (kind === "percent") {
    return `${value.toFixed(1)}%`;
  }

  return String(Math.round(value));
}

function formatMetricDelta(
  current: number | null,
  previous: number | null,
  kind: "score" | "percent" | "count",
) {
  if (current === null || previous === null) {
    return "-";
  }

  if (kind === "count") {
    const diff = current - previous;
    if (diff === 0) {
      return "0";
    }

    return `${diff > 0 ? "+" : ""}${Math.round(diff)}`;
  }

  if (previous === 0) {
    return "-";
  }

  const change = ((current - previous) / previous) * 100;
  const formatted = `${Math.abs(change).toFixed(1)}%`;
  if (change === 0) {
    return "0.0%";
  }

  return `${change > 0 ? "+" : "-"}${formatted}`;
}

function slugify(value: string) {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "period";
}

function styleCell(
  cell: ExcelCell,
  options?: {
    bold?: boolean;
    fontSize?: number;
    fill?: ExcelFill;
    border?: Partial<ExcelBorders> | null;
    horizontal?: ExcelAlignment["horizontal"];
    color?: string;
  },
) {
  cell.font = {
    ...BASE_FONT,
    size: options?.fontSize ?? BASE_FONT.size,
    bold: options?.bold ?? false,
    color: options?.color ? { argb: options.color } : undefined,
  };
  cell.alignment = {
    ...BASE_ALIGNMENT,
    horizontal: options?.horizontal ?? BASE_ALIGNMENT.horizontal,
  };
  cell.border = options?.border === null ? {} : options?.border ?? GRID_BORDER;
  if (options?.fill) {
    cell.fill = options.fill;
  }
}

function styleRange(
  worksheet: ExcelWorksheet,
  startRow: number,
  endRow: number,
  startCol: number,
  endCol: number,
  options?: Parameters<typeof styleCell>[1],
) {
  for (let row = startRow; row <= endRow; row += 1) {
    for (let col = startCol; col <= endCol; col += 1) {
      styleCell(worksheet.getRow(row).getCell(col), options);
    }
  }
}

function writeCell(worksheet: ExcelWorksheet, row: number, col: number, value: string | number) {
  worksheet.getRow(row).getCell(col).value = value;
}

function mergeTitle(
  worksheet: ExcelWorksheet,
  row: number,
  startCol: number,
  endCol: number,
  value: string,
  fontSize: number,
) {
  worksheet.mergeCells(row, startCol, row, endCol);
  const cell = worksheet.getRow(row).getCell(startCol);
  cell.value = value;
  styleCell(cell, { bold: true, fontSize, border: null });
}

function uniqueSheetName(preferred: string, usedNames: Set<string>) {
  const normalized = preferred.slice(0, 31);

  if (!usedNames.has(normalized)) {
    usedNames.add(normalized);
    return normalized;
  }

  for (let index = 2; index < 100; index += 1) {
    const suffix = `-${index}`;
    const candidate = `${normalized.slice(0, Math.max(0, 31 - suffix.length))}${suffix}`;
    if (!usedNames.has(candidate)) {
      usedNames.add(candidate);
      return candidate;
    }
  }

  throw new Error("워크북 시트 이름을 생성할 수 없습니다.");
}

function toScoreCellDisplay(
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

function metricsFromRows(rows: WeeklyResultsSheetRow[]) {
  return {
    studentCount: rows.length,
    mockAverage: average(rows.map((row) => row.mockAverage).filter((value) => Number.isFinite(value))),
    policeOxAverage: average(
      rows
        .map((row) => row.policeOxAverage)
        .filter((value): value is number => value !== null && Number.isFinite(value)),
    ),
    attendanceRate: average(rows.map((row) => row.attendanceRate).filter((value) => Number.isFinite(value))),
    riskCount: rows.filter((row) => row.weekStatus !== StudentStatus.NORMAL).length,
    dropoutCount: rows.filter((row) => row.weekStatus === StudentStatus.DROPOUT).length,
  };
}

async function buildScopes(periodId: number) {
  const period = await getPrisma().examPeriod.findUnique({
    where: { id: periodId },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      totalWeeks: true,
      isActive: true,
      isGongchaeEnabled: true,
      isGyeongchaeEnabled: true,
      sessions: {
        orderBy: [{ examDate: "asc" }, { examType: "asc" }, { subject: "asc" }],
        select: {
          id: true,
          periodId: true,
          examType: true,
          week: true,
          subject: true,
          displaySubjectName: true,
          examDate: true,
          isCancelled: true,
        },
      },
    },
  });

  if (!period) {
    throw new Error("Exam period was not found.");
  }

  const today = endOfToday();
  const usedSheetNames = new Set<string>();
  const scopes: WeeklyReportScope[] = [];

  for (const examType of getEnabledExamTypes(period)) {
    const weekKeys = Array.from(
      new Set(
        period.sessions
          .filter(
            (session) =>
              session.examType === examType &&
              !session.isCancelled &&
              new Date(session.examDate).getTime() <= today.getTime(),
          )
          .map((session) => getTuesdayWeekKey(new Date(session.examDate))),
      ),
    ).sort();

    const currentWeekKey = weekKeys.at(-1) ?? null;
    if (!currentWeekKey) {
      continue;
    }

    const previousWeekKey = weekKeys.length > 1 ? weekKeys[weekKeys.length - 2] : null;
    const [results, statusHistory, previousResults] = await Promise.all([
      getWeeklyResults(periodId, examType, currentWeekKey, "overall", { includeRankingRows: false }),
      getWeeklyStatusHistory(periodId, examType, currentWeekKey),
      previousWeekKey
        ? getWeeklyResults(periodId, examType, previousWeekKey, "overall", {
            includeRankingRows: false,
          })
        : Promise.resolve(null),
    ]);

    const shortLabel = EXAM_TYPE_SHORT_LABEL[examType];
    scopes.push({
      examType,
      week: results.week,
      previousWeekKey,
      previousWeekLabel: previousWeekKey ? previousResults?.week.label ?? previousWeekKey : null,
      results,
      previousResults,
      riskRows: statusHistory.rows.filter((row) => row.status !== StudentStatus.NORMAL),
      sheetNames: {
        summary: uniqueSheetName(`${shortLabel}-요약`, usedSheetNames),
        risk: uniqueSheetName(`${shortLabel}-위험군`, usedSheetNames),
        scores: uniqueSheetName(`${shortLabel}-주간성적`, usedSheetNames),
      },
    });
  }

  return {
    period,
    scopes,
  };
}

function addSummaryWorksheet(
  workbook: ExcelWorkbook,
  periodName: string,
  scope: WeeklyReportScope,
) {
  const worksheet = workbook.addWorksheet(scope.sheetNames.summary);
  worksheet.views = [{ showGridLines: false }];
  worksheet.properties.defaultRowHeight = 20;
  worksheet.columns = [{ width: 24 }, { width: 18 }, { width: 18 }, { width: 18 }];

  const currentMetrics = metricsFromRows(scope.results.sheetRows);
  const previousMetrics = scope.previousResults ? metricsFromRows(scope.previousResults.sheetRows) : null;
  const rows = [
    {
      label: "학생 수",
      current: currentMetrics.studentCount,
      previous: previousMetrics?.studentCount ?? null,
      kind: "count" as const,
    },
    {
      label: "모의 평균",
      current: currentMetrics.mockAverage,
      previous: previousMetrics?.mockAverage ?? null,
      kind: "score" as const,
    },
    {
      label: "경찰학 OX 평균",
      current: currentMetrics.policeOxAverage,
      previous: previousMetrics?.policeOxAverage ?? null,
      kind: "score" as const,
    },
    {
      label: "평균 출석률",
      current: currentMetrics.attendanceRate,
      previous: previousMetrics?.attendanceRate ?? null,
      kind: "percent" as const,
    },
    {
      label: "위험군 수",
      current: currentMetrics.riskCount,
      previous: previousMetrics?.riskCount ?? null,
      kind: "count" as const,
    },
    {
      label: "탈락 수",
      current: currentMetrics.dropoutCount,
      previous: previousMetrics?.dropoutCount ?? null,
      kind: "count" as const,
    },
  ];

  mergeTitle(worksheet, 1, 1, 4, `${EXAM_TYPE_LABEL[scope.examType]} 주간 성적 리포트`, 16);
  mergeTitle(worksheet, 2, 1, 4, `${periodName} / ${scope.week.label}`, 10);

  writeCell(worksheet, 4, 1, "항목");
  writeCell(worksheet, 4, 2, "현재 주차");
  writeCell(worksheet, 4, 3, scope.previousWeekLabel ?? "이전 주차 없음");
  writeCell(worksheet, 4, 4, "변화");
  styleRange(worksheet, 4, 4, 1, 4, { bold: true, fill: HEADER_FILL });

  rows.forEach((row, index) => {
    const sheetRow = 5 + index;
    writeCell(worksheet, sheetRow, 1, row.label);
    writeCell(worksheet, sheetRow, 2, formatMetricValue(row.current, row.kind));
    writeCell(worksheet, sheetRow, 3, formatMetricValue(row.previous, row.kind));
    writeCell(worksheet, sheetRow, 4, formatMetricDelta(row.current, row.previous, row.kind));
  });
  styleRange(worksheet, 5, 4 + rows.length, 1, 4);

  const sessions = buildSessionDisplayColumns(
    [...scope.results.sessions].sort(
      (left, right) => new Date(left.examDate).getTime() - new Date(right.examDate).getTime() || left.id - right.id,
    ),
  );
  writeCell(worksheet, 13, 1, "시험일");
  writeCell(worksheet, 13, 2, sessions.length === 0 ? "완료된 시험 없음" : sessions.map((session) => formatDateWithWeekday(session.examDate)).join(", "));
  writeCell(worksheet, 14, 1, "과목");
  writeCell(
    worksheet,
    14,
    2,
    sessions.length === 0
      ? "-"
      : sessions
          .map((session) => getSubjectDisplayLabel(session.subject, session.displaySubjectName))
          .join(", "),
  );
  writeCell(worksheet, 15, 1, "위험군 상태");
  writeCell(
    worksheet,
    15,
    2,
    scope.riskRows.length === 0
      ? "없음"
      : scope.riskRows
          .reduce<Record<string, number>>((acc, row) => {
            acc[row.status] = (acc[row.status] ?? 0) + 1;
            return acc;
          }, {})
          ? Object.entries(
              scope.riskRows.reduce<Record<string, number>>((acc, row) => {
                acc[row.status] = (acc[row.status] ?? 0) + 1;
                return acc;
              }, {}),
            )
              .map(([status, count]) => `${STATUS_LABEL[status as StudentStatus]} ${count}명`)
              .join(" / ")
          : "없음",
  );
  styleRange(worksheet, 13, 15, 1, 2, { fill: SUBTLE_FILL });
  styleRange(worksheet, 13, 15, 1, 1, { fill: SUBTLE_FILL, bold: true });

  worksheet.getColumn(2).alignment = { ...BASE_ALIGNMENT, horizontal: "left" };
}

function addRiskWorksheet(workbook: ExcelWorkbook, periodName: string, scope: WeeklyReportScope) {
  const worksheet = workbook.addWorksheet(scope.sheetNames.risk);
  worksheet.views = [{ showGridLines: false }];
  worksheet.properties.defaultRowHeight = 20;
  worksheet.columns = [
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 12 },
    { width: 12 },
    { width: 14 },
    { width: 18 },
  ];

  mergeTitle(worksheet, 1, 1, 7, `${EXAM_TYPE_LABEL[scope.examType]} 위험군 목록`, 16);
  mergeTitle(worksheet, 2, 1, 7, `${periodName} / ${scope.week.label}`, 10);

  const headers = ["수험번호", "이름", "상태", "주간 결시", "월간 결시", "회복 예정", "연락처"];
  headers.forEach((header, index) => {
    writeCell(worksheet, 4, index + 1, header);
  });
  styleRange(worksheet, 4, 4, 1, headers.length, { bold: true, fill: HEADER_FILL });

  if (scope.riskRows.length === 0) {
    worksheet.mergeCells(5, 1, 5, headers.length);
    const cell = worksheet.getRow(5).getCell(1);
    cell.value = "해당 주차 위험군이 없습니다.";
    styleCell(cell, { border: null, horizontal: "left" });
    return;
  }

  scope.riskRows.forEach((row, index) => {
    const sheetRow = 5 + index;
    writeCell(worksheet, sheetRow, 1, row.examNumber);
    writeCell(worksheet, sheetRow, 2, row.name);
    writeCell(worksheet, sheetRow, 3, STATUS_LABEL[row.status]);
    writeCell(worksheet, sheetRow, 4, row.weekAbsenceCount);
    writeCell(worksheet, sheetRow, 5, row.monthAbsenceCount);
    writeCell(worksheet, sheetRow, 6, row.recoveryDate ? formatDateWithWeekday(row.recoveryDate) : "-");
    writeCell(worksheet, sheetRow, 7, row.phone ?? "-");
    styleRange(worksheet, sheetRow, sheetRow, 1, headers.length, {
      fill: WARNING_FILL[row.status],
      color: row.status === StudentStatus.DROPOUT ? "FF8B0000" : undefined,
    });
  });

  worksheet.getColumn(2).alignment = { ...BASE_ALIGNMENT, horizontal: "left" };
  worksheet.getColumn(7).alignment = { ...BASE_ALIGNMENT, horizontal: "left" };
}

function addScoresWorksheet(workbook: ExcelWorkbook, periodName: string, scope: WeeklyReportScope) {
  const worksheet = workbook.addWorksheet(scope.sheetNames.scores);
  worksheet.views = [{ showGridLines: false }];
  worksheet.properties.defaultRowHeight = 20;

  const sessions = [...scope.results.sessions].sort(
    (left, right) => new Date(left.examDate).getTime() - new Date(right.examDate).getTime() || left.id - right.id,
  );
  const displayColumns = buildSessionDisplayColumns(sessions);
  const sessionColumnCount = displayColumns.reduce(
    (count, column) => count + (column.oxSession ? 2 : 1),
    0,
  );
  const totalColumns = 3 + sessionColumnCount + 5;
  const widths = [8, 14, 12];
  displayColumns.forEach((column) => {
    widths.push(column.oxSession ? 9 : 11);
    if (column.oxSession) {
      widths.push(9);
    }
  });
  widths.push(11, 10, 13, 9, 10);
  worksheet.columns = widths.map((width) => ({ width }));

  const averages = displayColumns.map((column) => {
    const mockValues = column.mainSession
      ? scope.results.sheetRows
          .map((row) => row.cells.find((cell) => cell.sessionId === column.mainSession?.id))
          .filter((cell) => cell?.attendType === AttendType.NORMAL && cell.mockScore !== null)
          .map((cell) => cell?.mockScore as number)
      : [];
    const oxValues = column.oxSession
      ? scope.results.sheetRows
          .map((row) => row.cells.find((cell) => cell.sessionId === column.oxSession?.id))
          .filter((cell) => cell?.attendType === AttendType.NORMAL && cell.policeOxScore !== null)
          .map((cell) => cell?.policeOxScore as number)
      : [];

    return {
      mock: average(mockValues),
      ox: average(oxValues),
    };
  });

  mergeTitle(worksheet, 1, 1, totalColumns, `${EXAM_TYPE_LABEL[scope.examType]} 주간 성적표`, 16);
  mergeTitle(worksheet, 2, 1, totalColumns, `${periodName} / ${scope.week.label}`, 10);

  worksheet.mergeCells(4, 1, 5, 1);
  worksheet.mergeCells(4, 2, 5, 2);
  worksheet.mergeCells(4, 3, 5, 3);
  writeCell(worksheet, 4, 1, "순번");
  writeCell(worksheet, 4, 2, "수험번호");
  writeCell(worksheet, 4, 3, "이름");

  let columnIndex = 4;
  displayColumns.forEach((column, index) => {
    const span = column.oxSession ? 2 : 1;
    worksheet.mergeCells(4, columnIndex, 4, columnIndex + span - 1);
    writeCell(
      worksheet,
      4,
      columnIndex,
      `${formatDateWithWeekday(column.examDate)}\n${getSubjectDisplayLabel(column.subject, column.displaySubjectName)}`,
    );
    writeCell(worksheet, 5, columnIndex, "모의고사");
    writeCell(worksheet, 6, columnIndex, formatScore(averages[index]?.mock ?? null));

    if (column.oxSession) {
      writeCell(worksheet, 5, columnIndex + 1, "경찰학 OX");
      writeCell(worksheet, 6, columnIndex + 1, formatScore(averages[index]?.ox ?? null));
      columnIndex += 2;
      return;
    }

    columnIndex += 1;
  });

  const summaryHeaders = ["모의 평균", "모의 석차", "경찰학 OX 평균", "출석률", "비고"];
  summaryHeaders.forEach((header, offset) => {
    const col = columnIndex + offset;
    worksheet.mergeCells(4, col, 5, col);
    writeCell(worksheet, 4, col, header);
  });

  worksheet.mergeCells(6, 1, 6, 3);
  writeCell(worksheet, 6, 1, "전체 평균");

  styleRange(worksheet, 4, 5, 1, totalColumns, { bold: true, fill: HEADER_FILL });
  styleRange(worksheet, 6, 6, 1, totalColumns, { bold: true, fill: SUBTLE_FILL });

  scope.results.sheetRows.forEach((row, index) => {
    const sheetRow = 7 + index;
    writeCell(worksheet, sheetRow, 1, index + 1);
    writeCell(worksheet, sheetRow, 2, row.examNumber);
    writeCell(worksheet, sheetRow, 3, row.name);

    let valueColumn = 4;
    displayColumns.forEach((column) => {
      const mainCell = column.mainSession
        ? row.cells.find((candidate) => candidate.sessionId === column.mainSession?.id) ?? null
        : null;
      const oxCell = column.oxSession
        ? row.cells.find((candidate) => candidate.sessionId === column.oxSession?.id) ?? null
        : null;
      writeCell(
        worksheet,
        sheetRow,
        valueColumn,
        toScoreCellDisplay(
          mainCell?.attendType ?? null,
          mainCell?.mockScore ?? null,
          "mock",
          mainCell?.isPendingInput ?? false,
        ),
      );

      if (column.oxSession) {
        writeCell(
          worksheet,
          sheetRow,
          valueColumn + 1,
          toScoreCellDisplay(
            oxCell?.attendType ?? mainCell?.attendType ?? null,
            oxCell?.policeOxScore ?? null,
            "ox",
            oxCell?.isPendingInput ?? mainCell?.isPendingInput ?? false,
          ),
        );
        valueColumn += 2;
        return;
      }

      valueColumn += 1;
    });

    writeCell(worksheet, sheetRow, valueColumn, formatScore(row.mockAverage));
    writeCell(worksheet, sheetRow, valueColumn + 1, formatRank(row.mockRank));
    writeCell(worksheet, sheetRow, valueColumn + 2, formatScore(row.policeOxAverage));
    writeCell(worksheet, sheetRow, valueColumn + 3, `${Math.round(row.attendanceRate)}%`);
    writeCell(
      worksheet,
      sheetRow,
      valueColumn + 4,
      row.weekStatus === StudentStatus.NORMAL ? (row.perfectAttendance ? "개근" : "") : STATUS_LABEL[row.weekStatus],
    );

    const fill = WARNING_FILL[row.weekStatus];
    if (fill) {
      styleRange(worksheet, sheetRow, sheetRow, 1, totalColumns, {
        fill,
        color: row.weekStatus === StudentStatus.DROPOUT ? "FF8B0000" : undefined,
      });
    } else {
      styleRange(worksheet, sheetRow, sheetRow, 1, totalColumns);
    }
  });

  worksheet.getColumn(3).alignment = { ...BASE_ALIGNMENT, horizontal: "left" };
}

export async function generateWeeklyReportXlsx(periodId: number): Promise<WeeklyReportGenerationResult | null> {
  const { period, scopes } = await buildScopes(periodId);
  if (scopes.length === 0) {
    return null;
  }

  const workbook = await createWorkbook();
  for (const scope of scopes) {
    addSummaryWorksheet(workbook, period.name, scope);
    addRiskWorksheet(workbook, period.name, scope);
    addScoresWorksheet(workbook, period.name, scope);
  }

  const generatedAt = new Date();
  const fileName = `weekly-report-${slugify(period.name)}-${formatFileDate(generatedAt)}.xlsx`;

  return {
    buffer: await workbookToBuffer(workbook),
    generatedAt,
    fileName,
    periodId: period.id,
    periodName: period.name,
    scopes: scopes.map((scope) => ({
      examType: scope.examType,
      weekKey: scope.week.key,
      weekLabel: scope.week.label,
      previousWeekKey: scope.previousWeekKey,
      previousWeekLabel: scope.previousWeekLabel,
      studentCount: scope.results.sheetRows.length,
      riskCount: scope.riskRows.length,
      sheetNames: scope.sheetNames,
    })),
  };
}
