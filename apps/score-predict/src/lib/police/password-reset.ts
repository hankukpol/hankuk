import "server-only";
import {
  consumePersistentFixedWindowRateLimit,
  resetPersistentFixedWindowRateLimit,
} from "@/lib/police/persistent-rate-limit";
import {
  isLocalMailPreviewEnabled,
  isMailerConfigured,
  sendAccountCodeEmail,
  sendPasswordResetCodeEmail,
} from "@/lib/mailer";
import { createPasswordResetCode, hashSecret } from "@/lib/police/password-recovery";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password-auth.server";
import { getClientIp } from "@/lib/request-ip";
import type { TenantType } from "@/lib/tenant";
import {
  findPoliceUsersByUsername,
  getPreferredPoliceUsername,
  resolvePreferredPoliceUsername,
} from "@/lib/police/account-identity";
import {
  isValidEmail,
  normalizeEmail,
  normalizePhone,
  normalizeResetCode,
  normalizeUsername,
  validatePasswordStrength,
} from "@/lib/validations";

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

type PasswordResetInput = {
  identity?: unknown;
  username?: unknown;
  phone?: unknown;
  email?: unknown;
  resetCode?: unknown;
  password?: unknown;
  recoveryChannel?: unknown;
};

const PASSWORD_RESET_CODE_EXPIRE_MINUTES = 15;
const ADMIN_RESET_CODE_EXPIRE_MINUTES = 10;
const PASSWORD_RESET_REQUEST_IP_WINDOW_MS = 15 * 60 * 1000;
const PASSWORD_RESET_REQUEST_IP_LIMIT = 5;
const PASSWORD_RESET_REQUEST_ACCOUNT_WINDOW_MS = 15 * 60 * 1000;
const PASSWORD_RESET_REQUEST_ACCOUNT_LIMIT = 3;
const PASSWORD_RESET_CONFIRM_IP_WINDOW_MS = 15 * 60 * 1000;
const PASSWORD_RESET_CONFIRM_IP_LIMIT = 10;
const PASSWORD_RESET_CONFIRM_ACCOUNT_WINDOW_MS = 15 * 60 * 1000;
const PASSWORD_RESET_CONFIRM_ACCOUNT_LIMIT = 5;
const GENERIC_MESSAGE =
  "입력한 정보와 일치하는 계정이 있으면 비밀번호 재설정 인증코드를 이메일로 보냈습니다. 메일함과 스팸함을 함께 확인해 주세요.";
const PREVIEW_MESSAGE = "인증코드를 로컬 메일 미리보기 파일로 저장했습니다.";

function normalizeIdentity(tenantType: TenantType, input: PasswordResetInput): string {
  const raw =
    typeof input.identity === "string"
      ? input.identity
      : typeof input.username === "string"
        ? input.username
        : typeof input.phone === "string"
          ? input.phone
          : "";
  return tenantType === "police" ? normalizeUsername(raw) : normalizePhone(raw);
}

function isValidIdentity(tenantType: TenantType, identity: string): boolean {
  if (tenantType === "police") {
    return /^[a-z0-9][a-z0-9._-]{3,29}$/.test(identity);
  }
  return /^010-\d{4}-\d{4}$/.test(identity);
}

function buildAccountKey(identity: string, email: string): string {
  return `${identity}:${email}`;
}

function buildRateLimitError(retryAfterSec: number): PasswordResetResult {
  return {
    ok: false,
    status: 429,
    body: {
      error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
      retryAfterSec,
    },
  };
}

function buildMailerUnavailableError(): PasswordResetResult {
  return {
    ok: false,
    status: 503,
    body: {
      error: "현재 이메일 인증 서비스를 사용할 수 없습니다. 학원 관리자에게 문의해 주세요.",
    },
  };
}

