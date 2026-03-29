import { NotificationChannel, NotificationType, Prisma } from '@prisma/client';
import { SolapiMessageService } from 'solapi';
import { normalizePhone } from '@/lib/excel/workbook';
import { getResolvedNotificationTemplate } from '@/lib/notifications/template-service';
import {
  buildNotificationVariables,
  renderNotificationTemplateContent,
  type NotificationMessageInput,
} from '@/lib/notifications/templates';
import { getPrisma } from '@/lib/prisma';
import { getSystemConfig } from '@/lib/system-config';

export type PaymentReminderScheduleKey = 'manual' | 'manual-installment' | 'd-3' | 'd-1' | 'd-day';

export type PaymentReminderInput = {
  examNumber: string;
  enrollmentId?: string | null;
  installmentId?: string | null;
  unpaidAmount?: number | null;
  courseName?: string | null;
  dueDate?: Date | string | null;
  scheduleKey: PaymentReminderScheduleKey;
  adminId?: string | null;
  ipAddress?: string | null;
  enforceOperatingHours?: boolean;
};

export type PaymentReminderResult = {
  ok: boolean;
  status: 'sent' | 'skipped' | 'failed';
  httpStatus: number;
  message: string;
  dedupeKey: string;
};

type ScheduledReminderTarget = {
  installmentId: string;
  examNumber: string;
  enrollmentId: string | null;
  courseName: string;
  unpaidAmount: number;
  dueDate: Date;
  scheduleKey: Extract<PaymentReminderScheduleKey, 'd-3' | 'd-1' | 'd-day'>;
};

type CronRunResult = {
  ok: boolean;
  status: 'sent' | 'skipped' | 'failed';
  sent: number;
  skipped: number;
  failed: number;
  processed: number;
  results: PaymentReminderResult[];
  message: string;
};

type ReminderRenderContext = {
  studentName: string;
  courseName: string;
  unpaidAmount: string;
  dueDate: string;
};

type ReminderDeliveryResult = {
  status: 'sent' | 'failed';
  httpStatus: number;
  channel: NotificationChannel;
  failReason: string | null;
};

type ReminderLogPayload = {
  examNumber: string;
  message: string;
  dedupeKey: string;
  status: 'pending' | 'sent' | 'skipped' | 'failed';
  channel: NotificationChannel;
  failReason?: string | null;
  templateVariables?: Record<string, string> | null;
};

const TEXT = {
  examNumberRequired: '\uD559\uBC88\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694.',
  studentNotFound: '\uD559\uC0DD\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.',
  consentMissing: '\uC54C\uB9BC \uC218\uC2E0 \uB3D9\uC758\uAC00 \uC5C6\uC5B4 \uBC1C\uC1A1\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.',
  phoneMissing: '\uC5F0\uB77D\uCC98\uAC00 \uC5C6\uC5B4 \uBC1C\uC1A1\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.',
  operatingHours: '\uC6B4\uC601\uC2DC\uAC04 \uC678\uC5D0\uB294 \uC790\uB3D9 \uB9AC\uB9C8\uC778\uB4DC\uB97C \uBC1C\uC1A1\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.',
  envMissing: 'Solapi \uC124\uC815\uC774 \uC5C6\uC5B4 \uBBF8\uB0A9 \uC548\uB0B4\uB97C \uBC1C\uC1A1\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.',
  sendFailed: '\uC2E4\uC81C \uBC1C\uC1A1 \uB85C\uADF8\uB97C \uD655\uC778\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC54C\uB9BC \uC124\uC815\uC744 \uD655\uC778\uD574 \uC8FC\uC138\uC694.',
  sent: '\uBBF8\uB0A9 \uC548\uB0B4\uB97C \uBC1C\uC1A1\uD588\uC2B5\uB2C8\uB2E4.',
  noTargets: '\uC624\uB298 \uBC1C\uC1A1\uD560 \uC790\uB3D9 \uB9AC\uB9C8\uC778\uB4DC \uB300\uC0C1\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.',
  cronDone: '\uACB0\uC81C \uB9AC\uB9C8\uC778\uB4DC \uC790\uB3D9 \uBC1C\uC1A1\uC744 \uCC98\uB9AC\uD588\uC2B5\uB2C8\uB2E4.',
} as const;

