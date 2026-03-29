import "server-only";
import bcrypt from "bcryptjs";
import {
  consumePersistentFixedWindowRateLimit,
  resetPersistentFixedWindowRateLimit,
} from "@/lib/police/persistent-rate-limit";
import { isMailerConfigured, sendPasswordResetCodeEmail } from "@/lib/mailer";
import { createPasswordResetCode, hashSecret } from "@/lib/police/password-recovery";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/request-ip";
import {
  validatePasswordResetRequestInput,
  validateResetPasswordInput,
} from "@/lib/police/validations";
import type { PasswordResetRequestFormData, ResetPasswordFormData } from "@/types";

interface PasswordResetResult {
  ok: boolean;
  status: number;
  body: {
    message?: string;
    error?: string;
    previewFile?: string;
    retryAfterSec?: number;
  };
}

const PASSWORD_RESET_CODE_EXPIRE_MINUTES = 15;
const PASSWORD_RESET_REQUEST_IP_WINDOW_MS = 15 * 60 * 1000;
const PASSWORD_RESET_REQUEST_IP_LIMIT = 5;
const PASSWORD_RESET_REQUEST_ACCOUNT_WINDOW_MS = 15 * 60 * 1000;
const PASSWORD_RESET_REQUEST_ACCOUNT_LIMIT = 3;
const PASSWORD_RESET_CONFIRM_IP_WINDOW_MS = 15 * 60 * 1000;
const PASSWORD_RESET_CONFIRM_IP_LIMIT = 10;
const PASSWORD_RESET_CONFIRM_ACCOUNT_WINDOW_MS = 15 * 60 * 1000;
const PASSWORD_RESET_CONFIRM_ACCOUNT_LIMIT = 5;
const MSG = {
  inputFallback: "\uC785\uB825\uAC12\uC744 \uB2E4\uC2DC \uD655\uC778\uD574 \uC8FC\uC138\uC694.",
  genericMessage:
    "\uC785\uB825\uD55C \uC815\uBCF4\uC640 \uC77C\uCE58\uD558\uB294 \uACC4\uC815\uC774 \uC788\uC73C\uBA74 \uBE44\uBC00\uBC88\uD638 \uC7AC\uC124\uC815 \uC778\uC99D\uCF54\uB4DC\uB97C \uC774\uBA54\uC77C\uB85C \uBCF4\uB0C8\uC2B5\uB2C8\uB2E4. \uBA54\uC77C\uD568\uACFC \uC2A4\uD338\uD568\uC744 \uD568\uAED8 \uD655\uC778\uD574 \uC8FC\uC138\uC694.",
  previewMessage:
    "\uC778\uC99D\uCF54\uB4DC\uB97C \uB85C\uCEEC \uBA54\uC77C \uD504\uB9AC\uBDF0 \uD30C\uC77C\uB85C \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4.",
  sendMailError:
    "\uC778\uC99D\uCF54\uB4DC \uBA54\uC77C \uBC1C\uC1A1\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.",
  invalidResetInput:
    "\uC544\uC774\uB514, \uC774\uBA54\uC77C \uB610\uB294 \uC778\uC99D\uCF54\uB4DC\uB97C \uD655\uC778\uD574 \uC8FC\uC138\uC694.",
  resetSuccess:
    "\uBE44\uBC00\uBC88\uD638\uAC00 \uC7AC\uC124\uC815\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uC0C8 \uBE44\uBC00\uBC88\uD638\uB85C \uB85C\uADF8\uC778\uD574 \uC8FC\uC138\uC694.",
  tooMany:
    "\uC694\uCCAD\uC774 \uB108\uBB34 \uB9CE\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.",
};

function buildAccountKey(username: string, email: string): string {
  return `${username}:${email}`;
}

function buildRateLimitError(retryAfterSec: number): PasswordResetResult {
  return {
    ok: false,
    status: 429,
    body: {
      error: MSG.tooMany,
      retryAfterSec,
    },
  };
}

