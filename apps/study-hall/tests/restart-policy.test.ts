import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { managementPolicySchema, isControlledPeriod, buildPolicyAttendanceCandidates, separatePointTotals, kstDate, kstMonthBounds } from "../lib/management-policy";
import { mapPolicy } from "../scripts/restart-police-policy";

const manifest = JSON.parse(fs.readFileSync("docs/policies/restart-police-v3.1.json", "utf8"));
const periods = manifest.periods.map((p: any) => ({ ...p, id: p.startTime, isActive: true }));
const policy = mapPolicy(manifest, periods);
const rules = manifest.rules.map((r: any) => ({ ...r, isActive: true }));
const weekday = "2026-09-08", saturday = "2026-09-12", sunday = "2026-09-13";
const now = new Date(`${weekday}T22:00:00+09:00`);
const attendance = (status: string) => policy.attendancePeriodIds.map((periodId) => ({ periodId, studentId: "p1", status }));
const penalties = (records: ReturnType<typeof attendance>, date=weekday, at=now, p=policy) => buildPolicyAttendanceCandidates(p, periods, records, rules, date, at);

test("weekday only required periods; morning exam/zero/night excluded", () => {
  assert.equal(isControlledPeriod(policy, "09:15", weekday), true);
  for (const time of ["06:00", "08:30", "18:15", "20:10"]) assert.equal(isControlledPeriod(policy, time, weekday, "p1"), false);
});
test("Saturday 1–4 controlled and Sunday all voluntary", () => {
  assert.equal(isControlledPeriod(policy, "09:15", saturday), true);
  assert.equal(isControlledPeriod(policy, "18:15", saturday, "p1"), false);
  for (const p of periods) assert.equal(isControlledPeriod(policy, p.id, sunday, "p1"), false);
});
test("optional enrollment limited by student, dates and weekday", () => {
  const enrolled = { ...policy, optionalEnrollments: [{ studentId: "p1", periodId: "18:15", dateFrom: weekday, dateTo: weekday, weekdays: [2] }] };
  assert.equal(isControlledPeriod(enrolled, "18:15", weekday, "p1"), true);
  assert.equal(isControlledPeriod(enrolled, "18:15", weekday, "p2"), false);
  assert.equal(isControlledPeriod(enrolled, "18:15", "2026-09-09", "p1"), false);
});
test("full-day absence becomes exactly one -5 and not per-period absence", () => {
  assert.deepEqual(penalties(attendance("ABSENT")).map((r) => r.points), [-5]);
});
test("full-day absence waits until final controlled period has ended", () => {
  assert.equal(penalties(attendance("ABSENT"), weekday, new Date(`${weekday}T16:59:59+09:00`)).length, 0);
});
test("missing and recognized cells never become full-day absence", () => {
  assert.equal(penalties(attendance("ABSENT").filter((r) => r.periodId !== "09:15")).length, 0);
  assert.equal(penalties(attendance("ABSENT").map((r) => r.periodId === "09:15" ? { ...r, status: "EXCUSED" } : r)).length, 0);
});
test("optional enrollee absence waits until evening end", () => {
  const enrolled = { ...policy, optionalEnrollments: [{ studentId: "p1", periodId: "18:15", dateFrom: weekday, dateTo: weekday, weekdays: [2] }] };
  assert.equal(penalties(attendance("ABSENT"), weekday, new Date(`${weekday}T19:54:00+09:00`), enrolled).length, 0);
  assert.equal(penalties(attendance("ABSENT"), weekday, now, enrolled).length, 1);
});
test("late charge uses database rule value and never charges voluntary periods", () => {
  const changed = rules.map((r: any) => r.id === policy.tardyRuleId ? { ...r, points: -4 } : r);
  assert.deepEqual(buildPolicyAttendanceCandidates(policy, periods, attendance("TARDY"), changed, weekday, now).map((r) => r.points), [-4,-4,-4,-4]);
});
test("Sunday, future periods and pre-effective history have no policy penalties", () => {
  assert.equal(penalties(attendance("ABSENT"), sunday, new Date(`${sunday}T23:00:00+09:00`)).length, 0);
  assert.equal(penalties(attendance("TARDY"), weekday, new Date(`${weekday}T09:14:59+09:00`)).length, 0);
  assert.equal(penalties(attendance("ABSENT"), "2026-09-07").length, 0);
});
test("monthly merits never reduce demerits; history is not altered", () => {
  const records = [{studentId:"p1", points:30, date:"2026-09-01"}, {studentId:"p1",points:-25,date:"2026-09-08"}, {studentId:"p1",points:-30,date:"2026-08-31"}];
  const old = JSON.stringify(records);
  assert.deepEqual(separatePointTotals(records, "2026-09-01", "2026-09-30").get("p1"), {merit:30,demerit:25});
  assert.equal(separatePointTotals(records,"2026-10-01","2026-10-31").size,0);
  assert.equal(JSON.stringify(records),old);
});
test("KST month rollovers and invalid calendar dates", () => {
  assert.equal(kstDate(new Date("2026-08-31T15:00:00Z")),"2026-09-01");
  assert.deepEqual(kstMonthBounds(new Date("2026-08-31T15:00:00Z")),{dateFrom:"2026-09-01",dateTo:"2026-09-30"});
  assert.equal(managementPolicySchema.safeParse({...policy,effectiveFrom:"2026-02-30"}).success,false);
});

test("approved penalty table is police-only with late -2 and regular exam -3", () => {
  assert.equal(manifest.scope, "police");
  assert.equal(manifest.decision.basis, "student_penalty_table");
  assert.equal(manifest.rules.find((r: { key: string; points: number }) => r.key === "late-arrival")?.points, -2);
  assert.equal(manifest.rules.find((r: { key: string; points: number }) => r.key === "regular-absence")?.points, -3);
});
