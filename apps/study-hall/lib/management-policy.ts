import { z } from "zod";
import { normalizeYmdDate } from "@/lib/date-utils";

const ymd = z.string().refine((value) => { try { normalizeYmdDate(value); return true; } catch { return false; } }, "유효한 날짜를 입력해 주세요.");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const weekdays = z.array(z.number().int().min(0).max(6));

/** Numeric operating rules come from division_settings.management_policy. */
export const managementPolicySchema = z.object({
  version: z.string(),
  effectiveFrom: ymd,
  source: z.string(),
  attendancePeriodIds: z.array(z.string()),
  controlledPeriods: z.array(z.object({ periodId: z.string(), weekdays, optional: z.boolean() })),
  optionalEnrollments: z.array(z.object({ studentId: z.string(), periodId: z.string(), dateFrom: ymd, dateTo: ymd, weekdays })),
  morningExam: z.object({ periodId: z.string(), weekdays }),
  closingTime: time,
  breaks: z.array(z.object({ name: z.string(), startTime: time, endTime: time })).default([]),
  monthlyPoints: z.boolean(),
  separateMeritDemerit: z.boolean(),
  managerConfirmsAttendance: z.boolean(),
  fullDayAbsenceRuleId: z.string(),
  partialAbsenceRuleId: z.string().nullable(),
  tardyRuleId: z.string(),
  lateArrivalPolicy: z.enum(["after_start", "threshold"]),
  phone: z.object({ shortLoanMinutes: z.number().int().positive(), resubmitBeforeMinutes: z.number().int().nonnegative(), repeatDays: z.number().int().positive(), repeatCount: z.number().int().positive(), allowBulkRental: z.boolean() }),
  earlyExit: z.object({ ruleId: z.string(), windowDays: z.number().int().positive(), interviewCount: z.number().int().positive(), missionCount: z.number().int().positive(), missionDays: z.number().int().positive() }),
  unauthorizedEntry: z.object({ ruleId: z.string(), monthlyReviewCount: z.number().int().positive() }),
  patrolsPerPeriod: z.number().int().positive(),
  dailyGoalCount: z.number().int().positive(),
  appealDays: z.number().int().positive(),
  holidayPriorNotice: z.boolean(),
  warningLabels: z.record(z.string(), z.string()),
  guidance: z.array(z.object({ title: z.string(), text: z.string() })),
});

export type ManagementPolicy = z.infer<typeof managementPolicySchema>;
export type PolicyPeriod = { id: string; name: string; startTime: string; endTime: string; isActive: boolean };
export type PolicyAttendance = { studentId: string; periodId: string; status: string };
export type PolicyPoint = { studentId: string; points: number; date: Date | string };

export function isPolicyEffective(policy: ManagementPolicy | null, date: string): policy is ManagementPolicy {
  return !!policy && date >= policy.effectiveFrom;
}

export function isControlledPeriod(policy: ManagementPolicy, periodId: string, date: string, studentId?: string) {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const rule = policy.controlledPeriods.find((p) => p.periodId === periodId && p.weekdays.includes(weekday));
  if (!rule) return false;
  if (!rule.optional) return true;
  return !!studentId && policy.optionalEnrollments.some((e) => e.studentId === studentId && e.periodId === periodId && date >= e.dateFrom && date <= e.dateTo && e.weekdays.includes(weekday));
}

export function kstDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function kstMonthBounds(now = new Date()) {
  const date = kstDate(now);
  const [year, month] = date.split("-").map(Number);
  return { dateFrom: `${date.slice(0, 7)}-01`, dateTo: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10) };
}

export function separatePointTotals(records: PolicyPoint[], dateFrom: string, dateTo: string) {
  const totals = new Map<string, { merit: number; demerit: number }>();
  for (const r of records) {
    // Point dates are business dates stored at UTC midnight, not event timestamps.
    const date = (r.date instanceof Date ? r.date.toISOString() : r.date).slice(0, 10);
    if (date < dateFrom || date > dateTo) continue;
    const t = totals.get(r.studentId) ?? { merit: 0, demerit: 0 };
    if (r.points > 0) t.merit += r.points;
    else t.demerit += Math.abs(r.points);
    totals.set(r.studentId, t);
  }
  return totals;
}

export type AttendancePenaltyCandidate = { studentId: string; ruleId: string; points: number; notes: string };

/** A full-day absence replaces period penalties; missing/approved cells are never absence. */
export function buildPolicyAttendanceCandidates(policy: ManagementPolicy, periods: PolicyPeriod[], records: PolicyAttendance[], rules: { id: string; points: number; isActive: boolean }[], date: string, now = new Date()): AttendancePenaltyCandidate[] {
  if (!isPolicyEffective(policy, date)) return [];
  const activeRules = new Map(rules.filter((r) => r.isActive).map((r) => [r.id, r]));
  const candidates: AttendancePenaltyCandidate[] = [];
  const studentIds = new Set(records.map((r) => r.studentId));
  const add = (studentId: string, ruleId: string | null, scope: string, status: "ABSENT" | "TARDY", label: string) => {
    const rule = ruleId ? activeRules.get(ruleId) : null;
    if (rule && rule.points < 0) candidates.push({ studentId, ruleId: rule.id, points: rule.points, notes: `[자동][출결벌점][${date}][${scope}][${status}] ${label}` });
  };
  for (const studentId of Array.from(studentIds)) {
    const controlled = periods.filter((p) => p.isActive && isControlledPeriod(policy, p.id, date, studentId));
    if (!controlled.length) continue;
    const byPeriod = new Map(records.filter((r) => r.studentId === studentId).map((r) => [r.periodId, r]));
    const end = controlled.reduce((latest, p) => p.endTime > latest ? p.endTime : latest, "00:00");
    const dayEnded = now.getTime() >= new Date(`${date}T${end}:00+09:00`).getTime();
    if (dayEnded && controlled.every((p) => byPeriod.get(p.id)?.status === "ABSENT")) {
      add(studentId, policy.fullDayAbsenceRuleId, "DAY", "ABSENT", "관리일 전체 무단결석 (교시별 중복 없음)");
      continue;
    }
    for (const p of controlled) {
      const status = byPeriod.get(p.id)?.status;
      if (now.getTime() < new Date(`${date}T${p.startTime}:00+09:00`).getTime()) continue;
      if (status === "TARDY") add(studentId, policy.tardyRuleId, p.id, "TARDY", `${p.name} 시작 후 도착`);
      if (status === "ABSENT" && policy.partialAbsenceRuleId) add(studentId, policy.partialAbsenceRuleId, p.id, "ABSENT", `${p.name} 결석`);
    }
  }
  return candidates;
}
