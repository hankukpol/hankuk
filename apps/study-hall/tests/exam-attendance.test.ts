import test from "node:test";
import assert from "node:assert/strict";
import { createAcademyPolicyDraft } from "../lib/academy-policy-settings";
import { buildPolicyAttendanceCandidates } from "../lib/management-policy";
import { buildVersionedExamPoints } from "../lib/versioned-exam-points";
import { parseExamPointAutomation, type ExamPointSource } from "../lib/exam-point-automation";
import { syncMockExamAttendance } from "../lib/services/exam-attendance.service";
import { includeManualMorningScores, desiredExamAttendance } from "../lib/exam-attendance";

function fixture() {
  const day="2026-09-14";
  const periods=[{id:"exam",name:"아침시험",startTime:"08:00",endTime:"08:30",isActive:true},{id:"class",name:"자습",startTime:"09:00",endTime:"10:00",isActive:true}];
  const policy={...createAcademyPolicyDraft(day,periods),enabled:true,optionalEnrollments:[],morningExam:{periodId:"exam",weekdays:[1],syncAttendance:true},controlledPeriods:periods.map(p=>({periodId:p.id,weekdays:[1],optional:false})),partialAbsenceRuleId:"absence",fullDayAbsenceRuleId:"absence"};
  const config=parseExamPointAutomation({enabled:true,effectiveFrom:day,morningStartDate:day,morningWeekdays:[1],morningAbsenceRuleId:"exam-absence"});
  const source:ExamPointSource={students:[{id:"a",status:"ACTIVE"},{id:"b",status:"ACTIVE"}],sessions:[{id:"session",examTypeId:"type",identityKey:day,examDate:day,category:"MORNING",fullScore:100}],participants:[{sessionId:"session",studentId:"a",totalScore:0,isPartial:false}],attendance:[],leave:[],periods,rules:[{id:"exam-absence",points:-1,isActive:true},{id:"absence",points:-2,isActive:true}]};
  const current={settings:{managementPolicy:policy,examPointAutomation:config},periods,pointRules:source.rules,examTypes:[{id:"type",category:"MORNING"}]};
  const state={attendanceByDivision:{one:[],two:[{id:"untouched"}]}} as unknown as Parameters<typeof syncMockExamAttendance>[0];
  return {day,source,current,state,policy,periods};
}
test("zero score auto attendance, idempotence, deletion and manual protection",()=>{
  const {day,source,current,state}=fixture();
  const sync=()=>syncMockExamAttendance(state,"one",current,[],source,"2026-09",day,"admin");
  sync();sync();assert.equal(state.attendanceByDivision.one.length,1);
  assert.equal(state.attendanceByDivision.one[0].status,"PRESENT");
  source.participants=[];sync();assert.equal(state.attendanceByDivision.one.length,0);
  source.participants=[{sessionId:"session",studentId:"a",totalScore:0,isPartial:false}];sync();
  const manual=state.attendanceByDivision.one[0];manual.examAutoSource=null;manual.status="EXCUSED";manual.reason="병원";
  source.participants=[];sync();assert.equal(state.attendanceByDivision.one[0].reason,"병원");
  assert.deepEqual(state.attendanceByDivision.two,[{id:"untouched"}]);
});
test("exam absence uses only -1, afternoon excuse does not exempt morning",()=>{
  const {day,source,current,policy,periods}=fixture();
  source.attendance=[{studentId:"b",periodId:"exam",date:day,status:"ABSENT",reason:null},{studentId:"b",periodId:"class",date:day,status:"EXCUSED",reason:"오후 병원"}];
  assert.deepEqual(buildPolicyAttendanceCandidates(policy,periods,source.attendance.map(a=>({...a,periodId:a.periodId!})),source.rules,day,new Date("2026-09-14T23:00:00+09:00")),[]);
  assert.deepEqual(buildVersionedExamPoints(current,[],source,"2026-09",day).map(a=>a.points),[-1]);
  for(const status of ["EXCUSED","HOLIDAY","HALF_HOLIDAY"]) {
    source.attendance[0].status=status;
    assert.equal(buildVersionedExamPoints(current,[],source,"2026-09",day).length,0);
  }
});
test("disabled and before-start academy settings do not auto-write attendance",()=>{
  const {day,source,current,state}=fixture();
  current.settings.managementPolicy.morningExam.syncAttendance=false;
  syncMockExamAttendance(state,"one",current,[],source,"2026-09",day,"admin");
  assert.equal(state.attendanceByDivision.one.length,0);
  current.settings.managementPolicy.morningExam.syncAttendance=true;
  current.settings.examPointAutomation.morningStartDate="2026-09-15";
  syncMockExamAttendance(state,"one",current,[],source,"2026-09",day,"admin");
  assert.equal(state.attendanceByDivision.one.length,0);
});
test("manual zero is attendance, empty score is not, and academy points remain independent",()=>{
  const {day,source,current}=fixture();
  const empty={...source,sessions:[],participants:[]};
  const manual=includeManualMorningScores(empty,[{studentId:"a",examTypeId:"type",examDate:day,score:0},{studentId:"b",examTypeId:"type",examDate:day,score:null}],current.examTypes);
  assert.deepEqual(Array.from(desiredExamAttendance(manual,day)),["a"]);
  const other={...current,pointRules:current.pointRules.map(r=>({...r,points:r.id==="exam-absence"?-5:r.points}))};
  assert.deepEqual(buildVersionedExamPoints(current,[],source,"2026-09",day).map(a=>a.points),[-1]);
  assert.deepEqual(buildVersionedExamPoints(other,[],source,"2026-09",day).map(a=>a.points),[-5]);
});
