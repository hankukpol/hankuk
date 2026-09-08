import assert from "node:assert/strict";
import test from "node:test";
import { buildDelimitedLine, buildExcelFriendlyCsv, inferDelimitedFileDelimiter, parseDelimitedLine, readTextFileWithEncoding } from "../../lib/csv";

test("CSV export represents zero, negative numbers and missing cells without losing columns", () => {
  assert.equal(buildDelimitedLine(["이름", 0, -3, null, undefined, ""]), "이름,0,-3,,,");
  assert.equal(buildDelimitedLine([]), "");
  assert.equal(buildDelimitedLine(["이름", "내용"], ";"), "이름;내용");
});

test("CSV export quotes delimiters, line breaks and doubles embedded quotes", () => {
  assert.equal(buildDelimitedLine(["김,학생", '말씀: "확인"', "첫 줄\n둘째 줄"]), '"김,학생","말씀: ""확인""","첫 줄\n둘째 줄"');
  assert.equal(buildDelimitedLine(["가;나", "가,나"], ";"), '"가;나";가,나');
  assert.equal(buildDelimitedLine(["가\r나"]), '"가\r나"');
});

for (const dangerous of ["=1+1", "+SUM(A1:A2)", "-123", "@SUM(A1:A2)", "  =1+1", "\t=1+1", "\r@formula", "\uFEFF=1+1"]) {
  test(`CSV export neutralizes formula-like text ${JSON.stringify(dangerous)}`, () => {
    const line = buildDelimitedLine([dangerous]);
    assert.deepEqual(parseDelimitedLine(line), [`'${dangerous}`]);
  });
}

test("CSV formula protection leaves ordinary strings and numeric negatives intact", () => {
  assert.equal(buildDelimitedLine(["A-01", "김학생", "1+1", -123]), "A-01,김학생,1+1,-123");
});

test("Excel CSV prepends separator metadata and uses CRLF between lines", () => {
  assert.equal(buildExcelFriendlyCsv(["이름,점수", "김학생,0"]), "sep=,\r\n이름,점수\r\n김학생,0");
  assert.equal(buildExcelFriendlyCsv(["이름;점수"], ";"), "sep=;\r\n이름;점수");
  assert.equal(buildExcelFriendlyCsv([]), "sep=,");
});

test("CSV delimiter inference follows a declaration before content heuristics", () => {
  assert.equal(inferDelimitedFileDelimiter("\uFEFFsep=;\r\n이름,표시;점수"), ";");
  assert.equal(inferDelimitedFileDelimiter("\n SEP=, \n가;나"), ",");
  assert.equal(inferDelimitedFileDelimiter("이름\t점수\n김학생\t10"), "\t");
  assert.equal(inferDelimitedFileDelimiter("이름;점수"), ";");
  assert.equal(inferDelimitedFileDelimiter("이름,점수"), ",");
  assert.equal(inferDelimitedFileDelimiter("이름,메모;점수"), ",");
  for (const text of ["", "\n\r\n  ", "이름", "sep=|"]) assert.equal(inferDelimitedFileDelimiter(text), ",");
});

test("CSV parser removes a leading BOM and trailing CR while preserving empty fields", () => {
  assert.deepEqual(parseDelimitedLine("\uFEFF 김학생 , 0 ,,\r"), ["김학생", "0", "", ""]);
  assert.deepEqual(parseDelimitedLine(""), [""]);
  assert.deepEqual(parseDelimitedLine(",,"), ["", "", ""]);
  assert.deepEqual(parseDelimitedLine('""'), [""]);
});

test("CSV parser handles quoted delimiters, embedded quotes and quoted multiline content", () => {
  assert.deepEqual(parseDelimitedLine('"김,학생","""인용""",0'), ["김,학생", '"인용"', "0"]);
  assert.deepEqual(parseDelimitedLine('"가;나";"말씀: ""확인""";', ";"), ["가;나", '말씀: "확인"', ""]);
  assert.deepEqual(parseDelimitedLine('"첫 줄\n둘째 줄",점수'), ["첫 줄\n둘째 줄", "점수"]);
  assert.deepEqual(parseDelimitedLine('" 안쪽 공백 ", 다음 '), ["안쪽 공백", "다음"]);
});

test("TSV parser trims cells and retains a trailing empty column", () => {
  assert.deepEqual(parseDelimitedLine("\uFEFF 이름 \t 0 \t\r", "\t"), ["이름", "0", ""]);
});

test("safe Korean CSV values round-trip using either supported export delimiter", () => {
  const cells = ["김학생", "학번0001", "가,나;다", '말씀: "확인"', "첫 줄\n둘째 줄", ""];
  for (const delimiter of [",", ";"] as const) assert.deepEqual(parseDelimitedLine(buildDelimitedLine(cells, delimiter), delimiter), cells);
});

const utf8 = Array.from(new TextEncoder().encode("한글,0"));
const encodedFiles = [
  ["UTF-8", utf8],
  ["UTF-8 BOM", [0xef, 0xbb, 0xbf, ...utf8]],
  ["UTF-16 LE", [0xff, 0xfe, 0x5c, 0xd5, 0x00, 0xae, 0x2c, 0, 0x30, 0]],
  ["UTF-16 BE", [0xfe, 0xff, 0xd5, 0x5c, 0xae, 0x00, 0, 0x2c, 0, 0x30]],
  ["EUC-KR", [0xc7, 0xd1, 0xb1, 0xdb, 0x2c, 0x30]],
] as const;

for (const [encoding, bytes] of encodedFiles) {
  test(`file decoding preserves Korean content encoded as ${encoding}`, async () => {
    const file = new File([Uint8Array.from(bytes)], "static-fixture.csv");
    assert.equal(await readTextFileWithEncoding(file), "한글,0");
  });
}

test("file decoding handles empty files, BOM-only files and undecodable bytes", async () => {
  for (const bytes of [[], [0xef, 0xbb, 0xbf], [0xff, 0xfe], [0xfe, 0xff]]) assert.equal(await readTextFileWithEncoding(new File([Uint8Array.from(bytes)], "empty.csv")), "");
  assert.equal(await readTextFileWithEncoding(new File([Uint8Array.of(0xff)], "bad.csv")), "�");
});

test("file read failures propagate instead of silently importing an empty file", async (t) => {
  const file = new File(["content"], "unreadable.csv");
  const error = new Error("test-only read failure");
  t.mock.method(file, "arrayBuffer", async () => { throw error; });
  await assert.rejects(readTextFileWithEncoding(file), (actual) => actual === error);
});