export async function requestPasswordResetCode(
  input: Partial<PasswordResetRequestFormData>,
  requestLike?: Request
): Promise<PasswordResetResult> {
  const validation = validatePasswordResetRequestInput(input);
  if (!validation.isValid || !validation.data) {
    return {
      ok: false,
      status: 400,
      body: { error: validation.errors[0] ?? MSG.inputFallback },
    };
  }

  const { username, email } = validation.data;
  const clientIp = requestLike ? getClientIp(requestLike) : "unknown";

  const ipRateLimit = await consumePersistentFixedWindowRateLimit({
    namespace: "password-reset-request-ip",
    key: clientIp,
    limit: PASSWORD_RESET_REQUEST_IP_LIMIT,
    windowMs: PASSWORD_RESET_REQUEST_IP_WINDOW_MS,
  });
  if (!ipRateLimit.allowed) {
    return buildRateLimitError(ipRateLimit.retryAfterSec);
  }

  const accountRateLimit = await consumePersistentFixedWindowRateLimit({
    namespace: "password-reset-request-account",
    key: buildAccountKey(username, email),
    limit: PASSWORD_RESET_REQUEST_ACCOUNT_LIMIT,
    windowMs: PASSWORD_RESET_REQUEST_ACCOUNT_WINDOW_MS,
  });
  if (!accountRateLimit.allowed) {
    return buildRateLimitError(accountRateLimit.retryAfterSec);
  }

  const user = await prisma.user.findFirst({
    where: { phone: username, email },
    select: { id: true, name: true, email: true, phone: true },
  });

  if (!user?.email) {
    return { ok: true, status: 200, body: { message: MSG.genericMessage } };
  }

  const { code, tokenHash, expiresAt } = createPasswordResetCode(PASSWORD_RESET_CODE_EXPIRE_MINUTES);
  const requestedIp = clientIp;
  const requestedAgent = requestLike?.headers.get("user-agent") ?? undefined;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
      await tx.passwordResetToken.create({
        data: { userId: user.id, tokenHash, expiresAt, requestedIp, requestedAgent },
      });
    });

    const mailResult = await sendPasswordResetCodeEmail({
      to: user.email,
      name: user.name,
      username: user.phone,
      code,
      expireMinutes: PASSWORD_RESET_CODE_EXPIRE_MINUTES,
    });

    return {
      ok: true,
      status: 200,
      body: {
        message: isMailerConfigured() ? MSG.genericMessage : MSG.previewMessage,
        previewFile: mailResult.previewFile,
      },
    };
  } catch {
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, tokenHash } });
    return { ok: false, status: 500, body: { error: MSG.sendMailError } };
  }
}

export async function confirmPasswordReset(
  input: Partial<ResetPasswordFormData>,
  requestLike?: Request
): Promise<PasswordResetResult> {
  const validation = validateResetPasswordInput(input);
  if (!validation.isValid || !validation.data) {
    return {
      ok: false,
      status: 400,
      body: { error: validation.errors[0] ?? MSG.inputFallback },
    };
  }

  const { username, email, resetCode, password } = validation.data;
  const clientIp = requestLike ? getClientIp(requestLike) : "unknown";

  const ipRateLimit = await consumePersistentFixedWindowRateLimit({
    namespace: "password-reset-confirm-ip",
    key: clientIp,
    limit: PASSWORD_RESET_CONFIRM_IP_LIMIT,
    windowMs: PASSWORD_RESET_CONFIRM_IP_WINDOW_MS,
  });
  if (!ipRateLimit.allowed) {
    return buildRateLimitError(ipRateLimit.retryAfterSec);
  }

  const accountKey = buildAccountKey(username, email);
  const accountRateLimit = await consumePersistentFixedWindowRateLimit({
    namespace: "password-reset-confirm-account",
    key: accountKey,
    limit: PASSWORD_RESET_CONFIRM_ACCOUNT_LIMIT,
    windowMs: PASSWORD_RESET_CONFIRM_ACCOUNT_WINDOW_MS,
  });
  if (!accountRateLimit.allowed) {
    return buildRateLimitError(accountRateLimit.retryAfterSec);
  }

  const user = await prisma.user.findFirst({
    where: { phone: username, email },
    select: { id: true },
  });

  if (!user) {
    return { ok: false, status: 400, body: { error: MSG.invalidResetInput } };
  }

  const tokenHash = hashSecret(resetCode);
  const now = new Date();
  const token = await prisma.passwordResetToken.findFirst({
    where: {
      userId: user.id,
      tokenHash,
      usedAt: null,
      expiresAt: { gt: now },
    },
    select: { id: true },
  });

  if (!token) {
    return { ok: false, status: 400, body: { error: MSG.invalidResetInput } };
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { password: hashedPassword } }),
    prisma.passwordResetToken.update({ where: { id: token.id }, data: { usedAt: now } }),
    prisma.passwordResetToken.deleteMany({
      where: { userId: user.id, usedAt: null, id: { not: token.id } },
    }),
  ]);

  await resetPersistentFixedWindowRateLimit({
    namespace: "password-reset-confirm-account",
    key: accountKey,
  });

  return { ok: true, status: 200, body: { message: MSG.resetSuccess } };
}
