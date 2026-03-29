import {
  AbsenceStatus,
  NotificationChannel,
  NotificationLog,
  NotificationType,
  Prisma,
  StudentStatus,
} from "@prisma/client";
import { SolapiMessageService } from "solapi";
import { revalidateAnalyticsCaches } from "@/lib/cache-tags";
import { normalizePhone } from "@/lib/excel/workbook";
import {
  buildDefaultNotificationMessage,
  buildNotificationVariables,
  notificationTypeFromStatus,
  type NotificationMessageInput,
} from "@/lib/notifications/templates";
import {
  getResolvedNotificationTemplate,
  renderNotificationMessageFromTemplate,
} from "@/lib/notifications/template-service";
import { getPrisma } from "@/lib/prisma";

type AutoNotificationInput = {
  examNumber: string;
  studentName: string;
  phone: string | null;
  notificationConsent: boolean;
  type: NotificationType;
  message: string;
  templateId?: string | null;
  templateVariables?: Record<string, string> | null;
  dedupeKey?: string | null;
  sentAt?: Date;
};

type AutoNotificationFailureInput = {
  examNumber: string;
  type: NotificationType;
  message: string;
  failReason: string;
  templateVariables?: Record<string, string> | null;
  dedupeKey?: string | null;
  sentAt?: Date;
};

type DeliveryLog = Pick<NotificationLog, "id" | "type" | "message"> & {
  templateVariables?: Record<string, string> | null;
  student: {
    name: string;
    phone: string | null;
  };
};

function getNotificationConfig() {
  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  const sender = process.env.SOLAPI_SENDER;
  const pfId = process.env.SOLAPI_PF_ID;

  if (!apiKey || !apiSecret || !sender) {
    throw new Error("Solapi environment variables are missing.");
  }

  return {
    apiKey,
    apiSecret,
    sender,
    pfId: pfId ?? null,
  };
}

function getSolapiClient() {
  const config = getNotificationConfig();
  return {
    client: new SolapiMessageService(config.apiKey, config.apiSecret),
    config,
  };
}

function getKstDayKey(date: Date) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getNotificationVariables(log: DeliveryLog) {
  return log.templateVariables && Object.keys(log.templateVariables).length > 0
    ? log.templateVariables
    : buildNotificationVariables(
        {
          type: log.type,
          studentName: log.student.name,
          customMessage: log.message,
        },
        log.message,
      );
}

function buildAutoNotificationFailureReason(error: unknown) {
  if (error instanceof Error) {
    return `Automatic notification preparation failed: ${error.message}`;
  }

  return "Automatic notification preparation failed.";
}

async function persistAutoNotificationFailure(input: AutoNotificationFailureInput) {
  const prisma = getPrisma();
  const dedupeKey = input.dedupeKey?.trim() || null;

  try {
    const log = await prisma.notificationLog.create({
      data: {
        examNumber: input.examNumber,
        type: input.type,
        channel: NotificationChannel.ALIMTALK,
        message: input.message,
        status: "failed",
        failReason: input.failReason,
        templateVariables: input.templateVariables ?? Prisma.DbNull,
        dedupeKey,
        sentAt: input.sentAt ?? new Date(),
      },
    });

    revalidateAnalyticsCaches();
    return log;
  } catch (error) {
    if (
      dedupeKey &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return prisma.notificationLog.findUnique({
        where: {
          dedupeKey,
        },
      });
    }

    throw error;
  }
}

