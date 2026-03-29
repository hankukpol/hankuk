import { AttendType, ScoreSource } from "@prisma/client";

export const DUPLICATE_RESOLVED_STUDENT_MESSAGE =
  "같은 학생에게 여러 행이 매핑되었습니다. 중복 행을 정리한 뒤 다시 업로드해 주세요.";

export type ScoreWriteRecord = {
  academyId?: number | null;
  examNumber: string;
  sessionId: number;
  rawScore: number | null;
  oxScore: number | null;
  finalScore: number | null;
  attendType: AttendType;
  sourceType: ScoreSource;
  note: string | null;
};

export type StudentAnswerWriteRecord = {
  examNumber: string;
  questionId: number;
  answer: string;
  isCorrect: boolean;
};

type PreviewRowLike = {
  status: "ready" | "overwrite" | "resolve" | "invalid";
  matchedStudent: { examNumber: string } | null;
  issues: string[];
};

function findDuplicateKeys(keys: readonly string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const key of keys) {
    if (seen.has(key)) {
      duplicates.add(key);
      continue;
    }

    seen.add(key);
  }

  return duplicates;
}

export function dedupeByKey<T>(items: readonly T[], getKey: (item: T) => string) {
  const deduped = new Map<string, T>();

  for (const item of items) {
    deduped.set(getKey(item), item);
  }

  return Array.from(deduped.values());
}

export function dedupeScoreWriteRecords(rows: readonly ScoreWriteRecord[]) {
  return dedupeByKey(rows, (row) => `${row.examNumber}:${row.sessionId}`);
}

export function dedupeStudentAnswerWriteRecords(rows: readonly StudentAnswerWriteRecord[]) {
  return dedupeByKey(rows, (row) => `${row.examNumber}:${row.questionId}`);
}

export function applyDuplicateResolvedStudentIssues<T extends PreviewRowLike>(rows: readonly T[]) {
  const duplicateExamNumbers = findDuplicateKeys(
    rows.flatMap((row) =>
      (row.status === "ready" || row.status === "overwrite") && row.matchedStudent
        ? [row.matchedStudent.examNumber]
        : [],
    ),
  );

  if (duplicateExamNumbers.size === 0) {
    return rows.slice();
  }

  return rows.map((row) => {
    const examNumber = row.matchedStudent?.examNumber;

    if (
      !examNumber ||
      !duplicateExamNumbers.has(examNumber) ||
      (row.status !== "ready" && row.status !== "overwrite")
    ) {
      return row;
    }

    const issues = row.issues.includes(DUPLICATE_RESOLVED_STUDENT_MESSAGE)
      ? row.issues
      : [...row.issues, DUPLICATE_RESOLVED_STUDENT_MESSAGE];

    return {
      ...row,
      status: "invalid",
      issues,
    } as T;
  });
}


