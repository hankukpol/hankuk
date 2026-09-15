import { createAcademyPolicyDraft } from "../lib/academy-policy-settings";
/** Disposable local PostgreSQL only. Never reads production env files. */
import assert from "node:assert/strict";
import path from "node:path";
import { PrismaClient, type Prisma } from "@prisma/client";
import { loadWithMocks } from "../tests/helpers/module-mocks";
import { correctionFixture } from "../tests/exam-correction.test";
import { derivedScoreSnapshot } from "../lib/exam-import-history";
import { examPointAutomationSchema } from "../lib/exam-point-automation";

async function main(){
  const url=new URL(process.env.DATABASE_URL??"");
  assert.equal(url.hostname,"127.0.0.1");assert.equal(url.port,"5432");assert.equal(url.pathname,"/academy_qa");assert.equal(url.username,"academy_qa");
  const db=new PrismaClient(),prefix=`correction-${Date.now()}`;
  const loaded=loadWithMocks<typeof import("../lib/services/exam-correction.service")>(path.resolve("lib/services/exam-correction.service.ts"),{
    "@/lib/mock-data":{isMockMode:()=>false},
    "@/lib/service-helpers":{getPrismaClient:async()=>db,getDivisionBySlugOrThrow:async(slug:string)=>db.division.findUniqueOrThrow({where:{slug}})},
    "next/cache":{revalidateTag(){},revalidatePath(){},unstable_cache:(fn:unknown)=>fn},
    "@/lib/revalidation":{revalidateDivisionOperationalViews(){}},
  });
  try {
    const divisions=await Promise.all(["a","b"].map(s=>db.division.create({data:{slug:`${prefix}-${s}`,name:"정정 검증",fullName:"로컬 테스트",color:"#2455AA",settings:{create:{}}}})));
    for(const [index,division] of Array.from(divisions.entries())) {
      const f=correctionFixture(index===0),sid=(s:string)=>`${division.id}-${s}`;
      const actor=await db.admin.create({data:{userId:sid("user"),name:"정정 담당",role:"ADMIN",divisionId:division.id}});
      const type=await db.examType.create({data:{id:sid("type"),divisionId:division.id,name:"정정 검증 시험",category:index===0?"MORNING":"REGULAR",subjects:{create:{id:sid("sub"),name:"검증 과목",totalItems:2,pointsPerItem:5}}}});
      for(const student of f.students) await db.student.create({data:{id:sid(student.id),divisionId:division.id,name:student.name,studentNumber:student.studentNumber,courseStartDate:new Date("2026-01-01")}});
      const rule=await db.pointRule.create({data:{divisionId:division.id,name:"미응시",category:"시험",points:index===0?-1:-5}});
      await db.divisionSettings.update({where:{divisionId:division.id},data:{examPointAutomation:examPointAutomationSchema.parse({enabled:true,effectiveFrom:"2026-09-01",morningStartDate:"2026-09-01",morningWeekdays:[1,2,3,4,5],morningAbsenceRuleId:rule.id}) as unknown as Prisma.InputJsonValue}});
      const examPeriod=await db.period.create({data:{divisionId:division.id,name:"아침시험",startTime:"08:00",endTime:"08:30",displayOrder:0,isActive:true,isMandatory:false}});
      if(index===0) {
        const policy={...createAcademyPolicyDraft("2026-09-01",[examPeriod]),enabled:true,optionalEnrollments:[],morningExam:{periodId:examPeriod.id,weekdays:[1,2,3,4,5],syncAttendance:true}};
        await db.divisionSettings.update({where:{divisionId:division.id},data:{managementPolicy:policy as unknown as Prisma.InputJsonValue}});
      }
      const primarySubjectId=index===0?sid("sub"):null;
      await db.examSession.create({data:{...f.session,id:sid("session"),divisionId:division.id,examTypeId:type.id,primarySubjectId,identityKey:primarySubjectId?`morning:${primarySubjectId}:2026-09-14`:"regular:2026-09-14",importedById:actor.id,importedAt:new Date(f.session.importedAt),examDate:new Date("2026-09-14")}});
      await db.examSessionItem.createMany({data:f.items.map(i=>({...i,id:sid(i.id),sessionId:sid("session"),divisionId:division.id,subjectId:sid("sub")}))});
      for(const old of f.scores) {
        const base={id:sid(old.id),studentId:sid(old.studentId),examTypeId:type.id,examDate:new Date("2026-09-14"),notes:null,recordedById:actor.id,createdAt:new Date(old.createdAt),updatedAt:new Date(old.updatedAt!)};
        const record=index===0?await db.morningExamScore.create({data:{...base,subjectId:sid("sub"),score:5,weekNumber:38,weekYear:2026}}):await db.examScore.create({data:{...base,examRound:20260914,scores:{[sid("sub")]:5},totalScore:5,rankInClass:1}});
        const p=f.participants.find(p=>p.studentId===old.studentId)!;
        await db.examSessionParticipant.create({data:{...p,id:sid(p.id),studentId:sid(p.studentId),sessionId:sid("session"),divisionId:division.id,subjectScores:{[sid("sub")]:5},derivedScoreId:record.id,derivedScoreSnapshot:derivedScoreSnapshot(record) as Prisma.InputJsonValue}});
      }
      await db.examItemResponse.createMany({data:f.responses.map(r=>({...r,id:sid(r.id),studentId:sid(r.studentId),sessionId:sid("session"),divisionId:division.id,subjectId:sid("sub")}))});
      const actorSession={id:actor.id,role:"ADMIN" as const,divisionId:division.id};
      const initial=await loaded.module.getExamCorrection(division.slug,actorSession,sid("session"));
      const input={revision:initial.revision,studentId:sid("a"),targetStudentId:sid("c"),reason:"수험번호·채점 정정",responses:initial.bundle.responses.filter(r=>r.studentId===sid("a")).map(({subjectId,itemNo,answer})=>({subjectId,itemNo,answer,isCorrect:true}))};
      await assert.rejects(loaded.module.saveExamCorrection(division.slug,{...actorSession,divisionId:divisions[1-index].id},sid("session"),input),/관리자/);
      await assert.rejects(loaded.module.saveExamCorrection(division.slug,actorSession,sid("session"),{...input,targetStudentId:sid("b")}),/이미/);
      const result=await loaded.module.saveExamCorrection(division.slug,actorSession,sid("session"),input);
      const next=await loaded.module.getExamCorrection(division.slug,actorSession,sid("session"));
      assert.equal(next.history.length,1);assert.equal(next.history[0].before.studentId,sid("a"));assert.equal(next.history[0].after.studentId,sid("c"));
      assert.equal(next.bundle.participants.find(p=>p.studentId===sid("c"))?.totalScore,10);
      assert.equal(next.bundle.scores.find(s=>s.studentId===sid("c"))?.[index===0?"score":"totalScore"],10);
      assert.ok(next.bundle.responses.every(r=>r.studentId!==sid("a")));
      if(index===0){assert.equal(result.grantedCount,1);const points=await db.pointRecord.findMany({where:{student:{divisionId:division.id}}});assert.equal(points[0].studentId,sid("a"));assert.equal(points[0].points,-1); const attendance=await db.attendance.findMany({where:{student:{divisionId:division.id}}});assert.ok(attendance.some(a=>a.studentId===sid("c") && a.status==="PRESENT" && a.examAutoSource==="MORNING_GRADING"));assert.ok(!attendance.some(a=>a.studentId===sid("a")));}
      await assert.rejects(loaded.module.saveExamCorrection(division.slug,actorSession,sid("session"),input),/다른 작업/);
      const corrected=next.bundle.responses.filter(r=>r.studentId===sid("c")).map(({subjectId,itemNo,answer,isCorrect})=>({subjectId,itemNo,answer,isCorrect}));
      const attempts=await Promise.allSettled(["첫 정정","동시 정정"].map(reason=>loaded.module.saveExamCorrection(division.slug,actorSession,sid("session"),{...input,revision:next.revision,studentId:sid("c"),targetStudentId:sid("a"),reason,responses:corrected})));
      assert.equal(attempts.filter(r=>r.status==="fulfilled").length,1);
      assert.equal(await db.examCorrection.count({where:{divisionId:division.id}}),2);
      console.log(`PASS ${index===0?"morning":"regular"}: identity, grading, audit, tenant denial, duplicate, concurrency, points`);
    }
  }finally{loaded.restore();await db.$disconnect();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
