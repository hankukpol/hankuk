import { SignJWT } from "jose/jwt/sign";
import { jwtVerify } from "jose/jwt/verify";

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
    (process.env.MOCK_MODE === "true" ? "local-dev-session-secret" : undefined);

  if (!secret) {
    throw new Error("APP_SESSION_SECRET must be configured.");
  }

  if (secret === "local-dev-session-secret" && process.env.MOCK_MODE !== "true") {
    throw new Error("APP_SESSION_SECRET must not use the local development fallback.");
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
      return null;
    }

    return {
      id: payload.id,
      userId: payload.userId,
      name: payload.name,
      role: payload.role,
      divisionId: payload.divisionId ?? null,
      divisionSlug: payload.divisionSlug ?? null,
    };
  } catch {
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
      return null;
    }

    return {
      studentId: payload.studentId,
      divisionId: payload.divisionId,
      divisionSlug: payload.divisionSlug,
      studentNumber: payload.studentNumber,
      name: payload.name,
    };
  } catch {
    return null;
  }
}
