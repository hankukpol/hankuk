import { cookies } from "next/headers";

import {
  ADMIN_SESSION_TTL_SEC,
  createAdminSessionToken,
  getAdminSetupKey,
  isAdminAuthorized,
  isAdminSessionConfigured,
  isAdminSetupAuthorized,
  isAdminSetupConfigured,
  verifyAdminSessionToken,
} from "@/lib/admin-session-token";

export const ADMIN_SESSION_COOKIE = "interview_mate_admin_session";

export function getAccessToken(headers: Headers) {
  return headers.get("x-access-token")?.trim() ?? "";
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

export function getAdminSession() {
  const token = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? "";

  return verifyAdminSessionToken(token);
}

export function hasAdminSession() {
  return Boolean(getAdminSession());
}

export function getAdminSessionFromHeaders(headers: Headers) {
  const headerToken = headers.get("x-admin-key")?.trim() ?? "";

  if (headerToken) {
    return verifyAdminSessionToken(headerToken);
  }

  const cookieToken = getCookieValue(
    headers.get("cookie"),
    ADMIN_SESSION_COOKIE,
  );

  return verifyAdminSessionToken(cookieToken);
}

export function getAdminKey(headers: Headers) {
  const headerAdminKey = headers.get("x-admin-key")?.trim() ?? "";

  if (headerAdminKey) {
    return headerAdminKey;
  }

  return getCookieValue(headers.get("cookie"), ADMIN_SESSION_COOKIE);
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

export {
  ADMIN_SESSION_TTL_SEC,
  createAdminSessionToken,
  verifyAdminSessionToken,
  isAdminAuthorized,
  isAdminSessionConfigured,
  getAdminSetupKey,
  isAdminSetupConfigured,
  isAdminSetupAuthorized,
};
