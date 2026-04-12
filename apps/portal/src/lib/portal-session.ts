import "server-only";

import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

export const PORTAL_SESSION_COOKIE = "hk_portal_session";
const PORTAL_SESSION_TTL_SEC = 60 * 60 * 8;

export type PortalSessionPayload = {
  userId: string;
  email: string;
  fullName: string | null;
};

function getSecret() {
  const secret =
    process.env.PORTAL_JWT_SECRET ||
    process.env.JWT_SECRET ||
    process.env.APP_SESSION_SECRET ||
    (process.env.NODE_ENV !== "production" ? "portal-dev-secret" : undefined);

  if (!secret) {
    throw new Error("A portal session secret must be configured.");
  }

  return new TextEncoder().encode(secret);
}

export async function signPortalSession(session: PortalSessionPayload) {
  return new SignJWT({ ...session })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${PORTAL_SESSION_TTL_SEC}s`)
    .sign(getSecret());
}

export async function verifyPortalSession(token: string): Promise<PortalSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (
      typeof payload.userId !== "string" ||
      typeof payload.email !== "string" ||
      (payload.fullName !== null && payload.fullName !== undefined && typeof payload.fullName !== "string")
    ) {
      return null;
    }

    return {
      userId: payload.userId,
      email: payload.email,
      fullName: typeof payload.fullName === "string" ? payload.fullName : null,
    };
  } catch {
    return null;
  }
}

export async function getPortalSession() {
  const token = (await cookies()).get(PORTAL_SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }

  return verifyPortalSession(token);
}

export function portalCookieOptions(maxAge = PORTAL_SESSION_TTL_SEC) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}
