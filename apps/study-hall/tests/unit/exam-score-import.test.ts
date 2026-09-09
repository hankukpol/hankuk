import assert from "node:assert/strict";
import test from "node:test";

import {
  describeExamScoreApply,
  detectExamScoreColumns,
  parseExamScoreRows,
} from "../../lib/exam-score-import";

test("scoring sheet header locates the score column even when it is not the third cell", () => {
  // 학원 채점표: 점수(객관식)가 6번째 칸이다. 자리 순서로 읽으면 응시분야(0)를 점수로 읽는다.
  const header = ["수험번호", "성명", "응시분야", "지원지역", "생년월일", "객관식", "주관식"];

  assert.deepEqual(detectExamScoreColumns(header), {
    studentNumberIndex: 0,
    scoreIndex: 5,
    notesIndex: null,
  });

  const parsed = parseExamScoreRows([
    header,
    ["20550", "박성빈", "0", "0", "960711", "100", "0"],
    ["20563", "이건영", "0", "0", "", "85", "0"],
  ]);

  assert.equal(parsed.usedHeader, true);
  assert.deepEqual(
    parsed.rows.map((row) => [row.studentNumber, row.score]),
    [
      ["20550", "100"],
      ["20563", "85"],
    ],
  );
});

test("downloaded template header maps to number, score and notes", () => {
  const parsed = parseExamScoreRows([
    ["수험번호", "이름", "점수", "비고"],
    ["P-001", "홍길동", "85", "잘함"],
  ]);

  assert.equal(parsed.usedHeader, true);
  assert.deepEqual(parsed.rows, [{ studentNumber: "P-001", score: "85", notes: "잘함" }]);
});

test("without a header the parser keeps the documented positional order", () => {
  // 3칸 이상은 수험번호/이름/점수/비고, 2칸은 수험번호/점수.
  const four = parseExamScoreRows([["P-001", "홍길동", "85", "잘함"]]);
  assert.equal(four.usedHeader, false);
  assert.deepEqual(four.rows, [{ studentNumber: "P-001", score: "85", notes: "잘함" }]);

  const three = parseExamScoreRows([["P-001", "홍길동", "85"]]);
  assert.deepEqual(three.rows, [{ studentNumber: "P-001", score: "85", notes: "" }]);

  const two = parseExamScoreRows([["20550", "100"]]);
  assert.deepEqual(two.rows, [{ studentNumber: "20550", score: "100", notes: "" }]);
});

test("a three column CSV reads the score, not the name", () => {
  // 회귀 방지: CSV 경로가 이름을 점수 칸으로 읽던 버그.
  const parsed = parseExamScoreRows([["20550", "박성빈", "100"]]);
  assert.equal(parsed.rows[0].score, "100");
  assert.notEqual(parsed.rows[0].score, "박성빈");
});

test("parser skips blank lines, excel sep hints and stray header rows", () => {
  const parsed = parseExamScoreRows([
    ["sep=,"],
    [""],
    ["수험번호", "이름", "점수", "비고"],
    ["20550", "박성빈", "100", ""],
    ["수험번호", "이름", "점수", "비고"],
    ["  20563  ", "이건영", " 85 ", ""],
  ]);

  assert.deepEqual(
    parsed.rows.map((row) => [row.studentNumber, row.score]),
    [
      ["20550", "100"],
      ["20563", "85"],
    ],
    "빈 줄·sep= 힌트·중간에 낀 머리글은 건너뛰고 공백은 다듬는다",
  );
});

test("apply report explains full, partial and empty matches", () => {
  assert.equal(
    describeExamScoreApply({ matchedCount: 3, unmatchedStudentNumbers: [] }),
    "3명의 성적을 반영했습니다.",
  );
  assert.equal(
    describeExamScoreApply({ matchedCount: 3, unmatchedStudentNumbers: ["1", "2"] }),
    "3명 반영, 2건은 명단에 없어 건너뛰었습니다.",
  );
  assert.match(
    describeExamScoreApply({ matchedCount: 0, unmatchedStudentNumbers: ["1"] }),
    /매칭된 학생이 없습니다/,
  );
});
