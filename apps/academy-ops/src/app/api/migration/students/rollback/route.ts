import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { rollbackStudentMigration } from "@/lib/migration/students";

export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.SUPER_ADMIN);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as {
      auditLogId?: number;
    };

    if (!body.auditLogId) {
      return NextResponse.json({ error: "auditLogId가 필요합니다." }, { status: 400 });
    }

    const result = await rollbackStudentMigration({
      auditLogId: body.auditLogId,
      adminId: auth.context.adminUser.id,
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "롤백에 실패했습니다.",
      },
      { status: 400 },
    );
  }
}
