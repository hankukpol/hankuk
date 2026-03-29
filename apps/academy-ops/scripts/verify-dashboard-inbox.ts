import { readFileSync } from "node:fs";
import path from "node:path";
import { ExamType, NotificationChannel, NotificationType, StudentStatus } from "@prisma/client";
import { listDashboardInboxData } from "@/lib/dashboard/inbox";
import { getPrisma } from "@/lib/prisma";

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

      if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    // ignore missing env files in verifier
  }
}

const webRoot = path.resolve(process.cwd());
loadEnvFile(path.join(webRoot, ".env.local"));
loadEnvFile(path.join(webRoot, ".env"));

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function ensureActivePeriod() {
  const prisma = getPrisma();
  const existing = await prisma.examPeriod.findFirst({
    where: { isActive: true },
    orderBy: [{ startDate: "desc" }],
    select: { id: true },
  });

  if (existing) {
    return { periodId: existing.id, cleanup: async () => undefined };
  }

  const created = await prisma.examPeriod.create({
    data: {
      name: `VERIFY-INBOX-${Date.now()}`,
      startDate: new Date(Date.now() - 86400000),
      endDate: new Date(Date.now() + 86400000 * 7),
      totalWeeks: 1,
      isActive: true,
      isGongchaeEnabled: true,
      isGyeongchaeEnabled: true,
    },
    select: { id: true },
  });

  return {
    periodId: created.id,
    cleanup: async () => {
      await prisma.examPeriod.delete({ where: { id: created.id } }).catch(() => undefined);
    },
  };
}

async function main() {
  const prisma = getPrisma();
  const suffix = Date.now();
  const examNumber = `VERIFYINBOX${suffix}`;
  const name = `검증 인박스 ${suffix}`;
  const { cleanup: cleanupPeriod } = await ensureActivePeriod();

  await prisma.student.create({
    data: {
      examNumber,
      name,
      examType: ExamType.GONGCHAE,
      studentType: "EXISTING",
      currentStatus: StudentStatus.NORMAL,
      isActive: true,
      notificationConsent: true,
    },
  });

  const baseline = await listDashboardInboxData({ includeFailedNotifications: true });
  const baselineViewer = await listDashboardInboxData({ includeFailedNotifications: false });

  const createdAt = new Date();
  const [webPushLog, smsLog] = await Promise.all([
    prisma.notificationLog.create({
      data: {
        examNumber,
        type: NotificationType.NOTICE,
        channel: NotificationChannel.WEB_PUSH,
        message: "[공지] 웹 푸시 실패 검증",
        status: "failed",
        failReason: "web push failed",
        sentAt: createdAt,
      },
    }),
    prisma.notificationLog.create({
      data: {
        examNumber,
        type: NotificationType.NOTICE,
        channel: NotificationChannel.SMS,
        message: "[공지] SMS 실패 검증",
        status: "failed",
        failReason: "sms failed",
        sentAt: createdAt,
      },
    }),
  ]);

  try {
    const teacherData = await listDashboardInboxData({ includeFailedNotifications: true });
    const viewerData = await listDashboardInboxData({ includeFailedNotifications: false });

    assert(
      teacherData.counts.failedNotifications === baseline.counts.failedNotifications + 1,
      "Dashboard failed notification count should only include retryable channels.",
    );
    assert(
      viewerData.counts.failedNotifications === baselineViewer.counts.failedNotifications,
      "Viewer dashboard inbox should continue to hide failed notification counts.",
    );

    const smsItem = teacherData.items.find((item) => item.retryPayload?.notificationLogId === smsLog.id);
    const webPushItem = teacherData.items.find(
      (item) => item.retryPayload?.notificationLogId === webPushLog.id,
    );

    assert(Boolean(smsItem), "Retryable SMS failure should appear in the dashboard inbox.");
    assert(!webPushItem, "Web Push failure must not appear in the dashboard retry inbox.");

    console.log(
      JSON.stringify(
        {
          verified: true,
          baselineFailedNotifications: baseline.counts.failedNotifications,
          nextFailedNotifications: teacherData.counts.failedNotifications,
          viewerFailedNotifications: viewerData.counts.failedNotifications,
          smsLogId: smsLog.id,
          webPushLogId: webPushLog.id,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.notificationLog.deleteMany({
      where: {
        id: {
          in: [webPushLog.id, smsLog.id],
        },
      },
    }).catch(() => undefined);
    await prisma.student.delete({ where: { examNumber } }).catch(() => undefined);
    await cleanupPeriod();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
