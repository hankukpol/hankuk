import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { loadWithMocks } from "./helpers/module-mocks";
import { kstDate } from "../lib/management-policy";
import { commonAcademyTemplate } from "../lib/academy-template-presets";
type Store = typeof import("../lib/mock-store");
type Service = typeof import("../lib/services/academy-template.service");
const root = process.cwd();
async function fixture(t: TestContext) {
  const directory=await mkdtemp(path.join(tmpdir(),"academy-template-test-")), previous=process.cwd(), oldMockDir=process.env.MOCK_DB_DIR;
  let loaded:ReturnType<typeof loadWithMocks<Store>>;
  try { process.env.MOCK_DB_DIR=directory; process.chdir(directory); loaded=loadWithMocks<Store>(path.join(root,"lib/mock-store.ts"),{}); }
  finally { process.chdir(previous); if(oldMockDir===undefined) delete process.env.MOCK_DB_DIR; else process.env.MOCK_DB_DIR=oldMockDir; }
  const store=loaded.module;
  delete require.cache[require.resolve(path.join(root,"lib/services/academy-configuration-history.service.ts"))];
  const {module:service,restore}=loadWithMocks<Service>(path.join(root,"lib/services/academy-template.service.ts"),{
    "@/lib/mock-data":{isMockMode:()=>true},
    "@/lib/mock-store":store,
    "next/cache":{revalidateTag(){},revalidatePath(){},unstable_cache:(fn:unknown)=>fn},
    "@/lib/revalidation":{revalidateDivisionOperationalViews(){}},
    "@/lib/service-helpers":{normalizeOptionalText:(value?:string|null)=>value?.trim()||null,getPrismaClient(){throw new Error("Operating DB must not be called");}},
  });
  t.after(async()=>{restore();loaded.restore();await rm(directory,{recursive:true,force:true});});
  await store.readMockState();
  await store.updateMockState(state=>{
    for(const slug of ["police","fire"]) {
      const base=commonAcademyTemplate(kstDate(),true);
      Object.assign(state.divisionSettingsByDivision[slug],base.settings,{managementPolicy:null});
      state.periodsByDivision[slug]=[];state.pointRulesByDivision[slug]=[];state.studyRoomsByDivision[slug]=[];state.seatsByDivision[slug]=[];
      state.tuitionPlansByDivision[slug]=[];state.paymentCategoriesByDivision[slug]=[];state.examTypesByDivision[slug]=[];state.examSchedulesByDivision[slug]=[];
      state.studentsByDivision[slug]=state.studentsByDivision[slug].map(s=>({...s,seatId:null}));
    }
  });
  const actor={id:"mock-admin-police",name:"검증 관리자"};
  return {store,service,actor};
}
test("save, preview and apply preserve students and all operating ledgers; source copies remain independent",async t=>{
  const f=await fixture(t), before=await f.store.readMockState();
  const source=commonAcademyTemplate(kstDate());
  await f.service.saveAcademyTemplate("police",{name:"우리 학원",payload:source},f.actor);
  const preview=await f.service.previewAcademyTemplate("police",{name:"우리 학원",payload:source,effectiveFrom:kstDate()});
  assert.ok(preview.changes.length);
  await f.service.applyAcademyTemplate("police",{name:"우리 학원",payload:source,effectiveFrom:kstDate(),revision:preview.revision},f.actor);
  const after=await f.store.readMockState();
  for(const key of ["studentsByDivision","attendanceByDivision","pointRecordsByDivision","paymentRecordsByDivision","examScoresByDivision","morningExamScoresByDivision"] as const) assert.deepEqual(after[key],before[key]);
  assert.deepEqual(after.divisionSettingsByDivision.fire,before.divisionSettingsByDivision.fire);
  assert.notEqual(after.periodsByDivision.police[0].id,source.periods[0].id);
  const current=(await f.service.getAcademyTemplateLibrary("police")).current;
  current.settings.tardyMinutes=25;
  assert.equal((await f.service.getAcademyTemplateLibrary("police")).templates[0].payload.settings.tardyMinutes,10);
  assert.equal((await f.service.getAcademyTemplateLibrary("fire")).templates.length,0);
  assert.equal(after.academyApplications[0].status,"APPLIED");
});
test("preview is invalidated by another configuration change and an academy cannot cancel another academy's reservation",async t=>{
  const f=await fixture(t),payload=commonAcademyTemplate(kstDate());
  const tomorrow=new Date(Date.parse(kstDate()+"T00:00:00Z")+86400000).toISOString().slice(0,10);
  const value={name:"예약",payload,effectiveFrom:tomorrow};
  const preview=await f.service.previewAcademyTemplate("police",value);
  await f.store.updateMockState(state=>{state.divisionSettingsByDivision.police.holidayLimit=2;});
  await assert.rejects(f.service.applyAcademyTemplate("police",{...value,revision:preview.revision},f.actor),/미리보기/);
  const fresh=await f.service.previewAcademyTemplate("police",value);
  const applied=await f.service.applyAcademyTemplate("police",{...value,revision:fresh.revision},f.actor);
  await assert.rejects(f.service.cancelAcademyTemplateApplication("fire",applied.id),/찾을/);
  assert.equal((await f.store.readMockState()).academyApplications[0].status,"PENDING");
  await f.service.applyDueAcademyTemplates("police",tomorrow);
  assert.equal((await f.store.readMockState()).academyApplications[0].status,"APPLIED");
});
test("a future configuration never overwrites changes made after scheduling",async t=>{
  const f=await fixture(t),payload=commonAcademyTemplate(kstDate());
  const tomorrow=new Date(Date.parse(kstDate()+"T00:00:00Z")+86400000).toISOString().slice(0,10),value={name:"예약",payload,effectiveFrom:tomorrow};
  const preview=await f.service.previewAcademyTemplate("police",value);
  await f.service.applyAcademyTemplate("police",{...value,revision:preview.revision},f.actor);
  await f.store.updateMockState(state=>{state.divisionSettingsByDivision.police.holidayLimit=3;});
  await f.service.applyDueAcademyTemplates("police",tomorrow);
  const state=await f.store.readMockState();
  assert.equal(state.divisionSettingsByDivision.police.holidayLimit,3);
  assert.equal(state.academyApplications[0].status,"REVIEW");
});


