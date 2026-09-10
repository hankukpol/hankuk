import assert from "node:assert/strict";
import test from "node:test";

import {
  formatShortWeekLabel,
  formatWeekLabel,
  isoWeekMonday,
  weekPartsFromIso,
  weekPartsFromStartDate,
} from "../../lib/exam-week-label";

test("주는 시작한 달에 속한다 — 8월 31일에 시작해 9월에 끝나는 주는 8월이다", () => {
  assert.equal(
    formatWeekLabel({ weekYear: 2026, weekNumber: 36, startDate: "2026-08-31" }),
    "2026년 8월 5주차",
  );
});

test("같은 요일이 그 달에 몇 번째로 오는지로 센다", () => {
  const weeks = ["2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31"];
  assert.deepEqual(
    weeks.map((startDate) => formatWeekLabel({ weekYear: 2026, weekNumber: 0, startDate })),
    ["2026년 8월 1주차", "2026년 8월 2주차", "2026년 8월 3주차", "2026년 8월 4주차", "2026년 8월 5주차"],
  );
});

test("시작일을 모르면 ISO 주차에서 월요일을 되찾는다", () => {
  // 2026년 36주차의 월요일은 8월 31일이다.
  const monday = isoWeekMonday(2026, 36);
  assert.equal(monday.toISOString().slice(0, 10), "2026-08-31");
  assert.equal(formatWeekLabel({ weekYear: 2026, weekNumber: 36 }), "2026년 8월 5주차");
});

test("1주차는 1월 4일이 든 주다 — 해가 바뀌는 자리에서 어긋나지 않는다", () => {
  assert.equal(isoWeekMonday(2026, 1).toISOString().slice(0, 10), "2025-12-29");
  assert.deepEqual(weekPartsFromIso(2026, 1), { year: 2025, month: 12, week: 5 });
});

test("시작일이 있으면 ISO 되돌리기보다 그것을 쓴다", () => {
  // 주차 번호가 비어 있거나 어긋나 있어도 날짜가 맞으면 이름은 맞는다.
  assert.equal(
    formatWeekLabel({ weekYear: 1970, weekNumber: 99, startDate: "2026-07-27" }),
    "2026년 7월 4주차",
  );
});

test("짧은 이름은 달과 주만 남긴다", () => {
  assert.equal(
    formatShortWeekLabel({ weekYear: 2026, weekNumber: 32, startDate: "2026-08-03" }),
    "8월 1주",
  );
});

test("날짜가 아닌 값은 ISO 로 넘긴다", () => {
  assert.equal(weekPartsFromStartDate("없음"), null);
  assert.equal(formatWeekLabel({ weekYear: 2026, weekNumber: 32, startDate: "없음" }), "2026년 8월 1주차");
});