async function deliverNotificationLog(
  log: DeliveryLog,
  templateId?: string | null,
) {
  const normalizedPhone = normalizePhone(log.student.phone ?? "");

  if (!normalizedPhone) {
    return {
      status: "skipped" as const,
      channel: NotificationChannel.SMS,
      failReason: "Missing phone number for automatic delivery.",
    };
  }

  const { client, config } = getSolapiClient();
  const resolvedTemplateId =
    templateId ?? (await getResolvedNotificationTemplate(log.type)).solapiTemplateId;
  const variables = getNotificationVariables(log);

  if (config.pfId && resolvedTemplateId) {
    try {
      await client.sendOne({
        to: normalizedPhone,
        from: config.sender,
        text: log.message,
        kakaoOptions: {
          pfId: config.pfId,
          templateId: resolvedTemplateId,
          variables,
          disableSms: true,
        },
      });

      return {
        status: "sent" as const,
        channel: NotificationChannel.ALIMTALK,
        failReason: null,
      };
    } catch (error) {
      const fallbackReason =
        error instanceof Error
          ? `AlimTalk failed, retrying as SMS: ${error.message}`
          : "AlimTalk failed, retrying as SMS";

      try {
        await client.sendOne({
          to: normalizedPhone,
          from: config.sender,
          text: log.message,
          type: "SMS",
        });

        return {
          status: "sent" as const,
          channel: NotificationChannel.SMS,
          failReason: fallbackReason,
        };
      } catch (fallbackError) {
        return {
          status: "failed" as const,
          channel: NotificationChannel.ALIMTALK,
          failReason:
            fallbackError instanceof Error
              ? `${fallbackReason} / SMS failed: ${fallbackError.message}`
              : `${fallbackReason} / SMS failed`,
        };
      }
    }
  }

  try {
    await client.sendOne({
      to: normalizedPhone,
      from: config.sender,
      text: log.message,
      type: "SMS",
    });

    return {
      status: "sent" as const,
      channel: NotificationChannel.SMS,
      failReason: null,
    };
  } catch (error) {
    return {
      status: "failed" as const,
      channel: NotificationChannel.SMS,
      failReason: error instanceof Error ? error.message : "SMS delivery failed.",
    };
  }
}

async function createAndSendAutoNotification(input: AutoNotificationInput) {
  if (!input.notificationConsent) {
    return null;
  }

  const prisma = getPrisma();
  const sentAt = input.sentAt ?? new Date();
  const dedupeKey = input.dedupeKey?.trim() || null;
  let log: NotificationLog | null = null;

  try {
    log = await prisma.notificationLog.create({
      data: {
        examNumber: input.examNumber,
        type: input.type,
        channel: NotificationChannel.ALIMTALK,
        message: input.message,
        status: normalizePhone(input.phone ?? "") ? "pending" : "skipped",
        failReason: normalizePhone(input.phone ?? "")
          ? null
          : "Missing phone number for automatic delivery.",
        templateVariables: input.templateVariables ?? Prisma.DbNull,
        dedupeKey,
        sentAt,
      },
    });
  } catch (error) {
    if (
      dedupeKey &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return prisma.notificationLog.findUnique({
        where: {
          dedupeKey,
        },
      });
    }

    throw error;
  }

  if (!log) {
    return null;
  }

  if (!normalizePhone(input.phone ?? "")) {
    revalidateAnalyticsCaches();
    return log;
  }

  const result = await deliverNotificationLog(
    {
      id: log.id,
      type: log.type,
      message: log.message,
      templateVariables: input.templateVariables ?? null,
      student: {
        name: input.studentName,
        phone: input.phone,
      },
    },
    input.templateId ?? null,
  ).catch((error) => ({
    status: "failed" as const,
    channel: NotificationChannel.ALIMTALK,
    failReason: error instanceof Error ? error.message : "Automatic notification delivery failed.",
  }));

  const updatedLog = await prisma.notificationLog.update({
    where: {
      id: log.id,
    },
    data: {
      status: result.status,
      channel: result.channel,
      failReason: result.failReason,
      sentAt: new Date(),
    },
  });

  revalidateAnalyticsCaches();

  return updatedLog;
}

function getAbsenceNoteOutcome(status: AbsenceStatus) {
  return status === AbsenceStatus.APPROVED ? "\uC2B9\uC778" : "\uBC18\uB824";
}

function getAbsenceNoteFollowUp(
  status: AbsenceStatus,
  rejectReason?: string | null,
) {
  if (status === AbsenceStatus.APPROVED) {
    return "\uAD00\uB9AC\uC790 \uD654\uBA74\uC5D0\uC11C \uCC98\uB9AC \uACB0\uACFC\uB97C \uD655\uC778\uD574 \uC8FC\uC138\uC694.";
  }

  const reason = rejectReason?.trim();
  return reason
    ? `\uC0AC\uC720: ${reason}`
    : "\uAD00\uB9AC\uC790 \uD654\uBA74\uC5D0\uC11C \uC0AC\uC720\uB97C \uD655\uC778\uD574 \uC8FC\uC138\uC694.";
}

function buildAbsenceNoteRenderInput(
  studentName: string,
  status: AbsenceStatus,
  rejectReason?: string | null,
): NotificationMessageInput {
  return {
    type: NotificationType.ABSENCE_NOTE,
    studentName,
    absenceNoteOutcome: getAbsenceNoteOutcome(status),
    absenceNoteFollowUp: getAbsenceNoteFollowUp(status, rejectReason),
  };
}

