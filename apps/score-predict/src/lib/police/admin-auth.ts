import { getServerSession } from "next-auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { hasAdminIpAllowlist, isAdminIpAllowed } from "@/lib/police/admin-ip";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function requireAdminRoute() {
  const requestHeaders = await headers();
  if (hasAdminIpAllowlist() && !isAdminIpAllowed(requestHeaders)) {
    return {
      error: NextResponse.json(
        { error: "허용되지 않은 관리자 접근 IP입니다." },
        { status: 403 }
      ),
    };
  }

  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return {
      error: NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }),
    };
  }

  // JWT 토큰의 role 값만 신뢰하지 않고, DB에서 실제 권한을 다시 확인한다.
  // 관리자 계정 강등/해제 이후에도 기존 세션으로 접근하는 상황을 막기 위함이다.
  const userId = Number(session.user.id);
  if (!Number.isInteger(userId) || userId < 1) {
    return {
      error: NextResponse.json({ error: "유효하지 않은 세션입니다." }, { status: 401 }),
    };
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });

  if (!dbUser) {
    return {
      error: NextResponse.json({ error: "사용자 정보를 찾을 수 없습니다." }, { status: 401 }),
    };
  }

  if (dbUser.role !== "ADMIN") {
    return {
      error: NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 }),
    };
  }

  return { session };
}
