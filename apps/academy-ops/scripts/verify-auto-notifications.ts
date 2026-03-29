import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  AbsenceStatus,
  ExamType,
  NotificationType,
  Prisma,
  StudentStatus,
  StudentType,
  Subject,
} from "@prisma/client";
import {
  triggerAbsenceNoteNotification,
  triggerStatusChangeNotification,
} from "../src/lib/notifications/auto-trigger";
import { getPrisma } from "../src/lib/prisma";

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

function asStringMap(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const entries = Object.entries(value).filter((entry): entry is [string, string] =>
    typeof entry[1] === "string",
  );

  return entries.length > 0 ? Object.fromEntries(entries) : null;
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

async function main() {
  loadLocalEnv();
  const prisma = getPrisma();
  const stamp = Date.now();
  const periodName = `Verify Auto Notification ${stamp}`;
  const consentedExamNumber = `VERIFYAUTO${stamp}A`;
  const blockedExamNumber = `VERIFYAUTO${stamp}B`;
  const fixedSentAt = new Date("2026-03-14T09:00:00+09:00");

  const period = await withDbRetry(() =>
    prisma.examPeriod.create({
      data: {
        name: periodName,
        startDate: new Date("2026-03-01T00:00:00+09:00"),
        endDate: new Date("2026-03-31T23:59:59+09:00"),
        totalWeeks: 4,
        isActive: false,
        isGongchaeEnabled: true,
        isGyeongchaeEnabled: false,
      },
      select: { id: true },
    }),
  );

  const session = await withDbRetry(() =>
    prisma.examSession.create({
      data: {
        periodId: period.id,
        examType: ExamType.GONGCHAE,
        week: 2,
        subject: Subject.CONSTITUTIONAL_LAW,
        examDate: new Date("2026-03-10T09:00:00+09:00"),
      },
      select: { id: true },
    }),
  );

  const [consentedStudent, blockedStudent] = await Promise.all([
    withDbRetry(() =>
      prisma.student.create({
        data: {
          examNumber: consentedExamNumber,
          name: "Verify Consent On",
          phone: null,
          examType: ExamType.GONGCHAE,
          studentType: StudentType.EXISTING,
          isActive: true,
          notificationConsent: true,
        },
        select: { examNumber: true, name: true },
      }),
    ),
    withDbRetry(() =>
      prisma.student.create({
        data: {
          examNumber: blockedExamNumber,
          name: "Verify Consent Off",
          phone: null,
          examType: ExamType.GONGCHAE,
          studentType: StudentType.EXISTING,
          isActive: true,
          notificationConsent: false,
        },
        select: { examNumber: true, name: true },
      }),
    ),
  ]);

  const [consentedNote, blockedNote] = await Promise.all([
    withDbRetry(() =>
      prisma.absenceNote.create({
        data: {
          examNumber: consentedStudent.examNumber,
          sessionId: session.id,
          reason: "Verifier approved absence",
          status: AbsenceStatus.APPROVED,
        },
        select: { id: true },
      }),
    ),
    withDbRetry(() =>
      prisma.absenceNote.create({
        data: {
          examNumber: blockedStudent.examNumber,
          sessionId: session.id,
          reason: "Verifier blocked absence",
          status: AbsenceStatus.APPROVED,
        },
        select: { id: true },
      }),
    ),
  ]);

  try {
    const approvedLog = await withDbRetry(() =>
      triggerAbsenceNoteNotification({
        noteId: consentedNote.id,
        status: AbsenceStatus.APPROVED,
      }),
    );

    if (!approvedLog) {
      throw new Error("Expected approved absence auto notification log.");
    }

    const approvedPersisted = await withDbRetry(() =>
      prisma.notificationLog.findUniqueOrThrow({
        where: { id: approvedLog.id },
        select: {
          status: true,
          type: true,
          failReason: true,
          templateVariables: true,
        },
      }),
    );
    const approvedVariables = asStringMap(approvedPersisted.templateVariables);

    assert.equal(approvedPersisted.status, "skipped");
    assert.equal(approvedPersisted.type, NotificationType.ABSENCE_NOTE);
    assert.equal(approvedPersisted.failReason, "Missing phone number for automatic delivery.");
    assert.equal(approvedVariables?.studentName, consentedStudent.name);
    assert.equal(approvedVariables?.absenceNoteOutcome, "\uC2B9\uC778");

    const blockedAbsenceResult = await withDbRetry(() =>
      triggerAbsenceNoteNotification({
        noteId: blockedNote.id,
        status: AbsenceStatus.APPROVED,
      }),
    );
    assert.equal(blockedAbsenceResult, null);

    const statusLog = await withDbRetry(() =>
      triggerStatusChangeNotification({
        examNumber: consentedStudent.examNumber,
        studentName: consentedStudent.name,
        phone: null,
        notificationConsent: true,
        nextStatus: StudentStatus.WARNING_1,
        weekAbsenceCount: 1,
        monthAbsenceCount: 1,
        sentAt: fixedSentAt,
      }),
    );

    if (!statusLog) {
      throw new Error("Expected status auto notification log.");
    }

    const statusPersisted = await withDbRetry(() =>
      prisma.notificationLog.findUniqueOrThrow({
        where: { id: statusLog.id },
        select: {
          status: true,
          type: true,
          failReason: true,
          templateVariables: true,
        },
      }),
    );
    const statusVariables = asStringMap(statusPersisted.templateVariables);

    assert.equal(statusPersisted.status, "skipped");
    assert.equal(statusPersisted.type, NotificationType.WARNING_1);
    assert.equal(statusPersisted.failReason, "Missing phone number for automatic delivery.");
    assert.equal(statusVariables?.studentName, consentedStudent.name);
    assert.equal(statusVariables?.weekAbsenceCount, "1");
    assert.equal(statusVariables?.monthAbsenceCount, "1");

    const blockedStatusResult = await withDbRetry(() =>
      triggerStatusChangeNotification({
        examNumber: blockedStudent.examNumber,
        studentName: blockedStudent.name,
        phone: null,
        notificationConsent: false,
        nextStatus: StudentStatus.WARNING_1,
        weekAbsenceCount: 1,
        monthAbsenceCount: 1,
        sentAt: fixedSentAt,
      }),
    );
    assert.equal(blockedStatusResult, null);

    const blockedLogCount = await withDbRetry(() =>
      prisma.notificationLog.count({
        where: {
          examNumber: blockedStudent.examNumber,
        },
      }),
    );
    assert.equal(blockedLogCount, 0);

    console.log(
      JSON.stringify(
        {
          verified: true,
          approvedAbsenceLogId: approvedLog.id,
          statusLogId: statusLog.id,
          blockedLogCount,
        },
        null,
        2,
      ),
    );
  } finally {
    await withDbRetry(() =>
      prisma.notificationLog.deleteMany({
        where: {
          examNumber: {
            in: [consentedStudent.examNumber, blockedStudent.examNumber],
          },
        },
      }),
    );
    await withDbRetry(() =>
      prisma.absenceNote.deleteMany({
        where: {
          id: {
            in: [consentedNote.id, blockedNote.id],
          },
        },
      }),
    );
    await withDbRetry(() =>
      prisma.student.deleteMany({
        where: {
          examNumber: {
            in: [consentedStudent.examNumber, blockedStudent.examNumber],
          },
        },
      }),
    );
    await withDbRetry(() =>
      prisma.examSession.delete({
        where: { id: session.id },
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