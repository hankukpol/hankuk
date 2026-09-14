import { isClassAttendance } from "./attendance-meta";
import { parseUtcDateFromYmd } from "./date-utils";
import { isControlledPeriod, isPolicyEffective, type ManagementPolicy } from "./management-policy";

export type PerfectAttendanceWindow = {
  kind: "weekly" | "monthly";
  dateFrom: string;
  dateTo: string;
  notes: string;
};
export type PerfectAttendancePeriod = { id: string; isActive: boolean; endTime: string };
export type PerfectAttendanceRecord = {
  studentId: string; periodId: string; date: string; status: string; reason?: string | null;
};
export type PerfectAttendanceAward = { studentId: string; notes: string; date: string; points: number };

function ymd(date: Date) { return date.toISOString().slice(0, 10); }
function shift(date: string, days: number) {
  const value = parseUtcDateFromYmd(date);
  value.setUTCDate(value.getUTCDate() + days);
  return ymd(value);
}

export function perfectAttendanceWindows(date: string): PerfectAttendanceWindow[] {
  const day = parseUtcDateFromYmd(date);
  const monday = shift(date, -((day.getUTCDay() + 6) % 7));
  const week = (from: string): PerfectAttendanceWindow => {
    const to = shift(from, 6);
    return { kind: "weekly", dateFrom: from, dateTo: to, notes: `[자동] 주간 개근 상점 (${from}~${to})` };
  };
  const month = (offset: number): PerfectAttendanceWindow => {
    const from = ymd(new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + offset, 1)));
    const to = ymd(new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + offset + 1, 0)));
    return { kind: "monthly", dateFrom: from, dateTo: to, notes: `[자동] 월 개근 상점 (${from.slice(0, 7)})` };
  };
  // 마지막 교시 시작 때 저장했다면 아직 개근이 확정되지 않는다.
  // 다음 저장에서 직전 주/월까지 닫아 주며, 과거 수정은 그 날짜의 주/월을 재판정한다.
  return [week(monday), month(0), week(shift(monday, -7)), month(-1)];
}

export function buildPerfectAttendanceAwards(input: {
  windows: PerfectAttendanceWindow[];
  policy: ManagementPolicy;
  periods: PerfectAttendancePeriod[];
  studentIds: string[];
  records: PerfectAttendanceRecord[];
  weeklyPts: number;
  monthlyPts: number;
  now: Date;
}): PerfectAttendanceAward[] {
  const cells = new Map(input.records.map(r => [`${r.studentId}:${r.date}:${r.periodId}`, r]));
  const active = input.periods.filter(p => p.isActive && p.id !== input.policy.morningExam.periodId);
  const awards: PerfectAttendanceAward[] = [];
  for (const window of input.windows) {
    const points = window.kind === "weekly" ? input.weeklyPts : input.monthlyPts;
    if (points <= 0) continue;
    for (const studentId of input.studentIds) {
      let qualified = true;
      let lastDate = "";
      let lastTime = "";
      for (let date = window.dateFrom; date <= window.dateTo; date = shift(date, 1)) {
        if (!isPolicyEffective(input.policy, date)) continue;
        for (const period of active) {
          if (!isControlledPeriod(input.policy, period.id, date, studentId)) continue;
          if (date > lastDate || (date === lastDate && period.endTime > lastTime)) {
            lastDate = date;
            lastTime = period.endTime;
          }
          const cell = cells.get(`${studentId}:${date}:${period.id}`);
          if (!cell || !(cell.status === "PRESENT" || isClassAttendance(cell.status, cell.reason))) qualified = false;
        }
      }
      if (qualified && lastDate && input.now >= new Date(`${lastDate}T${lastTime}:00+09:00`)) {
        awards.push({ studentId, notes: window.notes, date: `${lastDate}T00:00:00.000Z`, points });
      }
    }
  }
  return awards;
}
