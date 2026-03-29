import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { applyAdminContextCookies, clearAuthCookies } from "@/lib/auth";
import { isMockMode } from "@/lib/mock-data";
import { readMockState } from "@/lib/mock-store";
import {
  assertRateLimit,
  clearRateLimit,
  getRequestIp,
  recordRateLimitFailure,
} from "@/lib/rate-limit";
import { createServerClient } from "@/lib/supabase/server";

const loginSchema = z.object({
  email: z.string().email("이메일 형식이 올바르지 않습니다."),
  password: z.string().min(1, "비밀번호를 입력해주세요."),
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
    assertRateLimit(ip, { bucket: "admin-login" });
  } catch (error) {
    return rateLimitResponse(error);
  }

  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "잘못된 요청입니다." },
      { status: 400 },
    );
  }

  if (isMockMode()) {
    const state = await readMockState();
    const matchedAdmin = state.admins.find(
      (admin) => admin.email.toLowerCase() === parsed.data.email.toLowerCase() && admin.isActive,
    );

    if (!matchedAdmin) {
      try {
        recordRateLimitFailure(ip, { bucket: "admin-login" });
      } catch (error) {
        return rateLimitResponse(error);
      }

      return NextResponse.json(
        { error: "최고관리자가 생성한 활성 계정만 로그인할 수 있습니다." },
        { status: 401 },
      );
    }

    const session = {
      id: matchedAdmin.id,
      userId: matchedAdmin.userId,
      name: matchedAdmin.name,
      role: matchedAdmin.role,
      divisionId: matchedAdmin.divisionId,
      divisionSlug: matchedAdmin.divisionSlug,
    };

    const response = NextResponse.json({ session });
    await applyAdminContextCookies(response, session);
    clearRateLimit(ip, "admin-login");
    return response;
  }

  const supabase = createServerClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error || !data.user) {
    try {
      recordRateLimitFailure(ip, { bucket: "admin-login" });
    } catch (rateLimitError) {
      return rateLimitResponse(rateLimitError);
    }

    return NextResponse.json(
      { error: "이메일 또는 비밀번호를 확인해주세요." },
      { status: 401 },
    );
  }

  const { prisma } = await import("@/lib/prisma");
  const admin = await prisma.admin.findUnique({
    where: { userId: data.user.id },
    include: {
      division: {
        select: {
          slug: true,
        },
      },
    },
  });

  if (!admin || !admin.isActive) {
    await supabase.auth.signOut();

    try {
      recordRateLimitFailure(ip, { bucket: "admin-login" });
    } catch (rateLimitError) {
      return rateLimitResponse(rateLimitError);
    }

    const response = NextResponse.json(
      { error: "운영 계정을 찾을 수 없습니다." },
      { status: 403 },
    );
    clearAuthCookies(response);
    return response;
  }

  const session = {
    id: admin.id,
    userId: admin.userId,
    name: admin.name,
    role: admin.role,
    divisionId: admin.divisionId,
    divisionSlug: admin.division?.slug ?? null,
  };

  const response = NextResponse.json({ session });
  await applyAdminContextCookies(response, session);
  clearRateLimit(ip, "admin-login");
  return response;
}
