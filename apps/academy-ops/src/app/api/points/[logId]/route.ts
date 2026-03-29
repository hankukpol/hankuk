import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { toAuditJson } from "@/lib/audit";
import { getPrisma } from "@/lib/prisma";
import { revalidateAdminReadCaches } from "@/lib/cache-tags";

type RouteContext = {
  params: {
    logId: string;
  };
};

export async function DELETE(request: Request, { params }: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const logId = Number(params.logId);

  if (!Number.isInteger(logId)) {
    return NextResponse.json({ error: "포인트 로그 ID가 올바르지 않습니다." }, { status: 400 });
  }

  try {
    const log = await getPrisma().$transaction(async (tx) => {
      const before = await tx.pointLog.findUniqueOrThrow({
        where: { id: logId },
      });

      await tx.pointLog.delete({
        where: { id: logId },
      });

      await tx.auditLog.create({
        data: {
          adminId: auth.context.adminUser.id,
          action: "POINT_CANCEL",
          targetType: "PointLog",
          targetId: String(logId),
          before: toAuditJson(before),
          after: toAuditJson(null),
          ipAddress: request.headers.get("x-forwarded-for"),
        },
      });

      return before;
    });

    revalidateAdminReadCaches({ analytics: true, periods: false });
    return NextResponse.json({ ok: true, cancelled: log });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "포인트 취소에 실패했습니다." },
      { status: 400 },
    );
  }
}
