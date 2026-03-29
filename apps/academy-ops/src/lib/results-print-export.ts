import { AttendType, ExamType, StudentStatus } from "@prisma/client";
import {
  getIntegratedResults,
  getMonthlyResults,
  getWeeklyResults,
} from "@/lib/analytics/service";
import { EXAM_TYPE_LABEL, getSubjectDisplayLabel } from "@/lib/constants";
import { formatRank, formatScore } from "@/lib/analytics/presentation";
import { formatTuesdayWeekLabel } from "@/lib/analytics/week";
import { formatDateWithWeekday } from "@/lib/format";
import { buildSessionDisplayColumns } from "@/lib/exam-session-rules";

type WeeklyPrintData = Awaited<ReturnType<typeof getWeeklyResults>>;
type MonthlyPrintData = Awaited<ReturnType<typeof getMonthlyResults>>;
type IntegratedPrintData = Awaited<ReturnType<typeof getIntegratedResults>>;
type PrintableSession = WeeklyPrintData["sessions"][number] & { examDate: Date };
type ExcelAlignment = import("exceljs").Alignment;
type ExcelBorders = import("exceljs").Borders;
type ExcelCell = import("exceljs").Cell;
type ExcelFill = import("exceljs").Fill;
type ExcelPaperSize = import("exceljs").PaperSize;
type ExcelWorkbook = import("exceljs").Workbook;
type ExcelWorksheet = import("exceljs").Worksheet;

function reviveDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

function normalizeSessions<T extends { examDate: Date | string }>(sessions: T[]) {
  return sessions.map((session) => ({
    ...session,
    examDate: reviveDate(session.examDate),
  }));
}

const STATUS_LABEL: Record<StudentStatus, string> = {
  NORMAL: "",
  WARNING_1: "1차 경고",
  WARNING_2: "2차 경고",
  DROPOUT: "탈락",
};

const BASE_FONT = { name: "Malgun Gothic", size: 9 };
const BASE_ALIGNMENT: Partial<ExcelAlignment> = {
  horizontal: "center",
  vertical: "middle",
  wrapText: true,
};
const GRID_BORDER: Partial<ExcelBorders> = {
  top: { style: "thin", color: { argb: "FFB7B7B7" } },
  left: { style: "thin", color: { argb: "FFB7B7B7" } },
  bottom: { style: "thin", color: { argb: "FFB7B7B7" } },
  right: { style: "thin", color: { argb: "FFB7B7B7" } },
};
const HEADER_FILL: ExcelFill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFEDEDED" },
};
const AVERAGE_FILL: ExcelFill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF5F5F5" },
};
const WARNING_1_FILL: ExcelFill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFBE5E5" },
};
const WARNING_2_FILL: ExcelFill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF8EDC7" },
};
const DROPOUT_FILL: ExcelFill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFF3B30" },
};

async function createWorkbook() {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "OpenAI Codex";
  workbook.lastModifiedBy = "OpenAI Codex";
  workbook.created = new Date();
  workbook.modified = new Date();
  return workbook;
}

function configurePrintSheet(
  worksheet: ExcelWorksheet,
  widths: number[],
  titleRows: number[],
) {
  worksheet.properties.defaultRowHeight = 20;
  worksheet.views = [{ showGridLines: false }];
  worksheet.pageSetup = {
    paperSize: 12 as unknown as ExcelPaperSize,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    margins: {
      left: 0.2,
      right: 0.2,
      top: 0.35,
      bottom: 0.35,
      header: 0.15,
      footer: 0.15,
    },
    showGridLines: false,
  };
  worksheet.columns = widths.map((width) => ({ width }));

  titleRows.forEach((rowNumber) => {
    worksheet.getRow(rowNumber).height = rowNumber === 1 ? 30 : 22;
  });
}

