/** Synthetic review data only, in an isolated directory. Never invoked by the application. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { readMockState, writeMockState, type MockExamTypeRecord, type MockStudentRecord } from '../../lib/mock-store';
import { DEFAULT_EXAM_ANALYSIS_SETTINGS } from '../../lib/exam-analysis-settings';
import { defaultMorningAnalysisRange } from '../../lib/morning-exam-analysis-schemas';
import { morningWeek } from '../../lib/morning-exam-analysis-assembler';

async function main() {
 assert.equal(process.env.MOCK_MODE,'true');
 assert.ok(process.env.MOCK_DB_DIR && path.resolve(process.env.MOCK_DB_DIR).includes(`${path.sep}exam-preview${path.sep}`),'Dedicated exam-preview store required');
 const state=await readMockState(), stamp=new Date().toISOString(), today=defaultMorningAnalysisRange().to;
 const at=(n:number)=>new Date(Date.parse(`${today}T00:00:00Z`)+n*86400000).toISOString().slice(0,10);
 const manifest:{division:string;studentId:string;studentNumber:string;studentName:string;adminEmail:string;regularTypeId:string;morningTypeId:string;from:string;to:string}[]=[];
 // Fresh isolated fixture state only; no existing workspace/operating state is loaded.
 state.academyApplications=[];
 for (const [divisionIndex,slug] of Array.from(['police','fire'].entries())) {
  const division=state.divisions.find(d=>d.slug===slug)!;
  const actor=state.admins.find(a=>a.divisionSlug===slug&&a.role==='ADMIN')!;
  const base=state.studentsByDivision[slug][0];
  assert.ok(base,'Default synthetic student template required');
  const students:MockStudentRecord[]=Array.from({length:12},(_,i)=>({...structuredClone(base),id:`preview-${slug}-s${i}`,divisionId:division.id,divisionSlug:slug,name:`테스트 ${['김서준','이민서','박도윤','최하윤','정지호','강서연','윤수빈','장시우','임지안','한도현','오채원','신현우'][i]}`,studentNumber:`98${String(i+1).padStart(3,'0')}`,phone:null,seatId:null,seatLabel:null,status:'ACTIVE',studyTrack:null,courseStartDate:at(-100),courseEndDate:at(100),createdAt:stamp,updatedAt:stamp}));
  state.studentsByDivision[slug]=students;
  state.examSessionsByDivision[slug]=[];state.examSessionParticipantsByDivision[slug]=[];state.examSessionItemsByDivision[slug]=[];state.examItemResponsesByDivision[slug]=[];
  state.examScoresByDivision[slug]=[];state.morningExamScoresByDivision[slug]=[];state.scoreTargetsByDivision[slug]=[];state.attendanceByDivision[slug]=[];state.phoneSubmissionsByDivision[slug]=[];
  const settings=state.divisionSettingsByDivision[slug];
  settings.examAnalysis=structuredClone(DEFAULT_EXAM_ANALYSIS_SETTINGS);
  settings.examAnalysis.common.easyMissedRatePercent=divisionIndex?90:70;
  const types:MockExamTypeRecord[]=(['REGULAR','MORNING'] as const).map((category,k)=>({id:`preview-${slug}-${category.toLowerCase()}`,divisionId:division.id,name:k?'미리보기 아침모의고사':'미리보기 정기모의고사',category,isActive:true,studyTrack:null,displayOrder:k,createdAt:stamp,updatedAt:stamp,
   subjects:['헌법','형사법','경찰학'].map((name,i)=>({id:`preview-${slug}-${k}-subject${i}`,examTypeId:`preview-${slug}-${category.toLowerCase()}`,name:divisionIndex?['소방학개론','소방관계법규','행정법'][i]:name,totalItems:20,pointsPerItem:5,displayOrder:i,isActive:true,alternateGroup:null,createdAt:stamp,updatedAt:stamp}))}));
  state.examTypesByDivision[slug]=types;
  for(const type of types) {
   const morning=type.category==='MORNING';
   for(let round=0;round<(morning?9:3);round++) {
    const date=at(morning?round-8:(round-2)*14);
    const subjects=morning?[type.subjects[round%3]]:type.subjects;
    const sessionId=`${type.id}-${round}`, participants=students.filter((_,i)=>!(morning&&round===8&&i===0));
    const points=divisionIndex?4:5, full=subjects.length*20*points;
    const totals=participants.map((_,i)=>subjects.reduce((sum,__,j)=>sum+(20-((i+round+j*2)%9))*points,0));
    const distribution=Array.from(new Set(totals)).sort((a,b)=>a-b).map(score=>({score,count:totals.filter(t=>t===score).length}));
    const externalSubjects=Object.fromEntries(subjects.map((s,j)=>{
     const scores=participants.map((_,i)=>(20-((i+round+j*2)%9))*points);const ranked=participants.map((_,i)=>i).sort((a,b)=>totals[b]-totals[a]||a-b);
     const top=(ratio:number)=>ranked.slice(0,Math.ceil(ranked.length*ratio)).reduce((sum,i)=>sum+scores[i],0)/Math.ceil(ranked.length*ratio);
     return [s.id,{count:scores.length,mean:scores.reduce((a,b)=>a+b,0)/scores.length,distribution:Array.from(new Set(scores)).sort((a,b)=>a-b).map(score=>({score,count:scores.filter(n=>n===score).length})),top10Avg:top(.1),top30Avg:top(.3),top10Count:Math.ceil(scores.length*.1),top30Count:Math.ceil(scores.length*.3),top10Complete:true,top30Complete:true}];
    }));
    state.examSessionsByDivision[slug].push({id:sessionId,divisionId:division.id,examTypeId:type.id,identityKey:sessionId,primarySubjectId:morning?subjects[0].id:null,examDate:date,topic:morning?['기본 개념과 적용','주요 이론의 비교','사례 판단과 기출 복습'][round%3]:null,itemCount:subjects.length*20,fullScore:full,externalCohortSize:participants.length+1,externalStats:{count:totals.length,mean:totals.reduce((a,b)=>a+b,0)/totals.length,distribution,subjects:externalSubjects,regions:{}},sourceFileName:'synthetic-preview.xlsx',importedById:actor.id,importedAt:stamp});
    for(const [j,subject] of Array.from(subjects.entries())) for(let n=1;n<=20;n++) {
     const key=String(n%4+1),wrong=key==='1'?'2':'1',rate=[84,68,43,76][n%4];
     const choices=Object.fromEntries(['1','2','3','4'].map(c=>[c,c===key?rate:(100-rate)/3]));
     state.examSessionItemsByDivision[slug].push({id:`${sessionId}-${subject.id}-${n}`,divisionId:division.id,sessionId,subjectId:subject.id,itemNo:n,position:j*20+n,answerKey:key,points,correctRatePct:rate,choiceRates:choices,mostCommonWrong:wrong});
    }
    for(const [i,student] of Array.from(participants.entries())) {
     const subjectScores=Object.fromEntries(subjects.map((s,j)=>[s.id,(20-((i+round+j*2)%9))*points]));
     const scoreId=`${sessionId}-${student.id}-score`;
     state.examSessionParticipantsByDivision[slug].push({id:`${sessionId}-${student.id}`,divisionId:division.id,sessionId,studentId:student.id,region:null,subjectScores,totalScore:totals[i],isPartial:false,externalRank:1+totals.filter(t=>t>totals[i]).length,externalPercentile:null,regionalRank:null,derivedScoreId:scoreId});
     if(morning) state.morningExamScoresByDivision[slug].push({id:scoreId,studentId:student.id,examTypeId:type.id,subjectId:subjects[0].id,examDate:date,score:totals[i],...morningWeek(date),notes:'테스트 데이터',recordedById:actor.id,createdAt:stamp,updatedAt:stamp});
     else state.examScoresByDivision[slug].push({id:scoreId,studentId:student.id,examTypeId:type.id,examRound:round+1,examDate:date,scores:subjectScores,totalScore:totals[i],rankInClass:1+totals.filter(t=>t>totals[i]).length,notes:'테스트 데이터',recordedById:actor.id,createdAt:stamp,updatedAt:stamp});
     for(const [j,s] of Array.from(subjects.entries())) for(let n=1;n<=20;n++) {
      const correct=n<=20-((i+round+j*2)%9),key=String(n%4+1),answer=correct?key:n===20?null:key==='1'?'2':'1';
      state.examItemResponsesByDivision[slug].push({id:`${sessionId}-${student.id}-${s.id}-${n}`,divisionId:division.id,sessionId,studentId:student.id,subjectId:s.id,itemNo:n,answer,isCorrect:correct});
     }
    }
   }
  }
  state.scoreTargetsByDivision[slug].push({id:`${slug}-target`,studentId:students[0].id,examTypeId:types[0].id,targetScore:divisionIndex?220:280,note:'테스트 목표',createdAt:stamp,updatedAt:stamp});
  state.examScoresByDivision[slug].push({id:`${slug}-manual`,studentId:students[0].id,examTypeId:types[0].id,examRound:0,examDate:at(-40),scores:{[types[0].subjects[0].id]:65},totalScore:65,rankInClass:null,notes:'수기 기록 검증',recordedById:actor.id,createdAt:stamp,updatedAt:stamp});
  const period=state.periodsByDivision[slug][0];
  for(let i=0;i<5;i++) {
   state.attendanceByDivision[slug].push({id:`${slug}-attendance-${i}`,studentId:students[0].id,periodId:period.id,date:at(-i),status:i===1?'TARDY':'PRESENT',reason:null,checkInTime:null,recordedById:actor.id,createdAt:stamp,updatedAt:stamp});
   state.phoneSubmissionsByDivision[slug].push({id:`${slug}-phone-${i}`,divisionId:division.id,studentId:students[0].id,periodId:period.id,date:at(-i),status:i===1?'NOT_SUBMITTED':'SUBMITTED',rentalNote:null,recordedById:actor.id,createdAt:stamp,updatedAt:stamp});
  }
  manifest.push({division:slug,studentId:students[0].id,studentName:students[0].name,studentNumber:students[0].studentNumber,adminEmail:actor.email,regularTypeId:types[0].id,morningTypeId:types[1].id,from:at(-8),to:today});
 }
 await writeMockState(state);
 await writeFile(path.join(process.env.MOCK_DB_DIR!,'manifest.json'),JSON.stringify(manifest,null,2),'utf8');
 console.log('Isolated exam preview fixtures ready.');
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
