import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  AbsenceStatus,
  ExamType,
  NotificationChannel,
  NotificationType,
  PointType,
  Prisma,
  ScoreSource,
  StudentStatus,
  StudentType,
  Subject,
} from "@prisma/client";
import { getPrisma } from "../src/lib/prisma";
import { getStudentTimeline, parseTimelineDays } from "../src/lib/students/timeline";

function loadEnvFile(filePath: string) {
  try {
    const raw = readFileSync(filePath, "utf8");

    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex <= 0) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      let value = trimmed.slice(separatorIndex + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    // Ignore missing env files.
  }
}

function loadLocalEnv() {
  const cwd = process.cwd();
  loadEnvFile(path.join(cwd, ".env.local"));
  loadEnvFile(path.join(cwd, ".env"));
}

function isRetryableDbError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientInitializationError ||
    (error instanceof Error &&
      /Can't reach database server|Server has closed the connection|Connection terminated/i.test(
        error.message,
      ))
  );
}

async function withDbRetry<T>(operation: () => Promise<T>, attempts = 3) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= attempts - 1 || !isRetryableDbError(error)) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    }
  }
}

function daysAgo(days: number, hour = 9) {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date;
}

async function main() {
  loadLocalEnv();
  const prisma = getPrisma();
  const stamp = Date.now();
  const examNumber = `VERIFYTL${stamp}`;
  const otherExamNumber = `VERIFYTL${stamp}B`;

  const period = await withDbRetry(() =>
    prisma.examPeriod.create({
      data: {
        name: `Verify Timeline ${stamp}`,
        startDate: daysAgo(200),
        endDate: daysAgo(-30),
        totalWeeks: 24,
        isActive: false,
      },
      select: { id: true },
    }),
  );

  const [recentSession, oldSession] = await Promise.all([
    withDbRetry(() =>
      prisma.examSession.create({
        data: {
          periodId: period.id,
          examType: ExamType.GONGCHAE,
          week: 8,
          subject: Subject.CONSTITUTIONAL_LAW,
          examDate: daysAgo(12),
        },
        select: { id: true },
      }),
    ),
    withDbRetry(() =>
      prisma.examSession.create({
        data: {
          periodId: period.id,
          examType: ExamType.GONGCHAE,
          week: 2,
          subject: Subject.CRIMINAL_LAW,
          examDate: daysAgo(120),
        },
        select: { id: true },
      }),
    ),
  ]);

  await Promise.all([
    withDbRetry(() =>
      prisma.student.create({
        data: {
          examNumber,
          name: "Verify Timeline Student",
          examType: ExamType.GONGCHAE,
          studentType: StudentType.EXISTING,
          isActive: true,
          notificationConsent: true,
        },
      }),
    ),
    withDbRetry(() =>
      prisma.student.create({
        data: {
          examNumber: otherExamNumber,
          name: "Verify Timeline Other",
          examType: ExamType.GONGCHAE,
          studentType: StudentType.EXISTING,
          isActive: true,
          notificationConsent: true,
        },
      }),
    ),
  ]);

  const [recentScore, oldScore] = await Promise.all([
    withDbRetry(() =>
      prisma.score.create({
        data: {
          examNumber,
          sessionId: recentSession.id,
          rawScore: 82,
          finalScore: 82,
          attendType: "NORMAL",
          sourceType: ScoreSource.MANUAL_INPUT,
          note: "Recent score note",
        },
        select: { id: true },
      }),
    ),
    withDbRetry(() =>
      prisma.score.create({
        data: {
          examNumber,
          sessionId: oldSession.id,
          rawScore: 71,
          finalScore: 71,
          attendType: "NORMAL",
          sourceType: ScoreSource.ONLINE_UPLOAD,
        },
        select: { id: true },
      }),
    ),
  ]);

  await withDbRetry(() =>
    prisma.score.create({
      data: {
        examNumber: otherExamNumber,
        sessionId: recentSession.id,
        rawScore: 99,
        finalScore: 99,
        attendType: "NORMAL",
        sourceType: ScoreSource.OFFLINE_UPLOAD,
      },
    }),
  );

  const noteApprovedAt = daysAgo(10, 14);
  const updatedOutsideExamAt = daysAgo(3, 15);
  const [absenceNote, updatedAbsenceNote] = await Promise.all([
    withDbRetry(() =>
      prisma.absenceNote.create({
        data: {
          examNumber,
          sessionId: recentSession.id,
          reason: "Verifier approved absence",
          absenceCategory: "FAMILY",
          status: AbsenceStatus.APPROVED,
          submittedAt: daysAgo(11, 13),
          approvedAt: noteApprovedAt,
          updatedAt: noteApprovedAt,
        },
        select: { id: true },
      }),
    ),
    withDbRetry(() =>
      prisma.absenceNote.create({
        data: {
          examNumber,
          sessionId: oldSession.id,
          reason: "Verifier updated old absence",
          absenceCategory: "OTHER",
          status: AbsenceStatus.REJECTED,
          submittedAt: daysAgo(121, 13),
          approvedAt: daysAgo(119, 14),
          updatedAt: updatedOutsideExamAt,
        },
        select: { id: true },
      }),
    ),
  ]);

  const [statusA, statusRepeat, statusB, statusRecovered] = await Promise.all([
    withDbRetry(() =>
      prisma.weeklyStatusSnapshot.create({
        data: {
          periodId: period.id,
          examNumber,
          examType: ExamType.GONGCHAE,
          weekKey: `verify-${stamp}-w1`,
          weekStartDate: daysAgo(18),
          weekEndDate: daysAgo(12),
          weekAbsenceCount: 1,
          monthAbsenceCount: 1,
          status: StudentStatus.WARNING_1,
        },
        select: { id: true },
      }),
    ),
    withDbRetry(() =>
      prisma.weeklyStatusSnapshot.create({
        data: {
          periodId: period.id,
          examNumber,
          examType: ExamType.GONGCHAE,
          weekKey: `verify-${stamp}-w2`,
          weekStartDate: daysAgo(11),
          weekEndDate: daysAgo(5),
          weekAbsenceCount: 1,
          monthAbsenceCount: 2,
          status: StudentStatus.WARNING_1,
        },
        select: { id: true },
      }),
    ),
    withDbRetry(() =>
      prisma.weeklyStatusSnapshot.create({
        data: {
          periodId: period.id,
          examNumber,
          examType: ExamType.GONGCHAE,
          weekKey: `verify-${stamp}-w3`,
          weekStartDate: daysAgo(4),
          weekEndDate: daysAgo(1),
          weekAbsenceCount: 3,
          monthAbsenceCount: 5,
          status: StudentStatus.DROPOUT,
        },
        select: { id: true },
      }),
    ),
    withDbRetry(() =>
      prisma.weeklyStatusSnapshot.create({
        data: {
          periodId: period.id,
          examNumber,
          examType: ExamType.GONGCHAE,
          weekKey: `verify-${stamp}-w4`,
          weekStartDate: daysAgo(1),
          weekEndDate: daysAgo(0),
          weekAbsenceCount: 0,
          monthAbsenceCount: 0,
          status: StudentStatus.NORMAL,
        },
        select: { id: true },
      }),
    ),
  ]);

  const counselingRecord = await withDbRetry(() =>
    prisma.counselingRecord.create({
      data: {
        examNumber,
        counselorName: "Verifier Counselor",
        content: "Recent counseling content for the timeline verifier.",
        recommendation: "Follow up on attendance next week.",
        counseledAt: daysAgo(6, 16),
        nextSchedule: daysAgo(1, 10),
      },
      select: { id: true },
    }),
  );

  const pointLog = await withDbRetry(() =>
    prisma.pointLog.create({
      data: {
        examNumber,
        type: PointType.MANUAL,
        amount: 400,
        reason: "Verifier manual point grant",
        grantedBy: "Verifier Admin",
        grantedAt: daysAgo(5, 12),
      },
      select: { id: true },
    }),
  );

  const [notificationLog, webPushNotificationLog] = await Promise.all([
    withDbRetry(() =>
      prisma.notificationLog.create({
        data: {
          examNumber,
          type: NotificationType.WARNING_1,
          channel: NotificationChannel.SMS,
          message: "Verifier notification message",
          status: "failed",
          failReason: "Verifier forced failure",
          sentAt: daysAgo(2, 18),
        },
        select: { id: true },
      }),
    ),
    withDbRetry(() =>
      prisma.notificationLog.create({
        data: {
          examNumber,
          type: NotificationType.NOTICE,
          channel: NotificationChannel.WEB_PUSH,
          message: "Verifier Web Push notice",
          status: "sent",
          sentAt: daysAgo(1, 15),
        },
        select: { id: true },
      }),
    ),
  ]);

  const otherNotificationLog = await withDbRetry(() =>
    prisma.notificationLog.create({
      data: {
        examNumber: otherExamNumber,
        type: NotificationType.NOTICE,
        channel: NotificationChannel.ALIMTALK,
        message: "Other student message",
        status: "sent",
        sentAt: daysAgo(1, 9),
      },
      select: { id: true },
    }),
  );

  try {
    const timeline90 = await withDbRetry(() => getStudentTimeline({ examNumber, days: 90 }));
    const timeline180 = await withDbRetry(() => getStudentTimeline({ examNumber, days: 180 }));

    assert.equal(parseTimelineDays("180"), 180);
    assert.throws(() => parseTimelineDays("bad"));

    assert.ok(timeline90);
    assert.ok(timeline180);

    assert.equal(timeline90?.examNumber, examNumber);
    assert.equal(timeline90?.days, 90);
    assert.equal(timeline180?.days, 180);

    const types90 = new Set(timeline90?.events.map((event) => event.type));
    assert.deepEqual(types90, new Set(["SCORE", "ABSENCE_NOTE", "STATUS_CHANGE", "COUNSELING", "POINT", "NOTIFICATION"]));

    const ids90 = new Set(timeline90?.events.map((event) => event.id));
    assert.ok(ids90.has(`score-${recentScore.id}`));
    assert.ok(ids90.has(`absence-${updatedAbsenceNote.id}`));
    assert.ok(!ids90.has(`score-${oldScore.id}`));
    assert.ok(!ids90.has(`notification-${otherNotificationLog.id}`));

    const ids180 = new Set(timeline180?.events.map((event) => event.id));
    assert.ok(ids180.has(`score-${oldScore.id}`));

    const webPushEvent = timeline90?.events.find(
      (event) => event.id === `notification-${webPushNotificationLog.id}`,
    );
    assert.equal(webPushEvent?.badge, "\uBC1C\uC1A1 \uC644\uB8CC");
    assert.ok(webPushEvent?.title.includes("\uACF5\uC9C0"));
    assert.ok(webPushEvent?.detail?.includes("\uC6F9 \uD478\uC2DC"));
    assert.equal(webPushEvent?.metadata?.channel, NotificationChannel.WEB_PUSH);

    const statusEvents = timeline90?.events.filter((event) => event.type === "STATUS_CHANGE") ?? [];
    assert.equal(statusEvents.length, 3);
    assert.ok(statusEvents.some((event) => event.id === `status-${statusA.id}`));
    assert.ok(statusEvents.some((event) => event.id === `status-${statusB.id}`));
    assert.ok(statusEvents.some((event) => event.id === `status-${statusRecovered.id}`));
    assert.ok(!statusEvents.some((event) => event.id === `status-${statusRepeat.id}`));

    const noteEvent = timeline90?.events.find((event) => event.id === `absence-${absenceNote.id}`);
    const updatedOldNoteEvent = timeline90?.events.find((event) => event.id === `absence-${updatedAbsenceNote.id}`);
    assert.equal(noteEvent?.date, noteApprovedAt.toISOString());
    assert.equal(updatedOldNoteEvent?.date, updatedOutsideExamAt.toISOString());

    const dates90 = timeline90?.events.map((event) => new Date(event.date).getTime()) ?? [];
    const sortedDates90 = [...dates90].sort((left, right) => right - left);
    assert.deepEqual(dates90, sortedDates90);

    console.log(
      JSON.stringify(
        {
          verified: true,
          examNumber,
          eventCount90: timeline90?.events.length ?? 0,
          eventCount180: timeline180?.events.length ?? 0,
          statusEventIds: statusEvents.map((event) => event.id),
          includedTypes: Array.from(types90),
          counselingRecordId: counselingRecord.id,
          pointLogId: pointLog.id,
          notificationLogId: notificationLog.id,
          webPushNotificationLogId: webPushNotificationLog.id,
        },
        null,
        2,
      ),
    );
  } finally {
    await withDbRetry(() =>
      prisma.notificationLog.deleteMany({
        where: {
          examNumber: { in: [examNumber, otherExamNumber] },
        },
      }),
    );
    await withDbRetry(() =>
      prisma.pointLog.deleteMany({
        where: {
          examNumber: { in: [examNumber, otherExamNumber] },
        },
      }),
    );
    await withDbRetry(() =>
      prisma.counselingRecord.deleteMany({
        where: {
          examNumber: { in: [examNumber, otherExamNumber] },
        },
      }),
    );
    await withDbRetry(() =>
      prisma.weeklyStatusSnapshot.deleteMany({
        where: {
          examNumber: { in: [examNumber, otherExamNumber] },
        },
      }),
    );
    await withDbRetry(() =>
      prisma.absenceNote.deleteMany({
        where: {
          examNumber: { in: [examNumber, otherExamNumber] },
        },
      }),
    );
    await withDbRetry(() =>
      prisma.score.deleteMany({
        where: {
          examNumber: { in: [examNumber, otherExamNumber] },
        },
      }),
    );
    await withDbRetry(() =>
      prisma.student.deleteMany({
        where: {
          examNumber: { in: [examNumber, otherExamNumber] },
        },
      }),
    );
    await withDbRetry(() =>
      prisma.examSession.deleteMany({
        where: {
          periodId: period.id,
        },
      }),
    );
    await withDbRetry(() =>
      prisma.examPeriod.delete({
        where: { id: period.id },
      }),
    );
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  try {
    await getPrisma().$disconnect();
  } catch {
    // Ignore disconnect errors during shutdown.
  }
  process.exit(1);
});
