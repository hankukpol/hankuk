import * as examAttendanceHelpers from "../../lib/exam-attendance";
import * as examAttendance from "../../lib/services/exam-attendance.service";
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import ts from "typescript";
import * as versionedCalculator from "../../lib/versioned-exam-points";
import * as calculator from "../../lib/exam-point-automation";
import { mapPolicy } from "../../scripts/restart-police-policy";
import * as policy from "../../lib/management-policy";
import { createAcademyPolicyDraft } from "../../lib/academy-policy-settings";

function fixture() {
  const config=calculator.examPointAutomationSchema.parse({enabled:true,effectiveFrom:"2026-09-01",morningStartDate:"2026-09-14",morningWeekdays:[1,2,3,4,5],morningAbsenceRuleId:"police-absence",morningFirstRuleId:"police-first"});
  const state={
    divisions:[{id:"police-id",slug:"police"},{id:"fire-id",slug:"fire"}],
    divisionSettingsByDivision:{police:{examPointAutomation:config},fire:{examPointAutomation:calculator.defaultExamPointAutomation()}},
    studentsByDivision:{police:[{id:"student",status:"ACTIVE"},{id:"absent",status:"ACTIVE"}],fire:[{id:"foreign",status:"ACTIVE"}]},
    examTypesByDivision:{police:[{id:"type",divisionId:"police-id",category:"MORNING"}],fire:[]},
    examSessionsByDivision:{police:[{id:"session",divisionId:"police-id",examTypeId:"type",examDate:"2026-09-14",identityKey:"2026-09-14",fullScore:100}],fire:[]},
    examSessionParticipantsByDivision:{police:[{divisionId:"police-id",sessionId:"session",studentId:"student",totalScore:80,isPartial:false}],fire:[]},
    pointRulesByDivision:{police:[{id:"police-absence",name:"미응시",points:-1,isActive:true},{id:"police-first",name:"1등",points:3,isActive:true}],fire:[{id:"fire-absence",name:"미응시",points:-5,isActive:true}]},
    pointRecordsByDivision:{police:[] as Array<{id:string;studentId:string;points:number;notes:string}>,fire:[{id:"kept",studentId:"foreign",points:5,notes:"manual"}]},
    attendanceByDivision:{police:[] as Array<{studentId:string;date:string;status:string;reason:string}>,fire:[]},
    leavePermissionsByDivision:{police:[] as Array<{studentId:string;date:string;status:string}>,fire:[]},
  };
  let today="2026-09-14";
  const dependencies:Record<string,unknown>={
    "@/lib/services/exam-attendance.service":examAttendance, "@/lib/exam-attendance":examAttendanceHelpers,
    "node:crypto":{randomUUID},"react":{cache:(fn:unknown)=>fn},
    "@/lib/versioned-exam-points":versionedCalculator,
    "@/lib/services/academy-configuration-history.service":{getHistoricalAcademyConfiguration:async()=>null},
    "@/lib/exam-point-automation":calculator,"@/lib/management-policy":{...policy,kstDate:()=>today},
    "@/lib/mock-data":{isMockMode:()=>true},"@/lib/mock-store":{readMockState:async()=>state,updateMockState:async(fn:(state:unknown)=>unknown)=>fn(state)},
    "@/lib/service-helpers":{},"@/lib/revalidation":{revalidateDivisionOperationalViews(){}},
    "@/lib/errors":{badRequest:(text:string)=>new Error(text),notFound:(text:string)=>new Error(text)},
    "@/lib/services/settings-history.service":{recordDivisionSettingsChange:async()=>{}},
  };
  function load<T>(name:string):T {
    if(name==="exam-point-settings") dependencies["@/lib/services/exam-point.service"]=load("exam-point");
    const code=ts.transpileModule(readFileSync(`lib/services/${name}.service.ts`,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const loaded={exports:{}};
    new Function("require","module","exports",code)((id:string)=>{assert.ok(id in dependencies,id);return dependencies[id];},loaded,loaded.exports);
    return loaded.exports as T;
  }
  return {state,config,load,setToday:(value:string)=>{today=value;}};
}

test("grading correction recalculates absence from refreshed attendance, not removed auto records", async () => {
  const f = fixture();
  const periods = [{ id: "morning", name: "아침시험", startTime: "08:00", endTime: "08:30", isActive: true }];
  const managementPolicy = { ...createAcademyPolicyDraft("2026-09-14", periods), enabled: true,
    morningExam: { periodId: "morning", weekdays: [1, 2, 3, 4, 5], syncAttendance: true } };
  Object.assign(f.state.divisionSettingsByDivision.police, { managementPolicy });
  Object.assign(f.state, { periodsByDivision: { police: periods, fire: [] } });
  const service = f.load<typeof import("../../lib/services/exam-point.service")>("exam-point");
  await service.syncExamPoints("police", "2026-09-14", "admin");
  assert.equal(f.state.attendanceByDivision.police.some(a => a.studentId === "student"), true);
  f.state.examSessionParticipantsByDivision.police = [];
  await service.syncExamPoints("police", "2026-09-14", "admin");
  assert.equal(f.state.attendanceByDivision.police.some(a => a.studentId === "student"), false);
  assert.equal(f.state.pointRecordsByDivision.police.some(a => a.studentId === "student" && a.points === -1), true);
});
test("existing manual morning grades including zero prevent false absence without creating score ranks", async () => {
  for (const syncAttendance of [false, true]) {
    for (const score of [0, 80, null]) {
      const f = fixture();
      const periods = [{ id: "morning", name: "아침시험", startTime: "08:00", endTime: "08:30", isActive: true }];
      Object.assign(f.state.divisionSettingsByDivision.police, { managementPolicy: {
        ...createAcademyPolicyDraft("2026-09-14", periods), enabled: true,
        morningExam: { periodId: "morning", weekdays: [1, 2, 3, 4, 5], syncAttendance: true },
      } });
      f.state.examSessionsByDivision.police = [];
      f.state.examSessionParticipantsByDivision.police = [];
      const manual = [{ studentId: "student", examTypeId: "type", examDate: "2026-09-14", score },
        { studentId: "absent", examTypeId: "foreign-type", examDate: "2026-09-14", score: 100 }];
      Object.assign(f.state, { periodsByDivision: { police: periods, fire: [] }, morningExamScoresByDivision: { police: manual, fire: [] } });
      f.state.attendanceByDivision.police.push(Object.assign({ studentId: "student", date: "2026-09-14", status: "ABSENT", reason: "확인" }, { periodId: "morning" }));
      f.state.attendanceByDivision.police.push(Object.assign({ studentId: "absent", date: "2026-09-14", status: "ABSENT", reason: "확인" }, { periodId: "morning" }));
      const service = f.load<typeof import("../../lib/services/exam-point.service")>("exam-point");
      await service.syncExamPoints("police", "2026-09-14", "admin", syncAttendance);
      assert.equal(f.state.pointRecordsByDivision.police.some(p => p.studentId === "student"), score === null);
      assert.equal(f.state.pointRecordsByDivision.police.some(p => p.studentId === "absent"), true, "Foreign exam types cannot prove attendance");
      f.setToday("2026-10-01");
      await service.syncExamPoints("police", "2026-09-14", "admin", syncAttendance);
      assert.equal(f.state.pointRecordsByDivision.police.some(p => p.notes.includes("rank-month")), false);
      assert.equal(f.state.examSessionsByDivision.police.length, 0);
      assert.equal(f.state.examSessionParticipantsByDivision.police.length, 0);
      assert.equal(manual[0].score, score);
    }
  }
});
test("repeated synchronization preserves point IDs; attendance correction revokes absence only",async()=>{
  const f=fixture(), service=f.load<typeof import("../../lib/services/exam-point.service")>("exam-point");
  const foreign=JSON.stringify(f.state.pointRecordsByDivision.fire);
  assert.deepEqual(await service.syncExamPoints("police","2026-09-14","admin"),{grantedCount:1,revokedCount:0});
  const before=JSON.stringify(f.state.pointRecordsByDivision.police);
  assert.deepEqual(await service.syncExamPoints("police","2026-09-14","admin"),{grantedCount:0,revokedCount:0});
  assert.equal(JSON.stringify(f.state.pointRecordsByDivision.police),before);
  f.state.attendanceByDivision.police.push({studentId:"absent",date:"2026-09-14",status:"EXCUSED",reason:"수업: 기본이론"});
  assert.deepEqual(await service.syncExamPoints("police","2026-09-14","admin"),{grantedCount:0,revokedCount:1});
  assert.equal(JSON.stringify(f.state.pointRecordsByDivision.fire),foreign);
});
for (const status of ["HOLIDAY", "HALF_HOLIDAY", "EXCUSED"]) {
  test(`morning absence ${status}: exemption before grading, later correction revokes, repeated sync is idempotent`,async()=>{
    const f=fixture(),service=f.load<typeof import("../../lib/services/exam-point.service")>("exam-point");
    const foreign=JSON.stringify(f.state.pointRecordsByDivision.fire);
    f.state.pointRecordsByDivision.police.push({id:"manual",studentId:"absent",points:-2,notes:"별도 수동 벌점"});
    f.state.attendanceByDivision.police.push({studentId:"absent",date:"2026-09-14",status,reason:"승인된 미응시"});
    assert.deepEqual(await service.syncExamPoints("police","2026-09-14","admin"),{grantedCount:0,revokedCount:0});
    f.state.attendanceByDivision.police=[];
    assert.deepEqual(await service.syncExamPoints("police","2026-09-14","admin"),{grantedCount:1,revokedCount:0});
    f.state.attendanceByDivision.police.push({studentId:"absent",date:"2026-09-14",status,reason:"사후 승인"});
    assert.deepEqual(await service.syncExamPoints("police","2026-09-14","admin"),{grantedCount:0,revokedCount:1});
    assert.deepEqual(await service.syncExamPoints("police","2026-09-14","admin"),{grantedCount:0,revokedCount:0});
    assert.deepEqual(f.state.pointRecordsByDivision.police.map(p=>p.id),["manual"]);
    assert.equal(JSON.stringify(f.state.pointRecordsByDivision.fire),foreign);
  });
}
test("morning approved/used leave exempts without attendance rows; pending, rejection and other dates do not",async()=>{
  const f=fixture(),service=f.load<typeof import("../../lib/services/exam-point.service")>("exam-point");
  const permission={studentId:"absent",date:"2026-09-14",status:"PENDING"};
  f.state.leavePermissionsByDivision.police.push(permission);
  assert.equal((await service.syncExamPoints("police","2026-09-14","admin")).grantedCount,1);
  permission.status="APPROVED";
  assert.equal((await service.syncExamPoints("police","2026-09-14","admin")).revokedCount,1);
  permission.status="USED";
  assert.deepEqual(await service.syncExamPoints("police","2026-09-14","admin"),{grantedCount:0,revokedCount:0});
  permission.status="REJECTED";
  assert.equal((await service.syncExamPoints("police","2026-09-14","admin")).grantedCount,1);
  permission.status="APPROVED"; permission.date="2026-09-15";
  assert.deepEqual(await service.syncExamPoints("police","2026-09-14","admin"),{grantedCount:0,revokedCount:0});
  f.state.attendanceByDivision.police.push({studentId:"absent",date:"2026-09-14",status:"ABSENT",reason:"휴무 신청 중"});
  assert.equal(f.state.pointRecordsByDivision.police.length,1);
  assert.deepEqual(await service.syncExamPoints("police","2026-09-14","admin"),{grantedCount:0,revokedCount:0});
});
test("removed import retracts its automatic points, preserves manual and inactive history",async()=>{
  const f=fixture(), service=f.load<typeof import("../../lib/services/exam-point.service")>("exam-point");
  f.setToday("2026-10-01");
  await service.syncExamPoints("police","2026-09-14","admin");
  f.state.studentsByDivision.police[1].status="WITHDRAWN";
  f.state.pointRecordsByDivision.police.push({id:"manual",studentId:"student",points:3,notes:"수동 상점"});
  f.state.examSessionsByDivision.police=[];
  assert.deepEqual(await service.syncExamPoints("police","2026-09-14","admin"),{grantedCount:0,revokedCount:1});
  assert.equal(f.state.pointRecordsByDivision.police.length,2);
  assert.ok(f.state.pointRecordsByDivision.police.some(row=>row.id==="manual"));
});
test("settings reject foreign rule IDs; each academy saves its own calendar and amount",async()=>{
  const f=fixture(), settings=f.load<typeof import("../../lib/services/exam-point-settings.service")>("exam-point-settings");
  await assert.rejects(settings.updateExamPointSettings("police",{...f.config,morningAbsenceRuleId:"fire-absence"},{id:"admin",name:"관리자"}),/현재 학원/);
  const before=JSON.stringify(f.state.divisionSettingsByDivision.police);
  await settings.updateExamPointSettings("fire",{...f.config,morningAbsenceRuleId:"fire-absence",morningFirstRuleId:null,morningWeekdays:[2,4],morningStartDate:"2026-10-01"},{id:"fire-admin",name:"관리자"});
  assert.equal(JSON.stringify(f.state.divisionSettingsByDivision.police),before);
  assert.deepEqual((await settings.getExamPointSettings("fire")).config.morningWeekdays,[2,4]);
  assert.equal((await settings.getExamPointSettings("fire")).config.morningStartDate,"2026-10-01");
});
test("management policy reads independent configuration for a non-police academy",async()=>{
  const f=fixture();
  const manifest=JSON.parse(readFileSync("docs/policies/restart-police-v3.1.json","utf8"));
  const own=mapPolicy(manifest,manifest.periods.map((p:{startTime:string})=>({id:p.startTime,startTime:p.startTime})));
  Object.assign(f.state.divisionSettingsByDivision.fire,{managementPolicy:{...own,closingTime:"20:00"}});
  const service=f.load<typeof import("../../lib/services/management-policy.service")>("management-policy");
  assert.equal((await service.getManagementPolicy("fire"))?.closingTime,"20:00");
  assert.equal(await service.getManagementPolicy("police"),null);
});

test("settings save retracts legacy daily rank; closed-month resaves keep one award ID",async()=>{
  const f=fixture(), settings=f.load<typeof import("../../lib/services/exam-point-settings.service")>("exam-point-settings");
  f.state.pointRecordsByDivision.police.push({id:"manual",studentId:"student",points:3,notes:"수동 상점"});
  f.state.pointRecordsByDivision.police.push(Object.assign({id:"daily",studentId:"student",points:3,notes:"[자동][성적][2026-09][rank:type:2026-09-14] 아침모의고사 관리반 1등"},{ruleId:"police-first",date:"2026-09-14"}));
  await settings.updateExamPointSettings("police",f.config,{id:"admin",name:"관리자"});
  assert.equal(f.state.pointRecordsByDivision.police.some(r=>r.id==="daily"),false);
  assert.ok(f.state.pointRecordsByDivision.police.some(r=>r.id==="manual"));
  assert.equal(f.state.pointRecordsByDivision.police.some(r=>r.notes.includes("[rank-month:")),false);
  f.setToday("2026-10-01");
  await settings.updateExamPointSettings("police",f.config,{id:"admin",name:"관리자"});
  const monthly=f.state.pointRecordsByDivision.police.filter(r=>r.notes.includes("[rank-month:"));
  assert.equal(monthly.length,1);
  await settings.updateExamPointSettings("police",f.config,{id:"admin",name:"관리자"});
  assert.deepEqual(f.state.pointRecordsByDivision.police.filter(r=>r.notes.includes("[rank-month:")),monthly);
  assert.equal(f.state.pointRecordsByDivision.fire[0].id,"kept");
});

test("historical template policy drives automatic absence points and exemption reconciliation", async()=>{
  const f=fixture(), service=f.load<typeof import("../../lib/services/exam-point.service")>("exam-point");
  const {createAcademyPolicyDraft}=await import("../../lib/academy-policy-settings");
  const periods=[{id:"exam",name:"아침시험",startTime:"08:30",endTime:"09:00",isActive:true}];
  const draft=createAcademyPolicyDraft("2026-09-14",periods);
  const managementPolicy={...draft,enabled:true,morningExam:{periodId:"exam",weekdays:[1],syncAttendance:true}};
  const after={settings:{examPointAutomation:f.config,managementPolicy},periods,examTypes:f.state.examTypesByDivision.police,pointRules:f.state.pointRulesByDivision.police};
  const before={...structuredClone(after),settings:{...after.settings,managementPolicy:{...managementPolicy,morningExam:{periodId:"exam",weekdays:[1]}}}};
  Object.assign(f.state,{academyApplications:[{divisionId:"police-id",effectiveFrom:"2026-09-14",createdAt:"2026-09-15T00:00:00Z",status:"APPLIED",before,after}],periodsByDivision:{police:periods}});
  Object.assign(f.state.divisionSettingsByDivision.police,{managementPolicy});
  assert.deepEqual(await service.syncExamPoints("police","2026-09-14","admin"),{grantedCount:1,revokedCount:0});
  assert.equal(f.state.pointRecordsByDivision.police[0].points,-1);
  assert.equal(f.state.attendanceByDivision.police[0].status,"PRESENT");
  assert.deepEqual(await service.syncExamPoints("police","2026-09-14","admin"),{grantedCount:0,revokedCount:0});
  f.state.attendanceByDivision.police.push(Object.assign({studentId:"absent",date:"2026-09-14",status:"EXCUSED",reason:"개인일정"},{periodId:"exam"}));
  assert.deepEqual(await service.syncExamPoints("police","2026-09-14","admin"),{grantedCount:0,revokedCount:1});
  assert.deepEqual(await service.syncExamPoints("police","2026-09-14","admin"),{grantedCount:0,revokedCount:0});
});
