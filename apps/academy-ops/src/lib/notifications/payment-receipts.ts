import { NotificationChannel, NotificationType, PaymentMethod } from "@prisma/client";
import {
  DEFAULT_CONTACT_FALLBACK,
  DEFAULT_SYSTEM_NAME,
} from "@/lib/academy-branding";
import { toAuditJson } from "@/lib/audit";
import { getAcademySettingsByAcademyId } from "@/lib/academy-settings";
import { sendResendEmail, hasResendEmailConfig } from "@/lib/email/resend";
import { normalizeEmail } from "@/lib/email/utils";
import { PAYMENT_METHOD_LABEL } from "@/lib/constants";
import { normalizePhone } from "@/lib/excel/workbook";
import { sendQueuedNotifications } from "@/lib/notifications/service";
import { buildNotificationVariables } from "@/lib/notifications/templates";
import { getPrisma } from "@/lib/prisma";

const CHANNEL_LABEL: Record<NotificationChannel | "EMAIL", string> = {
  ALIMTALK: "알림톡",
  SMS: "SMS",
  WEB_PUSH: "웹 푸시",
  EMAIL: "이메일",
};

type DeliveryStatus = "sent" | "failed" | "skipped";
type DeliveryChannelCode = NotificationChannel | "EMAIL";

type DeliverySummary = {
  code: DeliveryChannelCode;
  label: string;
  status: DeliveryStatus;
  reason: string | null;
  logId?: number | null;
  externalId?: string | null;
  address?: string | null;
};

function formatDateTime(value: Date) {
  const yyyy = value.getFullYear();
  const mm = String(value.getMonth() + 1).padStart(2, "0");
  const dd = String(value.getDate()).padStart(2, "0");
  const hh = String(value.getHours()).padStart(2, "0");
  const mi = String(value.getMinutes()).padStart(2, "0");
  return `${yyyy}.${mm}.${dd} ${hh}:${mi}`;
}

