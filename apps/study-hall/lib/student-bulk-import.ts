/** 일괄 등록 미리보기 한 줄. */
export type ParsedBulkStudentRow = {
  key: string;
  studentNumber: string;
  name: string;
  /** 비어 있어도 된다. 덮어쓸 때 빈 값은 기존 연락처를 지우지 않는다. */
  phone: string;
  /** 좌석 라벨. 비어 있으면 배정하지 않는다. */
  seatLabel: string;
  /** 명단에 이미 있거나 붙여넣은 목록 안에서 중복된 행. 기본 선택에서 제외된다. */
  duplicateReason: "REGISTERED" | "REPEATED" | null;
};

const COLUMN_LABELS = {
  studentNumber: ["수험번호", "학번", "번호"],
  name: ["이름", "성명", "학생명"],
  phone: ["연락처", "전화", "전화번호", "휴대폰", "휴대전화"],
  seatLabel: ["좌석번호", "좌석", "자리", "자리번호"],
} as const;

type ColumnKey = keyof typeof COLUMN_LABELS;

/** 머리글 줄이면 각 칸이 무엇인지 돌려준다. 아니면 null. */
function readHeader(cols: string[]): Partial<Record<ColumnKey, number>> | null {
  const map: Partial<Record<ColumnKey, number>> = {};
  cols.forEach((raw, index) => {
    const cell = raw.trim().replace(/\s/g, "");
    for (const [key, labels] of Object.entries(COLUMN_LABELS) as [ColumnKey, readonly string[]][]) {
      if (map[key] === undefined && labels.includes(cell)) map[key] = index;
    }
  });
  // 수험번호와 이름을 둘 다 찾지 못하면 머리글로 보지 않는다. 첫 줄이 실제 학생일 수 있다.
  return map.studentNumber !== undefined && map.name !== undefined ? map : null;
}

/**
 * 붙여넣은 표를 읽는다.
 *
 * 첫 줄이 머리글이면 이름으로 칸을 찾는다 — 학원마다 열 순서가 다르고, 엑셀에서 통째로
 * 복사할 때 좌석번호가 이름 앞에 오는 시트가 실제로 있다. 머리글이 없으면 예전처럼
 * 수험번호·이름·연락처 순서로 읽어, 지금까지 쓰던 붙여넣기가 그대로 동작한다.
 *
 * 수험번호나 이름이 비어 있는 줄은 건너뛴다.
 */
export function parseBulkStudentRows(
  lines: string[][],
  registeredStudentNumbers: ReadonlySet<string>,
): ParsedBulkStudentRow[] {
  const rows: ParsedBulkStudentRow[] = [];
  const seen = new Set<string>();

  let header: Partial<Record<ColumnKey, number>> | null = null;
  let start = 0;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].every((cell) => !cell.trim())) continue;
    header = readHeader(lines[index]);
    if (header) start = index + 1;
    break;
  }
  const at = (cols: string[], key: ColumnKey, fallback: number) => {
    const column = header ? header[key] : fallback;
    return column === undefined ? "" : cols[column]?.trim() ?? "";
  };

  for (let index = start; index < lines.length; index += 1) {
    const cols = lines[index];
    const studentNumber = at(cols, "studentNumber", 0);
    const name = at(cols, "name", 1);
    // 머리글이 없으면 좌석 열은 없는 것으로 본다. 세 번째 칸을 좌석으로 넘겨짚으면
    // 지금까지 연락처를 그 자리에 붙여 넣던 명단이 좌석 배정으로 잘못 읽힌다.
    const phone = at(cols, "phone", 2);
    const seatLabel = header ? at(cols, "seatLabel", -1) : "";

    // 여러 블록을 이어 붙이면 머리글이 목록 중간에도 나온다. 첫 줄만 보고 넘어가면
    // 그 줄들이 학생으로 들어간다.
    if (!studentNumber || !name || COLUMN_LABELS.studentNumber.includes(studentNumber.replace(/\s/g, "") as never)) continue;

    const duplicateReason = registeredStudentNumbers.has(studentNumber)
      ? "REGISTERED"
      : seen.has(studentNumber)
        ? "REPEATED"
        : null;

    seen.add(studentNumber);
    rows.push({ key: `${index}:${studentNumber}`, studentNumber, name, phone, seatLabel, duplicateReason });
  }

  return rows;
}
