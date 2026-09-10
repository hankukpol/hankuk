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

const HANGUL = /[가-힣]/;
const PHONE = /^0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}$/;
const SEAT = /^[A-Za-z]?-?\d{1,3}$/;

/**
 * 머리글이 없을 때 내용을 보고 칸의 뜻을 정한다.
 *
 * 순서를 넘겨짚으면 안 된다. 이 학원의 시트는 수험번호·좌석번호·이름·연락처 순서인데
 * 앞 세 칸을 수험번호·이름·연락처로 읽으면 좌석번호가 이름 자리에, 이름이 연락처 자리에
 * 들어간다 — 28명이 그렇게 등록됐다.
 *
 * 세 가지는 생김새로 갈린다. 이름에는 한글이 있고, 연락처는 전화번호 꼴이며, 좌석번호는
 * 둘 다 아닌 짧은 값이다. 수험번호는 첫 칸으로 둔다 — 모든 시트가 그렇게 시작한다.
 */
function inferColumns(rows: string[][]): Partial<Record<ColumnKey, number>> {
  const width = rows.reduce((max, cols) => Math.max(max, cols.length), 0);
  const sample = rows.slice(0, 20);
  const looks = (index: number, test: (value: string) => boolean) => {
    const filled = sample.map((cols) => cols[index]?.trim() ?? "").filter(Boolean);
    return filled.length > 0 && filled.every(test);
  };

  const map: Partial<Record<ColumnKey, number>> = { studentNumber: 0 };
  for (let index = 1; index < width; index += 1) {
    if (map.phone === undefined && looks(index, (value) => PHONE.test(value.replace(/\s/g, "")))) {
      map.phone = index;
      continue;
    }
    if (map.name === undefined && looks(index, (value) => HANGUL.test(value))) {
      map.name = index;
      continue;
    }
    // 좌석 라벨은 "12" 나 "A-01" 꼴이다. 값이 줄마다 다르기도 해야 한다 — 채점표의
    // 응시분야·지원지역은 모든 줄이 "0" 이라 모양만 보면 좌석으로 읽힌다.
    if (map.seatLabel === undefined && looks(index, (value) => SEAT.test(value))) {
      const distinct = new Set(sample.map((cols) => cols[index]?.trim() ?? "").filter(Boolean));
      if (distinct.size > 1) map.seatLabel = index;
    }
  }
  // 한글이 하나도 없는 명단(영문 이름 등)은 옛 순서로 되돌린다.
  if (map.name === undefined) {
    map.name = 1;
    if (map.seatLabel === 1) map.seatLabel = undefined;
    if (map.phone === undefined) map.phone = 2;
  }
  return map;
}

/**
 * 붙여넣은 표를 읽는다.
 *
 * 첫 줄이 머리글이면 이름으로 칸을 찾는다. 머리글이 없으면 내용을 보고 정한다 —
 * 학원마다 열 순서가 다르고, 엑셀에서 범위만 복사하면 머리글이 딸려 오지 않는다.
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
  const columns = header ?? inferColumns(lines.slice(start));
  const at = (cols: string[], key: ColumnKey) => {
    const column = columns[key];
    return column === undefined ? "" : cols[column]?.trim() ?? "";
  };

  for (let index = start; index < lines.length; index += 1) {
    const cols = lines[index];
    const studentNumber = at(cols, "studentNumber");
    const name = at(cols, "name");
    const phone = at(cols, "phone");
    const seatLabel = at(cols, "seatLabel");

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
