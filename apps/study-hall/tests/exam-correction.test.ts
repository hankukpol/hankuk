import assert from "node:assert/strict";
import test from "node:test";
import { correctionRevision, prepareExamCorrection, examCorrectionSchema, type CorrectionBundle } from "../lib/exam-correction";
import { derivedScoreSnapshot, planExamImportDeletion } from "../lib/exam-import-history";
export function correctionFixture(morning=false):CorrectionBundle {
  const date="2026-09-14",now=date+"T00:00:00.000Z";
  const scores=["a","b"].map((id,index)=>({id:`score-${id}`,studentId:id,examTypeId:"type",examDate:date,recordedById:"admin",createdAt:now,updatedAt:now,notes:null,...(morning?{subjectId:"sub",score:5,weekNumber:38,weekYear:2026}:{examRound:20260914,scores:{sub:5},totalScore:5,rankInClass:1})}));
  return {session:{id:"session",divisionId:"division",examTypeId:"type",identityKey:date,primarySubjectId:morning?"sub":null,examDate:date,topic:null,itemCount:2,fullScore:10,externalCohortSize:2,externalStats:{count:2,mean:5,distribution:[{score:5,count:2}],subjects:{},regions:{}},sourceFileName:"test",importedById:"admin",importedAt:now},
    students:[{id:"a",name:"가",studentNumber:"00001"},{id:"b",name:"나",studentNumber:"00002"},{id:"c",name:"다",studentNumber:"00003"}],subjects:[{id:"sub",name:"과목"}],scores,
    participants:scores.map(s=>({id:`p-${s.studentId}`,divisionId:"division",sessionId:"session",studentId:s.studentId,region:null,subjectScores:{sub:5},totalScore:5,isPartial:false,externalRank:1,externalPercentile:50,regionalRank:null,derivedScoreId:s.id,derivedScoreSnapshot:derivedScoreSnapshot(s)})),
    items:[1,2].map(itemNo=>({id:`i-${itemNo}`,divisionId:"division",sessionId:"session",subjectId:"sub",itemNo,position:itemNo,answerKey:"1",points:5,correctRatePct:50,choiceRates:{},mostCommonWrong:null})),
    responses:["a","b"].flatMap(studentId=>[1,2].map(itemNo=>({id:`r-${studentId}-${itemNo}`,divisionId:"division",sessionId:"session",studentId,subjectId:"sub",itemNo,answer:"1",isCorrect:itemNo===1}))),
  };
}
function input(b:CorrectionBundle){return {revision:correctionRevision(b),studentId:"a",targetStudentId:"c",reason:"수험번호 오마킹 정정",responses:b.responses.filter(r=>r.studentId==="a").map(({subjectId,itemNo,answer,isCorrect})=>({subjectId,itemNo,answer,isCorrect}))};}
test("identity correction moves one attempt, preserves peer answers and valid deletion proofs",()=>{
  const b=correctionFixture(),p=prepareExamCorrection(b,input(b),"operator","2026-09-15T00:00:00.000Z");
  assert.equal(p.before.studentId,"a");assert.equal(p.after.studentId,"c");
  assert.ok(p.responses.every(r=>r.studentId!=="a"));
  assert.deepEqual(p.responses.filter(r=>r.studentId==="b"),b.responses.filter(r=>r.studentId==="b"));
  assert.equal(planExamImportDeletion(b.session,p.participants,p.scores).deletable.length,2);
  assert.equal(b.participants[0].studentId,"a");
});
test("item correction recalculates totals and tied class rank, invalidates obsolete external rank",()=>{
  const b=correctionFixture(),value=input(b);value.targetStudentId="a";value.responses[1].isCorrect=true;
  const p=prepareExamCorrection(b,value,"operator","2026-09-15T00:00:00.000Z");
  assert.equal(p.after.totalScore,10);assert.equal(p.scores.find(s=>s.studentId==="b")?.rankInClass,2);
  assert.equal(p.participants.find(s=>s.studentId==="a")?.externalRank,null);
  assert.equal(p.participants.find(s=>s.studentId==="a")?.externalPercentile,null);
});
test("morning score correction updates legacy score from imported item points",()=>{
  const b=correctionFixture(true),value=input(b);value.responses[1].isCorrect=true;
  const p=prepareExamCorrection(b,value,"operator","2026-09-15T00:00:00.000Z");
  assert.equal(p.scores.find(s=>s.studentId==="c")?.score,10);
});
test("stale, duplicate, foreign, no-op, missing item and manual score changes are rejected",()=>{
  const b=correctionFixture(),v=input(b);
  assert.throws(()=>prepareExamCorrection(b,{...v,revision:"0".repeat(64)},"x","2026-09-15"),/다른 작업/);
  assert.throws(()=>prepareExamCorrection(b,{...v,targetStudentId:"b"},"x","2026-09-15"),/이미/);
  assert.throws(()=>prepareExamCorrection(b,{...v,targetStudentId:"foreign"},"x","2026-09-15"),/학원/);
  assert.throws(()=>prepareExamCorrection(b,{...v,targetStudentId:"a"},"x","2026-09-15"),/변경한/);
  assert.throws(()=>prepareExamCorrection(b,{...v,responses:[v.responses[0],v.responses[0]]},"x","2026-09-15"),/문항/);
  b.scores[0].totalScore=99;
  assert.throws(()=>prepareExamCorrection(b,{...v,revision:correctionRevision(b)},"x","2026-09-15"),/수기/);
  assert.equal(examCorrectionSchema.safeParse({...v,reason:" "}).success,false);
  assert.equal(examCorrectionSchema.safeParse({...v,totalScore:999}).success,false);
});
