import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  AdminRole,
  ExamType,
  NotificationChannel,
  NotificationType,
  Prisma,
  StudentType,
  Subject,
} from "@prisma/client";
import { SolapiMessageService } from "solapi";
import { GET as getScoreDeadlineRoute } from "../src/app/api/cron/score-deadline/route";
import { parseMissingScoreSessionId } from "../src/lib/notifications/missing-scores";
import { runScoreDeadlineNotifications } from "../src/lib/notifications/score-deadline";
import { getPrisma } from "../src/lib/prisma";

type NotificationTemplateSnapshot = {
  type: NotificationType;
  channel: NotificationChannel;
  solapiTemplateId: string | null;
  content: string;
  variables: string[];
  description: string;
  updatedBy: string;
};

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

function installFixedDate(now: Date) {
  const OriginalDate = Date;

  class FixedDate extends Date {
    constructor(...args: any[]) {
      if (args.length === 0) {
        super(now.getTime());
        return;
      }

      if (args.length === 1) {
        super(args[0] as string | number | Date);
        return;
      }

      const [year, month, date, hours, minutes, seconds, ms] = args as [
        number,
        number,
        number?,
        number?,
        number?,
        number?,
        number?,
      ];
      super(
        year,
        month,
        date ?? 1,
        hours ?? 0,
        minutes ?? 0,
        seconds ?? 0,
        ms ?? 0,
      );
    }

    static now() {
      return now.getTime();
    }

    static parse = OriginalDate.parse;
    static UTC = OriginalDate.UTC;
  }

  const target = globalThis as typeof globalThis & { Date: DateConstructor };
  target.Date = FixedDate as DateConstructor;

  return () => {
    target.Date = OriginalDate;
  };
}

