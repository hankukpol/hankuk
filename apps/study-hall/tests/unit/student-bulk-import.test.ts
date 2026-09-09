import assert from "node:assert/strict";
import test from "node:test";

import { parseBulkStudentRows } from "../../lib/student-bulk-import";

const none = new Set<string>();

test("bulk import reads the first two cells and ignores the rest of a scoring sheet row", () => {
  // 채점표: 수험번호 / 성명 / 응시분야 / 지원지역 / 생년월일 / 객관식 / 주관식
  const rows = parseBulkStudentRows(
    [
      ["수험번호", "성명", "응시분야", "지원지역", "생년월일", "객관식", "주관식"],
      ["20550", "박성빈", "0", "0", "960711", "100", "0"],
      ["20563", "이건영", "0", "0", "", "100", "0"],
    ],
    none,
  );

  assert.deepEqual(
    rows.map((row) => [row.studentNumber, row.name, row.duplicateReason]),
    [
      ["20550", "박성빈", null],
      ["20563", "이건영", null],
    ],
    "머리글은 건너뛰고 뒤 열은 무시한다",
  );
});

test("bulk import trims cells and drops rows missing a number or a name", () => {
  const rows = parseBulkStudentRows(
    [
      [" 21809 ", "  전한나 "],
      ["25815", ""],
      ["", "이름만"],
      ["학번", "머리글"],
      ["번호", "머리글"],
      ["49342"],
    ],
    none,
  );

  assert.deepEqual(
    rows.map((row) => [row.studentNumber, row.name]),
    [["21809", "전한나"]],
  );
});

test("bulk import marks numbers already registered and repeats within the pasted list", () => {
  const rows = parseBulkStudentRows(
    [
      ["20550", "박성빈"],
      ["20563", "이건영"],
      ["20563", "같은 번호 다른 줄"],
      ["21809", "전한나"],
    ],
    new Set(["20550"]),
  );

  assert.deepEqual(rows.map((row) => row.duplicateReason), [
    "REGISTERED",
    null,
    "REPEATED",
    null,
  ]);
  assert.equal(new Set(rows.map((row) => row.key)).size, rows.length, "행 키는 중복되면 안 된다");
});

test("bulk import keeps leading zeros so short student numbers still match", () => {
  const rows = parseBulkStudentRows([["002", "김학생"], ["0043", "이학생"]], new Set(["002"]));

  assert.deepEqual(rows.map((row) => row.studentNumber), ["002", "0043"]);
  assert.equal(rows[0].duplicateReason, "REGISTERED");
});
