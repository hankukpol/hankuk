export const EXAM_SCHEDULE_TYPES = [
  { value: "WRITTEN", label: "필기" },
  { value: "PHYSICAL", label: "체력" },
  { value: "INTERVIEW", label: "면접" },
  { value: "RESULT", label: "합격발표" },
  { value: "OTHER", label: "기타" },
] as const;

export type ExamScheduleTypeValue = (typeof EXAM_SCHEDULE_TYPES)[number]["value"];

export function getExamScheduleTypeLabel(type: ExamScheduleTypeValue): string {
  return EXAM_SCHEDULE_TYPES.find((t) => t.value === type)?.label ?? type;
}

/**
 * Returns the difference in days between examDateStr and today (KST).
 * Positive = future, 0 = today, negative = past.
 */
export function calcDDay(examDateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = examDateStr.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1, d));
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function formatDDay(days: number): string {
  if (days === 0) return "D-Day";
  if (days > 0) return `D-${days}`;
  return `D+${Math.abs(days)}`;
}
