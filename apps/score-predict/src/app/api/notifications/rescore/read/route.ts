import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const userId = Number(session.user.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return NextResponse.json({ error: "사용자 정보를 확인할 수 없습니다." }, { status: 401 });
  }

  const body = (await request.json()) as { rescoreEventId?: number };
  const rescoreEventId = Number(body.rescoreEventId);
  if (!Number.isInteger(rescoreEventId) || rescoreEventId <= 0) {
    return NextResponse.json({ error: "유효한 rescoreEventId가 필요합니다." }, { status: 400 });
  }

  const updated = await prisma.rescoreDetail.updateMany({
    where: {
      userId,
      rescoreEventId,
      isRead: false,
    },
    data: {
      isRead: true,
    },
  });

  return NextResponse.json({
    success: true,
    updatedCount: updated.count,
  });
}
