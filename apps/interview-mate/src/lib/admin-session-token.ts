import { createHmac, timingSafeEqual } from "node:crypto";

import type { AdminRole, AdminUser } from "@/lib/admin-users";

export const ADMIN_SESSION_TTL_SEC = 8 * 60 * 60;

export type AdminSessionPayload = {
  role: AdminRole;
  adminId: string;
  loginId: string;
  displayName: string;
  iat: number;
  exp: number;
};

function getAdminSessionSecret() {
  return (
    process.env.ADMIN_SESSION_SECRET?.trim() ??
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ??
    ""
  );
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function signAdminSessionPayload(encodedPayload: string) {
  const secret = getAdminSessionSecret();

  if (!secret) {
    return "";
  }

  return createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");
}

export function createAdminSessionToken(
  adminUser: Pick<AdminUser, "id" | "loginId" | "displayName" | "role">,
) {
  const secret = getAdminSessionSecret();

  if (!secret) {
    throw new Error("관리자 세션 서명 키가 설정되지 않았습니다.");
  }

  const now = Math.floor(Date.now() / 1000);
  const payload: AdminSessionPayload = {
    role: adminUser.role,
    adminId: adminUser.id,
    loginId: adminUser.loginId,
    displayName: adminUser.displayName,
    iat: now,
    exp: now + ADMIN_SESSION_TTL_SEC,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );
  const signature = signAdminSessionPayload(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

export function verifyAdminSessionToken(token?: string | null) {
  if (!token) {
    return null;
  }

  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = signAdminSessionPayload(encodedPayload);

  if (!expectedSignature || !safeEqual(signature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as AdminSessionPayload;

    if (!payload.adminId || !payload.loginId || !payload.displayName) {
      return null;
    }

    if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }

    if (payload.role !== "admin" && payload.role !== "super_admin") {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function isAdminAuthorized(adminKey?: string) {
  return Boolean(verifyAdminSessionToken(adminKey));
}

export function isAdminSessionConfigured() {
  return Boolean(getAdminSessionSecret());
}

export function getAdminSetupKey() {
  return process.env.ADMIN_SETUP_KEY?.trim() ?? "";
}

export function isAdminSetupConfigured() {
  return Boolean(getAdminSetupKey());
}

export function isAdminSetupAuthorized(setupKey?: string) {
  const expectedSetupKey = getAdminSetupKey();
  const normalizedSetupKey = setupKey?.trim() ?? "";

  return (
    Boolean(expectedSetupKey) &&
    Boolean(normalizedSetupKey) &&
    safeEqual(expectedSetupKey, normalizedSetupKey)
  );
}
