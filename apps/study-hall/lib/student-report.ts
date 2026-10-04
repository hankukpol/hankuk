/**
 * 학생 상담 자료(A4 인쇄)의 집계. 이미 저장된 출결·등원·상벌점 기록을 기간으로 잘라 세기만 한다.
 * 새 판정·점수를 만들지 않는다. 화면 문구는 components/students/StudentCounselingReport.tsx 가 정한다.
 */
import { ATTENDANCE_STATUS_OPTIONS } from "./attendance-meta";

export type ReportRange = { from: string; to: string };

const DAY_MS = 86400000;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function isYmd(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/** 기본 기간: 오늘(한국 날짜)을 끝으로 4주(28일). 잘못된 값이나 거꾸로 된 기간은 기본값으로 되돌린다. */
export function reportRange(today: string, from?: unknown, to?: unknown, maxDays = 186): ReportRange {
  const fallbackFrom = new Date(Date.parse(`${today}T00:00:00Z`) - 27 * DAY_MS).toISOString().slice(0, 10);
  const end = isYmd(to) ? to : today;
  let start = isYmd(from) ? from : fallbackFrom;
  if (start > end) start = new Date(Date.parse(`${end}T00:00:00Z`) - 27 * DAY_MS).toISOString().slice(0, 10);
  const span = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS;
  if (span > maxDays) start = new Date(Date.parse(`${end}T00:00:00Z`) - maxDays * DAY_MS).toISOString().slice(0, 10);
  return { from: start, to: end };
}

export function weekdayLabel(date: string) {
  return WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
}

export function monthsInRange(range: ReportRange) {
  const months: string[] = [];
  let cursor = range.from.slice(0, 7);
  while (cursor <= range.to.slice(0, 7)) {
    months.push(cursor);
    const [year, month] = cursor.split("-").map(Number);
    cursor = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
  }
  return months;
}

const STATUS_LABEL = Object.fromEntries(ATTENDANCE_STATUS_OPTIONS.map((option) => [option.value, option.label])) as Record<string, string>;
export const attendanceStatusLabel = (status: string) => STATUS_LABEL[status] ?? status;

type AttendanceRecord = { date: string; periodName: string; periodLabel: string | null; status: string; reason: string | null };
/** 출결 요약에 세는 상태와 순서. 해당없음은 세지 않는다. */
const COUNTED = ["PRESENT", "TARDY", "ABSENT", "EXCUSED", "HOLIDAY", "HALF_HOLIDAY"] as const;
/** 면담에서 짚어야 하는 기록: 출석 외 상태. */
const EXCEPTIONS = new Set(["TARDY", "ABSENT", "EXCUSED", "HOLIDAY", "HALF_HOLIDAY"]);

export function summarizeAttendance(records: AttendanceRecord[], range: ReportRange) {
  const inRange = records.filter((r) => r.date >= range.from && r.date <= range.to);
  const counts = COUNTED.map((status) => ({ status, label: attendanceStatusLabel(status), count: inRange.filter((r) => r.status === status).length }));
  const exceptions = inRange
    .filter((r) => EXCEPTIONS.has(r.status))
    .sort((a, b) => a.date.localeCompare(b.date) || a.periodName.localeCompare(b.periodName, "ko"))
    .map((r) => ({ date: r.date, period: r.periodLabel ? `${r.periodName} (${r.periodLabel})` : r.periodName, status: r.status, label: attendanceStatusLabel(r.status), reason: r.reason }));
  return { counts, exceptions, recorded: inRange.filter((r) => r.status !== "NOT_APPLICABLE").length };
}

type ArrivalLike = { date: string; effectiveAt: string; cancelledAt: string | null };
/** 한국 시각 HH:MM 와 자정부터의 분. */
function seoulClock(iso: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0), minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return { text: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`, minutes: hour * 60 + minute };
}
const clockText = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(Math.round(minutes % 60)).padStart(2, "0")}`;

/** 등원 기록(취소 제외)을 날짜순으로. 같은 날 지각 기록이 있으면 함께 표시한다. */
export function summarizeArrivals(arrivals: ArrivalLike[], attendance: AttendanceRecord[], range: ReportRange) {
  const tardyDays = new Set(attendance.filter((r) => r.status === "TARDY").map((r) => r.date));
  const rows = arrivals
    .filter((a) => !a.cancelledAt && a.date >= range.from && a.date <= range.to)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((a) => { const clock = seoulClock(a.effectiveAt); return { date: a.date, weekday: weekdayLabel(a.date), time: clock.text, minutes: clock.minutes, tardy: tardyDays.has(a.date) }; });
  const minutes = rows.map((r) => r.minutes);
  const average = minutes.length ? minutes.reduce((a, b) => a + b, 0) / minutes.length : null;
  return {
    rows,
    days: rows.length,
    average: average === null ? null : clockText(average),
    earliest: minutes.length ? clockText(Math.min(...minutes)) : null,
    latest: minutes.length ? clockText(Math.max(...minutes)) : null,
  };
}

type PointLike = { date: string; points: number; displayName: string | null; ruleName: string | null; categoryLabel: string; notes: string | null };
export function summarizePoints(records: PointLike[], range: ReportRange) {
  const inRange = records.filter((r) => r.date.slice(0, 10) >= range.from && r.date.slice(0, 10) <= range.to)
    .sort((a, b) => a.date.localeCompare(b.date));
  return {
    merit: inRange.filter((r) => r.points > 0).reduce((sum, r) => sum + r.points, 0),
    demerit: inRange.filter((r) => r.points < 0).reduce((sum, r) => sum - r.points, 0),
    rows: inRange.map((r) => ({ date: r.date.slice(0, 10), name: r.displayName || r.ruleName || r.categoryLabel, points: r.points, notes: r.notes })),
  };
}
