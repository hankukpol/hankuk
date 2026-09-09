/** 일괄 등록 미리보기 한 줄. */
export type ParsedBulkStudentRow = {
  key: string;
  studentNumber: string;
  name: string;
  /** 명단에 이미 있거나 붙여넣은 목록 안에서 중복된 행. 기본 선택에서 제외된다. */
  duplicateReason: "REGISTERED" | "REPEATED" | null;
};

const HEADER_LABELS = new Set(["수험번호", "학번", "번호"]);

/**
 * 첫 두 칸을 수험번호·이름으로 읽는다.
 * 채점표처럼 뒤에 열이 더 붙어 있어도 통째로 붙여넣을 수 있도록 나머지 칸은 무시하고,
 * 수험번호나 이름이 비어 있는 줄과 머리글 줄은 건너뛴다.
 */
export function parseBulkStudentRows(
  lines: string[][],
  registeredStudentNumbers: ReadonlySet<string>,
): ParsedBulkStudentRow[] {
  const rows: ParsedBulkStudentRow[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < lines.length; index += 1) {
    const cols = lines[index];
    const studentNumber = cols[0]?.trim() ?? "";
    const name = cols[1]?.trim() ?? "";

    if (!studentNumber || !name || HEADER_LABELS.has(studentNumber)) {
      continue;
    }

    const duplicateReason = registeredStudentNumbers.has(studentNumber)
      ? "REGISTERED"
      : seen.has(studentNumber)
        ? "REPEATED"
        : null;

    seen.add(studentNumber);
    rows.push({ key: `${index}:${studentNumber}`, studentNumber, name, duplicateReason });
  }

  return rows;
}
