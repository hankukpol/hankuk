import {
  ExamType,
  NotificationChannel,
  NotificationType,
  Prisma,
  StudentStatus,
} from "@prisma/client";
import { SolapiMessageService } from "solapi";
import { toAuditJson } from "@/lib/audit";
import { revalidateAnalyticsCaches } from "@/lib/cache-tags";
import { getSetupState } from "@/lib/env";
import { normalizePhone } from "@/lib/excel/workbook";
import { getPrisma } from "@/lib/prisma";
import {
  buildNotificationVariables,
  notificationTypeFromStatus,
} from "@/lib/notifications/templates";
import {
  getResolvedNotificationTemplate,
  getResolvedNotificationTemplateMap,
  renderNotificationMessageFromTemplate,
} from "@/lib/notifications/template-service";
import { getDropoutMonitor } from "@/lib/analytics/service";

type ConsentFilters = {
  examType?: ExamType;
  search?: string;
};

const QUEUED_NOTIFICATION_CHANNELS: NotificationChannel[] = [
  NotificationChannel.ALIMTALK,
  NotificationChannel.SMS,
];

function isQueuedNotificationChannel(channel: NotificationChannel) {
  return channel === NotificationChannel.ALIMTALK || channel === NotificationChannel.SMS;
}

type NotificationPreviewRow = {
  examNumber: string;
  name: string;
  phone: string | null;
  currentStatus: StudentStatus;
  notificationConsent: boolean;
  message: string;
  state: "ready" | "excluded";
  exclusionReason: string | null;
  logId?: number;
  notificationType: NotificationType;
};

