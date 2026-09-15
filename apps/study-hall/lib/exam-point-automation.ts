import { z } from "zod";
import { normalizeYmdDate } from "./date-utils";
import { createStudyMinutesCalculator, clampStudyTimeDateRange } from "./study-time-meta";

const date = z.string().refine(value => { try { normalizeYmdDate(value); return true; } catch { return false; } }, "유효한 날짜를 입력해 주세요.");
const rule = z.string().min(1).nullable().default(null);
export const EXAM_POINT_RULE_FIELDS = {
  morningAbsenceRuleId: "아침모의고사 미응시",
  regularAbsenceRuleId: "정기모의고사 미응시",
  morningFirstRuleId: "아침모의고사 월간 1등",
  regularFirstRuleId: "정기모의고사 월간 1등",
  regularSecondRuleId: "정기모의고사 월간 2등",
  regularThirdRuleId: "정기모의고사 월간 3등",
  morningMonthlyRuleId: "아침모의고사 월 개근",
} as const;
export type ExamPointRuleField = keyof typeof EXAM_POINT_RULE_FIELDS;
export const examPointAutomationSchema = z.object({
  enabled: z.boolean().default(false),
  effectiveFrom: date.nullable().default(null),
  morningStartDate: date.nullable().default(null),
  morningWeekdays: z.array(z.number().int().min(1).max(5)).max(5).default([]),
  morningExcludedDates: z.array(date).max(366).default([]),
  rankAggregation: z.enum(["AVERAGE", "TOTAL"]).default("AVERAGE"),
  rankTieBreak: z.enum(["SHARED", "ATTEMPTS_STUDY_TIME"]).default("SHARED"),
  morningAbsenceRuleId: rule, regularAbsenceRuleId: rule,
  morningFirstRuleId: rule, regularFirstRuleId: rule, regularSecondRuleId: rule, regularThirdRuleId: rule,
  morningMonthlyRuleId: rule,
  settleUnusedLeaveAutomatically: z.boolean().default(false),
}).superRefine((value, ctx) => {
  if (value.enabled && !value.effectiveFrom) ctx.addIssue({code:"custom",path:["effectiveFrom"],message:"자동 부여 시작일을 입력해 주세요."});
  if (value.enabled && value.morningStartDate && (value.morningAbsenceRuleId || value.morningFirstRuleId || value.morningMonthlyRuleId) && !value.morningWeekdays.length)
    ctx.addIssue({code:"custom",path:["morningWeekdays"],message:"아침모의고사 요일을 선택해 주세요."});
  if (new Set(value.morningWeekdays).size !== value.morningWeekdays.length) ctx.addIssue({code:"custom",path:["morningWeekdays"],message:"요일이 중복되었습니다."});
});
export type ExamPointAutomation = z.infer<typeof examPointAutomationSchema>;
export const defaultExamPointAutomation = () => examPointAutomationSchema.parse({});
export function parseExamPointAutomation(value: unknown) { return examPointAutomationSchema.parse(value ?? {}); }
export const examPointPrefix = (month: string) => `[자동][성적][${month}]`;
export function examPointDisplayNote(notes: string) { return notes.replace(/^\[자동\]\[성적\]\[\d{4}-\d{2}\]\[[^\]]+\]\s*/, "[자동] "); }

export type ExamPointStudent = {id: string; status: string; studyTrack?: string | null; courseStartDate?: string | null; courseEndDate?: string | null; enrolledAt?: string};
export type ExamPointSession = {id: string; examTypeId: string; identityKey: string; examDate: string; category: string; fullScore: number; studyTrack?: string | null};
export type ExamPointSource = {
  morningPeriodId?: string | null;
  students: ExamPointStudent[]; sessions: ExamPointSession[];
  participants: {sessionId: string; studentId: string; totalScore: number; isPartial: boolean}[];
  attendance: {studentId: string; date: string; status: string; reason: string | null; periodId?: string; checkInTime?: string | null}[];
  periods?: {id: string; endTime: string; isActive?: boolean}[];
  leave: {studentId: string; date: string; status: string}[];
  rules: {id: string; points: number; isActive: boolean}[];
};
export type ExamPointAward = {studentId: string; ruleId: string; points: number; date: string; notes: string};
/** Approved absence is not unauthorized exam nonparticipation. Pending/rejected leave
 * and free-text notes on an ABSENT record do not constitute approval. */
