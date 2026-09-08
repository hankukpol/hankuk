type SessionIdentityInput = {
  category: "MORNING" | "REGULAR";
  examDate: string;
  primarySubjectId?: string | null;
};

/** Mirrors the SQL identity CHECK, including null-safe regular-date uniqueness. */
export function buildExamSessionIdentity(input: SessionIdentityInput): string {
  const date = new Date(`${input.examDate}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.examDate) || !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== input.examDate) {
    throw new Error("시험일을 확인해 주세요.");
  }
  if (input.category === "REGULAR") {
    if (input.primarySubjectId != null) {
      throw new Error("정기 시험 정보를 확인해 주세요.");
    }
    return `regular:${input.examDate}`;
  }
  if (!input.primarySubjectId?.trim()) {
    throw new Error("아침 시험 과목을 확인해 주세요.");
  }
  return `morning:${input.primarySubjectId}:${input.examDate}`;
}

/** Compatibility key for the existing required integer column, never a user-facing round. */
export function getLegacyExamDateKey(examDate: string): number {
  buildExamSessionIdentity({ category: "REGULAR", examDate });
  return Number(examDate.replace(/-/g, ""));
}
