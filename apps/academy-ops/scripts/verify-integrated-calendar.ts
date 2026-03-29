import assert from "node:assert/strict";
import { ExamType, Subject } from "@prisma/client";
import {
  buildIntegratedCalendarGrid,
  getDefaultIntegratedCalendarDateKey,
  summarizeIntegratedCalendar,
} from "../src/lib/analytics/integrated-calendar";

const grid = buildIntegratedCalendarGrid({
  year: 2026,
  month: 3,
  examEvents: [
    {
      sessionId: 101,
      dateKey: "2026-03-12",
      subject: Subject.CRIMINAL_LAW,
      weekLabel: "3주차",
      isCancelled: false,
      isPendingInput: false,
      normalCount: 18,
      liveCount: 2,
      absentCount: 1,
      warningCount: 1,
      dropoutCount: 0,
    },
    {
      sessionId: 102,
      dateKey: "2026-03-14",
      subject: Subject.POLICE_SCIENCE,
      weekLabel: "3주차",
      isCancelled: true,
      isPendingInput: false,
      normalCount: 0,
      liveCount: 0,
      absentCount: 0,
      warningCount: 0,
      dropoutCount: 0,
    },
  ],
  counselingEvents: [
    {
      appointmentId: 201,
      dateKey: "2026-03-12",
      timeLabel: "13:30",
      scheduledAtLabel: "2026-03-12 13:30",
      counselorName: "홍길동",
      agenda: "결시 사유 확인",
      student: {
        examNumber: "2026001",
        name: "김수강",
        examType: ExamType.GONGCHAE,
      },
    },
    {
      appointmentId: 202,
      dateKey: "2026-03-13",
      timeLabel: "11:00",
      scheduledAtLabel: "2026-03-13 11:00",
      counselorName: "이상담",
      agenda: null,
      student: {
        examNumber: "2026002",
        name: "박상담",
        examType: ExamType.GONGCHAE,
      },
    },
  ],
});

assert.equal(grid.days.length, 31, "March 2026 should build 31 calendar cells.");
assert.equal(grid.leadingEmpty, 0, "March 2026 starts on Sunday in the synthetic check.");

const march12 = grid.days.find((day) => day.dateKey === "2026-03-12");
assert.ok(march12, "2026-03-12 should exist in the calendar grid.");
assert.equal(march12?.examCount, 1, "March 12 should include one exam event.");
assert.equal(march12?.counselingCount, 1, "March 12 should include one counseling event.");
assert.equal(march12?.events[0]?.type, "exam", "Exam events should sort before counseling on the same day.");
assert.equal(march12?.warningCount, 1, "Warning counts should be preserved on exam events.");

const march14 = grid.days.find((day) => day.dateKey === "2026-03-14");
assert.ok(march14, "2026-03-14 should exist in the calendar grid.");
assert.equal(march14?.cancelledExamCount, 1, "Cancelled exam counts should be tracked separately.");

const summary = summarizeIntegratedCalendar(grid.days);
assert.deepEqual(summary, {
  examCount: 2,
  counselingCount: 2,
  cancelledExamCount: 1,
  overlapDayCount: 1,
  activeDayCount: 3,
});

const selectedDate = getDefaultIntegratedCalendarDateKey({
  year: 2026,
  month: 3,
  days: grid.days,
  preferredDateKey: "2026-03-12",
});
assert.equal(selectedDate, "2026-03-12", "Preferred date should win when it is inside the month.");
assert.equal(
  march12?.events[1]?.type,
  "counseling",
  "Counseling events should remain on the exact server-provided date key without timezone re-bucketing.",
);

console.log(
  JSON.stringify(
    {
      summary,
      selectedDate,
      march12EventTypes: march12?.events.map((event) => event.type) ?? [],
    },
    null,
    2,
  ),
);
