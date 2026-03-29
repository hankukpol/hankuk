import { AdminRole } from "@prisma/client";
import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { requireApiAdmin } from "@/lib/api-auth";
import { getMonthlySettlementData } from "@/lib/settlements/monthly";

const FOREST = "FF1F4D3A";
const MIST = "FFF7F4EF";
const WHITE = "FFFFFFFF";
const RED = "FFDC2626";

const UI_TEXT = {
  academyName: "\ud55c\uad6d\uacbd\ucc30\ud559\uc6d0",
  monthlySettlement: "\uc6d4\uacc4\ud45c",
  monthlySummary: "\uc6d4\uacc4\ud45c \uc694\uc57d",
  dailyPayments: "\uc77c\ubcc4 \uc218\ub0a9",
  paymentMethods: "\uacb0\uc81c\uc218\ub2e8",
  categoryHeader: "\uc720\ud615",
  methodHeader: "\uacb0\uc81c \uc218\ub2e8",
  dateHeader: "\ub0a0\uc9dc",
  countHeader: "\uac74\uc218",
  grossHeader: "\uc218\ub0a9\uc561",
  refundHeader: "\ud658\ubd88\uc561",
  netHeader: "\uc2e4\uc218\ub0a9",
  ratioHeader: "\ube44\uc911",
  totalRow: "\ud569\uacc4",
  emptyPayments: "\uc218\ub0a9 \ub0b4\uc5ed\uc774 \uc5c6\uc2b5\ub2c8\ub2e4.",
  filePrefix: "\uc6d4\uacc4\ud45c",
} as const;

const WEEKDAYS = [
  "\uc77c",
  "\uc6d4",
  "\ud654",
  "\uc218",
  "\ubaa9",
  "\uae08",
  "\ud1a0",
] as const;

const CATEGORY_ROWS = [
  { key: "tuition", label: "\uc218\uac15\ub8cc" },
  { key: "facility", label: "\uc2dc\uc124\ube44" },
  { key: "textbook", label: "\uad50\uc7ac" },
  { key: "material", label: "\uad50\uad6c\u00b7\uc18c\ubaa8\ud488" },
  { key: "singleCourse", label: "\ub2e8\uacfc POS" },
  { key: "penalty", label: "\uc704\uc57d\uae08" },
  { key: "etc", label: "\uae30\ud0c0" },
] as const;

const METHOD_ROWS = [
  { key: "cash", label: "\ud604\uae08" },
  { key: "card", label: "\uce74\ub4dc" },
  { key: "transfer", label: "\uacc4\uc88c\uc774\uccb4" },
  { key: "point", label: "\ud3ec\uc778\ud2b8" },
  { key: "mixed", label: "\ubcf5\ud569" },
] as const;

function applyHeaderRow(row: ExcelJS.Row) {
  row.height = 22;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: WHITE } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FOREST } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = { bottom: { style: "thin", color: { argb: "FFCCCCCC" } } };
  });
}

function applyTotalRow(row: ExcelJS.Row) {
  row.height = 24;
  row.eachCell((cell) => {
    cell.font = { bold: true, size: 11, color: { argb: WHITE } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FOREST } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = { top: { style: "medium", color: { argb: "FF000000" } } };
  });
}

function formatKoreanMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return `${year}\ub144 ${monthNumber}\uc6d4`;
}

