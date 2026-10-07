import assert from "node:assert/strict";
import test from "node:test";
import { arrivalWeeks, datesText, monthsInRange, periodsText, reportRange, summarizeArrivals, summarizeAttendance, summarizePoints, weekdayLabel } from "../../lib/student-report";

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
  assert.deepEqual(summary.daily.map((e) => [e.date, e.label, e.periods]), [["2026-09-02", "지각", "0교시"], ["2026-09-03", "결석", "1교시"]]);
  assert.deepEqual(summary.grouped.map((e) => [e.label, e.reason, e.dates, e.days, e.count]), [["사유결석", "병원", "9/3", 1, 1]]);
  assert.equal(summary.recorded, 4, "해당없음은 세지 않는다");
});

test("출결: 교시마다 한 줄이 아니라 같은 사유는 기간 전체를 한 줄로, 지각·결석은 날짜별 한 줄로 묶는다", () => {
  const r = (date: string, status: string, periodName: string, reason: string | null = null) => ({ date, status, periodName, periodLabel: "월~토 시간통제", reason });
  const records = [] as ReturnType<typeof r>[];
  // 운영 사례(2026-10-07): 기본이론 수업으로 평일 1~4교시 사유결석이 매일 4줄씩 쌓였다.
  for (const date of ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-21", "2026-09-22", "2026-09-30", "2026-10-01"]) {
    for (const period of ["1교시", "2교시", "3교시", "4교시"]) records.push(r(date, "EXCUSED", period, "수업: 기본이론"));
  }
  records.push(r("2026-09-11", "EXCUSED", "1교시", "기본이론 수업 수강"), r("2026-09-11", "EXCUSED", "2교시", "기본이론 수업 수강"));
  records.push(r("2026-09-23", "TARDY", "1교시"), r("2026-09-23", "TARDY", "2교시"), r("2026-09-24", "ABSENT", "5교시", "늦잠"));
  const summary = summarizeAttendance(records, { from: "2026-09-10", to: "2026-10-07" });
  assert.equal(summary.counts.find((c) => c.status === "EXCUSED")?.count, 38, "횟수는 교시 기준 그대로");
  assert.deepEqual(summary.grouped.map((g) => [g.reason, g.periods, g.dates, g.days, g.count]), [
    ["기본이론 수업 수강", "1~2교시", "9/11", 1, 2],
    ["수업: 기본이론", "1~4교시", "9/14~18, 9/21~22, 9/30~10/1", 9, 36],
  ]);
  assert.deepEqual(summary.daily.map((d) => [d.date, d.label, d.periods, d.reason]), [["2026-09-23", "지각", "1~2교시", null], ["2026-09-24", "결석", "5교시", "늦잠"]]);
});

test("출결 묶음 표기: 교시 번호는 이어진 것끼리, 이름이 다르면 나열, 날마다 교시가 다르면 '중'", () => {
  assert.equal(periodsText(["3교시", "1교시", "2교시", "5교시"]), "1~3·5교시");
  assert.equal(periodsText(["아침", "1교시"]), "아침, 1교시");
  assert.equal(datesText(["2026-09-30", "2026-10-01", "2026-10-02", "2026-10-05"]), "9/30~10/2, 10/5");
  const r = (date: string, periodName: string) => ({ date, status: "HOLIDAY", periodName, periodLabel: null, reason: "휴가" });
  const summary = summarizeAttendance([r("2026-09-01", "1교시"), r("2026-09-01", "2교시"), r("2026-09-02", "1교시")], { from: "2026-09-01", to: "2026-09-30" });
  assert.equal(summary.grouped[0].periods, "1~2교시 중");
});

test("등원 주 단위 표: 월요일 시작 주, 기간 밖 날은 inRange=false, 기록 없는 날은 time=null", () => {
  const weeks = arrivalWeeks([{ date: "2026-09-17", time: "07:45", tardy: false }, { date: "2026-09-20", time: "10:01", tardy: true }], { from: "2026-09-17", to: "2026-09-23" });
  assert.deepEqual(weeks.map((w) => w.monday), ["2026-09-14", "2026-09-21"]);
  assert.deepEqual(weeks[0].days.map((d) => [d.inRange, d.time]), [[false, null], [false, null], [false, null], [true, "07:45"], [true, null], [true, null], [true, "10:01"]]);
  assert.equal(weeks[0].days[6].tardy, true);
  assert.deepEqual(weeks[1].days.map((d) => d.inRange), [true, true, true, false, false, false, false]);
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
