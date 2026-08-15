import { NextResponse } from "next/server";
import {
  isLocalMailPreviewEnabled,
  isMailerConfigured,
  sendAccountCodeEmail,
} from "@/lib/mailer";
import { createPasswordResetCode } from "@/lib/police/password-recovery";
import { consumePersistentFixedWindowRateLimit } from "@/lib/police/persistent-rate-limit";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/request-ip";
import { requireTenantSessionRoute } from "@/lib/tenant-session.server";
import { isValidEmail, normalizeEmail } from "@/lib/validations";
import { verifyPassword } from "@/lib/password-auth.server";

export const runtime = "nodejs";
const EXPIRE_MINUTES = 15;

export async function POST(request: Request) {
  const current = await requireTenantSessionRoute();
  if ("error" in current) return current.error;
  if (!isMailerConfigured(current.tenantType) && !isLocalMailPreviewEnabled()) {
    return NextResponse.json(
      { error: "현재 이메일 인증 서비스를 사용할 수 없습니다. 학원 관리자에게 문의해 주세요." },
      { status: 503 }
    );
  }

  const userId = Number(current.session.user.id);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const email = normalizeEmail(typeof body.email === "string" ? body.email : "");
  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  if (!Number.isInteger(userId) || userId < 1 || !isValidEmail(email) || !currentPassword) {
    return NextResponse.json({ error: "이메일과 현재 비밀번호를 확인해 주세요." }, { status: 400 });
  }

  const limit = await consumePersistentFixedWindowRateLimit({
    namespace: "account-email-verification",
    key: `${userId}:${getClientIp(request)}`,
    limit: 3,
    windowMs: 15 * 60 * 1000,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
    );
  }

  const [user, duplicate] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, password: true, phone: true },
    }),
    prisma.user.findFirst({ where: { email, id: { not: userId } }, select: { id: true } }),
  ]);
  if (!user || !(await verifyPassword(currentPassword, user.password)).valid) {
    return NextResponse.json({ error: "현재 비밀번호가 올바르지 않습니다." }, { status: 400 });
  }
  if (duplicate) {
    return NextResponse.json({ error: "이미 다른 계정에서 사용 중인 이메일입니다." }, { status: 409 });
  }

  const { code, tokenHash, expiresAt } = createPasswordResetCode(EXPIRE_MINUTES);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.passwordResetToken.updateMany({
      where: { userId, purpose: "EMAIL_VERIFICATION", usedAt: null },
      data: { usedAt: now },
    });
    await tx.passwordResetToken.create({
      data: {
        userId,
        tokenHash,
        purpose: "EMAIL_VERIFICATION",
        channel: "EMAIL",
        targetEmail: email,
        expiresAt,
        requestedIp: getClientIp(request),
        requestedAgent: request.headers.get("user-agent") ?? undefined,
      },
    });
  });

  try {
    const result = await sendAccountCodeEmail({
      tenantType: current.tenantType,
      purpose: "EMAIL_VERIFICATION",
      to: email,
      name: user.name,
      identity: user.phone,
      code,
      expireMinutes: EXPIRE_MINUTES,
    });
    return NextResponse.json({
      success: true,
      message: isMailerConfigured(current.tenantType)
        ? "인증코드를 이메일로 보냈습니다."
        : "인증코드를 로컬 메일 미리보기 파일로 저장했습니다.",
      previewFile: result.previewFile,
    });
  } catch (error) {
    console.error("[account-security] email verification delivery failed.", error);
    await prisma.passwordResetToken.deleteMany({ where: { userId, tokenHash } });
    return NextResponse.json({ error: "인증코드 발송에 실패했습니다." }, { status: 500 });
  }
}
