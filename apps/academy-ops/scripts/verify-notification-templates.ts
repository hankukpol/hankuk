import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { NotificationChannel, NotificationType, Prisma } from "@prisma/client";
import { getPrisma } from "../src/lib/prisma";
import {
  ensureNotificationTemplates,
  getResolvedNotificationTemplate,
  listNotificationTemplates,
  renderNotificationMessageFromTemplate,
} from "../src/lib/notifications/template-service";
import { validateNotificationTemplateContent } from "../src/lib/notifications/templates";

const TEMPLATE_COUNT = Object.values(NotificationType).length;
const FALLBACK_ADMIN_ID = "00000000-0000-0000-0000-000000000011";

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

function asStringMap(value: Prisma.JsonValue | null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const entries = Object.entries(value).filter((entry): entry is [string, string] =>
    typeof entry[1] === "string",
  );

  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

async function main() {
  loadLocalEnv();

  const prisma = getPrisma();
  const firstAdmin = await prisma.adminUser.findFirst({
    where: {
      isActive: true,
    },
    select: {
      id: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });
  const adminId = firstAdmin?.id ?? FALLBACK_ADMIN_ID;

  await ensureNotificationTemplates(adminId);
  const templates = await listNotificationTemplates();

  assert.equal(templates.length, TEMPLATE_COUNT);
  assert.equal(new Set(templates.map((template) => template.type)).size, TEMPLATE_COUNT);
  assert.ok(templates.every((template) => template.content.trim().length > 0));
  assert.ok(templates.every((template) => template.variables.length > 0));
  assert.ok(templates.every((template) => template.preview.trim().length > 0));

  const warningTemplate = await getResolvedNotificationTemplate(NotificationType.WARNING_1);
  const warningRendered = renderNotificationMessageFromTemplate(warningTemplate, {
    type: NotificationType.WARNING_1,
    studentName: "Sample Student",
    weekAbsenceCount: 2,
  });

  assert.ok(warningRendered.message.includes("Sample Student"));
  assert.ok(warningRendered.message.includes("2"));
  assert.equal(warningRendered.variables.studentName, "Sample Student");
  assert.equal(warningRendered.variables.weekAbsenceCount, "2");
  assert.equal(warningRendered.variables.messageBody, warningRendered.message);

  const absenceTemplate = await getResolvedNotificationTemplate(NotificationType.ABSENCE_NOTE);
  const absenceRendered = renderNotificationMessageFromTemplate(absenceTemplate, {
    type: NotificationType.ABSENCE_NOTE,
    studentName: "Case Student",
    absenceNoteOutcome: "Approved",
    absenceNoteFollowUp: "See the admin panel for the decision.",
  });

  assert.ok(absenceRendered.message.includes("Case Student"));
  assert.ok(absenceRendered.message.includes("Approved"));
  assert.ok(absenceRendered.message.includes("admin panel"));

  const deadlineTemplate = await getResolvedNotificationTemplate(NotificationType.SCORE_DEADLINE);
  const deadlineRendered = renderNotificationMessageFromTemplate(deadlineTemplate, {
    type: NotificationType.SCORE_DEADLINE,
    studentName: "Lead Teacher",
    recipientName: "Lead Teacher",
    sessionLabel: "Gongchae Week 2 Criminal Law",
    examDateLabel: "2026-03-14",
    missingScoreCount: 3,
    periodName: "2026 Spring",
  });

  assert.ok(deadlineRendered.message.includes("Lead Teacher"));
  assert.ok(deadlineRendered.message.includes("3"));
  assert.equal(deadlineRendered.variables.recipientName, "Lead Teacher");
  assert.equal(deadlineRendered.variables.missingScoreCount, "3");

  assert.throws(() =>
    validateNotificationTemplateContent(
      "Hello {studentName} {unknownField}",
      warningTemplate.variables,
    ),
  );

  const sampleStudent = await prisma.student.findFirst({
    where: {
      isActive: true,
    },
    select: {
      examNumber: true,
    },
    orderBy: {
      examNumber: "asc",
    },
  });

  let logPersistenceChecked = false;
  if (sampleStudent) {
    const stamp = Date.now();
    const sourceLog = await prisma.notificationLog.create({
      data: {
        examNumber: sampleStudent.examNumber,
        type: NotificationType.WARNING_1,
        channel: NotificationChannel.ALIMTALK,
        message: warningRendered.message,
        status: "pending",
        templateVariables: warningRendered.variables,
        dedupeKey: `verify-template-source-${stamp}`,
      },
      select: {
        id: true,
        templateVariables: true,
      },
    });

    const retryLog = await prisma.notificationLog.create({
      data: {
        examNumber: sampleStudent.examNumber,
        type: NotificationType.WARNING_1,
        channel: NotificationChannel.ALIMTALK,
        message: warningRendered.message,
        status: "pending",
        templateVariables: sourceLog.templateVariables ?? Prisma.DbNull,
        dedupeKey: `verify-template-retry-${stamp}`,
      },
      select: {
        id: true,
        templateVariables: true,
      },
    });

    try {
      const [loadedSource, loadedRetry] = await Promise.all([
        prisma.notificationLog.findUniqueOrThrow({
          where: { id: sourceLog.id },
          select: { templateVariables: true },
        }),
        prisma.notificationLog.findUniqueOrThrow({
          where: { id: retryLog.id },
          select: { templateVariables: true },
        }),
      ]);

      const sourceVariables = asStringMap(loadedSource.templateVariables);
      const retryVariables = asStringMap(loadedRetry.templateVariables);

      assert.ok(sourceVariables);
      assert.deepEqual(sourceVariables, warningRendered.variables);
      assert.deepEqual(retryVariables, sourceVariables);
      logPersistenceChecked = true;
    } finally {
      await prisma.notificationLog.deleteMany({
        where: {
          id: {
            in: [sourceLog.id, retryLog.id],
          },
        },
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        templateCount: templates.length,
        logPersistenceChecked,
        sample: templates.map((template) => ({
          type: template.type,
          usesDefault: template.usesDefault,
          preview: template.preview,
        })),
      },
      null,
      2,
    ),
  );

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