import { examScoresBatchSchema } from "./exam-schemas";
import { getLegacyExamDateKey } from "./exam-session-identity";

export function isExamDate(value: string): boolean {
  try { getLegacyExamDateKey(value); return true; } catch { return false; }
}

export const examScoresSaveSchema = examScoresBatchSchema.extend({
  examRound: examScoresBatchSchema.shape.examRound.optional(),
}).superRefine((input, context) => {
  if (input.examDate != null && !isExamDate(input.examDate)) {
    context.addIssue({ code: "custom", path: ["examDate"], message: "시험일을 확인해 주세요." });
  }
  if (input.examRound === undefined && !input.examDate) {
    context.addIssue({ code: "custom", path: ["examDate"], message: "시험일을 선택해 주세요." });
  }
});

/** Date-backed rows win over legacy duplicates; otherwise keep the largest legacy key. */
export function selectExamDateRecords<T extends { studentId: string; examRound: number }>(records: T[], examDate: string): Map<string, T> {
  const key = getLegacyExamDateKey(examDate);
  const sorted = [...records].sort((a, b) => Number(b.examRound === key) - Number(a.examRound === key) || b.examRound - a.examRound);
  const selected = new Map<string, T>();
  for (const row of sorted) if (!selected.has(row.studentId)) selected.set(row.studentId, row);
  return selected;
}
