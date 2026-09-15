/** Run only against the disposable academy-template-db-qa PostgreSQL container. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { loadWithMocks } from "../tests/helpers/module-mocks";
import { commonAcademyTemplate } from "../lib/academy-template-presets";
import { kstDate } from "../lib/management-policy";
import { classifyAttendanceArrival } from "../lib/attendance-arrival";

async function main() {
  const url=new URL(process.env.DATABASE_URL ?? "");
  assert.equal(url.hostname,"127.0.0.1"); assert.equal(url.port,"5432"); assert.ok(["/academy_qa","/academy_migration_qa"].includes(url.pathname)); assert.equal(url.username,"academy_qa");
  const db=new PrismaClient();
  const loaded=loadWithMocks<typeof import("../lib/services/academy-template.service")>(path.resolve("lib/services/academy-template.service.ts"),{
    "@/lib/mock-data":{isMockMode:()=>false},
    "@/lib/service-helpers":{getPrismaClient:async()=>db,normalizeOptionalText:(value?:string|null)=>value?.trim()||null},
    "next/cache":{revalidateTag(){},revalidatePath(){},unstable_cache:(fn:unknown)=>fn},
    "@/lib/revalidation":{revalidateDivisionOperationalViews(){}},
  });
  const service=loaded.module;
  try {
    // On a fresh throwaway schema, recreate only the two empty new tables using the release migration.
    if (!await db.division.count()) {
      await db.$executeRawUnsafe('DROP TABLE study_hall.academy_configuration_applications, study_hall.academy_templates');
      const migration=readFileSync("prisma/migrations/20260915000000_academy_templates/migration.sql","utf8");
      await db.$transaction(async tx=>{
        await tx.$executeRawUnsafe('SET LOCAL search_path TO public');
        for(const sql of migration.split(";").map(s=>s.trim()).filter(Boolean)) await tx.$executeRawUnsafe(sql);
      });
    }
    const rls=await db.$queryRawUnsafe<{relrowsecurity:boolean}[]>("SELECT relrowsecurity FROM pg_class WHERE oid IN ('study_hall.academy_templates'::regclass,'study_hall.academy_configuration_applications'::regclass)");
    assert.equal(rls.length,2); assert.ok(rls.every(r=>r.relrowsecurity));
    const suffix=Date.now().toString(36), slugs=[`qa-a-${suffix}`,`qa-b-${suffix}`];
    const divisions=await Promise.all(slugs.map(slug=>db.division.create({data:{slug,name:slug,fullName:"템플릿 검증 학원",color:"#2455AA",settings:{create:{}}}})));
    const actor=await db.admin.create({data:{userId:`actor-${suffix}`,name:"검증 담당",role:"ADMIN",divisionId:divisions[0].id}});
    const today=kstDate(), tomorrow=new Date(Date.parse(today+"T00:00:00Z")+86400000).toISOString().slice(0,10);
    const yesterday=new Date(Date.parse(today+"T00:00:00Z")-86400000);
    const source=commonAcademyTemplate(today);
    source.rooms=[{id:"room-source",name:"학습실",columns:3,rows:2,aisleColumns:[],isActive:true,displayOrder:0}];
    source.seats=[{id:"seat-source",studyRoomId:"room-source",label:"A-01",positionX:1,positionY:1,isActive:true}];
    source.tuitionPlans=[{id:"fee-source",name:"한 달",durationDays:30,amount:100000,description:null,isActive:true,displayOrder:0}];
    source.paymentCategories=[{id:"payment-source",name:"등록비",isActive:true,displayOrder:0}];
    source.examTypes=[{id:"exam-source",name:"월간 모의고사",category:"REGULAR",studyTrack:null,isActive:true,displayOrder:0,subjects:[{id:"subject-source",name:"공통과목",isActive:true,displayOrder:0,totalItems:20,pointsPerItem:5,alternateGroup:null}]}];
    for(const slug of slugs){
      const value={name:"공통 사본",payload:source,effectiveFrom:today};
      const preview=await service.previewAcademyTemplate(slug,value);
      await service.applyAcademyTemplate(slug,{...value,revision:preview.revision},actor);
    }
    let a=(await service.getAcademyTemplateLibrary(slugs[0])).current;
    const b=(await service.getAcademyTemplateLibrary(slugs[1])).current;
    assert.notEqual(a.periods[0].id,b.periods[0].id); assert.notEqual(a.seats[0].id,b.seats[0].id);
    assert.equal(a.settings.tardyMinutes,b.settings.tardyMinutes);
    const saved=await service.saveAcademyTemplate(slugs[0],{name:"내 설정",payload:a},actor);
    assert.equal((await service.getAcademyTemplateLibrary(slugs[1])).templates.length,0);
    const student=await db.student.create({data:{divisionId:divisions[0].id,name:"가상 학생",studentNumber:"QA-0001",seatId:a.seats[0].id,tuitionPlanId:a.tuitionPlans[0].id,tuitionAmount:90000}});
    await db.attendance.create({data:{studentId:student.id,periodId:a.periods[0].id,date:yesterday,status:"PRESENT",recordedById:actor.id}});
    await db.pointRecord.create({data:{studentId:student.id,points:-2,date:yesterday,recordedById:actor.id}});
    await db.payment.create({data:{studentId:student.id,paymentTypeId:a.paymentCategories[0].id,amount:90000,paymentDate:yesterday,recordedById:actor.id}});
    await db.examScore.create({data:{studentId:student.id,examTypeId:a.examTypes[0].id,examRound:1,examDate:yesterday,scores:{[a.examTypes[0].subjects[0].id]:70},totalScore:70,recordedById:actor.id}});
    const ledgers = async () => {return {student:await db.student.findUnique({where:{id:student.id}}),attendance:await db.attendance.findMany({where:{studentId:student.id}}),points:await db.pointRecord.findMany({where:{studentId:student.id}}),payments:await db.payment.findMany({where:{studentId:student.id}}),scores:await db.examScore.findMany({where:{studentId:student.id}})};}
    const before=await ledgers();
    const invalid=structuredClone(a); invalid.seats[0].label="새 번호";
    await assert.rejects(()=>service.previewAcademyTemplate(slugs[0],{name:"배정 보호",payload:invalid,effectiveFrom:today}),/배정|좌석/);
    a.settings.tardyMinutes=30; a.tuitionPlans[0].amount=150000;
    const value={name:"자체 기준",payload:a,effectiveFrom:today};
    let preview=await service.previewAcademyTemplate(slugs[0],value);
    await service.applyAcademyTemplate(slugs[0],{...value,revision:preview.revision},actor);
    assert.deepEqual(await ledgers(),before);
    assert.deepEqual((await service.getAcademyTemplateLibrary(slugs[1])).current,b);
    assert.equal((await service.getAcademyTemplateLibrary(slugs[0])).templates.find(t=>t.id===saved.id)!.payload.settings.tardyMinutes,10);
    a=(await service.getAcademyTemplateLibrary(slugs[0])).current;
    const classify=(minutes:number)=>classifyAttendanceArrival({date:yesterday.toISOString().slice(0,10),arrivalTime:"09:15",periodStartTime:"09:00",periodEndTime:"10:00",tardyMinutes:minutes,lateArrivalPolicy:"threshold"}).status;
    assert.equal(classify(a.settings.tardyMinutes),"PRESENT"); assert.equal(classify(b.settings.tardyMinutes),"TARDY");
    a.settings.tardyMinutes=40;
    const reserve={name:"예약 기준",payload:a,effectiveFrom:tomorrow};
    preview=await service.previewAcademyTemplate(slugs[0],reserve);
    let pending=await service.applyAcademyTemplate(slugs[0],{...reserve,revision:preview.revision},actor);
    const previousPendingId = pending.id;
    const mergeDraft = (await service.getAcademyTemplateLibrary(slugs[0])).current;
    mergeDraft.settings.holidayLimit += 1;
    mergeDraft.periods.push({...mergeDraft.periods[0],id:"qa-add-period",name:"추가 자습",startTime:"22:01",endTime:"22:59",isMandatory:false,displayOrder:mergeDraft.periods.length});
    const merged = {name:"기존 메뉴에서 추가 예약",payload:mergeDraft,effectiveFrom:tomorrow,mergePending:true};
    preview=await service.previewAcademyTemplate(slugs[0],merged);
    pending=await service.applyAcademyTemplate(slugs[0],{...merged,revision:preview.revision},actor);
    const mergedRow=await service.getAcademyTemplateApplication(slugs[0],pending.id);
    assert.equal(mergedRow.after.settings.tardyMinutes,40);
    assert.equal(mergedRow.after.settings.holidayLimit,mergeDraft.settings.holidayLimit);
    assert.ok(mergedRow.after.periods.some(p=>p.name==="추가 자습"));
    assert.equal((await service.getAcademyTemplateLibrary(slugs[0])).applications.find(r=>r.id===previousPendingId)!.status,"CANCELLED");
    await assert.rejects(()=>service.getAcademyTemplateApplication(slugs[1],pending.id),/찾을 수/);
    await assert.rejects(()=>service.cancelAcademyTemplateApplication(slugs[1],pending.id),/찾을 수/);
    await service.applyDueAcademyTemplates(slugs[0],today);
    assert.equal((await service.getAcademyTemplateLibrary(slugs[0])).current.settings.tardyMinutes,30);
    await service.applyDueAcademyTemplates(slugs[0],tomorrow);
    assert.equal((await service.getAcademyTemplateLibrary(slugs[0])).current.settings.tardyMinutes,40);
    assert.deepEqual(await ledgers(),before);
    a=(await service.getAcademyTemplateLibrary(slugs[0])).current;a.settings.tardyMinutes=50;
    const stale={name:"동시 수정",payload:a,effectiveFrom:tomorrow};preview=await service.previewAcademyTemplate(slugs[0],stale);
    const raced=await service.applyAcademyTemplate(slugs[0],{...stale,revision:preview.revision},actor);
    await db.divisionSettings.update({where:{divisionId:divisions[0].id},data:{tardyMinutes:45}});
    await service.applyDueAcademyTemplates(slugs[0],tomorrow);
    assert.equal((await service.getAcademyTemplateLibrary(slugs[0])).applications.find(r=>r.id===raced.id)!.status,"REVIEW");
    assert.equal((await service.getAcademyTemplateLibrary(slugs[0])).current.settings.tardyMinutes,45);
    await service.cancelAcademyTemplateApplication(slugs[0],raced.id);
    const foreign=structuredClone(b);foreign.settings.tardyPointRuleId="another-academy-rule";
    await assert.rejects(()=>service.previewAcademyTemplate(slugs[1],{name:"외부 규칙",payload:foreign,effectiveFrom:today}));
    const rollback=structuredClone(b);rollback.examSchedules=[{id:"schedule-rollback",name:"검증 시험",type:"WRITTEN",examDate:today,description:null,isActive:true}];
    const failed={name:"트랜잭션 검증",payload:rollback,effectiveFrom:today};preview=await service.previewAcademyTemplate(slugs[1],failed);
    await assert.rejects(()=>service.applyAcademyTemplate(slugs[1],{...failed,revision:preview.revision},{id:"nonexistent-actor",name:"invalid"}));
    assert.deepEqual((await service.getAcademyTemplateLibrary(slugs[1])).current,b);
    console.log("PASS PostgreSQL: migration/RLS, independent copies+calculations, unchanged ledgers, assigned seats, reservation dates+multi-form merging, stale revision, cross-academy access, full transaction rollback");
  } finally {loaded.restore();await db.$disconnect();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