test("today and past application dates remain available with operating records",async t=>{
  const f=await fixture(t);
  const current=(await f.service.getAcademyTemplateLibrary("police")).current;
  await f.store.updateMockState(state=>{state.pointRecordsByDivision.police.push({id:"same-day-test",studentId:state.studentsByDivision.police[0].id,ruleId:null,points:-1,date:kstDate()+"T09:00:00+09:00",notes:"검증",recordedById:f.actor.id,createdAt:new Date().toISOString()});});
  current.settings.tardyMinutes=30;
  assert.ok((await f.service.previewAcademyTemplate("police",{name:"현재 기록 보존",payload:current,effectiveFrom:kstDate()})).changes.length);
  const library=await f.service.getAcademyTemplateLibrary("police");
  assert.equal(library.earliestCalculationDate,kstDate());
  const preview=await f.service.previewAcademyTemplate("police",{name:"예약",payload:current,effectiveFrom:library.earliestCalculationDate});
  assert.ok(preview.changes.length);
});


test("separate existing forms merge same-date reservations and stale previews cannot replace them",async t=>{
  const f=await fixture(t), initial=(await f.service.getAcademyTemplateLibrary("police")).current;
  const date=new Date(Date.parse(kstDate()+"T00:00:00Z")+86400000).toISOString().slice(0,10);
  async function preview(payload:typeof initial) {return f.service.previewAcademyTemplate("police",{name:"기존 메뉴 변경",payload,effectiveFrom:date,mergePending:true});}
  async function apply(payload:typeof initial, revision:string) {return f.service.applyAcademyTemplate("police",{name:"기존 메뉴 변경",payload,effectiveFrom:date,mergePending:true,revision},f.actor);}
  const rules=structuredClone(initial);rules.settings.tardyMinutes=25;
  const first=await preview(rules);await apply(rules,first.revision);
  const periods=structuredClone(initial);periods.periods.push({id:"new-period",name:"오전",label:null,startTime:"09:00",endTime:"10:00",isMandatory:true,isActive:true,displayOrder:0});
  const second=await preview(periods);assert.equal(second.after.settings.tardyMinutes,25);await apply(periods,second.revision);
  const third=structuredClone(initial);third.settings.holidayLimit=3;
  const review=await preview(third);assert.equal(review.after.periods.length,1);
  assert.equal(review.after.periods[0].id,second.after.periods[0].id);
  await assert.rejects(()=>apply(periods,second.revision),/미리보기/);
  await apply(third,review.revision);
  const scheduled=await f.store.readMockState();assert.equal(scheduled.academyApplications.filter(r=>r.status==="PENDING").length,1);
  assert.equal(scheduled.divisionSettingsByDivision.police.tardyMinutes,initial.settings.tardyMinutes);
  await f.service.applyDueAcademyTemplates("police",date);
  const current=(await f.service.getAcademyTemplateLibrary("police")).current;
  assert.equal(current.settings.tardyMinutes,25);assert.equal(current.settings.holidayLimit,3);assert.equal(current.periods.length,1);
});

 test("past effective date applies immediately with independent historical calculations and preserved ledgers",async t=>{
  const f=await fixture(t),before=await f.store.readMockState();
  const value={name:"과거 기준 정정",payload:(await f.service.getAcademyTemplateLibrary("police")).current,effectiveFrom:"2026-01-01"};
  value.payload.settings.tardyMinutes=35;
  const preview=await f.service.previewAcademyTemplate("police",value);
  assert.equal((await f.service.applyAcademyTemplate("police",{...value,revision:preview.revision},f.actor)).status,"APPLIED");
  assert.equal((await f.service.getHistoricalAcademyConfiguration("police","2026-01-02"))?.settings.tardyMinutes,35);
  assert.equal((await f.service.getHistoricalAcademyConfiguration("police","2025-12-31"))?.settings.tardyMinutes,before.divisionSettingsByDivision.police.tardyMinutes);
  assert.equal(await f.service.getHistoricalAcademyConfiguration("fire","2026-01-02"),null);
  const after=await f.store.readMockState();
  for(const key of ["attendanceByDivision","pointRecordsByDivision","studentsByDivision","paymentRecordsByDivision"] as const)assert.deepEqual(after[key],before[key]);
 });

