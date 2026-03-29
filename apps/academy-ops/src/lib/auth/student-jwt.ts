import { SignJWT, jwtVerify } from "jose";

export const STUDENT_SESSION_COOKIE_NAME = "student_session";

type StudentJwtPayload = {
  examNumber: string;
  sub: string;
};

function getStudentJwtSecret() {
  const secret = process.env.STUDENT_JWT_SECRET?.trim();

  if (!secret) {
    throw new Error("STUDENT_JWT_SECRET is required for student auth.");
  }

  return new TextEncoder().encode(secret);
}

export async function signStudentJwt(examNumber: string) {
  return new SignJWT({
    examNumber,
    sub: examNumber,
  } satisfies StudentJwtPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getStudentJwtSecret());
}

export async function verifyStudentJwt(token: string) {
  const { payload } = await jwtVerify(token, getStudentJwtSecret());
  const examNumber = payload.examNumber;
  const subject = payload.sub;

  if (typeof examNumber !== "string" || typeof subject !== "string") {
    throw new Error("Invalid student JWT payload.");
  }

  return {
    examNumber,
    sub: subject,
  } satisfies StudentJwtPayload;
}
