import {
  ExamType,
  Notice,
  NoticeTargetType,
  NotificationChannel,
  NotificationType,
} from "@prisma/client";
import * as webpush from "web-push";
import { getRequiredWebPushEnv, hasWebPushConfig } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { richTextToPlainText } from "@/lib/rich-text";

type NoticePushNotice = Pick<Notice, "id" | "title" | "content" | "targetType">;

type WebPushDeliveryClient = {
  sendNotification: (
    subscription: webpush.PushSubscription,
    payload?: string,
  ) => Promise<unknown>;
};

type NoticePushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
};

type PushSubscriptionRecord = {
  id: string;
  examNumber: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

type StudentPushResult = {
  examNumber: string;
  sentCount: number;
  failedCount: number;
  removedCount: number;
  reasons: string[];
};

let vapidConfigured = false;

function configureWebPush() {
  if (vapidConfigured) {
    return;
  }

  const env = getRequiredWebPushEnv();
  webpush.setVapidDetails(env.subject, env.publicKey, env.privateKey);
  vapidConfigured = true;
}

function noticeTargetToExamType(targetType: NoticeTargetType) {
  switch (targetType) {
    case NoticeTargetType.GONGCHAE:
      return ExamType.GONGCHAE;
    case NoticeTargetType.GYEONGCHAE:
      return ExamType.GYEONGCHAE;
    default:
      return undefined;
  }
}

function buildNoticePushPayload(notice: NoticePushNotice): NoticePushPayload {
  const plainText = richTextToPlainText(notice.content).replace(/\s+/g, " ").trim();
  const body = plainText
    ? `${plainText.slice(0, 120)}${plainText.length > 120 ? "..." : ""}`
    : "A new notice has been published.";

  return {
    title: notice.title,
    body,
    url: "/student/notices",
    tag: `notice-${notice.id}`,
  };
}
function buildNoticePushLogMessage(payload: NoticePushPayload) {
  return `[Notice] ${payload.title}${payload.body ? ` - ${payload.body}` : ""}`;
}
function buildNoticePushDedupeKey(noticeId: number, examNumber: string) {
  return `notice:${noticeId}:web-push:${examNumber}`;
}

function toWebPushSubscription(record: {
  endpoint: string;
  p256dh: string;
  auth: string;
}): webpush.PushSubscription {
  return {
    endpoint: record.endpoint,
    keys: {
      p256dh: record.p256dh,
      auth: record.auth,
    },
  };
}

function readStatusCode(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof (error as { statusCode?: unknown }).statusCode === "number"
  ) {
    return (error as { statusCode: number }).statusCode;
  }

  return null;
}

function readErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Web Push delivery failed.";
}
function getWebPushClient(): WebPushDeliveryClient {
  configureWebPush();
  return webpush;
}

function getStudentPushResult(
  resultMap: Map<string, StudentPushResult>,
  examNumber: string,
): StudentPushResult {
  const current = resultMap.get(examNumber);

  if (current) {
    return current;
  }

  const created: StudentPushResult = {
    examNumber,
    sentCount: 0,
    failedCount: 0,
    removedCount: 0,
    reasons: [],
  };

  resultMap.set(examNumber, created);
  return created;
}

function buildStudentFailReason(result: StudentPushResult) {
  const uniqueReasons = Array.from(new Set(result.reasons.filter(Boolean)));

  if (result.sentCount > 0) {
    if (result.failedCount === 0 && result.removedCount === 0) {
      return null;
    }

    return uniqueReasons.length > 0
      ? uniqueReasons.join(" / ")
      : `Partial Web Push delivery failure (${result.failedCount + result.removedCount}).`;
  }

  if (result.removedCount > 0 && result.failedCount === 0) {
    return uniqueReasons[0] ?? "Expired Web Push subscription was cleaned up.";
  }

  return uniqueReasons[0] ?? "Web Push delivery failed.";
}

