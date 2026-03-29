import { cookies } from "next/headers";
import { getPrisma } from "@/lib/prisma";
import {
  STUDENT_SESSION_COOKIE_NAME,
  verifyStudentJwt,
} from "@/lib/auth/student-jwt";

function readCookieValueFromHeader(cookieHeader: string, name: string) {
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

async function getStudentByExamNumber(examNumber: string) {
  const student = await getPrisma().student.findUnique({
    where: {
      examNumber,
    },
  });

  if (!student?.isActive) {
    return null;
  }

  return student;
}

export async function requireStudent() {
  const token = cookies().get(STUDENT_SESSION_COOKIE_NAME)?.value;

  if (!token) {
    throw new Error("UNAUTHORIZED");
  }

  let payload: Awaited<ReturnType<typeof verifyStudentJwt>>;

  try {
    payload = await verifyStudentJwt(token);
  } catch {
    throw new Error("INVALID_TOKEN");
  }

  const student = await getStudentByExamNumber(payload.examNumber);

  if (!student) {
    throw new Error("STUDENT_NOT_FOUND");
  }

  return student;
}

export async function requireStudentFromRequest(request: Request) {
  const token = readCookieValueFromHeader(
    request.headers.get("cookie") ?? "",
    STUDENT_SESSION_COOKIE_NAME,
  );

  if (!token) {
    throw new Error("UNAUTHORIZED");
  }

  let payload: Awaited<ReturnType<typeof verifyStudentJwt>>;

  try {
    payload = await verifyStudentJwt(token);
  } catch {
    throw new Error("INVALID_TOKEN");
  }

  const student = await getStudentByExamNumber(payload.examNumber);

  if (!student) {
    throw new Error("STUDENT_NOT_FOUND");
  }

  return student;
}
