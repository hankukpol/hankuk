/**
 * 아침 모의고사 성적 붙여넣기·CSV 업로드가 공유하는 파서.
 *
 * 학원 채점표는 "수험번호 / 성명 / 응시분야 / 지원지역 / 생년월일 / 객관식 / 주관식"
 * 처럼 점수가 3번째 칸이 아닌 경우가 많다. 머리글이 있으면 열 위치를 읽어내고,
 * 없으면 기존처럼 자리 순서로 해석한다.
 */

export type ExamScoreColumns = {
  studentNumberIndex: number;
  scoreIndex: number;
  notesIndex: number | null;
};

export type ParsedExamScoreRow = {
  studentNumber: string;
  score: string;
  notes: string;
};

export type ParseExamScoreResult = {
  rows: ParsedExamScoreRow[];
  /** 머리글에서 열 위치를 읽어냈으면 true. 화면 안내 문구를 바꾸는 데 쓴다. */
  usedHeader: boolean;
  columns: ExamScoreColumns | null;
};

const STUDENT_NUMBER_LABELS = ["수험번호", "수험 번호", "학번", "번호"];
const SCORE_LABELS = ["객관식", "점수", "총점", "합계", "득점"];
const NOTES_LABELS = ["비고", "메모", "특이사항"];

function normalizeLabel(value: string) {
  return value.trim().replaceAll(" ", "");
}

function findLabelIndex(cells: string[], labels: string[]) {
  const normalized = labels.map(normalizeLabel);
  return cells.findIndex((cell) => normalized.includes(normalizeLabel(cell)));
}

/**
 * 머리글 줄에서 수험번호·점수·비고 열 위치를 찾는다.
 * 수험번호와 점수를 모두 찾지 못하면 머리글로 인정하지 않는다.
 */
export function detectExamScoreColumns(cells: string[]): ExamScoreColumns | null {
  const studentNumberIndex = findLabelIndex(cells, STUDENT_NUMBER_LABELS);
  const scoreIndex = findLabelIndex(cells, SCORE_LABELS);

  if (studentNumberIndex === -1 || scoreIndex === -1) {
    return null;
  }

  const notesIndex = findLabelIndex(cells, NOTES_LABELS);

  return {
    studentNumberIndex,
    scoreIndex,
    notesIndex: notesIndex === -1 ? null : notesIndex,
  };
}

/**
 * 머리글이 없을 때의 자리 순서 해석.
 * 2칸이면 "수험번호 / 점수", 3칸 이상이면 "수험번호 / 이름 / 점수 / 비고".
 */
function getPositionalColumns(cellCount: number): ExamScoreColumns {
  if (cellCount >= 3) {
    return { studentNumberIndex: 0, scoreIndex: 2, notesIndex: 3 };
  }

  return { studentNumberIndex: 0, scoreIndex: 1, notesIndex: null };
}

function isSkippableLine(cells: string[]) {
  const first = cells[0]?.trim() ?? "";
  return !first || first.toLowerCase().startsWith("sep=");
}

export function parseExamScoreRows(lines: string[][]): ParseExamScoreResult {
  const usable = lines.filter((cells) => !isSkippableLine(cells));

  if (usable.length === 0) {
    return { rows: [], usedHeader: false, columns: null };
  }

  const headerColumns = detectExamScoreColumns(usable[0]);
  const body = headerColumns ? usable.slice(1) : usable;
  const rows: ParsedExamScoreRow[] = [];

  for (const cells of body) {
    const columns = headerColumns ?? getPositionalColumns(cells.length);
    const studentNumber = cells[columns.studentNumberIndex]?.trim() ?? "";

    // 머리글이 없어도 머리글 줄이 섞여 들어오면 학생과 매칭되지 않으니 미리 걸러낸다.
    if (!studentNumber || detectExamScoreColumns(cells)) {
      continue;
    }

    rows.push({
      studentNumber,
      score: cells[columns.scoreIndex]?.trim() ?? "",
      notes: columns.notesIndex === null ? "" : cells[columns.notesIndex]?.trim() ?? "",
    });
  }

  return { rows, usedHeader: headerColumns !== null, columns: headerColumns };
}

export type ExamScoreApplyReport = {
  matchedCount: number;
  unmatchedStudentNumbers: string[];
};

/** 붙여넣기 결과를 사람이 읽을 수 있는 한 줄로 만든다. */
export function describeExamScoreApply(report: ExamScoreApplyReport) {
  if (report.matchedCount === 0) {
    return "매칭된 학생이 없습니다. 수험번호가 학생 명단과 같은지 확인해 주세요.";
  }

  if (report.unmatchedStudentNumbers.length === 0) {
    return `${report.matchedCount}명의 성적을 반영했습니다.`;
  }

  return `${report.matchedCount}명 반영, ${report.unmatchedStudentNumbers.length}건은 명단에 없어 건너뛰었습니다.`;
}
