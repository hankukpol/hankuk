import assert from 'node:assert/strict';
import test from 'node:test';
import { enrichSessions, pairedComparison, reviewGroups, topWrongBySession } from '../../lib/exam-preview/metrics';
import { isExamPreviewEnabled } from '../../lib/exam-preview/gate';
import type { RegularRawSource } from '../../lib/exam-analysis-types';

function fixture():RegularRawSource {
 const participant={divisionId:'d',sessionId:'session',studentId:'me',region:null,subjectScores:{a:0},totalScore:0,isPartial:true,externalRank:2,externalPercentile:0,regionalRank:null};
 const item={divisionId:'d',sessionId:'session',subjectId:'a',itemNo:1,position:1,answerKey:'1',points:5,correctRatePct:80,choiceRates:{'1':80,'2':20},mostCommonWrong:'2'};
 return {divisionId:'d',examTypes:[{id:'type',name:'시험',category:'REGULAR',subjects:['a','b'].map(id=>({id,name:id,totalItems:99,pointsPerItem:99,isActive:true,alternateGroup:'choice'}))}],
  sessions:[{id:'session',divisionId:'d',examTypeId:'type',examDate:'2026-09-16',primarySubjectId:null,topic:null,fullScore:10,itemCount:2,externalCohortSize:3,externalStats:{subjects:{a:{count:2,mean:5,distribution:[{score:0,count:1},{score:10,count:1}],top10Avg:4,top30Avg:5,top10Complete:true,top30Complete:false}}}}],
  students:[{id:'me',divisionId:'d',name:'테스트 학생',studentNumber:'001'},{id:'other',divisionId:'d',name:'테스트 다른 학생',studentNumber:'002'},{id:'foreign',divisionId:'foreign',name:'다른 학원',studentNumber:'003'}],
  participants:[participant,{...participant,studentId:'other',subjectScores:{a:10},totalScore:10},{...participant,studentId:'foreign',totalScore:999}],
  items:[item,{...item,itemNo:2},{...item,subjectId:'b'},{...item,divisionId:'foreign',itemNo:99}],
  responses:[{divisionId:'d',sessionId:'session',subjectId:'a',itemNo:1,studentId:'me',answer:'2',isCorrect:false},{divisionId:'d',sessionId:'session',subjectId:'a',itemNo:1,studentId:'other',answer:'1',isCorrect:true},{divisionId:'d',sessionId:'session',subjectId:'b',itemNo:1,studentId:'me',answer:null,isCorrect:false},{divisionId:'foreign',sessionId:'session',subjectId:'a',itemNo:1,studentId:'foreign',answer:'1',isCorrect:true}],targets:[]};
}
test('preview uses historical points, actual subject cohorts and original total-ranked aggregates',()=>{
 const source=fixture(),before=structuredClone(source),result=enrichSessions(source,'type',['session'],'me');
 const row=result.comparisons.find(r=>r.subjectId==='a')!;
 assert.equal(row.my,0);assert.equal(row.fullScore,10);assert.equal(row.internal,5);assert.equal(row.internalCount,2);assert.equal(row.externalCount,2);assert.equal(row.externalFileCount,3);
 assert.equal(row.top10,4);assert.equal(row.top30,null);assert.equal(row.internalRank,2);
 assert.equal(result.items.length,2);assert.equal(result.items[0].responseCount,2);assert.equal(result.items[0].internalRate,50);
 assert.deepEqual(result.items[0].choices,{'1':80,'2':20});assert.equal(result.items[1].correct,null);assert.deepEqual(source,before);
});
test('review groups partition known incorrect responses; unknown response does not become unanswered',()=>{
 const items=enrichSessions(fixture(),'type',['session'],'me').items;
 items.push({...items[0],id:'unanswered',answer:null},{...items[0],id:'difficult',externalRate:30});
 const groups=reviewGroups(items,70);
 assert.deepEqual(groups.easy.map(r=>r.id),[items[0].id]);assert.equal(groups.unanswered.length,1);assert.equal(groups.other.length,1);assert.equal(groups.points,15);
 assert.equal(reviewGroups(items,90).easy.length,0);
});
test('missing comparison remains null and pairing excludes absence and missing benchmark',()=>{
 const row=enrichSessions(fixture(),'type',['session'],'me').comparisons[0];
 const paired=pairedComparison([row,{...row,my:null},{...row,my:100,external:null}],'external');
 assert.deepEqual(paired,{count:1,my:0,benchmark:5,gap:-5});
 const source=fixture();source.sessions[0].externalStats={};const unknown=enrichSessions(source,'type',['session'],'me').comparisons[0];
 assert.equal(unknown.external,null);assert.equal(unknown.externalCount,null);assert.equal(unknown.externalRank,null);
});
test('foreign sessions and subjects without taken scores cannot leak into personal item analysis',()=>{
 const source=fixture();source.sessions.push({...source.sessions[0],id:'foreign',divisionId:'foreign'});
 const result=enrichSessions(source,'type',['foreign','session'],'me');
 assert.ok(result.comparisons.every(r=>r.sessionId==='session'));assert.ok(result.items.every(r=>r.subjectId==='a'));
 assert.deepEqual(enrichSessions(source,'different',['session'],'me'),{comparisons:[],items:[]});
});
test('preview is off by default and cannot be enabled against a non-mock database',()=>{
 const oldFlag=process.env.EXAM_ANALYSIS_PREVIEW,oldMock=process.env.MOCK_MODE;
 try {delete process.env.EXAM_ANALYSIS_PREVIEW;assert.equal(isExamPreviewEnabled(),false);process.env.EXAM_ANALYSIS_PREVIEW='true';process.env.MOCK_MODE='false';assert.equal(isExamPreviewEnabled(),false);process.env.MOCK_MODE='true';assert.equal(isExamPreviewEnabled(),true);}
 finally {if(oldFlag===undefined)delete process.env.EXAM_ANALYSIS_PREVIEW;else process.env.EXAM_ANALYSIS_PREVIEW=oldFlag;if(oldMock===undefined)delete process.env.MOCK_MODE;else process.env.MOCK_MODE=oldMock;}
});

