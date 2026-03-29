import {
  AdminRole,
  NotificationChannel,
  NotificationType,
  Prisma,
  type ExamType,
} from "@prisma/client";
import { SolapiMessageService } from "solapi";
import { EXAM_TYPE_LABEL, getSubjectDisplayLabel } from "@/lib/constants";
import { hasNotificationConfig } from "@/lib/env";
import { normalizePhone } from "@/lib/excel/workbook";
import { getMissingScoreSessionSummary } from "@/lib/notifications/missing-scores";
import {
  getResolvedNotificationTemplate,
  renderNotificationMessageFromTemplate,
} from "@/lib/notifications/template-service";
import { getPrisma } from "@/lib/prisma";

export type ScoreDeadlineDeliveryResult = {
  status: "sent" | "failed";
  channel: "SMS";
  failReason: string | null;
};

export type ScoreDeadlineSessionResult = {
  sessionId: number;
  periodId: number;
  periodName: string;
  examType: ExamType;
  week: number;
  subjectLabel: string;
  examDate: string;
  expectedCount: number;
  scoreCount: number;
  missingScoreCount: number;
  createdCount: number;
  duplicateCount: number;
  sentCount: number;
  skippedCount: number;
  failedCount: number;
};

export type ScoreDeadlineCronResult = {
  dateKey: string;
  deadlineHour: number;
  processedSessions: number;
  incompleteSessions: number;
  recipientCount: number;
  sendableRecipientCount: number;
  createdCount: number;
  duplicateCount: number;
  sentCount: number;
  skippedCount: number;
  failedCount: number;
  skipped?: "before deadline" | "no sessions" | "no incomplete sessions";
  error?: string;
  sessions: ScoreDeadlineSessionResult[];
};

type DeliverScoreDeadlineAlert = (input: {
  recipientPhone: string;
  message: string;
}) => Promise<ScoreDeadlineDeliveryResult>;

type RunScoreDeadlineNotificationsOptions = {
  now?: Date;
  deliver?: DeliverScoreDeadlineAlert;
  notificationReady?: boolean;
};

type KstClock = {
  dateKey: string;
  hour: number;
  startOfDay: Date;
  endOfDay: Date;
};

type ExistingScoreDeadlineAlertLog = {
  id: number;
  status: string;
};

type PreparedScoreDeadlineAlertLog =
  | {
      action: "duplicate";
      created: false;
    }
  | {
      action: "skip";
      created: boolean;
    }
  | {
      action: "send";
      created: boolean;
      logId: number;
    };

const MISSING_SCORE_DEADLINE_PHONE_REASON =
  "Missing phone number for score deadline alert.";

function getNotificationConfig() {
  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  const sender = process.env.SOLAPI_SENDER;

  if (!apiKey || !apiSecret || !sender) {
    throw new Error("Solapi environment variables are missing.");
  }

  return {
    apiKey,
    apiSecret,
    sender,
  };
}

function getSmsDeliverer(): DeliverScoreDeadlineAlert {
  const config = getNotificationConfig();
  const client = new SolapiMessageService(config.apiKey, config.apiSecret);

  return async ({ recipientPhone, message }) => {
    try {
      await client.sendOne({
        to: recipientPhone,
        from: config.sender,
        text: message,
        type: "SMS",
      });

      return {
        status: "sent",
        channel: NotificationChannel.SMS,
        failReason: null,
      };
    } catch (error) {
      return {
        status: "failed",
        channel: NotificationChannel.SMS,
        failReason: error instanceof Error ? error.message : "SMS delivery failed.",
      };
    }
  };
}

function getKstClock(now: Date): KstClock {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(now).map((part) => [part.type, part.value]),
  );
  const dateKey = `${parts.year}-${parts.month}-${parts.day}`;

  return {
    dateKey,
    hour: Number(parts.hour),
    startOfDay: new Date(`${dateKey}T00:00:00+09:00`),
    endOfDay: new Date(`${dateKey}T23:59:59.999+09:00`),
  };
}

function getScoreDeadlineHour() {
  const raw = process.env.SCORE_DEADLINE_HOUR?.trim();
  const value = Number(raw);

  if (Number.isInteger(value) && value >= 0 && value <= 23) {
    return value;
  }

  return 22;
}

function formatExamDateLabel(value: Date) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function buildSessionLabel(
  summary: NonNullable<Awaited<ReturnType<typeof getMissingScoreSessionSummary>>>,
) {
  const subjectLabel = getSubjectDisplayLabel(
    summary.session.subject,
    summary.session.displaySubjectName,
  );
  return `${EXAM_TYPE_LABEL[summary.session.examType]} Week ${summary.session.week} ${subjectLabel}`;
}

