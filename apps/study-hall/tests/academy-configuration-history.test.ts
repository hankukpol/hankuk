import assert from "node:assert/strict";
import test from "node:test";
import { buildVersionedExamPoints } from "../lib/versioned-exam-points";
import { parseExamPointAutomation, type ExamPointSource } from "../lib/exam-point-automation";
import { configurationForDate } from "../lib/academy-configuration-history";

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
