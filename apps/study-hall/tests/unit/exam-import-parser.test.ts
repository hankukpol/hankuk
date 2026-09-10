import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { parseExamImportPair, mapErrataBlocksToSubjects, ExamImportParseError, EXAM_IMPORT_LIMITS } from '../../lib/exam-import-parser';
import { getExamImportParseReason } from '../../lib/exam-import-meta';
const fixture=(name:string)=>readFileSync(path.join(process.cwd(),'tests/fixtures/exam-import',name+'.xls'));
const regular=()=>[fixture('regular-score'),fixture('regular-moon')] as const;
const parse=()=>parseExamImportPair(...regular());
test('수험번호만으로 매칭한다 — 파일의 이름은 읽지도 저장하지도 않는다', () => {
 const [s,m]=regular();
 const named=(name:string)=>mutate(s,w=>{
  for(const sheet of ['Score','Errata']) {
   const ws=w.Sheets[sheet]; const data=XLSX.utils.sheet_to_json<unknown[]>(ws,{header:1});
   const col=data[0].findIndex(v=>v==='성명'||v==='이름'); assert.ok(col>=0);
   ws[XLSX.utils.encode_cell({r:1,c:col})]={t:'s',v:name};
  }
 });
 // OMR 에 적힌 이름이 명단과 달라도(«이볌수»/«이범수») 막지 않는다. 한 명 때문에
 // 나머지 학생의 성적이 통째로 들어가지 못하는 쪽이 나쁘다.
 for (const name of ['검증학생','전혀다른이름','']) {
  const result = parseExamImportPair(named(name), m);
  assert.equal(result.score[0].studentNumber, '90001');
  if (name) assert.ok(!JSON.stringify(result).includes(name), '파일의 이름은 결과에 남지 않는다');
 }
});
function mutate(buffer:Buffer, edit:(wb:XLSX.WorkBook)=>void):Buffer {const wb=XLSX.read(buffer,{type:'buffer'}); edit(wb);return XLSX.write(wb,{type:'buffer',bookType:'xlsx'});}
// 메시지는 이유를 말하되 파일 안의 값(이름·생년월일 등)은 절대 담지 않는다.
function rejects(score:Buffer,moon:Buffer,code:string){assert.throws(()=>parseExamImportPair(score,moon),(e:unknown)=>{
 assert.ok(e instanceof ExamImportParseError);assert.equal(e.code,code);
 assert.equal(e.message,getExamImportParseReason(code,e.detail));
 assert.ok(!/PRIVATE|SENTINEL|1999-12-31/.test(e.message),`메시지에 원본 값이 샜다: ${e.message}`);
 return true;});}
