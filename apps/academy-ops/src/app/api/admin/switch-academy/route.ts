import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import {
  ACTIVE_ACADEMY_COOKIE_NAME,
  ALL_ACADEMIES_COOKIE_VALUE,
  getAcademyById,
} from "@/lib/academy";
import { requireApiAdmin } from "@/lib/api-auth";

export async function POST(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.SUPER_ADMIN);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await request.json().catch(() => ({}))) as { academyId?: unknown };
  const academyIdValue = body.academyId;

  if (academyIdValue === null) {
    const response = NextResponse.json({ data: { academyId: null, academy: null } });
    response.cookies.set(ACTIVE_ACADEMY_COOKIE_NAME, ALL_ACADEMIES_COOKIE_VALUE, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
    return response;
  }

  const academyId = Number(academyIdValue);
  if (!Number.isInteger(academyId) || academyId <= 0) {
    return NextResponse.json({ error: "유효한 지점을 선택해 주세요." }, { status: 400 });
  }

  const academy = await getAcademyById(academyId);
  if (!academy || !academy.isActive) {
    return NextResponse.json({ error: "선택한 지점을 찾을 수 없습니다." }, { status: 404 });
  }

  const response = NextResponse.json({ data: { academyId: academy.id, academy } });
  response.cookies.set(ACTIVE_ACADEMY_COOKIE_NAME, String(academy.id), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  return response;
}