function formatWeekday(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return `${date.getMonth() + 1}/${date.getDate()}(${WEEKDAYS[date.getDay()]})`;
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const data = await getMonthlySettlementData(request.nextUrl.searchParams.get("month"));
  const { summary, methods, dailyBreakdown } = data;
  const koreanMonth = formatKoreanMonth(data.month);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = UI_TEXT.academyName;
  workbook.created = new Date();

  const summarySheet = workbook.addWorksheet(UI_TEXT.monthlySummary);
  summarySheet.columns = [
    { key: "label", width: 20 },
    { key: "count", width: 10 },
    { key: "gross", width: 18 },
    { key: "refund", width: 18 },
    { key: "net", width: 18 },
  ];

  summarySheet.mergeCells("A1:E1");
  const summaryTitle = summarySheet.getCell("A1");
  summaryTitle.value = `${koreanMonth} ${UI_TEXT.monthlySummary}`;
  summaryTitle.font = { bold: true, size: 14, color: { argb: FOREST } };
  summaryTitle.alignment = { horizontal: "center", vertical: "middle" };
  summaryTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: MIST } };
  summarySheet.getRow(1).height = 32;
  summarySheet.addRow([]);

  applyHeaderRow(
    summarySheet.addRow([
      UI_TEXT.categoryHeader,
      UI_TEXT.countHeader,
      UI_TEXT.grossHeader,
      UI_TEXT.refundHeader,
      UI_TEXT.netHeader,
    ]),
  );

  for (const row of CATEGORY_ROWS) {
    const stat = summary[row.key];
    if (stat.count === 0 && stat.gross === 0 && stat.refund === 0) {
      continue;
    }

    const excelRow = summarySheet.addRow([
      row.label,
      stat.count,
      stat.gross,
      stat.refund > 0 ? -stat.refund : 0,
      stat.net,
    ]);
    excelRow.getCell(2).alignment = { horizontal: "right" };
    excelRow.getCell(3).numFmt = '#,##0"\uc6d0"';
    excelRow.getCell(4).numFmt = '#,##0"\uc6d0"';
    excelRow.getCell(5).numFmt = '#,##0"\uc6d0"';
    excelRow.getCell(5).font = { color: { argb: FOREST } };
    if (stat.refund > 0) {
      excelRow.getCell(4).font = { color: { argb: RED } };
    }
    excelRow.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WHITE } };
      cell.border = { bottom: { style: "hair", color: { argb: "FFDDDDDD" } } };
    });
  }

  const summaryTotal = summarySheet.addRow([
    UI_TEXT.totalRow,
    summary.totalCount,
    summary.grossTotal,
    summary.refundTotal > 0 ? -summary.refundTotal : 0,
    summary.netTotal,
  ]);
  applyTotalRow(summaryTotal);
  summaryTotal.getCell(3).numFmt = '#,##0"\uc6d0"';
  summaryTotal.getCell(4).numFmt = '#,##0"\uc6d0"';
  summaryTotal.getCell(5).numFmt = '#,##0"\uc6d0"';
  summarySheet.views = [{ state: "frozen", ySplit: 3 }];

  const dailySheet = workbook.addWorksheet(UI_TEXT.dailyPayments);
  dailySheet.columns = [
    { key: "date", width: 16 },
    { key: "count", width: 10 },
    { key: "gross", width: 18 },
    { key: "refund", width: 18 },
    { key: "net", width: 18 },
  ];

  dailySheet.mergeCells("A1:E1");
  const dailyTitle = dailySheet.getCell("A1");
  dailyTitle.value = `${koreanMonth} ${UI_TEXT.dailyPayments}`;
  dailyTitle.font = { bold: true, size: 14, color: { argb: FOREST } };
  dailyTitle.alignment = { horizontal: "center", vertical: "middle" };
  dailyTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: MIST } };
  dailySheet.getRow(1).height = 32;
  dailySheet.addRow([]);

  applyHeaderRow(
    dailySheet.addRow([
      UI_TEXT.dateHeader,
      UI_TEXT.countHeader,
      UI_TEXT.grossHeader,
      UI_TEXT.refundHeader,
      UI_TEXT.netHeader,
    ]),
  );

  if (dailyBreakdown.length === 0) {
    const emptyRow = dailySheet.addRow([UI_TEXT.emptyPayments, "", "", "", ""]);
    dailySheet.mergeCells(`A${emptyRow.number}:E${emptyRow.number}`);
    emptyRow.getCell(1).alignment = { horizontal: "center" };
    emptyRow.getCell(1).font = { color: { argb: "FF9CA3AF" } };
  } else {
    for (const entry of dailyBreakdown) {
      const excelRow = dailySheet.addRow([
        formatWeekday(entry.date),
        entry.count,
        entry.gross,
        entry.refund > 0 ? -entry.refund : 0,
        entry.net,
      ]);
      excelRow.getCell(1).alignment = { horizontal: "center" };
      excelRow.getCell(2).alignment = { horizontal: "right" };
      excelRow.getCell(3).numFmt = '#,##0"\uc6d0"';
      excelRow.getCell(4).numFmt = '#,##0"\uc6d0"';
      excelRow.getCell(5).numFmt = '#,##0"\uc6d0"';
      excelRow.getCell(5).font = { color: { argb: FOREST } };
      if (entry.refund > 0) {
        excelRow.getCell(4).font = { color: { argb: RED } };
      }
      excelRow.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WHITE } };
        cell.border = { bottom: { style: "hair", color: { argb: "FFDDDDDD" } } };
      });
    }

    const dailyTotal = dailySheet.addRow([
      UI_TEXT.totalRow,
      summary.totalCount,
      summary.grossTotal,
      summary.refundTotal > 0 ? -summary.refundTotal : 0,
      summary.netTotal,
    ]);
    applyTotalRow(dailyTotal);
    dailyTotal.getCell(3).numFmt = '#,##0"\uc6d0"';
    dailyTotal.getCell(4).numFmt = '#,##0"\uc6d0"';
    dailyTotal.getCell(5).numFmt = '#,##0"\uc6d0"';
  }
  dailySheet.views = [{ state: "frozen", ySplit: 3 }];

  const methodSheet = workbook.addWorksheet(UI_TEXT.paymentMethods);
  methodSheet.columns = [
    { key: "method", width: 18 },
    { key: "count", width: 10 },
    { key: "amount", width: 18 },
    { key: "ratio", width: 12 },
  ];

  methodSheet.mergeCells("A1:D1");
  const methodTitle = methodSheet.getCell("A1");
  methodTitle.value = `${koreanMonth} ${UI_TEXT.paymentMethods}`;
  methodTitle.font = { bold: true, size: 14, color: { argb: FOREST } };
  methodTitle.alignment = { horizontal: "center", vertical: "middle" };
  methodTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: MIST } };
  methodSheet.getRow(1).height = 32;
  methodSheet.addRow([]);

  applyHeaderRow(
    methodSheet.addRow([
      UI_TEXT.methodHeader,
      UI_TEXT.countHeader,
      UI_TEXT.grossHeader,
      UI_TEXT.ratioHeader,
    ]),
  );

  for (const row of METHOD_ROWS) {
    const stat = methods[row.key];
    if (stat.count === 0 && stat.amount === 0) {
      continue;
    }

    const ratio = summary.grossTotal > 0 ? stat.amount / summary.grossTotal : 0;
    const excelRow = methodSheet.addRow([row.label, stat.count, stat.amount, ratio]);
    excelRow.getCell(2).alignment = { horizontal: "right" };
    excelRow.getCell(3).numFmt = '#,##0"\uc6d0"';
    excelRow.getCell(4).numFmt = "0.0%";
    excelRow.getCell(4).alignment = { horizontal: "right" };
    excelRow.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WHITE } };
      cell.border = { bottom: { style: "hair", color: { argb: "FFDDDDDD" } } };
    });
  }

  const methodTotal = methodSheet.addRow([UI_TEXT.totalRow, summary.totalCount, summary.grossTotal, 1]);
  applyTotalRow(methodTotal);
  methodTotal.getCell(3).numFmt = '#,##0"\uc6d0"';
  methodTotal.getCell(4).numFmt = "0.0%";
  methodSheet.views = [{ state: "frozen", ySplit: 3 }];

  const buffer = await workbook.xlsx.writeBuffer();
  const fileName = `${UI_TEXT.filePrefix}-${data.month}.xlsx`;
  const encodedName = encodeURIComponent(fileName);

  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${encodedName}"; filename*=UTF-8''${encodedName}`,
      "Cache-Control": "no-store",
    },
  });
}
