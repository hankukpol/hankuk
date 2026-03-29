import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { parseAcademyUpdateInput, updateAcademy } from "@/lib/super-admin";

export async function PATCH(
  request: NextRequest,
  context: { params: { id: string } },
) {
  const auth = await requireApiAdmin(AdminRole.SUPER_ADMIN);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const academyId = Number(context.params.id);
  if (!Number.isInteger(academyId) || academyId <= 0) {
    return NextResponse.json({ error: "지점 ID가 올바르지 않습니다." }, { status: 400 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const input = parseAcademyUpdateInput(body);
    const academy = await updateAcademy(academyId, input, {
      adminId: auth.context.adminUser.id,
      ipAddress: request.headers.get("x-forwarded-for"),
    });
    return NextResponse.json({ data: academy });
  } catch (error) {
    const message = error instanceof Error ? error.message : "지점 수정 중 오류가 발생했습니다.";
    const status = message.includes("찾을 수 없습니다") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