function formatAmount(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

function resolveReceiptBaseUrl() {
  const candidates = [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_BASE_URL,
  ];

  for (const candidate of candidates) {
    const trimmed = candidate?.trim().replace(/\/$/, "");
    if (trimmed) {
      return trimmed;
    }
  }

  return null;
}

function courseNameOf(item: {
  cohort?: { name: string } | null;
  product?: { name: string } | null;
  specialLecture?: { name: string } | null;
}) {
  return item.cohort?.name ?? item.product?.name ?? item.specialLecture?.name ?? null;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildReceiptMessage(input: {
  academyName: string;
  academyPhone: string;
  studentName: string;
  paymentAmount: number;
  paymentMethod: PaymentMethod;
  processedAt: Date;
  courseName: string | null;
  receiptUrl: string | null;
}) {
  const lines = [
    `[${input.academyName}] ${input.studentName}님, 요청하신 수납 영수증을 다시 안내드립니다.`,
    "",
    `납부금액: ${formatAmount(input.paymentAmount)}`,
    `결제수단: ${PAYMENT_METHOD_LABEL[input.paymentMethod] ?? input.paymentMethod}`,
    `처리일시: ${formatDateTime(input.processedAt)}`,
    input.courseName ? `연결 수강: ${input.courseName}` : null,
    input.receiptUrl
      ? `영수증 확인: ${input.receiptUrl}`
      : "학생 포털 로그인 후 [수납 영수증] 메뉴에서 확인해 주세요.",
    "",
    `문의: ${input.academyPhone}`,
  ].filter((line): line is string => Boolean(line));

  return lines.join("\n");
}

function buildReceiptEmailSubject(academyName: string, studentName: string) {
  return `[${academyName}] ${studentName}님 영수증 재발송 안내`;
}

function buildReceiptEmailHtml(input: {
  academyName: string;
  academyPhone: string;
  studentName: string;
  paymentAmount: number;
  paymentMethod: PaymentMethod;
  processedAt: Date;
  courseName: string | null;
  receiptUrl: string | null;
}) {
  const title = escapeHtml(buildReceiptEmailSubject(input.academyName, input.studentName));
  const courseName = input.courseName ? escapeHtml(input.courseName) : null;
  const receiptUrl = input.receiptUrl ? escapeHtml(input.receiptUrl) : null;

  return `
    <div style="background:#f7f4ef;padding:32px 16px;font-family:'Apple SD Gothic Neo','Noto Sans KR','Malgun Gothic',sans-serif;color:#111827;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid rgba(17,24,39,0.08);border-radius:24px;padding:32px;">
        <div style="display:inline-flex;border-radius:999px;background:#c55a1115;color:#c55a11;font-size:11px;font-weight:700;letter-spacing:0.24em;padding:6px 12px;text-transform:uppercase;">Receipt</div>
        <h1 style="margin:18px 0 10px;font-size:28px;line-height:1.3;">${title}</h1>
        <p style="margin:0 0 18px;font-size:15px;line-height:1.8;">${escapeHtml(input.studentName)}님, 요청하신 수납 영수증을 다시 보내드립니다.</p>
        <div style="border:1px solid rgba(17,24,39,0.08);border-radius:20px;padding:20px;background:#f7f4ef;">
          <p style="margin:0 0 8px;font-size:14px;"><strong>납부금액</strong> ${escapeHtml(formatAmount(input.paymentAmount))}</p>
          <p style="margin:0 0 8px;font-size:14px;"><strong>결제수단</strong> ${escapeHtml(PAYMENT_METHOD_LABEL[input.paymentMethod] ?? input.paymentMethod)}</p>
          <p style="margin:0 0 8px;font-size:14px;"><strong>처리일시</strong> ${escapeHtml(formatDateTime(input.processedAt))}</p>
          ${courseName ? `<p style="margin:0;font-size:14px;"><strong>연결 수강</strong> ${courseName}</p>` : ""}
        </div>
        ${receiptUrl ? `<p style="margin:24px 0 0;"><a href="${receiptUrl}" style="display:inline-flex;border-radius:999px;background:#1f4d3a;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 18px;">영수증 바로 보기</a></p>` : ""}
        <p style="margin:24px 0 0;font-size:13px;line-height:1.8;color:#4b5563;">문의: ${escapeHtml(input.academyPhone)}</p>
      </div>
    </div>
  `.trim();
}

async function sendReceiptMessageNotification(input: {
  paymentId: string;
  examNumber: string;
  studentName: string;
  phone: string | null;
  notificationConsent: boolean;
  message: string;
  adminId: string;
  ipAddress?: string | null;
}) : Promise<DeliverySummary> {
  if (!input.notificationConsent) {
    return {
      code: "ALIMTALK",
      label: CHANNEL_LABEL.ALIMTALK,
      status: "skipped",
      reason: "알림 수신 동의가 없어 메시지를 보낼 수 없습니다.",
    };
  }

  if (!normalizePhone(input.phone ?? "")) {
    return {
      code: "ALIMTALK",
      label: CHANNEL_LABEL.ALIMTALK,
      status: "skipped",
      reason: "학생 연락처가 없어 메시지를 보낼 수 없습니다.",
    };
  }

  const prisma = getPrisma();
  const log = await prisma.notificationLog.create({
    data: {
      examNumber: input.examNumber,
      type: NotificationType.NOTICE,
      channel: NotificationChannel.ALIMTALK,
      message: input.message,
      status: "pending",
      dedupeKey: `payment_receipt:${input.paymentId}:${Date.now()}`,
      templateVariables: buildNotificationVariables(
        {
          type: NotificationType.NOTICE,
          studentName: input.studentName,
          customMessage: input.message,
        },
        input.message,
      ),
    },
  });

  try {
    const result = await sendQueuedNotifications({
      adminId: input.adminId,
      logIds: [log.id],
      ipAddress: input.ipAddress,
    });

    const deliveredLog = result.logs[0] ?? log;
    return {
      code: deliveredLog.channel,
      label: CHANNEL_LABEL[deliveredLog.channel],
      status: deliveredLog.status === "sent" ? "sent" : deliveredLog.status === "failed" ? "failed" : "skipped",
      reason: deliveredLog.failReason ?? null,
      logId: deliveredLog.id,
    };
  } catch (error) {
    const failReason = error instanceof Error ? error.message : "영수증 알림 재발송에 실패했습니다.";
    await prisma.notificationLog
      .update({
        where: { id: log.id },
        data: {
          status: "failed",
          failReason,
        },
      })
      .catch(() => undefined);

    return {
      code: NotificationChannel.ALIMTALK,
      label: CHANNEL_LABEL.ALIMTALK,
      status: "failed",
      reason: failReason,
      logId: log.id,
    };
  }
}

async function sendReceiptEmail(input: {
  paymentId: string;
  email: string | null;
  academyName: string;
  academyPhone: string;
  studentName: string;
  paymentAmount: number;
  paymentMethod: PaymentMethod;
  processedAt: Date;
  courseName: string | null;
  receiptUrl: string | null;
}): Promise<DeliverySummary> {
  const email = normalizeEmail(input.email);
  if (!email) {
    return {
      code: "EMAIL",
      label: CHANNEL_LABEL.EMAIL,
      status: "skipped",
      reason: "학생 이메일이 없어 메일을 보낼 수 없습니다.",
    };
  }

  if (!hasResendEmailConfig()) {
    return {
      code: "EMAIL",
      label: CHANNEL_LABEL.EMAIL,
      status: "skipped",
      reason: "영수증 이메일 발송 설정이 아직 완료되지 않았습니다.",
      address: email,
    };
  }

  try {
    const result = await sendResendEmail({
      to: email,
      subject: buildReceiptEmailSubject(input.academyName, input.studentName),
      html: buildReceiptEmailHtml({
        academyName: input.academyName,
        academyPhone: input.academyPhone,
        studentName: input.studentName,
        paymentAmount: input.paymentAmount,
        paymentMethod: input.paymentMethod,
        processedAt: input.processedAt,
        courseName: input.courseName,
        receiptUrl: input.receiptUrl,
      }),
      text: buildReceiptMessage({
        academyName: input.academyName,
        academyPhone: input.academyPhone,
        studentName: input.studentName,
        paymentAmount: input.paymentAmount,
        paymentMethod: input.paymentMethod,
        processedAt: input.processedAt,
        courseName: input.courseName,
        receiptUrl: input.receiptUrl,
      }),
      idempotencyKey: `payment-receipt-email:${input.paymentId}`,
      tags: [
        { name: "feature", value: "payment-receipt" },
        { name: "paymentId", value: input.paymentId },
      ],
    });

    return {
      code: "EMAIL",
      label: CHANNEL_LABEL.EMAIL,
      status: "sent",
      reason: null,
      externalId: result.id,
      address: email,
    };
  } catch (error) {
    return {
      code: "EMAIL",
      label: CHANNEL_LABEL.EMAIL,
      status: "failed",
      reason: error instanceof Error ? error.message : "영수증 이메일 발송에 실패했습니다.",
      address: email,
    };
  }
}

function buildFailureMessage(deliveries: DeliverySummary[]) {
  const relevant = deliveries.filter((delivery) => delivery.status !== "sent");
  if (relevant.length === 0) {
    return "영수증 재발송에 실패했습니다.";
  }

  return relevant
    .map((delivery) => `${delivery.label}: ${delivery.reason ?? (delivery.status === "skipped" ? "발송 제외" : "발송 실패")}`)
    .join(" / ");
}

export async function resendPaymentReceiptNotification(input: {
  paymentId: string;
  academyId: number | null;
  adminId: string;
  ipAddress?: string | null;
}) {
  const prisma = getPrisma();
  const payment =
    input.academyId === null
      ? await prisma.payment.findUnique({
          where: { id: input.paymentId },
          select: {
            id: true,
            academyId: true,
            examNumber: true,
            enrollmentId: true,
            method: true,
            netAmount: true,
            processedAt: true,
            student: {
              select: {
                name: true,
                phone: true,
                email: true,
                notificationConsent: true,
              },
            },
          },
        })
      : await prisma.payment.findFirst({
          where: { id: input.paymentId, academyId: input.academyId },
          select: {
            id: true,
            academyId: true,
            examNumber: true,
            enrollmentId: true,
            method: true,
            netAmount: true,
            processedAt: true,
            student: {
              select: {
                name: true,
                phone: true,
                email: true,
                notificationConsent: true,
              },
            },
          },
        });

  if (!payment) {
    throw new Error("결제 내역을 찾을 수 없습니다.");
  }

  if (!payment.examNumber || !payment.student) {
    throw new Error("학생 결제만 영수증을 재발송할 수 있습니다.");
  }

  const academySettings = await getAcademySettingsByAcademyId(
    payment.academyId ?? input.academyId,
  );
  const enrollment = payment.enrollmentId
    ? await prisma.courseEnrollment.findUnique({
        where: { id: payment.enrollmentId },
        select: {
          cohort: { select: { name: true } },
          product: { select: { name: true } },
          specialLecture: { select: { name: true } },
        },
      })
    : null;

  const academyName = academySettings?.name?.trim() || DEFAULT_SYSTEM_NAME;
  const academyPhone = academySettings?.phone?.trim() || DEFAULT_CONTACT_FALLBACK;
  const receiptNo = payment.id.slice(-8).toUpperCase();
  const receiptBaseUrl = resolveReceiptBaseUrl();
  const receiptUrl = receiptBaseUrl ? `${receiptBaseUrl}/student/payments/${payment.id}` : null;
  const courseName = courseNameOf(enrollment ?? {});
  const message = buildReceiptMessage({
    academyName,
    academyPhone,
    studentName: payment.student.name,
    paymentAmount: payment.netAmount,
    paymentMethod: payment.method,
    processedAt: payment.processedAt,
    courseName,
    receiptUrl,
  });

  const messageDelivery = await sendReceiptMessageNotification({
    paymentId: payment.id,
    examNumber: payment.examNumber,
    studentName: payment.student.name,
    phone: payment.student.phone ?? null,
    notificationConsent: payment.student.notificationConsent,
    message,
    adminId: input.adminId,
    ipAddress: input.ipAddress,
  });

  const emailDelivery = await sendReceiptEmail({
    paymentId: payment.id,
    email: payment.student.email ?? null,
    academyName,
    academyPhone,
    studentName: payment.student.name,
    paymentAmount: payment.netAmount,
    paymentMethod: payment.method,
    processedAt: payment.processedAt,
    courseName,
    receiptUrl,
  });

  const deliveries = [messageDelivery, emailDelivery];
  const sent = deliveries.filter((delivery) => delivery.status === "sent");
  const failed = deliveries.filter((delivery) => delivery.status === "failed");
  const skipped = deliveries.filter((delivery) => delivery.status === "skipped");

  const summaryStatus: DeliveryStatus = sent.length > 0 ? "sent" : failed.length > 0 ? "failed" : "skipped";
  const summaryChannels = (sent.length > 0 ? sent : failed.length > 0 ? failed : skipped).map((delivery) => delivery.label);
  const summaryReasons = [...failed, ...skipped]
    .map((delivery) => (delivery.reason ? `${delivery.label}: ${delivery.reason}` : null))
    .filter((value): value is string => Boolean(value));

  await prisma.auditLog.create({
    data: {
      adminId: input.adminId,
      action: "RESEND_PAYMENT_RECEIPT",
      targetType: "payment",
      targetId: payment.id,
      before: toAuditJson(null),
      after: toAuditJson({
        receiptNo,
        deliveryStatus: summaryStatus,
        deliveryChannel: summaryChannels.join(", "),
        deliveryChannelLabel: summaryChannels.join(", "),
        failReason: summaryReasons.length > 0 ? summaryReasons.join(" / ") : null,
        receiptUrl,
        messageDelivery,
        emailDelivery,
      }),
      ipAddress: input.ipAddress ?? null,
    },
  });

  if (sent.length === 0) {
    throw new Error(buildFailureMessage(deliveries));
  }

  return {
    paymentId: payment.id,
    receiptNo,
    deliveries,
    messageDelivery,
    emailDelivery,
    sentCount: sent.length,
    failedCount: failed.length,
    skippedCount: skipped.length,
  };
}
