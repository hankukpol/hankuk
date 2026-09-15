import assert from "node:assert/strict";
import test from "node:test";
import { buildVersionedExamPoints } from "../lib/versioned-exam-points";
import { parseExamPointAutomation, type ExamPointSource } from "../lib/exam-point-automation";
import { configurationForDate } from "../lib/academy-configuration-history";

test("monthly exam tie-break uses attendance-day periods rather than month-end times", () => {
  const settings = { examPointAutomation: parseExamPointAutomation({ enabled:true, effectiveFrom:"2026-09-01", regularFirstRuleId:"first", rankTieBreak:"ATTEMPTS_STUDY_TIME" }) };
  const before = { settings, pointRules:[{id:"first",points:3,isActive:true}], periods:[{id:"p",endTime:"10:00"}], examTypes:[{id:"exam",category:"REGULAR"}] };
  const after = { ...before, periods:[{id:"p",endTime:"11:00"}] };
  const source: ExamPointSource = {
    students:[{id:"a",status:"ACTIVE"},{id:"b",status:"ACTIVE"}],
    sessions:[{id:"e",examTypeId:"exam",identityKey:"e",examDate:"2026-09-20",category:"REGULAR",fullScore:100}],
    participants:["a","b"].map(studentId=>({sessionId:"e",studentId,totalScore:90,isPartial:false})),
    attendance:[
      {studentId:"a",date:"2026-09-10",periodId:"p",status:"PRESENT",reason:null,checkInTime:"2026-09-10T09:00:00+09:00"},
      {studentId:"b",date:"2026-09-20",periodId:"p",status:"PRESENT",reason:null,checkInTime:"2026-09-20T09:30:00+09:00"},
    ], leave:[], rules:before.pointRules,
  };
  const history = [{effectiveFrom:"2026-09-15",createdAt:"2026-09-14T10:00:00Z",status:"APPLIED",before,after}];
  const ranks = buildVersionedExamPoints(after,history,source,"2026-09","2026-10-01").filter(row=>row.notes.includes("[rank-month:"));
  assert.deepEqual(ranks.map(row=>[row.studentId,row.points]), [["b",3]]);
  assert.deepEqual(buildVersionedExamPoints(after,[],source,"2026-09","2026-10-01").filter(row=>row.notes.includes("[rank-month:")).map(row=>row.studentId), ["a"]);
});

test("effective dates preserve old daily penalties and keep two academies independent", () => {
  const config = (points: number) => ({
    settings: { examPointAutomation: parseExamPointAutomation({ enabled:true, effectiveFrom:"2026-09-01", morningStartDate:"2026-09-01", morningWeekdays:[1,2,3,4,5], morningAbsenceRuleId:"absence" }) },
    pointRules:[{id:"absence",points,isActive:true}], periods:[], examTypes:[{id:"exam",category:"MORNING"}],
  });
  const old = config(-1), current = config(-3), other = config(-5);
  const history = [{effectiveFrom:"2026-09-15",createdAt:"2026-09-14T10:00:00Z",status:"APPLIED",before:old}];
  const source: ExamPointSource = {students:[{id:"student",status:"ACTIVE"}],
    sessions:["2026-09-14","2026-09-15"].map(examDate=>({id:examDate,examTypeId:"exam",identityKey:examDate,examDate,category:"MORNING",fullScore:100})),
    participants:[],attendance:[],leave:[],rules:current.pointRules};
  assert.deepEqual(buildVersionedExamPoints(current,history,source,"2026-09","2026-09-16").sort((a,b)=>a.date.localeCompare(b.date)).map(a=>a.points),[-1,-3]);
  assert.deepEqual(buildVersionedExamPoints(other,[],source,"2026-09","2026-09-16").map(a=>a.points),[-5,-5]);
});

test("cancelled and pending copies never affect a date; multiple applications on one day use its earliest before state for older dates",()=>{
  const current={value:30}, before={value:10};
  const history=[
    {effectiveFrom:"2026-09-15",createdAt:"2026-09-15T08:00:00Z",status:"APPLIED",before:{value:20}},
    {effectiveFrom:"2026-09-15",createdAt:"2026-09-15T07:00:00Z",status:"APPLIED",before},
    {effectiveFrom:"2026-09-14",createdAt:"2026-09-13T07:00:00Z",status:"CANCELLED",before:{value:0}},
  ];
  assert.deepEqual(configurationForDate(current,history,"2026-09-14"),before);
  assert.deepEqual(configurationForDate(current,history,"2026-09-15"),current);
});

test("later backdated edits override only edited fields from their effective date",()=>{
 const base={late:10,limit:1},first={late:20,limit:1},second={late:20,limit:3},retro={late:30,limit:3};
 const history=[
 {effectiveFrom:"2026-09-10",createdAt:"1",status:"APPLIED",before:base,after:first},
 {effectiveFrom:"2026-09-15",createdAt:"2",status:"APPLIED",before:first,after:second},
 {effectiveFrom:"2026-09-05",createdAt:"3",status:"APPLIED",before:second,after:retro}];
 assert.deepEqual(configurationForDate(retro,history,"2026-09-04"),base);
 assert.deepEqual(configurationForDate(retro,history,"2026-09-07"),{late:30,limit:1});
 assert.deepEqual(configurationForDate(retro,history,"2026-09-12"),{late:30,limit:1});
 assert.deepEqual(configurationForDate(retro,history,"2026-09-15"),retro);
});

test("backdated exam penalty uses the revised amount without leaking into another academy",()=>{
 const make=(points:number)=>({settings:{examPointAutomation:parseExamPointAutomation({enabled:true,effectiveFrom:"2026-09-01",morningStartDate:"2026-09-01",morningWeekdays:[1,2,3,4,5],morningAbsenceRuleId:"a"})},pointRules:[{id:"a",points,isActive:true}],periods:[],examTypes:[{id:"e",category:"MORNING"}]});
 const before=make(-1),after=make(-3);
 const history=[{effectiveFrom:"2026-09-15",createdAt:"2026-09-20T01:00:00Z",status:"APPLIED",before,after}];
 const source:ExamPointSource={students:[{id:"s",status:"ACTIVE"}],sessions:["2026-09-14","2026-09-15"].map(examDate=>({id:examDate,identityKey:examDate,examTypeId:"e",examDate,category:"MORNING",fullScore:100})),participants:[],attendance:[],leave:[],rules:after.pointRules};
 assert.deepEqual(buildVersionedExamPoints(after,history,source,"2026-09","2026-09-20").sort((a,b)=>a.date.localeCompare(b.date)).map(a=>a.points),[-1,-3]);
 assert.deepEqual(buildVersionedExamPoints(make(-5),[],source,"2026-09","2026-09-20").map(a=>a.points),[-5,-5]);
});
