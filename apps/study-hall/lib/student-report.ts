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
/** 날짜마다 짚는 기록: 지각·결석. 면담에서 그날 무슨 일이 있었는지 묻는다. */
const DAILY = ["TARDY", "ABSENT"];
/**
 * 같은 상태·같은 사유로 길게 이어지는 기록: 사유결석·휴무·반휴.
 * 교시마다 한 줄로 적으면 수업 수강 하나가 수십 줄이 된다(운영자 지적 2026-10-07: 사유결석 71줄).
 */
const GROUPED = ["EXCUSED", "HOLIDAY", "HALF_HOLIDAY"];

const md = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
const dayIndex = (date: string) => Math.round(Date.parse(`${date}T00:00:00Z`) / DAY_MS);

/** 교시 이름 묶음. 모두 'n교시'면 이어진 번호를 1~4교시처럼 줄이고, 아니면 이름을 그대로 나열한다. */
export function periodsText(names: string[]) {
  const unique = Array.from(new Set(names));
  const numbers = unique.map((name) => /^(\d+)\s*교시$/.exec(name.trim())?.[1]).map((value) => (value === undefined ? null : Number(value)));
  if (!numbers.length || numbers.some((value) => value === null)) return unique.join(", ");
  const sorted = (numbers as number[]).sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(i === j ? `${sorted[i]}` : `${sorted[i]}~${sorted[j]}`);
    i = j + 1;
  }
  return `${parts.join("·")}교시`;
}

/** 날짜 묶음. 이어진 날은 9/14~18, 달이 바뀌면 9/28~10/2 처럼 줄인다. */
export function datesText(dates: string[]) {
  const sorted = Array.from(new Set(dates)).sort();
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && dayIndex(sorted[j + 1]) - dayIndex(sorted[j]) === 1) j++;
    const start = sorted[i], end = sorted[j];
    parts.push(i === j ? md(start) : `${md(start)}~${start.slice(0, 7) === end.slice(0, 7) ? Number(end.slice(8, 10)) : md(end)}`);
    i = j + 1;
  }
  return parts.join(", ");
}

export function summarizeAttendance(records: AttendanceRecord[], range: ReportRange) {
  const inRange = records.filter((r) => r.date >= range.from && r.date <= range.to);
  const counts = COUNTED.map((status) => ({ status, label: attendanceStatusLabel(status), count: inRange.filter((r) => r.status === status).length }));

  // 지각·결석: 날짜·상태·사유가 같으면 한 줄(그날의 교시를 함께 적는다).
  const dailyMap = new Map<string, AttendanceRecord[]>();
  for (const r of inRange.filter((r) => DAILY.includes(r.status))) {
    const key = JSON.stringify([r.date, r.status, r.reason ?? ""]);
    dailyMap.set(key, [...(dailyMap.get(key) ?? []), r]);
  }
  const daily = Array.from(dailyMap.values())
    .map((rows) => ({ date: rows[0].date, status: rows[0].status, label: attendanceStatusLabel(rows[0].status), periods: periodsText(rows.map((r) => r.periodName)), reason: rows[0].reason }))
    .sort((a, b) => a.date.localeCompare(b.date) || DAILY.indexOf(a.status) - DAILY.indexOf(b.status));

  // 사유결석·휴무·반휴: 상태·사유가 같으면 기간 전체를 한 줄로(날짜는 이어진 날끼리 줄인다).
  const groupMap = new Map<string, AttendanceRecord[]>();
  for (const r of inRange.filter((r) => GROUPED.includes(r.status))) {
    const key = JSON.stringify([r.status, r.reason?.trim() ?? ""]);
    groupMap.set(key, [...(groupMap.get(key) ?? []), r]);
  }
  const grouped = Array.from(groupMap.values())
    .map((rows) => {
      const dates = Array.from(new Set(rows.map((r) => r.date))).sort();
      const perDay = new Set(dates.map((date) => periodsText(rows.filter((r) => r.date === date).map((r) => r.periodName))));
      return {
        status: rows[0].status, label: attendanceStatusLabel(rows[0].status), reason: rows[0].reason?.trim() || null,
        // 날짜마다 교시가 다르면 모은 교시 뒤에 '중'을 붙인다(정확한 수는 교시 수 칸).
        periods: `${periodsText(rows.map((r) => r.periodName))}${perDay.size > 1 ? " 중" : ""}`,
        dates: datesText(dates), firstDate: dates[0], days: dates.length, count: rows.length,
      };
    })
    .sort((a, b) => GROUPED.indexOf(a.status) - GROUPED.indexOf(b.status) || a.firstDate.localeCompare(b.firstDate));

  return { counts, daily, grouped, recorded: inRange.filter((r) => r.status !== "NOT_APPLICABLE").length };
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

/** 등원 시각을 주 단위 표로(행 = 월요일 시작 주, 열 = 요일). 카드 수십 장 대신 4~5줄로 본다. */
export function arrivalWeeks(rows: Array<{ date: string; time: string; tardy: boolean }>, range: ReportRange) {
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const start = dayIndex(range.from) - ((new Date(`${range.from}T00:00:00Z`).getUTCDay() + 6) % 7);
  const end = dayIndex(range.to);
  const weeks: Array<{ monday: string; days: Array<{ date: string; inRange: boolean; time: string | null; tardy: boolean }> }> = [];
  for (let monday = start; monday <= end; monday += 7) {
    const days = Array.from({ length: 7 }, (_, offset) => {
      const date = new Date((monday + offset) * DAY_MS).toISOString().slice(0, 10);
      const row = byDate.get(date);
      return { date, inRange: date >= range.from && date <= range.to, time: row?.time ?? null, tardy: row?.tardy ?? false };
    });
    weeks.push({ monday: days[0].date, days });
  }
  return weeks;
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