function styleCell(
  cell: ExcelCell,
  options?: {
    bold?: boolean;
    fontSize?: number;
    color?: string;
    fill?: ExcelFill;
    border?: Partial<ExcelBorders> | null;
  },
) {
  cell.font = {
    ...BASE_FONT,
    bold: options?.bold ?? false,
    size: options?.fontSize ?? BASE_FONT.size,
    color: options?.color ? { argb: options.color } : undefined,
  };
  cell.alignment = BASE_ALIGNMENT;
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
  options?: {
    bold?: boolean;
    fontSize?: number;
    color?: string;
    fill?: ExcelFill;
    border?: Partial<ExcelBorders> | null;
  },
) {
  for (let row = startRow; row <= endRow; row += 1) {
    for (let col = startCol; col <= endCol; col += 1) {
      styleCell(worksheet.getRow(row).getCell(col), options);
    }
  }
}

function setMergedTitle(
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

function writeCell(worksheet: ExcelWorksheet, row: number, col: number, value: string | number) {
  worksheet.getRow(row).getCell(col).value = value;
}

function statusFill(status: StudentStatus) {
  if (status === StudentStatus.WARNING_1) {
    return WARNING_1_FILL;
  }

  if (status === StudentStatus.WARNING_2) {
    return WARNING_2_FILL;
  }

  if (status === StudentStatus.DROPOUT) {
    return DROPOUT_FILL;
  }

  return undefined;
}

function toPrintCell(
  attendType: AttendType | null,
  value: number | null,
  mode: "mock" | "ox",
) {
  if (attendType === AttendType.NORMAL) {
    return value === null ? "" : formatScore(value);
  }

  if (attendType === AttendType.LIVE) {
    if (value !== null && mode === "mock") {
      return `${formatScore(value)}(라이브)`;
    }

    return "라이브";
  }

  if (attendType === AttendType.EXCUSED) {
    return "사유";
  }

  return "";
}

function weeklyAverageValues(data: WeeklyPrintData) {
  const sessions = normalizeSessions(data.sessions).sort(
    (left, right) => left.examDate.getTime() - right.examDate.getTime() || left.id - right.id,
  );
  const displayColumns = buildSessionDisplayColumns(sessions);

  return displayColumns.map((column) => {
    const mockValues = column.mainSession
      ? data.sheetRows
          .map((row) => row.cells.find((cell) => cell.sessionId === column.mainSession?.id))
          .filter((cell) => cell?.attendType === AttendType.NORMAL && cell.mockScore !== null)
          .map((cell) => cell?.mockScore as number)
      : [];
    const oxValues = column.oxSession
      ? data.sheetRows
          .map((row) => row.cells.find((cell) => cell.sessionId === column.oxSession?.id))
          .filter((cell) => cell?.attendType === AttendType.NORMAL && cell.policeOxScore !== null)
          .map((cell) => cell?.policeOxScore as number)
      : [];

    return {
      mock:
        mockValues.length === 0
          ? "-"
          : formatScore(mockValues.reduce((sum, value) => sum + value, 0) / mockValues.length),
      ox:
        oxValues.length === 0
          ? "-"
          : formatScore(oxValues.reduce((sum, value) => sum + value, 0) / oxValues.length),
    };
  });
}

async function workbookToBuffer(workbook: ExcelWorkbook) {
  const value = await workbook.xlsx.writeBuffer();
  return Buffer.from(value);
}

export async function createWeeklyResultsPrintWorkbook(
  data: WeeklyPrintData,
  examType: ExamType,
  view: "overall" | "new",
) {
  const workbook = await createWorkbook();
  const worksheet = workbook.addWorksheet("주간성적표");
  const sessions: PrintableSession[] = normalizeSessions(data.sessions).sort(
    (left, right) => left.examDate.getTime() - right.examDate.getTime() || left.id - right.id,
  );
  const displayColumns = buildSessionDisplayColumns(sessions);
  const sessionColumnCount = displayColumns.reduce(
    (count, column) => count + (column.oxSession ? 2 : 1),
    0,
  );
  const totalColumns = 2 + sessionColumnCount + 6;
  const widths = [5, 10];
  const averages = weeklyAverageValues(data);

  displayColumns.forEach((column) => {
    widths.push(column.oxSession ? 8 : 9);
    if (column.oxSession) {
      widths.push(8);
    }
  });
  widths.push(9, 8, 10, 8, 7, 9);

  configurePrintSheet(worksheet, widths, [1, 2]);
  setMergedTitle(
    worksheet,
    1,
    1,
    totalColumns,
    `${EXAM_TYPE_LABEL[examType]} 주간 성적표`,
    18,
  );
  setMergedTitle(
    worksheet,
    2,
    1,
    totalColumns,
    `${data.period.name} / ${formatTuesdayWeekLabel(data.week.key)}${
      view === "new" ? " / 신규생" : ""
    }`,
    10,
  );

  worksheet.mergeCells(3, 1, 4, 1);
  worksheet.mergeCells(3, 2, 4, 2);
  writeCell(worksheet, 3, 1, "번호");
  writeCell(worksheet, 3, 2, "이름");

  let columnIndex = 3;
  displayColumns.forEach((column, index) => {
    const span = column.oxSession ? 2 : 1;
    worksheet.mergeCells(3, columnIndex, 3, columnIndex + span - 1);
    writeCell(
      worksheet,
      3,
      columnIndex,
      `${formatDateWithWeekday(column.examDate)}\n${getSubjectDisplayLabel(column.subject, column.displaySubjectName)}`,
    );
    writeCell(worksheet, 4, columnIndex, "모의고사");
    writeCell(worksheet, 5, columnIndex, averages[index]?.mock ?? "-");

    if (column.oxSession) {
      writeCell(worksheet, 4, columnIndex + 1, "경찰학 OX");
      writeCell(worksheet, 5, columnIndex + 1, averages[index]?.ox ?? "-");
      columnIndex += 2;
      return;
    }

    columnIndex += 1;
  });

  const summaryHeaders = [
    "모의고사 성적",
    "모의고사 석차",
    "경찰학 OX 성적",
    "경찰학 OX 석차",
    "참석률",
    "비고",
  ];

  summaryHeaders.forEach((header, offset) => {
    const col = columnIndex + offset;
    worksheet.mergeCells(3, col, 4, col);
    writeCell(worksheet, 3, col, header);
  });

  worksheet.mergeCells(5, 1, 5, 2);
  writeCell(worksheet, 5, 1, "응시자 평균");

  data.sheetRows.forEach((row, rowIndex) => {
    const sheetRow = 6 + rowIndex;
    writeCell(worksheet, sheetRow, 1, rowIndex + 1);
    writeCell(worksheet, sheetRow, 2, row.name);

    let valueColumn = 3;
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
        toPrintCell(mainCell?.attendType ?? null, mainCell?.mockScore ?? null, "mock"),
      );

      if (column.oxSession) {
        writeCell(
          worksheet,
          sheetRow,
          valueColumn + 1,
          toPrintCell(oxCell?.attendType ?? mainCell?.attendType ?? null, oxCell?.policeOxScore ?? null, "ox"),
        );
        valueColumn += 2;
        return;
      }

      valueColumn += 1;
    });

    writeCell(worksheet, sheetRow, valueColumn, formatScore(row.mockAverage));
    writeCell(worksheet, sheetRow, valueColumn + 1, formatRank(row.mockRank));
    writeCell(
      worksheet,
      sheetRow,
      valueColumn + 2,
      row.policeOxAverage === null ? "-" : formatScore(row.policeOxAverage),
    );
    writeCell(worksheet, sheetRow, valueColumn + 3, formatRank(row.policeOxRank));
    writeCell(worksheet, sheetRow, valueColumn + 4, `${Math.round(row.attendanceRate)}%`);
    writeCell(worksheet, sheetRow, valueColumn + 5, STATUS_LABEL[row.weekStatus]);
  });

  styleRange(worksheet, 1, 2, 1, totalColumns, { border: null });
  styleRange(worksheet, 3, 4, 1, totalColumns, { bold: true, fill: HEADER_FILL });
  styleRange(worksheet, 5, 5, 1, totalColumns, {
    bold: true,
    fill: AVERAGE_FILL,
    color: "FFE53935",
  });
  styleRange(worksheet, 6, 5 + data.sheetRows.length, 1, totalColumns);

  for (let row = 6; row <= 5 + data.sheetRows.length; row += 1) {
    worksheet.getRow(row).height = 20;
    worksheet.getRow(row).getCell(totalColumns - 4).font = {
      ...BASE_FONT,
      bold: true,
      color: { argb: "FFE53935" },
    };
    worksheet.getRow(row).getCell(totalColumns - 2).font = {
      ...BASE_FONT,
      bold: true,
      color: { argb: "FFE53935" },
    };
    const noteCell = worksheet.getRow(row).getCell(totalColumns);
    const status = data.sheetRows[row - 6]?.weekStatus ?? StudentStatus.NORMAL;
    const fill = statusFill(status);
    if (fill) {
      noteCell.fill = fill;
      if (status === StudentStatus.DROPOUT) {
        noteCell.font = { ...BASE_FONT, bold: true, color: { argb: "FFFFFFFF" } };
      }
    }
  }

  return workbookToBuffer(workbook);
}

