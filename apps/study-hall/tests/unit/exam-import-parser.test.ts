import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { parseExamImportPair, mapErrataBlocksToSubjects, ExamImportParseError, EXAM_IMPORT_LIMITS } from '../../lib/exam-import-parser';
const fixture=(name:string)=>readFileSync(path.join(process.cwd(),'tests/fixtures/exam-import',name+'.xls'));
const regular=()=>[fixture('regular-score'),fixture('regular-moon')] as const;
const parse=()=>parseExamImportPair(...regular());
function mutate(buffer:Buffer, edit:(wb:XLSX.WorkBook)=>void):Buffer {const wb=XLSX.read(buffer,{type:'buffer'}); edit(wb);return XLSX.write(wb,{type:'buffer',bookType:'xlsx'});}
function rejects(score:Buffer,moon:Buffer,code:string){assert.throws(()=>parseExamImportPair(score,moon),(e:unknown)=>e instanceof ExamImportParseError&&e.code===code&&e.message==='시험 파일의 형식 또는 용량을 확인해 주세요.');}
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
