// Server only. Scores, keys, marks, names and item statistics never leave this parser.
import { workbook, rows, EXAM_IMPORT_LIMITS } from "./exam-import-parser";
import { badRequest } from "./errors";
import { normalizeYmdDate } from "./date-utils";

export type ParticipationFile = {
  examDate: string | null;
  students: { studentNumber: string; hasAnswer: boolean }[];
};
const text = (value: unknown) => String(value ?? "").trim();
function identifier(value: unknown) {
  const result = text(value);
  if (!/^\d{1,20}$/.test(result)) throw badRequest("수험번호가 비어 있거나 형식이 잘못된 행이 있습니다.");
  return result;
}
function header(data: unknown[][]) {
  const index = data.slice(0, 20).findIndex(row => row.some(v => text(v) === "수험번호"));
  if (index < 0) throw badRequest("수험번호 열을 찾을 수 없습니다.");
  const columns = data[index].flatMap((v, i) => text(v) === "수험번호" ? [i] : []);
  if (columns.length !== 1) throw badRequest("수험번호 열이 중복되었습니다.");
  return { index, column: columns[0] };
}

export function parseCumulativeAttendance(scoreBuffer: Buffer, analysisBuffer?: Buffer): ParticipationFile {
  const source = workbook(scoreBuffer);
  const score = rows(source, "Score"), errata = rows(source, "Errata");
  const sh = header(score), eh = header(errata);
  const ids = new Set<string>();
  for (const row of score.slice(sh.index + 1)) {
    if (row.every(v => !text(v))) continue;
    const id = identifier(row[sh.column]);
    if (ids.has(id)) throw badRequest("채점표에 중복 수험번호가 있습니다.");
    ids.add(id);
  }
  if (!ids.size || ids.size > EXAM_IMPORT_LIMITS.students) throw badRequest("채점표 인원을 확인해주세요.");
  // Exported answer keys use different column spacing from student answers.
  // Attendance uses only the second row of each three-row Errata block.
  const answerColumns = errata[eh.index].flatMap((v, i) => /^\d+$/.test(text(v)) ? [i] : []);
  if (!answerColumns.length) throw badRequest("오답표에서 답안 열을 찾을 수 없습니다.");
  const found = new Map<string, boolean>();
  for (let r = eh.index + 1; r < errata.length; r += 3) {
    if (errata.slice(r, r + 3).every(row => row.every(v => !text(v)))) continue;
    const id = identifier(errata[r]?.[eh.column]);
    if (!errata[r + 1] || !errata[r + 2] || text(errata[r + 1][eh.column]) || text(errata[r + 2][eh.column]))
      throw badRequest("오답표의 학생별 3행 구조를 확인해주세요.");
    if (found.has(id) || !ids.has(id)) throw badRequest("채점표와 오답표의 수험번호가 일치하지 않거나 중복되었습니다.");
    const answers = answerColumns.map(c => text(errata[r + 1][c]));
    if (answers.some(answer => answer && !/^\d+(,\d+)*$/.test(answer)))
      throw badRequest("답안 형식을 확인할 수 없습니다. 원본 채점표를 다시 내려받아 주세요.");
    found.set(id, answers.some(answer => !!answer));
  }
  if (found.size !== ids.size) throw badRequest("채점표와 오답표의 학생 수가 다릅니다.");
  let examDate: string | null = null;
  if (analysisBuffer) {
    const moon = rows(workbook(analysisBuffer), "Moon");
    const dates = moon.slice(0, 20).flatMap(row => row.flatMap((v, i) => text(v) === "시험일자" ? [text(row[i + 1])] : []));
    if (dates.length !== 1) throw badRequest("문항분석표의 시험일자를 확인해주세요.");
    examDate = normalizeYmdDate(dates[0], "파일 시험일자");
  }
  return { examDate, students: Array.from(found, ([studentNumber, hasAnswer]) => ({ studentNumber, hasAnswer })) };
}
