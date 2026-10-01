import test from 'node:test';
import assert from 'node:assert/strict';
import { cumulativeAttendancePeriod } from '../../lib/exam-attendance';
import { examAttendancePeriod } from '../../lib/exam-attendance';
import { createAcademyPolicyDraft } from '../../lib/academy-policy-settings';
import { parseExamPointAutomation } from '../../lib/exam-point-automation';
import { parseCumulativeAttendance } from '../../lib/cumulative-attendance-parser';
import { morningObjectiveFixture } from '../helpers/morning-objective-fixture';

function settings() {
 const periods=[{id:'morning',name:'시험',startTime:'08:30',endTime:'09:00',isActive:true}];
 return {managementPolicy:{...createAcademyPolicyDraft('2026-09-01',periods),enabled:true,morningExam:{periodId:'morning',weekdays:[1,2,3,4,5],syncAttendance:true}},
  examPointAutomation:parseExamPointAutomation({morningStartDate:'2026-09-14',morningWeekdays:[1,2,3,5]})};
}
test('cumulative attendance follows academy attendance weekdays without widening grading automation',()=>{
 const s=settings();
 assert.equal(cumulativeAttendancePeriod(s,'2026-10-01'),'morning');
 assert.equal(examAttendancePeriod(s,'2026-10-01'),null);
 s.managementPolicy.morningExam.weekdays=[1,2,3,5];
 assert.equal(cumulativeAttendancePeriod(s,'2026-10-01'),null);
});
test('cumulative import still respects start, exclusions, effective policy and disabled link',()=>{
 for(const mutate of [
  (s:ReturnType<typeof settings>)=>{s.examPointAutomation.morningStartDate=null;},
  (s:ReturnType<typeof settings>)=>{s.examPointAutomation.morningStartDate='2026-10-02';},
  (s:ReturnType<typeof settings>)=>{s.examPointAutomation.morningExcludedDates=['2026-10-01'];},
  (s:ReturnType<typeof settings>)=>{s.managementPolicy.enabled=false;},
  (s:ReturnType<typeof settings>)=>{s.managementPolicy.effectiveFrom='2026-10-02';},
  (s:ReturnType<typeof settings>)=>{s.managementPolicy.morningExam.syncAttendance=false;},
 ]) {const s=settings();mutate(s);assert.equal(cumulativeAttendancePeriod(s,'2026-10-01'),null);}
});
test('75 answers are supported and matching anonymous blocks are counted without student inference',()=>{
 const f=morningObjectiveFixture();
 for(let i=5;i<80;i++)f.errata[0][i]=i-4;
 for(let r=1;r<f.errata.length;r+=3)for(let i=5;i<80;i++){
  f.errata[r][i]='1';f.errata[r+1][i]='2';f.errata[r+2][i]='X';
 }
 f.score[1][0]='';f.errata[1][0]='';
 const files=f.files();const parsed=parseCumulativeAttendance(files.scoreBuffer,files.analysisBuffer);
 assert.equal(parsed.ignoredIdentifierCount,1);
 assert.deepEqual(parsed.students,[{studentNumber:'90002',hasAnswer:true},{studentNumber:'90003',hasAnswer:true}]);
});
test('unpaired anonymous rows, invalid nonempty identifiers and damaged blocks still fail',()=>{
 for(const mutate of [
  (f:ReturnType<typeof morningObjectiveFixture>)=>{f.score[1][0]='';},
  (f:ReturnType<typeof morningObjectiveFixture>)=>{f.errata[1][0]='';},
  (f:ReturnType<typeof morningObjectiveFixture>)=>{f.score[1][0]='bad';f.errata[1][0]='bad';},
  (f:ReturnType<typeof morningObjectiveFixture>)=>{f.score[1][0]='';f.errata[1][0]='';f.errata[2][0]='90001';},
 ]){const f=morningObjectiveFixture();mutate(f);const files=f.files();assert.throws(()=>parseCumulativeAttendance(files.scoreBuffer,files.analysisBuffer));}
});
