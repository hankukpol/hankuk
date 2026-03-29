import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type RouteContext = { params: { sessionId: string } };

// GET /api/attendance/sessions/[sessionId]/qr-token
// QR 체크인 토큰 생성 (유효 시간: 2시간)
export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { sessionId } = context.params;
    if (!sessionId) {
      return NextResponse.json({ error: "세션 ID가 필요합니다." }, { status: 400 });
    }

    const session = await getPrisma().lectureSession.findUnique({
      where: { id: sessionId },
      include: {
        schedule: {
          include: {
            cohort: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!session) {
      return NextResponse.json({ error: "세션을 찾을 수 없습니다." }, { status: 404 });
    }

    if (session.isCancelled) {
      return NextResponse.json({ error: "취소된 세션입니다." }, { status: 400 });
    }

    // 토큰 생성: base64url(sessionId + exp)
    const exp = Date.now() + 2 * 60 * 60 * 1000; // 2시간
    const payload = JSON.stringify({ sessionId, exp });
    const token = Buffer.from(payload).toString("base64url");

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
    const checkInUrl = `${baseUrl}/student/check-in?token=${token}`;

    return NextResponse.json({
      data: {
        token,
        expiresAt: new Date(exp).toISOString(),
        checkInUrl,
        session: {
          id: session.id,
          sessionDate: session.sessionDate,
          startTime: session.startTime,
          endTime: session.endTime,
          subjectName: session.schedule.subjectName,
          cohortName: session.schedule.cohort.name,
          instructorName: session.schedule.instructorName ?? null,
        },
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "토큰 생성 실패" },
      { status: 500 },
    );
  }
}
