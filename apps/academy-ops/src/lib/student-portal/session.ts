import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const STUDENT_PORTAL_COOKIE = "student_portal_session";
const SESSION_MAX_AGE = 60 * 60 * 12;

type SessionPayload = {
  examNumber: string;
  name: string;
  issuedAt: number;
};

function getSessionSecret() {
  const secret = process.env.STUDENT_PORTAL_SECRET?.trim();

  if (!secret) {
    throw new Error("STUDENT_PORTAL_SECRET is required for student portal sessions.");
  }

  return secret;
}

function sign(encoded: string) {
  return createHmac("sha256", getSessionSecret()).update(encoded).digest("base64url");
}

function encode(payload: SessionPayload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

function decode(value: string) {
  const [encoded, signature] = value.split(".");

  if (!encoded || !signature) {
    return null;
  }

  const expected = sign(encoded);
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (providedBuffer.length !== expectedBuffer.length) {
    return null;
  }

  if (!timingSafeEqual(providedBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionPayload;

    if (!payload.examNumber || !payload.name || !payload.issuedAt) {
      return null;
    }

    const expiresAt = payload.issuedAt + SESSION_MAX_AGE * 1000;

    if (Date.now() > expiresAt) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function createStudentPortalSession(input: {
  examNumber: string;
  name: string;
}) {
  return encode({
    examNumber: input.examNumber,
    name: input.name,
    issuedAt: Date.now(),
  });
}

export function readStudentPortalSession() {
  const cookieStore = cookies();
  const value = cookieStore.get(STUDENT_PORTAL_COOKIE)?.value;

  return value ? decode(value) : null;
}

export function writeStudentPortalSession(input: {
  examNumber: string;
  name: string;
}) {
  cookies().set({
    name: STUDENT_PORTAL_COOKIE,
    value: createStudentPortalSession(input),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export function clearStudentPortalSession() {
  cookies().set({
    name: STUDENT_PORTAL_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
