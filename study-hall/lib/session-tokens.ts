import { SignJWT, jwtVerify } from "jose";

const verifiedTokenCache = new Map<string, { payload: AdminSessionTokenPayload | StudentSessionTokenPayload | null; expiresAt: number }>();
const TOKEN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const TOKEN_CACHE_MAX = 200;

function getCachedToken<T>(token: string): T | undefined {
  const entry = verifiedTokenCache.get(token);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    verifiedTokenCache.delete(token);
    return undefined;
  }
  return entry.payload as T;
}

function setCachedToken(token: string, payload: AdminSessionTokenPayload | StudentSessionTokenPayload | null) {
  if (verifiedTokenCache.size >= TOKEN_CACHE_MAX) {
    const firstKey = verifiedTokenCache.keys().next().value;
    if (firstKey) verifiedTokenCache.delete(firstKey);
  }
  verifiedTokenCache.set(token, { payload, expiresAt: Date.now() + TOKEN_CACHE_TTL });
}

export type SessionAdminRole = "SUPER_ADMIN" | "ADMIN" | "ASSISTANT";

export type AdminSessionTokenPayload = {
  id: string;
  userId: string;
  name: string;
  role: SessionAdminRole;
  divisionId: string | null;
  divisionSlug: string | null;
};

export type StudentSessionTokenPayload = {
  studentId: string;
  divisionId: string;
  divisionSlug: string;
  studentNumber: string;
  name: string;
};

const ADMIN_SESSION_MAX_AGE = 60 * 60 * 24 * 30;
const STUDENT_SESSION_MAX_AGE = 60 * 60 * 24 * 7;

function getSessionSecret() {
  const secret =
    process.env.APP_SESSION_SECRET ||
    (process.env.MOCK_MODE === "true" || process.env.NODE_ENV !== "production"
      ? "local-dev-session-secret"
      : undefined);

  if (!secret) {
    throw new Error("APP_SESSION_SECRET must be configured.");
  }

  return new TextEncoder().encode(secret);
}

function isAdminRole(value: unknown): value is SessionAdminRole {
  return value === "SUPER_ADMIN" || value === "ADMIN" || value === "ASSISTANT";
}

export async function createAdminSessionToken(session: AdminSessionTokenPayload) {
  return new SignJWT({ ...session, kind: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ADMIN_SESSION_MAX_AGE}s`)
    .sign(getSessionSecret());
}

export async function verifyAdminSessionToken(token: string): Promise<AdminSessionTokenPayload | null> {
  const cached = getCachedToken<AdminSessionTokenPayload | null>(token);
  if (cached !== undefined) return cached;

  try {
    const { payload } = await jwtVerify(token, getSessionSecret());

    if (
      payload.kind !== "admin" ||
      typeof payload.id !== "string" ||
      typeof payload.userId !== "string" ||
      typeof payload.name !== "string" ||
      !isAdminRole(payload.role) ||
      (payload.divisionId !== null && typeof payload.divisionId !== "string") ||
      (payload.divisionSlug !== null && typeof payload.divisionSlug !== "string")
    ) {
      setCachedToken(token, null);
      return null;
    }

    const result: AdminSessionTokenPayload = {
      id: payload.id,
      userId: payload.userId,
      name: payload.name,
      role: payload.role,
      divisionId: payload.divisionId ?? null,
      divisionSlug: payload.divisionSlug ?? null,
    };
    setCachedToken(token, result);
    return result;
  } catch {
    setCachedToken(token, null);
    return null;
  }
}

export async function createStudentSessionToken(session: StudentSessionTokenPayload) {
  return new SignJWT({ ...session, kind: "student" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${STUDENT_SESSION_MAX_AGE}s`)
    .sign(getSessionSecret());
}

export async function verifyStudentSessionToken(
  token: string,
): Promise<StudentSessionTokenPayload | null> {
  const cached = getCachedToken<StudentSessionTokenPayload | null>(token);
  if (cached !== undefined) return cached;

  try {
    const { payload } = await jwtVerify(token, getSessionSecret());

    if (
      payload.kind !== "student" ||
      typeof payload.studentId !== "string" ||
      typeof payload.divisionId !== "string" ||
      typeof payload.divisionSlug !== "string" ||
      typeof payload.studentNumber !== "string" ||
      typeof payload.name !== "string"
    ) {
      setCachedToken(token, null);
      return null;
    }

    const result: StudentSessionTokenPayload = {
      studentId: payload.studentId,
      divisionId: payload.divisionId,
      divisionSlug: payload.divisionSlug,
      studentNumber: payload.studentNumber,
      name: payload.name,
    };
    setCachedToken(token, result);
    return result;
  } catch {
    setCachedToken(token, null);
    return null;
  }
}