function createBaseResult(clock: KstClock, deadlineHour: number): ScoreDeadlineCronResult {
  return {
    dateKey: clock.dateKey,
    deadlineHour,
    processedSessions: 0,
    incompleteSessions: 0,
    recipientCount: 0,
    sendableRecipientCount: 0,
    createdCount: 0,
    duplicateCount: 0,
    sentCount: 0,
    skippedCount: 0,
    failedCount: 0,
    sessions: [],
  };
}

function canRetryScoreDeadlineAlert(status: string, hasPhone: boolean) {
  return status === "failed" || (hasPhone && status === "skipped");
}

async function reuseOrSkipScoreDeadlineAlertLog(input: {
  prisma: ReturnType<typeof getPrisma>;
  existing: ExistingScoreDeadlineAlertLog;
  hasPhone: boolean;
  message: string;
  templateVariables: Prisma.InputJsonValue;
  sentAt: Date;
}): Promise<PreparedScoreDeadlineAlertLog> {
  if (!canRetryScoreDeadlineAlert(input.existing.status, input.hasPhone)) {
    return {
      action: "duplicate",
      created: false,
    };
  }

  const updated = await input.prisma.scoreDeadlineAlertLog.update({
    where: { id: input.existing.id },
    data: {
      channel: NotificationChannel.SMS,
      message: input.message,
      status: input.hasPhone ? "pending" : "skipped",
      failReason: input.hasPhone ? null : MISSING_SCORE_DEADLINE_PHONE_REASON,
      templateVariables: input.templateVariables,
      sentAt: input.sentAt,
    },
    select: {
      id: true,
    },
  });

  if (!input.hasPhone) {
    return {
      action: "skip",
      created: false,
    };
  }

  return {
    action: "send",
    created: false,
    logId: updated.id,
  };
}

async function prepareScoreDeadlineAlertLog(input: {
  prisma: ReturnType<typeof getPrisma>;
  sessionId: number;
  adminId: string;
  dedupeKey: string;
  hasPhone: boolean;
  message: string;
  templateVariables: Prisma.InputJsonValue;
  sentAt: Date;
}): Promise<PreparedScoreDeadlineAlertLog> {
  const existing = await input.prisma.scoreDeadlineAlertLog.findUnique({
    where: {
      dedupeKey: input.dedupeKey,
    },
    select: {
      id: true,
      status: true,
    },
  });

  if (existing) {
    return reuseOrSkipScoreDeadlineAlertLog({
      prisma: input.prisma,
      existing,
      hasPhone: input.hasPhone,
      message: input.message,
      templateVariables: input.templateVariables,
      sentAt: input.sentAt,
    });
  }

  try {
    const created = await input.prisma.scoreDeadlineAlertLog.create({
      data: {
        sessionId: input.sessionId,
        adminId: input.adminId,
        type: NotificationType.SCORE_DEADLINE,
        channel: NotificationChannel.SMS,
        message: input.message,
        status: input.hasPhone ? "pending" : "skipped",
        failReason: input.hasPhone ? null : MISSING_SCORE_DEADLINE_PHONE_REASON,
        templateVariables: input.templateVariables,
        dedupeKey: input.dedupeKey,
        sentAt: input.sentAt,
      },
      select: {
        id: true,
      },
    });

    if (!input.hasPhone) {
      return {
        action: "skip",
        created: true,
      };
    }

    return {
      action: "send",
      created: true,
      logId: created.id,
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const concurrent = await input.prisma.scoreDeadlineAlertLog.findUnique({
        where: {
          dedupeKey: input.dedupeKey,
        },
        select: {
          id: true,
          status: true,
        },
      });

      if (!concurrent) {
        throw error;
      }

      return reuseOrSkipScoreDeadlineAlertLog({
        prisma: input.prisma,
        existing: concurrent,
        hasPhone: input.hasPhone,
        message: input.message,
        templateVariables: input.templateVariables,
        sentAt: input.sentAt,
      });
    }

    throw error;
  }
}