function buildStatusRenderInput(input: {
  type: NotificationType;
  studentName: string;
  recoveryDate?: Date | null;
  weekAbsenceCount?: number | null;
  monthAbsenceCount?: number | null;
}): NotificationMessageInput {
  return {
    type: input.type,
    studentName: input.studentName,
    recoveryDate: input.recoveryDate,
    weekAbsenceCount: input.weekAbsenceCount,
    monthAbsenceCount: input.monthAbsenceCount,
  };
}

export async function triggerAbsenceNoteNotification(input: {
  noteId: number;
  status: AbsenceStatus;
}) {
  const note = await getPrisma().absenceNote.findUnique({
    where: {
      id: input.noteId,
    },
    include: {
      student: {
        select: {
          examNumber: true,
          name: true,
          phone: true,
          notificationConsent: true,
        },
      },
    },
  });

  if (!note || (input.status !== AbsenceStatus.APPROVED && input.status !== AbsenceStatus.REJECTED)) {
    return null;
  }

  if (!note.student.notificationConsent) {
    return null;
  }

  const renderInput = buildAbsenceNoteRenderInput(
    note.student.name,
    input.status,
    note.adminNote,
  );
  const dedupeKey = `absence-note:${note.id}:${input.status}:${getKstDayKey(note.updatedAt)}`;
  const fallbackMessage = buildDefaultNotificationMessage(renderInput);
  const fallbackVariables = buildNotificationVariables(renderInput, fallbackMessage);

  try {
    const template = await getResolvedNotificationTemplate(NotificationType.ABSENCE_NOTE);
    const rendered = renderNotificationMessageFromTemplate(template, renderInput);

    return await createAndSendAutoNotification({
      examNumber: note.examNumber,
      studentName: note.student.name,
      phone: note.student.phone,
      notificationConsent: note.student.notificationConsent,
      type: NotificationType.ABSENCE_NOTE,
      message: rendered.message,
      templateId: template.solapiTemplateId,
      templateVariables: rendered.variables,
      dedupeKey,
    });
  } catch (error) {
    return persistAutoNotificationFailure({
      examNumber: note.examNumber,
      type: NotificationType.ABSENCE_NOTE,
      message: fallbackMessage,
      templateVariables: fallbackVariables,
      failReason: buildAutoNotificationFailureReason(error),
      dedupeKey,
    });
  }
}

export async function triggerStatusChangeNotification(input: {
  examNumber: string;
  studentName: string;
  phone: string | null;
  notificationConsent: boolean;
  nextStatus: StudentStatus;
  recoveryDate?: Date | null;
  weekAbsenceCount?: number | null;
  monthAbsenceCount?: number | null;
  sentAt?: Date;
}) {
  const type = notificationTypeFromStatus(input.nextStatus);

  if (!type || !input.notificationConsent) {
    return null;
  }

  const sentAt = input.sentAt ?? new Date();
  const renderInput = buildStatusRenderInput({
    type,
    studentName: input.studentName,
    recoveryDate: input.recoveryDate,
    weekAbsenceCount: input.weekAbsenceCount,
    monthAbsenceCount: input.monthAbsenceCount,
  });
  const dedupeKey = `status:${input.examNumber}:${type}:${getKstDayKey(sentAt)}`;
  const fallbackMessage = buildDefaultNotificationMessage(renderInput);
  const fallbackVariables = buildNotificationVariables(renderInput, fallbackMessage);

  try {
    const template = await getResolvedNotificationTemplate(type);
    const rendered = renderNotificationMessageFromTemplate(template, renderInput);

    return await createAndSendAutoNotification({
      examNumber: input.examNumber,
      studentName: input.studentName,
      phone: input.phone,
      notificationConsent: input.notificationConsent,
      type,
      message: rendered.message,
      templateId: template.solapiTemplateId,
      templateVariables: rendered.variables,
      dedupeKey,
      sentAt,
    });
  } catch (error) {
    return persistAutoNotificationFailure({
      examNumber: input.examNumber,
      type,
      message: fallbackMessage,
      templateVariables: fallbackVariables,
      failReason: buildAutoNotificationFailureReason(error),
      dedupeKey,
      sentAt,
    });
  }
}