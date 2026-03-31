import ExcelJS from "exceljs";
import { Readable } from "node:stream";

import {
  INTERVIEW_EXPERIENCE_HEADER_KEYWORDS,
  parseInterviewExperience,
} from "@/lib/interview-experience";
import { normalizePhone } from "@/lib/phone";

export type StudyGroupImportRow = {
  name: string;
  phone: string;
  gender: string | null;
  series: string | null;
  region: string | null;
  age: number | null;
  score: number | null;
  interviewExperience: boolean | null;
  groupNumber: number | null;
};

const NAME_KEYWORDS = ["이름", "성명", "name"];
const PHONE_KEYWORDS = ["연락처", "전화번호", "핸드폰", "휴대폰", "phone", "전화"];
const GENDER_KEYWORDS = ["성별", "gender"];
const SERIES_KEYWORDS = ["직렬", "분야", "series", "직무"];
const REGION_KEYWORDS = ["지역", "시도", "region", "거주지"];
const SCORE_KEYWORDS = ["성적", "점수", "필기성적", "필기점수", "score"];
const GROUP_KEYWORDS = ["조", "편성조", "group", "스터디조"];
const AGE_KEYWORDS = ["나이", "연령", "age", "출생년도"];

function normalizeHeader(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function getCellValues(row: ExcelJS.Row) {
  const values = Array.isArray(row.values) ? row.values : [];
  return values.slice(1);
}

function getWorksheet(fileName: string, workbook: ExcelJS.Workbook) {
  const worksheet = workbook.worksheets[0];

  if (!worksheet) {
    throw new Error(`${fileName} 파일에서 시트를 찾을 수 없습니다.`);
  }

  return worksheet;
}

function findHeaderIndex(headers: string[], keywords: string[]) {
  const exact = headers.findIndex((header) =>
    keywords.some((keyword) => header === keyword.toLowerCase()),
  );

  if (exact >= 0) {
    return exact;
  }

  return headers.findIndex((header) =>
    keywords.some(
      (keyword) => keyword.length >= 2 && header.includes(keyword.toLowerCase()),
    ),
  );
}

function parseScore(value: unknown) {
  const raw = String(value ?? "").trim();

  if (!raw) {
    return null;
  }

  const parsed = Number.parseFloat(raw);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseAge(value: unknown) {
  const raw = String(value ?? "").trim();

  if (!raw) {
    return null;
  }

  const parsed = Number.parseInt(raw, 10);

  if (Number.isNaN(parsed)) {
    return null;
  }

  const currentYear = new Date().getFullYear();

  if (parsed >= 1950 && parsed <= currentYear) {
    return currentYear - parsed;
  }

  return parsed > 0 ? parsed : null;
}

function parseGroupNumber(value: unknown) {
  const raw = String(value ?? "")
    .trim()
    .replaceAll(/\s+/g, "")
    .replaceAll("조", "");

  if (!raw) {
    return null;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) || parsed < 1 ? null : parsed;
}

export async function parseStudyGroupFile(
  fileName: string,
  buffer: Uint8Array,
) {
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

  const worksheet = getWorksheet(fileName, workbook);
  const headerRow = worksheet.getRow(1);
  const headers = getCellValues(headerRow).map(normalizeHeader);

  const nameIndex = findHeaderIndex(headers, NAME_KEYWORDS);
  const phoneIndex = findHeaderIndex(headers, PHONE_KEYWORDS);
  const genderIndex = findHeaderIndex(headers, GENDER_KEYWORDS);
  const seriesIndex = findHeaderIndex(headers, SERIES_KEYWORDS);
  const regionIndex = findHeaderIndex(headers, REGION_KEYWORDS);
  const ageIndex = findHeaderIndex(headers, AGE_KEYWORDS);
  const scoreIndex = findHeaderIndex(headers, SCORE_KEYWORDS);
  const groupIndex = findHeaderIndex(headers, GROUP_KEYWORDS);
  const interviewExperienceIndex = findHeaderIndex(
    headers,
    INTERVIEW_EXPERIENCE_HEADER_KEYWORDS.map((keyword) => keyword.toLowerCase()),
  );

  if (nameIndex === -1 || phoneIndex === -1) {
    throw new Error("가져올 파일에 이름 또는 연락처 헤더가 없습니다.");
  }

  const rows = new Map<string, StudyGroupImportRow>();

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) {
      return;
    }

    const values = getCellValues(row);
    const name = String(values[nameIndex] ?? "").trim();
    const phone = normalizePhone(String(values[phoneIndex] ?? "").trim());

    if (!name || !phone) {
      return;
    }

    rows.set(phone, {
      name,
      phone,
      gender:
        genderIndex >= 0 ? String(values[genderIndex] ?? "").trim() || null : null,
      series:
        seriesIndex >= 0 ? String(values[seriesIndex] ?? "").trim() || null : null,
      region:
        regionIndex >= 0 ? String(values[regionIndex] ?? "").trim() || null : null,
      age: ageIndex >= 0 ? parseAge(values[ageIndex]) : null,
      score: scoreIndex >= 0 ? parseScore(values[scoreIndex]) : null,
      interviewExperience:
        interviewExperienceIndex >= 0
          ? parseInterviewExperience(values[interviewExperienceIndex])
          : null,
      groupNumber: groupIndex >= 0 ? parseGroupNumber(values[groupIndex]) : null,
    });
  });

  return Array.from(rows.values());
}
