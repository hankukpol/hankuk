import * as XLSX from "xlsx";

export type SheetRows = Array<Array<string | number | boolean | Date | null>>;

export function readWorkbookFromBuffer(buffer: Buffer | ArrayBuffer) {
  const binary = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

  return XLSX.read(binary, {
    type: "buffer",
    cellDates: false,
    dense: false,
  });
}

export function getSheetRows(workbook: XLSX.WorkBook, sheetName: string): SheetRows {
  const sheet = workbook.Sheets[sheetName];

  if (!sheet) {
    throw new Error(`Sheet "${sheetName}" not found.`);
  }

  return XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: true,
  }) as SheetRows;
}

export function toCellString(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value).trim();
}

export function columnLabelFromIndex(index: number) {
  let label = "";
  let current = index + 1;

  while (current > 0) {
    const remainder = (current - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    current = Math.floor((current - 1) / 26);
  }

  return label;
}

export function parseExcelDate(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);

    if (!parsed) {
      return null;
    }

    return new Date(
      Date.UTC(
        parsed.y,
        parsed.m - 1,
        parsed.d,
        parsed.H,
        parsed.M,
        Math.floor(parsed.S),
      ),
    );
  }

  if (typeof value === "string") {
    const normalized = value.trim();

    if (!normalized) {
      return null;
    }

    const date = new Date(normalized);

    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  return null;
}

export function normalizePhone(value: unknown) {
  const raw = toCellString(value);

  if (!raw) {
    return null;
  }

  const digits = raw.replace(/\D/g, "");

  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }

  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  return raw;
}
