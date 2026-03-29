import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_SESSION_COOKIE = "interview_mate_admin_session";
export const ADMIN_SESSION_TTL_SEC = 8 * 60 * 60;

type AdminSessionPayload = {
  role: "admin";
  iat: number;
  exp: number;
};

export function getAccessToken(headers: Headers) {
  return headers.get("x-access-token")?.trim() ?? "";
}

function getAdminPassword() {
  return (
    process.env.ADMIN_PASSWORD?.trim() ??
    process.env.ADMIN_KEY?.trim() ??
    ""
  );
}

function getAdminSessionSecret() {
  return process.env.ADMIN_SESSION_SECRET?.trim() ?? getAdminPassword();
}

function getCookieValue(cookieHeader: string | null, cookieName: string) {
  if (!cookieHeader) {
    return "";
  }

  const encodedPrefix = `${cookieName}=`;

  for (const part of cookieHeader.split(";")) {
    const trimmedPart = part.trim();

    if (!trimmedPart.startsWith(encodedPrefix)) {
      continue;
    }

    return decodeURIComponent(trimmedPart.slice(encodedPrefix.length));
  }

  return "";
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

    if (payload.role !== "admin") {
      return null;
    }

    if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function createAdminSessionToken() {
  if (!isAdminSessionConfigured()) {
    throw new Error(
      "ADMIN_PASSWORD 또는 ADMIN_KEY, 그리고 ADMIN_SESSION_SECRET 설정이 필요합니다.",
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const payload: AdminSessionPayload = {
    role: "admin",
    iat: now,
    exp: now + ADMIN_SESSION_TTL_SEC,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );
  const signature = signAdminSessionPayload(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

export function getAdminSession() {
  const token = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? "";

  return verifyAdminSessionToken(token);
}

export function hasAdminSession() {
  return Boolean(getAdminSession());
}

export function getAdminKey(headers: Headers) {
  const headerAdminKey = headers.get("x-admin-key")?.trim() ?? "";

  if (headerAdminKey && isAdminAuthorized(headerAdminKey)) {
    return getAdminPassword();
  }

  const cookieToken = getCookieValue(
    headers.get("cookie"),
    ADMIN_SESSION_COOKIE,
  );

  if (verifyAdminSessionToken(cookieToken)) {
    return getAdminPassword();
  }

  return headerAdminKey;
}

export function isAdminPasswordConfigured() {
  return Boolean(getAdminPassword());
}

export function isAdminSessionConfigured() {
  return Boolean(getAdminSessionSecret());
}

export function isAdminKeyConfigured() {
  return isAdminPasswordConfigured();
}

export function isAdminAuthorized(adminKey?: string) {
  const expectedAdminPassword = getAdminPassword();
  const normalizedAdminKey = adminKey?.trim() ?? "";

  return (
    Boolean(expectedAdminPassword) &&
    Boolean(normalizedAdminKey) &&
    safeEqual(normalizedAdminKey, expectedAdminPassword)
  );
}

export function adminSessionCookieOptions(maxAge = ADMIN_SESSION_TTL_SEC) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge,
  };
}

export function clearAdminSessionCookieOptions() {
  return adminSessionCookieOptions(0);
}
