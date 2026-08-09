import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTenantSessionRoute } from "@/lib/tenant-session.server";

export async function requireAdminRoute() {
  const tenantSession = await requireTenantSessionRoute();
  if ("error" in tenantSession) return tenantSession;
  const { session, tenantType } = tenantSession;

  if (session.user.role !== "ADMIN") {
    return {
      error: NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 }),
    };
  }

  const userId = Number(session.user.id);
  if (!Number.isInteger(userId) || userId < 1) {
    return {
      error: NextResponse.json({ error: "유효하지 않은 세션입니다." }, { status: 401 }),
    };
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!dbUser || dbUser.role !== "ADMIN") {
    return {
      error: NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 }),
    };
  }

  return { session, tenantType };
}