function summaryHeaders() {
  return [
    "번호",
    "이름",
    "모의고사 점수",
    "객관식 석차",
    "경찰학 OX 점수",
    "주관식 석차",
    "합산 평균",
    "합산 석차",
    "참여율",
    "비고",
  ];
}

async function createSummaryWorkbook(
  sheetName: string,
  title: string,
  subtitle: string,
  rows: MonthlyPrintData["sheetRows"] | IntegratedPrintData["sheetRows"],
) {
  const workbook = await createWorkbook();
  const worksheet = workbook.addWorksheet(sheetName);
  const headers = summaryHeaders();
  const widths = [5, 10, 11, 9, 11, 9, 10, 9, 8, 10];

  configurePrintSheet(worksheet, widths, [1, 2]);
  setMergedTitle(worksheet, 1, 1, headers.length, title, 18);
  setMergedTitle(worksheet, 2, 1, headers.length, subtitle, 10);

  headers.forEach((header, index) => {
    writeCell(worksheet, 3, index + 1, header);
  });

  rows.forEach((row, index) => {
    const sheetRow = index + 4;
    writeCell(worksheet, sheetRow, 1, index + 1);
    writeCell(worksheet, sheetRow, 2, row.name);
    writeCell(worksheet, sheetRow, 3, formatScore(row.mockAverage));
    writeCell(worksheet, sheetRow, 4, formatRank(row.mockRank));
    writeCell(
      worksheet,
      sheetRow,
      5,
      row.policeOxAverage === null ? "-" : formatScore(row.policeOxAverage),
    );
    writeCell(worksheet, sheetRow, 6, formatRank(row.policeOxRank));
    writeCell(worksheet, sheetRow, 7, formatScore(row.combinedAverage));
    writeCell(worksheet, sheetRow, 8, formatRank(row.combinedRank));
    writeCell(worksheet, sheetRow, 9, `${Math.round(row.participationRate)}%`);
    writeCell(worksheet, sheetRow, 10, row.note ?? "");
    worksheet.getRow(sheetRow).height = 20;
  });

  styleRange(worksheet, 1, 2, 1, headers.length, { border: null });
  styleRange(worksheet, 3, 3, 1, headers.length, { bold: true, fill: HEADER_FILL });
  styleRange(worksheet, 4, 3 + rows.length, 1, headers.length);

  for (let row = 4; row <= 3 + rows.length; row += 1) {
    [4, 6, 8].forEach((col) => {
      worksheet.getRow(row).getCell(col).font = {
        ...BASE_FONT,
        bold: true,
        color: { argb: "FFE53935" },
      };
    });
  }

  return workbookToBuffer(workbook);
}

export async function createMonthlyResultsPrintWorkbook(
  data: MonthlyPrintData,
  examType: ExamType,
  label: string,
  view: "overall" | "new",
) {
  return createSummaryWorkbook(
    "월간성적표",
    `${EXAM_TYPE_LABEL[examType]} 월간 성적표`,
    `${data.period.name} / ${label}${view === "new" ? " / 신규생" : ""}`,
    data.sheetRows,
  );
}

export async function createIntegratedResultsPrintWorkbook(
  data: IntegratedPrintData,
  examType: ExamType,
  view: "overall" | "new",
) {
  return createSummaryWorkbook(
    "통합성적표",
    `${EXAM_TYPE_LABEL[examType]} 통합 2개월 성적표`,
    `${data.period.name}${view === "new" ? " / 신규생" : ""}`,
    data.sheetRows,
  );
}