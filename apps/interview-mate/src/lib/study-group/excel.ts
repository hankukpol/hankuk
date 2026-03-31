import ExcelJS from "exceljs";

import {
  INTERVIEW_EXPERIENCE_HEADER_KEYWORDS,
  formatInterviewExperience,
  parseInterviewExperience,
} from "@/lib/interview-experience";

import { Member, StudyGroup } from "./types";

export interface ParseResult {
  members: Member[];
  restoredGroups?: StudyGroup[];
}

const NAME_KEYWORDS = ["이름", "성명", "name"];
const PHONE_KEYWORDS = ["연락처", "전화번호", "핸드폰", "휴대폰", "phone", "전화"];
const GENDER_KEYWORDS = ["성별", "gender"];
const SERIES_KEYWORDS = ["직렬", "분야", "series", "직무"];
const REGION_KEYWORDS = ["지역", "시도", "region", "거주지"];
const SCORE_KEYWORDS = ["성적", "점수", "필기성적", "필기점수", "score"];
const GROUP_KEYWORDS = ["조", "편성조", "group", "스터디조"];
const AGE_KEYWORDS = ["나이", "연령", "age", "학년", "출생년도"];
const GROUP_HEADER = "조";

export async function parseExcel(file: File): Promise<ParseResult> {
  if (file.name.toLowerCase().endsWith(".csv")) {
    return parseTextInput(await file.text());
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error("업로드한 파일에서 시트를 찾을 수 없습니다.");
  }

  const headers: string[] = [];
  worksheet.getRow(1).eachCell((_, colNumber) => {
    headers[colNumber] = getCellValue(worksheet.getRow(1), colNumber);
  });

  const nameCol = findColumn(headers, NAME_KEYWORDS);
  const phoneCol = findColumn(headers, PHONE_KEYWORDS);
  const genderCol = findColumn(headers, GENDER_KEYWORDS);
  const seriesCol = findColumn(headers, SERIES_KEYWORDS);
  const regionCol = findColumn(headers, REGION_KEYWORDS);
  const scoreCol = findColumn(headers, SCORE_KEYWORDS);
  const groupCol = findColumn(headers, GROUP_KEYWORDS);
  const ageCol = findColumn(headers, AGE_KEYWORDS);
  const interviewExperienceCol = findColumn(
    headers,
    INTERVIEW_EXPERIENCE_HEADER_KEYWORDS,
  );

  if (nameCol === null) {
    throw new Error("이름 열을 찾을 수 없습니다.");
  }

  const isRestoreMode = detectRestoreMode(worksheet, headers, groupCol);
  const members: Member[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      return;
    }

    const name = getCellValue(row, nameCol);
    if (!name) {
      return;
    }

    members.push({
      id: `member-${rowNumber}`,
      name,
      phone: phoneCol ? getCellValue(row, phoneCol) : "",
      gender: parseGender(genderCol ? getCellValue(row, genderCol) : ""),
      series: seriesCol ? getCellValue(row, seriesCol) : "",
      region: regionCol ? getCellValue(row, regionCol) : "",
      age: parseAge(ageCol ? getCellValue(row, ageCol) : ""),
      score: parseScore(scoreCol ? getCellValue(row, scoreCol) : ""),
      interviewExperience:
        interviewExperienceCol !== null
          ? parseInterviewExperience(getCellValue(row, interviewExperienceCol))
          : undefined,
      preAssignedGroup: parseGroupNumber(groupCol ? getCellValue(row, groupCol) : ""),
    });
  });

  return isRestoreMode
    ? { members, restoredGroups: buildRestoredGroups(members) }
    : { members };
}

