import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { revalidateAdminReadCaches } from "@/lib/cache-tags";
import { updateSession, parseSessionUpdate } from "@/lib/periods/service";
import { getPrisma } from "@/lib/prisma";
import { requireVisibleScoreSessionWriteAcademyId } from "@/lib/scores/session-admin";
import { toAuditJson } from "@/lib/audit";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.ACADEMIC_ADMIN);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const sessionId = Number(params.id);

    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      throw new Error("회차 ID가 올바르지 않습니다.");
    }

    const body = (await request.json()) as Record<string, unknown>;
    const payload = parseSessionUpdate(body);

    const session = await updateSession({
      adminId: auth.context.adminUser.id,
      sessionId,
      payload,
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json({ session });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "회차 수정에 실패했습니다.",
      },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.ACADEMIC_ADMIN);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const academyId = await requireVisibleScoreSessionWriteAcademyId();
    const sessionId = Number(params.id);

    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      throw new Error("회차 ID가 올바르지 않습니다.");
    }

    const db = getPrisma();

    const session = await db.examSession.findFirst({
      where: {
        id: sessionId,
        period: {
          academyId,
        },
      },
      select: {
        id: true,
        periodId: true,
        examType: true,
        isLocked: true,
        _count: { select: { scores: true } },
      },
    });

    if (!session) {
      return NextResponse.json({ error: "존재하지 않는 회차입니다." }, { status: 404 });
    }

    if (session.isLocked) {
      return NextResponse.json(
        { error: "잠긴 회차는 삭제할 수 없습니다. 먼저 잠금을 해제해 주세요." },
        { status: 400 },
      );
    }

    if (session._count.scores > 0) {
      return NextResponse.json(
        { error: `성적이 ${session._count.scores}건 입력된 회차는 삭제할 수 없습니다.` },
        { status: 400 },
      );
    }

    await db.$transaction(async (tx) => {
      await tx.examSession.delete({ where: { id: sessionId } });

      await tx.auditLog.create({
        data: {
          adminId: auth.context.adminUser.id,
          action: "SESSION_DELETE",
          targetType: "ExamSession",
          targetId: String(sessionId),
          before: toAuditJson(null),
          after: toAuditJson(null),
          ipAddress: request.headers.get("x-forwarded-for") ?? null,
        },
      });
    });

    revalidateAdminReadCaches({ analytics: true, periods: true });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "회차 삭제에 실패했습니다.",
      },
      { status: 400 },
    );
  }
}