test('regular and morning subject ranks share competition ties across both cohorts',()=>{
 for(const primarySubjectId of [null,'a']) {
  const source=fixture();source.sessions[0].primarySubjectId=primarySubjectId;
  source.students=[100,90,90,80].map((_,index)=>({id:`s${index}`,divisionId:'d',name:'테스트',studentNumber:String(index)}));
  source.participants=[100,90,90,80].map((score,index)=>({...source.participants[0],studentId:`s${index}`,subjectScores:{a:score},totalScore:score}));
  source.sessions[0].externalStats={subjects:{a:{count:4,mean:90,distribution:[{score:100,count:1},{score:90,count:2},{score:80,count:1}]}}};
  const ranks=source.students.map(student=>{const row=enrichSessions(source,'type',['session'],student.id).comparisons[0];return [row.internalRank,row.externalRank];});
  assert.deepEqual(ranks,[[1,1],[2,2],[2,2],[4,4]]);
 }
});

test('wrong-rate top five retains each exam, excludes absent statistics and includes my correct answers',()=>{
 const item=enrichSessions(fixture(),'type',['session'],'me').items[0];
 const items=['first','second'].flatMap(sessionId=>[80,20,20,60,30,90,null,101,-1].map((externalRate,index)=>({...item,id:`${sessionId}-${index}`,sessionId,itemNo:index+1,externalRate,correct:true})));
 const before=structuredClone(items),top=topWrongBySession(items);
 assert.equal(top.length,10);
 for(const session of ['first','second'])assert.deepEqual(top.filter(item=>item.sessionId===session).map(item=>item.itemNo),[2,3,5,4,1]);
 assert.ok(top.every(item=>item.correct===true));assert.deepEqual(items,before);
});

import { normalizeAnalysisSelection } from '../../lib/exam-preview/selection';
test('canonical reports preserve legacy student query links and ignore array inputs',()=>{
 assert.deepEqual(normalizeAnalysisSelection({analysisSession:'archived:2026-05-16'}),{kind:'regular',examTypeId:'archived',examDate:'2026-05-16'});
 assert.deepEqual(normalizeAnalysisSelection({morningType:'morning',morningFrom:'2026-09-01',morningTo:'2026-09-30'}),{kind:'morning',examTypeId:'morning',from:'2026-09-01',to:'2026-09-30'});
 assert.deepEqual(normalizeAnalysisSelection({examTypeId:['foreign'],analysisSession:'invalid'}),{});
});
