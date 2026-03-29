import { NextResponse } from "next/server";
import { getClientIpAddress } from "@/lib/security";
import { signStudentJwt, STUDENT_SESSION_COOKIE_NAME } from "@/lib/auth/student-jwt";
import {
  clearStudentLookupFailures,
  getStudentLookupRateLimitStatus,
  registerStudentLookupFailure,
} from "@/lib/student-portal/rate-limit";
import { lookupStudentPortalStudent } from "@/lib/student-portal/service";

type RequestBody = {
  examNumber?: string;
  birthDate6?: string;
  // also accept 'birthDate' for backwards compatibility
  birthDate?: string;
};

const LOOKUP_FAILURE_DELAY_MS = 800;
const STUDENT_SESSION_MAX_AGE = 60 * 60 * 24 * 7;
const INVALID_CREDENTIALS_MESSAGE = "학번 또는 생년월일이 올바르지 않습니다.";

function createRateLimitResponse(retryAfterSeconds: number) {
  return NextResponse.json(
    {
      error: "조회 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
      },
    },
  );
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: Request) {
  const ipAddress = getClientIpAddress(request);
  let identifier: string | null = null;

  try {
    const body = (await request.json()) as RequestBody;
    identifier = String(body.examNumber ?? "").trim() || null;
    // accept both birthDate6 (new) and birthDate (legacy)
    const birthDate = String(body.birthDate6 ?? body.birthDate ?? "")
      .trim()
      .replace(/\D/g, "");

    const rateLimit = getStudentLookupRateLimitStatus({ ipAddress, identifier });

    if (!rateLimit.ok) {
      return createRateLimitResponse(rateLimit.retryAfterSeconds ?? 60);
    }

    if (!identifier || !birthDate) {
      return NextResponse.json(
        { error: "학번과 생년월일을 입력해주세요." },
        { status: 400 },
      );
    }

    const student = await lookupStudentPortalStudent({
      examNumber: identifier,
      birthDate,
    });

    const token = await signStudentJwt(student.examNumber);
    const response = NextResponse.json({
      data: {
        examNumber: student.examNumber,
        name: student.name,
      },
    });

    response.cookies.set({
      name: STUDENT_SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: STUDENT_SESSION_MAX_AGE,
    });

    clearStudentLookupFailures({ ipAddress, identifier });

    return response;
  } catch {
    await delay(LOOKUP_FAILURE_DELAY_MS);
    const rateLimit = registerStudentLookupFailure({ ipAddress, identifier });

    if (!rateLimit.ok) {
      return createRateLimitResponse(rateLimit.retryAfterSeconds ?? 60);
    }

    return NextResponse.json(
      { error: INVALID_CREDENTIALS_MESSAGE },
      { status: 401 },
    );
  }
}
