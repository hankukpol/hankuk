import { z } from "zod";
import { normalizeYmdDate } from "./date-utils";

const date = z.string().refine(value => { try { normalizeYmdDate(value); return true; } catch { return false; } }, "유효한 날짜를 입력해 주세요.");
const rule = z.string().min(1).nullable().default(null);
export const EXAM_POINT_RULE_FIELDS = {
  morningAbsenceRuleId: "아침모의고사 미응시",
  regularAbsenceRuleId: "정기모의고사 미응시",
  morningFirstRuleId: "아침모의고사 관리반 1등",
  regularFirstRuleId: "정기모의고사 관리반 1등",
  regularSecondRuleId: "정기모의고사 관리반 2등",
  regularThirdRuleId: "정기모의고사 관리반 3등",
  morningMonthlyRuleId: "아침모의고사 월 개근",
} as const;
export type ExamPointRuleField = keyof typeof EXAM_POINT_RULE_FIELDS;
export const examPointAutomationSchema = z.object({
  enabled: z.boolean().default(false),
  effectiveFrom: date.nullable().default(null),
  morningStartDate: date.nullable().default(null),
  morningWeekdays: z.array(z.number().int().min(1).max(5)).max(5).default([]),
  morningExcludedDates: z.array(date).max(366).default([]),
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
export type ExamPointSession = {id: string; examTypeId: string; identityKey: string; examDate: string; category: string; studyTrack?: string | null};
export type ExamPointSource = {
  students: ExamPointStudent[]; sessions: ExamPointSession[];
  participants: {sessionId: string; studentId: string; totalScore: number; isPartial: boolean}[];
  attendance: {studentId: string; date: string; status: string; reason: string | null}[];
  leave: {studentId: string; date: string; status: string}[];
  rules: {id: string; points: number; isActive: boolean}[];
};
export type ExamPointAward = {studentId: string; ruleId: string; points: number; date: string; notes: string};
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
  const excused = (id: string, day: string) =>
    source.attendance.some(a=>a.studentId===id && a.date===day && ["EXCUSED","HOLIDAY","HALF_HOLIDAY"].includes(a.status)) ||
    source.leave.some(l=>l.studentId===id && l.date===day && ["APPROVED","USED"].includes(l.status));
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
      if (!present.has(student.id) && !attendedToday && !excused(student.id,session.examDate))
        add(student.id,morning?config.morningAbsenceRuleId:config.regularAbsenceRuleId,session.examDate,morning?`morning-absent:${session.examDate}`:`absent:${key}`,morning?"아침모의고사 무단 미참여":"정기모의고사 무단 미응시",true);
    }
    const ranked = participants.filter(p=>!p.isPartial && Number.isFinite(p.totalScore));
    for (const participant of ranked) {
      const rank = 1 + ranked.filter(p=>p.totalScore>participant.totalScore).length;
      const id = morning ? rank===1?config.morningFirstRuleId:null : [config.regularFirstRuleId,config.regularSecondRuleId,config.regularThirdRuleId][rank-1] ?? null;
      add(participant.studentId,id,session.examDate,`rank:${key}`,`${morning?"아침":"정기"}모의고사 관리반 ${rank}등`);
    }
  }
  // A missing upload must not masquerade as full-month participation. Closed calendar only.
  const [year,m] = month.split("-").map(Number);
  const end = new Date(Date.UTC(year,m,0)).toISOString().slice(0,10);
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
