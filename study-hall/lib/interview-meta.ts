export const INTERVIEW_RESULT_TYPE_VALUES = [
  "WARNING_1",
  "WARNING_2",
  "INTERVIEW",
  "WITHDRAWAL",
] as const;

export type InterviewResultTypeValue = (typeof INTERVIEW_RESULT_TYPE_VALUES)[number];

export const INTERVIEW_RESULT_TYPE_OPTIONS = [
  { value: "WARNING_1", label: "1차 경고" },
  { value: "WARNING_2", label: "2차 경고" },
  { value: "INTERVIEW", label: "면담" },
  { value: "WITHDRAWAL", label: "퇴실 논의" },
] as const satisfies ReadonlyArray<{ value: InterviewResultTypeValue; label: string }>;

export function getInterviewResultTypeLabel(value: string | null | undefined) {
  return INTERVIEW_RESULT_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? "미정";
}

export function getInterviewResultTypeClasses(value: string | null | undefined) {
  switch (value) {
    case "WARNING_1":
      return "border-yellow-200 bg-yellow-50 text-yellow-700";
    case "WARNING_2":
      return "border-orange-200 bg-orange-50 text-orange-700";
    case "WITHDRAWAL":
      return "border-rose-200 bg-rose-50 text-rose-700";
    default:
      return "border-sky-200 bg-sky-50 text-sky-700";
  }
}
