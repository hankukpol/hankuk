/**
 * P1-9: 이벤트 기반 알림톡 발송 유틸리티
 * 수강 등록 완료, 수납 완료, 환불 완료 시 학생에게 자동 발송.
 * 발송 실패는 로그에 기록되며 요청 응답에 영향을 주지 않는다.
 */
import { NotificationChannel, NotificationType } from "@prisma/client";
import { SolapiMessageService } from "solapi";
import { normalizePhone } from "@/lib/excel/workbook";
import { getPrisma } from "@/lib/prisma";
import { getResolvedNotificationTemplate } from "@/lib/notifications/template-service";
import {
  buildNotificationTemplateValues,
  renderNotificationTemplateContent,
  type NotificationMessageInput,
} from "@/lib/notifications/templates";

type EventNotifyInput = {
  examNumber: string;
  type: NotificationType;
  messageInput: Omit<NotificationMessageInput, "type">;
  dedupeKey?: string;
};

function getNotificationConfig() {
  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  const sender = process.env.SOLAPI_SENDER;
  const pfId = process.env.SOLAPI_PF_ID;
  if (!apiKey || !apiSecret || !sender) return null;
  return { apiKey, apiSecret, sender, pfId: pfId ?? null };
}

/**
 * 이벤트 알림을 비동기로 발송한다. 발송 실패는 콘솔 에러로만 기록하며
 * 호출자의 응답에 영향을 주지 않는다.
 */
export async function sendEventNotification(input: EventNotifyInput): Promise<void> {
  try {
    const config = getNotificationConfig();
    if (!config) return; // Solapi 미설정 시 무시

    const student = await getPrisma().student.findUnique({
      where: { examNumber: input.examNumber },
      select: { name: true, phone: true, notificationConsent: true },
    });

    if (!student || !student.notificationConsent) return;

    const normalizedPhone = normalizePhone(student.phone ?? "");
    if (!normalizedPhone) return;

    const fullInput: NotificationMessageInput = { type: input.type, ...input.messageInput };
    const values = buildNotificationTemplateValues(fullInput);

    const template = await getResolvedNotificationTemplate(input.type);
    const message = renderNotificationTemplateContent(template.content, values);

    const client = new SolapiMessageService(config.apiKey, config.apiSecret);

    let channel: NotificationChannel = NotificationChannel.SMS;
    let failReason: string | null = null;

    if (config.pfId && template.solapiTemplateId) {
      try {
        await client.sendOne({
          to: normalizedPhone,
          from: config.sender,
          text: message,
          kakaoOptions: {
            pfId: config.pfId,
            templateId: template.solapiTemplateId,
            variables: values as Record<string, string>,
            disableSms: true,
          },
        });
        channel = NotificationChannel.ALIMTALK;
      } catch (err) {
        failReason = err instanceof Error ? err.message : "알림톡 발송 실패";
        // SMS 폴백
        await client.sendOne({
          to: normalizedPhone,
          from: config.sender,
          text: message,
          type: "SMS",
        });
      }
    } else {
      await client.sendOne({
        to: normalizedPhone,
        from: config.sender,
        text: message,
        type: "SMS",
      });
    }

    await getPrisma().notificationLog.create({
      data: {
        examNumber: input.examNumber,
        type: input.type,
        channel,
        message,
        status: "sent",
        failReason,
        dedupeKey: input.dedupeKey ?? null,
      },
    });
  } catch (err) {
    console.error("[sendEventNotification] 발송 실패:", err);
  }
}
