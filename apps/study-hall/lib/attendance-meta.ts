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
