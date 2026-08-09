import { NextRequest, NextResponse } from "next/server";
import { parsePositiveInt } from "@/lib/exam-utils";
import {
  buildSmsMarketingConsentUpdate,
  isSmsMarketingConsentActive,
  SMS_MARKETING_CONSENT_TEXT,
  SMS_MARKETING_CONSENT_VERSION,
} from "@/lib/police/sms-marketing-consent";
import { prisma } from "@/lib/prisma";
import { getCurrentTenantSessionContext } from "@/lib/tenant-session.server";

export const runtime = "nodejs";

async function getPoliceUser() {
  const current = await getCurrentTenantSessionContext();
  if (!current?.session.user?.id) {
    return { error: NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }) };
  }
  if (current.tenantType !== "police") {
    return {
      error: NextResponse.json(
        { error: "경찰 서비스의 문자 수신 설정입니다." },
        { status: 404 }
      ),
    };
  }

  const userId = parsePositiveInt(current.session.user.id);
  if (!userId) {
    return { error: NextResponse.json({ error: "사용자 정보를 확인할 수 없습니다." }, { status: 401 }) };
  }

  return { userId };
}

export async function GET() {
  const auth = await getPoliceUser();
  if ("error" in auth) return auth.error;

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: {
      smsMarketingConsentAt: true,
      smsMarketingConsentVersion: true,
      smsMarketingConsentWithdrawnAt: true,
    },
  });
  if (!user) {
    return NextResponse.json({ error: "사용자를 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({
    consented: isSmsMarketingConsentActive(user),
    consentAt: user.smsMarketingConsentAt,
    consentVersion: user.smsMarketingConsentVersion,
    withdrawnAt: user.smsMarketingConsentWithdrawnAt,
    currentVersion: SMS_MARKETING_CONSENT_VERSION,
    consentText: SMS_MARKETING_CONSENT_TEXT,
  });
}

export async function PUT(request: NextRequest) {
  const auth = await getPoliceUser();
  if ("error" in auth) return auth.error;

  let body: { consented?: unknown };
  try {
    body = (await request.json()) as { consented?: unknown };
  } catch {
    return NextResponse.json({ error: "요청 본문이 올바르지 않습니다." }, { status: 400 });
  }
  if (typeof body.consented !== "boolean") {
    return NextResponse.json({ error: "동의 여부가 올바르지 않습니다." }, { status: 400 });
  }
  const desiredConsent = body.consented;

  const user = await prisma.$transaction(async (tx) => {
    const current = await tx.user.findUnique({
      where: { id: auth.userId },
      select: {
        smsMarketingConsentAt: true,
        smsMarketingConsentVersion: true,
        smsMarketingConsentWithdrawnAt: true,
      },
    });
    if (!current) {
      return null;
    }

    const update = buildSmsMarketingConsentUpdate(current, desiredConsent, new Date());
    if (!update) {
      return current;
    }

    return tx.user.update({
      where: { id: auth.userId },
      data: update,
      select: {
        smsMarketingConsentAt: true,
        smsMarketingConsentVersion: true,
        smsMarketingConsentWithdrawnAt: true,
      },
    });
  });
  if (!user) {
    return NextResponse.json({ error: "사용자를 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    consented: isSmsMarketingConsentActive(user),
    message: desiredConsent ? "문자 수신에 동의했습니다." : "문자 수신 동의를 철회했습니다.",
  });
}