test('regular has 12 anonymous students and exact key mapping despite reversed Moon subjects',()=>{
 const p=parse(); assert.equal(p.score.length,12);assert.equal(p.moon.length,120);assert.equal(p.meta.examDate,'2026-08-15');
 assert.deepEqual(mapErrataBlocksToSubjects(p.errata[0].blocks,p.moon).map(b=>b.subjectName),['헌법','범죄학','형사법','경찰학']);
 assert.deepEqual(p.errata.map(s=>s.blocks.map(b=>b.answers.some(Boolean))),[...Array(6).fill([true,false,true,true]),...Array(4).fill([false,true,true,true]),[false,false,true,true],[false,false,false,false]]);
 for(const s of p.errata)for(const b of s.blocks)if(!b.answers.some(Boolean))assert.ok(b.marks.every(m=>m==='X'));
});
test('documented 2.5 point reconstruction agrees with original-derived fixture scores',()=>{
 const p=parse(),mapping=mapErrataBlocksToSubjects(p.errata[0].blocks,p.moon);
 for(const s of p.errata){const row=p.score.find(r=>r.studentNumber===s.studentNumber)!;let total=0;for(const b of s.blocks){if(!b.answers.some(Boolean))continue;const subject=mapping.find(m=>m.blockIndex===b.blockIndex)!.subjectName;const header=Object.keys(row.scores).find(h=>h.split('/').includes(subject))!;const score=b.marks.filter(m=>m==='O').length*2.5;assert.equal(score,row.scores[header]);total+=score;}assert.equal(total,row.scores['총점']);}
});
test('synthetic morning ignores padding and preserves multiple answers without calculating correctness',()=>{
 const p=parseExamImportPair(fixture('morning-synthetic-score'),fixture('morning-synthetic-moon'));assert.equal(p.moon.length,20);assert.equal(p.score.length,8);assert.equal(p.errata[0].blocks[0].answerKeys[2],'3,4');assert.equal(p.errata[0].blocks[0].answers[0],'2,4');assert.equal(p.errata[0].blocks[0].answers[1],null);assert.equal(p.score[0].scores['객관식'],90);
});
test('private columns discarded and numeric malformed IDs retained for service classification',()=>{
 const [s,m]=regular();const changed=mutate(s,w=>{for(const name of ['Score','Errata']){const ws=w.Sheets[name];ws.B2={t:'s',v:'PRIVATE_NAME_SENTINEL'};ws.E2={t:'s',v:'1999-12-31'};}for(let i=0;i<6;i++)w.Sheets.Score[`A${i+2}`]={t:'s',v:['','','','','1234','12'][i]};});
 const p=parseExamImportPair(changed,m);assert.equal(p.score.filter(r=>!/^\d{5}$/.test(r.studentNumber)).length,6);const json=JSON.stringify(p);assert.ok(!json.includes('PRIVATE_NAME_SENTINEL'));assert.ok(!json.includes('1999-12-31'));assert.ok(!json.includes('학생'));assert.deepEqual(Object.keys(p.score[0]).sort(),['region','scores','sourceRow','studentNumber']);
});
test('formatted leading zeros survive and sheet order remains independently keyed',()=>{
 const [s,m]=regular();const changed=mutate(s,w=>{w.Sheets.Score.A2={t:'n',v:123,z:'00000'};w.Sheets.Errata.A2={t:'s',v:'90002'};});const p=parseExamImportPair(changed,m);assert.equal(p.score[0].studentNumber,'00123');assert.equal(p.errata[0].studentNumber,'90002');
});
test('duplicate IDs are preserved for service ambiguity rejection, never positional joined',()=>{const [s,m]=regular();const p=parseExamImportPair(mutate(s,w=>{w.Sheets.Score.A3={...w.Sheets.Score.A2};}),m);assert.equal(p.score[0].studentNumber,p.score[1].studentNumber);assert.notEqual(p.errata[0].studentNumber,p.errata[1].studentNumber);});
test('Score columns found by header after reordering',()=>{const [s,m]=regular();const p=parseExamImportPair(mutate(s,w=>{const a=XLSX.utils.sheet_to_json<unknown[]>(w.Sheets.Score,{header:1});w.Sheets.Score=XLSX.utils.aoa_to_sheet(a.map(r=>[r[3],r[8],r[0],r[5],r[6],r[7],r[1],r[2],r[4]]));}),m);assert.equal(p.score[0].studentNumber,'90001');assert.equal(p.score[0].scores['총점'],parse().score[0].scores['총점']);});
test('rejects ambiguous or unmatched exact keys',()=>{const p=parse();assert.throws(()=>mapErrataBlocksToSubjects(p.errata[0].blocks,[...p.moon,...p.moon.filter(i=>i.subjectName==='헌법').map(i=>({...i,subjectName:'duplicate'}))]),ExamImportParseError);const blocks=structuredClone(p.errata[0].blocks);blocks[0].answerKeys[0]='99';assert.throws(()=>mapErrataBlocksToSubjects(blocks,p.moon),ExamImportParseError);});
for(const [title,edit,code] of [
 ['missing sheet',(w:XLSX.WorkBook)=>{delete w.Sheets.Errata;w.SheetNames=w.SheetNames.filter(s=>s!=='Errata');},'MISSING_SHEET'],
 ['inconsistent key',(w:XLSX.WorkBook)=>{w.Sheets.Errata.F5={t:'s',v:'99'};},'INCONSISTENT_KEYS'],
 ['invalid mark',(w:XLSX.WorkBook)=>{w.Sheets.Errata.F4={t:'s',v:'PRIVATE_SENTINEL'};},'INVALID_MARK'],
 ['formula',(w:XLSX.WorkBook)=>{w.Sheets.Score.F2={t:'n',v:1,f:'1+1'};},'FORMULA_CELL'],
 ['non-numeric ID',(w:XLSX.WorkBook)=>{w.Sheets.Score.A2={t:'s',v:'PRIVATE_SENTINEL'};},'INVALID_IDENTIFIER'],
 ['oversized sheet',(w:XLSX.WorkBook)=>{w.Sheets.Score['!ref']='A1:T16000';},'SHEET_SIZE'],
 ['incomplete student',(w:XLSX.WorkBook)=>{const a=XLSX.utils.sheet_to_json<unknown[]>(w.Sheets.Errata,{header:1});w.Sheets.Errata=XLSX.utils.aoa_to_sheet(a.slice(0,-1));},'INCOMPLETE_STUDENT_BLOCK'],
] as const)test(title+' fails without source values',()=>{const [s,m]=regular();rejects(mutate(s,edit),m,code);});
test('file limits and wrong formats are rejected safely',()=>{const [,m]=regular();rejects(Buffer.alloc(0),m,'FILE_SIZE');rejects(Buffer.alloc(EXAM_IMPORT_LIMITS.fileBytes+1),m,'FILE_SIZE');rejects(Buffer.from('PRIVATE_SENTINEL'),m,'FILE_FORMAT');});
test('missing metadata and duplicate Moon item numbers are rejected',()=>{const [s,m]=regular();rejects(s,mutate(m,w=>{w.Sheets.Moon.B2={t:'s',v:'2026-02-31'};}),'EXAM_DATE');rejects(s,mutate(m,w=>{w.Sheets.Moon.A6={t:'n',v:1};}),'ITEM_SEQUENCE');});
test('blank trailing rows ignored while nonempty padding and cohort mismatch fail',()=>{
 const s=fixture('morning-synthetic-score'),m=fixture('morning-synthetic-moon');
 const padded=mutate(s,w=>{w.Sheets.Score['!ref']='A1:G12';w.Sheets.Errata['!ref']='A1:AI30';});assert.equal(parseExamImportPair(padded,m).score.length,8);
 rejects(mutate(s,w=>{w.Sheets.Errata.Z3={t:'s',v:'1'};}),m,'BLOCK_PADDING');
 rejects(s,mutate(m,w=>{w.Sheets.Moon.I1={t:'s',v:'9 명'};}),'COHORT_MISMATCH');
});
test('Moon choice rates are percentages and source row addresses stay one-based',()=>{const p=parse();assert.equal(p.score[0].sourceRow,2);assert.equal(p.errata[1].sourceRow,5);assert.equal(p.moon[0].correctRatePct,67.8);assert.equal(p.moon[0].choiceRates['2'],67.8);});

