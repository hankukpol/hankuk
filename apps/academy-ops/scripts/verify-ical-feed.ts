import assert from "node:assert/strict";
import { ExamType, Subject } from "@prisma/client";
import {
  buildIcalFeedPath,
  createIcalFeedToken,
  readIcalFeedToken,
  serializeExamScheduleIcal,
} from "../src/lib/calendar/ical-feed";

process.env.ICAL_FEED_SECRET = "test-ical-secret";

const payload = {
  adminId: "11111111-1111-1111-1111-111111111111",
  periodId: 21,
  examType: ExamType.GONGCHAE,
} as const;

const token = createIcalFeedToken(payload);
assert.deepEqual(readIcalFeedToken(token), { v: 1, ...payload });

const [encoded, signature] = token.split(".");
const tamperedToken = `${encoded}.${signature.slice(0, -1)}${signature.endsWith("a") ? "b" : "a"}`;
assert.equal(readIcalFeedToken(tamperedToken), null);

const path = buildIcalFeedPath({
  periodId: payload.periodId,
  examType: payload.examType,
  token,
});
assert.ok(path.includes("periodId=21"));
assert.ok(path.includes("examType=GONGCHAE"));
assert.ok(path.includes("token="));

const feed = serializeExamScheduleIcal({
  periodName: "Spring 2026 Morning Mock Schedule With Long Header",
  examType: ExamType.GONGCHAE,
  feedUrl:
    "https://example.com/api/calendar/ical?periodId=21&examType=GONGCHAE&token=sample-token-for-folding-check",
  sessions: [
    {
      id: 101,
      week: 3,
      subject: Subject.CRIMINAL_LAW,
      displaySubjectName: "Mock, Law; Session\nAlpha",
      examDate: new Date("2026-03-12T00:00:00+09:00"),
      isCancelled: false,
      cancelReason: null,
      updatedAt: new Date("2026-03-11T14:15:16Z"),
    },
    {
      id: 102,
      week: 4,
      subject: Subject.POLICE_SCIENCE,
      displaySubjectName: null,
      examDate: new Date("2026-03-19T00:00:00+09:00"),
      isCancelled: true,
      cancelReason: "Room move",
      updatedAt: new Date("2026-03-18T10:00:00Z"),
    },
  ],
});

assert.ok(feed.startsWith("BEGIN:VCALENDAR\r\n"));
assert.ok(feed.includes("BEGIN:VEVENT\r\n"));
assert.ok(feed.includes("DTSTART;VALUE=DATE:20260312\r\n"));
assert.ok(feed.includes("DTEND;VALUE=DATE:20260313\r\n"));
assert.ok(feed.includes("STATUS:CANCELLED\r\n"));
assert.match(feed, /X-WR-CALNAME:[^\r]+\r\n [^\r]+/);
assert.ok(feed.includes("Mock\\, Law\\; Session\\nAlpha"));
assert.ok(feed.includes("Room move"));
assert.ok(feed.includes("\r\n "));
assert.ok(feed.endsWith("\r\n"));

console.log(
  JSON.stringify(
    {
      tokenLength: token.length,
      path,
      feedLength: feed.length,
    },
    null,
    2,
  ),
);
