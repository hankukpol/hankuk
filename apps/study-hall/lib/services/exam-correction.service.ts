import { randomUUID } from "node:crypto";
import { revalidateTag } from "next/cache";
import type { Prisma } from "@prisma/client";
import type { AdminSession } from "@/lib/auth";
import { isMockMode } from "@/lib/mock-data";
import { readMockState, updateMockState } from "@/lib/mock-store";
import { getPrismaClient, getDivisionBySlugOrThrow } from "@/lib/service-helpers";
import { forbidden, notFound } from "@/lib/errors";
import { revalidateDivisionOperationalViews } from "@/lib/revalidation";
import { syncDbExamPoints, syncMockExamPoints } from "./exam-point.service";
import { correctionRevision, prepareExamCorrection, examCorrectionSchema, type CorrectionBundle, type CorrectionAudit } from "@/lib/exam-correction";
import { examDateString } from "@/lib/exam-import-history";

type Actor=Pick<AdminSession,"id"|"role"|"divisionId">;
type State=Awaited<ReturnType<typeof readMockState>>;
function authorize(actor:Actor,divisionId:string) {
  if(actor.role!=="SUPER_ADMIN" && (actor.role!=="ADMIN" || actor.divisionId!==divisionId)) throw forbidden("관리자만 성적을 정정할 수 있습니다.");
}
function mockBundle(state:State,slug:string,id:string,actor:Actor):CorrectionBundle {
  const division=state.divisions.find(d=>d.slug===slug);
  if(!division) throw notFound("학원을 찾을 수 없습니다.");
  authorize(actor,division.id);
  const session=(state.examSessionsByDivision[slug]??[]).find(s=>s.id===id && s.divisionId===division.id);
  if(!session) throw notFound("시험을 찾을 수 없습니다.");
  const scoped=<T extends {sessionId:string;divisionId:string}>(rows:T[])=>rows.filter(r=>r.sessionId===id && r.divisionId===division.id);
  const scores=session.primarySubjectId ? state.morningExamScoresByDivision[slug]??[] : state.examScoresByDivision[slug]??[];
  return {session,participants:scoped(state.examSessionParticipantsByDivision[slug]??[]),items:scoped(state.examSessionItemsByDivision[slug]??[]),responses:scoped(state.examItemResponsesByDivision[slug]??[]),
    scores:scores.filter(s=>s.examTypeId===session.examTypeId && examDateString(s.examDate)===session.examDate && (!session.primarySubjectId || ("subjectId" in s && s.subjectId===session.primarySubjectId))),
    students:(state.studentsByDivision[slug]??[]).map(({id,name,studentNumber})=>({id,name,studentNumber})),subjects:state.examTypesByDivision[slug]?.find(t=>t.id===session.examTypeId)?.subjects ?? []};
}
async function dbBundle(tx:Prisma.TransactionClient,divisionId:string,id:string):Promise<CorrectionBundle> {
  const session=await tx.examSession.findFirst({where:{id,divisionId}});
  if(!session) throw notFound("시험을 찾을 수 없습니다.");
  const where={divisionId,sessionId:id};
  const scoreWhere={examTypeId:session.examTypeId,examDate:session.examDate,student:{divisionId}};
  const [participants,items,responses,scores,students,subjects]=await Promise.all([
    tx.examSessionParticipant.findMany({where}),tx.examSessionItem.findMany({where}),tx.examItemResponse.findMany({where}),
    session.primarySubjectId ? tx.morningExamScore.findMany({where:{...scoreWhere,subjectId:session.primarySubjectId}}) : tx.examScore.findMany({where:scoreWhere}),
    tx.student.findMany({where:{divisionId},select:{id:true,name:true,studentNumber:true}}),
    tx.examSubject.findMany({where:{examTypeId:session.examTypeId,examType:{divisionId}},select:{id:true,name:true}}),
  ]);
  return JSON.parse(JSON.stringify({session:{...session,examDate:examDateString(session.examDate)},participants,items,responses,scores,students,subjects})) as CorrectionBundle;
}
export async function getExamCorrection(slug:string,actor:Actor,id:string) {
  if(isMockMode()) {
    const state=await readMockState(),bundle=mockBundle(state,slug,id,actor);
    return {bundle,revision:correctionRevision(bundle),history:(state.examCorrections??[]).filter(h=>h.divisionId===bundle.session.divisionId && h.examTypeId===bundle.session.examTypeId && h.examDate===bundle.session.examDate).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))};
  }
  const division=await getDivisionBySlugOrThrow(slug); authorize(actor,division.id);
  const prisma=await getPrismaClient();
  return prisma.$transaction(async tx=>{
    const bundle=await dbBundle(tx,division.id,id);
    const history=await tx.examCorrection.findMany({where:{divisionId:division.id,examTypeId:bundle.session.examTypeId,examDate:bundle.session.examDate},orderBy:{createdAt:"desc"}});
    return {bundle,revision:correctionRevision(bundle),history:JSON.parse(JSON.stringify(history)) as CorrectionAudit[]};
  },{isolationLevel:"RepeatableRead"});
}
export async function saveExamCorrection(slug:string,actor:Actor,id:string,raw:unknown) {
  const input=examCorrectionSchema.parse(raw),now=new Date().toISOString();
  const audit=(bundle:CorrectionBundle,plan:ReturnType<typeof prepareExamCorrection>,actorName:string):CorrectionAudit=>({id:randomUUID(),divisionId:bundle.session.divisionId,sessionId:id,examTypeId:bundle.session.examTypeId,examDate:bundle.session.examDate,actorId:actor.id,actorName,reason:input.reason,createdAt:now,before:plan.before,after:plan.after});
  let result;
  if(isMockMode()) {
    result=await updateMockState(state=>{
      const bundle=mockBundle(state,slug,id,actor),plan=prepareExamCorrection(bundle,input,actor.id,now);
      state.examSessionParticipantsByDivision[slug]=[...state.examSessionParticipantsByDivision[slug].filter(p=>p.sessionId!==id),...plan.participants];
      state.examItemResponsesByDivision[slug]=[...state.examItemResponsesByDivision[slug].filter(p=>p.sessionId!==id),...plan.responses];
      const ids=new Set(plan.scores.map(s=>s.id));
      if(bundle.session.primarySubjectId) state.morningExamScoresByDivision[slug]=[...state.morningExamScoresByDivision[slug].filter(s=>!ids.has(s.id)),...plan.scores] as State["morningExamScoresByDivision"][string];
      else state.examScoresByDivision[slug]=[...state.examScoresByDivision[slug].filter(s=>!ids.has(s.id)),...plan.scores] as State["examScoresByDivision"][string];
      const record=audit(bundle,plan,state.admins.find(a=>a.id===actor.id)?.name ?? actor.id);
      state.examCorrections=[...(state.examCorrections??[]),record];
      return {id:record.id,...syncMockExamPoints(state,slug,bundle.session.examDate.slice(0,7),actor.id)};
    });
  } else {
    const division=await getDivisionBySlugOrThrow(slug); authorize(actor,division.id);
    const prisma=await getPrismaClient();
    result=await prisma.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`exam-points:${division.id}`}))`;
      const bundle=await dbBundle(tx,division.id,id),plan=prepareExamCorrection(bundle,input,actor.id,now);
      // Remove dependent responses before changing participant identity (composite FK).
      await tx.examItemResponse.deleteMany({where:{divisionId:division.id,sessionId:id,studentId:input.studentId}});
      for(const p of plan.participants) {
        await tx.examSessionParticipant.update({where:{id:p.id},data:{studentId:p.studentId,subjectScores:p.subjectScores,totalScore:p.totalScore,externalRank:p.externalRank,regionalRank:p.regionalRank,externalPercentile:p.externalPercentile,derivedScoreSnapshot:p.derivedScoreSnapshot as Prisma.InputJsonValue}});
      }
      const rows=plan.responses.filter(r=>r.studentId===input.targetStudentId);
      if(rows.length) await tx.examItemResponse.createMany({data:rows});
      for(const s of plan.scores) {
        const base={studentId:s.studentId,recordedById:s.recordedById,updatedAt:new Date(s.updatedAt!)};
        if(bundle.session.primarySubjectId) await tx.morningExamScore.update({where:{id:s.id},data:{...base,score:s.score}});
        else await tx.examScore.update({where:{id:s.id},data:{...base,scores:s.scores as Prisma.InputJsonValue,totalScore:s.totalScore,rankInClass:s.rankInClass}});
      }
      const admin=await tx.admin.findUnique({where:{id:actor.id},select:{name:true}});
      const record=audit(bundle,plan,admin?.name ?? actor.id);
      await tx.examCorrection.create({data:{...record,createdAt:new Date(now),before:record.before as unknown as Prisma.InputJsonValue,after:record.after as unknown as Prisma.InputJsonValue}});
      return {id:record.id,...await syncDbExamPoints(tx,division.id,bundle.session.examDate.slice(0,7),actor.id)};
    },{timeout:30000});
  }
  revalidateTag(`exam-analysis:${slug}`); revalidateDivisionOperationalViews(slug);
  return result;
}
