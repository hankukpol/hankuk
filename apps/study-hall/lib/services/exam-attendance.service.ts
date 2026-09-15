import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { configurationForDate } from "@/lib/academy-configuration-history";
import { desiredExamAttendance, examAttendancePeriod } from "@/lib/exam-attendance";
import type { ExamPointSource } from "@/lib/exam-point-automation";
import type { ExamConfigurationHistory } from "@/lib/versioned-exam-points";
import type { readMockState } from "@/lib/mock-store";

const SOURCE = "MORNING_GRADING";
type Configuration = ExamConfigurationHistory["before"];
type Existing = {id:string;studentId:string;periodId:string;date:string;status:string;examAutoSource?:string|null};
function plan(current:Configuration, history:ExamConfigurationHistory[], source:ExamPointSource, existing:Existing[], month:string, today:string) {
  const days = new Set([...source.sessions.map(s=>s.examDate),...existing.filter(a=>a.examAutoSource===SOURCE).map(a=>a.date)]);
  const create:{studentId:string;periodId:string;date:string}[]=[];
  const remove:string[]=[];
  for(const date of Array.from(days)) {
    if(!date.startsWith(month) || date>today) continue;
    const configuration=configurationForDate(current,history,date);
    const periodId=examAttendancePeriod(configuration.settings,date);
    // Disabling automation never erases historical operating records.
    if(!periodId || !configuration.periods.some(p=>p.id===periodId && p.isActive !== false)) continue;
    const attended=desiredExamAttendance(source,date);
    for(const record of existing.filter(a=>a.date===date && a.periodId===periodId)) {
      if(record.examAutoSource===SOURCE && record.status==="PRESENT" && !attended.has(record.studentId)) remove.push(record.id);
    }
    for(const studentId of Array.from(attended)) {
      // All saved manual states, including approved leave and absence, win.
      if(!existing.some(a=>a.date===date && a.periodId===periodId && a.studentId===studentId)) create.push({studentId,periodId,date});
    }
  }
  return {create,remove};
}
export function syncMockExamAttendance(state:Awaited<ReturnType<typeof readMockState>>,slug:string,current:Configuration,history:ExamConfigurationHistory[],source:ExamPointSource,month:string,today:string,actorId:string) {
  const existing=state.attendanceByDivision[slug]??[];
  const changes=plan(current,history,source,existing,month,today);
  const remove=new Set(changes.remove), now=new Date().toISOString();
  state.attendanceByDivision[slug]=[...existing.filter(a=>!remove.has(a.id)),...changes.create.map(a=>({...a,id:randomUUID(),status:"PRESENT" as const,reason:null,checkInTime:null,examAutoSource:SOURCE,recordedById:actorId,createdAt:now,updatedAt:now}))];
}
export async function syncDbExamAttendance(tx:Prisma.TransactionClient,divisionId:string,current:Configuration,history:ExamConfigurationHistory[],source:ExamPointSource,month:string,today:string,actorId:string) {
  const from=new Date(`${month}-01T00:00:00Z`), to=new Date(from);to.setUTCMonth(to.getUTCMonth()+1);
  const existing=await tx.attendance.findMany({where:{student:{divisionId},period:{divisionId},date:{gte:from,lt:to}}});
  const changes=plan(current,history,source,existing.map(a=>({...a,date:a.date.toISOString().slice(0,10)})),month,today);
  if(changes.remove.length) await tx.attendance.deleteMany({where:{id:{in:changes.remove},student:{divisionId},examAutoSource:SOURCE,status:"PRESENT"}});
  if(changes.create.length) await tx.attendance.createMany({data:changes.create.map(a=>({...a,date:new Date(`${a.date}T00:00:00Z`),status:"PRESENT" as const,examAutoSource:SOURCE,recordedById:actorId})),skipDuplicates:true});
}
