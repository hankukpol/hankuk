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
