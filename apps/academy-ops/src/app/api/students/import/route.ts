/**
 * POST /api/students/import
 *
 * CSV-only student import endpoint with fixed column headers:
 *   학번, 이름, 연락처, 수험유형(GONGCHAE/GYEONGCHAE), 생년월일(optional), 학생구분(optional)
 *
 * Accepts multipart/form-data with:
 *   - csv: File | text (CSV content as string)
 *   - duplicateStrategy: "UPDATE" | "SKIP" | "OVERWRITE" (default: "UPDATE")
 *
 * Returns: { created: number, updated: number, skipped: number, errors: Array<{ row: number; examNumber: string; message: string }> }
 */

import { AdminRole, ExamType, StudentType } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type DuplicateStrategy = "UPDATE" | "SKIP" | "OVERWRITE";

type CsvRow = {
  rowIndex: number;
  examNumber: string;
  name: string;
  phone: string | null;
  examType: ExamType;
  birthDate: Date | null;
  studentType: StudentType;
};

type ImportError = {
  row: number;
  examNumber: string;
  message: string;
};

// ─── CSV parsing ─────────────────────────────────────────────────────────────

function parseCsvText(text: string): string[][] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  return lines
    .map((line) => {
      const cells: string[] = [];
      let inQuote = false;
      let cell = "";
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuote && line[i + 1] === '"') {
            cell += '"';
            i++;
          } else {
            inQuote = !inQuote;
          }
        } else if (ch === "," && !inQuote) {
          cells.push(cell.trim());
          cell = "";
        } else {
          cell += ch;
        }
      }
      cells.push(cell.trim());
      return cells;
    })
    .filter((row) => row.some((cell) => cell !== ""));
}

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 9 || digits.length > 11) return null;
  if (digits.startsWith("010") || digits.startsWith("011") || digits.startsWith("016") || digits.startsWith("017") || digits.startsWith("018") || digits.startsWith("019")) {
    if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  return raw.trim() || null;
}

function parseExamType(raw: string): ExamType | null {
  const v = raw.toUpperCase().trim();
  if (v === "GONGCHAE" || v === "공채") return "GONGCHAE";
  if (v === "GYEONGCHAE" || v === "경채") return "GYEONGCHAE";
  return null;
}

function parseStudentType(raw: string): StudentType {
  const v = raw.toUpperCase().trim();
  if (v === "NEW" || v === "신규") return "NEW";
  return "EXISTING";
}

function parseBirthDate(raw: string): Date | null {
  if (!raw.trim()) return null;
  // YYYYMMDD or YYYY-MM-DD or YYYY.MM.DD
  const normalized = raw.replace(/[.\-/]/g, "").trim();
  if (/^\d{8}$/.test(normalized)) {
    const year = parseInt(normalized.slice(0, 4), 10);
    const month = parseInt(normalized.slice(4, 6), 10) - 1;
    const day = parseInt(normalized.slice(6, 8), 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime()) && d.getFullYear() === year) return d;
  }
  return null;
}

// ─── Header detection ────────────────────────────────────────────────────────

type ColumnMap = {
  examNumber: number;
  name: number;
  phone: number | null;
  examType: number | null;
  birthDate: number | null;
  studentType: number | null;
};

const HEADER_ALIASES: Record<string, keyof ColumnMap> = {
  학번: "examNumber",
  수험번호: "examNumber",
  이름: "name",
  성명: "name",
  연락처: "phone",
  전화번호: "phone",
  핸드폰: "phone",
  수험유형: "examType",
  직렬: "examType",
  생년월일: "birthDate",
  학생구분: "studentType",
  구분: "studentType",
};

function detectColumns(headers: string[]): ColumnMap {
  const map: ColumnMap = {
    examNumber: -1,
    name: -1,
    phone: null,
    examType: null,
    birthDate: null,
    studentType: null,
  };

  headers.forEach((header, idx) => {
    const normalized = header.trim();
    const key = HEADER_ALIASES[normalized];
    if (key === "examNumber") map.examNumber = idx;
    else if (key === "name") map.name = idx;
    else if (key === "phone") map.phone = idx;
    else if (key === "examType") map.examType = idx;
    else if (key === "birthDate") map.birthDate = idx;
    else if (key === "studentType") map.studentType = idx;
  });

  return map;
}

// ─── Row parsing ─────────────────────────────────────────────────────────────

function parseRows(
  rows: string[][],
  colMap: ColumnMap,
  defaultExamType: ExamType,
): { validRows: CsvRow[]; errors: ImportError[] } {
  const validRows: CsvRow[] = [];
  const errors: ImportError[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowIndex = i + 2; // 1-indexed, header is row 1
    const examNumber = colMap.examNumber >= 0 ? (row[colMap.examNumber] ?? "").trim() : "";
    const name = colMap.name >= 0 ? (row[colMap.name] ?? "").trim() : "";

    if (!examNumber) {
      errors.push({ row: rowIndex, examNumber: "", message: "학번이 비어 있습니다." });
      continue;
    }
    if (!name) {
      errors.push({ row: rowIndex, examNumber, message: "이름이 비어 있습니다." });
      continue;
    }

    const rawPhone = colMap.phone !== null ? (row[colMap.phone] ?? "").trim() : "";
    const phone = rawPhone ? normalizePhone(rawPhone) : null;

    const rawExamType = colMap.examType !== null ? (row[colMap.examType] ?? "").trim() : "";
    const examType = rawExamType ? (parseExamType(rawExamType) ?? defaultExamType) : defaultExamType;

    const rawBirthDate = colMap.birthDate !== null ? (row[colMap.birthDate] ?? "").trim() : "";
    const birthDate = rawBirthDate ? parseBirthDate(rawBirthDate) : null;

    const rawStudentType = colMap.studentType !== null ? (row[colMap.studentType] ?? "").trim() : "";
    const studentType = rawStudentType ? parseStudentType(rawStudentType) : "EXISTING";

    validRows.push({ rowIndex, examNumber, name, phone, examType, birthDate, studentType });
  }

  return { validRows, errors };
}