async function main() {
  loadLocalEnv();
  const prisma = getPrisma();
  const stamp = Date.now();
  const teacherWithPhoneId = randomUUID();
  const teacherWithoutPhoneId = randomUUID();
  const viewerId = randomUUID();
  const gongchaeScored = `VERIFYDEAD${stamp}A`;
  const gongchaeMissing = `VERIFYDEAD${stamp}B`;
  const gyeongchaeScored = `VERIFYDEAD${stamp}C`;
  const afterDeadline = new Date("2026-03-14T22:30:00+09:00");
  const beforeDeadline = new Date("2026-03-14T21:30:00+09:00");
  const originalCronSecret = process.env.CRON_SECRET;
  const originalNotificationKey = process.env.SOLAPI_API_KEY;
  const originalNotificationSecret = process.env.SOLAPI_API_SECRET;
  const originalNotificationSender = process.env.SOLAPI_SENDER;
  const originalDeadlineHour = process.env.SCORE_DEADLINE_HOUR;
  const originalSendOne = SolapiMessageService.prototype.sendOne;
  const templateSnapshot = await withDbRetry(() =>
    prisma.notificationTemplate.findMany({
      where: {
        type: NotificationType.SCORE_DEADLINE,
        channel: {
          in: [NotificationChannel.ALIMTALK, NotificationChannel.SMS],
        },
      },
      select: {
        type: true,
        channel: true,
        solapiTemplateId: true,
        content: true,
        variables: true,
        description: true,
        updatedBy: true,
      },
    }),
  );

  const period = await withDbRetry(() =>
    prisma.examPeriod.create({
      data: {
        name: `Verify Score Deadline ${stamp}`,
        startDate: new Date("2026-03-01T00:00:00+09:00"),
        endDate: new Date("2026-03-31T23:59:59+09:00"),
        totalWeeks: 4,
        isActive: false,
        isGongchaeEnabled: true,
        isGyeongchaeEnabled: true,
      },
      select: { id: true },
    }),
  );

  const [incompleteSession, completeSession] = await Promise.all([
    withDbRetry(() =>
      prisma.examSession.create({
        data: {
          periodId: period.id,
          examType: ExamType.GONGCHAE,
          week: 2,
          subject: Subject.CRIMINAL_LAW,
          examDate: new Date("2026-03-14T09:00:00+09:00"),
        },
        select: { id: true },
      }),
    ),
    withDbRetry(() =>
      prisma.examSession.create({
        data: {
          periodId: period.id,
          examType: ExamType.GYEONGCHAE,
          week: 2,
          subject: Subject.CRIMINOLOGY,
          examDate: new Date("2026-03-14T09:00:00+09:00"),
        },
        select: { id: true },
      }),
    ),
  ]);

  await Promise.all([
    withDbRetry(() =>
      prisma.adminUser.create({
        data: {
          id: teacherWithPhoneId,
          email: `teacher-${stamp}@example.com`,
          name: "Lead Teacher",
          phone: "010-1234-5678",
          role: AdminRole.TEACHER,
          isActive: true,
        },
      }),
    ),
    withDbRetry(() =>
      prisma.adminUser.create({
        data: {
          id: teacherWithoutPhoneId,
          email: `teacher-nophone-${stamp}@example.com`,
          name: "No Phone Teacher",
          phone: null,
          role: AdminRole.TEACHER,
          isActive: true,
        },
      }),
    ),
    withDbRetry(() =>
      prisma.adminUser.create({
        data: {
          id: viewerId,
          email: `viewer-${stamp}@example.com`,
          name: "Viewer",
          phone: "010-9999-9999",
          role: AdminRole.VIEWER,
          isActive: true,
        },
      }),
    ),
  ]);

  await Promise.all([
    withDbRetry(() =>
      prisma.notificationTemplate.upsert({
        where: {
          type_channel: {
            type: NotificationType.SCORE_DEADLINE,
            channel: NotificationChannel.SMS,
          },
        },
        update: {
          content: "SMS-ONLY {missingScoreCount} {periodName}",
          variables: [
            "recipientName",
            "examDateLabel",
            "sessionLabel",
            "missingScoreCount",
            "periodName",
          ],
          description: "Verifier SMS template",
          solapiTemplateId: null,
          updatedBy: teacherWithPhoneId,
        },
        create: {
          type: NotificationType.SCORE_DEADLINE,
          channel: NotificationChannel.SMS,
          content: "SMS-ONLY {missingScoreCount} {periodName}",
          variables: [
            "recipientName",
            "examDateLabel",
            "sessionLabel",
            "missingScoreCount",
            "periodName",
          ],
          description: "Verifier SMS template",
          solapiTemplateId: null,
          updatedBy: teacherWithPhoneId,
        },
      }),
    ),
    withDbRetry(() =>
      prisma.notificationTemplate.upsert({
        where: {
          type_channel: {
            type: NotificationType.SCORE_DEADLINE,
            channel: NotificationChannel.ALIMTALK,
          },
        },
        update: {
          content: "ALIMTALK-ONLY {missingScoreCount} {periodName}",
          variables: [
            "recipientName",
            "examDateLabel",
            "sessionLabel",
            "missingScoreCount",
            "periodName",
          ],
          description: "Verifier AlimTalk template",
          solapiTemplateId: null,
          updatedBy: teacherWithPhoneId,
        },
        create: {
          type: NotificationType.SCORE_DEADLINE,
          channel: NotificationChannel.ALIMTALK,
          content: "ALIMTALK-ONLY {missingScoreCount} {periodName}",
          variables: [
            "recipientName",
            "examDateLabel",
            "sessionLabel",
            "missingScoreCount",
            "periodName",
          ],
          description: "Verifier AlimTalk template",
          solapiTemplateId: null,
          updatedBy: teacherWithPhoneId,
        },
      }),
    ),
  ]);

  await Promise.all([
    withDbRetry(() =>
      prisma.student.create({
        data: {
          examNumber: gongchaeScored,
          name: "Scored Gongchae",
          phone: "01000000001",
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
          examNumber: gongchaeMissing,
          name: "Missing Gongchae",
          phone: "01000000002",
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
          examNumber: gyeongchaeScored,
          name: "Scored Gyeongchae",
          phone: "01000000003",
          examType: ExamType.GYEONGCHAE,
          studentType: StudentType.EXISTING,
          isActive: true,
          notificationConsent: true,
        },
      }),
    ),
  ]);

  await Promise.all([
    withDbRetry(() =>
      prisma.periodEnrollment.create({
        data: { periodId: period.id, examNumber: gongchaeScored },
      }),
    ),
    withDbRetry(() =>
      prisma.periodEnrollment.create({
        data: { periodId: period.id, examNumber: gongchaeMissing },
      }),
    ),
    withDbRetry(() =>
      prisma.periodEnrollment.create({
        data: { periodId: period.id, examNumber: gyeongchaeScored },
      }),
    ),
  ]);

  await Promise.all([
    withDbRetry(() =>
      prisma.score.create({
        data: {
          examNumber: gongchaeScored,
          sessionId: incompleteSession.id,
          rawScore: 82,
          oxScore: 82,
          finalScore: 82,
          attendType: "NORMAL",
          sourceType: "MANUAL_INPUT",
        },
      }),
    ),
    withDbRetry(() =>
      prisma.score.create({
        data: {
          examNumber: gyeongchaeScored,
          sessionId: completeSession.id,
          rawScore: 77,
          oxScore: 77,
          finalScore: 77,
          attendType: "NORMAL",
          sourceType: "MANUAL_INPUT",
        },
      }),
    ),
  ]);

  try {
    process.env.CRON_SECRET = "verify-score-deadline-secret";
    process.env.SCORE_DEADLINE_HOUR = "22";

    const unauthorized = await getScoreDeadlineRoute(
      new Request("https://example.com/api/cron/score-deadline"),
    );
    assert.equal(unauthorized.status, 401);

    assert.deepEqual(parseMissingScoreSessionId(null), {
      ok: false,
      error: "sessionId가 필요합니다.",
    });
    assert.deepEqual(parseMissingScoreSessionId("abc"), {
      ok: false,
      error: "유효한 sessionId가 필요합니다.",
    });
    assert.deepEqual(parseMissingScoreSessionId("0"), {
      ok: false,
      error: "유효한 sessionId가 필요합니다.",
    });
    assert.deepEqual(parseMissingScoreSessionId(String(incompleteSession.id)), {
      ok: true,
      sessionId: incompleteSession.id,
    });

    const beforeDeadlineResult = await runScoreDeadlineNotifications({
      now: beforeDeadline,
      notificationReady: true,
      deliver: async () => ({
        status: "sent",
        channel: NotificationChannel.SMS,
        failReason: null,
      }),
    });
    assert.equal(beforeDeadlineResult.skipped, "before deadline");

    const configMissingResult = await runScoreDeadlineNotifications({
      now: afterDeadline,
      notificationReady: false,
      deliver: async () => ({
        status: "sent",
        channel: NotificationChannel.SMS,
        failReason: null,
      }),
    });
    assert.equal(configMissingResult.error, "Notification delivery is not configured.");
    assert.equal(configMissingResult.createdCount, 0);

    const failedDeliveries: Array<{ recipientPhone: string; message: string }> = [];
    const failedRun = await runScoreDeadlineNotifications({
      now: afterDeadline,
      notificationReady: true,
      deliver: async (input) => {
        failedDeliveries.push(input);
        return {
          status: "failed",
          channel: NotificationChannel.SMS,
          failReason: "Temporary gateway error",
        };
      },
    });

    assert.equal(failedRun.processedSessions, 2);
    assert.equal(failedRun.incompleteSessions, 1);
    assert.equal(failedRun.recipientCount, 2);
    assert.equal(failedRun.sendableRecipientCount, 1);
    assert.equal(failedRun.createdCount, 2);
    assert.equal(failedRun.sentCount, 0);
    assert.equal(failedRun.skippedCount, 1);
    assert.equal(failedRun.failedCount, 1);
    assert.equal(failedRun.duplicateCount, 0);
    assert.equal(failedRun.sessions.length, 1);
    assert.equal(failedRun.sessions[0]?.expectedCount, 2);
    assert.equal(failedRun.sessions[0]?.scoreCount, 1);
    assert.equal(failedRun.sessions[0]?.missingScoreCount, 1);
    assert.equal(failedDeliveries.length, 1);
    assert.ok(failedDeliveries[0]?.message.includes("SMS-ONLY 1"));
    assert.ok(!failedDeliveries[0]?.message.includes("ALIMTALK-ONLY"));

    const failedLogs = await withDbRetry(() =>
      prisma.scoreDeadlineAlertLog.findMany({
        where: { sessionId: incompleteSession.id },
        orderBy: { id: "asc" },
        select: {
          adminId: true,
          type: true,
          status: true,
          channel: true,
          failReason: true,
          message: true,
        },
      }),
    );
    assert.equal(failedLogs.length, 2);
    assert.ok(failedLogs.every((log) => log.type === NotificationType.SCORE_DEADLINE));
    assert.ok(
      failedLogs.some(
        (log) =>
          log.adminId === teacherWithPhoneId &&
          log.status === "failed" &&
          log.channel === NotificationChannel.SMS &&
          log.failReason === "Temporary gateway error" &&
          log.message.includes("SMS-ONLY 1"),
      ),
    );
    assert.ok(
      failedLogs.some(
        (log) =>
          log.adminId === teacherWithoutPhoneId &&
          log.status === "skipped" &&
          log.failReason === "Missing phone number for score deadline alert.",
      ),
    );

    const retryDeliveries: Array<{ recipientPhone: string; message: string }> = [];
    const retryRun = await runScoreDeadlineNotifications({
      now: afterDeadline,
      notificationReady: true,
      deliver: async (input) => {
        retryDeliveries.push(input);
        return {
          status: "sent",
          channel: NotificationChannel.SMS,
          failReason: null,
        };
      },
    });

    assert.equal(retryRun.createdCount, 0);
    assert.equal(retryRun.sentCount, 1);
    assert.equal(retryRun.skippedCount, 0);
    assert.equal(retryRun.failedCount, 0);
    assert.equal(retryRun.duplicateCount, 1);
    assert.equal(retryDeliveries.length, 1);
    assert.ok(retryDeliveries[0]?.message.includes("SMS-ONLY 1"));

    const retriedLogs = await withDbRetry(() =>
      prisma.scoreDeadlineAlertLog.findMany({
        where: { sessionId: incompleteSession.id },
        orderBy: { id: "asc" },
        select: {
          adminId: true,
          status: true,
          channel: true,
          failReason: true,
        },
      }),
    );
    assert.ok(
      retriedLogs.some(
        (log) =>
          log.adminId === teacherWithPhoneId &&
          log.status === "sent" &&
          log.channel === NotificationChannel.SMS &&
          log.failReason === null,
      ),
    );

    const duplicateDeliveries: Array<{ recipientPhone: string; message: string }> = [];
    const duplicateRun = await runScoreDeadlineNotifications({
      now: afterDeadline,
      notificationReady: true,
      deliver: async (input) => {
        duplicateDeliveries.push(input);
        return {
          status: "sent",
          channel: NotificationChannel.SMS,
          failReason: null,
        };
      },
    });

    assert.equal(duplicateRun.createdCount, 0);
    assert.equal(duplicateRun.sentCount, 0);
    assert.equal(duplicateRun.skippedCount, 0);
    assert.equal(duplicateRun.failedCount, 0);
    assert.equal(duplicateRun.duplicateCount, 2);
    assert.equal(duplicateDeliveries.length, 0);

    process.env.SOLAPI_API_KEY = originalNotificationKey || "verify-key";
    process.env.SOLAPI_API_SECRET = originalNotificationSecret || "verify-secret";
    process.env.SOLAPI_SENDER = originalNotificationSender || "01012345678";
    Object.defineProperty(SolapiMessageService.prototype, "sendOne", {
      configurable: true,
      writable: true,
      value: async () => ({
        groupId: "verify-score-deadline",
      }) as never,
    });

    const restoreDate = installFixedDate(afterDeadline);
    try {
      const authorized = await getScoreDeadlineRoute(
        new Request("https://example.com/api/cron/score-deadline", {
          headers: {
            authorization: `Bearer ${process.env.CRON_SECRET}`,
          },
        }),
      );
      assert.equal(authorized.status, 200);

      const payload = (await authorized.json()) as {
        processedSessions: number;
        duplicateCount: number;
      };
      assert.equal(payload.processedSessions, 2);
      assert.equal(payload.duplicateCount, 2);
    } finally {
      restoreDate();
    }

    console.log(
      JSON.stringify(
        {
          verified: true,
          processedSessions: failedRun.processedSessions,
          incompleteSessions: failedRun.incompleteSessions,
          failedCountOnFirstRun: failedRun.failedCount,
          sentCountOnRetry: retryRun.sentCount,
          duplicateCountOnThirdRun: duplicateRun.duplicateCount,
        },
        null,
        2,
      ),
    );
  } finally {
    Object.defineProperty(SolapiMessageService.prototype, "sendOne", {
      configurable: true,
      writable: true,
      value: originalSendOne,
    });
    process.env.CRON_SECRET = originalCronSecret;
    process.env.SOLAPI_API_KEY = originalNotificationKey;
    process.env.SOLAPI_API_SECRET = originalNotificationSecret;
    process.env.SOLAPI_SENDER = originalNotificationSender;
    process.env.SCORE_DEADLINE_HOUR = originalDeadlineHour;

    for (const channel of [NotificationChannel.ALIMTALK, NotificationChannel.SMS]) {
      const original = templateSnapshot.find((template) => template.channel === channel);

      if (original) {
        await withDbRetry(() =>
          prisma.notificationTemplate.upsert({
            where: {
              type_channel: {
                type: NotificationType.SCORE_DEADLINE,
                channel,
              },
            },
            update: {
              content: original.content,
              variables: original.variables,
              description: original.description,
              solapiTemplateId: original.solapiTemplateId,
              updatedBy: original.updatedBy,
            },
            create: {
              type: original.type,
              channel: original.channel,
              content: original.content,
              variables: original.variables,
              description: original.description,
              solapiTemplateId: original.solapiTemplateId,
              updatedBy: original.updatedBy,
            },
          }),
        );
      } else {
        await withDbRetry(() =>
          prisma.notificationTemplate.deleteMany({
            where: {
              type: NotificationType.SCORE_DEADLINE,
              channel,
            },
          }),
        );
      }
    }

    await withDbRetry(() =>
      prisma.scoreDeadlineAlertLog.deleteMany({
        where: {
          sessionId: {
            in: [incompleteSession.id, completeSession.id],
          },
        },
      }),
    );
    await withDbRetry(() =>
      prisma.score.deleteMany({
        where: {
          sessionId: {
            in: [incompleteSession.id, completeSession.id],
          },
        },
      }),
    );
    await withDbRetry(() =>
      prisma.periodEnrollment.deleteMany({
        where: {
          periodId: period.id,
        },
      }),
    );
    await withDbRetry(() =>
      prisma.student.deleteMany({
        where: {
          examNumber: {
            in: [gongchaeScored, gongchaeMissing, gyeongchaeScored],
          },
        },
      }),
    );
    await withDbRetry(() =>
      prisma.examSession.deleteMany({
        where: {
          id: {
            in: [incompleteSession.id, completeSession.id],
          },
        },
      }),
    );
    await withDbRetry(() =>
      prisma.examPeriod.delete({
        where: { id: period.id },
      }),
    );
    await withDbRetry(() =>
      prisma.adminUser.deleteMany({
        where: {
          id: {
            in: [teacherWithPhoneId, teacherWithoutPhoneId, viewerId],
          },
        },
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