export async function requestPasswordResetCode(
  input: PasswordResetInput,
  tenantType: TenantType,
  requestLike?: Request
): Promise<PasswordResetResult> {
  if (!isMailerConfigured(tenantType) && !isLocalMailPreviewEnabled()) {
    return buildMailerUnavailableError();
  }

  const identity = normalizeIdentity(tenantType, input);
  const email = normalizeEmail(typeof input.email === "string" ? input.email : "");
  if (!isValidIdentity(tenantType, identity) || !isValidEmail(email)) {
    return { ok: false, status: 400, body: { error: "로그인 정보와 이메일을 확인해 주세요." } };
  }

  const clientIp = requestLike ? getClientIp(requestLike) : "unknown";
  const ipRateLimit = await consumePersistentFixedWindowRateLimit({
    namespace: "password-reset-request-ip",
    key: clientIp,
    limit: PASSWORD_RESET_REQUEST_IP_LIMIT,
    windowMs: PASSWORD_RESET_REQUEST_IP_WINDOW_MS,
  });
  if (!ipRateLimit.allowed) return buildRateLimitError(ipRateLimit.retryAfterSec);

  const accountKey = buildAccountKey(identity, email);
  const accountRateLimit = await consumePersistentFixedWindowRateLimit({
    namespace: "password-reset-request-account",
    key: accountKey,
    limit: PASSWORD_RESET_REQUEST_ACCOUNT_LIMIT,
    windowMs: PASSWORD_RESET_REQUEST_ACCOUNT_WINDOW_MS,
  });
  if (!accountRateLimit.allowed) return buildRateLimitError(accountRateLimit.retryAfterSec);

  const matchingPoliceUsers =
    tenantType === "police"
      ? (await findPoliceUsersByUsername(identity)).filter(
          (candidate) => candidate.email?.toLowerCase() === email
        )
      : [];
  const user =
    tenantType === "police"
      ? matchingPoliceUsers.length === 1
        ? matchingPoliceUsers[0]
        : null
      : await prisma.user.findFirst({
          where: { phone: identity, email: { equals: email, mode: "insensitive" } },
          select: { id: true, name: true, email: true, phone: true },
        });
  if (!user?.email) {
    return { ok: true, status: 200, body: { message: GENERIC_MESSAGE } };
  }

  const { code, tokenHash, expiresAt } = createPasswordResetCode(PASSWORD_RESET_CODE_EXPIRE_MINUTES);
  const requestedAgent = requestLike?.headers.get("user-agent") ?? undefined;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.updateMany({
        where: {
          userId: user.id,
          purpose: "PASSWORD_RESET",
          channel: "EMAIL",
          usedAt: null,
        },
        data: { usedAt: new Date() },
      });
      await tx.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          purpose: "PASSWORD_RESET",
          channel: "EMAIL",
          targetEmail: user.email,
          expiresAt,
          requestedIp: clientIp,
          requestedAgent,
        },
      });
    });

    const mailResult = await sendPasswordResetCodeEmail({
      tenantType,
      to: user.email,
      name: user.name,
      identity:
        tenantType === "police"
          ? resolvePreferredPoliceUsername(matchingPoliceUsers[0])
          : user.phone,
      code,
      expireMinutes: PASSWORD_RESET_CODE_EXPIRE_MINUTES,
    });

    return {
      ok: true,
      status: 200,
      body: {
        message: isMailerConfigured(tenantType) ? GENERIC_MESSAGE : PREVIEW_MESSAGE,
        previewFile: mailResult.previewFile,
      },
    };
  } catch (error) {
    console.error(`[password-reset] ${tenantType} email delivery failed.`, error);
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, tokenHash } });
    return {
      ok: false,
      status: 500,
      body: { error: "인증코드 메일 발송에 실패했습니다. 잠시 후 다시 시도해 주세요." },
    };
  }
}

