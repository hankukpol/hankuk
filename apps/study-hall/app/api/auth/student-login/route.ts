import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { applyStudentSessionCookie, createStudentSessionToken } from "@/lib/auth";
import {
  assertRateLimit,
  clearRateLimit,
  getRequestIp,
  recordRateLimitFailure,
} from "@/lib/rate-limit";
import { findStudentSessionByCredentials } from "@/lib/services/student.service";

const studentLoginSchema = z.object({
  division: z.string().min(1).max(100),
  studentNumber: z.string().trim().min(1, "수험번호를 입력해주세요.").max(50, "수험번호는 50자 이하여야 합니다."),
  name: z.string().trim().min(1, "이름을 입력해주세요.").max(50, "이름은 50자 이하여야 합니다."),
});

function rateLimitResponse(error: unknown) {
  return NextResponse.json(
    {
      error:
        error instanceof Error ? error.message : "잠시 후 다시 시도해주세요. (10분 후 재시도 가능)",
    },
    { status: 429 },
  );
}

export async function POST(request: NextRequest) {
  const ip = getRequestIp(request.headers);

  try {
    assertRateLimit(ip, { bucket: "student-login" });
  } catch (error) {
    return rateLimitResponse(error);
  }

  const body = await request.json().catch(() => null);
  const parsed = studentLoginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "잘못된 요청입니다." },
      { status: 400 },
    );
  }

  const session = await findStudentSessionByCredentials(
    parsed.data.division,
    parsed.data.studentNumber,
    parsed.data.name,
  );

  if (!session) {
    try {
      recordRateLimitFailure(ip, { bucket: "student-login" });
    } catch (error) {
      return rateLimitResponse(error);
    }

    return NextResponse.json({ error: "학생 정보를 확인해주세요." }, { status: 401 });
  }

  const token = await createStudentSessionToken(session);
  const response = NextResponse.json({
    ok: true,
    divisionSlug: session.divisionSlug,
    studentNumber: session.studentNumber,
    name: session.name,
  });
  applyStudentSessionCookie(response, token);
  clearRateLimit(ip, "student-login");

  return response;
}