export function parseTextInput(text: string): ParseResult {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return { members: [] };
  }

  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const headerCells = lines[0].split(delimiter).map((header) => header.trim());

  const nameIdx = findIndex(headerCells, NAME_KEYWORDS);
  const phoneIdx = findIndex(headerCells, PHONE_KEYWORDS);
  const genderIdx = findIndex(headerCells, GENDER_KEYWORDS);
  const seriesIdx = findIndex(headerCells, SERIES_KEYWORDS);
  const regionIdx = findIndex(headerCells, REGION_KEYWORDS);
  const scoreIdx = findIndex(headerCells, SCORE_KEYWORDS);
  const groupIdx = findIndex(headerCells, GROUP_KEYWORDS);
  const ageIdx = findIndex(headerCells, AGE_KEYWORDS);
  const interviewExperienceIdx = findIndex(
    headerCells,
    INTERVIEW_EXPERIENCE_HEADER_KEYWORDS,
  );

  if (nameIdx === -1) {
    throw new Error("이름 열을 찾을 수 없습니다.");
  }

  const isRestoreMode = detectRestoreModeText(lines, delimiter, groupIdx);
  const members: Member[] = [];

  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const cells = lines[lineIndex].split(delimiter).map((cell) => cell.trim());
    const name = cells[nameIdx] || "";
    if (!name) {
      continue;
    }

    members.push({
      id: `member-${lineIndex + 1}`,
      name,
      phone: phoneIdx >= 0 ? cells[phoneIdx] || "" : "",
      gender: parseGender(genderIdx >= 0 ? cells[genderIdx] || "" : ""),
      series: seriesIdx >= 0 ? cells[seriesIdx] || "" : "",
      region: regionIdx >= 0 ? cells[regionIdx] || "" : "",
      age: parseAge(ageIdx >= 0 ? cells[ageIdx] || "" : ""),
      score: parseScore(scoreIdx >= 0 ? cells[scoreIdx] || "" : ""),
      interviewExperience:
        interviewExperienceIdx >= 0
          ? parseInterviewExperience(cells[interviewExperienceIdx] || "")
          : undefined,
      preAssignedGroup: parseGroupNumber(groupIdx >= 0 ? cells[groupIdx] || "" : ""),
    });
  }

  return isRestoreMode
    ? { members, restoredGroups: buildRestoredGroups(members) }
    : { members };
}