// ─── Import execution ────────────────────────────────────────────────────────

async function runImport(
  validRows: CsvRow[],
  duplicateStrategy: DuplicateStrategy,
): Promise<{ created: number; updated: number; skipped: number }> {
  const prisma = getPrisma();
  let created = 0;
  let updated = 0;
  let skipped = 0;

  // Fetch existing students by examNumber
  const examNumbers = validRows.map((r) => r.examNumber);
  const existing = await prisma.student.findMany({
    where: { examNumber: { in: examNumbers } },
    select: { examNumber: true },
  });
  const existingSet = new Set(existing.map((s) => s.examNumber));

  const newRows = validRows.filter((r) => !existingSet.has(r.examNumber));
  const existingRows = validRows.filter((r) => existingSet.has(r.examNumber));

  // Create new students
  if (newRows.length > 0) {
    const createResult = await prisma.student.createMany({
      data: newRows.map((r) => ({
        examNumber: r.examNumber,
        name: r.name,
        phone: r.phone,
        birthDate: r.birthDate,
        examType: r.examType,
        studentType: r.studentType,
        isActive: true,
      })),
      skipDuplicates: true,
    });
    created = createResult.count;
  }

  // Handle existing students
  if (duplicateStrategy === "SKIP") {
    skipped = existingRows.length;
  } else {
    // UPDATE or OVERWRITE both update; OVERWRITE replaces all fields, UPDATE only non-null fields
    for (const row of existingRows) {
      if (duplicateStrategy === "OVERWRITE") {
        await prisma.student.update({
          where: { examNumber: row.examNumber },
          data: {
            name: row.name,
            phone: row.phone,
            birthDate: row.birthDate,
            examType: row.examType,
            studentType: row.studentType,
          },
        });
      } else {
        // UPDATE: only update fields that are present in CSV
        await prisma.student.update({
          where: { examNumber: row.examNumber },
          data: {
            name: row.name,
            ...(row.phone !== null ? { phone: row.phone } : {}),
            ...(row.birthDate !== null ? { birthDate: row.birthDate } : {}),
            examType: row.examType,
            studentType: row.studentType,
          },
        });
      }
      updated++;
    }
  }

  return { created, updated, skipped };
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const formData = await request.formData();

    // Get CSV content from file or text field
    const fileField = formData.get("csv");
    const textField = formData.get("text");

    let csvText = "";

    if (fileField instanceof File) {
      if (fileField.size === 0) {
        return NextResponse.json({ error: "파일이 비어 있습니다." }, { status: 400 });
      }
      const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
      if (fileField.size > MAX_BYTES) {
        return NextResponse.json({ error: "파일이 10 MB를 초과합니다." }, { status: 400 });
      }
      csvText = await fileField.text();
    } else if (typeof textField === "string" && textField.trim()) {
      csvText = textField;
    } else {
      return NextResponse.json(
        { error: "CSV 파일 또는 텍스트를 제공해 주세요." },
        { status: 400 },
      );
    }

    // Parse duplicate strategy
    const rawStrategy = formData.get("duplicateStrategy");
    const validStrategies: DuplicateStrategy[] = ["UPDATE", "SKIP", "OVERWRITE"];
    const duplicateStrategy: DuplicateStrategy =
      typeof rawStrategy === "string" && validStrategies.includes(rawStrategy as DuplicateStrategy)
        ? (rawStrategy as DuplicateStrategy)
        : "UPDATE";

    // Default examType fallback
    const rawDefaultExamType = formData.get("defaultExamType");
    const defaultExamType: ExamType =
      rawDefaultExamType === "GYEONGCHAE" ? "GYEONGCHAE" : "GONGCHAE";

    // Parse CSV
    const allRows = parseCsvText(csvText);
    if (allRows.length < 2) {
      return NextResponse.json(
        { error: "CSV에 헤더와 데이터 행이 최소 1개씩 필요합니다." },
        { status: 400 },
      );
    }

    const headerRow = allRows[0];
    const dataRows = allRows.slice(1);

    const colMap = detectColumns(headerRow);
    if (colMap.examNumber < 0) {
      return NextResponse.json(
        { error: "CSV 헤더에서 학번/수험번호 열을 찾을 수 없습니다." },
        { status: 400 },
      );
    }
    if (colMap.name < 0) {
      return NextResponse.json(
        { error: "CSV 헤더에서 이름/성명 열을 찾을 수 없습니다." },
        { status: 400 },
      );
    }

    // Parse data rows
    const { validRows, errors } = parseRows(dataRows, colMap, defaultExamType);

    if (validRows.length === 0) {
      return NextResponse.json({
        created: 0,
        updated: 0,
        skipped: 0,
        errors,
      });
    }

    // Check for duplicate examNumbers within the CSV
    const seen = new Set<string>();
    const deduped: CsvRow[] = [];
    for (const row of validRows) {
      if (seen.has(row.examNumber)) {
        errors.push({
          row: row.rowIndex,
          examNumber: row.examNumber,
          message: "CSV 내 중복 학번입니다. 첫 번째 행만 처리됩니다.",
        });
      } else {
        seen.add(row.examNumber);
        deduped.push(row);
      }
    }

    // Execute import
    const result = await runImport(deduped, duplicateStrategy);

    return NextResponse.json({
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
      errors,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "CSV 가져오기 중 오류가 발생했습니다.",
      },
      { status: 400 },
    );
  }
}
