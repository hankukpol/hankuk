import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ExamType,
  NoticeTargetType,
  NotificationChannel,
  NotificationType,
} from "@prisma/client";
import { DELETE, POST } from "@/app/api/student/push/subscribe/route";
import { signStudentJwt, STUDENT_SESSION_COOKIE_NAME } from "@/lib/auth/student-jwt";
import { sendNoticeWebPush, upsertStudentPushSubscription } from "@/lib/notifications/web-push";
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

function makeSubscription(endpoint: string) {
  return {
    endpoint,
    keys: {
      p256dh: `p256dh-${endpoint}`,
      auth: `auth-${endpoint}`,
    },
  };
}

function makeRequest(method: string, token: string, body: unknown) {
  return new Request("http://localhost/api/student/push/subscribe", {
    method,
    headers: {
      cookie: `${STUDENT_SESSION_COOKIE_NAME}=${token}`,
      "content-type": "application/json",
      "user-agent": "verify-student-web-push",
    },
    body: JSON.stringify(body),
  });
}

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

async function main() {
  process.env.STUDENT_JWT_SECRET = process.env.STUDENT_JWT_SECRET || "verify-student-push-secret";
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY =
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
    "BEl6S3_lmT0wJYQW4vS6xg5y8fS2c6eJ6cJpM2lP2FZ7o1L7M3kH2tX2Xx5Q2e1R1G6s7d8f9g0h1i2j3k4l5m";
  process.env.VAPID_PRIVATE_KEY =
    process.env.VAPID_PRIVATE_KEY ||
    "u2Wm5rL2r3q5w9c7d8e1f2g3h4i5j6k7l8m9n0o1p2q";
  process.env.VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:verify@example.com";

  const prisma = getPrisma();
  const suffix = Date.now();
  const gongExamNumber = `VERIFYPUSHG${suffix}`;
  const gongFailedExamNumber = `VERIFYPUSHF${suffix}`;
  const gyeongExamNumber = `VERIFYPUSHY${suffix}`;
  const inactiveExamNumber = `VERIFYPUSHI${suffix}`;
  const noticeId = Number(String(suffix).slice(-8));

  await prisma.student.createMany({
    data: [
      {
        examNumber: gongExamNumber,
        name: "검증 공채",
        examType: ExamType.GONGCHAE,
        isActive: true,
      },
      {
        examNumber: gongFailedExamNumber,
        name: "검증 공채 실패",
        examType: ExamType.GONGCHAE,
        isActive: true,
      },
      {
        examNumber: gyeongExamNumber,
        name: "검증 경채",
        examType: ExamType.GYEONGCHAE,
        isActive: true,
      },
      {
        examNumber: inactiveExamNumber,
        name: "검증 비활성",
        examType: ExamType.GONGCHAE,
        isActive: false,
      },
    ],
  });

  const gongToken = await signStudentJwt(gongExamNumber);
  const gyeongToken = await signStudentJwt(gyeongExamNumber);

  try {
    await prisma.notificationLog.deleteMany({
      where: {
        examNumber: {
          in: [gongExamNumber, gongFailedExamNumber, gyeongExamNumber, inactiveExamNumber],
        },
        channel: NotificationChannel.WEB_PUSH,
      },
    });

    const subscribeResponse = await POST(
      makeRequest("POST", gongToken, makeSubscription("https://push.example.com/gong-primary")),
    );
    assert(subscribeResponse.status === 200, "Expected subscribe POST to succeed.");

    const reboundResponse = await POST(
      makeRequest("POST", gyeongToken, makeSubscription("https://push.example.com/gong-primary")),
    );
    assert(reboundResponse.status === 200, "Expected endpoint rebinding to succeed.");

    const rebound = await prisma.pushSubscription.findUniqueOrThrow({
      where: {
        endpoint: "https://push.example.com/gong-primary",
      },
    });
    assert(
      rebound.examNumber === gyeongExamNumber,
      "Endpoint should rebind to the authenticated student.",
    );

    await upsertStudentPushSubscription({
      examNumber: gongExamNumber,
      endpoint: "https://push.example.com/gong-valid",
      p256dh: "gong-valid-key",
      auth: "gong-valid-auth",
      userAgent: "verify",
    });
    await upsertStudentPushSubscription({
      examNumber: gongExamNumber,
      endpoint: "https://push.example.com/gong-expired",
      p256dh: "gong-expired-key",
      auth: "gong-expired-auth",
      userAgent: "verify",
    });
    await upsertStudentPushSubscription({
      examNumber: gongFailedExamNumber,
      endpoint: "https://push.example.com/gong-failed",
      p256dh: "gong-failed-key",
      auth: "gong-failed-auth",
      userAgent: "verify",
    });
    await upsertStudentPushSubscription({
      examNumber: inactiveExamNumber,
      endpoint: "https://push.example.com/inactive",
      p256dh: "inactive-key",
      auth: "inactive-auth",
      userAgent: "verify",
    });

    const deliveredEndpoints: string[] = [];
    const notice = {
      id: noticeId,
      title: "주간 공지",
      content: "<p>다음 주 시험 일정과 준비물을 확인해 주세요.</p>",
      targetType: NoticeTargetType.GONGCHAE,
    };

    const client = {
      async sendNotification(subscription: { endpoint: string }, payload?: string) {
        deliveredEndpoints.push(subscription.endpoint);
        assert(
          typeof payload === "string" && payload.includes("주간 공지"),
          "Expected payload to include the notice title.",
        );

        if (subscription.endpoint.endsWith("gong-expired")) {
          const error = new Error("expired") as Error & { statusCode: number };
          error.statusCode = 410;
          throw error;
        }

        if (subscription.endpoint.endsWith("gong-failed")) {
          throw new Error("push endpoint rejected");
        }

        return { statusCode: 201 };
      },
    };

    const firstResult = await sendNoticeWebPush(notice, { client });

    assert(firstResult.totalSubscriptions === 3, "Only active gongchae subscriptions should be targeted.");
    assert(firstResult.sentCount === 1, "Exactly one valid subscription should be delivered.");
    assert(firstResult.failedCount === 1, "Exactly one active subscription should fail.");
    assert(firstResult.removedCount === 1, "Expired subscriptions should be removed.");
    assert(
      !deliveredEndpoints.includes("https://push.example.com/gong-primary"),
      "Rebound gyeongchae endpoint must not receive gongchae notices.",
    );
    assert(
      !deliveredEndpoints.includes("https://push.example.com/inactive"),
      "Inactive student subscriptions must be excluded.",
    );

    const expired = await prisma.pushSubscription.findUnique({
      where: {
        endpoint: "https://push.example.com/gong-expired",
      },
    });
    assert(expired === null, "Expired subscription should be deleted after a 410 response.");

    const firstLogs = await prisma.notificationLog.findMany({
      where: {
        examNumber: {
          in: [gongExamNumber, gongFailedExamNumber, gyeongExamNumber, inactiveExamNumber],
        },
        type: NotificationType.NOTICE,
        channel: NotificationChannel.WEB_PUSH,
      },
      orderBy: {
        examNumber: "asc",
      },
    });

    assert(firstLogs.length === 2, "Expected one Web Push log per targeted student.");
    assert(
      firstLogs.every((log) =>
        [gongExamNumber, gongFailedExamNumber].includes(log.examNumber),
      ),
      "Only targeted active gongchae students should receive Web Push logs.",
    );

    const sentLog = firstLogs.find((log) => log.examNumber === gongExamNumber);
    const failedLog = firstLogs.find((log) => log.examNumber === gongFailedExamNumber);

    assert(sentLog?.status === "sent", "Expected the partially successful student log to be marked sent.");
    assert(
      (sentLog?.failReason ?? "").includes("만료") || (sentLog?.failReason ?? "").includes("410"),
      "Expected the successful student log to preserve the partial failure reason.",
    );
    assert(failedLog?.status === "failed", "Expected the fully failed student log to be marked failed.");
    assert(
      (failedLog?.failReason ?? "").includes("push endpoint rejected"),
      "Expected the failed student log to persist the delivery error.",
    );
    assert(
      firstLogs.every((log) => log.dedupeKey === `notice:${noticeId}:web-push:${log.examNumber}`),
      "Expected Web Push logs to use a stable per-notice dedupe key.",
    );

    const secondResult = await sendNoticeWebPush(notice, { client });
    assert(secondResult.totalSubscriptions === 2, "Expired subscriptions should not be targeted on rerun.");
    assert(secondResult.sentCount === 1, "The remaining valid subscription should still succeed on rerun.");
    assert(secondResult.failedCount === 1, "The failing subscription should still fail on rerun.");
    assert(secondResult.removedCount === 0, "There should be no more expired subscriptions after cleanup.");

    const secondLogs = await prisma.notificationLog.findMany({
      where: {
        examNumber: {
          in: [gongExamNumber, gongFailedExamNumber, gyeongExamNumber, inactiveExamNumber],
        },
        type: NotificationType.NOTICE,
        channel: NotificationChannel.WEB_PUSH,
      },
      orderBy: {
        examNumber: "asc",
      },
    });
    assert(secondLogs.length === 2, "Rerunning the same notice should upsert, not append, Web Push logs.");

    const deleteResponse = await DELETE(
      makeRequest("DELETE", gyeongToken, { endpoint: "https://push.example.com/gong-primary" }),
    );
    const deletePayload = await readJson(deleteResponse);
    assert(deleteResponse.status === 200, "Expected DELETE unsubscribe to succeed.");
    assert(deletePayload.deletedCount === 1, "Expected DELETE to remove the rebound endpoint.");

    const remaining = await prisma.pushSubscription.findMany({
      where: {
        examNumber: {
          in: [gongExamNumber, gongFailedExamNumber, gyeongExamNumber, inactiveExamNumber],
        },
      },
      orderBy: {
        endpoint: "asc",
      },
    });

    console.log(
      JSON.stringify(
        {
          verified: true,
          gongExamNumber,
          gongFailedExamNumber,
          gyeongExamNumber,
          targetedDeliveries: deliveredEndpoints,
          webPushLogCount: secondLogs.length,
          remainingEndpoints: remaining.map((subscription) => subscription.endpoint),
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.notificationLog.deleteMany({
      where: {
        examNumber: {
          in: [gongExamNumber, gongFailedExamNumber, gyeongExamNumber, inactiveExamNumber],
        },
        channel: NotificationChannel.WEB_PUSH,
      },
    }).catch(() => undefined);
    await prisma.pushSubscription.deleteMany({
      where: {
        endpoint: {
          in: [
            "https://push.example.com/gong-primary",
            "https://push.example.com/gong-valid",
            "https://push.example.com/gong-expired",
            "https://push.example.com/gong-failed",
            "https://push.example.com/inactive",
          ],
        },
      },
    }).catch(() => undefined);
    await prisma.student.deleteMany({
      where: {
        examNumber: {
          in: [gongExamNumber, gongFailedExamNumber, gyeongExamNumber, inactiveExamNumber],
        },
      },
    }).catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
