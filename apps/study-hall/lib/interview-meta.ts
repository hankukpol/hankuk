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
      return "border-warn-1-line bg-warn-1-soft text-warn-1";
    case "WARNING_2":
      return "border-warn-2-line bg-warn-2-soft text-warn-2";
    case "WITHDRAWAL":
      return "border-warn-withdraw-line bg-warn-withdraw-soft text-warn-withdraw";
    case "INTERVIEW":
      return "border-warn-interview-line bg-warn-interview-soft text-warn-interview";
    default:
      return "border-admin-line bg-admin-surface-muted text-admin-text-secondary";
  }
}

export const INTERVIEW_STATUS_VALUES = ["OPEN", "CLOSED"] as const;

export type InterviewStatusValue = (typeof INTERVIEW_STATUS_VALUES)[number];

export const INTERVIEW_STATUS_OPTIONS = [
  { value: "OPEN", label: "진행 중" },
  { value: "CLOSED", label: "종결" },
] as const satisfies ReadonlyArray<{ value: InterviewStatusValue; label: string }>;

export function getInterviewStatusLabel(value: string | null | undefined) {
  return INTERVIEW_STATUS_OPTIONS.find((option) => option.value === value)?.label ?? "진행 중";
}

export function getInterviewStatusClasses(value: string | null | undefined) {
  return value === "CLOSED"
    ? "border-slate-200 bg-slate-100 text-slate-600"
    : "border-admin-success-line bg-admin-success-soft text-admin-success";
}

/**
 * 후속 확인이 오늘까지 도래했는지. 예정일이 없으면 대기 목록에 넣지 않는다.
 * 날짜는 모두 KST 기준 YYYY-MM-DD 문자열이라 문자열 비교로 충분하다.
 */
export function isFollowUpDue(
  interview: { status: string; followUpDate: string | null },
  today: string,
) {
  return interview.status === "OPEN" && !!interview.followUpDate && interview.followUpDate <= today;
}
