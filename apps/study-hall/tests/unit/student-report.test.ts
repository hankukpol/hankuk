import assert from "node:assert/strict";
import test from "node:test";
import { monthsInRange, reportRange, summarizeArrivals, summarizeAttendance, summarizePoints, weekdayLabel } from "../../lib/student-report";

test("기간: 기본 4주, 잘못된 값·거꾸로 된 기간·너무 긴 기간은 바로잡는다", () => {
  assert.deepEqual(reportRange("2026-10-03"), { from: "2026-09-06", to: "2026-10-03" });
  assert.deepEqual(reportRange("2026-10-03", "2026-09-01", "2026-09-30"), { from: "2026-09-01", to: "2026-09-30" });
  assert.deepEqual(reportRange("2026-10-03", "bad", "2026-10-03"), { from: "2026-09-06", to: "2026-10-03" });
  assert.deepEqual(reportRange("2026-10-03", "2026-10-10", "2026-10-01"), { from: "2026-09-04", to: "2026-10-01" });
  assert.equal(reportRange("2026-10-03", "2025-01-01", "2026-10-03").from, "2026-03-31", "최대 186일");
  assert.deepEqual(monthsInRange({ from: "2026-11-20", to: "2027-01-05" }), ["2026-11", "2026-12", "2027-01"]);
  assert.equal(weekdayLabel("2026-10-02"), "금");
});

test("출결: 기간 안의 기록만 세고, 출석이 아닌 기록을 날짜순으로 모은다", () => {
  const r = (date: string, status: string, periodName = "1교시", reason: string | null = null) => ({ date, status, periodName, periodLabel: null, reason });
  const summary = summarizeAttendance([r("2026-09-01", "PRESENT"), r("2026-09-02", "TARDY", "0교시"), r("2026-09-03", "ABSENT"), r("2026-09-03", "EXCUSED", "2교시", "병원"), r("2026-08-31", "ABSENT"), r("2026-09-04", "NOT_APPLICABLE")], { from: "2026-09-01", to: "2026-09-30" });
  assert.deepEqual(summary.counts.map((c) => [c.label, c.count]), [["출석", 1], ["지각", 1], ["결석", 1], ["사유결석", 1], ["휴무", 0], ["반휴", 0]]);
  assert.deepEqual(summary.exceptions.map((e) => [e.date, e.label, e.reason]), [["2026-09-02", "지각", null], ["2026-09-03", "결석", null], ["2026-09-03", "사유결석", "병원"]]);
  assert.equal(summary.recorded, 4, "해당없음은 세지 않는다");
});

test("등원: 취소된 기록과 기간 밖을 빼고 한국 시각으로 표시, 같은 날 지각을 함께 표시", () => {
  const a = (date: string, utc: string, cancelledAt: string | null = null) => ({ date, effectiveAt: `${date}T${utc}:00.000Z`, cancelledAt });
  const summary = summarizeArrivals(
    [a("2026-09-01", "23:50"), a("2026-09-02", "00:10"), a("2026-09-03", "00:40"), a("2026-09-04", "00:00", "2026-09-04T01:00:00Z"), a("2026-10-05", "00:00")],
    [{ date: "2026-09-03", status: "TARDY", periodName: "0교시", periodLabel: null, reason: null }],
    { from: "2026-09-01", to: "2026-09-30" },
  );
  // 9/1 23:50Z 는 한국 9/2 08:50 이지만 기록 날짜(date) 를 그대로 쓴다.
  assert.deepEqual(summary.rows.map((r) => [r.date, r.time, r.tardy]), [["2026-09-01", "08:50", false], ["2026-09-02", "09:10", false], ["2026-09-03", "09:40", true]]);
  assert.deepEqual([summary.days, summary.average, summary.earliest, summary.latest], [3, "09:13", "08:50", "09:40"]);
});

test("상벌점: 기간 합계와 목록", () => {
  const p = (date: string, points: number) => ({ date: `${date}T09:00:00.000Z`, points, displayName: null, ruleName: "규칙", categoryLabel: "분류", notes: null });
  const summary = summarizePoints([p("2026-09-02", -2), p("2026-09-10", 5), p("2026-08-30", -10)], { from: "2026-09-01", to: "2026-09-30" });
  assert.deepEqual([summary.merit, summary.demerit, summary.rows.length], [5, 2, 2]);
  assert.equal(summary.rows[0].name, "규칙");
});
