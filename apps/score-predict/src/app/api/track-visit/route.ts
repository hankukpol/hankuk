import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id ? Number(session.user.id) : null;
  const isValidUserId = userId !== null && Number.isInteger(userId) && userId > 0;

  // 요청 body에서 anonymousId 파싱
  let anonymousId: string | null = null;
  try {
    const body = (await request.json()) as { anonymousId?: unknown };
    if (typeof body.anonymousId === "string" && UUID_REGEX.test(body.anonymousId)) {
      anonymousId = body.anonymousId;
    }
  } catch {
    // body 파싱 실패 무시
  }

  // 로그인 사용자도 익명도 아니면 무시
  if (!isValidUserId && !anonymousId) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  try {
    const now = new Date();
    const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

    if (isValidUserId) {
      // 로그인 사용자: userId 기준 기록
      await prisma.visitorLog.upsert({
        where: { date_userId: { date: today, userId: userId! } },
        create: { date: today, userId: userId! },
        update: {},
      });
    } else {
      // 비회원: anonymousId(UUID) 기준 기록
      await prisma.visitorLog.upsert({
        where: { date_anonymousId: { date: today, anonymousId: anonymousId! } },
        create: { date: today, anonymousId: anonymousId! },
        update: {},
      });
    }

    return NextResponse.json({ ok: true });
  } catch {
    // 에러가 나도 사용자 경험에 영향 없도록 조용히 처리
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
