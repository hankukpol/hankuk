import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import ts from "typescript";
import * as calculator from "../../lib/exam-point-automation";
import { mapPolicy } from "../../scripts/restart-police-policy";
import * as policy from "../../lib/management-policy";

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
    leavePermissionsByDivision:{police:[],fire:[]},
  };
  let today="2026-09-14";
  const dependencies:Record<string,unknown>={
    "node:crypto":{randomUUID},"react":{cache:(fn:unknown)=>fn},
    "@/lib/exam-point-automation":calculator,"@/lib/management-policy":{...policy,kstDate:()=>today},
    "@/lib/mock-data":{isMockMode:()=>true},"@/lib/mock-store":{readMockState:async()=>state,updateMockState:async(fn:(state:unknown)=>unknown)=>fn(state)},
    "@/lib/service-helpers":{},"@/lib/revalidation":{revalidateDivisionOperationalViews(){}},
    "@/lib/errors":{badRequest:(text:string)=>new Error(text),notFound:(text:string)=>new Error(text)},
    "@/lib/services/settings-history.service":{recordDivisionSettingsChange:async()=>{}},
  };
  function load<T>(name:string):T {
    if(name==="exam-point-settings") dependencies["@/lib/services/exam-point.service"]=load("exam-point");
    const code=ts.transpileModule(readFileSync(`lib/services/${name}.service.ts`,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const module={exports:{}};
    new Function("require","module","exports",code)((id:string)=>{assert.ok(id in dependencies,id);return dependencies[id];},module,module.exports);
    return module.exports as T;
  }
  return {state,config,load,setToday:(value:string)=>{today=value;}};
}
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
