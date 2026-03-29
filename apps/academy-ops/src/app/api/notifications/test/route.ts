import { AdminRole, NotificationChannel, NotificationType } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { normalizePhone } from "@/lib/excel/workbook";
import {
  getResolvedNotificationTemplate,
  renderNotificationMessageFromTemplate,
} from "@/lib/notifications/template-service";
import { SolapiMessageService } from "solapi";

type RequestBody = {
  templateType: NotificationType;
  recipientPhone?: string;
};

function getNotificationConfig() {
  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  const sender = process.env.SOLAPI_SENDER;
  const pfId = process.env.SOLAPI_PF_ID;

  if (!apiKey || !apiSecret || !sender) {
    return null;
  }

  return { apiKey, apiSecret, sender, pfId: pfId ?? null };
}

export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as RequestBody;
    const { templateType, recipientPhone } = body;

    if (!templateType || !Object.values(NotificationType).includes(templateType)) {
      return NextResponse.json(
        { error: "유효한 알림 유형을 지정해 주세요." },
        { status: 400 },
      );
    }

    // Determine recipient phone: explicit override → admin's own phone
    const adminPhone = auth.context.adminUser.phone ?? null;
    const rawPhone = recipientPhone?.trim() || adminPhone;

    if (!rawPhone) {
      return NextResponse.json(
        {
          error:
            "발송할 전화번호가 없습니다. 관리자 계정에 전화번호를 등록하거나 recipientPhone을 직접 지정해 주세요.",
        },
        { status: 400 },
      );
    }

    const normalizedPhone = normalizePhone(rawPhone);

    if (!normalizedPhone) {
      return NextResponse.json(
        { error: `전화번호 형식이 올바르지 않습니다: ${rawPhone}` },
        { status: 400 },
      );
    }

    const config = getNotificationConfig();

    if (!config) {
      // Solapi not configured — return mock success so admins can still verify
      // the template renders correctly without a live send.
      const template = await getResolvedNotificationTemplate(templateType);
      const rendered = renderNotificationMessageFromTemplate(template, {
        type: templateType,
        studentName: auth.context.adminUser.name,
      });

      return NextResponse.json({
        success: true,
        simulated: true,
        sentTo: normalizedPhone,
        channel: NotificationChannel.SMS,
        message: rendered.message,
        note: "Solapi 환경 변수가 설정되지 않아 실제 발송 없이 메시지 미리보기만 반환했습니다.",
      });
    }

    const template = await getResolvedNotificationTemplate(templateType);
    const rendered = renderNotificationMessageFromTemplate(template, {
      type: templateType,
      studentName: auth.context.adminUser.name,
    });

    const client = new SolapiMessageService(config.apiKey, config.apiSecret);

    let channel: NotificationChannel = NotificationChannel.SMS;
    let failReason: string | null = null;

    if (config.pfId && template.solapiTemplateId) {
      try {
        await client.sendOne({
          to: normalizedPhone,
          from: config.sender,
          text: rendered.message,
          kakaoOptions: {
            pfId: config.pfId,
            templateId: template.solapiTemplateId,
            variables: { studentName: auth.context.adminUser.name },
            disableSms: true,
          },
        });
        channel = NotificationChannel.ALIMTALK;
      } catch (err) {
        failReason = err instanceof Error ? err.message : "알림톡 발송 실패";
        // SMS fallback
        await client.sendOne({
          to: normalizedPhone,
          from: config.sender,
          text: rendered.message,
          type: "SMS",
        });
      }
    } else {
      await client.sendOne({
        to: normalizedPhone,
        from: config.sender,
        text: rendered.message,
        type: "SMS",
      });
    }

    return NextResponse.json({
      success: true,
      simulated: false,
      sentTo: normalizedPhone,
      channel,
      message: rendered.message,
      ...(failReason ? { note: `알림톡 실패 후 SMS로 발송: ${failReason}` } : {}),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "테스트 발송에 실패했습니다." },
      { status: 400 },
    );
  }
}
