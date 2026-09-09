// Server-side only: never import this module into a client component.
import * as XLSX from "xlsx";

import { getExamImportParseReason } from "@/lib/exam-import-meta";

export interface RawScoreRow { studentNumber: string; sourceRow: number; region: string | null; scores: Record<string, number | null> }
export interface RawErrataBlock { blockIndex: number; itemNumbers: number[]; answerKeys: string[]; answers: (string | null)[]; marks: ("O" | "X")[] }
export interface RawErrataStudent { studentNumber: string; sourceRow: number; blocks: RawErrataBlock[] }
export interface RawMoonItem { subjectName: string; itemNo: number; answerKey: string; correctRatePct: number | null; choiceRates: Record<string, number>; mostCommonWrong: string | null }
export interface ParsedExamImport { score: RawScoreRow[]; errata: RawErrataStudent[]; moon: RawMoonItem[]; meta: { examDate: string; cohortSize: number; subjectNames: string[] } }
export const EXAM_IMPORT_LIMITS = { fileBytes: 5 * 1024 * 1024, rows: 15001, columns: 512, students: 5000, items: 500 } as const;
export class ExamImportParseError extends Error {
  // detail 에는 개수·행번호·시트 이름만 담는다. 파일 안의 값은 메시지에 넣지 않는다.
  constructor(public readonly code: string, public readonly detail?: string) {
    super(getExamImportParseReason(code, detail)); this.name = "ExamImportParseError";
  }
}
const fail = (code: string, detail?: string): never => { throw new ExamImportParseError(code, detail); };
const str = (v: unknown): string => v == null ? "" : String(v).trim();
const key = (v: unknown): string => { const s = str(v).replace(/\s/g, ""); if (!/^\d+(,\d+)*$/.test(s) || s.length > 40) fail("INVALID_ANSWER"); return s; };
const label = (v: unknown): string => { const s = str(v); if (!s || s.length > 100 || ["__proto__", "constructor", "prototype"].includes(s)) fail("INVALID_HEADER"); return s; };
function number(v: unknown, percentage = false): number | null {
  const s = str(v); if (!s) return null;
  if (!/^\d+(\.\d+)?%?$/.test(s) || (!percentage && s.endsWith("%"))) fail("INVALID_NUMBER");
  const n = Number(s.replace(/%$/, "")); if (!Number.isFinite(n) || (percentage && n > 100)) fail("INVALID_NUMBER"); return n;
}
function workbook(buffer: Buffer): XLSX.WorkBook {
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > EXAM_IMPORT_LIMITS.fileBytes) fail("FILE_SIZE");
  // Only binary Excel and zipped OOXML; do not silently accept HTML/CSV as a workbook.
  if (!(buffer.subarray(0, 8).equals(Buffer.from([208,207,17,224,161,177,26,225])) || buffer.subarray(0, 2).toString() === "PK")) fail("FILE_FORMAT");
  try { return XLSX.read(buffer, { type: "buffer", cellFormula: true, cellHTML: false, cellText: true, sheetRows: EXAM_IMPORT_LIMITS.rows + 1 }); }
  catch { return fail("WORKBOOK_READ"); }
}
function rows(wb: XLSX.WorkBook, name: string): unknown[][] {
  const ws = wb.Sheets[name]; if (!ws || !ws["!ref"]) fail("MISSING_SHEET", `${name} 시트 없음`);
  const range = XLSX.utils.decode_range(ws["!fullref"] || ws["!ref"]!);
  if (range.e.r >= EXAM_IMPORT_LIMITS.rows || range.e.c >= EXAM_IMPORT_LIMITS.columns) fail("SHEET_SIZE");
  for (const [address, cell] of Object.entries(ws)) if (!address.startsWith("!") && cell && typeof cell === "object" && "f" in cell) fail("FORMULA_CELL");
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: false, blankrows: true });
}
function header(data: unknown[][], names: string[]): number {
  const index = data.slice(0, 20).findIndex(row => names.every(name => row.some(v => str(v) === name)));
  if (index < 0) fail("MISSING_HEADER", `찾는 열: ${names.join(", ")}`); return index;
}
function col(row: unknown[], name: string): number {
  const indexes = row.flatMap((v, i) => str(v) === name ? [i] : []);
  if (indexes.length !== 1) fail("DUPLICATE_OR_MISSING_HEADER", `${name} 열 ${indexes.length}개`); return indexes[0];
}
function studentNumber(v: unknown): string {
  const s = str(v); if (s && !/^\d{1,20}$/.test(s)) fail("INVALID_IDENTIFIER"); return s;
}
export function mapErrataBlocksToSubjects(blocks: Pick<RawErrataBlock, "blockIndex" | "itemNumbers" | "answerKeys">[], moon: RawMoonItem[]): { blockIndex: number; subjectName: string }[] {
  const names = Array.from(new Set(moon.map(item => item.subjectName)));
  const used = new Set<string>();
  const mapped = blocks.map(block => {
    const candidates = names.filter(name => { const items = moon.filter(item => item.subjectName === name).sort((a,b) => a.itemNo-b.itemNo); return items.length === block.answerKeys.length && items.every((item,i) => item.itemNo === block.itemNumbers[i] && item.answerKey === block.answerKeys[i]); });
    if (candidates.length !== 1 || used.has(candidates[0])) fail("AMBIGUOUS_BLOCK_MAPPING");
    used.add(candidates[0]); return { blockIndex: block.blockIndex, subjectName: candidates[0] };
  });
  if (used.size !== names.length) fail("INCOMPLETE_BLOCK_MAPPING"); return mapped;
}
export function parseExamImportPair(scoreBuffer: Buffer, moonBuffer: Buffer, roster: ReadonlyArray<{ studentNumber: string; name: string }> = []): ParsedExamImport {
  // Identity checks stay in memory; neither names nor birth dates enter parsed/stored data.
  const registered = new Map(roster.map(student => [student.studentNumber, student.name.trim().normalize('NFC')]));
  const nameColumn = (row: unknown[]) => {
    const indexes = row.flatMap((value, index) => ['성명', '이름'].includes(str(value)) ? [index] : []);
    if (indexes.length > 1) fail('DUPLICATE_OR_MISSING_HEADER', '성명 열 중복');
    return indexes[0];
  };
  const checkIdentity = (row: unknown[], numberIndex: number, nameIndex: number | undefined, source: string, rowNumber: number) => {
    const expected = registered.get(str(row[numberIndex]));
    if (expected === undefined || nameIndex === undefined) return;
    // 파일이 이름을 주지 않은 것과 이름이 다른 것은 다른 일이다. OMR 출력은 성명을
    // 자주 비운다 — 이 학원의 정기 채점표는 수험번호가 있는 316행 중 14행이 그렇다.
    // 빈 칸을 불일치로 보면 그런 학생이 한 명만 등록돼 있어도 파일 전체가 거부된다.
    // 대조할 이름이 양쪽에 다 있을 때만 판정한다.
    const found = str(row[nameIndex]).normalize('NFC');
    if (!found || !expected) return;
    if (found !== expected) fail('STUDENT_IDENTITY_MISMATCH', `${source} ${rowNumber}행`);
  };
  try {
    const grading = workbook(scoreBuffer), analysis = workbook(moonBuffer);
    const md = rows(analysis, "Moon"); const mh = header(md, ["문항번호", "정답", "과목명"]);
    // Some exports have a merged group header followed by the actual choice labels.
    const mhi = md[mh + 1]?.some(v => str(v) === "문항번호") ? mh + 1 : mh;
    const h = md[mhi], ni = col(h,"문항번호"), ai = col(h,"정답"), si = col(h,"과목명");
    const rate = col(h,"정답률(%)"), wrong = col(h,"최다오답선택지");
    const moon: RawMoonItem[] = [];
    for (const row of md.slice(mhi+1)) {
      if (!str(row[ai])) continue;
      const itemNo = number(row[ni]); if (!itemNo || !Number.isInteger(itemNo)) fail("ITEM_NUMBER");
      const subjectName = label(row[si]); const choiceRates: Record<string,number> = {};
      for (const choice of ["1","2","3","4","기타"]) { const ci = col(h,choice); const n = number(row[ci],true); if (n != null) choiceRates[choice === "기타" ? "etc" : choice] = n; }
      moon.push({ subjectName,itemNo: itemNo!,answerKey:key(row[ai]),correctRatePct:number(row[rate],true),choiceRates,mostCommonWrong:str(row[wrong]) ? key(row[wrong]) : null });
    }
    if (!moon.length || moon.length > EXAM_IMPORT_LIMITS.items) fail("ITEM_COUNT", `문항 ${moon.length}개, 최대 ${EXAM_IMPORT_LIMITS.items}개`);
    const subjectNames = Array.from(new Set(moon.map(item=>item.subjectName)));
    for (const name of subjectNames) { const items = moon.filter(item=>item.subjectName === name).sort((a,b)=>a.itemNo-b.itemNo); if (items.some((item,i)=>item.itemNo !== i+1)) fail("ITEM_SEQUENCE", `${name} 과목, 문항 ${items.length}개`); }
    const metadata = (name: string): unknown => { for (const row of md.slice(0,mh)) { const i=row.findIndex(v=>str(v)===name); if(i>=0) return row[i+1]; } return fail("MISSING_METADATA"); };
    const examDate = str(metadata("시험일자")); if (!/^\d{4}-\d{2}-\d{2}$/.test(examDate) || !Number.isFinite(Date.parse(examDate)) || new Date(examDate).toISOString().slice(0,10)!==examDate) fail("EXAM_DATE");
    const cohortSize = number(str(metadata("응시인원")).replace(/\s*명$/, "")); if (cohortSize == null || !Number.isInteger(cohortSize) || cohortSize<1 || cohortSize>EXAM_IMPORT_LIMITS.students) fail("COHORT_SIZE");
    const sd=rows(grading,"Score"), sh=header(sd,["수험번호","지원지역"]), sn=col(sd[sh],"수험번호"), sr=col(sd[sh],"지원지역");
    const scoreName = nameColumn(sd[sh]);
    sd.slice(sh + 1).forEach((row, index) => checkIdentity(row, sn, scoreName, '채점표', sh + index + 2));
    const ignored = new Set(["수험번호","성명","이름","응시분야","지원지역","생년월일"]);
    const scoreColumns=sd[sh].flatMap((v,i)=>str(v) && !ignored.has(str(v)) ? [{name:label(v),index:i}] : []);
    if (!scoreColumns.length || new Set(scoreColumns.map(c=>c.name)).size!==scoreColumns.length) fail("SCORE_HEADERS");
    const score: RawScoreRow[]=[];
    sd.slice(sh+1).forEach((row,i)=>{ if(row.every(v=>!str(v))) return; const scores: Record<string,number|null>={}; for(const c of scoreColumns) scores[c.name]=number(row[c.index]); const region=str(row[sr]); if(region.length>40) fail("REGION"); score.push({studentNumber:studentNumber(row[sn]),sourceRow:sh+i+2,region:region||null,scores}); });
    const ed=rows(grading,"Errata"), eh=header(ed,["수험번호"]), en=col(ed[eh],"수험번호");
    const errataName = nameColumn(ed[eh]);
    const columns:number[][]=[];
    ed[eh].forEach((v,i)=>{const s=str(v); if(!/^\d+$/.test(s)) return; const n=Number(s); if(n===1) columns.push([]); if(!columns.length || n!==columns[columns.length-1].length+1) fail("BLOCK_SEQUENCE"); columns[columns.length-1].push(i);});
    if(!columns.length) fail("MISSING_BLOCKS");
    const errata:RawErrataStudent[]=[]; let canonical:string|undefined;
    for(let r=eh+1;r<ed.length;r+=3) {
      if(ed.slice(r).every(row=>row.every(v=>!str(v)))) break;
      if(!ed[r+1] || !ed[r+2]) fail("INCOMPLETE_STUDENT_BLOCK");
      checkIdentity(ed[r], en, errataName, '오답표', r + 1);
      const blocks:RawErrataBlock[]=columns.map((cs,blockIndex)=>{
        const active=cs.filter(c=>str(ed[r][c]));
        // 정답이 하나도 없는 블록은 아래 filter 가 통째로 버린다. OMR 템플릿이 실제
        // 출제 문항보다 길면 뒤쪽 블록이 통째로 비고 채점 표시만 남는데, 채점할 정답이
        // 없으니 만들어낼 데이터도 없다. 문항분석표 쪽도 정답 없는 행을 같은 이유로 건너뛴다.
        // 정답이 일부라도 있는 블록의 여백은 계속 거부한다 — 그건 정답 없는 문항을
        // 오답으로 지어내는 경우다.
        if(active.length && (active.some((c,i)=>c!==cs[i]) || cs.slice(active.length).some(c=>str(ed[r+1][c])||str(ed[r+2][c])))) fail("BLOCK_PADDING", `오답표 ${r+1}행, ${blockIndex+1}번째 문항 묶음: 정답 ${active.length}개 / 문항 열 ${cs.length}개`);
        const marks=active.map(c=>{const s=str(ed[r+2][c]).toUpperCase(); if(s!=="O"&&s!=="X") fail("INVALID_MARK"); return s as "O"|"X";});
        return {blockIndex,itemNumbers:active.map((_,i)=>i+1),answerKeys:active.map(c=>key(ed[r][c])),answers:active.map(c=>str(ed[r+1][c])?key(ed[r+1][c]):null),marks};
      }).filter(b=>b.answerKeys.length);
      const signature=JSON.stringify(blocks.map(b=>b.answerKeys)); if(canonical && canonical!==signature) fail("INCONSISTENT_KEYS"); canonical=signature;
      // No cross-sheet positional matching; the service rejects duplicate identifiers.
      if(str(ed[r+1][en]) || str(ed[r+2][en])) fail("IDENTIFIER_PLACEMENT");
      errata.push({studentNumber:studentNumber(ed[r][en]),sourceRow:r+1,blocks});
    }
    if(!score.length || !errata.length || score.length>EXAM_IMPORT_LIMITS.students || errata.length>EXAM_IMPORT_LIMITS.students) fail("STUDENT_COUNT", `채점표 ${score.length}명 · 오답표 ${errata.length}명`);
    if(score.length!==cohortSize || errata.length!==cohortSize) fail("COHORT_MISMATCH", `응시인원 ${cohortSize}명 · 채점표 ${score.length}명 · 오답표 ${errata.length}명`);
    mapErrataBlocksToSubjects(errata[0].blocks,moon);
    return {score,errata,moon,meta:{examDate,cohortSize: cohortSize!,subjectNames}};
  } catch(error) { if(error instanceof ExamImportParseError) throw error; return fail("INVALID_WORKBOOK"); }
}

