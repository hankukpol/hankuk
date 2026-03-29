import { ExamType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type RawAnswerRow = {
  subjectId?: number;
  subjectName?: string;
  questionNumber?: number;
  questionNo?: number;
  answer?: number;
  correctAnswer?: number;
};

export type NormalizedAnswerRow = {
  subjectId: number;
  questionNumber: number;
  answer: number;
};

export interface SubjectMeta {
  id: number;
  name: string;
  questionCount: number;
  pointPerQuestion: number;
}

export function parseExamType(value: string | null): ExamType | null {
  if (value === ExamType.PUBLIC) return ExamType.PUBLIC;
  if (value === ExamType.CAREER) return ExamType.CAREER;
  return null;
}

export function parseBoolean(value: string | null, fallback = false): boolean {
  if (value === null) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

export function parsePositiveInt(value: string | number | null | undefined): number | null {
  if (typeof value === "number") {
    return Number.isInteger(value) && value > 0 ? value : null;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  return null;
}

export function buildAnswerKey(subjectId: number, questionNumber: number): string {
  return `${subjectId}:${questionNumber}`;
}

export async function getSubjectsByExamType(examType: ExamType): Promise<SubjectMeta[]> {
  return prisma.subject.findMany({
    where: { examType },
    select: {
      id: true,
      name: true,
      questionCount: true,
      pointPerQuestion: true,
    },
    orderBy: { id: "asc" },
  });
}

function parseAnswerNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isInteger(value) ? value : null;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    return Number.isInteger(parsed) ? parsed : null;
  }

  return null;
}

function normalizeSubjectName(name: string): string {
  return name.replace(/\s+/g, "").trim().toLowerCase();
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      const nextChar = line[index + 1];
      if (inQuotes && nextChar === '"') {
        current += '"';
        index += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

export function parseCsvRows(csvText: string): RawAnswerRow[] {
  const rawLines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (rawLines.length === 0) return [];

  const firstLineColumns = parseCsvLine(rawLines[0]).map((column) =>
    column.toLowerCase().replace(/\s+/g, "")
  );
  const looksLikeHeader = firstLineColumns.some((column) =>
    ["subject", "subjectname", "과목", "문항", "question", "answer", "정답"].includes(column)
  );

  const dataLines = looksLikeHeader ? rawLines.slice(1) : rawLines;

  return dataLines.map((line) => {
    const [subjectName, questionNumber, answer] = parseCsvLine(line);
    return {
      subjectName,
      questionNumber: Number(questionNumber),
      answer: Number(answer),
    };
  });
}

export function normalizeAnswerRows(
  rows: RawAnswerRow[],
  subjects: SubjectMeta[]
): { data?: NormalizedAnswerRow[]; error?: string } {
  if (rows.length === 0) {
    return { error: "정답 데이터가 비어 있습니다." };
  }

  const subjectById = new Map<number, SubjectMeta>();
  const subjectByName = new Map<string, SubjectMeta>();

  for (const subject of subjects) {
    subjectById.set(subject.id, subject);
    subjectByName.set(normalizeSubjectName(subject.name), subject);
  }

  const normalizedRows: NormalizedAnswerRow[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const parsedSubjectId = parsePositiveInt(row.subjectId);
    const parsedQuestionNumber = parsePositiveInt(row.questionNumber ?? row.questionNo);
    const parsedAnswer = parseAnswerNumber(row.answer ?? row.correctAnswer);

    let subject: SubjectMeta | undefined;

    if (parsedSubjectId) {
      subject = subjectById.get(parsedSubjectId);
    } else if (typeof row.subjectName === "string" && row.subjectName.trim()) {
      subject = subjectByName.get(normalizeSubjectName(row.subjectName));
    }

    if (!subject) {
      return { error: "정답 데이터에 유효하지 않은 과목이 포함되어 있습니다." };
    }

    if (!parsedQuestionNumber || parsedQuestionNumber > subject.questionCount) {
      return {
        error: `${subject.name} 과목 문항 번호가 올바르지 않습니다. (입력값: ${row.questionNumber ?? row.questionNo})`,
      };
    }

    if (!parsedAnswer || parsedAnswer < 1 || parsedAnswer > 4) {
      return {
        error: `${subject.name} ${parsedQuestionNumber}번 문항 정답은 1~4 사이 값이어야 합니다.`,
      };
    }

    const key = buildAnswerKey(subject.id, parsedQuestionNumber);
    if (seen.has(key)) {
      return {
        error: `${subject.name} ${parsedQuestionNumber}번 문항이 중복 입력되었습니다.`,
      };
    }

    seen.add(key);
    normalizedRows.push({
      subjectId: subject.id,
      questionNumber: parsedQuestionNumber,
      answer: parsedAnswer,
    });
  }

  const expectedCount = subjects.reduce((sum, subject) => sum + subject.questionCount, 0);
  if (normalizedRows.length !== expectedCount) {
    return {
      error: `정답 문항 수가 올바르지 않습니다. (${normalizedRows.length}/${expectedCount})`,
    };
  }

  return { data: normalizedRows };
}
