import { AttendType, ParseMatchStatus } from "@prisma/client";

export interface KakaoParseStudent {
  examNumber: string;
  name: string;
  generation: number | null;
}

export interface ParsedAttendanceEntry {
  rawName: string;
  rawGeneration: number | null;
  attendType: AttendType;
  checkInTime: string | null;
  matchStatus: ParseMatchStatus;
  examNumber: string | null;
  matchedStudents: KakaoParseStudent[]; // ambiguous case
}

export interface KakaoParseResult {
  parsedDate: Date | null;
  entries: ParsedAttendanceEntry[];
}

// 출석 키워드
const PRESENT_KEYWORDS = [
  "동원했습니다",
  "동원",
  "출석합니다",
  "출석했습니다",
  "왔습니다",
  "자리했습니다",
  "착석했습니다",
  "공부시작",
  "시작합니다",
];

// 결석 키워드
const ABSENT_KEYWORDS = [
  "결석합니다",
  "못가겠습니다",
  "결석",
  "빠지겠습니다",
];

// 날짜 패턴: "2026년 3월 13일 금요일"
const DATE_RE = /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/;

// 이름 패턴: "52기 윤정원" 또는 "윤정원"
const NAME_RE = /^(\d+기\s+)?(.{2,6})$/;

// 시간 패턴: "오전 5:51" / "오후 2:30"
const TIME_RE = /(오전|오후)\s*(\d{1,2}):(\d{2})/;

function parseKakaoTime(line: string): string | null {
  const m = TIME_RE.exec(line);
  if (!m) return null;
  let hour = parseInt(m[2], 10);
  const min = m[3];
  if (m[1] === "오후" && hour < 12) hour += 12;
  if (m[1] === "오전" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${min}`;
}

function isTimeOnly(line: string): boolean {
  return /^(오전|오후)\s*\d{1,2}:\d{2}$/.test(line.trim());
}

function detectAttendType(line: string): AttendType | null {
  const normalized = line.trim();
  if (PRESENT_KEYWORDS.some((k) => normalized.includes(k))) return AttendType.NORMAL;
  if (ABSENT_KEYWORDS.some((k) => normalized.includes(k))) return AttendType.ABSENT;
  return null;
}

/**
 * 카카오톡 채팅방 내보내기 텍스트를 파싱하여 출석 엔트리 목록으로 변환.
 * 학생 명단과 대조하여 MATCHED / UNMATCHED / AMBIGUOUS 로 분류.
 */
export function parseKakaoAttendanceText(
  rawText: string,
  students: KakaoParseStudent[],
): KakaoParseResult {
  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  let parsedDate: Date | null = null;
  const entries: ParsedAttendanceEntry[] = [];

  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 날짜 헤더
    const dateMatch = DATE_RE.exec(line);
    if (dateMatch && !parsedDate) {
      parsedDate = new Date(
        parseInt(dateMatch[1], 10),
        parseInt(dateMatch[2], 10) - 1,
        parseInt(dateMatch[3], 10),
      );
      i++;
      continue;
    }

    // 이름 줄 확인
    const nameMatch = NAME_RE.exec(line);
    if (nameMatch) {
      const rawGenStr = nameMatch[1]?.trim() ?? null;
      const rawGen = rawGenStr ? parseInt(rawGenStr.replace("기", "").trim(), 10) : null;
      const rawNameOnly = nameMatch[2].trim();
      const fullRawName = line.trim();

      // 다음 줄에서 출석 키워드 탐색 (최대 3줄)
      let attendType: AttendType | null = null;
      let checkInTime: string | null = null;
      let j = i + 1;

      while (j < lines.length && j <= i + 4) {
        const nextLine = lines[j];

        if (!attendType) {
          attendType = detectAttendType(nextLine);
        }
        if (!checkInTime && isTimeOnly(nextLine)) {
          checkInTime = parseKakaoTime(nextLine);
        }

        // 다음 이름 줄이면 탈출
        if (j > i + 1 && NAME_RE.test(nextLine) && !isTimeOnly(nextLine)) break;

        j++;
      }

      if (attendType !== null) {
        // 학생 매칭
        const matched = students.filter((s) => {
          const nameMatch2 = s.name === rawNameOnly;
          const genMatch = rawGen === null || s.generation === null || s.generation === rawGen;
          return nameMatch2 && genMatch;
        });

        let matchStatus: ParseMatchStatus;
        let examNumber: string | null = null;
        let matchedStudentsList: KakaoParseStudent[] = [];

        if (matched.length === 1) {
          matchStatus = ParseMatchStatus.MATCHED;
          examNumber = matched[0].examNumber;
        } else if (matched.length > 1) {
          matchStatus = ParseMatchStatus.AMBIGUOUS;
          matchedStudentsList = matched;
        } else {
          matchStatus = ParseMatchStatus.UNMATCHED;
        }

        entries.push({
          rawName: fullRawName,
          rawGeneration: rawGen,
          attendType,
          checkInTime,
          matchStatus,
          examNumber,
          matchedStudents: matchedStudentsList,
        });

        i = j;
        continue;
      }
    }

    i++;
  }

  return { parsedDate, entries };
}