test("disabling a controlled period previews removal from policy while preserving records",async t=>{
 const f=await fixture(t),value={name:"초기",payload:commonAcademyTemplate(kstDate()),effectiveFrom:kstDate()};
 value.payload.settings.managementPolicy!.controlledPeriods=[{periodId:value.payload.periods[0].id,weekdays:[1,2,3,4,5],optional:false}];
 value.payload.settings.managementPolicy!.attendancePeriodIds=[value.payload.periods[0].id];
 const preview=await f.service.previewAcademyTemplate("police",value);await f.service.applyAcademyTemplate("police",{...value,revision:preview.revision},f.actor);
 const current=(await f.service.getAcademyTemplateLibrary("police")).current;
 const target=current.settings.managementPolicy!.controlledPeriods[0].periodId;
 current.periods=current.periods.map(p=>p.id===target?{...p,isActive:false}:p);
 const next=await f.service.previewAcademyTemplate("police",{name:"교시 중지",payload:current,effectiveFrom:"2026-09-01"});
 assert.ok(!next.after.settings.managementPolicy!.controlledPeriods.some(p=>p.periodId===target));
 assert.ok(next.changes.length>1);
});


test("application date correction preserves snapshots and ledgers with an audit and academy isolation",async t=>{
  const f=await fixture(t);
  const payload=(await f.service.getAcademyTemplateLibrary("police")).current;
  payload.settings.tardyMinutes=30;
  const value={name:"지각 기준",payload,effectiveFrom:kstDate()};
  const p=await f.service.previewAcademyTemplate("police",value);
  const applied=await f.service.applyAcademyTemplate("police",{...value,revision:p.revision},f.actor);
  const loaded=loadWithMocks<typeof import("../lib/services/academy-application-date.service")>(path.join(root,"lib/services/academy-application-date.service.ts"),{
    "@/lib/mock-data":{isMockMode:()=>true},"@/lib/mock-store":f.store,
    "@/lib/revalidation":{revalidateDivisionOperationalViews(){}},
    "@/lib/service-helpers":{getPrismaClient(){throw new Error("Operating DB must not be called");}},
  });
  t.after(loaded.restore);
  const service=loaded.module;
  const date=new Date(Date.parse(kstDate()+"T00:00:00Z")-86400000).toISOString().slice(0,10);
  const input={id:applied.id,effectiveFrom:date,reason:"시험 첫날부터 적용"};
  const before=await f.store.readMockState();
  const preview=await service.correctAcademyApplicationDate("police",input,f.actor);
  assert.equal(preview.before,kstDate());assert.equal(preview.after,date);
  await assert.rejects(service.correctAcademyApplicationDate("fire",input,f.actor),/찾을/);
  await assert.rejects(service.correctAcademyApplicationDate("police",{...input,reason:""},f.actor));
  await assert.rejects(service.correctAcademyApplicationDate("police",{...input,revision:"stale"},f.actor,true),/미리보기/);
  await service.correctAcademyApplicationDate("police",{...input,revision:preview.revision},f.actor,true);
  const after=await f.store.readMockState();
  for(const key of ["studentsByDivision","attendanceByDivision","pointRecordsByDivision","paymentRecordsByDivision","morningExamScoresByDivision","divisionSettingsByDivision","seatsByDivision"] as const) assert.deepEqual(after[key],before[key]);
  assert.deepEqual(after.academyApplications[0],{...before.academyApplications[0],effectiveFrom:date});
  const audit=await service.getAcademyApplicationDateCorrections("police");
  assert.equal(audit.length,1);assert.equal((audit[0].changes as {after:unknown}[])[1].after,input.reason);
  assert.equal((await service.getAcademyApplicationDateCorrections("fire")).length,0);
  const {configurationForDate}=await import("../lib/academy-configuration-history");
  assert.equal(configurationForDate(payload,after.academyApplications,date).settings.tardyMinutes,30);
  assert.equal(configurationForDate(payload,before.academyApplications,date).settings.tardyMinutes,10);
  await assert.rejects(service.correctAcademyApplicationDate("police",{...input,effectiveFrom:kstDate(),revision:preview.revision},f.actor,true),/미리보기/);
});
