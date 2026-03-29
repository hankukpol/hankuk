import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";
import { getSystemConfig } from "@/lib/system-config";

// Keys stored in SystemConfig.data JSON
const SMS_KEYS = [
  "kakaoChannelId",
  "kakaoSenderId",
  "smsApiKey",
  "smsApiSecret",
  "smsSenderId",
] as const;

type SmsKey = (typeof SMS_KEYS)[number];

function maskSecret(val: string): string {
  if (!val) return "";
  if (val.length <= 8) return "*".repeat(val.length);
  return val.slice(0, 4) + "*".repeat(val.length - 8) + val.slice(-4);
}

// GET: return current SMS/Kakao config (secrets masked)
export async function GET(_request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.DIRECTOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const config = await getSystemConfig();

  return NextResponse.json({
    data: {
      kakaoChannelId: config.kakaoChannelId ?? "",
      kakaoSenderId: maskSecret(config.kakaoSenderId ?? ""),
      smsApiKey: maskSecret(config.smsApiKey ?? ""),
      smsApiSecret: maskSecret(config.smsApiSecret ?? ""),
      smsSenderId: config.smsSenderId ?? "",
    },
  });
}

// PATCH: upsert each key in SystemConfig.data
export async function PATCH(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.DIRECTOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 본문이 올바르지 않습니다." }, { status: 400 });
  }

  if (!Array.isArray(body)) {
    return NextResponse.json(
      { error: "요청 형식이 올바르지 않습니다. { key, value }[] 배열이어야 합니다." },
      { status: 400 },
    );
  }

  const updates = body as { key: string; value: string }[];

  // Validate keys
  const allowedKeys = new Set<string>(SMS_KEYS);
  for (const item of updates) {
    if (typeof item.key !== "string" || typeof item.value !== "string") {
      return NextResponse.json({ error: "각 항목은 { key: string, value: string } 형식이어야 합니다." }, { status: 400 });
    }
    if (!allowedKeys.has(item.key)) {
      return NextResponse.json({ error: `허용되지 않는 키: ${item.key}` }, { status: 400 });
    }
  }

  // Read current config
  const prisma = getPrisma();
  const existing = await prisma.systemConfig.findUnique({ where: { id: "singleton" } });
  const currentData = (existing?.data ?? {}) as Record<string, unknown>;

  // Apply updates — skip masked values (all stars) to avoid overwriting real secrets
  for (const { key, value } of updates) {
    const isMasked = value.length > 0 && /^\*+$/.test(value);
    if (!isMasked) {
      currentData[key] = value;
    }
  }

  await prisma.systemConfig.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      data: currentData as object,
      updatedBy: auth.context.adminUser.id,
    },
    update: {
      data: currentData as object,
      updatedBy: auth.context.adminUser.id,
    },
  });

  // Audit log
  await prisma.auditLog.create({
    data: {
      adminId: auth.context.adminUser.id,
      action: "UPDATE_SMS_CONFIG",
      targetType: "system_config",
      targetId: "singleton",
      after: { updatedKeys: updates.map((u) => u.key) },
      ipAddress: request.headers.get("x-forwarded-for"),
    },
  });

  return NextResponse.json({ data: { ok: true } });
}

// POST: test send
export async function POST(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.DIRECTOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 본문이 올바르지 않습니다." }, { status: 400 });
  }

  const { type, phone, message } = body as {
    type?: string;
    phone?: string;
    message?: string;
  };

  if (!phone?.trim()) {
    return NextResponse.json({ error: "수신 번호를 입력하세요." }, { status: 400 });
  }
  if (!message?.trim()) {
    return NextResponse.json({ error: "메시지를 입력하세요." }, { status: 400 });
  }
  if (type !== "kakao" && type !== "sms") {
    return NextResponse.json({ error: "type은 kakao 또는 sms 여야 합니다." }, { status: 400 });
  }

  const config = await getSystemConfig();

  const apiKey = config.smsApiKey;
  const apiSecret = config.smsApiSecret;
  const sender = config.smsSenderId;
  const pfId = config.kakaoChannelId;

  if (!apiKey || !apiSecret || !sender) {
    return NextResponse.json(
      { error: "SMS 발송 설정(API Key, Secret, 발신 번호)이 완료되지 않았습니다." },
      { status: 400 },
    );
  }

  try {
    const { SolapiMessageService } = await import("solapi");
    const client = new SolapiMessageService(apiKey, apiSecret);

    if (type === "kakao" && pfId && config.kakaoSenderId) {
      await client.sendOne({
        to: phone.trim(),
        from: sender,
        text: message.trim(),
        kakaoOptions: {
          pfId,
          disableSms: false,
        },
      });
    } else {
      await client.sendOne({
        to: phone.trim(),
        from: sender,
        text: message.trim(),
        type: "SMS",
      });
    }

    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "발송 실패" },
      { status: 400 },
    );
  }
}
