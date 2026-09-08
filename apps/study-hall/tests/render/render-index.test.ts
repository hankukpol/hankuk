import assert from "node:assert/strict";
import test from "node:test";

import { indexFirstBy } from "../../lib/record-index";

test("render lookup preserves find semantics, missing values and input order", () => {
  const rows = Object.freeze([
    Object.freeze({ id: "student-1", checkable: false }),
    Object.freeze({ id: "student-2", checkable: true }),
    Object.freeze({ id: "student-1", checkable: true }),
    Object.freeze({ id: "__proto__", checkable: true }),
    Object.freeze({ id: "", checkable: false }),
  ]);
  const index = indexFirstBy<(typeof rows)[number], string>(rows, (row) => row.id);
  for (const key of ["student-1", "student-2", "missing", "__proto__", ""]) {
    assert.equal(index.get(key), rows.find((row) => row.id === key));
  }
  assert.deepEqual(Array.from(index.keys()), ["student-1", "student-2", "__proto__", ""]);
  assert.equal(indexFirstBy([], () => "").size, 0);
});

test("phone period/student lookups stay linear and preserve first-match checkability", () => {
  let keyReads = 0;
  const periods = Array.from({ length: 10 }, (_, periodId) => ({
    periodId: String(periodId),
    attendance: Array.from({ length: 1000 }, (_, studentId) => ({
      studentId: String(studentId), checkable: studentId % 3 !== 0,
    })),
  }));
  const byPeriod = indexFirstBy(periods, (period) => { keyReads++; return period.periodId; });
  const attendance = new Map(Array.from(byPeriod, ([id, period]) => [
    id,
    indexFirstBy(period.attendance, (cell) => { keyReads++; return cell.studentId; }),
  ]));
  for (const period of periods) {
    for (const cell of period.attendance) {
      assert.equal(attendance.get(period.periodId)?.get(cell.studentId), cell);
    }
  }
  assert.equal(keyReads, 10_010);
  assert.equal(attendance.get("missing")?.get("0"), undefined);
  assert.equal(attendance.get("0")?.get("missing"), undefined);
});
