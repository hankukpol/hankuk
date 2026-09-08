type SessionIdentityInput = {
  category: "MORNING" | "REGULAR";
  examDate: string;
  examRound?: number | null;
  morningSubjectId?: string | null;
};

/** Mirrors the SQL identity CHECK; regular rounds match the existing ExamScore key. */
export function buildExamSessionIdentity(input: SessionIdentityInput): string {
  const date = new Date(`${input.examDate}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.examDate) || !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== input.examDate) {
    throw new Error("시험일을 확인해 주세요.");
  }
  if (input.category === "REGULAR") {
    if (!Number.isSafeInteger(input.examRound) || (input.examRound ?? 0) < 1 || input.morningSubjectId != null) {
      throw new Error("정기 시험 회차를 확인해 주세요.");
    }
    return `regular:${input.examRound}`;
  }
  if (!input.morningSubjectId?.trim() || input.examRound != null) {
    throw new Error("아침 시험 과목을 확인해 주세요.");
  }
  return `morning:${input.morningSubjectId}:${input.examDate}`;
}
