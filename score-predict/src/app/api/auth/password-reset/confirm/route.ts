import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { hashSecret } from "@/lib/password-recovery";
import { confirmPasswordReset } from "@/lib/police/password-reset";
import { prisma } from "@/lib/prisma";
import { consumeFixedWindowRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { syncScorePredictSharedPassword } from "@/lib/shared-auth";
import { getServerTenantType } from "@/lib/tenant.server";
import { validatePasswordStrength } from "@/lib/validations";

export const runtime = "nodejs";

const CONFIRM_WINDOW_MS = 10 * 60 * 1000;
const CONFIRM_LIMIT_PER_IP = 20;

interface ConfirmBody {
  token?: unknown;
  password?: unknown;
}

export async function POST(request: NextRequest) {
  const tenantType = await getServerTenantType();

  if (tenantType === "police") {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const result = await confirmPasswordReset(body, request);
    return NextResponse.json(result.body, { status: result.status });
  }

  const ip = getClientIp(request);
  const rateLimit = consumeFixedWindowRateLimit({
    namespace: "password-reset-confirm-ip",
    key: ip,
    limit: CONFIRM_LIMIT_PER_IP,
    windowMs: CONFIRM_WINDOW_MS,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSec) },
      }
    );
  }

  let body: ConfirmBody;
  try {
    body = (await request.json()) as ConfirmBody;
  } catch {
    return NextResponse.json({ error: "요청 본문(JSON) 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) {
    return NextResponse.json({ error: "재설정 토큰이 필요합니다." }, { status: 400 });
  }

  const passwordResult = validatePasswordStrength(
    typeof body.password === "string" ? body.password : ""
  );
  if (!passwordResult.isValid || !passwordResult.data) {
    return NextResponse.json(
      { error: passwordResult.errors[0], errors: passwordResult.errors },
      { status: 400 }
    );
  }

  const tokenHash = hashSecret(token);
  const now = new Date();
  const hashedPassword = await bcrypt.hash(passwordResult.data, 12);

  const changed = await prisma.$transaction(async (tx) => {
    const resetToken = await tx.passwordResetToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: now },
      },
      select: {
        userId: true,
      },
    });

    if (!resetToken) {
      return null;
    }

    const user = await tx.user.update({
      where: { id: resetToken.userId },
      data: { password: hashedPassword },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
      },
    });

    await tx.passwordResetToken.updateMany({
      where: { userId: resetToken.userId, usedAt: null },
      data: { usedAt: now },
    });

    return user;
  });

  if (!changed) {
    return NextResponse.json(
      { error: "유효하지 않거나 만료된 재설정 링크입니다. 다시 요청해 주세요." },
      { status: 400 }
    );
  }

  try {
    await syncScorePredictSharedPassword({
      tenantType: "fire",
      identity: {
        legacyUserId: changed.id,
        name: changed.name,
        email: changed.email,
        loginIdentifier: changed.phone,
        role: changed.role,
      },
      password: passwordResult.data,
    });
  } catch (error) {
    console.error("[password-reset] Failed to sync fire shared auth password.", error);
  }

  return NextResponse.json({
    success: true,
    message: "비밀번호가 변경되었습니다. 새 비밀번호로 로그인해 주세요.",
  });
}
