import { includeManualMorningScores } from "@/lib/exam-attendance";
import { syncMockExamAttendance, syncDbExamAttendance } from "@/lib/services/exam-attendance.service";
import { buildVersionedExamPoints } from "@/lib/versioned-exam-points";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { examPointPrefix, parseExamPointAutomation, type ExamPointAward, type ExamPointSource } from "@/lib/exam-point-automation";
import { kstDate } from "@/lib/management-policy";
import { isMockMode } from "@/lib/mock-data";
import { readMockState, updateMockState } from "@/lib/mock-store";
import { getPrismaClient } from "@/lib/service-helpers";
import { revalidateDivisionOperationalViews } from "@/lib/revalidation";

type MockState = Awaited<ReturnType<typeof readMockState>>;
const ymd = (value: Date | string | null | undefined) => value == null ? null : (value instanceof Date ? value.toISOString() : value).slice(0,10);
function reconcile(existing: (ExamPointAward & {id:string})[], desired: ExamPointAward[]) {
  const keep = new Set<string>();
  const create: ExamPointAward[] = [];
  for (const award of desired) {
    const same = existing.find(r=>!keep.has(r.id) && r.studentId===award.studentId && r.ruleId===award.ruleId && r.points===award.points && r.date===award.date && r.notes===award.notes);
    if(same) keep.add(same.id); else create.push(award);
  }
  return {create,remove:existing.filter(r=>!keep.has(r.id)).map(r=>r.id)};
}
export function syncMockExamPoints(state: MockState, slug: string, month: string, actorId: string) {
  const raw = state.divisionSettingsByDivision[slug] as unknown as {examPointAutomation?:unknown;managementPolicy?:unknown};
  const config = parseExamPointAutomation(raw?.examPointAutomation);
  const division = state.divisions.find(d=>d.slug===slug);
  if(!division) throw new Error("지점을 찾을 수 없습니다.");
  const types = new Map((state.examTypesByDivision[slug]??[]).map(t=>[t.id,t]));
  const sessions = (state.examSessionsByDivision[slug]??[]).filter(s=>s.divisionId===division.id && types.has(s.examTypeId));
  const sessionIds = new Set(sessions.map(s=>s.id));
  const students = state.studentsByDivision[slug]??[];
  const source: ExamPointSource = {
    students,
    sessions:sessions.map(s=>({...s,category:types.get(s.examTypeId)!.category,studyTrack:types.get(s.examTypeId)!.studyTrack})),
    participants:(state.examSessionParticipantsByDivision[slug]??[]).filter(p=>p.divisionId===division.id && sessionIds.has(p.sessionId)),
    attendance:state.attendanceByDivision[slug]??[],periods:state.periodsByDivision?.[slug]??[],leave:state.leavePermissionsByDivision[slug]??[],rules:state.pointRulesByDivision[slug]??[],
  };
  const active = new Set(students.filter(s=>s.status==="ACTIVE").map(s=>s.id));
  const all = state.pointRecordsByDivision[slug]??[];
  const existing = all.filter(r=>active.has(r.studentId) && r.ruleId && r.notes?.startsWith(examPointPrefix(month))).map(r=>({...r,ruleId:r.ruleId!,notes:r.notes!,date:ymd(r.date)!}));
  const history = (state.academyApplications ?? []).filter(row => row.divisionId === division.id && row.status === "APPLIED");
  const current = {settings:raw,pointRules:source.rules,periods:source.periods ?? [],examTypes:Array.from(types.values())};
  syncMockExamAttendance(state,slug,current,history,includeManualMorningScores(source,state.morningExamScoresByDivision?.[slug] ?? [],Array.from(types.values())),month,kstDate(),actorId);
  if(!config.enabled && !history.length) return {grantedCount:0,revokedCount:0};
  const result = reconcile(existing,buildVersionedExamPoints(current,history,source,month,kstDate()));
  const removed = new Set(result.remove);
  state.pointRecordsByDivision[slug] = [...all.filter(r=>!removed.has(r.id)),...result.create.map(r=>({...r,id:randomUUID(),date:`${r.date}T00:00:00.000Z`,recordedById:actorId,createdAt:new Date().toISOString()}))];
  return {grantedCount:result.create.length,revokedCount:result.remove.length};
}
// Call within the importing transaction; serialize every exam type in this division.
export async function syncDbExamPoints(tx: Prisma.TransactionClient, divisionId: string, month: string, actorId: string) {
  const settings = await tx.divisionSettings.findUnique({where:{divisionId},select:{examPointAutomation:true,managementPolicy:true}});
  const config = parseExamPointAutomation(settings?.examPointAutomation);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`exam-points:${divisionId}`}))`;
  const from=new Date(`${month}-01T00:00:00Z`); const to=new Date(from);to.setUTCMonth(to.getUTCMonth()+1);
  const [students,types,sessions,attendance,leave,rules,existing,periods,historyRows] = await Promise.all([
    tx.student.findMany({where:{divisionId,status:"ACTIVE"},select:{id:true,status:true,studyTrack:true,courseStartDate:true,courseEndDate:true,enrolledAt:true}}),
    tx.examType.findMany({where:{divisionId},select:{id:true,category:true,studyTrack:true}}),
    tx.examSession.findMany({where:{divisionId,examDate:{gte:from,lt:to}}}),
    tx.attendance.findMany({where:{student:{divisionId},date:{gte:from,lt:to}},select:{studentId:true,date:true,status:true,reason:true,periodId:true,checkInTime:true}}),
    tx.leavePermission.findMany({where:{student:{divisionId},date:{gte:from,lt:to}},select:{studentId:true,date:true,status:true}}),
    tx.pointRule.findMany({where:{divisionId}}),
    tx.pointRecord.findMany({where:{student:{divisionId,status:"ACTIVE"},notes:{startsWith:examPointPrefix(month)},ruleId:{not:null}}}),
    tx.period.findMany({where:{divisionId},select:{id:true,endTime:true,isActive:true}}),
    tx.academyConfigurationApplication.findMany({where:{divisionId,status:"APPLIED"},select:{effectiveFrom:true,createdAt:true,status:true,before:true,after:true}}),
  ]);
  const participants = await tx.examSessionParticipant.findMany({where:{divisionId,sessionId:{in:sessions.map(session=>session.id)}}});
  const typeMap=new Map(types.map(t=>[t.id,t]));
  const source: ExamPointSource = {students:students.map(s=>({...s,courseStartDate:ymd(s.courseStartDate)??kstDate(s.enrolledAt),courseEndDate:ymd(s.courseEndDate),enrolledAt:s.enrolledAt.toISOString()})),
    sessions:sessions.filter(s=>typeMap.has(s.examTypeId)).map(s=>({...s,examDate:ymd(s.examDate)!,category:typeMap.get(s.examTypeId)!.category,studyTrack:typeMap.get(s.examTypeId)!.studyTrack})),
    participants,periods,attendance:attendance.map(a=>({...a,date:ymd(a.date)!,checkInTime:a.checkInTime?.toISOString() ?? null})),leave:leave.map(l=>({...l,date:ymd(l.date)!})),rules};
  const history = historyRows.map(row=>({...row,effectiveFrom:ymd(row.effectiveFrom)!,createdAt:row.createdAt.toISOString(),after:row.after as unknown as import("@/lib/versioned-exam-points").ExamConfigurationHistory["before"],before:row.before as unknown as import("@/lib/versioned-exam-points").ExamConfigurationHistory["before"]}));
  const current = {settings:settings ?? {},pointRules:rules,periods,examTypes:types};
  const manualScores = await tx.morningExamScore.findMany({where:{student:{divisionId},examType:{divisionId},examDate:{gte:from,lt:to}},select:{studentId:true,examTypeId:true,examDate:true,score:true}});
  await syncDbExamAttendance(tx,divisionId,current,history,includeManualMorningScores(source,manualScores.map(s=>({...s,examDate:ymd(s.examDate)!})),types),month,kstDate(),actorId);
  if(!config.enabled && !history.length) return {grantedCount:0,revokedCount:0};
  const result = reconcile(existing.map(r=>({...r,date:ymd(r.date)!,ruleId:r.ruleId!,notes:r.notes!})),buildVersionedExamPoints(current,history,source,month,kstDate()));
  if(result.remove.length) await tx.pointRecord.deleteMany({where:{student:{divisionId},id:{in:result.remove}}});
  if(result.create.length) await tx.pointRecord.createMany({data:result.create.map(r=>({...r,date:new Date(`${r.date}T00:00:00Z`),recordedById:actorId}))});
  return {grantedCount:result.create.length,revokedCount:result.remove.length};
}
export async function syncExamPoints(divisionSlug: string, date: string, actorId: string) {
  const month=date.slice(0,7);
  let result;
  if(isMockMode()) result=await updateMockState(state=>syncMockExamPoints(state,divisionSlug,month,actorId));
  else {
    const prisma=await getPrismaClient();
    const division=await prisma.division.findUniqueOrThrow({where:{slug:divisionSlug},select:{id:true}});
    result=await prisma.$transaction(tx=>syncDbExamPoints(tx,division.id,month,actorId),{timeout:30000});
  }
  revalidateDivisionOperationalViews(divisionSlug);
  return result;
}
