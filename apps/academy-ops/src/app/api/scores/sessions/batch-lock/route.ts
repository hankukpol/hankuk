import { AdminRole, ExamType } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { toAuditJson } from "@/lib/audit";
import { getPrisma } from "@/lib/prisma";
import { requireVisibleScoreSessionWriteAcademyId } from "@/lib/scores/session-admin";

export const dynamic = "force-dynamic";

type BatchLockBody = {
  periodId: number;
  lock: boolean;
  examType?: string;
};

export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.ACADEMIC_ADMIN);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: BatchLockBody;
  try {
    body = (await request.json()) as BatchLockBody;
  } catch {
    return NextResponse.json({ error: "요청 본문 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const { periodId, lock, examType } = body;

  if (!Number.isInteger(periodId) || periodId <= 0) {
    return NextResponse.json({ error: "올바른 기간 ID를 지정해 주세요." }, { status: 400 });
  }

  if (typeof lock !== "boolean") {
    return NextResponse.json({ error: "lock 값은 true 또는 false여야 합니다." }, { status: 400 });
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

  const prisma = getPrisma();
  const period = await prisma.examPeriod.findFirst({
    where: {
      id: periodId,
      academyId,
    },
  });

  if (!period) {
    return NextResponse.json({ error: "해당 지점의 기간을 찾을 수 없습니다." }, { status: 404 });
  }

  const parsedExamType: ExamType | null =
    examType === "GONGCHAE" ? "GONGCHAE" : examType === "GYEONGCHAE" ? "GYEONGCHAE" : null;

  const sessions = await prisma.examSession.findMany({
    where: {
      periodId,
      isCancelled: false,
      ...(parsedExamType !== null ? { examType: parsedExamType } : {}),
    },
    select: { id: true, isLocked: true },
  });

  if (sessions.length === 0) {
    return NextResponse.json({ data: { updatedCount: 0 } });
  }

  const sessionIds = sessions.map((session) => session.id);
  const now = new Date();

  const result = await prisma.examSession.updateMany({
    where: { id: { in: sessionIds } },
    data: {
      isLocked: lock,
      lockedAt: lock ? now : null,
      lockedBy: lock ? auth.context.adminUser.id : null,
    },
  });

  await prisma.auditLog.createMany({
    data: sessions.map((session) => ({
      adminId: auth.context.adminUser.id,
      action: lock ? "SESSION_LOCK" : "SESSION_UNLOCK",
      targetType: "ExamSession",
      targetId: String(session.id),
      before: toAuditJson({ isLocked: session.isLocked }),
      after: toAuditJson({ isLocked: lock }),
      ipAddress: request.headers.get("x-forwarded-for"),
    })),
  });

  return NextResponse.json({
    data: {
      updatedCount: result.count,
      periodName: period.name,
      lock,
    },
  });
}
