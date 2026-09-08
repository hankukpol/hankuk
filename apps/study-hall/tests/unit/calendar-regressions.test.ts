import assert from "node:assert/strict";
import test from "node:test";
import { calcDDay } from "../../lib/exam-schedule-meta";
import { examScheduleSchema, examScheduleUpdateSchema } from "../../lib/exam-schedule-schemas";
import { rejectsAt } from "./schema-assertions";

// Regression coverage for Korean midnight and calendar dates that used to roll over silently.
for (const timeZone of ["UTC", "Asia/Seoul"]) {
  test(`exam D-Day follows Korean midnight on a ${timeZone} host`, (t) => {
    const previous = process.env.TZ;
    process.env.TZ = timeZone;
    t.after(() => {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    });
    t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-08T14:59:59Z") });
    assert.equal(calcDDay("2026-09-09"), 1);
    t.mock.timers.tick(1000);
    assert.equal(calcDDay("2026-09-09"), 0, "At KST midnight the exam is today, even on a UTC server");
    assert.equal(calcDDay("2026-09-08"), -1);
  });
}

test("exam schedules reject impossible calendar dates on creation and partial updates", () => {
  for (const examDate of ["2026-02-30", "2026-02-29", "2026-13-01", "2026-04-31"]) {
    rejectsAt(examScheduleSchema, { name: "달력 검증", type: "WRITTEN", examDate }, "examDate");
    rejectsAt(examScheduleUpdateSchema, { examDate }, "examDate");
  }
  assert.equal(examScheduleSchema.safeParse({ name: "윤년 시험", type: "WRITTEN", examDate: "2024-02-29" }).success, true);
});
