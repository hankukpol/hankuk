import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import {
  parseSuperAdminUserUpdateInput,
  updateSuperAdminUser,
} from "@/lib/super-admin";

export async function PATCH(
  request: NextRequest,
  context: { params: { id: string } },
) {
  const auth = await requireApiAdmin(AdminRole.SUPER_ADMIN);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const input = parseSuperAdminUserUpdateInput(body);
    const user = await updateSuperAdminUser(
      context.params.id,
      input,
      auth.context.adminUser.id,
      {
        adminId: auth.context.adminUser.id,
        ipAddress: request.headers.get("x-forwarded-for"),
      },
    );
    return NextResponse.json({ data: user });
  } catch (error) {
    const message = error instanceof Error ? error.message : "관리자 수정 중 오류가 발생했습니다.";
    const status = message.includes("찾을 수 없습니다") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
