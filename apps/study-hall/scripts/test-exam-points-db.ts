import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PrismaClient, Prisma } from "@prisma/client";
import ts from "typescript";
import * as calculator from "../lib/exam-point-automation";
import * as policy from "../lib/management-policy";
import * as errors from "../lib/errors";

const target=new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(target.hostname,"study-hall-fix-postgres"); assert.equal(target.pathname,"/fix_review"); assert.equal(process.env.MOCK_MODE,"false");
const prisma=new PrismaClient();
const dependencies:Record<string,unknown>={
  "node:crypto":{randomUUID},"@/lib/exam-point-automation":calculator,
  "@/lib/management-policy":{...policy,kstDate:()=>"2026-09-14"},
  "@/lib/mock-data":{isMockMode:()=>false},"@/lib/mock-store":{},
  "@/lib/errors":errors,"@/lib/revalidation":{revalidateDivisionOperationalViews(){}},
  "@/lib/services/settings-history.service":{recordDivisionSettingsChange:async()=>{}},
  "@/lib/service-helpers":{getPrismaClient:async()=>prisma,getDivisionBySlugOrThrow:async(slug:string)=>prisma.division.findUniqueOrThrow({where:{slug}})},
};
function load<T>(name:string):T {
  const code=ts.transpileModule(readFileSync(`lib/services/${name}.service.ts`,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module={exports:{}};
  new Function("require","module","exports",code)((id:string)=>{assert.ok(id in dependencies,id);return dependencies[id];},module,module.exports);
  return module.exports as T;
}
async function main() {
  const points=load<typeof import("../lib/services/exam-point.service")>("exam-point");
  dependencies["@/lib/services/exam-point.service"]=points;
  const settings=load<typeof import("../lib/services/exam-point-settings.service")>("exam-point-settings");
  const fixtures=[];
  for(const amount of [-1,-5]) {
    const division=await prisma.division.create({data:{slug:`exam-review-${randomUUID()}`,name:"검증 학원",fullName:"격리 검증 학원",color:"#123456"}});
    const actor=await prisma.admin.create({data:{userId:randomUUID(),divisionId:division.id,role:"ADMIN",name:"검증 관리자"}});
    const student=await prisma.student.create({data:{divisionId:division.id,name:"응시",studentNumber:"same-number",courseStartDate:new Date("2026-01-01")}});
    const absent=await prisma.student.create({data:{divisionId:division.id,name:"미응시",studentNumber:"absent",courseStartDate:new Date("2026-01-01")}});
    const absenceRule=await prisma.pointRule.create({data:{divisionId:division.id,name:"미응시",category:"EXAM",points:amount}});
    const firstRule=await prisma.pointRule.create({data:{divisionId:division.id,name:"1등",category:"EXAM",points:3}});
    const examType=await prisma.examType.create({data:{divisionId:division.id,name:"아침",category:"MORNING"}});
    const session=await prisma.examSession.create({data:{divisionId:division.id,examTypeId:examType.id,identityKey:"2026-09-14",examDate:new Date("2026-09-14"),itemCount:20,fullScore:100,externalCohortSize:100,externalStats:{},sourceFileName:"fixture.xls",importedById:actor.id}});
    await prisma.examSessionParticipant.create({data:{divisionId:division.id,sessionId:session.id,studentId:student.id,totalScore:80,subjectScores:{},externalRank:50}});
    const config=calculator.examPointAutomationSchema.parse({enabled:true,effectiveFrom:"2026-09-14",morningStartDate:"2026-09-14",morningWeekdays:[1],morningAbsenceRuleId:absenceRule.id,morningFirstRuleId:firstRule.id});
    await settings.updateExamPointSettings(division.slug,config,actor);
    assert.deepEqual((await prisma.pointRecord.findMany({where:{student:{divisionId:division.id}},orderBy:{points:"asc"}})).map(r=>r.points),[amount,3]);
    fixtures.push({division,actor,student,absent,absenceRule,firstRule,session,config});
  }
  const [own,foreign]=fixtures;
  const ids=(await prisma.pointRecord.findMany({where:{student:{divisionId:own.division.id}}})).map(r=>r.id).sort();
  await Promise.all([points.syncExamPoints(own.division.slug,"2026-09-14",own.actor.id),points.syncExamPoints(own.division.slug,"2026-09-14",own.actor.id)]);
  assert.deepEqual((await prisma.pointRecord.findMany({where:{student:{divisionId:own.division.id}}})).map(r=>r.id).sort(),ids);
  await assert.rejects(settings.updateExamPointSettings(own.division.slug,{...own.config,morningAbsenceRuleId:foreign.absenceRule.id},own.actor),/현재 학원/);
  assert.equal((await settings.getExamPointSettings(own.division.slug)).config.morningAbsenceRuleId,own.absenceRule.id);
  await settings.updateExamPointSettings(own.division.slug,{...own.config,morningWeekdays:[2,4]},own.actor);
  assert.equal(await prisma.pointRecord.count({where:{student:{divisionId:own.division.id}}}),0);
  assert.equal(await prisma.pointRecord.count({where:{student:{divisionId:foreign.division.id}}}),2);
  await settings.updateExamPointSettings(own.division.slug,own.config,own.actor);
  const period=await prisma.period.create({data:{divisionId:own.division.id,name:"1교시",startTime:"09:00",endTime:"10:00",displayOrder:1}});
  await prisma.attendance.create({data:{studentId:own.absent.id,periodId:period.id,date:new Date("2026-09-14"),status:"EXCUSED",reason:"수업: 기본이론",recordedById:own.actor.id}});
  await points.syncExamPoints(own.division.slug,"2026-09-14",own.actor.id);
  assert.equal(await prisma.pointRecord.count({where:{studentId:own.absent.id}}),0);
  // Verify the importing transaction rolls back both grades and calculated points on a later failure.
  await assert.rejects(prisma.$transaction(async tx=>{
    await tx.examSessionParticipant.deleteMany({where:{divisionId:own.division.id,sessionId:own.session.id}});
    await tx.examSession.deleteMany({where:{id:own.session.id,divisionId:own.division.id}});
    await points.syncDbExamPoints(tx,own.division.id,"2026-09",own.actor.id);
    throw new Error("injected rollback");
  }),/injected rollback/);
  assert.ok(await prisma.examSession.findUnique({where:{id:own.session.id}}));
  assert.equal(await prisma.pointRecord.count({where:{studentId:own.student.id}}),1);
  await prisma.$transaction(async tx=>{
    await tx.examSessionParticipant.deleteMany({where:{divisionId:own.division.id,sessionId:own.session.id}});
    await tx.examSession.deleteMany({where:{id:own.session.id,divisionId:own.division.id}});
    await points.syncDbExamPoints(tx,own.division.id,"2026-09",own.actor.id);
  });
  assert.equal(await prisma.pointRecord.count({where:{student:{divisionId:own.division.id}}}),0);
  console.log("PASS PostgreSQL: independent academy calendars/amounts, own ranks, concurrent idempotency, settings reconciliation, class exemption, atomic deletion/rollback");
}
main().finally(()=>prisma.$disconnect()).catch(error=>{console.error(error);process.exitCode=1;});
