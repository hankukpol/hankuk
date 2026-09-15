import { isPolicyEffective, managementPolicySchema } from "./management-policy";
import { parseExamPointAutomation, type ExamPointSource } from "./exam-point-automation";

export function examAttendancePeriod(settings: { managementPolicy?: unknown; examPointAutomation?: unknown }, day: string) {
  const parsed = managementPolicySchema.safeParse(settings.managementPolicy);
  if (!parsed.success || !isPolicyEffective(parsed.data, day) || !parsed.data.morningExam.syncAttendance) return null;
  const config = parseExamPointAutomation(settings.examPointAutomation);
  if (!config.morningStartDate || day < config.morningStartDate || !config.morningWeekdays.includes(new Date(`${day}T00:00:00Z`).getUTCDay()) || config.morningExcludedDates.includes(day)) return null;
  return parsed.data.morningExam.periodId || null;
}

/** Only a persisted, matched grading participant proves attendance, including zero scores. */
export function desiredExamAttendance(source: ExamPointSource, day: string) {
  const sessions = source.sessions.filter(s => s.category === "MORNING" && s.examDate === day);
  const ids = new Set(sessions.map(s => s.id));
  const students = new Set(source.students.filter(s => s.status === "ACTIVE").map(s => s.id));
  return new Set(source.participants.filter(p => ids.has(p.sessionId) && students.has(p.studentId)).map(p => p.studentId));
}

export function includeManualMorningScores(source: ExamPointSource, scores:{studentId:string;examTypeId:string;examDate:string;score:number|null}[], types:{id:string;category:string}[]): ExamPointSource {
  const morning = new Set(types.filter(t=>t.category==="MORNING").map(t=>t.id));
  const rows=scores.filter(s=>morning.has(s.examTypeId) && Number.isFinite(s.score) && !source.sessions.some(e=>e.examTypeId===s.examTypeId && e.examDate===s.examDate));
  const key=(r:typeof rows[number])=>`manual:${r.examTypeId}:${r.examDate}`;
  const sessions=Array.from(new Map(rows.map(r=>[key(r),{id:key(r),examTypeId:r.examTypeId,identityKey:key(r),examDate:r.examDate,category:"MORNING",fullScore:0}])).values());
  return {...source,sessions:[...source.sessions,...sessions],participants:[...source.participants,...rows.map(r=>({sessionId:key(r),studentId:r.studentId,totalScore:r.score!,isPartial:false}))]};
}
