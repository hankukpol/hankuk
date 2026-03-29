import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";

import {
  generateRecoveryCodes,
  hashRecoveryCode,
  normalizeRecoveryCode,
} from "@/lib/password-recovery";
import { prisma } from "@/lib/prisma";
import { consumeFixedWindowRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { syncScorePredictSharedPassword } from "@/lib/shared-auth";
import { getServerTenantType } from "@/lib/tenant.server";
import { normalizePhone, validatePasswordStrength } from "@/lib/validations";

export const runtime = "nodejs";

const RECOVERY_WINDOW_MS = 10 * 60 * 1000;
const RECOVERY_LIMIT_PER_IP = 20;

interface RecoveryBody {
  phone?: unknown;
  recoveryCode?: unknown;
  password?: unknown;
}

export async function POST(request: NextRequest) {
  const tenantType = await getServerTenantType();

  if (tenantType === "police") {
    return NextResponse.json(
      { error: "경찰 계정은 이메일 인증코드로 비밀번호를 재설정해 주세요." },
      { status: 410 }
    );
  }

  const ip = getClientIp(request);
  const rateLimit = consumeFixedWindowRateLimit({
    namespace: "password-reset-recovery-ip",
    key: ip,
    limit: RECOVERY_LIMIT_PER_IP,
    windowMs: RECOVERY_WINDOW_MS,
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

  let body: RecoveryBody;
  try {
    body = (await request.json()) as RecoveryBody;
  } catch {
    return NextResponse.json({ error: "요청 본문(JSON) 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const phone = normalizePhone(typeof body.phone === "string" ? body.phone : "");
  const codeNormalized = normalizeRecoveryCode(
    typeof body.recoveryCode === "string" ? body.recoveryCode : ""
  );
  const passwordResult = validatePasswordStrength(
    typeof body.password === "string" ? body.password : ""
  );

  if (!/^010-\d{4}-\d{4}$/.test(phone)) {
    return NextResponse.json({ error: "전화번호는 010-XXXX-XXXX 형식으로 입력해 주세요." }, { status: 400 });
  }

  if (codeNormalized.length !== 10) {
    return NextResponse.json({ error: "복구코드 형식이 올바르지 않습니다." }, { status: 400 });
  }

  if (!passwordResult.isValid || !passwordResult.data) {
    return NextResponse.json(
      { error: passwordResult.errors[0], errors: passwordResult.errors },
      { status: 400 }
    );
  }

  const codeHash = hashRecoveryCode(codeNormalized);
  const now = new Date();
  const nextRecoveryCodes = generateRecoveryCodes(8);
  const hashedPassword = await bcrypt.hash(passwordResult.data, 12);

  const changed = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { phone },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
      },
    });
    if (!user) {
      return null;
    }

    const validRecoveryCode = await tx.recoveryCode.findFirst({
      where: {
        userId: user.id,
        codeHash,
        usedAt: null,
      },
      select: { id: true },
    });
    if (!validRecoveryCode) {
      return null;
    }

    await tx.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    await tx.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: now },
    });

    await tx.recoveryCode.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: now },
    });

    await tx.recoveryCode.createMany({
      data: nextRecoveryCodes.map((code) => ({
        userId: user.id,
        codeHash: hashRecoveryCode(code),
      })),
    });

    return {
      recoveryCodes: nextRecoveryCodes,
      user,
    };
  });

  if (!changed) {
    return NextResponse.json(
      { error: "전화번호 또는 복구코드가 올바르지 않습니다." },
      { status: 400 }
    );
  }

  try {
    await syncScorePredictSharedPassword({
      tenantType: "fire",
      identity: {
        legacyUserId: changed.user.id,
        name: changed.user.name,
        email: changed.user.email,
        loginIdentifier: changed.user.phone,
        role: changed.user.role,
      },
      password: passwordResult.data,
    });
  } catch (error) {
    console.error("[password-reset] Failed to sync fire recovery password.", error);
  }

  return NextResponse.json({
    success: true,
    message: "비밀번호가 변경되었습니다. 새 복구코드를 안전한 곳에 보관해 주세요.",
    recoveryCodes: changed.recoveryCodes,
  });
}