// OMR 템플릿이 실제 출제 문항보다 길면 뒤쪽 블록이 통째로 비고 채점 표시만 남는다.
// 이 학원 아침 모의고사는 매번 그렇게 나온다(30문항 템플릿, 20문항 출제).
// 정답이 0개인 블록은 버리고, 정답이 일부라도 있는 블록의 여백은 계속 거부한다.
function paddedPair(keys:(string|null)[]):readonly [Buffer,Buffer] {
 const book=(sheets:Record<string,unknown[][]>)=>{const wb=XLSX.utils.book_new();for(const [name,rows] of Object.entries(sheets))XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),name);return XLSX.write(wb,{type:'buffer',bookType:'xlsx'}) as Buffer;};
 const moon=[['시험일자','2026-08-15'],['응시인원','2 명'],[],['문항번호','정답','과목명','정답률(%)','1','2','3','4','기타','최다오답선택지'],
  ...[1,2,3].map(n=>[n,String(n),'과목A','50','25','25','25','25','0','1'])];
 const score=[['수험번호','지원지역','과목A'],['90001','서울','5'],['90002','서울','5']];
 // 헤더가 1,2,3 · 1,2 이므로 블록 두 개(3문항 + 2문항)다. 두 번째가 여백 블록이다.
 const errata:unknown[][]=[['수험번호','1','2','3','1','2']];
 for(const id of ['90001','90002']){
  errata.push([id,'1','2','3',...keys]);
  errata.push([null,'1','2','3',null,null]);
  errata.push([null,'O','O','O','X','X']);
 }
 return [book({Score:score,Errata:errata}),book({Moon:moon})] as const;
}
test('a trailing block with no answer key at all is dropped, not rejected',()=>{
 const p=parseExamImportPair(...paddedPair([null,null]));
 assert.equal(p.errata.length,2);
 // 여백 블록은 사라지고 실제 출제된 3문항 블록만 남는다.
 assert.deepEqual(p.errata.map(s=>s.blocks.map(b=>b.answerKeys.length)),[[3],[3]]);
 assert.deepEqual(p.errata[0].blocks[0].marks,['O','O','O']);
 assert.deepEqual(mapErrataBlocksToSubjects(p.errata[0].blocks,p.moon).map(b=>b.subjectName),['과목A']);
});
test('a trailing block with a partial answer key still fails, so absent items are never scored',()=>{
 // 정답이 1번에만 있고 2번 채점 표시가 남아 있으면 없는 문항을 오답으로 지어내게 된다.
 rejects(...paddedPair(['1',null]),'BLOCK_PADDING');
});
