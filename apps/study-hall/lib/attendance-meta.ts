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

// 수업은 기존 인정 출석(EXCUSED)과 사유로 저장한다. UI 전용 값을 API에 보내지 않는다.
export const ATTENDANCE_INPUT_OPTIONS = [
  ...ATTENDANCE_STATUS_OPTIONS.slice(0, 2),
  { value: "CLASS", label: "수업" },
  ...ATTENDANCE_STATUS_OPTIONS.slice(2),
] as const;

export type AttendanceInputValue = AttendanceOptionValue | "CLASS";
const CLASS_REASON = "수업";

export function isClassAttendance(status: string | null | undefined, reason?: string | null) {
  const value = reason?.trim() ?? "";
  return status === "EXCUSED" && (value === CLASS_REASON || value.startsWith(`${CLASS_REASON}:`));
}

export function getAttendanceInputValue(status: AttendanceOptionValue, reason?: string | null): AttendanceInputValue {
  return isClassAttendance(status, reason) ? "CLASS" : status;
}

export function getAttendanceReasonDetail(status: string | null | undefined, reason?: string | null) {
  return isClassAttendance(status, reason)
    ? (reason?.trimStart().slice(CLASS_REASON.length).replace(/^: ?/, "") ?? "")
    : reason ?? "";
}

export function setAttendanceReasonDetail(status: string | null | undefined, reason: string | null | undefined, detail: string) {
  return isClassAttendance(status, reason)
    ? `${CLASS_REASON}${detail.trim() ? `: ${detail}` : ""}`
    : detail;
}

export function buildAttendanceInput(
  value: AttendanceInputValue,
  current: { status: AttendanceOptionValue; reason: string } = { status: "", reason: "" },
): { status: AttendanceOptionValue; reason: string } {
  if (value === "CLASS") {
    return { status: "EXCUSED", reason: isClassAttendance(current.status, current.reason) ? current.reason : CLASS_REASON };
  }
  return {
    status: value,
    reason: value === "ABSENT" || value === "EXCUSED"
      ? (isClassAttendance(current.status, current.reason) ? "" : current.reason)
      : "",
  };
}

/**
 * 출석률 계산에서 "출석"으로 인정하는 상태.
 * 사유 확인 없이 출석으로 인정할 수 있는 상태.
 * 수업은 EXCUSED + 수업 사유로 저장되므로 아래 판별 함수에 사유도 전달한다.
 */
export const ATTENDED_ATTENDANCE_STATUSES = [
  "PRESENT",
  "TARDY",
  "HOLIDAY",
  "HALF_HOLIDAY",
] as const;

const ATTENDED_ATTENDANCE_STATUS_SET: ReadonlySet<string> = new Set(ATTENDED_ATTENDANCE_STATUSES);

export function isAttendedAttendanceStatus(status: string | null | undefined, reason?: string | null) {
  return isClassAttendance(status, reason) || (status ? ATTENDED_ATTENDANCE_STATUS_SET.has(status) : false);
}

/** 일반 사유결석은 출석·결석 어느 쪽에도 포함하지 않고 출석률 분모에서도 제외한다. */
export function isAttendanceRateExcluded(status: string | null | undefined, reason?: string | null) {
  return status === "NOT_APPLICABLE" || (status === "EXCUSED" && !isClassAttendance(status, reason));
}

/** 저장값을 바꾸지 않고 집계할 때만 수업을 출석 항목으로 분류한다. */
export function getAttendanceCountStatus<T extends string>(status: T, reason?: string | null): T | "PRESENT" {
  return isClassAttendance(status, reason) ? "PRESENT" : status;
}

export function getAttendanceStatusLabel(status: string | null | undefined, reason?: string | null) {
  if (isClassAttendance(status, reason)) return "수업";
  return ATTENDANCE_STATUS_OPTIONS.find((item) => item.value === (status ?? ""))?.label ?? "미처리";
}

export function getAttendanceStatusClasses(status: string | null | undefined, reason?: string | null) {
  if (status === "CLASS" || isClassAttendance(status, reason)) {
    return "border-[var(--admin-attendance-class-line)] bg-[var(--admin-attendance-class-soft)] text-[var(--admin-attendance-class)] font-medium";
  }
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

/**
 * 지금 체크할 교시를 고른다.
 *
 * `getCurrentPeriod` 는 "지금 진행 중인 교시" 라서 쉬는 시간에는 아무것도 돌려주지
 * 않는다. 그때 목록의 첫 교시로 떨어지면, 오후 1시에 출석부를 연 조교에게 1교시가
 * 선택돼 있다 — 이미 끝난 교시다.
 *
 * 아직 끝나지 않은 첫 교시를 고른다. 교시 중이면 그 교시고, 쉬는 시간이면 곧 시작할
 * 교시다. 하루가 다 끝났으면 마지막 교시를 둔다 — 그날 마무리를 하려는 참이다.
 */
export function selectPeriodForCheck<T extends { id: string; startTime: string; endTime: string; isActive?: boolean }>(
  periods: readonly T[],
  nowMinutes: number,
): T | null {
  const usable = periods.filter((period) => period.isActive !== false);
  if (!usable.length) return null;
  const minutes = (value: string) => {
    const [hours, mins] = value.split(":").map(Number);
    return hours * 60 + mins;
  };
  const ordered = [...usable].sort((left, right) => minutes(left.startTime) - minutes(right.startTime));
  // 종료 후 5분까지는 그 교시로 본다 — getCurrentPeriod 와 같은 여유다.
  return ordered.find((period) => nowMinutes <= minutes(period.endTime) + 5) ?? ordered[ordered.length - 1];
}

/** 서울 기준 자정으로부터 지난 분. */
export function kstMinutesOfDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}
