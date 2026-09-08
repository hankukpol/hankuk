import assert from 'node:assert/strict';
import test from 'node:test';
import { reviewBuckets, regularLearningPlan, morningLearningPlan } from '../../lib/exam-learning-plan';
import type { ItemDiagnosticRow } from '../../lib/exam-analysis-meta';
import type { RegularStudentReport } from '../../lib/exam-analysis-types';
import type { MorningStudentReport } from '../../lib/morning-exam-analysis-types';

const item = (itemNo: number, answer: string | null, isCorrect: boolean, difficulty: ItemDiagnosticRow['difficulty'] = '쉬움'): ItemDiagnosticRow => ({subjectId:'a',itemNo,answer,isCorrect,difficulty,position:itemNo,answerKey:'1',externalCorrectRatePct:80,internalCorrectRatePct:null});
test('review tasks are disjoint and preserve authoritative correctness', () => {
 const input=[item(1,'2',false),item(2,' ',false),item(3,null,true),item(4,'2',false,'어려움')];
 const result=reviewBuckets(input);
 assert.deepEqual(result.easyWrong.map(x=>x.itemNo),[1]);
 assert.deepEqual(result.unanswered.map(x=>x.itemNo),[2]);
 assert.deepEqual(result.otherWrong.map(x=>x.itemNo),[4]);
 assert.equal(input.length,4);
 assert.deepEqual(reviewBuckets([]),{easyWrong:[],unanswered:[],otherWrong:[]});
});
test('regular longitudinal comparison excludes partial and changed exam configurations', () => {
 const row = {date:'2026-03-01',total:0,fullScore:100,subjectScores:{a:0},internalRank:1,externalRank:null,externalCount:0,externalTopPercent:null,isPartial:false};
 const report = {session:{fullScore:100},myScore:{subjectScores:{a:0}},stats:{subjects:[]},items:{list:[]},history:{rows:[row,{...row,date:'2026-04-01',total:20},{...row,date:'2026-05-01',total:90,isPartial:true},{...row,date:'2026-06-01',fullScore:200,total:180},{...row,date:'2026-07-01',subjectScores:{b:0}}]}} as unknown as RegularStudentReport;
 const result=regularLearningPlan(report);
 assert.equal(result.compatibleCount,2);assert.equal(result.average,10);assert.equal(result.change,20);assert.equal(result.excludedCount,3);
 assert.equal(regularLearningPlan({...report,history:undefined}).average,null);
 assert.equal(regularLearningPlan({...report,history:undefined}).change,null);
});
test('regular priorities use actual subject weights and do not invent untaken subjects', () => {
 const report={session:{fullScore:300},myScore:{subjectScores:{a:30,b:100}},stats:{subjects:[{subjectId:'a',name:'A',my:30,fullScore:60,externalAvg:null},{subjectId:'b',name:'B',my:100,fullScore:240,externalAvg:130}]},items:{list:[item(1,'2',false)]}} as unknown as RegularStudentReport;
 const rows=regularLearningPlan(report).priorities;
 assert.equal(rows[0].subjectId,'a');assert.equal(rows[0].examWeight,20);assert.equal(rows[0].lostPoints,30);assert.equal(rows[0].gap,null);assert.equal(rows[1].gap,-30);assert.equal(rows.length,2);
});
test('morning tasks stay subject scoped and withhold trends with insufficient attendance', () => {
 const report={subjects:[{subjectId:'a',name:'A',insufficientSample:false,attendanceRatePercent:50}],summary:{attendanceRatePercent:50},settings:{morning:{attendanceRatePercent:70}},topics:[{subjectId:'b',topic:'foreign',gap:-99}],dailyItems:[{subjectId:'a',date:'2026-09-01',topic:'진도',diagnostics:{list:[item(1,null,false)]}},{subjectId:'b',date:'2026-09-01',topic:'다른 과목',diagnostics:{list:[item(2,'2',false)]}}]} as unknown as MorningStudentReport;
 const [result]=morningLearningPlan(report);
 assert.equal(result.withheld,true);assert.equal(result.unansweredCount,1);assert.equal(result.easyWrongCount,0);assert.equal(result.tasks.length,1);assert.equal(result.topics.length,0);
});
