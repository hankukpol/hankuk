import * as XLSX from "xlsx";

export type ExportFormat = "csv" | "xlsx";

export type ExportColumn<T> = {
  header: string;
  value: (row: T) => string | number | boolean | null | undefined;
};

function escapeCsvCell(value: string | number | boolean | null | undefined) {
  const stringValue = value === null || value === undefined ? "" : String(value);

  if (/[",\r\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

export function createCsvBuffer<T>(rows: T[], columns: ExportColumn<T>[]) {
  const headerLine = columns.map((column) => escapeCsvCell(column.header)).join(",");
  const lines = rows.map((row) =>
    columns.map((column) => escapeCsvCell(column.value(row))).join(","),
  );
  const csv = `\uFEFF${[headerLine, ...lines].join("\r\n")}`;

  return Buffer.from(csv, "utf8");
}

export function createXlsxBuffer<T>(rows: T[], columns: ExportColumn<T>[], sheetName: string) {
  const workbook = XLSX.utils.book_new();
  const data = rows.map((row) =>
    Object.fromEntries(columns.map((column) => [column.header, column.value(row) ?? ""])),
  );
  const worksheet = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

export function createDownloadResponse(
  buffer: Buffer,
  fileName: string,
  format: ExportFormat,
) {
  const contentType =
    format === "csv"
      ? "text/csv; charset=utf-8"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "no-store",
    },
  });
}
