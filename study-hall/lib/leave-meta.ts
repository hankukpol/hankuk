export const LEAVE_TYPE_VALUES = ["HOLIDAY", "HALF_DAY", "HEALTH", "OUTING"] as const;
export const LEAVE_STATUS_VALUES = ["PENDING", "APPROVED", "REJECTED", "USED"] as const;

export type LeaveTypeValue = (typeof LEAVE_TYPE_VALUES)[number];
export type LeaveStatusValue = (typeof LEAVE_STATUS_VALUES)[number];

export const LEAVE_TYPE_OPTIONS = [
  { value: "HOLIDAY", label: "휴가" },
  { value: "HALF_DAY", label: "반차" },
  { value: "HEALTH", label: "병가" },
  { value: "OUTING", label: "외출" },
] as const satisfies ReadonlyArray<{ value: LeaveTypeValue; label: string }>;

export const LEAVE_STATUS_OPTIONS = [
  { value: "PENDING", label: "대기" },
  { value: "APPROVED", label: "승인" },
  { value: "REJECTED", label: "반려" },
  { value: "USED", label: "사용 완료" },
] as const satisfies ReadonlyArray<{ value: LeaveStatusValue; label: string }>;

export function getLeaveTypeLabel(type: string | null | undefined) {
  return LEAVE_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? "미정";
}

export function getLeaveStatusLabel(status: string | null | undefined) {
  return LEAVE_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? "미정";
}

export function getLeaveStatusClasses(status: string | null | undefined) {
  switch (status) {
    case "APPROVED":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "USED":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "REJECTED":
      return "border-rose-200 bg-rose-50 text-rose-700";
    default:
      return "border-amber-200 bg-amber-50 text-amber-700";
  }
}
