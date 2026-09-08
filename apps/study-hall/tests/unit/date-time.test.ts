import assert from "node:assert/strict";
import test from "node:test";
import { normalizeYmdDate, normalizeYmMonth, parseUtcDateFromYmd } from "../../lib/date-utils";
import { getKstTodayYmd, getKstCurrentMonthRange, getMonthRangeForDate, appendPointDateRangeParams } from "../../lib/point-date-range";
import { addDays, calculateCourseEndDate } from "../../lib/tuition-meta";
import { getKstMonth, splitStudyMinutes, formatStudyMinutes, maskStudentName, clampStudyTimeDateRange } from "../../lib/study-time-meta";
import { formatDDay } from "../../lib/exam-schedule-meta";

for (const date of ["2024-02-29", "2000-02-29", "2026-01-01", "2026-12-31"]) {
  test(`date parser preserves valid calendar date ${date} at UTC midnight`, () => {
    assert.equal(normalizeYmdDate(date), date);
    assert.equal(parseUtcDateFromYmd(date).toISOString(), `${date}T00:00:00.000Z`);
  });
}

test("date validation rejects malformed input separately from impossible calendar days", () => {
  for (const date of ["", "2026-9-08", "2026/09/08", " 2026-09-08", "2026-09-08T00:00:00Z"]) {
    assert.throws(() => normalizeYmdDate(date, "시험일"), { message: "시험일 형식이 올바르지 않습니다." });
  }
  for (const date of ["2026-02-29", "1900-02-29", "2026-02-30", "2026-04-31", "2026-00-01", "2026-13-01", "2026-01-00", "2026-01-32"]) {
    assert.throws(() => normalizeYmdDate(date, "시험일"), { message: "유효하지 않은 시험일입니다." });
    assert.throws(() => parseUtcDateFromYmd(date));
  }
});

test("month validation keeps zero padding and rejects invalid months", () => {
  assert.equal(normalizeYmMonth("2026-01"), "2026-01");
  assert.equal(normalizeYmMonth("2026-12"), "2026-12");
  for (const month of ["", "2026-1", "2026/01", "2026-01-01"]) assert.throws(() => normalizeYmMonth(month, "정산월"), { message: "정산월 형식이 올바르지 않습니다." });
  for (const month of ["2026-00", "2026-13"]) assert.throws(() => normalizeYmMonth(month, "정산월"), { message: "유효하지 않은 정산월입니다." });
});

test("KST today switches exactly at 15:00 UTC, including the new year", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-12-31T14:59:59Z") });
  assert.equal(getKstTodayYmd(), "2026-12-31");
  assert.equal(getKstMonth(), "2026-12");
  t.mock.timers.tick(1000);
  assert.equal(getKstTodayYmd(), "2027-01-01");
  assert.equal(getKstMonth(), "2027-01");
  assert.deepEqual(getKstCurrentMonthRange(), { dateFrom: "2027-01-01", dateTo: "2027-01-01" });
});

test("current point range is month-to-today, even for a later selected day", () => {
  assert.deepEqual(getKstCurrentMonthRange("2026-09-08"), { dateFrom: "2026-09-01", dateTo: "2026-09-08" });
  assert.deepEqual(getMonthRangeForDate("2026-09-28", "2026-09-08"), { dateFrom: "2026-09-01", dateTo: "2026-09-08" });
});

test("other-month point ranges end on the actual final calendar day", () => {
  for (const [date, end] of [["2024-02-02", "2024-02-29"], ["2026-02-02", "2026-02-28"], ["2026-04-20", "2026-04-30"], ["2026-12-03", "2026-12-31"]]) {
    assert.deepEqual(getMonthRangeForDate(date, "2026-09-08"), { dateFrom: `${date.slice(0, 7)}-01`, dateTo: end });
  }
});

test("point URL params replace supplied bounds, retain omitted bounds and preserve other filters", () => {
  const params = new URLSearchParams("search=김학생&dateFrom=old&dateFrom=duplicate&dateTo=keep");
  assert.equal(appendPointDateRangeParams(params, { dateFrom: "2026-09-01", dateTo: "" }), params);
  assert.deepEqual(params.getAll("dateFrom"), ["2026-09-01"]);
  assert.equal(params.get("dateTo"), "keep");
  assert.equal(params.get("search"), "김학생");
  const blank = new URLSearchParams();
  appendPointDateRangeParams(blank, {});
  assert.equal(blank.toString(), "");
});

test("tuition date arithmetic handles leap years, backwards dates and year rollover", () => {
  assert.equal(addDays("2024-02-28", 1), "2024-02-29");
  assert.equal(addDays("2026-02-28", 1), "2026-03-01");
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-09-08", 0), "2026-09-08");
});

test("course duration includes its first day and leaves open-ended courses unset", () => {
  assert.equal(calculateCourseEndDate("2026-09-08", 1), "2026-09-08");
  assert.equal(calculateCourseEndDate("2026-09-08", 28), "2026-10-05");
  for (const duration of [undefined, null, 0, -1]) assert.equal(calculateCourseEndDate("2026-09-08", duration), null);
  assert.equal(calculateCourseEndDate("", 28), null);
});

test("study-time date ranges clamp to tracking inception and reject disjoint or reversed ranges", () => {
  assert.deepEqual(clampStudyTimeDateRange("2026-01-01", "2026-04-06"), { dateFrom: "2026-04-06", dateTo: "2026-04-06" });
  assert.deepEqual(clampStudyTimeDateRange("2026-09-01", "2026-09-08"), { dateFrom: "2026-09-01", dateTo: "2026-09-08" });
  assert.equal(clampStudyTimeDateRange("2026-01-01", "2026-04-05"), null);
  assert.equal(clampStudyTimeDateRange("2026-09-08", "2026-09-07"), null);
});

test("study minutes preserve hour/remainder boundaries", () => {
  for (const [minutes, hours, remainder, label] of [[0, 0, 0, "0분"], [59, 0, 59, "59분"], [60, 1, 0, "1시간"], [61, 1, 1, "1시간 1분"], [1500, 25, 0, "25시간"]] as const) {
    assert.deepEqual(splitStudyMinutes(minutes), { hours, minutes: remainder });
    assert.equal(formatStudyMinutes(minutes), label);
  }
});

test("ranking name masking keeps only the first Unicode code point", () => {
  assert.equal(maskStudentName(" 김학생 "), "김**");
  assert.equal(maskStudentName("김"), "김**");
  assert.equal(maskStudentName("😀학생"), "😀**");
  assert.equal(maskStudentName(" \t "), "**");
});

test("D-Day labels distinguish future, today and past", () => {
  assert.equal(formatDDay(3), "D-3");
  assert.equal(formatDDay(0), "D-Day");
  assert.equal(formatDDay(-2), "D+2");
});