export function isExcusedExamAbsence(source: Pick<ExamPointSource, "attendance" | "leave">, studentId: string, day: string, periodId?: string | null) {
  return source.attendance.some(record => record.studentId === studentId && record.date === day &&
    (!periodId || record.periodId === periodId) &&
    ["EXCUSED", "HOLIDAY", "HALF_HOLIDAY"].includes(record.status)) ||
    (!periodId && source.leave.some(record => record.studentId === studentId && record.date === day &&
      ["APPROVED", "USED"].includes(record.status)));
}
export function buildExamPointAwards(config: ExamPointAutomation, source: ExamPointSource, month: string, today: string): ExamPointAward[] {
  if (!config.enabled || !config.effectiveFrom) return [];
  const prefix = examPointPrefix(month);
  const rules = new Map(source.rules.filter(r => r.isActive).map(r=>[r.id,r]));
  const active = source.students.filter(s=>s.status === "ACTIVE");
  const eligible = (s: ExamPointStudent, day: string, track?: string | null) =>
    (!track || s.studyTrack === track) && (!(s.courseStartDate ?? s.enrolledAt?.slice(0,10)) || (s.courseStartDate ?? s.enrolledAt!.slice(0,10)) <= day) && (!s.courseEndDate || s.courseEndDate >= day);
  const expectedDay = (day: string) => config.morningWeekdays.includes(new Date(`${day}T00:00:00Z`).getUTCDay()) && !config.morningExcludedDates.includes(day);
  const monthSessions = source.sessions.filter(s=>s.examDate.startsWith(month) && s.examDate <= today && (s.category !== "MORNING" || (config.morningStartDate && s.examDate >= config.morningStartDate && expectedDay(s.examDate))));
  const sessions = monthSessions.filter(s=>s.category === "MORNING" || s.examDate >= config.effectiveFrom!);
  const awards = new Map<string, ExamPointAward>();
  const add = (studentId: string, ruleId: string | null, day: string, key: string, label: string, negative = false) => {
    const r = ruleId ? rules.get(ruleId) : null;
    if (!r || (negative ? r.points >= 0 : r.points <= 0)) return;
    const notes = `${prefix}[${key}] ${label} (${day})`;
    awards.set(`${studentId}:${notes}`, {studentId,ruleId:r.id,points:r.points,date:day,notes});
  };
  for (const session of sessions) {
    const candidates = active.filter(s=>eligible(s,session.examDate,session.studyTrack));
    const ids = new Set(candidates.map(s=>s.id));
    const participants = source.participants.filter(p=>p.sessionId===session.id && ids.has(p.studentId));
    const present = new Set(participants.map(p=>p.studentId));
    const morning = session.category === "MORNING";
    const key = `${session.examTypeId}:${session.identityKey}`;
    for (const student of candidates) {
      // Morning nonparticipation is charged once per day across uploaded subjects/types.
      const attendedToday = morning && sessions.some(s=>s.category==="MORNING" && s.examDate===session.examDate && source.participants.some(p=>p.sessionId===s.id && p.studentId===student.id));
      if (!present.has(student.id) && !attendedToday && !isExcusedExamAbsence(source,student.id,session.examDate,morning ? source.morningPeriodId : null))
        add(student.id,morning?config.morningAbsenceRuleId:config.regularAbsenceRuleId,session.examDate,morning?`morning-absent:${session.examDate}`:`absent:${key}`,morning?"아침모의고사 무단 미참여":"정기모의고사 무단 미응시",true);
    }
  }
  // A missing upload must not masquerade as full-month participation. Closed calendar only.
  const [year,m] = month.split("-").map(Number);
  const end = new Date(Date.UTC(year,m,0)).toISOString().slice(0,10);
  // Rank merits are settled once per closed month, independently for morning/regular
  // and each study track. Multiple exam types or daily winners cannot multiply them.
  if (end < today) {
    const studyMinutes = new Map<string,number>();
    if (config.rankTieBreak === "ATTEMPTS_STUDY_TIME") {
      const range=clampStudyTimeDateRange(`${month}-01`,end);
      const periods=new Map((source.periods ?? []).map(p=>[p.id,p]));
      const calculate=createStudyMinutesCalculator();
      for(const record of source.attendance) {
        const period=record.periodId ? periods.get(record.periodId) : null;
        if(!range || !period || record.date<range.dateFrom || record.date>range.dateTo || !["PRESENT","TARDY"].includes(record.status)) continue;
        const minutes=calculate(record.checkInTime ?? null,record.date,period.endTime);
        if(Number.isFinite(minutes)) studyMinutes.set(record.studentId,(studyMinutes.get(record.studentId) ?? 0)+minutes);
      }
    }
    const groups = new Map<string, {category: string; totals: Map<string, {sum: number; count: number}>}>();
    for (const session of sessions) {
      if (!["MORNING", "REGULAR"].includes(session.category) || !Number.isFinite(session.fullScore) || session.fullScore <= 0) continue;
      const candidates = new Map(active.filter(s=>eligible(s,session.examDate,session.studyTrack)).map(s=>[s.id,s]));
      for (const participant of source.participants) {
        const student = candidates.get(participant.studentId);
        if (participant.sessionId !== session.id || !student || participant.isPartial || !Number.isFinite(participant.totalScore) || participant.totalScore < 0 || participant.totalScore > session.fullScore) continue;
        const groupKey = JSON.stringify([session.category, student.studyTrack ?? null]);
        const group = groups.get(groupKey) ?? {category:session.category, totals:new Map<string,{sum:number;count:number}>()};
        const total = group.totals.get(student.id) ?? {sum:0,count:0};
        total.sum += participant.totalScore / session.fullScore * 100;
        total.count += 1;
        group.totals.set(student.id,total);
        groups.set(groupKey,group);
      }
    }
    for (const group of Array.from(groups.values())) {
      const ranked = Array.from(group.totals, ([studentId,total])=>({studentId,count:total.count,minutes:studyMinutes.get(studentId) ?? 0,score:Number((config.rankAggregation === "TOTAL" ? total.sum : total.sum/total.count).toFixed(10))}));
      const morning = group.category === "MORNING";
      for (const participant of ranked) {
        const rank = 1 + ranked.filter(p=>p.score>participant.score || (config.rankTieBreak === "ATTEMPTS_STUDY_TIME" && p.score===participant.score && (p.count>participant.count || (p.count===participant.count && p.minutes>participant.minutes)))).length;
        const id = morning ? rank===1?config.morningFirstRuleId:null : [config.regularFirstRuleId,config.regularSecondRuleId,config.regularThirdRuleId][rank-1] ?? null;
        add(participant.studentId,id,end,`rank-month:${group.category}:${month}`,`${month} ${morning?"아침":"정기"}모의고사 월간 ${rank}등`);
      }
    }
  }
  if (end < today && config.morningStartDate && end >= config.morningStartDate) {
    const expected: string[] = [];
    for(let d=1;d<=Number(end.slice(-2));d++) { const day=`${month}-${String(d).padStart(2,"0")}`; if(day >= config.morningStartDate && expectedDay(day)) expected.push(day); }
    for (const student of active) {
      if (!expected.length || !eligible(student,expected[0]) || !eligible(student,expected.at(-1)!)) continue;
      const complete = expected.every(day=>{
        const exams = monthSessions.filter(s=>s.category==="MORNING" && s.examDate===day && (!s.studyTrack || s.studyTrack===student.studyTrack));
        return exams.length>0 && exams.every(s=>source.participants.some(p=>p.sessionId===s.id && p.studentId===student.id));
      });
      if (complete) add(student.id,config.morningMonthlyRuleId,expected.at(-1)!,`morning-month:${month}`,"아침모의고사 월 개근");
    }
  }
  return Array.from(awards.values());
}