export function downloadCsvTemplate(): void {
  const header =
    "이름,연락처,성별,직렬,지역,면접 경험 여부,나이,필기성적,조";
  const example =
    "홍길동,010-1234-5678,남,일반,서울,있음,28,85.5,";
  const content = `\uFEFF${header}\n${example}\n`;

  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "면접-스터디-명단-양식.csv";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function createSheetColumns(
  hasAges: boolean,
  hasScores: boolean,
  hasInterviewExperience: boolean,
  includeIndex: boolean,
): ExcelJS.Column[] {
  const columns: ExcelJS.Column[] = [];

  if (includeIndex) {
    columns.push({ header: "번호", key: "no", width: 8 } as ExcelJS.Column);
  }

  columns.push(
    { header: "조", key: "group", width: 8 } as ExcelJS.Column,
    { header: "이름", key: "name", width: 15 } as ExcelJS.Column,
    { header: "연락처", key: "phone", width: 18 } as ExcelJS.Column,
    { header: "성별", key: "gender", width: 8 } as ExcelJS.Column,
    { header: "직렬", key: "series", width: 15 } as ExcelJS.Column,
    { header: "지역", key: "region", width: 12 } as ExcelJS.Column,
  );

  if (hasInterviewExperience) {
    columns.push({
      header: "면접 경험 여부",
      key: "interviewExperience",
      width: 14,
    } as ExcelJS.Column);
  }

  if (hasAges) {
    columns.push({ header: "나이", key: "age", width: 8 } as ExcelJS.Column);
  }

  if (hasScores) {
    columns.push({ header: "필기성적", key: "score", width: 12 } as ExcelJS.Column);
  }

  return columns;
}

export async function exportGroupsToExcel(
  groups: StudyGroup[],
  examLabel: string,
): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = examLabel;

  const hasScores = groups.some((group) =>
    group.members.some((member) => member.score !== undefined),
  );
  const hasAges = groups.some((group) =>
    group.members.some((member) => member.age !== undefined),
  );
  const hasInterviewExperience = groups.some((group) =>
    group.members.some((member) => member.interviewExperience !== undefined),
  );

  const summarySheet = workbook.addWorksheet(`${examLabel} 전체 요약`);
  summarySheet.columns = createSheetColumns(
    hasAges,
    hasScores,
    hasInterviewExperience,
    false,
  );
  applyHeaderStyle(summarySheet);

  for (const group of groups) {
    for (const member of group.members) {
      summarySheet.addRow({
        group: `${group.groupNumber}조`,
        name: member.name,
        phone: member.phone,
        gender: member.gender === "male" ? "남" : "여",
        series: member.series,
        region: member.region,
        interviewExperience: hasInterviewExperience
          ? formatInterviewExperience(member.interviewExperience)
          : undefined,
        age: hasAges ? member.age ?? "" : undefined,
        score: hasScores ? member.score ?? "" : undefined,
      });
    }
  }

  for (const group of groups) {
    const groupSheet = workbook.addWorksheet(`${group.groupNumber}조`);
    groupSheet.columns = createSheetColumns(
      hasAges,
      hasScores,
      hasInterviewExperience,
      true,
    );
    applyHeaderStyle(groupSheet);

    group.members.forEach((member, index) => {
      groupSheet.addRow({
        no: index + 1,
        group: `${group.groupNumber}조`,
        name: member.name,
        phone: member.phone,
        gender: member.gender === "male" ? "남" : "여",
        series: member.series,
        region: member.region,
        interviewExperience: hasInterviewExperience
          ? formatInterviewExperience(member.interviewExperience)
          : undefined,
        age: hasAges ? member.age ?? "" : undefined,
        score: hasScores ? member.score ?? "" : undefined,
      });
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function detectRestoreMode(
  worksheet: ExcelJS.Worksheet,
  headers: string[],
  groupCol: number | null,
): boolean {
  if (groupCol === null) {
    return false;
  }

  if ((headers[groupCol] || "").trim() !== GROUP_HEADER) {
    return false;
  }

  return /^\d+조$/.test(getCellValue(worksheet.getRow(2), groupCol));
}

function detectRestoreModeText(
  lines: string[],
  delimiter: string,
  groupIdx: number,
): boolean {
  if (groupIdx < 0 || lines.length < 2) {
    return false;
  }

  const headerCells = lines[0].split(delimiter).map((cell) => cell.trim());
  if (headerCells[groupIdx] !== GROUP_HEADER) {
    return false;
  }

  const firstDataCells = lines[1].split(delimiter).map((cell) => cell.trim());
  return /^\d+조$/.test(firstDataCells[groupIdx] || "");
}

function buildRestoredGroups(members: Member[]): StudyGroup[] {
  const groupMap = new Map<number, Member[]>();

  for (const member of members) {
    if (member.preAssignedGroup === undefined) {
      continue;
    }

    const list = groupMap.get(member.preAssignedGroup) || [];
    list.push(member);
    groupMap.set(member.preAssignedGroup, list);
  }

  return Array.from(groupMap.keys())
    .sort((a, b) => a - b)
    .map((groupNumber) => ({
      groupNumber,
      members: groupMap.get(groupNumber) || [],
    }));
}

function findColumn(headers: string[], keywords: string[]): number | null {
  for (let index = 1; index < headers.length; index += 1) {
    const header = (headers[index] || "").toLowerCase();
    if (keywords.some((keyword) => header === keyword.toLowerCase())) {
      return index;
    }
  }

  for (let index = 1; index < headers.length; index += 1) {
    const header = (headers[index] || "").toLowerCase();
    if (
      keywords.some((keyword) => keyword.length >= 2 && header.includes(keyword.toLowerCase()))
    ) {
      return index;
    }
  }

  return null;
}

function findIndex(headers: string[], keywords: string[]): number {
  for (let index = 0; index < headers.length; index += 1) {
    const header = (headers[index] || "").toLowerCase();
    if (keywords.some((keyword) => header === keyword.toLowerCase())) {
      return index;
    }
  }

  for (let index = 0; index < headers.length; index += 1) {
    const header = (headers[index] || "").toLowerCase();
    if (
      keywords.some((keyword) => keyword.length >= 2 && header.includes(keyword.toLowerCase()))
    ) {
      return index;
    }
  }

  return -1;
}

function getCellValue(row: ExcelJS.Row, col: number): string {
  const cell = row.getCell(col);
  const value = cell.value;

  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") {
      return value.text.trim();
    }
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("").trim();
    }
  }

  return String(value).trim();
}

function parseGender(value: string): "male" | "female" {
  const normalized = value.replace(/\s+/g, "").toLowerCase();
  if (["여", "여자", "여성", "female", "f"].includes(normalized)) {
    return "female";
  }
  return "male";
}

function parseScore(value: string): number | undefined {
  if (!value.trim()) {
    return undefined;
  }

  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function parseAge(value: string): number | undefined {
  if (!value.trim()) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return undefined;
  }

  const currentYear = new Date().getFullYear();
  if (parsed >= 1950 && parsed <= currentYear) {
    return currentYear - parsed;
  }

  return parsed > 0 ? parsed : undefined;
}

function parseGroupNumber(value: string): number | undefined {
  const normalized = value.replace(/\s+/g, "").replace(/조$/, "");
  if (!normalized) {
    return undefined;
  }

  const parsed = Number.parseInt(normalized, 10);
  return Number.isNaN(parsed) || parsed < 1 ? undefined : parsed;
}

function applyHeaderStyle(worksheet: ExcelJS.Worksheet): void {
  worksheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF4472C4" },
  };
  worksheet.getRow(1).font = {
    bold: true,
    color: { argb: "FFFFFFFF" },
  };
}
