import ExcelJS from "exceljs";
import { Readable } from "node:stream";

import { normalizePhone } from "@/lib/phone";

export type RosterRow = {
  name: string;
  phone: string;
  gender: "남" | "여" | null;
  series: string | null;
};

const HEADER_NAME = "이름";
const HEADER_PHONE = "연락처";
const HEADER_GENDER = "성별";
const HEADER_SERIES = "직렬";

function normalizeHeader(value: unknown) {
  return String(value ?? "").trim();
}

function getCellValues(row: ExcelJS.Row) {
  const values = Array.isArray(row.values) ? row.values : [];
  return values.slice(1);
}

function getWorkbookWorksheet(fileName: string, workbook: ExcelJS.Workbook) {
  const worksheet = workbook.worksheets[0];

  if (!worksheet) {
    throw new Error(`${fileName} 파일에서 시트를 찾을 수 없습니다.`);
  }

  return worksheet;
}

export async function parseRosterFile(fileName: string, buffer: Uint8Array) {
  const workbook = new ExcelJS.Workbook();

  if (/\.csv$/i.test(fileName)) {
    const text = Buffer.from(buffer).toString("utf8");
    await workbook.csv.read(Readable.from(text));
  } else {
    const loadXlsx = workbook.xlsx.load as unknown as (
      data: Uint8Array,
    ) => Promise<ExcelJS.Workbook>;
    await loadXlsx(buffer);
  }

  const worksheet = getWorkbookWorksheet(fileName, workbook);
  const headerRow = worksheet.getRow(1);
  const headerCells = getCellValues(headerRow).map(normalizeHeader);

  const nameIndex = headerCells.indexOf(HEADER_NAME);
  const phoneIndex = headerCells.indexOf(HEADER_PHONE);
  const genderIndex = headerCells.indexOf(HEADER_GENDER);
  const seriesIndex = headerCells.indexOf(HEADER_SERIES);

  if (nameIndex === -1 || phoneIndex === -1) {
    throw new Error("명단 파일에 이름 또는 연락처 헤더가 없습니다.");
  }

  const rows = new Map<string, RosterRow>();

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) {
      return;
    }

    const values = getCellValues(row);
    const name = String(values[nameIndex] ?? "").trim();
    const phone = normalizePhone(String(values[phoneIndex] ?? "").trim());
    const genderValue = String(values[genderIndex] ?? "").trim();
    const series = String(values[seriesIndex] ?? "").trim();

    if (!name || !phone) {
      return;
    }

    rows.set(phone, {
      name,
      phone,
      gender: genderValue === "남" || genderValue === "여" ? genderValue : null,
      series: series || null,
    });
  });

  return Array.from(rows.values());
}