export async function upsertStudentPushSubscription(input: {
  examNumber: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
}) {
  return getPrisma().pushSubscription.upsert({
    where: {
      endpoint: input.endpoint,
    },
    create: {
      examNumber: input.examNumber,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: input.userAgent ?? null,
    },
    update: {
      examNumber: input.examNumber,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: input.userAgent ?? null,
    },
  });
}

export async function deleteStudentPushSubscription(input: {
  examNumber: string;
  endpoint: string;
}) {
  return getPrisma().pushSubscription.deleteMany({
    where: {
      examNumber: input.examNumber,
      endpoint: input.endpoint,
    },
  });
}

export async function sendNoticeWebPush(
  notice: NoticePushNotice,
  options: {
    client?: WebPushDeliveryClient;
  } = {},
) {
  if (!hasWebPushConfig()) {
    return {
      status: "skipped" as const,
      reason: "Web Push environment variables are not configured.",
      totalSubscriptions: 0,
      sentCount: 0,
      failedCount: 0,
      removedCount: 0,
    };
  }
  const prisma = getPrisma();
  const examType = noticeTargetToExamType(notice.targetType);
  const subscriptions = (await prisma.pushSubscription.findMany({
    where: {
      student: {
        isActive: true,
        examType,
      },
    },
    select: {
      id: true,
      examNumber: true,
      endpoint: true,
      p256dh: true,
      auth: true,
    },
    orderBy: {
      updatedAt: "desc",
    },
  })) as PushSubscriptionRecord[];

  if (subscriptions.length === 0) {
    return {
      status: "skipped" as const,
      reason: "No student is currently subscribed to notice pushes.",
      totalSubscriptions: 0,
      sentCount: 0,
      failedCount: 0,
      removedCount: 0,
    };
  }
  const payload = buildNoticePushPayload(notice);
  const serializedPayload = JSON.stringify(payload);
  const logMessage = buildNoticePushLogMessage(payload);
  const client = options.client ?? getWebPushClient();

  let sentCount = 0;
  let failedCount = 0;
  let removedCount = 0;
  const resultMap = new Map<string, StudentPushResult>();

  for (const subscription of subscriptions) {
    const studentResult = getStudentPushResult(resultMap, subscription.examNumber);

    try {
      await client.sendNotification(toWebPushSubscription(subscription), serializedPayload);
      sentCount += 1;
      studentResult.sentCount += 1;
    } catch (error) {
      const statusCode = readStatusCode(error);

      if (statusCode === 404 || statusCode === 410) {
        await prisma.pushSubscription.delete({
          where: {
            id: subscription.id,
          },
        }).catch(() => undefined);
        removedCount += 1;
        studentResult.removedCount += 1;
        studentResult.reasons.push(
          `Expired push subscription was cleaned up (${statusCode}).`,
        );
        continue;
      }

      failedCount += 1;
      studentResult.failedCount += 1;
      studentResult.reasons.push(readErrorMessage(error));
      console.error("[WebPush] notice delivery failed:", error);
    }
  }

  for (const result of resultMap.values()) {
    const dedupeKey = buildNoticePushDedupeKey(notice.id, result.examNumber);
    const failReason = buildStudentFailReason(result);
    const nextStatus = result.sentCount > 0 ? "sent" : "failed";
    const existingLog = await prisma.notificationLog.findFirst({
      where: {
        dedupeKey,
      },
      select: {
        id: true,
      },
    });

    if (existingLog) {
      await prisma.notificationLog.update({
        where: {
          id: existingLog.id,
        },
        data: {
          channel: NotificationChannel.WEB_PUSH,
          type: NotificationType.NOTICE,
          message: logMessage,
          status: nextStatus,
          failReason,
          sentAt: new Date(),
        },
      });
      continue;
    }

    await prisma.notificationLog.create({
      data: {
        examNumber: result.examNumber,
        type: NotificationType.NOTICE,
        channel: NotificationChannel.WEB_PUSH,
        message: logMessage,
        status: nextStatus,
        failReason,
        dedupeKey,
      },
    });
  }

  return {
    status: "completed" as const,
    totalSubscriptions: subscriptions.length,
    sentCount,
    failedCount,
    removedCount,
  };
}
