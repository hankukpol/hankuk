import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";
import { ROLE_LEVEL } from "@/lib/constants";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { name, phone, role, isActive } = body;

    const existing = await getPrisma().adminUser.findUnique({ where: { id: params.id } });
    if (!existing) {
      return NextResponse.json({ error: "계정을 찾을 수 없습니다." }, { status: 404 });
    }

    // Cannot change own role or deactivate own account
    if (params.id === auth.context.adminUser.id && (role !== undefined || isActive === false)) {
      return NextResponse.json({ error: "본인 계정의 권한/활성화 상태는 변경할 수 없습니다." }, { status: 400 });
    }

    // Cannot grant higher role than own role
    if (role !== undefined) {
      const myLevel = ROLE_LEVEL[auth.context.adminUser.role];
      const targetLevel = ROLE_LEVEL[role as AdminRole];
      if (targetLevel >= myLevel) {
        return NextResponse.json({ error: "본인보다 높거나 같은 권한을 부여할 수 없습니다." }, { status: 403 });
      }
    }

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name.trim();
    if (phone !== undefined) data.phone = phone?.trim() || null;
    if (role !== undefined) data.role = role as AdminRole;
    if (isActive !== undefined) data.isActive = isActive;

    const adminUser = await getPrisma().adminUser.update({
      where: { id: params.id },
      data,
      select: { id: true, name: true, email: true, role: true, phone: true, isActive: true, createdAt: true },
    });

    return NextResponse.json({ adminUser });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "수정 실패" },
      { status: 400 },
    );
  }
}