export async function confirmPasswordReset(
  input: PasswordResetInput,
  tenantType: TenantType,
  requestLike?: Request
): Promise<PasswordResetResult> {
  const identity = normalizeIdentity(tenantType, input);
  const email = normalizeEmail(typeof input.email === "string" ? input.email : "");
  const resetCode = normalizeResetCode(typeof input.resetCode === "string" ? input.resetCode : "");
  const passwordResult = validatePasswordStrength(
    typeof input.password === "string" ? input.password : ""
  );
  const isAdminCode = input.recoveryChannel === "ADMIN_MANUAL_SMS";

  if (
    !isValidIdentity(tenantType, identity) ||
    (!isAdminCode && !isValidEmail(email)) ||
    resetCode.length !== 8 ||
    !passwordResult.isValid ||
    !passwordResult.data
  ) {
    return {
      ok: false,
      status: 400,
      body: { error: passwordResult.errors[0] ?? "로그인 정보, 이메일 또는 인증코드를 확인해 주세요." },
    };
  }

  const clientIp = requestLike ? getClientIp(requestLike) : "unknown";
  const ipRateLimit = await consumePersistentFixedWindowRateLimit({
    namespace: "password-reset-confirm-ip",
    key: clientIp,
    limit: PASSWORD_RESET_CONFIRM_IP_LIMIT,
    windowMs: PASSWORD_RESET_CONFIRM_IP_WINDOW_MS,
  });
  if (!ipRateLimit.allowed) return buildRateLimitError(ipRateLimit.retryAfterSec);

  const accountKey = buildAccountKey(identity, isAdminCode ? "admin-code" : email);
  const accountRateLimit = await consumePersistentFixedWindowRateLimit({
    namespace: "password-reset-confirm-account",
    key: accountKey,
    limit: PASSWORD_RESET_CONFIRM_ACCOUNT_LIMIT,
    windowMs: PASSWORD_RESET_CONFIRM_ACCOUNT_WINDOW_MS,
  });
  if (!accountRateLimit.allowed) return buildRateLimitError(accountRateLimit.retryAfterSec);

  const candidateUsers =
    tenantType === "police"
      ? (await findPoliceUsersByUsername(identity)).filter(
          (candidate) => isAdminCode || candidate.email?.toLowerCase() === email
        )
      : await prisma.user.findMany({
          where: {
            phone: identity,
            ...(isAdminCode
              ? {}
              : { email: { equals: email, mode: "insensitive" as const } }),
          },
          select: { email: true, id: true, name: true, phone: true },
          take: 2,
        });
  if (candidateUsers.length === 0) {
    return { ok: false, status: 400, body: { error: "로그인 정보 또는 인증코드를 확인해 주세요." } };
  }

  const tokenHash = hashSecret(resetCode);
  const now = new Date();
  const channel = isAdminCode ? "ADMIN_MANUAL_SMS" : "EMAIL";
  const tokens = await prisma.passwordResetToken.findMany({
    where: {
      userId: { in: candidateUsers.map((candidate) => candidate.id) },
      tokenHash,
      purpose: "PASSWORD_RESET",
      channel,
      ...(isAdminCode
        ? {}
        : { targetEmail: { equals: email, mode: "insensitive" } }),
      usedAt: null,
      expiresAt: { gt: now },
    },
    select: {
      id: true,
      user: { select: { email: true, id: true, name: true, phone: true } },
    },
    take: 2,
  });
  if (tokens.length !== 1) {
    return { ok: false, status: 400, body: { error: "유효하지 않거나 만료된 인증코드입니다." } };
  }
  const token = tokens[0];
  const user = token.user;

  const hashedPassword = await hashPassword(passwordResult.data);
  const changed = await prisma.$transaction(async (tx) => {
    const consumed = await tx.passwordResetToken.updateMany({
      where: { id: token.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (consumed.count !== 1) return false;

    await tx.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        credentialVersion: { increment: 1 },
        ...(!isAdminCode && !user.email ? {} : !isAdminCode ? { emailVerifiedAt: now } : {}),
      },
    });
    await tx.passwordResetToken.updateMany({
      where: { userId: user.id, purpose: "PASSWORD_RESET", usedAt: null },
      data: { usedAt: now },
    });
    return true;
  });
  if (!changed) {
    return { ok: false, status: 400, body: { error: "이미 사용했거나 만료된 인증코드입니다." } };
  }

  await resetPersistentFixedWindowRateLimit({
    namespace: "password-reset-confirm-account",
    key: accountKey,
  });

  if (user.email && isMailerConfigured(tenantType)) {
    const preferredIdentity =
      tenantType === "police"
        ? await getPreferredPoliceUsername(user.id, user.phone)
        : user.phone;
    void sendAccountCodeEmail({
      tenantType,
      purpose: "PASSWORD_CHANGED",
      to: user.email,
      name: user.name,
      identity: preferredIdentity,
    }).catch((error) => console.error("[password-reset] confirmation email failed.", error));
  }

  return {
    ok: true,
    status: 200,
    body: { message: "비밀번호가 재설정되었습니다. 새 비밀번호로 로그인해 주세요." },
  };
}

export async function issueAdminPasswordResetCode(params: {
  userId: number;
  adminUserId: number;
  requestLike?: Request;
}) {
  const { code, tokenHash, expiresAt } = createPasswordResetCode(ADMIN_RESET_CODE_EXPIRE_MINUTES);
  const requestedIp = params.requestLike ? getClientIp(params.requestLike) : "unknown";
  const requestedAgent = params.requestLike?.headers.get("user-agent") ?? undefined;
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.passwordResetToken.updateMany({
      where: {
        userId: params.userId,
        purpose: "PASSWORD_RESET",
        channel: "ADMIN_MANUAL_SMS",
        usedAt: null,
      },
      data: { usedAt: now },
    });
    await tx.passwordResetToken.create({
      data: {
        userId: params.userId,
        tokenHash,
        purpose: "PASSWORD_RESET",
        channel: "ADMIN_MANUAL_SMS",
        issuedByAdminId: params.adminUserId,
        expiresAt,
        requestedIp,
        requestedAgent,
      },
    });
  });

  return { code, expiresAt, expireMinutes: ADMIN_RESET_CODE_EXPIRE_MINUTES };
}