export async function runScoreDeadlineNotifications(
  options: RunScoreDeadlineNotificationsOptions = {},
): Promise<ScoreDeadlineCronResult> {
  const now = options.now ?? new Date();
  const clock = getKstClock(now);
  const deadlineHour = getScoreDeadlineHour();
  const prisma = getPrisma();
  const base = createBaseResult(clock, deadlineHour);

  if (clock.hour < deadlineHour) {
    return {
      ...base,
      skipped: "before deadline",
    };
  }

  const todaySessions = await prisma.examSession.findMany({
    where: {
      examDate: {
        gte: clock.startOfDay,
        lte: clock.endOfDay,
      },
      isCancelled: false,
    },
    orderBy: [{ examDate: "asc" }, { examType: "asc" }, { subject: "asc" }],
    select: {
      id: true,
    },
  });

  if (todaySessions.length === 0) {
    return {
      ...base,
      skipped: "no sessions",
    };
  }

  const summaries = (await Promise.all(
    todaySessions.map((session) => getMissingScoreSessionSummary(session.id)),
  )).filter((summary): summary is NonNullable<typeof summary> => Boolean(summary));
  const incompleteSummaries = summaries.filter((summary) => summary.missingCount > 0);

  if (incompleteSummaries.length === 0) {
    return {
      ...base,
      processedSessions: todaySessions.length,
      skipped: "no incomplete sessions",
    };
  }

  const recipients = await prisma.adminUser.findMany({
    where: {
      role: AdminRole.TEACHER,
      isActive: true,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      phone: true,
    },
  });
  const sendableRecipientCount = recipients.filter((recipient) =>
    Boolean(normalizePhone(recipient.phone ?? "")),
  ).length;

  if (sendableRecipientCount === 0) {
    return {
      ...base,
      processedSessions: todaySessions.length,
      incompleteSessions: incompleteSummaries.length,
      recipientCount: recipients.length,
      sendableRecipientCount,
      error: "No active teacher phone numbers are configured for score deadline alerts.",
    };
  }

  const notificationReady = options.notificationReady ?? hasNotificationConfig();
  if (!notificationReady) {
    return {
      ...base,
      processedSessions: todaySessions.length,
      incompleteSessions: incompleteSummaries.length,
      recipientCount: recipients.length,
      sendableRecipientCount,
      error: "Notification delivery is not configured.",
    };
  }

  const deliver = options.deliver ?? getSmsDeliverer();
  const template = await getResolvedNotificationTemplate(
    NotificationType.SCORE_DEADLINE,
    NotificationChannel.SMS,
  );
  const result: ScoreDeadlineCronResult = {
    ...base,
    processedSessions: todaySessions.length,
    incompleteSessions: incompleteSummaries.length,
    recipientCount: recipients.length,
    sendableRecipientCount,
  };

  for (const summary of incompleteSummaries) {
    const sessionResult: ScoreDeadlineSessionResult = {
      sessionId: summary.session.id,
      periodId: summary.session.periodId,
      periodName: summary.session.period.name,
      examType: summary.session.examType,
      week: summary.session.week,
      subjectLabel: getSubjectDisplayLabel(
        summary.session.subject,
        summary.session.displaySubjectName,
      ),
      examDate: formatExamDateLabel(summary.session.examDate),
      expectedCount: summary.expectedCount,
      scoreCount: summary.scoreCount,
      missingScoreCount: summary.missingCount,
      createdCount: 0,
      duplicateCount: 0,
      sentCount: 0,
      skippedCount: 0,
      failedCount: 0,
    };
    const sessionLabel = buildSessionLabel(summary);

    for (const recipient of recipients) {
      const normalizedPhone = normalizePhone(recipient.phone ?? "");
      const rendered = renderNotificationMessageFromTemplate(template, {
        type: NotificationType.SCORE_DEADLINE,
        studentName: recipient.name,
        recipientName: recipient.name,
        sessionLabel,
        examDateLabel: formatExamDateLabel(summary.session.examDate),
        missingScoreCount: summary.missingCount,
        periodName: summary.session.period.name,
      });
      const dedupeKey = `score-deadline:${summary.session.id}:${recipient.id}:${clock.dateKey}`;
      const preparedLog = await prepareScoreDeadlineAlertLog({
        prisma,
        sessionId: summary.session.id,
        adminId: recipient.id,
        dedupeKey,
        hasPhone: Boolean(normalizedPhone),
        message: rendered.message,
        templateVariables: rendered.variables,
        sentAt: now,
      });

      if (preparedLog.action === "duplicate") {
        sessionResult.duplicateCount += 1;
        result.duplicateCount += 1;
        continue;
      }

      if (preparedLog.created) {
        sessionResult.createdCount += 1;
        result.createdCount += 1;
      }

      if (preparedLog.action === "skip") {
        sessionResult.skippedCount += 1;
        result.skippedCount += 1;
        continue;
      }

      const delivery = await deliver({
        recipientPhone: normalizedPhone ?? "",
        message: rendered.message,
      });

      await prisma.scoreDeadlineAlertLog.update({
        where: { id: preparedLog.logId },
        data: {
          status: delivery.status,
          channel: delivery.channel,
          failReason: delivery.failReason,
        },
      });

      if (delivery.status === "sent") {
        sessionResult.sentCount += 1;
        result.sentCount += 1;
      } else {
        sessionResult.failedCount += 1;
        result.failedCount += 1;
      }
    }

    result.sessions.push(sessionResult);
  }

  return result;
}


