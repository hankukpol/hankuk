import { NextResponse } from "next/server";

export async function createWorkbook() {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Codex";
  workbook.created = new Date();
  return workbook;
}

export function styleWorksheetHeader(worksheet: {
  getRow: (index: number) => {
    font: { bold?: boolean };
    fill: {
      type?: string;
      pattern?: string;
      fgColor?: { argb?: string };
    };
    alignment: { vertical?: string; horizontal?: string };
  };
  views?: Array<Record<string, unknown>>;
}) {
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE2E8F0" },
  };
  headerRow.alignment = {
    vertical: "middle",
    horizontal: "center",
  };
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
}

export function buildExcelResponse(filename: string, buffer: Buffer | Uint8Array | ArrayBuffer) {
  const body =
    buffer instanceof ArrayBuffer
      ? Buffer.from(buffer)
      : buffer instanceof Uint8Array
        ? Buffer.from(buffer)
        : buffer;

  return new NextResponse(body, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=\"${filename}\"`,
      "Cache-Control": "private, no-store",
    },
  });
}