function getNotificationConfig() {
  const apiKey = process.env.SOLAPI_API_KEY?.trim();
  const apiSecret = process.env.SOLAPI_API_SECRET?.trim();
  const sender = process.env.SOLAPI_SENDER?.trim();
  const pfId = process.env.SOLAPI_PF_ID?.trim() || null;

  if (!apiKey || !apiSecret || !sender) {
    return null;
  }

  return {
    apiKey,
    apiSecret,
    sender,
    pfId,
  };
}

function toKstDate(date: Date) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    ymd: `${get('year')}-${get('month')}-${get('day')}`,
  };
}

function getKstWeekday(date: Date) {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', weekday: 'short' }).format(date);
}

function minutesOf(time: string) {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

export async function isWithinPaymentReminderHours(now = new Date()) {
  const config = await getSystemConfig();
  const kst = toKstDate(now);
  const weekday = getKstWeekday(now);
  const isWeekend = weekday === 'Sat' || weekday === 'Sun';
  const open = minutesOf(isWeekend ? config.weekendOpen : config.weekdayOpen);
  const close = minutesOf(isWeekend ? config.weekendClose : config.weekdayClose);
  const current = kst.hour * 60 + kst.minute;
  return current >= open && current <= close;
}

function normalizeDueDate(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

function formatDueDateLabel(value: Date | string | null | undefined) {
  const dueDate = normalizeDueDate(value);
  if (!dueDate) return '';
  const kst = toKstDate(dueDate);
  return `${kst.year}.${String(kst.month).padStart(2, '0')}.${String(kst.day).padStart(2, '0')}`;
}

function buildReminderRenderInput(input: ReminderRenderContext): NotificationMessageInput {
  return {
    type: NotificationType.PAYMENT_OVERDUE,
    studentName: input.studentName,
    courseName: input.courseName,
    unpaidAmount: input.unpaidAmount,
    dueDate: input.dueDate,
  };
}

function buildReminderFallbackMessage(input: ReminderRenderContext) {
  return `\uD55C\uAD6D\uACBD\uCC30\uD559\uC6D0 ${input.studentName}\uB2D8 ${input.courseName} \uBBF8\uB0A9 \uAE08\uC561\uC740 ${input.unpaidAmount}\uC774\uBA70 \uB0A9\uBD80 \uAE30\uD55C\uC740 ${input.dueDate || '-'}\uC785\uB2C8\uB2E4.`;
}

async function resolveReminderMessage(input: ReminderRenderContext) {
  const renderInput = buildReminderRenderInput(input);
  const template = await getResolvedNotificationTemplate(NotificationType.PAYMENT_OVERDUE);
  const message = renderNotificationTemplateContent(
    template.content,
    buildNotificationVariables(renderInput),
  );

  return {
    message,
    templateId: template.solapiTemplateId,
    templateVariables: buildNotificationVariables(renderInput, message),
  };
}

async function upsertReminderLog(input: ReminderLogPayload) {
  const prisma = getPrisma();
  const sentAt = new Date();

  return prisma.notificationLog.upsert({
    where: { dedupeKey: input.dedupeKey },
    create: {
      examNumber: input.examNumber,
      type: NotificationType.PAYMENT_OVERDUE,
      channel: input.channel,
      message: input.message,
      status: input.status,
      failReason: input.failReason ?? null,
      templateVariables: input.templateVariables ?? Prisma.DbNull,
      dedupeKey: input.dedupeKey,
      sentAt,
    },
    update: {
      channel: input.channel,
      message: input.message,
      status: input.status,
      failReason: input.failReason ?? null,
      templateVariables: input.templateVariables ?? Prisma.DbNull,
      sentAt,
    },
  });
}

async function createAuditLog(input: {
  adminId?: string | null;
  ipAddress?: string | null;
  examNumber: string;
  enrollmentId?: string | null;
  installmentId?: string | null;
  courseName?: string | null;
  unpaidAmount?: number | null;
  dueDate?: string | null;
  scheduleKey: PaymentReminderScheduleKey;
  notificationConsent: boolean;
  dedupeKey: string;
  result: PaymentReminderResult;
  channel?: NotificationChannel | null;
  failReason?: string | null;
}) {
  if (!input.adminId) {
    return;
  }

  try {
    await getPrisma().auditLog.create({
      data: {
        adminId: input.adminId,
        action: 'SEND_PAYMENT_REMINDER',
        targetType: 'student',
        targetId: input.examNumber,
        after: {
          examNumber: input.examNumber,
          enrollmentId: input.enrollmentId ?? null,
          installmentId: input.installmentId ?? null,
          courseName: input.courseName ?? null,
          unpaidAmount: Number(input.unpaidAmount ?? 0),
          dueDate: input.dueDate ?? null,
          scheduleKey: input.scheduleKey,
          notificationConsent: input.notificationConsent,
          status: input.result.status,
          channel: input.channel ?? null,
          failReason: input.failReason ?? null,
          dedupeKey: input.dedupeKey,
        },
        ipAddress: input.ipAddress ?? null,
      },
    });
  } catch {
    // audit failure should not block reminder flow
  }
}

function buildResultFromExistingLog(log: {
  status: string;
  failReason: string | null;
  dedupeKey: string | null;
}): PaymentReminderResult | null {
  if (log.status === 'sent') {
    return {
      ok: true,
      status: 'sent',
      httpStatus: 200,
      message: TEXT.sent,
      dedupeKey: log.dedupeKey ?? '',
    };
  }

  if (log.status === 'skipped') {
    return {
      ok: false,
      status: 'skipped',
      httpStatus: 409,
      message: log.failReason ?? TEXT.phoneMissing,
      dedupeKey: log.dedupeKey ?? '',
    };
  }

  return null;
}

async function deliverReminderMessage(input: {
  phone: string;
  message: string;
  templateId: string | null;
  templateVariables: Record<string, string>;
}): Promise<ReminderDeliveryResult> {
  const config = getNotificationConfig();
  if (!config) {
    return {
      status: 'failed',
      httpStatus: 503,
      channel: NotificationChannel.ALIMTALK,
      failReason: TEXT.envMissing,
    };
  }

  const client = new SolapiMessageService(config.apiKey, config.apiSecret);

  if (config.pfId && input.templateId) {
    try {
      await client.sendOne({
        to: input.phone,
        from: config.sender,
        text: input.message,
        kakaoOptions: {
          pfId: config.pfId,
          templateId: input.templateId,
          variables: input.templateVariables,
          disableSms: true,
        },
      });

      return {
        status: 'sent',
        httpStatus: 200,
        channel: NotificationChannel.ALIMTALK,
        failReason: null,
      };
    } catch (error) {
      const fallbackReason =
        error instanceof Error
          ? `\uC54C\uB9BC\uD1A1 \uBC1C\uC1A1 \uC2E4\uD328 \uD6C4 SMS\uB85C \uC7AC\uC2DC\uB3C4: ${error.message}`
          : '\uC54C\uB9BC\uD1A1 \uBC1C\uC1A1 \uC2E4\uD328 \uD6C4 SMS\uB85C \uC7AC\uC2DC\uB3C4';

      try {
        await client.sendOne({
          to: input.phone,
          from: config.sender,
          text: input.message,
          type: 'SMS',
        });

        return {
          status: 'sent',
          httpStatus: 200,
          channel: NotificationChannel.SMS,
          failReason: fallbackReason,
        };
      } catch (fallbackError) {
        return {
          status: 'failed',
          httpStatus: 502,
          channel: NotificationChannel.ALIMTALK,
          failReason:
            fallbackError instanceof Error
              ? `${fallbackReason} / SMS \uC2E4\uD328: ${fallbackError.message}`
              : `${fallbackReason} / SMS \uC2E4\uD328`,
        };
      }
    }
  }

  try {
    await client.sendOne({
      to: input.phone,
      from: config.sender,
      text: input.message,
      type: 'SMS',
    });

    return {
      status: 'sent',
      httpStatus: 200,
      channel: NotificationChannel.SMS,
      failReason: null,
    };
  } catch (error) {
    return {
      status: 'failed',
      httpStatus: 502,
      channel: NotificationChannel.SMS,
      failReason: error instanceof Error ? error.message : TEXT.sendFailed,
    };
  }
}

export function buildPaymentReminderDedupeKey(input: {
  examNumber: string;
  enrollmentId?: string | null;
  installmentId?: string | null;
  scheduleKey: PaymentReminderScheduleKey;
  dueDate?: Date | string | null;
}) {
  const target = input.installmentId
    ? `installment:${input.installmentId}`
    : input.enrollmentId
      ? `enrollment:${input.enrollmentId}`
      : `student:${input.examNumber}`;
  const dueDateKey = formatDueDateLabel(input.dueDate).replace(/\./g, '-');
  return `payment-overdue:${target}:${input.scheduleKey}:${dueDateKey || 'no-due-date'}`;
}

export async function sendPaymentReminderNotification(input: PaymentReminderInput): Promise<PaymentReminderResult> {
  const prisma = getPrisma();
  const examNumber = input.examNumber.trim();
  const dedupeKey = buildPaymentReminderDedupeKey(input);

  if (!examNumber) {
    return { ok: false, status: 'failed', httpStatus: 400, message: TEXT.examNumberRequired, dedupeKey };
  }

  const existingLog = await prisma.notificationLog.findUnique({
    where: { dedupeKey },
    select: { status: true, failReason: true, dedupeKey: true },
  });
  const existingResult = existingLog ? buildResultFromExistingLog(existingLog) : null;
  if (existingResult) {
    return existingResult;
  }

  const student = await prisma.student.findUnique({
    where: { examNumber },
    select: { examNumber: true, name: true, phone: true, notificationConsent: true },
  });

  if (!student) {
    return { ok: false, status: 'failed', httpStatus: 404, message: TEXT.studentNotFound, dedupeKey };
  }

  const renderContext: ReminderRenderContext = {
    studentName: student.name,
    courseName: input.courseName?.trim() || '\uC218\uAC15\uB8CC',
    unpaidAmount: `${Math.max(0, Number(input.unpaidAmount ?? 0)).toLocaleString('ko-KR')}\uC6D0`,
    dueDate: formatDueDateLabel(input.dueDate),
  };

  let message = buildReminderFallbackMessage(renderContext);
  let templateId: string | null = null;
  let templateVariables: Record<string, string> = buildNotificationVariables(
    buildReminderRenderInput(renderContext),
    message,
  );

  try {
    const resolved = await resolveReminderMessage(renderContext);
    message = resolved.message;
    templateId = resolved.templateId;
    templateVariables = resolved.templateVariables;
  } catch (error) {
    const failReason =
      error instanceof Error
        ? `\uBBF8\uB0A9 \uC548\uB0B4 \uD15C\uD50C\uB9BF \uC900\uBE44 \uC2E4\uD328: ${error.message}`
        : '\uBBF8\uB0A9 \uC548\uB0B4 \uD15C\uD50C\uB9BF \uC900\uBE44\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.';

    await upsertReminderLog({
      examNumber,
      message,
      dedupeKey,
      status: 'failed',
      channel: NotificationChannel.ALIMTALK,
      failReason,
      templateVariables,
    });

    const result: PaymentReminderResult = {
      ok: false,
      status: 'failed',
      httpStatus: 500,
      message: failReason,
      dedupeKey,
    };

    await createAuditLog({
      adminId: input.adminId,
      ipAddress: input.ipAddress,
      examNumber,
      enrollmentId: input.enrollmentId,
      installmentId: input.installmentId,
      courseName: renderContext.courseName,
      unpaidAmount: input.unpaidAmount,
      dueDate: renderContext.dueDate,
      scheduleKey: input.scheduleKey,
      notificationConsent: student.notificationConsent,
      dedupeKey,
      result,
      channel: NotificationChannel.ALIMTALK,
      failReason,
    });

    return result;
  }

  if (input.enforceOperatingHours && !(await isWithinPaymentReminderHours())) {
    await upsertReminderLog({
      examNumber,
      message,
      dedupeKey,
      status: 'skipped',
      channel: NotificationChannel.ALIMTALK,
      failReason: TEXT.operatingHours,
      templateVariables,
    });

    const result: PaymentReminderResult = {
      ok: false,
      status: 'skipped',
      httpStatus: 409,
      message: TEXT.operatingHours,
      dedupeKey,
    };

    await createAuditLog({
      adminId: input.adminId,
      ipAddress: input.ipAddress,
      examNumber,
      enrollmentId: input.enrollmentId,
      installmentId: input.installmentId,
      courseName: renderContext.courseName,
      unpaidAmount: input.unpaidAmount,
      dueDate: renderContext.dueDate,
      scheduleKey: input.scheduleKey,
      notificationConsent: student.notificationConsent,
      dedupeKey,
      result,
      channel: NotificationChannel.ALIMTALK,
      failReason: TEXT.operatingHours,
    });

    return result;
  }

  if (!student.notificationConsent) {
    await upsertReminderLog({
      examNumber,
      message,
      dedupeKey,
      status: 'skipped',
      channel: NotificationChannel.ALIMTALK,
      failReason: TEXT.consentMissing,
      templateVariables,
    });

    const result: PaymentReminderResult = {
      ok: false,
      status: 'skipped',
      httpStatus: 409,
      message: TEXT.consentMissing,
      dedupeKey,
    };

    await createAuditLog({
      adminId: input.adminId,
      ipAddress: input.ipAddress,
      examNumber,
      enrollmentId: input.enrollmentId,
      installmentId: input.installmentId,
      courseName: renderContext.courseName,
      unpaidAmount: input.unpaidAmount,
      dueDate: renderContext.dueDate,
      scheduleKey: input.scheduleKey,
      notificationConsent: student.notificationConsent,
      dedupeKey,
      result,
      channel: NotificationChannel.ALIMTALK,
      failReason: TEXT.consentMissing,
    });

    return result;
  }

  const normalizedPhone = normalizePhone(student.phone ?? '');
  if (!normalizedPhone) {
    await upsertReminderLog({
      examNumber,
      message,
      dedupeKey,
      status: 'skipped',
      channel: NotificationChannel.SMS,
      failReason: TEXT.phoneMissing,
      templateVariables,
    });

    const result: PaymentReminderResult = {
      ok: false,
      status: 'skipped',
      httpStatus: 409,
      message: TEXT.phoneMissing,
      dedupeKey,
    };

    await createAuditLog({
      adminId: input.adminId,
      ipAddress: input.ipAddress,
      examNumber,
      enrollmentId: input.enrollmentId,
      installmentId: input.installmentId,
      courseName: renderContext.courseName,
      unpaidAmount: input.unpaidAmount,
      dueDate: renderContext.dueDate,
      scheduleKey: input.scheduleKey,
      notificationConsent: student.notificationConsent,
      dedupeKey,
      result,
      channel: NotificationChannel.SMS,
      failReason: TEXT.phoneMissing,
    });

    return result;
  }

  await upsertReminderLog({
    examNumber,
    message,
    dedupeKey,
    status: 'pending',
    channel: NotificationChannel.ALIMTALK,
    templateVariables,
  });

  const delivery = await deliverReminderMessage({
    phone: normalizedPhone,
    message,
    templateId,
    templateVariables,
  });

  await upsertReminderLog({
    examNumber,
    message,
    dedupeKey,
    status: delivery.status,
    channel: delivery.channel,
    failReason: delivery.failReason,
    templateVariables,
  });

  const result: PaymentReminderResult =
    delivery.status === 'sent'
      ? {
          ok: true,
          status: 'sent',
          httpStatus: 200,
          message: TEXT.sent,
          dedupeKey,
        }
      : {
          ok: false,
          status: 'failed',
          httpStatus: delivery.httpStatus,
          message: delivery.failReason ?? TEXT.sendFailed,
          dedupeKey,
        };

  await createAuditLog({
    adminId: input.adminId,
    ipAddress: input.ipAddress,
    examNumber,
    enrollmentId: input.enrollmentId,
    installmentId: input.installmentId,
    courseName: renderContext.courseName,
    unpaidAmount: input.unpaidAmount,
    dueDate: renderContext.dueDate,
    scheduleKey: input.scheduleKey,
    notificationConsent: student.notificationConsent,
    dedupeKey,
    result,
    channel: delivery.channel,
    failReason: delivery.failReason,
  });

  return result;
}

export async function listScheduledPaymentReminderTargets(now = new Date()): Promise<ScheduledReminderTarget[]> {
  const prisma = getPrisma();
  const kstToday = toKstDate(now);
  const rangeStart = new Date(Date.UTC(kstToday.year, kstToday.month - 1, kstToday.day - 1, 0, 0, 0));
  const rangeEnd = new Date(Date.UTC(kstToday.year, kstToday.month - 1, kstToday.day + 4, 23, 59, 59));

  const installments = await prisma.installment.findMany({
    where: {
      paidAt: null,
      dueDate: { gte: rangeStart, lte: rangeEnd },
      payment: {
        examNumber: { not: null },
      },
    },
    orderBy: [{ dueDate: 'asc' }, { seq: 'asc' }],
    include: {
      payment: {
        select: {
          examNumber: true,
          enrollmentId: true,
          items: { select: { itemName: true }, take: 1 },
        },
      },
    },
  });

  const targets: ScheduledReminderTarget[] = [];

  for (const installment of installments) {
    const dueKst = toKstDate(installment.dueDate);
    const dueUtc = Date.UTC(dueKst.year, dueKst.month - 1, dueKst.day, 0, 0, 0);
    const todayUtc = Date.UTC(kstToday.year, kstToday.month - 1, kstToday.day, 0, 0, 0);
    const diffDays = Math.round((dueUtc - todayUtc) / (1000 * 60 * 60 * 24));

    const scheduleKey = diffDays === 3 ? 'd-3' : diffDays === 1 ? 'd-1' : diffDays === 0 ? 'd-day' : null;
    if (!scheduleKey || !installment.payment.examNumber) continue;

    targets.push({
      installmentId: installment.id,
      examNumber: installment.payment.examNumber,
      enrollmentId: installment.payment.enrollmentId,
      courseName: installment.payment.items[0]?.itemName ?? '\uC218\uAC15\uB8CC',
      unpaidAmount: installment.amount,
      dueDate: installment.dueDate,
      scheduleKey,
    });
  }

  return targets;
}

export async function runPaymentReminderNotifications(now = new Date()): Promise<CronRunResult> {
  if (!(await isWithinPaymentReminderHours(now))) {
    return {
      ok: true,
      status: 'skipped',
      sent: 0,
      skipped: 0,
      failed: 0,
      processed: 0,
      results: [],
      message: TEXT.operatingHours,
    };
  }

  const targets = await listScheduledPaymentReminderTargets(now);
  if (targets.length === 0) {
    return {
      ok: true,
      status: 'skipped',
      sent: 0,
      skipped: 0,
      failed: 0,
      processed: 0,
      results: [],
      message: TEXT.noTargets,
    };
  }

  const results: PaymentReminderResult[] = [];
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const target of targets) {
    const result = await sendPaymentReminderNotification({
      examNumber: target.examNumber,
      enrollmentId: target.enrollmentId,
      installmentId: target.installmentId,
      unpaidAmount: target.unpaidAmount,
      courseName: target.courseName,
      dueDate: target.dueDate,
      scheduleKey: target.scheduleKey,
      enforceOperatingHours: false,
    });
    results.push(result);
    if (result.status === 'sent') sent += 1;
    else if (result.status === 'skipped') skipped += 1;
    else failed += 1;
  }

  return {
    ok: failed === 0,
    status: failed > 0 ? 'failed' : sent > 0 ? 'sent' : 'skipped',
    sent,
    skipped,
    failed,
    processed: targets.length,
    results,
    message: TEXT.cronDone,
  };
}

