import * as XLSX from 'xlsx';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const out=fileURLToPath(new URL('../tests/fixtures/exam-import/',import.meta.url));
mkdirSync(out,{recursive:true});
const sourceScore=process.argv[2], sourceMoon=process.argv[3];
if(!sourceScore||!sourceMoon) throw new Error('Provide regular grading and analysis file paths. Originals are read only.');
const read=(p)=>XLSX.read(readFileSync(p),{type:'buffer'});
const data=(w,s)=>XLSX.utils.sheet_to_json(w.Sheets[s],{header:1,defval:''});
const grading=read(sourceScore),analysis=read(sourceMoon);
const sd=data(grading,'Score'),ed=data(grading,'Errata'),md=data(analysis,'Moon');
const studentCol=sd[0].indexOf('수험번호'), eStudent=ed[0].indexOf('수험번호');
const boundaries=ed[0].flatMap((v,i)=>Number(v)===1?[i]:[]);
const groups={public:[],special:[],partial:[],absent:[]};
for(let r=1;r<ed.length;r+=3){
 const blocks=boundaries.map((start,i)=>ed[r+1].slice(start,boundaries[i+1]??ed[0].length));
 const has=blocks.map(b=>b.some(v=>String(v).trim()));
 const category=!has.some(Boolean)?'absent':!has[0]&&!has[1]?'partial':has[0]&&has[2]&&has[3]?'public':has[1]&&has[2]&&has[3]?'special':null;
 if(!category)continue;
 const id=String(ed[r][eStudent]); if(!/^\d{5}$/.test(id))continue;
 const matches=sd.slice(1).filter(row=>String(row[studentCol])===id);
 if(matches.length===1)groups[category].push({score:matches[0],rows:ed.slice(r,r+3)});
}
const selection=[...groups.public.slice(0,6),...groups.special.slice(0,4),...groups.partial.slice(0,1),...groups.absent.slice(0,1)];
if(selection.length!==12)throw new Error('Required anonymous category coverage unavailable.');
function writePair(prefix,score,errata,moon){
 const g=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(g,XLSX.utils.aoa_to_sheet(score),'Score');XLSX.utils.book_append_sheet(g,XLSX.utils.aoa_to_sheet(errata),'Errata');
 const m=XLSX.utils.book_new();XLSX.utils.book_append_sheet(m,XLSX.utils.aoa_to_sheet(moon),'Moon');
 for(const [suffix,wb]of [['score',g],['moon',m]])writeFileSync(path.join(out,`${prefix}-${suffix}.xls`),XLSX.write(wb,{type:'buffer',bookType:'biff8'}));
}
// Rebuild cells from approved fields, never clone workbook properties or source sheets.
const sanitize=(header,row,id,name,identity)=>header.map((h,c)=>h==='성명'?(identity?name:''):h==='생년월일'?'':h==='수험번호'?(identity?id:''):row[c]??'');
const scores=[sd[0]],errata=[ed[0]];
selection.forEach((p,i)=>{const id=String(90001+i),name=`학생${String(i+1).padStart(2,'0')}`;scores.push(sanitize(sd[0],p.score,id,name,true));p.rows.forEach((row,j)=>errata.push(sanitize(ed[0],row,id,name,j===0)));});
const moon=md.map(row=>row.map(v=>v)); const meta=moon.find(row=>row.includes('응시인원'));meta[meta.indexOf('응시인원')+1]='12 명';
writePair('regular',scores,errata,moon);
// Synthetic morning covers the documented layout only; it is not original verification.
const mh=['문항번호','정답','최다오답선택지','1','2','3','4','기타','정답률(%)','과목명'];
const mm=[['시험일자','2026-09-08','','과목명','헌법','','','응시인원','8 명'],[],mh];
const keys=Array.from({length:20},(_,i)=>i===2?'3,4':String(i%4+1));
keys.forEach((k,i)=>mm.push([i+1,k,'2','25%','25%','25%','25%','0%','75%','헌법']));
for(let i=21;i<=25;i++)mm.push([i,'']);
const ms=[['수험번호','성명','응시분야','지원지역','생년월일','객관식','주관식']];
const me=[['수험번호','성명','응시분야','지원지역','생년월일',...Array.from({length:30},(_,i)=>i+1)]];
for(let i=0;i<8;i++) {const id=String(90001+i),name=`학생${String(i+1).padStart(2,'0')}`; const answers=keys.map((k,j)=>j===0?'2,4':j===1?'':k); const marks=keys.map((_,j)=>j<2?'X':'O');ms.push([id,name,0,'17','',90,0]);me.push([id,name,0,'17','',...keys,...Array(10).fill('')],['','','','','',...answers,...Array(10).fill('')],['','','','','',...marks,...Array(10).fill('')]);}
writePair('morning-synthetic',ms,me,mm);
writeFileSync(path.join(out,'README.md'),'# Exam import fixtures\n\nregular: regenerated BIFF8, 12 anonymous students (public 6, special 4, partial 1, absent 1). Original identifiers reassigned from 90001; names synthetic; DOB blank. No original workbook metadata retained.\n\nmorning-synthetic: 8 entirely synthetic students, 20 items, 10 padding columns, 5 padding rows, multiple answers. **Not verification of the missing original morning pair.**\n\nRegenerate: `node scripts/build-exam-import-fixtures.mjs <regular-score-path> <regular-moon-path>`. Reads originals without modifying/copying them. Malformed cases are generated in unit tests separately.\n','utf8');
console.log(JSON.stringify({regular:12,categories:{public:6,special:4,partial:1,absent:1},morningSynthetic:8}));