function getNotificationConfig() {
  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  const sender = process.env.SOLAPI_SENDER;
  const pfId = process.env.SOLAPI_PF_ID;

  if (!apiKey || !apiSecret || !sender) {
    throw new Error("Solapi 환경 변수가 설정되지 않았습니다.");
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

function isSendableStatus(
  status: StudentStatus,
): status is "WARNING_1" | "WARNING_2" | "DROPOUT" {
  return (
    status === StudentStatus.WARNING_1 ||
    status === StudentStatus.WARNING_2 ||
    status === StudentStatus.DROPOUT
  );
}

function getStatusNotificationType(
  status: StudentStatus,
): "WARNING_1" | "WARNING_2" | "DROPOUT" | null {
  return notificationTypeFromStatus(status);
}

function getExclusionReason(input: {
  phone: string | null;
  notificationConsent: boolean;
}) {
  if (!input.notificationConsent) {
    return "수신 동의 없음";
  }

  if (!normalizePhone(input.phone ?? "")) {
    return "전화번호 없음";
  }

  return null;
}

function buildPreviewResponse(rows: NotificationPreviewRow[], missingExamNumbers: string[] = []) {
  return {
    rows,
    readyCount: rows.filter((row) => row.state === "ready").length,
    excludedCount: rows.filter((row) => row.state === "excluded").length,
    missingExamNumbers,
    messageSamples: Array.from(new Set(rows.map((row) => row.message))).slice(0, 3),
  };
}

function readTemplateVariables(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const entries = Object.entries(value).filter((entry): entry is [string, string] =>
    typeof entry[1] === "string",
  );

  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

async function resolveManualRecipients(input: {
  examType?: ExamType;
  examNumbers?: string[];
}) {
  const prisma = getPrisma();
  const requestedExamNumbers = Array.from(
    new Set(
      (input.examNumbers ?? [])
        .map((examNumber) => examNumber.trim())
        .filter(Boolean),
    ),
  );

  const recipients = await prisma.student.findMany({
    where: {
      examType: input.examType,
      isActive: true,
      examNumber: requestedExamNumbers.length
        ? {
            in: requestedExamNumbers,
          }
        : undefined,
    },
    select: {
      examNumber: true,
      name: true,
      phone: true,
      notificationConsent: true,
      currentStatus: true,
    },
    orderBy: [{ examNumber: "asc" }],
  });

  const missingExamNumbers = requestedExamNumbers.filter(
    (examNumber) => !recipients.some((recipient) => recipient.examNumber === examNumber),
  );

  return {
    recipients,
    missingExamNumbers,
  };
}

async function loadQueuedLogs(logIds: number[]) {
  return getPrisma().notificationLog.findMany({
    where: {
      id: {
        in: logIds,
      },
      channel: {
        in: [NotificationChannel.ALIMTALK, NotificationChannel.SMS],
      },
    },
    include: {
      student: {
        select: {
          name: true,
          phone: true,
          notificationConsent: true,
          currentStatus: true,
        },
      },
    },
    orderBy: {
      id: "asc",
    },
  });
}

export async function listNotificationCenterData(filters: ConsentFilters) {
  const search = filters.search?.trim();
  const prisma = getPrisma();

  const [students, pendingLogs, historyLogs] = await Promise.all([
    prisma.student.findMany({
      where: {
        examType: filters.examType,
        isActive: true,
        OR: search
          ? [
              { examNumber: { contains: search } },
              { name: { contains: search } },
            ]
          : undefined,
      },
      orderBy: [{ notificationConsent: "desc" }, { examNumber: "asc" }],
      select: {
        examNumber: true,
        name: true,
        phone: true,
        examType: true,
        currentStatus: true,
        notificationConsent: true,
        consentedAt: true,
      },
    }),
    prisma.notificationLog.findMany({
      where: {
        student: {
          examType: filters.examType,
        },
        channel: {
          in: [...QUEUED_NOTIFICATION_CHANNELS],
        },
        status: {
          in: ["pending", "failed"],
        },
      },
      include: {
        student: {
          select: {
            name: true,
            phone: true,
            notificationConsent: true,
            examType: true,
          },
        },
      },
      orderBy: {
        sentAt: "desc",
      },
      take: 100,
    }),
    prisma.notificationLog.findMany({
      where: {
        student: {
          examType: filters.examType,
        },
      },
      include: {
        student: {
          select: {
            name: true,
            phone: true,
            notificationConsent: true,
            examType: true,
          },
        },
      },
      orderBy: {
        sentAt: "desc",
      },
      take: 100,
    }),
  ]);

  return {
    setup: getSetupState(),
    students,
    pendingLogs,
    historyLogs,
    summary: {
      totalStudents: students.length,
      consentedStudents: students.filter((student) => student.notificationConsent).length,
      excludedStudents: students.filter(
        (student) => !student.notificationConsent || !normalizePhone(student.phone ?? ""),
      ).length,
      pendingCount: pendingLogs.filter((log) => log.status === "pending").length,
      failedCount: pendingLogs.filter((log) => log.status === "failed").length,
    },
  };
}

export async function updateNotificationConsent(input: {
  adminId: string;
  examNumber: string;
  consent: boolean;
  ipAddress?: string | null;
}) {
  return getPrisma().$transaction(async (tx) => {
    const before = await tx.student.findUniqueOrThrow({
      where: {
        examNumber: input.examNumber,
      },
    });

    const student = await tx.student.update({
      where: {
        examNumber: input.examNumber,
      },
      data: {
        notificationConsent: input.consent,
        consentedAt: input.consent ? new Date() : null,
      },
    });

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: "STUDENT_NOTIFICATION_CONSENT_UPDATE",
        targetType: "Student",
        targetId: student.examNumber,
        before: toAuditJson(before),
        after: toAuditJson(student),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return student;
  });
}

export async function previewQueuedNotifications(input: { logIds: number[] }) {
  if (input.logIds.length === 0) {
    throw new Error("발송할 대기 알림을 선택해 주세요.");
  }

  const logs = await loadQueuedLogs(input.logIds);

  if (logs.length === 0) {
    throw new Error("미리보기할 대기 알림이 없습니다.");
  }

  if (logs.length !== input.logIds.length) {
    throw new Error("Some selected logs cannot be retried from this queue.");
  }

  const rows: NotificationPreviewRow[] = logs.map((log) => {
    const exclusionReason = getExclusionReason(log.student);

    return {
      logId: log.id,
      examNumber: log.examNumber,
      name: log.student.name,
      phone: log.student.phone,
      currentStatus: log.student.currentStatus,
      notificationConsent: log.student.notificationConsent,
      message: log.message,
      state: exclusionReason ? "excluded" : "ready",
      exclusionReason,
      notificationType: log.type,
    };
  });

  return buildPreviewResponse(rows);
}

export async function previewManualNotification(input: {
  type: NotificationType;
  message?: string;
  examType?: ExamType;
  examNumbers?: string[];
  pointAmount?: number | null;
}) {
  const message = input.message?.trim() ?? "";

  if (!message && input.type === NotificationType.NOTICE) {
    throw new Error("공지 알림은 발송 메시지를 입력해 주세요.");
  }

  const { recipients, missingExamNumbers } = await resolveManualRecipients({
    examType: input.examType,
    examNumbers: input.examNumbers,
  });

  if (recipients.length === 0) {
    throw new Error("발송 대상 학생이 없습니다.");
  }

  const resolvedTemplate = await getResolvedNotificationTemplate(input.type);
  const rows: NotificationPreviewRow[] = recipients.map((student) => {
    const exclusionReason = getExclusionReason(student);
    const rendered = renderNotificationMessageFromTemplate(resolvedTemplate, {
      type: input.type,
      studentName: student.name,
      customMessage: message || undefined,
      pointAmount: input.pointAmount ?? undefined,
    });

    return {
      examNumber: student.examNumber,
      name: student.name,
      phone: student.phone,
      currentStatus: student.currentStatus,
      notificationConsent: student.notificationConsent,
      message: rendered.message,
      state: exclusionReason ? "excluded" : "ready",
      exclusionReason,
      notificationType: input.type,
    };
  });

  return buildPreviewResponse(rows, missingExamNumbers);
}

async function deliverNotificationLog(
  log: {
    id: number;
    type: NotificationType;
    message: string;
    templateVariables?: unknown;
    student: {
      name: string;
      phone: string | null;
      notificationConsent: boolean;
    };
  },
  templateId?: string | null,
) {
  if (!log.student.notificationConsent) {
    return {
      status: "skipped",
      channel: NotificationChannel.SMS,
      failReason: "수신 동의가 없어 발송 대상에서 제외했습니다.",
    } as const;
  }

  const normalizedPhone = normalizePhone(log.student.phone ?? "");

  if (!normalizedPhone) {
    return {
      status: "skipped",
      channel: NotificationChannel.SMS,
      failReason: "전화번호가 없어 발송할 수 없습니다.",
    } as const;
  }

  const { client, config } = getSolapiClient();
  const resolvedTemplateId =
    templateId ?? (await getResolvedNotificationTemplate(log.type)).solapiTemplateId;
  const variables =
    readTemplateVariables(log.templateVariables) ??
    buildNotificationVariables(
      {
        type: log.type,
        studentName: log.student.name,
        customMessage: log.message,
      },
      log.message,
    );

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
        status: "sent",
        channel: NotificationChannel.ALIMTALK,
        failReason: null,
      } as const;
    } catch (error) {
      const fallbackReason =
        error instanceof Error
          ? `알림톡 발송 실패 후 SMS로 재시도: ${error.message}`
          : "알림톡 발송 실패 후 SMS로 재시도";

      try {
        await client.sendOne({
          to: normalizedPhone,
          from: config.sender,
          text: log.message,
          type: "SMS",
        });

        return {
          status: "sent",
          channel: NotificationChannel.SMS,
          failReason: fallbackReason,
        } as const;
      } catch (fallbackError) {
        return {
          status: "failed",
          channel: NotificationChannel.ALIMTALK,
          failReason:
            fallbackError instanceof Error
              ? `${fallbackReason} / SMS 실패: ${fallbackError.message}`
              : `${fallbackReason} / SMS 실패`,
        } as const;
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
      status: "sent",
      channel: NotificationChannel.SMS,
      failReason: null,
    } as const;
  } catch (error) {
    return {
      status: "failed",
      channel: NotificationChannel.SMS,
      failReason: error instanceof Error ? error.message : "SMS 발송에 실패했습니다.",
    } as const;
  }
}

async function loadNotificationLogForDelivery(logId: number) {
  return getPrisma().notificationLog.findUnique({
    where: {
      id: logId,
    },
    include: {
      student: {
        select: {
          name: true,
          phone: true,
          notificationConsent: true,
          currentStatus: true,
          examType: true,
        },
      },
    },
  });
}

export async function sendQueuedNotifications(input: {
  adminId: string;
  logIds: number[];
  ipAddress?: string | null;
}) {
  if (input.logIds.length === 0) {
    throw new Error("발송할 대기 알림을 선택해 주세요.");
  }

  const prisma = getPrisma();
  const logs = await loadQueuedLogs(input.logIds);

  if (logs.length === 0) {
    throw new Error("발송할 대기 알림이 없습니다.");
  }

  if (logs.length !== input.logIds.length) {
    throw new Error("Some selected logs cannot be retried from this queue.");
  }

  const templateMap = await getResolvedNotificationTemplateMap(
    logs.map((log) => log.type),
  );
  const updated = [];

  for (const log of logs) {
    const result = await deliverNotificationLog(
      log,
      templateMap.get(log.type)?.solapiTemplateId ?? null,
    );
    const next = await prisma.notificationLog.update({
      where: {
        id: log.id,
      },
      data: {
        channel: result.channel,
        status: result.status,
        failReason: result.failReason,
        sentAt: new Date(),
      },
    });
    updated.push(next);
  }

  await prisma.auditLog.create({
    data: {
      adminId: input.adminId,
      action: "NOTIFICATION_SEND",
      targetType: "NotificationLog",
      targetId: input.logIds.join(","),
      before: toAuditJson(null),
      after: toAuditJson(updated),
      ipAddress: input.ipAddress ?? null,
    },
  });

  revalidateAnalyticsCaches();

  return {
    sentCount: updated.filter((log) => log.status === "sent").length,
    failedCount: updated.filter((log) => log.status === "failed").length,
    skippedCount: updated.filter((log) => log.status === "skipped").length,
    logs: updated,
  };
}

export async function retryNotificationLog(input: {
  adminId: string;
  notificationLogId: number;
  ipAddress?: string | null;
}) {
  const prisma = getPrisma();
  const sourceLog = await loadNotificationLogForDelivery(input.notificationLogId);

  if (!sourceLog) {
    throw new Error("Retry source notification log not found.");
  }

  if (!isQueuedNotificationChannel(sourceLog.channel)) {
    throw new Error("Web Push delivery logs cannot be retried from this screen.");
  }

  const lockResult = await prisma.notificationLog.updateMany({
    where: {
      id: sourceLog.id,
      status: "failed",
    },
    data: {
      status: "retrying",
    },
  });

  if (lockResult.count === 0) {
    throw new Error("This notification is already being retried or cannot be retried.");
  }

  let createdLog;

  try {
    createdLog = await prisma.notificationLog.create({
      data: {
        examNumber: sourceLog.examNumber,
        type: sourceLog.type,
        channel: sourceLog.channel,
        message: sourceLog.message,
        status: "pending",
        failReason: null,
        templateVariables: sourceLog.templateVariables ?? Prisma.DbNull,
        dedupeKey: null,
      },
    });
  } catch (error) {
    await prisma.notificationLog.update({
      where: {
        id: sourceLog.id,
      },
      data: {
        status: "failed",
      },
    }).catch(() => undefined);
    throw error;
  }

  const resolvedTemplate = await getResolvedNotificationTemplate(sourceLog.type);
  const result = await deliverNotificationLog(
    {
      id: createdLog.id,
      type: createdLog.type,
      message: createdLog.message,
      templateVariables: createdLog.templateVariables,
      student: {
        name: sourceLog.student.name,
        phone: sourceLog.student.phone,
        notificationConsent: sourceLog.student.notificationConsent,
      },
    },
    resolvedTemplate.solapiTemplateId,
  ).catch((error) => ({
    status: "failed" as const,
    channel: NotificationChannel.ALIMTALK,
    failReason: error instanceof Error ? error.message : "Notification retry failed.",
  }));

  let deliveredLog;
  let retriedSourceLog;

  try {
    [deliveredLog, retriedSourceLog] = await prisma.$transaction([
      prisma.notificationLog.update({
        where: {
          id: createdLog.id,
        },
        data: {
          status: result.status,
          channel: result.channel,
          failReason: result.failReason,
          sentAt: new Date(),
        },
      }),
      prisma.notificationLog.update({
        where: {
          id: sourceLog.id,
        },
        data: {
          status: "retried",
        },
      }),
    ]);
  } catch (error) {
    await prisma.notificationLog.update({
      where: {
        id: sourceLog.id,
      },
      data: {
        status: "failed",
      },
    }).catch(() => undefined);
    await prisma.notificationLog.update({
      where: {
        id: createdLog.id,
      },
      data: {
        status: "failed",
        failReason: result.failReason ?? "Failed to recover retry log state.",
      },
    }).catch(() => undefined);
    throw error;
  }

  await prisma.auditLog.create({
    data: {
      adminId: input.adminId,
      action: "NOTIFICATION_RETRY",
      targetType: "NotificationLog",
      targetId: String(sourceLog.id),
      before: toAuditJson(sourceLog),
      after: toAuditJson({
        sourceLog: retriedSourceLog,
        retryLog: deliveredLog,
      }),
      ipAddress: input.ipAddress ?? null,
    },
  });

  revalidateAnalyticsCaches();

  return {
    sourceLogId: sourceLog.id,
    log: deliveredLog,
  };
}

export async function sendStatusNotifications(input: {
  adminId: string;
  periodId: number;
  examType: ExamType;
  statuses: StudentStatus[];
  ipAddress?: string | null;
}) {
  const targetStatuses = Array.from(
    new Set(input.statuses.filter((status) => isSendableStatus(status))),
  );

  if (targetStatuses.length === 0) {
    throw new Error("발송할 경고 또는 탈락 상태를 선택해 주세요.");
  }

  const monitor = await getDropoutMonitor(input.periodId, input.examType);
  const targets = monitor.rows.filter(
    (row) => row.isActive && targetStatuses.some((status) => status === row.status),
  );

  if (targets.length === 0) {
    throw new Error("현재 조건에 맞는 발송 대상자가 없습니다.");
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const prisma = getPrisma();
  const existingLogs = await prisma.notificationLog.findMany({
    where: {
      examNumber: {
        in: targets.map((row) => row.examNumber),
      },
      type: {
        in: targetStatuses
          .map((status) => getStatusNotificationType(status))
          .filter((type): type is NonNullable<typeof type> => type !== null),
      },
      sentAt: {
        gte: startOfToday,
      },
      status: {
        in: ["pending", "sent"],
      },
    },
    select: {
      examNumber: true,
      type: true,
    },
  });
  const existingSet = new Set(existingLogs.map((log) => `${log.examNumber}:${log.type}`));

  const templateMap = await getResolvedNotificationTemplateMap(
    targetStatuses
      .map((status) => getStatusNotificationType(status))
      .filter((type): type is NonNullable<typeof type> => type !== null),
  );
  const createdLogs = [];

  for (const row of targets) {
    if (!isSendableStatus(row.status)) {
      continue;
    }

    const type = getStatusNotificationType(row.status);

    if (!type) {
      continue;
    }

    const duplicateKey = `${row.examNumber}:${type}`;
    if (existingSet.has(duplicateKey)) {
      continue;
    }

    const canQueue = Boolean(normalizePhone(row.phone ?? ""));
    const resolvedTemplate = templateMap.get(type);

    if (!resolvedTemplate) {
      continue;
    }

    const rendered = renderNotificationMessageFromTemplate(resolvedTemplate, {
      type,
      studentName: row.name,
      recoveryDate: row.recoveryDate,
      weekAbsenceCount: row.currentWeekAbsenceCount,
      monthAbsenceCount: row.currentMonthAbsenceCount,
    });
    const log = await prisma.notificationLog.create({
      data: {
        examNumber: row.examNumber,
        type,
        channel: NotificationChannel.ALIMTALK,
        message: rendered.message,
        templateVariables: rendered.variables,
        status: canQueue ? "pending" : "skipped",
        failReason: canQueue ? null : "Missing phone number for delivery.",
      },
    });

    createdLogs.push(log);
  }

  if (createdLogs.length === 0) {
    return {
      targetCount: targets.length,
      createdCount: 0,
      duplicateCount: targets.length,
      sentCount: 0,
      failedCount: 0,
      skippedCount: 0,
      logs: [],
    };
  }

  const result = await sendQueuedNotifications({
    adminId: input.adminId,
    logIds: createdLogs.map((log) => log.id),
    ipAddress: input.ipAddress,
  });

  return {
    targetCount: targets.length,
    createdCount: createdLogs.length,
    duplicateCount: targets.length - createdLogs.length,
    ...result,
  };
}

export async function sendManualNotification(input: {
  adminId: string;
  type: NotificationType;
  message?: string;
  examType?: ExamType;
  examNumbers?: string[];
  pointAmount?: number | null;
  ipAddress?: string | null;
}) {
  const message = input.message?.trim() ?? "";

  if (!message && input.type === NotificationType.NOTICE) {
    throw new Error("공지 알림은 발송 메시지를 입력해 주세요.");
  }

  const { recipients } = await resolveManualRecipients({
    examType: input.examType,
    examNumbers: input.examNumbers,
  });

  if (recipients.length === 0) {
    throw new Error("발송 대상 학생이 없습니다.");
  }

  const prisma = getPrisma();
  const resolvedTemplate = await getResolvedNotificationTemplate(input.type);
  const createdLogs = [];

  for (const student of recipients) {
    const rendered = renderNotificationMessageFromTemplate(resolvedTemplate, {
      type: input.type,
      studentName: student.name,
      customMessage: message || undefined,
      pointAmount: input.pointAmount ?? undefined,
    });
    const log = await prisma.notificationLog.create({
      data: {
        examNumber: student.examNumber,
        type: input.type,
        channel: NotificationChannel.ALIMTALK,
        message: rendered.message,
        templateVariables: rendered.variables,
        status: "pending",
      },
    });
    createdLogs.push(log);
  }

  return sendQueuedNotifications({
    adminId: input.adminId,
    logIds: createdLogs.map((log) => log.id),
    ipAddress: input.ipAddress,
  });
}
