import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { toAuditJson } from "@/lib/audit";
import { getPrisma } from "@/lib/prisma";
import { requireVisibleScoreSessionWriteAcademyId } from "@/lib/scores/session-admin";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { sessionId } = await params;
  const id = Number.parseInt(sessionId, 10);
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: "잘못된 회차 ID입니다." }, { status: 400 });
  }

  let academyId: number;
  try {
    academyId = await requireVisibleScoreSessionWriteAcademyId();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "지점 선택이 필요합니다." },
      { status: 400 },
    );
  }

  const body = (await request.json()) as { lock: boolean };
  const lock = !!body.lock;

  const prisma = getPrisma();
  const session = await prisma.examSession.findFirst({
    where: {
      id,
      period: {
        academyId,
      },
    },
  });

  if (!session) {
    return NextResponse.json({ error: "해당 지점의 회차를 찾을 수 없습니다." }, { status: 404 });
  }

  const updated = await prisma.examSession.update({
    where: { id },
    data: {
      isLocked: lock,
      lockedAt: lock ? new Date() : null,
      lockedBy: lock ? auth.context.adminUser.id : null,
    },
  });

  await prisma.auditLog.create({
    data: {
      adminId: auth.context.adminUser.id,
      action: lock ? "SESSION_LOCK" : "SESSION_UNLOCK",
      targetType: "ExamSession",
      targetId: String(id),
      before: toAuditJson({ isLocked: session.isLocked }),
      after: toAuditJson({ isLocked: lock }),
      ipAddress: request.headers.get("x-forwarded-for"),
    },
  });

  return NextResponse.json({ data: updated });
}
