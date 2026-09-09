export const ATTENDANCE_STATUS_OPTIONS = [
  { value: "", label: "미처리" },
  { value: "PRESENT", label: "출석" },
  { value: "TARDY", label: "지각" },
  { value: "ABSENT", label: "결석" },
  { value: "EXCUSED", label: "사유결석" },
  { value: "HOLIDAY", label: "휴무" },
  { value: "HALF_HOLIDAY", label: "반휴" },
  { value: "NOT_APPLICABLE", label: "해당없음" },
] as const;

export type AttendanceOptionValue = (typeof ATTENDANCE_STATUS_OPTIONS)[number]["value"];

/**
 * 출석률 계산에서 "출석"으로 인정하는 상태.
 * 사유결석(EXCUSED)은 수업·체력 등 관리자가 승인한 인정 사유이므로 출석으로 집계한다.
 * 출석률을 계산하는 모든 지점은 이 목록을 기준으로 삼는다.
 */
export const ATTENDED_ATTENDANCE_STATUSES = [
  "PRESENT",
  "TARDY",
  "EXCUSED",
  "HOLIDAY",
  "HALF_HOLIDAY",
] as const;

const ATTENDED_ATTENDANCE_STATUS_SET: ReadonlySet<string> = new Set(ATTENDED_ATTENDANCE_STATUSES);

export function isAttendedAttendanceStatus(status: string | null | undefined) {
  return status ? ATTENDED_ATTENDANCE_STATUS_SET.has(status) : false;
}

export function getAttendanceStatusLabel(status: string | null | undefined) {
  return ATTENDANCE_STATUS_OPTIONS.find((item) => item.value === (status ?? ""))?.label ?? "미처리";
}

export function getAttendanceStatusClasses(status: string | null | undefined) {
  switch (status) {
    case "PRESENT":
      return "border-slate-200 bg-white text-emerald-600 font-medium";
    case "TARDY":
      return "border-slate-200 bg-white text-amber-600 font-medium";
    case "ABSENT":
      return "border-slate-200 bg-white text-rose-600 font-medium";
    case "EXCUSED":
      return "border-slate-200 bg-white text-blue-600 font-medium";
    case "HOLIDAY":
    case "HALF_HOLIDAY":
    case "NOT_APPLICABLE":
      return "border-slate-200 bg-slate-50 text-slate-500 font-medium";
    default:
      return "border-indigo-200 bg-indigo-50 text-indigo-400";
  }
}
